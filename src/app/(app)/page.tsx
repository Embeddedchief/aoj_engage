import Link from "next/link";
import {
  AlertTriangle, Briefcase, CalendarPlus, CheckCircle2, Clock, Cpu, LayoutTemplate, Lightbulb, MailCheck, MailX, Megaphone, Send, Sparkles, UserPlus, Users, BookUser,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { occurrencesBetween, type Occurrence } from "@/lib/calendar";
import { addDays, fmtDateTime, fmtLocal, todayLocal, daysBetween } from "@/lib/time";
import { AUDIENCE_LABEL, STATUS_TONE } from "@/lib/constants";
import { visibleAudiences, visibleCategories } from "@/lib/queries";
import { providerMode } from "@/lib/email/provider";
import { pct, titleCase } from "@/lib/utils";
import { Badge, Card, Empty, Notice, PageHeader, StatCard } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { runEngineNow } from "@/actions/engine";

export const metadata = { title: "Overview" };

type Row = { date: string; title: string; audience: string; kind: Occurrence["kind"]; provisional?: boolean; eventId?: string; automationId?: string; count?: number };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  const { denied } = await searchParams;
  const today = todayLocal();
  const since = new Date(Date.now() - 30 * 86400_000);
  const cats = visibleCategories(user.role);
  const auds = visibleAudiences(user.role);

  const [contacts, staff, customers, recipients30, scheduled, pending, recent, occ, upcomingCampaigns, engine] = await Promise.all([
    prisma.contact.count({ where: { status: "ACTIVE", category: { in: cats } } }),
    prisma.contact.count({ where: { status: "ACTIVE", category: { in: ["STAFF", "MANAGEMENT", "CONTRACTOR"] } } }),
    prisma.contact.count({ where: { status: "ACTIVE", category: { in: ["CUSTOMER"] } } }),
    prisma.campaignRecipient.groupBy({ by: ["status"], where: { updatedAt: { gte: since }, campaign: { audience: { in: auds } } }, _count: true }),
    prisma.campaign.count({ where: { status: { in: ["SCHEDULED", "APPROVED"] }, audience: { in: auds } } }),
    prisma.campaign.count({ where: { status: "AWAITING_APPROVAL", audience: { in: auds } } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 9, include: { user: { select: { name: true } } } }),
    occurrencesBetween(today, addDays(today, 14), { includeExternalPeople: auds.includes("EXTERNAL") }),
    prisma.campaign.findMany({ where: { eventDate: { gte: today, lte: addDays(today, 14) }, audience: { in: auds } }, select: { id: true, name: true, status: true, eventDate: true, automationId: true, automation: { select: { eventId: true, trigger: true } } } }),
    prisma.setting.findUnique({ where: { key: "engine.lastRun" } }),
  ]);

  const n = Object.fromEntries(recipients30.map((r) => [r.status, r._count])) as Record<string, number>;
  const accepted = (n.ACCEPTED ?? 0) + (n.DELIVERED ?? 0);
  const failed = (n.FAILED ?? 0) + (n.BOUNCED ?? 0) + (n.REJECTED ?? 0) + (n.COMPLAINED ?? 0);

  // Aggregate personal occasions per day.
  const rows: Row[] = [];
  const grouped = new Map<string, Row>();
  for (const o of occ.filter((o) => o.active && auds.includes(o.audience))) {
    if (o.kind === "birthday" || o.kind === "anniversary") {
      const k = `${o.date}:${o.kind}:${o.audience}`;
      const g = grouped.get(k) ?? { date: o.date, title: "", audience: o.audience, kind: o.kind, count: 0 };
      g.count!++;
      g.title = o.kind === "birthday" ? `${o.audience === "INTERNAL" ? "Staff" : "Customer"} birthday${g.count! > 1 ? "s" : ""} (${g.count})` : `Work anniversar${g.count! > 1 ? "ies" : "y"} (${g.count})`;
      grouped.set(k, g);
    } else rows.push({ date: o.date, title: o.title, audience: o.audience, kind: o.kind, provisional: o.provisional, eventId: o.eventId, automationId: o.automationId });
  }
  rows.push(...grouped.values());
  rows.sort((a, b) => a.date.localeCompare(b.date));

  const campaignFor = (r: Row) =>
    upcomingCampaigns.filter((c) =>
      c.eventDate === r.date &&
      ((r.automationId && c.automationId === r.automationId) ||
        (r.eventId && c.automation?.eventId === r.eventId) ||
        (r.kind === "birthday" && c.automation?.trigger === "BIRTHDAY") ||
        (r.kind === "anniversary" && c.automation?.trigger === "WORK_ANNIVERSARY"))
    );

  // Smart recommendations (spec 19.2)
  const recs: { text: string; href: string; cta: string }[] = [];
  for (const r of rows.filter((r) => r.kind === "event")) {
    const d = daysBetween(today, r.date);
    if (campaignFor(r).length === 0 && d >= 1 && d <= 14) recs.push({ text: `${r.title} is in ${d} day${d > 1 ? "s" : ""}${r.provisional ? " (date still provisional)" : ""}. Would you like to prepare a message?`, href: r.provisional && r.eventId ? `/calendar/${r.eventId}` : `/campaigns/new?event=${encodeURIComponent(r.title)}&date=${r.date}`, cta: r.provisional ? "Confirm date" : "Prepare" });
  }
  const weekBdays = rows.filter((r) => r.kind === "birthday" && daysBetween(today, r.date) <= 7).reduce((s, r) => s + (r.count ?? 0), 0);
  if (weekBdays) recs.push({ text: `${weekBdays} birthday${weekBdays > 1 ? "s" : ""} in the next 7 days. Birthday messages are prepared automatically the day before.`, href: "/calendar", cta: "Review" });
  if (pending && can(user.role, "campaigns:approve")) recs.unshift({ text: `${pending} campaign${pending > 1 ? "s are" : " is"} awaiting your approval.`, href: "/approvals", cta: "Review now" });

  const last = engine?.value as { at?: string; mode?: string } | undefined;
  const mode = providerMode();

  return (
    <>
      <PageHeader
        title={`Good ${greeting()}, ${user.name.split(" ")[0]}`}
        description={`Here is what's happening across AOJ communications today, ${fmtLocal(today, { weekday: true })}.`}
        actions={
          <>
            {can(user.role, "campaigns:write") && <Link href="/campaigns/new" className="btn-primary"><Megaphone className="h-4 w-4" /> Create campaign</Link>}
            {(can(user.role, "contacts:write:internal") || can(user.role, "contacts:write:external")) && <Link href="/contacts/new" className="btn-secondary"><UserPlus className="h-4 w-4" /> Add contact</Link>}
          </>
        }
      />
      {denied && <div className="mb-5"><Notice tone="warn">You don&apos;t have permission to open that page. Contact the ICT Administrator if you need access.</Notice></div>}
      {mode === "simulation" && can(user.role, "settings:write") && (
        <div className="mb-5">
          <Notice tone="warn" title="Simulation mode">Amazon SES credentials are not configured, so the engine records deliveries without sending real email. Add the AWS_* environment variables in Vercel to go live.</Notice>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total contacts" value={contacts} icon={BookUser} href="/contacts" />
        <StatCard label="Staff members" value={staff} icon={Users} href="/staff" />
        <StatCard label="Customers" value={customers} icon={Briefcase} href="/customers" />
        <StatCard label="Emails sent" value={accepted + failed} hint="Last 30 days" icon={Send} tone="brand" href="/analytics" />
        <StatCard label="Scheduled" value={scheduled} hint="Campaigns queued" icon={Clock} href="/campaigns?status=SCHEDULED" />
        <StatCard label="Delivery success" value={pct(accepted, accepted + failed)} hint="Accepted by provider" icon={MailCheck} tone="ok" href="/analytics" />
        <StatCard label="Pending approvals" value={pending} icon={CheckCircle2} tone={pending ? "warn" : "neutral"} href="/approvals" />
        <StatCard label="Failed emails" value={failed} hint="Last 30 days" icon={MailX} tone={failed ? "bad" : "neutral"} href="/analytics?status=failed" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <Card title="Upcoming — next 14 days" actions={<Link href="/calendar" className="link text-xs">Open calendar</Link>} bodyClass="p-0">
            {rows.length === 0 ? (
              <Empty icon={CalendarPlus} title="Nothing scheduled in the next two weeks" />
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th>Date</th><th>Occasion</th><th>Audience</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
                  <tbody>
                    {rows.slice(0, 14).map((r, i) => {
                      const cs = campaignFor(r);
                      return (
                        <tr key={i}>
                          <td className="whitespace-nowrap font-medium text-navy">{fmtLocal(r.date, { weekday: true, year: false })}</td>
                          <td>
                            {r.title}
                            {r.provisional && <Badge tone="warn" className="ml-2">Provisional</Badge>}
                          </td>
                          <td className="whitespace-nowrap text-muted">{AUDIENCE_LABEL[r.audience as keyof typeof AUDIENCE_LABEL]}</td>
                          <td>
                            {cs.length ? cs.map((c) => <Badge key={c.id} tone={STATUS_TONE[c.status]} className="mr-1">{titleCase(c.status)}</Badge>) : <Badge>Upcoming</Badge>}
                          </td>
                          <td className="whitespace-nowrap text-right text-xs">
                            {cs[0] ? <Link className="link" href={`/campaigns/${cs[0].id}`}>Open campaign</Link>
                              : r.automationId ? <Link className="link" href={`/automations/${r.automationId}`}>Automation</Link>
                              : r.eventId ? <Link className="link" href={`/calendar/${r.eventId}`}>Event</Link>
                              : <Link className="link" href="/calendar">Calendar</Link>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Recent activity" actions={can(user.role, "audit:read") ? <Link href="/settings/audit" className="link text-xs">Audit log</Link> : null} bodyClass="p-0">
            {recent.length === 0 ? <Empty title="No activity yet" /> : (
              <ul className="divide-y divide-line">
                {recent.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-4 px-5 py-3 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium text-navy">{describeAction(a.action)}</span>
                      {a.detail && <span className="text-muted"> — {a.detail}</span>}
                      <div className="text-xs text-muted">{a.user?.name ?? "System"}</div>
                    </div>
                    <div className="whitespace-nowrap text-xs text-muted">{fmtDateTime(a.createdAt)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={<span className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-brand" /> Recommendations</span>} bodyClass="p-0">
            {recs.length === 0 ? <Empty title="You're all caught up" /> : (
              <ul className="divide-y divide-line">
                {recs.slice(0, 6).map((r, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span>{r.text}</span>
                    <Link href={r.href} className="btn-secondary shrink-0 px-2.5 py-1 text-xs">{r.cta}</Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-brand" /> Communication assistant</span>}>
            <form action="/assistant" className="flex gap-2">
              <input name="q" className="input" placeholder="e.g. Show me staff birthdays this month" />
              <button className="btn-navy">Ask</button>
            </form>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["Staff birthdays this month", "Which campaigns are scheduled for December?", "Prepare a Happy New Month email for all customers", "Customers without an appreciation email recently"].map((q) => (
                <Link key={q} href={`/assistant?q=${encodeURIComponent(q)}`} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:border-brand hover:text-brand">{q}</Link>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">The assistant prepares drafts and shortcuts. It never sends or approves anything on its own.</p>
          </Card>

          <Card title="Quick actions">
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[
                ["/contacts/new", "Add contact", UserPlus],
                ["/contacts/new?category=STAFF", "Add staff", Users],
                ["/contacts/new?category=CUSTOMER", "Add customer", Briefcase],
                ["/campaigns/new", "Create campaign", Megaphone],
                ["/calendar?new=1", "Schedule occasion", CalendarPlus],
                ["/templates/new", "Create template", LayoutTemplate],
              ].map(([href, label, Icon]) => {
                const I = Icon as typeof UserPlus;
                return <Link key={href as string} href={href as string} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2.5 font-medium text-navy hover:border-brand hover:text-brand"><I className="h-4 w-4" />{label as string}</Link>;
              })}
            </div>
          </Card>

          <Card title={<span className="flex items-center gap-2"><Cpu className="h-4 w-4 text-navy" /> Automation engine</span>}>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted">Delivery provider</span><Badge tone={mode === "ses" ? "ok" : "warn"}>{mode === "ses" ? "Amazon SES" : "Simulation"}</Badge></div>
              <div className="flex justify-between"><span className="text-muted">Last run</span><span>{last?.at ? fmtDateTime(new Date(last.at)) : "Never"}</span></div>
            </div>
            {can(user.role, "engine:run") && (
              <div className="mt-4"><ActionButton action={runEngineNow} className="btn-secondary w-full">Run engine now</ActionButton></div>
            )}
            {!last?.at && <p className="mt-3 flex gap-2 text-xs text-warn"><AlertTriangle className="h-4 w-4 shrink-0" />The scheduled job has not run yet. It runs daily via Vercel Cron.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}

function greeting() {
  const h = (new Date().getUTCHours() + 1) % 24;
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

function describeAction(a: string) {
  const map: Record<string, string> = {
    "auth.login": "Signed in", "auth.logout": "Signed out", "auth.setup": "Platform set up", "contact.created": "Contact created", "contact.updated": "Contact updated",
    "contact.deactivated": "Contact deactivated", "contact.reactivated": "Contact reactivated", "contact.imported": "Contacts imported", "template.updated": "Template updated", "template.created": "Template created",
    "campaign.created": "Campaign created", "campaign.approved": "Campaign approved", "campaign.rejected": "Campaign rejected", "campaign.submitted": "Campaign submitted",
    "campaign.completed": "Campaign completed", "campaign.cancelled": "Campaign cancelled", "campaign.paused": "Campaign paused", "automation.planned": "Automation prepared campaign",
    "automation.updated": "Automation updated", "engine.run": "Engine run", "email.bounced": "Email bounced", "test.sent": "Test email sent",
  };
  return map[a] ?? titleCase(a.replace(".", " "));
}
