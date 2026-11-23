/**
 * AOJ Engage automation & delivery engine.
 *
 * Channel-independent stages (plan → dispatch) run from /api/cron/tick and from the
 * "Run engine now" control. Every stage is idempotent:
 *   • Campaign (automationId, occurrenceKey) and AutomationRun (automationId, occurrenceKey) are unique,
 *     so an occurrence can only ever be planned once, whatever the number of retries or restarts.
 *   • CampaignRecipient (campaignId, contactId) is unique, so a contact appears once per campaign.
 *   • Recipients are claimed with a conditional QUEUED → SENDING update before sending, so two
 *     concurrent workers can never send the same message. A message stuck in SENDING (worker died
 *     mid-send) is marked FAILED for human review rather than re-sent, because we cannot know
 *     whether the provider accepted it.
 */
import { Prisma, type Automation, type CalendarEvent, type Campaign, type Contact, type EventDate, type Template } from "@prisma/client";
import { prisma } from "./db";
import { audit, notify } from "./audit";
import { eventDatesInRange } from "./calendar";
import { audienceCategories, contactWhere, type SegmentRules } from "./segments";
import { getSettings, senderFor, type AppSettings } from "./settings";
import { addDays, birthdayInYear, daysBetween, daysInMonth, fmtLocal, lagosInstant, parseLocal, todayLocal, weekdayOf, type LocalDate } from "./time";
import { contactFlags, contactVars, renderEmail } from "./email/render";
import type { EmailBlock } from "./blocks";
import { providerMode, sendEmail } from "./email/provider";
import { signToken } from "./session";
import { isValidEmail } from "./utils";

type AutomationFull = Automation & { template: Template; event: (CalendarEvent & { dates: EventDate[] }) | null };

type PlannedOccurrence = { key: LocalDate; date: LocalDate; eventName: string; confirmed: boolean };

const CAMPAIGN_TYPE: Record<Automation["trigger"], Campaign["type"]> = {
  WEEKLY: "RELATIONSHIP",
  MONTHLY: "RECURRING",
  CALENDAR_EVENT: "EVENT",
  BIRTHDAY: "BIRTHDAY",
  WORK_ANNIVERSARY: "ANNIVERSARY",
  RELATIONSHIP_ANNIVERSARY: "ANNIVERSARY",
};

/** Occurrences of an automation's trigger in [from, to]. */
export function automationOccurrences(a: AutomationFull, from: LocalDate, to: LocalDate): PlannedOccurrence[] {
  const out: PlannedOccurrence[] = [];
  if (a.trigger === "CALENDAR_EVENT") {
    if (!a.event || !a.event.active) return out;
    for (const { date, confirmed } of eventDatesInRange(a.event, from, to)) out.push({ key: date, date, eventName: a.event.name, confirmed: confirmed || a.event.rule === "FIXED" });
    return out;
  }
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const { year, month, day } = parseLocal(d);
    if (a.trigger === "WEEKLY" && weekdayOf(d) !== (a.weekday ?? 1)) continue;
    if (a.trigger === "MONTHLY" && day !== Math.min(a.dayOfMonth ?? 1, daysInMonth(year, month))) continue;
    const name = a.trigger === "WEEKLY" ? "New Week" : a.trigger === "MONTHLY" ? "New Month" : a.trigger === "BIRTHDAY" ? "Birthday" : "Anniversary";
    out.push({ key: d, date: d, eventName: name, confirmed: true });
  }
  return out;
}

