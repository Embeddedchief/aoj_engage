"use server";

import { after } from "next/server";
import { prisma } from "@/lib/db";
import { assertPermission, clientIp } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { run, str, type ActionResult } from "@/lib/action";
import { canWorkWithAudience } from "@/lib/permissions";
import { contactWhere } from "@/lib/segments";
import { getSettings } from "@/lib/settings";
import { drainCampaign, renderForContact } from "@/lib/engine";
import { sendEmail } from "@/lib/email/provider";
import { fromLocalInput } from "@/lib/time";
import { isSafeUrl, isValidEmail, normEmail } from "@/lib/utils";
import { BROADCAST_GROUPS, BROADCAST_KINDS, buildBroadcastBlocks, type BroadcastGroup, type BroadcastInput, type BroadcastKind } from "@/lib/broadcast";

const TEMPLATE_KEY = "quick-broadcast";

function readInput(fd: FormData): BroadcastInput & { group: BroadcastGroup } {
  const kind = str(fd, "kind") as BroadcastKind;
  const group = str(fd, "group") as BroadcastGroup;
  if (!(kind in BROADCAST_KINDS)) throw new Error("Choose what kind of message this is.");
  if (!(group in BROADCAST_GROUPS)) throw new Error("Choose who should receive it.");
  const input = {
    kind, group,
    subject: str(fd, "subject").slice(0, 150),
    headline: str(fd, "headline").slice(0, 120),
    message: str(fd, "message").slice(0, 8000),
    buttonLabel: str(fd, "buttonLabel").slice(0, 60),
    buttonUrl: str(fd, "buttonUrl").slice(0, 500),
    signOff: str(fd, "signOff").slice(0, 300),
  };
  if (!input.subject) throw new Error("Enter a subject line.");
  if (input.message.length < 5) throw new Error("Write the message.");
  if (input.buttonUrl && !isSafeUrl(input.buttonUrl)) throw new Error("The button link must start with https://");
  if (input.buttonUrl && !input.buttonLabel) throw new Error("Give the button a label, or remove the link.");
  return input;
}

function recipientsWhere(group: BroadcastGroup) {
  const g = BROADCAST_GROUPS[group];
  return contactWhere({ audience: g.audience, categories: g.categories });
}

/** Live count shown in the composer as the receiver group changes. */
export async function countBroadcastRecipients(group: string): Promise<{ count: number; allowed: boolean }> {
  const u = await assertPermission("campaigns:write");
  if (!(group in BROADCAST_GROUPS)) return { count: 0, allowed: false };
  const g = BROADCAST_GROUPS[group as BroadcastGroup];
  if (!canWorkWithAudience(u.role, g.audience)) return { count: 0, allowed: false };
  return { count: await prisma.contact.count({ where: recipientsWhere(group as BroadcastGroup) }), allowed: true };
}

/** Each broadcast becomes a new version of one system template, so its exact content is archived. */
async function saveVersion(input: BroadcastInput, userName: string) {
  const t = await prisma.template.upsert({
    where: { key: TEMPLATE_KEY },
    create: { key: TEMPLATE_KEY, name: "Quick broadcasts", category: "Broadcast", audience: "BOTH", department: "Communications", currentVersion: 0, createdBy: "System", updatedBy: userName },
    update: {},
  });
  // Retry on the rare race where two broadcasts are saved at the same moment.
  for (let attempt = 0; attempt < 3; attempt++) {
    const latest = await prisma.templateVersion.findFirst({ where: { templateId: t.id }, orderBy: { version: "desc" }, select: { version: true } });
    const version = (latest?.version ?? 0) + 1;
    try {
      const v = await prisma.templateVersion.create({
        data: { templateId: t.id, version, subject: input.subject, preheader: input.headline || input.subject, blocks: buildBroadcastBlocks(input) as object[], note: `${BROADCAST_KINDS[input.kind].label} by ${userName}`, createdBy: userName },
      });
      await prisma.template.update({ where: { id: t.id }, data: { currentVersion: version, updatedBy: userName } });
      return v;
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002" || attempt === 2) throw e;
    }
  }
  throw new Error("Could not save the broadcast. Try again.");
}

