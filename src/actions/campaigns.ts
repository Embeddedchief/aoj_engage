"use server";
import type { Role } from "@prisma/client";

import { after } from "next/server";
import type { Audience, CampaignType, ContactCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertPermission, assertUser, clientIp } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { opt, run, str, type ActionResult } from "@/lib/action";
import { canWorkWithAudience } from "@/lib/permissions";
import { contactWhere, type SegmentRules } from "@/lib/segments";
import { getSettings } from "@/lib/settings";
import { drainCampaign, renderForContact } from "@/lib/engine";
import { sendEmail } from "@/lib/email/provider";
import { fromLocalInput } from "@/lib/time";
import { isValidEmail, normEmail } from "@/lib/utils";
import type { EmailBlock } from "@/lib/blocks";

const EDITABLE = ["DRAFT", "CHANGES_REQUESTED", "AWAITING_APPROVAL", "APPROVED", "SCHEDULED", "PAUSED"];
const MARKETING_TYPES: CampaignType[] = ["RELATIONSHIP", "RECURRING", "EVENT", "BIRTHDAY"];

async function resolveRecipients(audience: Audience, segmentId: string | null, categories: ContactCategory[], contactIds: string[]) {
  const seg = segmentId ? await prisma.segment.findUnique({ where: { id: segmentId } }) : null;
  if (seg && seg.audience !== audience && audience !== "BOTH") throw new Error("The segment's audience doesn't match the campaign audience.");
  const where = contactIds.length
    ? { AND: [contactWhere({ audience, categories }), { id: { in: contactIds } }] }
    : contactWhere({ audience, categories: seg ? undefined : categories, rules: (seg?.rules as SegmentRules) ?? null });
  return prisma.contact.findMany({ where, select: { id: true, email: true } });
}

function readForm(fd: FormData) {
  const audience = str(fd, "audience") as Audience;
  if (!["INTERNAL", "EXTERNAL", "BOTH"].includes(audience)) throw new Error("Choose an audience.");
  const type = (str(fd, "type") || "ONE_TIME") as CampaignType;
  const when = str(fd, "scheduledAt");
  return {
    name: str(fd, "name"),
    type,
    audience,
    templateId: str(fd, "templateId"),
    segmentId: opt(fd, "segmentId"),
    categories: fd.getAll("categories").map(String) as ContactCategory[],
    contactIds: fd.getAll("contactIds").map(String).filter(Boolean),
    senderIdentity: str(fd, "senderIdentity") || "communications",
    scheduledAt: when ? fromLocalInput(when) : null,
    eventName: opt(fd, "eventName"),
    eventDate: opt(fd, "eventDate"),
    isMarketing: fd.has("classification") ? str(fd, "classification") === "marketing" : MARKETING_TYPES.includes(type) && audience !== "INTERNAL",
  };
}

/** Admins and communications staff may send a [TEST] copy to any address (e.g. sales or marketing reviewers). */
const canTestAnyAddress = (role: Role) => role === "SUPER_ADMIN" || role === "COMMS_OFFICER" || role === "HR";

export async function createCampaign(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("campaigns:write");
    const s = await getSettings();
    const f = readForm(fd);
    if (!f.name) throw new Error("Enter a campaign name.");
    if (!canWorkWithAudience(u.role, f.audience)) throw new Error("Your role cannot send to this audience.");
    const t = await prisma.template.findUniqueOrThrow({ where: { id: f.templateId } });
    if (!t.active) throw new Error("This template is inactive. Activate it or choose another.");
    if (t.audience !== "BOTH" && t.audience !== f.audience) throw new Error(`This template is for ${t.audience.toLowerCase()} audiences.`);
    const version = await prisma.templateVersion.findUniqueOrThrow({ where: { templateId_version: { templateId: t.id, version: t.currentVersion } } });
    const people = await resolveRecipients(f.audience, f.segmentId, f.categories, f.contactIds);
    if (people.length === 0) throw new Error("No active contacts match this selection.");
    if (people.length > s.limits.perCampaignMax) throw new Error(`${people.length} recipients exceeds the per-campaign limit of ${s.limits.perCampaignMax}.`);
    const requiresApproval =
      s.approvals.manualCampaignsRequireApproval ||
      people.length > s.limits.approvalThreshold ||
      f.type === "ANNOUNCEMENT" ||
      (f.audience !== "INTERNAL" && u.role !== "SUPER_ADMIN");

    const c = await prisma.campaign.create({
      data: {
        name: f.name, type: f.type, audience: f.audience, status: "DRAFT", templateVersionId: version.id, segmentId: f.contactIds.length ? null : f.segmentId,
        senderIdentity: f.senderIdentity, isMarketing: f.isMarketing, scheduledAt: f.scheduledAt, eventName: f.eventName, eventDate: f.eventDate,
        requiresApproval, createdBy: u.name,
        recipients: { createMany: { data: people.map((p) => ({ contactId: p.id, email: p.email })), skipDuplicates: true } },
      },
    });
    await audit(u.id, "campaign.created", "Campaign", c.id, `${c.name} (${people.length} recipients)`, await clientIp());
    return { ok: true, redirectTo: `/campaigns/${c.id}` };
  });
}

