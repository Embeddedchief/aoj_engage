import type { Prisma, RecipientStatus, Role } from "@prisma/client";
import { prisma } from "./db";
import { visibleAudiences } from "./queries";
import { lagosInstant, todayLocal, addDays } from "./time";

export type ReportFilters = { from?: string; to?: string; campaign?: string; template?: string; audience?: string; department?: string; status?: string; sender?: string };

const STATUS_GROUPS: Record<string, RecipientStatus[]> = {
  accepted: ["ACCEPTED", "DELIVERED"],
  delivered: ["DELIVERED"],
  bounced: ["BOUNCED"],
  complained: ["COMPLAINED"],
  failed: ["FAILED", "REJECTED", "BOUNCED", "COMPLAINED"],
  suppressed: ["SUPPRESSED"],
};

export function reportRange(f: ReportFilters) {
  const to = f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to) ? f.to : todayLocal();
  const from = f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from) ? f.from : addDays(to, -29);
  return { from, to, start: lagosInstant(from, "00:00"), end: lagosInstant(addDays(to, 1), "00:00") };
}

export function recipientWhere(f: ReportFilters, role: Role): Prisma.CampaignRecipientWhereInput {
  const { start, end } = reportRange(f);
  const auds = visibleAudiences(role);
  return {
    OR: [{ sentAt: { gte: start, lt: end } }, { sentAt: null, updatedAt: { gte: start, lt: end }, status: { notIn: ["QUEUED", "SENDING"] } }],
    campaign: {
      audience: f.audience && auds.includes(f.audience as never) ? (f.audience as never) : { in: auds },
      ...(f.campaign ? { id: f.campaign } : {}),
      ...(f.template ? { templateVersion: { templateId: f.template } } : {}),
      ...(f.sender ? { senderIdentity: f.sender } : {}),
    },
    ...(f.department ? { contact: { department: f.department } } : {}),
    ...(f.status && STATUS_GROUPS[f.status] ? { status: { in: STATUS_GROUPS[f.status] } } : {}),
  };
}

export async function reportRows(f: ReportFilters, role: Role, limit = 20000) {
  const rows = await prisma.campaignRecipient.findMany({
    where: recipientWhere(f, role),
    take: limit,
    orderBy: { sentAt: "desc" },
    include: { contact: { select: { firstName: true, lastName: true, category: true, department: true, organisation: true } }, campaign: { select: { name: true, senderIdentity: true, audience: true, templateVersion: { select: { version: true, template: { select: { name: true } } } } } } },
  });
  return rows.map((r) => ({
    campaign: r.campaign.name,
    template: `${r.campaign.templateVersion.template.name} v${r.campaign.templateVersion.version}`,
    audience: r.campaign.audience,
    sender: r.campaign.senderIdentity,
    recipient: `${r.contact.firstName} ${r.contact.lastName}`,
    email: r.email,
    category: r.contact.category,
    department: r.contact.department ?? "",
    organisation: r.contact.organisation ?? "",
    status: r.status,
    detail: r.reason?.startsWith("years:") ? "" : r.reason ?? "",
    sent_at: r.sentAt?.toISOString() ?? "",
    attempts: r.attempts,
  }));
}