/** Contacts an automation targets for one occurrence date. */
export async function automationRecipients(a: Automation, date: LocalDate): Promise<{ contact: Contact; years?: number }[]> {
  const seg = a.segmentId ? await prisma.segment.findUnique({ where: { id: a.segmentId } }) : null;
  const base = contactWhere({ audience: a.audience, categories: a.categories, rules: (seg?.rules as SegmentRules) ?? null, includeInactive: !a.requireActive });
  const { year, month, day } = parseLocal(date);

  if (a.trigger === "BIRTHDAY") {
    // 28 Feb in a non-leap year also covers people born on 29 Feb.
    const leapCover = month === 2 && day === 28 && birthdayInYear(year, 2, 29) === date;
    const contacts = await prisma.contact.findMany({
      where: { AND: [base, { birthdayCommsAllowed: true }, leapCover ? { birthMonth: 2, birthDay: { in: [28, 29] } } : { birthMonth: month, birthDay: day }] },
    });
    return contacts.map((contact) => ({ contact }));
  }
  if (a.trigger === "WORK_ANNIVERSARY" || a.trigger === "RELATIONSHIP_ANNIVERSARY") {
    const contacts = await prisma.contact.findMany({ where: base, include: { staffProfile: true, customerProfile: true } });
    const out: { contact: Contact; years: number }[] = [];
    for (const c of contacts) {
      const start = a.trigger === "WORK_ANNIVERSARY" ? c.staffProfile?.dateJoined : c.customerProfile?.firstEngagement;
      if (!start) continue;
      const years = year - start.getUTCFullYear();
      if (years >= 1 && birthdayInYear(year, start.getUTCMonth() + 1, start.getUTCDate()) === date) out.push({ contact: c, years });
    }
    return out;
  }
  const contacts = await prisma.contact.findMany({ where: base });
  return contacts.map((contact) => ({ contact }));
}