/** Any edit to content, recipients, template version or schedule creates a new revision and voids prior approval. */
export async function updateCampaign(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("campaigns:write");
    const c = await prisma.campaign.findUniqueOrThrow({ where: { id: str(fd, "id") }, include: { templateVersion: true } });
    if (!EDITABLE.includes(c.status)) throw new Error(`A ${c.status.toLowerCase()} campaign cannot be edited.`);
    if (!canWorkWithAudience(u.role, c.audience)) throw new Error("Not permitted.");
    const f = readForm(fd);
    const t = await prisma.template.findUniqueOrThrow({ where: { id: f.templateId || c.templateVersion.templateId } });
    const useLatest = fd.get("useLatestVersion") === "on" || t.id !== c.templateVersion.templateId;
    const version = useLatest ? await prisma.templateVersion.findUniqueOrThrow({ where: { templateId_version: { templateId: t.id, version: t.currentVersion } } }) : c.templateVersion;
    const keep = str(fd, "keepRecipients") === "1";
    const people = keep ? [] : await resolveRecipients(c.audience, f.segmentId, f.categories, f.contactIds);
    if (!keep && people.length === 0) throw new Error("No active contacts match this selection.");
    const needsReapproval = c.requiresApproval;
    await prisma.$transaction(async (tx) => {
      if (!keep) {
        await tx.campaignRecipient.deleteMany({ where: { campaignId: c.id, status: "QUEUED" } });
        await tx.campaignRecipient.createMany({ data: people.map((p) => ({ campaignId: c.id, contactId: p.id, email: p.email })), skipDuplicates: true });
      }
      await tx.campaign.update({
        where: { id: c.id },
        data: {
          name: f.name || c.name, templateVersionId: version.id, segmentId: keep ? c.segmentId : f.contactIds.length ? null : f.segmentId, senderIdentity: f.senderIdentity, scheduledAt: f.scheduledAt,
          eventName: f.eventName, eventDate: f.eventDate, isMarketing: f.isMarketing, revision: { increment: 1 },
          status: needsReapproval ? "DRAFT" : c.status === "SCHEDULED" ? "SCHEDULED" : "DRAFT",
          ...(needsReapproval ? {} : { approvedRevision: c.revision + 1 }),
        },
      });
    });
    await audit(u.id, "campaign.updated", "Campaign", c.id, `${c.name} → revision ${c.revision + 1}${needsReapproval && c.approvedRevision ? " (approval voided)" : ""}`);
    return { ok: true, message: needsReapproval && c.approvedRevision ? "Saved. The campaign changed after approval, so it must be approved again." : "Campaign saved." };
  });
}

export async function submitForApproval(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("campaigns:write");
    const c = await prisma.campaign.findUniqueOrThrow({ where: { id: str(fd, "id") }, include: { _count: { select: { recipients: true } } } });
    if (!["DRAFT", "CHANGES_REQUESTED"].includes(c.status)) throw new Error("Only drafts can be submitted.");
    if (!c.scheduledAt) throw new Error("Set a sending date and time before submitting.");
    await prisma.campaign.update({ where: { id: c.id }, data: { status: "AWAITING_APPROVAL", approvals: { create: { revision: c.revision, decision: "SUBMITTED", userId: u.id, comment: opt(fd, "comment") } } } });
    await notify({ key: `approval:${c.id}:${c.revision}`, roles: ["APPROVER", "SUPER_ADMIN"], level: "warning", title: "Campaign awaiting approval", body: `${c.name} — ${c._count.recipients} recipients, submitted by ${u.name}.`, link: `/campaigns/${c.id}` });
    await audit(u.id, "campaign.submitted", "Campaign", c.id, `${c.name} r${c.revision}`);
    return { ok: true, message: "Submitted. Approvers have been notified." };
  });
}

