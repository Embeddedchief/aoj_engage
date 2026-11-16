import Link from "next/link";
import { Download, FileSpreadsheet, MailCheck, MailWarning, MailX, Send, ShieldAlert, Megaphone, Clock, CheckCircle2 } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DEPARTMENTS } from "@/lib/constants";
import { getSettings } from "@/lib/settings";
import { recipientWhere, reportRange, type ReportFilters } from "@/lib/report";
import { visibleAudiences } from "@/lib/queries";
import { addDays, daysBetween, fmtLocal, lagosParts, toLocalDate } from "@/lib/time";
import { pct } from "@/lib/utils";
import { Card, PageHeader, StatCard } from "@/components/ui";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<ReportFilters> }) {
  const user = await requirePermission("analytics:read");
  const f = await searchParams;
  const { from, to, start, end } = reportRange(f);
  const where = recipientWhere(f, user.role);
  const auds = visibleAudiences(user.role);

  const [byStatus, rows, campaignsCreated, scheduled, awaiting, templates, campaigns, settings] = await Promise.all([
    prisma.campaignRecipient.groupBy({ by: ["status"], where, _count: true }),
    prisma.campaignRecipient.findMany({ where, select: { status: true, sentAt: true, updatedAt: true, campaign: { select: { templateVersionId: true } } } }),
    prisma.campaign.count({ where: { createdAt: { gte: start, lt: end }, audience: { in: auds } } }),
    prisma.campaign.count({ where: { status: "SCHEDULED", audience: { in: auds } } }),
    prisma.campaign.count({ where: { status: "AWAITING_APPROVAL", audience: { in: auds } } }),
    prisma.template.findMany({ where: { audience: { in: auds } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.campaign.findMany({ where: { audience: { in: auds }, createdAt: { gte: addDaysDate(start, -60) } }, select: { id: true, name: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    getSettings(),
  ]);
  const n = Object.fromEntries(byStatus.map((x) => [x.status, x._count])) as Record<string, number>;
  const accepted = (n.ACCEPTED ?? 0) + (n.DELIVERED ?? 0);
  const bounced = n.BOUNCED ?? 0, complained = n.COMPLAINED ?? 0, failed = (n.FAILED ?? 0) + (n.REJECTED ?? 0);
  const attempted = accepted + bounced + complained + failed;

  // Daily volume (single series: accepted messages per day)
  const days = Math.min(92, daysBetween(from, to) + 1);
  const perDay = new Map<string, number>();
  for (const r of rows) {
    if (!r.sentAt || !["ACCEPTED", "DELIVERED", "COMPLAINED"].includes(r.status)) continue;
    const p = lagosParts(r.sentAt);
    const k = toLocalDate(p.year, p.month, p.day);
    perDay.set(k, (perDay.get(k) ?? 0) + 1);
  }
  const series = Array.from({ length: days }, (_, i) => { const d = addDays(to, i - days + 1); return { d, v: perDay.get(d) ?? 0 }; });
  const max = Math.max(1, ...series.map((s) => s.v));

  // Template version comparison (spec 19.6)
  const byVersion = new Map<string, { sent: number; ok: number; bounce: number; complaint: number }>();
  for (const r of rows) {
    if (["QUEUED", "SENDING", "SUPPRESSED"].includes(r.status)) continue;
    const k = r.campaign.templateVersionId;
    const e = byVersion.get(k) ?? { sent: 0, ok: 0, bounce: 0, complaint: 0 };
    e.sent++;
    if (["ACCEPTED", "DELIVERED"].includes(r.status)) e.ok++;
    if (r.status === "BOUNCED") e.bounce++;
    if (r.status === "COMPLAINED") e.complaint++;
    byVersion.set(k, e);
  }
  const versions = await prisma.templateVersion.findMany({ where: { id: { in: [...byVersion.keys()] } }, select: { id: true, version: true, template: { select: { name: true } } } });
  const comparison = versions.map((v) => ({ name: `${v.template.name} v${v.version}`, ...byVersion.get(v.id)! })).sort((a, b) => b.sent - a.sent);

  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <>
      <PageHeader
        title="Analytics & reports"
        description={`${fmtLocal(from)} – ${fmtLocal(to)}. "Accepted" means the provider accepted the message. Inbox placement is measured separately and isn't guaranteed.`}
        actions={
          <>
            <a href={`/api/export/report?${qs}&format=csv`} className="btn-secondary"><Download className="h-4 w-4" /> CSV</a>
            <a href={`/api/export/report?${qs}&format=xlsx`} className="btn-secondary"><FileSpreadsheet className="h-4 w-4" /> Excel</a>
            <PrintButton />
          </>
        }
      />
      <form className="card no-print mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <label><span className="label">From</span><input className="input" type="date" name="from" defaultValue={from} /></label>
        <label><span className="label">To</span><input className="input" type="date" name="to" defaultValue={to} /></label>
        <label><span className="label">Campaign</span><select className="input" name="campaign" defaultValue={f.campaign ?? ""}><option value="">All</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label><span className="label">Template</span><select className="input" name="template" defaultValue={f.template ?? ""}><option value="">All</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label><span className="label">Audience</span><select className="input" name="audience" defaultValue={f.audience ?? ""}><option value="">All</option>{auds.map((a) => <option key={a} value={a}>{a === "INTERNAL" ? "Internal" : a === "EXTERNAL" ? "External" : "Both"}</option>)}</select></label>
        <label><span className="label">Department</span><select className="input" name="department" defaultValue={f.department ?? ""}><option value="">All</option>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label><span className="label">Delivery status</span><select className="input" name="status" defaultValue={f.status ?? ""}><option value="">All</option>{["accepted", "delivered", "bounced", "complained", "failed", "suppressed"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></label>
        <label><span className="label">Sender</span><select className="input" name="sender" defaultValue={f.sender ?? ""}><option value="">All</option>{settings.senders.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4 xl:col-span-8"><button className="btn-navy">Apply filters</button><Link href="/analytics" className="btn-ghost">Reset</Link></div>
      </form>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Emails sent" value={attempted} icon={Send} hint="Attempted deliveries" />
        <StatCard label="Accepted / delivered" value={accepted} icon={MailCheck} tone="ok" hint={`${n.DELIVERED ?? 0} confirmed delivered`} />
        <StatCard label="Delivery rate" value={pct(accepted, attempted)} icon={MailCheck} tone="ok" />
        <StatCard label="Bounced" value={bounced} icon={MailX} tone={bounced ? "bad" : "neutral"} hint={pct(bounced, attempted)} />
        <StatCard label="Complaint rate" value={pct(complained, attempted)} icon={ShieldAlert} tone={complained ? "bad" : "neutral"} hint={`${complained} complaint(s)`} />
        <StatCard label="Failed" value={failed} icon={MailWarning} tone={failed ? "bad" : "neutral"} hint={`${n.SUPPRESSED ?? 0} suppressed before sending`} />
        <StatCard label="Campaigns created" value={campaignsCreated} icon={Megaphone} hint={`${scheduled} scheduled now`} />
        <StatCard label="Awaiting approval" value={awaiting} icon={awaiting ? Clock : CheckCircle2} tone={awaiting ? "warn" : "neutral"} href="/approvals" />
      </div>

      <Card title="Messages accepted per day" className="mt-6">
        <div className="flex h-48 items-end gap-[2px]" role="img" aria-label={`Bar chart of messages accepted per day from ${fmtLocal(from)} to ${fmtLocal(to)}, peak ${max}`}>
          {series.map((s) => (
            <div key={s.d} className="group relative flex h-full flex-1 items-end">
              <div className="w-full rounded-t-[4px] bg-navy-700 transition group-hover:bg-brand" style={{ height: s.v ? `${Math.max(2, (s.v / max) * 100)}%` : 0 }} />
              <div className="pointer-events-none absolute -top-9 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-white group-hover:block">{fmtLocal(s.d, { year: false })}: {s.v}</div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between border-t border-line pt-1 text-xs text-muted"><span>{fmtLocal(series[0].d, { year: false })}</span><span>Peak {max}</span><span>{fmtLocal(series[series.length - 1].d, { year: false })}</span></div>
      </Card>

      <Card title="Template performance comparison" className="mt-6" bodyClass="p-0">
        {comparison.length === 0 ? <p className="p-5 text-sm text-muted">No sends in this period.</p> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Template version</th><th className="text-right">Sent</th><th className="text-right">Accepted rate</th><th className="text-right">Bounce rate</th><th className="text-right">Complaint rate</th></tr></thead>
              <tbody>{comparison.map((c) => <tr key={c.name}><td className="font-medium">{c.name}</td><td className="text-right tabular-nums">{c.sent}</td><td className="text-right tabular-nums">{pct(c.ok, c.sent)}</td><td className="text-right tabular-nums">{pct(c.bounce, c.sent)}</td><td className="text-right tabular-nums">{pct(c.complaint, c.sent)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        <p className="border-t border-line px-5 py-2 text-xs text-muted">Open and click tracking is off by default for privacy. Comparisons use delivery outcomes only.</p>
      </Card>
    </>
  );
}

function addDaysDate(d: Date, n: number) {
  return new Date(d.getTime() + n * 86400_000);
}