function isUnique(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/** Stage 1 — prepare campaigns for upcoming occurrences of every active automation. */
export async function planAutomations(now = new Date(), settings?: AppSettings) {
  const s = settings ?? (await getSettings());
  const today = todayLocal(now);
  const automations = await prisma.automation.findMany({ where: { status: "ACTIVE" }, include: { template: true, event: { include: { dates: true } } } });
  const log: string[] = [];

  for (const a of automations) {
    for (const occ of automationOccurrences(a, today, addDays(today, Math.max(0, a.leadDays)))) {
      const sendAt = lagosInstant(occ.date, a.sendTime || s.defaultSendTime);
      if (sendAt.getTime() < now.getTime() - 6 * 3600_000) continue; // too late to be meaningful
      const exists = await prisma.automationRun.findUnique({ where: { automationId_occurrenceKey: { automationId: a.id, occurrenceKey: occ.key } } });
      if (exists) continue;

      // Condition: movable / religious dates must be officially confirmed before automatic sending.
      if (!occ.confirmed) {
        await notify({ key: `unconfirmed:${a.id}:${occ.key}`, roles: ["SUPER_ADMIN", "COMMS_OFFICER"], level: "warning", title: `${occ.eventName} date not yet confirmed`, body: `The provisional date ${fmtLocal(occ.date)} must be confirmed in the calendar before "${a.name}" can be prepared.`, link: a.eventId ? `/calendar/${a.eventId}` : "/calendar" });
        continue;
      }
      // Condition: template must be active.
      if (!a.template.active) {
        await notify({ key: `tplinactive:${a.id}:${occ.key}`, roles: ["SUPER_ADMIN", "COMMS_OFFICER"], level: "error", title: `Automation blocked: template inactive`, body: `"${a.name}" could not prepare ${fmtLocal(occ.date)} because "${a.template.name}" is inactive.`, link: `/automations/${a.id}` });
        continue;
      }

      const people = await automationRecipients(a, occ.date);
      if (people.length === 0) {
        if (a.trigger === "WEEKLY" || a.trigger === "MONTHLY" || a.trigger === "CALENDAR_EVENT") {
          await prisma.automationRun.create({ data: { automationId: a.id, occurrenceKey: occ.key, status: "SKIPPED", message: "No eligible recipients" } }).catch((e) => { if (!isUnique(e)) throw e; });
        }
        continue; // birthdays/anniversaries: nobody today is not an execution
      }

      const version = await prisma.templateVersion.findUnique({ where: { templateId_version: { templateId: a.templateId, version: a.template.currentVersion } } });
      if (!version) continue;
      const name = `${a.name} — ${fmtLocal(occ.date)}`;
      const status = a.requiresApproval ? "AWAITING_APPROVAL" : "SCHEDULED";

      try {
        const campaign = await prisma.$transaction(async (tx) => {
          const c = await tx.campaign.create({
            data: {
              name, type: CAMPAIGN_TYPE[a.trigger], audience: a.audience, status, templateVersionId: version.id, segmentId: a.segmentId,
              senderIdentity: a.senderIdentity, isMarketing: a.isMarketing, scheduledAt: sendAt, eventName: occ.eventName, eventDate: occ.date,
              requiresApproval: a.requiresApproval, approvedRevision: a.requiresApproval ? null : 1, createdBy: "automation",
              automationId: a.id, occurrenceKey: occ.key,
            },
          });
          await tx.campaignRecipient.createMany({
            data: people.map((p) => ({ campaignId: c.id, contactId: p.contact.id, email: p.contact.email, reason: p.years ? `years:${p.years}` : null })),
            skipDuplicates: true,
          });
          await tx.automationRun.create({ data: { automationId: a.id, occurrenceKey: occ.key, status: "CREATED", campaignId: c.id, recipients: people.length, message: a.requiresApproval ? "Awaiting approval" : "Scheduled (pre-approved by policy)" } });
          return c;
        });
        log.push(`Planned "${name}" for ${people.length} recipient(s)`);
        await audit(null, "automation.planned", "Campaign", campaign.id, `${a.name} → ${people.length} recipients for ${occ.date}`);
        if (a.requiresApproval) {
          await notify({ key: `approval:${campaign.id}:1`, roles: ["APPROVER", "SUPER_ADMIN"], level: "warning", title: "Campaign awaiting approval", body: `${name} (${people.length} recipients) is scheduled for ${fmtLocal(occ.date)}.`, link: `/campaigns/${campaign.id}` });
        }
      } catch (e) {
        if (isUnique(e)) continue; // another worker planned it first — that's the point
        await prisma.automationRun.create({ data: { automationId: a.id, occurrenceKey: occ.key, status: "FAILED", message: String(e).slice(0, 500) } }).catch(() => {});
        await notify({ key: `autofail:${a.id}:${occ.key}`, level: "error", title: "Automation execution failed", body: `${a.name}: ${String(e).slice(0, 200)}`, link: `/automations/${a.id}` });
      }
    }
  }
  return log;
}

/** Shared rendering for real sends, tests and previews. */
export async function renderForContact(opts: {
  settings: AppSettings;
  subject: string;
  preheader?: string | null;
  blocks: EmailBlock[];
  contact: Pick<Contact, "id" | "firstName" | "lastName" | "preferredName" | "organisation" | "department" | "jobTitle" | "category">;
  senderId: string;
  eventName?: string | null;
  eventDate?: string | null;
  yearsOfService?: number | null;
  projectName?: string | null;
  external: boolean;
  isTest?: boolean;
}) {
  const sender = senderFor(opts.settings, opts.senderId);
  const vars = contactVars(opts.contact, {
    brand: opts.settings.brand, senderName: sender.name, eventName: opts.eventName,
    eventDate: opts.eventDate ? fmtLocal(opts.eventDate) : "", yearsOfService: opts.yearsOfService, projectName: opts.projectName,
  });
  const flags = contactFlags(opts.contact.category, opts.yearsOfService);
  const appUrl = process.env.APP_URL?.replace(/\/$/, "") ?? "";
  const token = opts.external && appUrl ? await signToken("unsubscribe", opts.contact.id) : null;
  const unsubscribeUrl = token ? `${appUrl}/u/${token}` : null; // human-facing page in the footer
  const oneClickUrl = token ? `${appUrl}/api/unsubscribe?t=${token}` : null; // RFC 8058 List-Unsubscribe-Post target
  const r = renderEmail({ subject: opts.subject, preheader: opts.preheader, blocks: opts.blocks, vars, flags, brand: opts.settings.brand, unsubscribeUrl, isTest: opts.isTest });
  return { ...r, unsubscribeUrl, oneClickUrl, sender, vars, flags };
}

const RETRY_LIMIT = 4;

/** Stage 2 — deliver due campaigns in bounded batches. */
export async function dispatchDue(now = new Date(), settings?: AppSettings) {
  const s = settings ?? (await getSettings());
  const log: string[] = [];
  if (s.sending.suspended) {
    log.push("Sending is suspended (emergency stop) — nothing dispatched.");
    return log;
  }

  // Recover messages interrupted mid-send: never resend blindly.
  const stale = await prisma.campaignRecipient.updateMany({
    where: { status: "SENDING", updatedAt: { lt: new Date(now.getTime() - 15 * 60_000) } },
    data: { status: "FAILED", reason: "Interrupted during sending — verify with provider before resending" },
  });
  if (stale.count) log.push(`${stale.count} interrupted message(s) marked for review`);

  const startOfDay = lagosInstant(todayLocal(now), "00:00");
  let sentToday = await prisma.campaignRecipient.count({ where: { sentAt: { gte: startOfDay } } });
  let budget = Math.min(s.limits.batchSize, Math.max(0, s.limits.dailyMax - sentToday));
  if (budget === 0) {
    await notify({ key: `quota:${todayLocal(now)}`, level: "warning", title: "Daily sending limit reached", body: `${sentToday} messages sent today (limit ${s.limits.dailyMax}). Remaining messages will continue tomorrow.` });
    return log;
  }

  const due = await prisma.campaign.findMany({
    where: { status: { in: ["SCHEDULED", "PROCESSING"] }, scheduledAt: { lte: now } },
    include: { templateVersion: true },
    orderBy: { scheduledAt: "asc" },
  });

  for (const c of due) {
    // Approval guard: the exact current revision must be approved.
    if (c.requiresApproval && c.approvedRevision !== c.revision) {
      await prisma.campaign.update({ where: { id: c.id }, data: { status: "AWAITING_APPROVAL" } });
      log.push(`"${c.name}" held: approval does not match current revision`);
      continue;
    }
    if (c.status === "SCHEDULED") {
      const n = await prisma.campaignRecipient.count({ where: { campaignId: c.id } });
      if (n > s.limits.perCampaignMax) {
        await prisma.campaign.update({ where: { id: c.id }, data: { status: "PAUSED" } });
        await notify({ key: `cap:${c.id}`, level: "error", title: "Campaign paused: recipient limit exceeded", body: `${c.name} has ${n} recipients (limit ${s.limits.perCampaignMax}).`, link: `/campaigns/${c.id}` });
        continue;
      }
      await prisma.campaign.update({ where: { id: c.id }, data: { status: "PROCESSING" } });
    }
    if (budget <= 0) break;

    const batch = await prisma.campaignRecipient.findMany({
      where: { campaignId: c.id, status: "QUEUED", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
      include: { contact: { include: { projects: { orderBy: { updatedAt: "desc" }, take: 1 } } } },
      take: budget,
    });
    const blocks = c.templateVersion.blocks as unknown as EmailBlock[];
    const sender = senderFor(s, c.senderIdentity);
    const external = c.audience !== "INTERNAL";

    for (const r of batch) {
      const claim = await prisma.campaignRecipient.updateMany({ where: { id: r.id, status: "QUEUED" }, data: { status: "SENDING", attempts: { increment: 1 } } });
      if (claim.count !== 1) continue; // another worker owns it

      const skip = await suppressionReason(r.contact, c, s, now);
      if (skip) {
        await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "SUPPRESSED", reason: skip, events: { create: { type: "SUPPRESSED", detail: skip } } } });
        continue;
      }

      const years = r.reason?.startsWith("years:") ? Number(r.reason.slice(6)) : null;
      const isExternalContact = !["STAFF", "MANAGEMENT", "CONTRACTOR"].includes(r.contact.category);
      const msg = await renderForContact({
        settings: s, subject: c.templateVersion.subject, preheader: c.templateVersion.preheader, blocks, contact: r.contact, senderId: c.senderIdentity,
        eventName: c.eventName, eventDate: c.eventDate, yearsOfService: years, projectName: r.contact.projects[0]?.name, external: external && isExternalContact && c.isMarketing,
      });
      const res = await sendEmail({ to: r.email, from: `${sender.name} <${sender.email}>`, replyTo: sender.email, subject: msg.subject, html: msg.html, text: msg.text, listUnsubscribe: msg.oneClickUrl ?? undefined, tags: { campaign: c.id } });
      budget--;
      sentToday++;

      if (res.ok) {
        await prisma.campaignRecipient.update({
          where: { id: r.id },
          data: { status: "ACCEPTED", sentAt: new Date(), providerMessageId: res.messageId, lastEventAt: new Date(), reason: years ? r.reason : null, events: { create: { type: "ACCEPTED", detail: res.simulated ? "Simulation mode" : "Accepted by Amazon SES" } } },
        });
      } else if (!res.permanent && r.attempts + 1 < RETRY_LIMIT) {
        const delayMin = 5 * 2 ** r.attempts; // 5, 10, 20 minutes
        await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "QUEUED", nextAttemptAt: new Date(now.getTime() + delayMin * 60_000), reason: res.error, events: { create: { type: "RETRY", detail: `${res.error} — retry in ${delayMin} min` } } } });
      } else if (res.permanent && /bounce|does not exist|MessageRejected|invalid/i.test(res.error)) {
        await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "BOUNCED", reason: res.error, events: { create: { type: "BOUNCE", detail: res.error } } } });
        await prisma.suppression.upsert({ where: { email: r.email }, create: { email: r.email, reason: "HARD_BOUNCE", detail: res.error }, update: {} });
      } else {
        await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "FAILED", reason: res.error, events: { create: { type: "FAILED", detail: res.error } } } });
      }
    }
    log.push(`"${c.name}": processed ${batch.length}`);
    await finalizeCampaign(c.id);
  }
  return log;
}