export async function sendBroadcast(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("campaigns:write");
    const s = await getSettings();
    const input = readInput(fd);
    const g = BROADCAST_GROUPS[input.group];
    const k = BROADCAST_KINDS[input.kind];
    if (!canWorkWithAudience(u.role, g.audience)) throw new Error("Your role cannot send to this group.");
    const when = str(fd, "when") === "later" ? fromLocalInput(str(fd, "scheduledAt")) : new Date();
    if (Number.isNaN(when.getTime())) throw new Error("Choose a valid date and time.");

    const people = await prisma.contact.findMany({ where: recipientsWhere(input.group), select: { id: true, email: true } });
    if (people.length === 0) throw new Error(`There are no active contacts in "${g.label}" yet. Add them under Contacts first.`);
    if (people.length > s.limits.perCampaignMax) throw new Error(`${people.length} recipients exceeds the per-campaign limit of ${s.limits.perCampaignMax}.`);

    // The ICT Administrator can send directly; everyone else goes through approval.
    const requiresApproval = u.role !== "SUPER_ADMIN";
    const version = await saveVersion(input, u.name);
    const isMarketing = k.marketing && g.audience !== "INTERNAL";
    const c = await prisma.campaign.create({
      data: {
        name: `${k.label}: ${input.subject}`.slice(0, 160), type: k.type, audience: g.audience, templateVersionId: version.id,
        senderIdentity: g.audience === "INTERNAL" ? "communications" : "customers", isMarketing, scheduledAt: when, requiresApproval, createdBy: u.name,
        status: requiresApproval ? "AWAITING_APPROVAL" : "SCHEDULED", approvedRevision: requiresApproval ? null : 1,
        recipients: { createMany: { data: people.map((p) => ({ contactId: p.id, email: p.email })), skipDuplicates: true } },
        ...(requiresApproval ? { approvals: { create: { revision: 1, decision: "SUBMITTED", userId: u.id, comment: "Quick broadcast" } } } : {}),
      },
    });
    await audit(u.id, "broadcast.created", "Campaign", c.id, `${k.label} → ${g.label} (${people.length}): ${input.subject}`, await clientIp());

    if (requiresApproval) {
      await notify({ key: `approval:${c.id}:1`, roles: ["APPROVER", "SUPER_ADMIN"], level: "warning", title: "Broadcast awaiting approval", body: `${input.subject} → ${g.label} (${people.length}), from ${u.name}.`, link: `/campaigns/${c.id}` });
      return { ok: true, redirectTo: `/campaigns/${c.id}?sent=approval` };
    }
    if (when <= new Date()) after(() => drainCampaign(c.id).then(() => undefined).catch((e) => console.error("broadcast dispatch failed", e)));
    return { ok: true, redirectTo: `/campaigns/${c.id}?sent=${when <= new Date() ? "now" : "scheduled"}` };
  });
}

/** Sends one [TEST] copy to the address given, personalised with the sender's own name. */
export async function testBroadcast(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("campaigns:write");
    const s = await getSettings();
    const input = readInput(fd);
    const to = normEmail(str(fd, "testTo") || u.email);
    if (!isValidEmail(to)) throw new Error("Enter a valid test email address.");
    const g = BROADCAST_GROUPS[input.group];
    const [first, ...rest] = u.name.split(/\s+/);
    const sample = { id: "sample", firstName: first, lastName: rest.join(" "), preferredName: null, organisation: null, department: u.department, jobTitle: u.position, category: g.audience === "INTERNAL" ? "STAFF" : "CUSTOMER" } as const;
    const msg = await renderForContact({ settings: s, subject: input.subject, preheader: input.headline, blocks: buildBroadcastBlocks(input), contact: sample, senderId: g.audience === "INTERNAL" ? "communications" : "customers", external: false, isTest: true });
    const res = await sendEmail({ to, from: `${msg.sender.name} <${msg.sender.email}>`, subject: msg.subject, html: msg.html, text: msg.text });
    await audit(u.id, "test.sent", "Broadcast", undefined, `Test "${input.subject}" → ${to}: ${res.ok ? (res.simulated ? "simulated" : "accepted") : res.error}`);
    if (!res.ok) return { ok: false, error: `Test failed: ${res.error}` };
    return { ok: true, message: res.simulated ? `Test recorded, but no email provider is connected yet, so nothing was sent to ${to}.` : `Test email sent to ${to}. Check your inbox (and spam folder).` };
  });
}
