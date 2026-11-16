import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { AUDIENCE_LABEL } from "@/lib/constants";
import { visibleAudiences } from "@/lib/queries";
import { fmtDateTime } from "@/lib/time";
import { titleCase } from "@/lib/utils";
import { Badge, Card, Empty, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const user = await requireUser();
  const auds = visibleAudiences(user.role);
  const [pending, returned, decisions] = await Promise.all([
    prisma.campaign.findMany({ where: { status: "AWAITING_APPROVAL", audience: { in: auds } }, orderBy: { scheduledAt: "asc" }, include: { templateVersion: { include: { template: { select: { name: true } } } }, _count: { select: { recipients: true } }, approvals: { where: { decision: "SUBMITTED" }, orderBy: { createdAt: "desc" }, take: 1, include: { user: { select: { name: true } } } } } }),
    prisma.campaign.findMany({ where: { status: "CHANGES_REQUESTED", audience: { in: auds } }, orderBy: { updatedAt: "desc" }, take: 20 }),
    prisma.approval.findMany({ where: { decision: { not: "SUBMITTED" }, campaign: { audience: { in: auds } } }, orderBy: { createdAt: "desc" }, take: 25, include: { user: { select: { name: true } }, campaign: { select: { id: true, name: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Approvals" description="Management review of campaigns before delivery. Approval applies to the exact content, recipient list and template version. Any later change returns the campaign here." />
      {!can(user.role, "campaigns:approve") && <div className="mb-5"><Notice>You can track approval status here. Only Management / Approvers and the ICT Administrator can make decisions.</Notice></div>}
      <Card title={`Awaiting approval (${pending.length})`} bodyClass="p-0" className="mb-6">
        {pending.length === 0 ? <Empty icon={CheckCircle2} title="Nothing awaiting approval" /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Campaign</th><th>Audience</th><th className="text-right">Recipients</th><th>Send time</th><th>Submitted</th><th /></tr></thead>
              <tbody>
                {pending.map((c) => (
                  <tr key={c.id}>
                    <td><Link className="link" href={`/campaigns/${c.id}`}>{c.name}</Link><div className="text-xs text-muted">{c.templateVersion.template.name} v{c.templateVersion.version} · r{c.revision}{c.automationId ? " · automation" : ""}</div></td>
                    <td className="whitespace-nowrap text-muted">{AUDIENCE_LABEL[c.audience]}</td>
                    <td className="text-right tabular-nums">{c._count.recipients}</td>
                    <td className="whitespace-nowrap text-muted">{fmtDateTime(c.scheduledAt)}</td>
                    <td className="text-xs text-muted">{c.approvals[0] ? `${c.approvals[0].user.name}, ${fmtDateTime(c.approvals[0].createdAt)}` : c.automationId ? "Prepared by automation" : "—"}</td>
                    <td className="text-right"><Link href={`/campaigns/${c.id}`} className="btn-primary px-3 py-1 text-xs">Review</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Returned for changes" bodyClass="p-0">
          {returned.length === 0 ? <p className="p-5 text-sm text-muted">None.</p> : <ul className="divide-y divide-line">{returned.map((c) => <li key={c.id} className="px-5 py-3 text-sm"><Link className="link" href={`/campaigns/${c.id}`}>{c.name}</Link></li>)}</ul>}
        </Card>
        <Card title="Recent decisions" bodyClass="p-0">
          {decisions.length === 0 ? <p className="p-5 text-sm text-muted">No decisions yet.</p> : (
            <ul className="divide-y divide-line">
              {decisions.map((d) => (
                <li key={d.id} className="flex justify-between gap-3 px-5 py-3 text-sm">
                  <span><Badge tone={d.decision === "APPROVED" ? "ok" : "warn"}>{titleCase(d.decision)}</Badge> <Link className="link" href={`/campaigns/${d.campaign.id}`}>{d.campaign.name}</Link> <span className="text-muted">r{d.revision} · {d.user.name}</span>{d.comment && <div className="text-xs text-muted">“{d.comment}”</div>}</span>
                  <span className="whitespace-nowrap text-xs text-muted">{fmtDateTime(d.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