async function suppressionReason(contact: Contact, c: Campaign, s: AppSettings, now: Date): Promise<string | null> {
  if (contact.status !== "ACTIVE") return "Contact inactive";
  if (!isValidEmail(contact.email)) return "Invalid email address";
  const sup = await prisma.suppression.findUnique({ where: { email: contact.email } });
  if (sup) return `Suppressed (${sup.reason.toLowerCase().replace("_", " ")})`;
  const externalContact = !["STAFF", "MANAGEMENT", "CONTRACTOR"].includes(contact.category);
  // Consent applies to direct marketing to external contacts (NDPA 2023); internal staff comms are not marketing.
  if (c.isMarketing && externalContact && contact.marketingConsent !== "GRANTED") return contact.marketingConsent === "WITHDRAWN" ? "Marketing consent withdrawn" : "No marketing consent on record";
  if ((c.type === "BIRTHDAY") && !contact.birthdayCommsAllowed) return "Birthday communications disabled";
  if (c.type === "RELATIONSHIP" && externalContact) {
    const recent = await prisma.campaignRecipient.count({
      where: { contactId: contact.id, campaignId: { not: c.id }, status: { in: ["ACCEPTED", "DELIVERED"] }, sentAt: { gte: new Date(now.getTime() - 7 * 86400_000) }, campaign: { type: "RELATIONSHIP" } },
    });
    if (recent >= s.limits.routinePerWeek) return `Frequency limit (${s.limits.routinePerWeek} routine email/week)`;
  }
  return null;
}