export async function decideCampaign(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("campaigns:approve");
    const c = await prisma.campaign.findUniqueOrThrow({ where: { id: str(fd, "id") } });
    const revision = Number(str(fd, "revision"));
    const decision = str(fd, "decision") as "APPROVED" | "REJECTED" | "CHANGES_REQUESTED";
    const comment = opt(fd, "comment");
    if (c.status !== "AWAITING_APPROVAL") throw new Error("This campaign is not awaiting approval.");
    if (revision !== c.revision) throw new Error("The campaign changed while you were reviewing it. Reload to review the latest revision.");
    if (c.createdBy === u.name && u.role !== "SUPER_ADMIN") throw new Error("You cannot approve a campaign you created.");
    if (decision !== "APPROVED" && !comment) throw new Error("Add a comment explaining what needs to change.");
    const status = decision === "APPROVED" ? (c.scheduledAt ? "SCHEDULED" : "APPROVED") : decision === "REJECTED" ? "CANCELLED" : "CHANGES_REQUESTED";
    await prisma.campaign.update({
      where: { id: c.id },
      data: { status, approvedRevision: decision === "APPROVED" ? c.revision : c.approvedRevision, approvals: { create: { revision: c.revision, decision, comment, userId: u.id } } },
    });
    await audit(u.id, decision === "APPROVED" ? "campaign.approved" : "campaign.rejected", "Campaign", c.id, `${c.name} r${c.revision}${comment ? `: ${comment}` : ""}`, await clientIp());
    const creator = c.createdBy ? await prisma.user.findFirst({ where: { name: c.createdBy } }) : null;
    await notify({ userId: creator?.id, roles: creator ? [] : ["COMMS_OFFICER"], level: decision === "APPROVED" ? "success" : "warning", title: `Campaign ${decision === "APPROVED" ? "approved" : decision === "REJECTED" ? "rejected" : "returned for changes"}`, body: `${c.name}${comment ? ` — “${comment}”` : ""} (${u.name})`, link: `/campaigns/${c.id}` });
    return { ok: true, message: decision === "APPROVED" ? "Approved. The campaign is now eligible for delivery." : "Decision recorded and the creator has been notified." };
  });
}

export async function scheduleCampaign(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("campaigns:write");
    const c = await prisma.campaign.findUniqueOrThrow({ where: { id: str(fd, "id") } });
    const now = fd.get("now") === "1";
    if (c.requiresApproval && c.approvedRevision !== c.revision) throw new Error("This campaign must be approved before it can be scheduled.");
    if (!["DRAFT", "APPROVED", "PAUSED", "SCHEDULED"].includes(c.status)) throw new Error(`A ${c.status.toLowerCase()} campaign cannot be scheduled.`);
    const scheduledAt = now ? new Date() : c.scheduledAt;
    if (!scheduledAt) throw new Error("Set a sending date and time first.");
    await prisma.campaign.update({ where: { id: c.id }, data: { status: "SCHEDULED", scheduledAt, approvedRevision: c.requiresApproval ? c.approvedRevision : c.revision } });
    await audit(u.id, now ? "campaign.send_now" : "campaign.scheduled", "Campaign", c.id, c.name);
    if (now || scheduledAt <= new Date()) after(() => drainCampaign(c.id).then(() => undefined).catch((e) => console.error("dispatch failed", e)));
    return { ok: true, message: now ? "Sending has started in the background. Refresh in a moment to see progress." : "Scheduled." };
  });
}

