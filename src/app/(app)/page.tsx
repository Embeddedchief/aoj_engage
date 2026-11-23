import Link from "next/link";
import { Prisma } from "@prisma/client";
import {
  AlertTriangle, ArrowUpRight, Briefcase, CalendarPlus, CheckCircle2, ChevronLeft, ChevronRight, Clock, Cpu, LayoutTemplate, Lightbulb, MailCheck, Megaphone, Send, Sparkles, UserPlus, Users, BookUser,
} from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { occurrencesBetween, type Occurrence } from "@/lib/calendar";
import { addDays, daysBetween, daysInMonth, fmtDateTime, fmtLocal, lagosParts, MONTHS, todayLocal, toLocalDate, weekdayOf } from "@/lib/time";
import { AUDIENCE_LABEL, STATUS_TONE } from "@/lib/constants";
import { visibleAudiences, visibleCategories } from "@/lib/queries";
import { providerMode } from "@/lib/email/provider";
import { cn, pct, titleCase } from "@/lib/utils";
import { Badge, Empty, Notice, StatCard } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { runEngineNow } from "@/actions/engine";

export const metadata = { title: "Overview" };

type Row = { date: string; title: string; audience: string; kind: Occurrence["kind"]; provisional?: boolean; eventId?: string; automationId?: string; count?: number };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ denied?: string; m?: string }> }) {
  const user = await requireUser();
  const { denied, m } = await searchParams;
  const today = todayLocal();
  const since = new Date(Date.now() - 30 * 86400_000);
  const cats = visibleCategories(user.role);
  const auds = visibleAudiences(user.role);

  // Calendar widget month (?m=YYYY-MM), defaults to the current Lagos month.
  const now = lagosParts();
  const mm = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(m ?? "");
  const [cy, cm] = mm ? [Number(mm[1]), Number(mm[2])] : [now.year, now.month];
  const monthStart = toLocalDate(cy, cm, 1);
  const monthEnd = toLocalDate(cy, cm, daysInMonth(cy, cm));
  const prevM = cm === 1 ? `${cy - 1}-12` : `${cy}-${String(cm - 1).padStart(2, "0")}`;
  const nextM = cm === 12 ? `${cy + 1}-01` : `${cy}-${String(cm + 1).padStart(2, "0")}`;
  const from14 = addDays(today, -13);

  const [contacts, staff, customers, recipients30, scheduled, pending, recent, occ, monthOcc, upcomingCampaigns, engine, daily] = await Promise.all([
    prisma.contact.count({ where: { status: "ACTIVE", category: { in: cats } } }),
    prisma.contact.count({ where: { status: "ACTIVE", category: { in: ["STAFF", "MANAGEMENT", "CONTRACTOR"] } } }),
    prisma.contact.count({ where: { status: "ACTIVE", category: { in: ["CUSTOMER"] } } }),
    prisma.campaignRecipient.groupBy({ by: ["status"], where: { updatedAt: { gte: since }, campaign: { audience: { in: auds } } }, _count: true }),
    prisma.campaign.count({ where: { status: { in: ["SCHEDULED", "APPROVED"] }, audience: { in: auds } } }),
    prisma.campaign.count({ where: { status: "AWAITING_APPROVAL", audience: { in: auds } } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { name: true } } } }),
    occurrencesBetween(today, addDays(today, 14), { includeExternalPeople: auds.includes("EXTERNAL") }),
    occurrencesBetween(monthStart, monthEnd, { includeExternalPeople: auds.includes("EXTERNAL") }),
    prisma.campaign.findMany({ where: { eventDate: { gte: today, lte: addDays(today, 14) }, audience: { in: auds } }, select: { id: true, name: true, status: true, eventDate: true, automationId: true, automation: { select: { eventId: true, trigger: true } } } }),
    prisma.setting.findUnique({ where: { key: "engine.lastRun" } }),
    prisma.$queryRaw<{ d: string; n: number }[]>(Prisma.sql`
      SELECT to_char((r."sentAt" AT TIME ZONE 'Africa/Lagos')::date, 'YYYY-MM-DD') AS d, count(*)::int AS n
      FROM "CampaignRecipient" r JOIN "Campaign" c ON c.id = r."campaignId"
      WHERE r."sentAt" >= ${new Date(Date.now() - 15 * 86400_000)} AND c."audience"::text = ANY(${auds as string[]})
      GROUP BY 1`),
  ]);

  const n = Object.fromEntries(recipients30.map((r) => [r.status, r._count])) as Record<string, number>;
  const accepted = (n.ACCEPTED ?? 0) + (n.DELIVERED ?? 0);
  const failed = (n.FAILED ?? 0) + (n.BOUNCED ?? 0) + (n.REJECTED ?? 0) + (n.COMPLAINED ?? 0);
  const skipped = n.SUPPRESSED ?? 0;
  const total = accepted + failed;

  const byDay = new Map(daily.map((r) => [r.d, r.n]));
  const days = Array.from({ length: 14 }, (_, i) => addDays(from14, i)).map((d) => ({ d, n: byDay.get(d) ?? 0 }));
  const sent14 = days.reduce((s, x) => s + x.n, 0);
  const maxDay = Math.max(1, ...days.map((x) => x.n));

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

  const marked = new Map<string, number>();
  for (const o of monthOcc) if (o.active && auds.includes(o.audience)) marked.set(o.date, (marked.get(o.date) ?? 0) + 1);

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
    if (campaignFor(r).length === 0 && d >= 1 && d <= 14) recs.push({ text: `${r.title} is in ${d} day${d > 1 ? "s" : ""}${r.provisional ? " (date still provisional)" : ""}. Prepare a message?`, href: r.provisional && r.eventId ? `/calendar/${r.eventId}` : `/campaigns/new?event=${encodeURIComponent(r.title)}&date=${r.date}`, cta: r.provisional ? "Confirm date" : "Prepare" });
  }
  const weekBdays = rows.filter((r) => r.kind === "birthday" && daysBetween(today, r.date) <= 7).reduce((s, r) => s + (r.count ?? 0), 0);
  if (weekBdays) recs.push({ text: `${weekBdays} birthday${weekBdays > 1 ? "s" : ""} in the next 7 days. Greetings are prepared automatically the day before.`, href: "/calendar", cta: "Review" });
  if (pending && can(user.role, "campaigns:approve")) recs.unshift({ text: `${pending} campaign${pending > 1 ? "s are" : " is"} awaiting your approval.`, href: "/approvals", cta: "Review now" });

  const last = engine?.value as { at?: string; mode?: string } | undefined;
  const mode = providerMode();
  const first = user.name.split(" ")[0];

  // Sparkline geometry for the hero card
  const W = 260, H = 64;
  const pts = days.map((x, i) => [(i / (days.length - 1)) * W, H - 6 - (x.n / maxDay) * (H - 14)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;

  // Calendar grid (Monday first)
  const lead = weekdayOf(monthStart) - 1;
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth(cy, cm) }, (_, i) => toLocalDate(cy, cm, i + 1))];
  while (cells.length % 7) cells.push(null);

  return (
    <>
      {/* Welcome */}
      <div className="mb-6 flex flex-col gap-4 pt-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">AOJ Engage <span className="text-muted/50">›</span> <span className="text-ink">Dashboard</span></div>
          <h1 className="text-[30px] font-extrabold leading-[1.1] tracking-tight text-navy md:text-[38px]">
            Welcome back,<br className="hidden md:block" /> <span className="relative inline-block">{first}<svg className="absolute -bottom-1.5 left-0 w-full text-brand" viewBox="0 0 120 10" preserveAspectRatio="none" aria-hidden><path d="M2 7 Q 30 1 60 5 T 118 4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" pathLength={1} strokeDasharray="1" className="animate-draw" /></svg></span> <span className="inline-block origin-[70%_70%] animate-wiggle">👋</span>
          </h1>
          <p className="mt-2 text-sm text-muted">Your messaging and broadcast centre · {fmtLocal(today, { weekday: true })}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(user.role, "campaigns:write") && <Link href="/campaigns/new" className="btn-primary"><Megaphone className="h-4 w-4" /> New broadcast</Link>}
          {(can(user.role, "contacts:write:internal") || can(user.role, "contacts:write:external")) && <Link href="/contacts/new" className="btn-secondary"><UserPlus className="h-4 w-4" /> Add contact</Link>}
        </div>
      </div>

      {(denied || (mode === "simulation" && can(user.role, "settings:write"))) && (
        <div className="mb-5 space-y-3">
          {denied && <Notice tone="warn">You don&apos;t have permission to open that page. Contact the ICT Administrator if you need access.</Notice>}
          {mode === "simulation" && can(user.role, "settings:write") && <Notice tone="warn" title="Simulation mode">Amazon SES credentials are not configured, so deliveries are recorded but no real email leaves the system. Add the AWS_* environment variables in Vercel to go live.</Notice>}
        </div>
      )}

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/analytics" className="hatch group relative overflow-hidden rounded-3xl bg-navy p-5 text-white shadow-lift transition duration-300 hover:-translate-y-0.5">
          <div className="absolute -right-10 -top-10 h-40 w-40 animate-drift rounded-full bg-brand/35 blur-3xl" />
          <div className="relative flex items-start justify-between">
            <div className="text-sm font-medium text-white/70">Emails broadcast</div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-brand text-white shadow-glow transition group-hover:rotate-12"><Send className="h-4 w-4" /></div>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="relative mt-3 h-16 w-full" preserveAspectRatio="none" aria-label={`${sent14} emails sent in the last 14 days`}>
            <defs>
              <linearGradient id="spark" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#E5120E" stopOpacity=".55" /><stop offset="100%" stopColor="#E5120E" stopOpacity="0" /></linearGradient>
            </defs>
            <path d={area} fill="url(#spark)" />
            <path d={line} fill="none" stroke="#FF9087" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" pathLength={1} strokeDasharray="1" className="animate-draw" />
          </svg>
          <div className="relative mt-2 flex items-end justify-between">
            <div className="text-[34px] font-extrabold leading-none tabular-nums">{sent14.toLocaleString()}</div>
            <div className="text-xs text-white/60">Last 14 days</div>
          </div>
        </Link>
        <StatCard label="Active contacts" value={contacts.toLocaleString()} hint={`${staff} staff · ${customers} customers`} icon={BookUser} href="/contacts" />
        <StatCard label="Delivery success" value={pct(accepted, total)} hint={`${accepted.toLocaleString()} accepted · ${failed} failed (30 days)`} icon={MailCheck} tone={failed ? "warn" : "ok"} href="/analytics" />
        <StatCard label="In the pipeline" value={scheduled} hint={pending ? `${pending} awaiting approval` : "Scheduled broadcasts"} icon={pending ? CheckCircle2 : Clock} tone={pending ? "brand" : "neutral"} href={pending ? "/approvals" : "/campaigns?status=SCHEDULED"} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {/* Broadcast view */}
          <section className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2.5 text-[15px] font-bold text-navy"><span className="grid h-8 w-8 place-items-center rounded-full bg-canvas"><Megaphone className="h-4 w-4" /></span> Broadcast view</h2>
              <Link href="/analytics" className="chip transition hover:bg-navy hover:text-white">Full analytics <ArrowUpRight className="h-3 w-3" /></Link>
            </div>
            <div className="mt-5 grid gap-6 lg:grid-cols-[220px_1fr]">
              <div>
                <div className="text-[44px] font-extrabold leading-none tracking-tight text-navy">{pct(accepted, total)}</div>
                <div className="mt-1.5 text-xs text-muted">delivered of {total.toLocaleString()} sent</div>
                <ul className="mt-5 space-y-2.5 text-sm">
                  {[
                    ["Accepted / delivered", accepted, "bg-navy"],
                    ["Failed or bounced", failed, "bg-brand"],
                    ["Suppressed", skipped, "bg-navy-100"],
                  ].map(([l, v, c]) => (
                    <li key={l as string} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-muted"><span className={cn("h-2.5 w-2.5 rounded-full", c as string)} />{l as string}</span>
                      <span className="font-bold tabular-nums text-navy">{(v as number).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-[11px] text-muted">Last 30 days, audiences you can see.</p>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between text-xs text-muted"><span>Daily sends · last 14 days</span><span className="font-semibold text-navy">peak {maxDay === 1 && sent14 === 0 ? 0 : maxDay}</span></div>
                <div className="flex h-44 items-end gap-1.5" role="img" aria-label="Daily emails sent over the last 14 days">
                  {days.map((x, i) => {
                    const isToday = x.d === today;
                    const h = x.n ? Math.max(6, (x.n / maxDay) * 100) : 2;
                    return (
                      <div key={x.d} className="group relative flex h-full flex-1 flex-col justify-end">
                        <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-xl bg-navy px-2.5 py-1.5 text-[11px] text-white opacity-0 shadow-lift transition group-hover:opacity-100">
                          <div className="font-semibold">{fmtLocal(x.d, { year: false })}</div>{x.n.toLocaleString()} sent
                        </div>
                        <div
                          style={{ height: `${h}%`, animationDelay: `${i * 35}ms` }}
                          className={cn("origin-bottom animate-grow rounded-t-xl rounded-b-md transition group-hover:opacity-80", isToday ? "bg-brand" : x.n ? "hatch bg-navy" : "bg-line")}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-muted"><span>{fmtLocal(days[0].d, { year: false })}</span><span>Today</span></div>
              </div>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Recommendations */}
            <section className="card p-6">
              <h2 className="flex items-center gap-2.5 text-[15px] font-bold text-navy"><span className="grid h-8 w-8 place-items-center rounded-full bg-brand-50 text-brand"><Lightbulb className="h-4 w-4" /></span> Recommendations</h2>
              {recs.length === 0 ? <Empty title="You're all caught up" /> : (
                <ul className="mt-4 space-y-2">
                  {recs.slice(0, 5).map((r, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 rounded-2xl bg-canvas/70 p-3 text-sm transition hover:bg-canvas">
                      <span className="text-ink/90">{r.text}</span>
                      <Link href={r.href} className="shrink-0 rounded-full bg-navy px-3 py-1 text-xs font-semibold text-white transition hover:bg-brand">{r.cta}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Assistant */}
            <section className="hatch relative overflow-hidden rounded-3xl bg-navy p-6 text-white shadow-lift">
              <div className="absolute -bottom-16 -right-10 h-48 w-48 animate-drift rounded-full bg-brand/30 blur-3xl" />
              <div className="relative">
                <h2 className="flex items-center gap-2.5 text-[15px] font-bold"><span className="grid h-8 w-8 place-items-center rounded-full bg-white/10"><Sparkles className="h-4 w-4 text-brand-300" /></span> Engage assistant</h2>
                <form action="/assistant" className="mt-4 flex gap-2 rounded-full bg-white/10 p-1.5 ring-1 ring-white/10 focus-within:ring-white/30">
                  <input name="q" className="min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-white/40" placeholder="Ask about contacts, occasions, broadcasts…" />
                  <button className="rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-white transition hover:bg-brand-600">Ask</button>
                </form>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {["Staff birthdays this month", "Which campaigns are scheduled for December?", "Prepare a Happy New Month email for all customers"].map((q) => (
                    <Link key={q} href={`/assistant?q=${encodeURIComponent(q)}`} className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-white/70 ring-1 ring-white/10 transition hover:bg-white hover:text-navy">{q}</Link>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-white/45">It prepares drafts and shortcuts. It never sends or approves anything by itself.</p>
              </div>
            </section>
          </div>

          {/* Activity: who did what */}
          <section className="card p-6">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2.5 text-[15px] font-bold text-navy"><span className="grid h-8 w-8 place-items-center rounded-full bg-canvas"><Users className="h-4 w-4" /></span> Team activity</h2>
              {can(user.role, "audit:read") && <Link href="/settings/audit" className="chip transition hover:bg-navy hover:text-white">Full audit log <ArrowUpRight className="h-3 w-3" /></Link>}
            </div>
            {recent.length === 0 ? <Empty title="No activity yet" /> : (
              <ol className="relative mt-4 space-y-1 before:absolute before:bottom-3 before:left-[19px] before:top-3 before:w-px before:bg-line">
                {recent.map((a) => {
                  const who = a.user?.name ?? "System";
                  const ini = who.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
                  return (
                    <li key={a.id} className="relative flex items-start gap-3 rounded-2xl p-1.5 transition hover:bg-canvas/60">
                      <span className={cn("relative z-10 grid h-[26px] w-[26px] shrink-0 translate-x-[0.4rem] place-items-center rounded-full text-[9px] font-bold ring-4 ring-white", a.user ? "bg-navy text-white" : "bg-canvas text-muted")}>{ini}</span>
                      <div className="ml-1 min-w-0 flex-1 text-sm">
                        <span className="font-bold text-navy">{who}</span> <span className="text-muted">·</span> <span className="text-ink">{describeAction(a.action)}</span>
                        {a.detail && <div className="truncate text-xs text-muted">{a.detail}</div>}
                      </div>
                      <time className="shrink-0 pt-0.5 text-[11px] text-muted">{fmtDateTime(a.createdAt)}</time>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        {/* Right rail */}
        <div className="space-y-4">
          <section className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-navy">{MONTHS[cm - 1]} {cy}</h2>
              <div className="flex gap-1">
                <Link href={`/?m=${prevM}`} scroll={false} className="grid h-8 w-8 place-items-center rounded-full border border-line transition hover:bg-navy hover:text-white" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Link>
                <Link href={`/?m=${nextM}`} scroll={false} className="grid h-8 w-8 place-items-center rounded-full border border-line transition hover:bg-navy hover:text-white" aria-label="Next month"><ChevronRight className="h-4 w-4" /></Link>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-7 gap-1 text-center">
              {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => <div key={d} className="pb-1 text-[11px] font-semibold text-muted">{d}</div>)}
              {cells.map((d, i) => {
                if (!d) return <div key={i} />;
                const count = marked.get(d) ?? 0;
                const isToday = d === today;
                return (
                  <Link
                    key={d}
                    href="/calendar"
                    title={count ? `${count} occasion${count > 1 ? "s" : ""}` : undefined}
                    className={cn(
                      "relative mx-auto grid aspect-square w-full max-w-[40px] place-items-center rounded-full text-[13px] font-medium transition hover:scale-110",
                      isToday ? "bg-brand font-bold text-white shadow-glow" : count ? "bg-navy text-white" : "border border-line text-ink hover:border-navy",
                    )}
                  >
                    {Number(d.slice(8))}
                    {count > 1 && !isToday && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand ring-2 ring-white" />}
                  </Link>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-4 text-[11px] text-muted">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand" /> Today</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-navy" /> Occasion</span>
            </div>
          </section>

          <section className="card p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-bold text-navy">Next 14 days</h2>
              <Link href="/calendar" className="chip transition hover:bg-navy hover:text-white">Calendar <ArrowUpRight className="h-3 w-3" /></Link>
            </div>
            {rows.length === 0 ? <Empty icon={CalendarPlus} title="Nothing in the next two weeks" /> : (
              <ul className="mt-4 space-y-2">
                {rows.slice(0, 7).map((r, i) => {
                  const cs = campaignFor(r);
                  const href = cs[0] ? `/campaigns/${cs[0].id}` : r.automationId ? `/automations/${r.automationId}` : r.eventId ? `/calendar/${r.eventId}` : "/calendar";
                  const dd = daysBetween(today, r.date);
                  return (
                    <li key={i}>
                      <Link href={href} className="group flex items-center gap-3 rounded-2xl border border-line p-3 transition hover:-translate-y-px hover:border-navy hover:shadow-card">
                        <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-center leading-none", dd === 0 ? "bg-brand text-white" : "bg-canvas text-navy")}>
                          <div><div className="text-[15px] font-extrabold">{Number(r.date.slice(8))}</div><div className="mt-0.5 text-[9px] font-semibold uppercase">{MONTHS[Number(r.date.slice(5, 7)) - 1].slice(0, 3)}</div></div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-navy">{r.title}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-semibold text-muted">{AUDIENCE_LABEL[r.audience as keyof typeof AUDIENCE_LABEL]}</span>
                            {r.provisional && <Badge tone="warn">Provisional</Badge>}
                            {cs.length ? cs.map((c) => <Badge key={c.id} tone={STATUS_TONE[c.status]}>{titleCase(c.status)}</Badge>) : <span className="text-[10px] text-muted">{dd === 0 ? "Today" : `in ${dd} day${dd > 1 ? "s" : ""}`}</span>}
                          </div>
                        </div>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted transition group-hover:rotate-45 group-hover:text-brand" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-[15px] font-bold text-navy"><Cpu className="h-4 w-4" /> Broadcast engine</h2>
            <div className="mt-4 space-y-2.5 text-sm">
              <div className="flex items-center justify-between"><span className="text-muted">Provider</span>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold", mode === "ses" ? "bg-emerald-50 text-ok" : "bg-amber-50 text-warn")}>
                  <span className="relative flex h-1.5 w-1.5"><span className={cn("absolute inset-0 animate-ping2 rounded-full", mode === "ses" ? "bg-ok" : "bg-warn")} /><span className={cn("relative h-1.5 w-1.5 rounded-full", mode === "ses" ? "bg-ok" : "bg-warn")} /></span>
                  {mode === "ses" ? "Amazon SES · live" : "Simulation"}
                </span>
              </div>
              <div className="flex justify-between"><span className="text-muted">Last run</span><span className="font-medium">{last?.at ? fmtDateTime(new Date(last.at)) : "Never"}</span></div>
            </div>
            {can(user.role, "engine:run") && <div className="mt-4"><ActionButton action={runEngineNow} className="btn-navy w-full">Run engine now</ActionButton></div>}
            {!last?.at && <p className="mt-3 flex gap-2 text-xs text-warn"><AlertTriangle className="h-4 w-4 shrink-0" />The scheduled job hasn&apos;t run yet. It runs daily via Vercel Cron.</p>}
          </section>

          <section className="card p-5">
            <h2 className="text-[15px] font-bold text-navy">Quick actions</h2>
            <div className="mt-4 grid grid-cols-2 gap-2 text-[13px]">
              {([
                ["/contacts/new?category=STAFF", "Add staff", Users],
                ["/contacts/new?category=CUSTOMER", "Add customer", Briefcase],
                ["/campaigns/new", "New broadcast", Megaphone],
                ["/templates/new", "New template", LayoutTemplate],
                ["/calendar?new=1", "Add occasion", CalendarPlus],
                ["/contacts/import", "Import list", BookUser],
              ] as const).map(([href, label, I]) => (
                <Link key={href} href={href} className="group flex items-center gap-2 rounded-2xl border border-line px-3 py-2.5 font-semibold text-navy transition hover:-translate-y-px hover:border-navy hover:bg-navy hover:text-white">
                  <I className="h-4 w-4 text-brand transition group-hover:text-brand-300" />{label}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function describeAction(a: string) {
  const map: Record<string, string> = {
    "auth.login": "signed in", "auth.logout": "signed out", "auth.setup": "set up the platform", "auth.login_failed": "failed sign-in attempt", "contact.created": "created a contact", "contact.updated": "updated a contact",
    "contact.deactivated": "deactivated a contact", "contact.reactivated": "reactivated a contact", "contact.imported": "imported contacts", "template.updated": "updated a template", "template.created": "created a template",
    "campaign.created": "created a campaign", "campaign.approved": "approved a campaign", "campaign.rejected": "rejected a campaign", "campaign.submitted": "submitted a campaign for approval",
    "campaign.completed": "campaign completed", "campaign.cancelled": "cancelled a campaign", "campaign.paused": "paused a campaign", "automation.planned": "automation prepared a campaign",
    "automation.updated": "updated an automation", "engine.run": "ran the engine", "email.bounced": "email bounced", "test.sent": "sent a test email",
    "user.created": "created a user", "user.updated": "updated a user", "user.permissions_changed": "changed user permissions", "user.password_changed": "changed their password",
  };
  return map[a] ?? titleCase(a.replace(".", " ")).toLowerCase();
}