export async function finalizeCampaign(campaignId: string) {
  const counts = await prisma.campaignRecipient.groupBy({ by: ["status"], where: { campaignId }, _count: true });
  const n = Object.fromEntries(counts.map((x) => [x.status, x._count])) as Record<string, number>;
  if ((n.QUEUED ?? 0) + (n.SENDING ?? 0) > 0) return;
  const ok = (n.ACCEPTED ?? 0) + (n.DELIVERED ?? 0);
  const bad = (n.FAILED ?? 0) + (n.BOUNCED ?? 0) + (n.REJECTED ?? 0) + (n.COMPLAINED ?? 0);
  const status = ok > 0 && bad === 0 ? "SENT" : ok > 0 ? "PARTIALLY_DELIVERED" : bad > 0 ? "FAILED" : "SENT";
  const prev = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId }, select: { status: true } });
  if (!["PROCESSING", "SCHEDULED", "SENT", "PARTIALLY_DELIVERED", "FAILED"].includes(prev.status)) return; // paused/cancelled: leave as is
  // Conditional update so only one concurrent worker records completion.
  const won = await prisma.campaign.updateMany({ where: { id: campaignId, status: prev.status }, data: { status, completedAt: new Date() } });
  if (won.count === 0 || prev.status === status) return; // already finalised (or late webhook with no change)
  const c = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  await audit(null, "campaign.completed", "Campaign", c.id, `${c.name}: ${ok} accepted, ${bad} failed, ${n.SUPPRESSED ?? 0} suppressed`);
  await notify({
    key: `done:${c.id}`, roles: ["SUPER_ADMIN", "COMMS_OFFICER"], level: status === "SENT" ? "success" : "error",
    title: status === "SENT" ? "Campaign completed" : status === "FAILED" ? "Campaign delivery failed" : "Campaign partially delivered",
    body: `${c.name}: ${ok} accepted, ${bad} failed, ${n.SUPPRESSED ?? 0} suppressed.`, link: `/campaigns/${c.id}`,
  });
  const bounced = n.BOUNCED ?? 0;
  if (ok + bad >= 20 && bounced / (ok + bad) > 0.05) {
    await notify({ key: `bouncerate:${c.id}`, level: "error", title: "High bounce rate", body: `${c.name}: ${bounced} of ${ok + bad} bounced. Review your contact data before the next send.`, link: `/campaigns/${c.id}` });
  }
}