export async function setCampaignState(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertUser();
    const c = await prisma.campaign.findUniqueOrThrow({ where: { id: str(fd, "id") } });
    const op = str(fd, "op");
    if (op === "pause") {
      if (u.role !== "SUPER_ADMIN" && u.role !== "COMMS_OFFICER" && u.role !== "APPROVER" && u.role !== "HR") throw new Error("Not permitted.");
      if (!["SCHEDULED", "PROCESSING", "APPROVED"].includes(c.status)) throw new Error("Only scheduled or sending campaigns can be paused.");
      await prisma.campaign.update({ where: { id: c.id }, data: { status: "PAUSED" } });
    } else if (op === "resume") {
      await assertPermission("campaigns:write");
      if (c.status !== "PAUSED") throw new Error("Campaign is not paused.");
      if (c.requiresApproval && c.approvedRevision !== c.revision) throw new Error("Approval required before resuming.");
      await prisma.campaign.update({ where: { id: c.id }, data: { status: "SCHEDULED" } });
    } else if (op === "cancel") {
      await assertPermission("campaigns:write");
      if (["SENT", "CANCELLED", "PARTIALLY_DELIVERED", "FAILED"].includes(c.status)) throw new Error("This campaign has already finished.");
      await prisma.$transaction([
        prisma.campaign.update({ where: { id: c.id }, data: { status: "CANCELLED" } }),
        prisma.campaignRecipient.updateMany({ where: { campaignId: c.id, status: "QUEUED" }, data: { status: "SUPPRESSED", reason: "Campaign cancelled" } }),
      ]);
    } else if (op === "retry") {
      await assertPermission("campaigns:write");
      // Only temporary failures. Bounces stay suppressed; "interrupted" messages need explicit confirmation.
      const includeInterrupted = fd.get("interrupted") === "1";
      const r = await prisma.campaignRecipient.updateMany({
        where: { campaignId: c.id, status: "FAILED", ...(includeInterrupted ? {} : { NOT: { reason: { startsWith: "Interrupted" } } }) },
        data: { status: "QUEUED", attempts: 0, nextAttemptAt: null },
      });
      if (r.count === 0) return { ok: true, message: "No retryable failures." };
      await prisma.campaign.update({ where: { id: c.id }, data: { status: "SCHEDULED", completedAt: null } });
      after(() => drainCampaign(c.id).then(() => undefined).catch(console.error));
      await audit(u.id, "campaign.retry", "Campaign", c.id, `${r.count} recipient(s) requeued`);
      return { ok: true, message: `${r.count} message(s) queued for retry.` };
    } else throw new Error("Unknown operation.");
    await audit(u.id, `campaign.${op === "pause" ? "paused" : op === "resume" ? "resumed" : "cancelled"}`, "Campaign", c.id, c.name);
    return { ok: true, message: `Campaign ${op === "pause" ? "paused" : op === "resume" ? "resumed" : "cancelled"}.` };
  });
}

export async function excludeRecipient(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("campaigns:write");
    const r = await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: str(fd, "recipientId") }, include: { campaign: true } });
    if (r.status !== "QUEUED") throw new Error("Only queued recipients can be excluded.");
    await prisma.$transaction([
      prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "SUPPRESSED", reason: `Excluded by ${u.name}` } }),
      // Changing the recipient list is a material change.
      prisma.campaign.update({ where: { id: r.campaignId }, data: { revision: { increment: 1 }, ...(r.campaign.requiresApproval && ["AWAITING_APPROVAL", "APPROVED", "SCHEDULED"].includes(r.campaign.status) ? { status: "DRAFT" } : { approvedRevision: r.campaign.requiresApproval ? r.campaign.approvedRevision : r.campaign.revision + 1 }) } }),
    ]);
    await audit(u.id, "campaign.recipient_excluded", "Campaign", r.campaignId, r.email);
    return { ok: true, message: "Recipient excluded." };
  });
}

export async function sendCampaignTest(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertUser();
    const s = await getSettings();
    const c = await prisma.campaign.findUniqueOrThrow({ where: { id: str(fd, "id") }, include: { templateVersion: true, recipients: { take: 1, include: { contact: true } } } });
    const to = normEmail(str(fd, "to"));
    if (!isValidEmail(to)) throw new Error("Enter a valid email address.");
    if (!canTestAnyAddress(u.role) && to !== normEmail(u.email) && !s.sending.testRecipientDomains.map((d) => d.toLowerCase()).includes(to.split("@")[1])) throw new Error(`Tests can only go to your own address or to: ${s.sending.testRecipientDomains.join(", ")}`);
    const sample = c.recipients[0]?.contact;
    if (!sample) throw new Error("The campaign has no recipients to personalise the test with.");
    const msg = await renderForContact({ settings: s, subject: c.templateVersion.subject, preheader: c.templateVersion.preheader, blocks: c.templateVersion.blocks as unknown as EmailBlock[], contact: sample, senderId: c.senderIdentity, eventName: c.eventName, eventDate: c.eventDate, external: false, isTest: true });
    const res = await sendEmail({ to, from: `${msg.sender.name} <${msg.sender.email}>`, subject: msg.subject, html: msg.html, text: msg.text });
    await audit(u.id, "test.sent", "Campaign", c.id, `Test → ${to} (${res.ok ? "ok" : res.error})`);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, message: res.simulated ? "Test recorded (simulation mode, no email sent)." : `Test sent to ${to}, personalised as ${sample.firstName} ${sample.lastName}. It is not counted as a delivery.` };
  });
}
