import Link from "next/link";
import type { CampaignStatus } from "@prisma/client";
import { Megaphone, Plus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { AUDIENCE_LABEL, STATUS_TONE } from "@/lib/constants";
import { visibleAudiences } from "@/lib/queries";
import { fmtDateTime } from "@/lib/time";
import { titleCase } from "@/lib/utils";
import { Badge, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Campaigns" };
const STATUSES: CampaignStatus[] = ["DRAFT", "AWAITING_APPROVAL", "CHANGES_REQUESTED", "APPROVED", "SCHEDULED", "PROCESSING", "SENT", "PARTIALLY_DELIVERED", "FAILED", "PAUSED", "CANCELLED"];

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; source?: string; page?: string }> }) {
  const user = await requirePermission("campaigns:read");
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as CampaignStatus) ? (sp.status as CampaignStatus) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const where = {
    audience: { in: visibleAudiences(user.role) },
    ...(status ? { status } : {}),
    ...(sp.q ? { name: { contains: sp.q, mode: "insensitive" as const } } : {}),
    ...(sp.source === "automation" ? { automationId: { not: null } } : sp.source === "manual" ? { automationId: null } : {}),
  };
  const [total, campaigns] = await Promise.all([
    prisma.campaign.count({ where }),
    prisma.campaign.findMany({
      where, orderBy: [{ scheduledAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], skip: (page - 1) * 50, take: 50,
      include: { templateVersion: { select: { version: true, template: { select: { name: true } } } }, _count: { select: { recipients: true } } },
    }),
  ]);
  const stats = await prisma.campaignRecipient.groupBy({ by: ["campaignId", "status"], where: { campaignId: { in: campaigns.map((c) => c.id) } }, _count: true });
  const sent = (id: string) => stats.filter((s) => s.campaignId === id && ["ACCEPTED", "DELIVERED"].includes(s.status)).reduce((a, s) => a + s._count, 0);

  return (
    <>
      <PageHeader title="Campaigns" description="Who receives each email, when it is sent and under what conditions. Automated campaigns appear here as soon as the engine prepares them."
        actions={can(user.role, "campaigns:write") && <Link href="/campaigns/new" className="btn-primary"><Plus className="h-4 w-4" /> Create campaign</Link>} />
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-[200px] flex-1"><span className="label">Search</span><input className="input" name="q" defaultValue={sp.q} /></label>
        <label><span className="label">Status</span><select className="input" name="status" defaultValue={status ?? ""}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select></label>
        <label><span className="label">Source</span><select className="input" name="source" defaultValue={sp.source ?? ""}><option value="">All</option><option value="automation">Automation</option><option value="manual">Manual</option></select></label>
        <button className="btn-navy">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        {campaigns.length === 0 ? <Empty icon={Megaphone} title="No campaigns yet" /> : (
          <table className="table">
            <thead><tr><th>Campaign</th><th>Audience</th><th>Template</th><th>Send time</th><th className="text-right">Recipients</th><th>Status</th></tr></thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/campaigns/${c.id}`} className="link">{c.name}</Link><div className="text-xs text-muted">{c.automationId ? "Automation" : `By ${c.createdBy ?? "—"}`} · {titleCase(c.type)}{c.isMarketing ? " · marketing" : ""}</div></td>
                  <td className="whitespace-nowrap text-muted">{AUDIENCE_LABEL[c.audience]}</td>
                  <td className="text-muted">{c.templateVersion.template.name} <span className="text-xs">v{c.templateVersion.version}</span></td>
                  <td className="whitespace-nowrap text-muted">{fmtDateTime(c.scheduledAt)}</td>
                  <td className="text-right tabular-nums">{["SENT", "PARTIALLY_DELIVERED", "FAILED", "PROCESSING"].includes(c.status) ? `${sent(c.id)} / ${c._count.recipients}` : c._count.recipients}</td>
                  <td><Badge tone={STATUS_TONE[c.status]}>{titleCase(c.status)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
          <span>{total} campaign{total === 1 ? "" : "s"}</span>
          <span className="flex gap-2">
            {page > 1 && <Link className="btn-secondary px-2.5 py-1" href={`?${new URLSearchParams({ ...sp, page: String(page - 1) } as Record<string, string>)}`}>Previous</Link>}
            {page * 50 < total && <Link className="btn-secondary px-2.5 py-1" href={`?${new URLSearchParams({ ...sp, page: String(page + 1) } as Record<string, string>)}`}>Next</Link>}
          </span>
        </div>
      </div>
    </>
  );
}