/** Stage 0 — reminders for upcoming occasions and birthdays. */
export async function sendReminders(now = new Date(), s?: AppSettings) {
  const settings = s ?? (await getSettings());
  const today = todayLocal(now);
  const horizon = Math.max(14, ...settings.reminders.defaultDays);
  const events = await prisma.calendarEvent.findMany({ where: { active: true }, include: { dates: true } });
  for (const e of events) {
    for (const { date, confirmed } of eventDatesInRange(e, today, addDays(today, horizon))) {
      const d = daysBetween(today, date);
      if (e.reminderDays.includes(d)) {
        await notify({ key: `rem:${e.id}:${date}:${d}`, roles: ["SUPER_ADMIN", "COMMS_OFFICER"], level: "info", title: `${e.name} in ${d} day${d === 1 ? "" : "s"}`, body: `${fmtLocal(date, { weekday: true })}${confirmed || e.rule === "FIXED" ? "" : " — date still provisional"}. Review the template and audience.`, link: `/calendar/${e.id}` });
      }
    }
  }
  // Birthday look-ahead (next 7 days), one summary per day per audience.
  for (const audience of ["INTERNAL", "EXTERNAL"] as const) {
    const cats = audienceCategories(audience);
    const people = await prisma.contact.findMany({ where: { status: "ACTIVE", birthdayCommsAllowed: true, birthMonth: { not: null }, category: { in: cats } }, select: { birthMonth: true, birthDay: true } });
    const year = parseLocal(today).year;
    const upcoming = people.filter((p) => {
      const days = [0, 1].map((k) => daysBetween(today, birthdayInYear(year + k, p.birthMonth!, p.birthDay!))).find((x) => x >= 1);
      return days !== undefined && days <= 7;
    }).length;
    if (upcoming > 0) {
      await notify({ key: `bdays:${audience}:${today}`, roles: audience === "INTERNAL" ? ["SUPER_ADMIN", "HR"] : ["SUPER_ADMIN", "COMMS_OFFICER"], title: `${upcoming} ${audience === "INTERNAL" ? "staff" : "customer"} birthday${upcoming > 1 ? "s" : ""} in the next 7 days`, body: "Birthday messages are prepared automatically. Review them in Campaigns.", link: "/calendar" });
    }
  }
}

/** One full engine pass. */
export async function runTick(now = new Date(), actor: string | null = null) {
  const s = await getSettings();
  const started = Date.now();
  await sendReminders(now, s);
  const planned = await planAutomations(now, s);
  const dispatched = await dispatchDue(now, s);
  const summary = { at: now.toISOString(), mode: providerMode(), planned, dispatched, ms: Date.now() - started };
  await prisma.setting.upsert({ where: { key: "engine.lastRun" }, create: { key: "engine.lastRun", value: summary }, update: { value: summary } });
  if (actor) await audit(actor, "engine.run", "Engine", undefined, `${planned.length} planned, ${dispatched.length} dispatch steps`);
  return summary;
}

/** "Send now": keep dispatching batches until the campaign has nothing left that is due,
 *  the daily limit stops progress, or the time budget (function limit) runs out. */
export async function drainCampaign(campaignId: string, budgetMs = 50_000) {
  const end = Date.now() + budgetMs;
  const due = () => prisma.campaignRecipient.count({ where: { campaignId, status: "QUEUED", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] } });
  let left = await due();
  while (left > 0 && Date.now() < end) {
    await dispatchDue();
    const now = await due();
    if (now >= left) break; // no progress (daily limit, suspension or approval) – the scheduled engine continues later
    left = now;
  }
  return left;
}
