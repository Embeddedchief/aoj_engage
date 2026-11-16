import Link from "next/link";
import { Sparkles } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { STATUS_TONE } from "@/lib/constants";
import { visibleAudiences, visibleCategories } from "@/lib/queries";
import { birthdayInYear, daysBetween, fmtDateTime, fmtLocal, lagosInstant, MONTHS, parseLocal, todayLocal, toLocalDate } from "@/lib/time";
import { titleCase } from "@/lib/utils";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Communication assistant" };

/**
 * A deterministic command interpreter. It answers questions from live data and prepares
 * pre-filled drafts. It never sends, schedules or approves anything by itself.
 */
export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const q = ((await searchParams).q ?? "").trim();
  const t = q.toLowerCase();
  const today = todayLocal();
  const { year, month } = parseLocal(today);
  const auds = visibleAudiences(user.role);
  const cats = visibleCategories(user.role);
  let answer: React.ReactNode = null;

  const monthIdx = MONTHS.findIndex((m) => t.includes(m.toLowerCase()));
  const wantsStaff = /\bstaff|employee/.test(t), wantsCustomers = /customer|client/.test(t);

  if (!q) {
    answer = null;
  } else if (/birthday/.test(t) && /(show|list|who|which|birthdays)/.test(t) && !/prepare|create|send/.test(t)) {
    const nextWeek = /next week|7 days|this week/.test(t);
    const m = monthIdx >= 0 ? monthIdx + 1 : month;
    const internal = ["STAFF", "MANAGEMENT", "CONTRACTOR"] as const;
    const people = await prisma.contact.findMany({
      where: { status: "ACTIVE", birthMonth: nextWeek ? { not: null } : m, birthdayCommsAllowed: true, category: { in: cats.filter((c) => (wantsCustomers ? !internal.includes(c as never) : wantsStaff ? internal.includes(c as never) : true)) } },
      orderBy: [{ birthMonth: "asc" }, { birthDay: "asc" }],
    });
    const list = people.map((p) => ({ p, d: [birthdayInYear(year, p.birthMonth!, p.birthDay!), birthdayInYear(year + 1, p.birthMonth!, p.birthDay!)].find((x) => x >= today)! }))
      .filter((x) => !nextWeek || daysBetween(today, x.d) <= 7);
    answer = (
      <Card title={`${wantsCustomers ? "Customer" : wantsStaff ? "Staff" : "Contact"} birthdays ${nextWeek ? "in the next 7 days" : `in ${MONTHS[m - 1]}`} (${list.length})`} bodyClass="p-0">
        {list.length === 0 ? <p className="p-5 text-sm text-muted">No birthdays found.</p> : <ul className="divide-y divide-line">{list.map(({ p }) => <li key={p.id} className="flex justify-between px-5 py-2.5 text-sm"><Link className="link" href={`/contacts/${p.id}`}>{p.firstName} {p.lastName}</Link><span className="text-muted">{p.birthDay} {MONTHS[p.birthMonth! - 1]}</span></li>)}</ul>}
        <p className="border-t border-line px-5 py-2 text-xs text-muted">Birthday greetings are prepared automatically by the birthday automations. Review them in Campaigns.</p>
      </Card>
    );
  } else if (/(scheduled|upcoming|planned)/.test(t) && /campaign|email|message/.test(t)) {
    const m = monthIdx >= 0 ? monthIdx + 1 : null;
    const y = m && m < month ? year + 1 : year;
    const range = m ? { gte: lagosInstant(toLocalDate(y, m, 1), "00:00"), lt: lagosInstant(m === 12 ? toLocalDate(y + 1, 1, 1) : toLocalDate(y, m + 1, 1), "00:00") } : { gte: new Date() };
    const list = await prisma.campaign.findMany({ where: { audience: { in: auds }, scheduledAt: range, status: { notIn: ["CANCELLED"] } }, orderBy: { scheduledAt: "asc" }, take: 50 });
    answer = (
      <Card title={`Campaigns scheduled ${m ? `for ${MONTHS[m - 1]} ${y}` : "from now"} (${list.length})`} bodyClass="p-0">
        {list.length === 0 ? <p className="p-5 text-sm text-muted">Nothing scheduled yet. Automated campaigns are prepared a few days before each occasion.</p> : <ul className="divide-y divide-line">{list.map((c) => <li key={c.id} className="flex justify-between gap-3 px-5 py-2.5 text-sm"><span><Link className="link" href={`/campaigns/${c.id}`}>{c.name}</Link><span className="block text-xs text-muted">{fmtDateTime(c.scheduledAt)}</span></span><Badge tone={STATUS_TONE[c.status]}>{titleCase(c.status)}</Badge></li>)}</ul>}
      </Card>
    );
  } else if (/(not received|haven't received|have not received|without).*(appreciation|email)/.test(t) || /appreciation.*recently/.test(t)) {
    const since = new Date(Date.now() - 90 * 86400_000);
    const customers = await prisma.contact.findMany({
      where: { status: "ACTIVE", category: { in: ["CUSTOMER"] }, NOT: { recipients: { some: { status: { in: ["ACCEPTED", "DELIVERED"] }, sentAt: { gte: since }, campaign: { templateVersion: { template: { category: "Appreciation" } } } } } } },
      take: 100, orderBy: { organisation: "asc" },
    });
    const tpl = await prisma.template.findFirst({ where: { key: "customer-appreciation" } });
    answer = (
      <Card title={`Customers with no appreciation email in the last 90 days (${customers.length})`} actions={tpl && can(user.role, "campaigns:write") && <Link className="btn-primary px-3 py-1 text-xs" href={`/campaigns/new?template=${tpl.id}&audience=EXTERNAL&name=Customer%20Appreciation`}>Prepare appreciation campaign</Link>} bodyClass="p-0">
        <ul className="divide-y divide-line">{customers.map((c) => <li key={c.id} className="px-5 py-2.5 text-sm"><Link className="link" href={`/contacts/${c.id}`}>{c.firstName} {c.lastName}</Link> <span className="text-muted">· {c.organisation}</span></li>)}</ul>
      </Card>
    );
  } else if (/prepare|create|draft|send|make/.test(t)) {
    const templates = await prisma.template.findMany({ where: { active: true, audience: { in: auds } } });
    const words = t.replace(/['’]/g, "").split(/\W+/).filter((w) => w.length > 3 && !["prepare", "create", "email", "using", "campaign", "greeting", "greetings", "existing", "template", "draft", "with", "from", "send", "make", "customers", "customer", "staff", "happy"].includes(w));
    const score = (name: string) => words.filter((w) => name.toLowerCase().replace(/['’]/g, "").includes(w)).length + (wantsCustomers && /customer/i.test(name) ? 0.5 : 0) + (wantsStaff && /staff/i.test(name) ? 0.5 : 0);
    const best = templates.map((x) => ({ x, s: score(x.name) })).filter((r) => r.s > 0.5).sort((a, b) => b.s - a.s)[0]?.x;
    const segName = wantsCustomers && /all customers/.test(t) ? "All Customers" : wantsStaff ? "All Active Staff" : wantsCustomers ? "All Customers" : null;
    const seg = segName ? await prisma.segment.findUnique({ where: { name: segName } }) : null;
    const audience = best?.audience !== "BOTH" ? best?.audience : wantsCustomers && !wantsStaff ? "EXTERNAL" : wantsStaff && !wantsCustomers ? "INTERNAL" : "BOTH";
    const params = new URLSearchParams({ ...(best ? { template: best.id } : {}), ...(seg && (audience === seg.audience) ? { segment: seg.id } : {}), ...(audience ? { audience } : {}), name: q.replace(/^(please\s+)?(prepare|create|draft|make)\s+(an?\s+)?/i, "").replace(/^\w/, (c) => c.toUpperCase()).slice(0, 80) });
    answer = best ? (
      <Card title="Draft ready to review">
        <p className="text-sm">I matched the template <Link className="link" href={`/templates/${best.id}`}>{best.name}</Link>{seg && audience === seg.audience ? <> and the segment <strong>{seg.name}</strong></> : null}. Open the pre-filled campaign to check recipients, preview, test and submit for approval.</p>
        {can(user.role, "campaigns:write") ? <Link className="btn-primary mt-4" href={`/campaigns/new?${params}`}>Open pre-filled campaign</Link> : <p className="mt-3 text-sm text-warn">Your role cannot create campaigns.</p>}
      </Card>
    ) : <Notice tone="warn">I couldn&apos;t find a matching active template. Try naming the occasion (e.g. “Independence Day”, “New Month”, “Christmas”) or <Link className="link" href="/templates">browse templates</Link>.</Notice>;
  } else if (/approval|pending/.test(t)) {
    const list = await prisma.campaign.findMany({ where: { status: "AWAITING_APPROVAL", audience: { in: auds } }, orderBy: { scheduledAt: "asc" } });
    answer = <Card title={`Awaiting approval (${list.length})`} bodyClass="p-0"><ul className="divide-y divide-line">{list.map((c) => <li key={c.id} className="px-5 py-2.5 text-sm"><Link className="link" href={`/campaigns/${c.id}`}>{c.name}</Link> <span className="text-muted">· {fmtDateTime(c.scheduledAt)}</span></li>)}</ul></Card>;
  } else {
    answer = <Notice>I can answer questions about birthdays, scheduled campaigns, approvals and customer engagement, and prepare campaign drafts. Try one of the examples below, or use <Link className="link" href={`/search?q=${encodeURIComponent(q)}`}>search</Link>.</Notice>;
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Communication assistant" description={`Ask about your communications, or describe one to prepare. Today is ${fmtLocal(today, { weekday: true })}.`} />
      <form className="mb-6 flex gap-2">
        <div className="relative flex-1"><Sparkles className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-brand" /><input name="q" defaultValue={q} className="input pl-9" placeholder="e.g. Prepare an Independence Day campaign" autoFocus /></div>
        <button className="btn-navy">Ask</button>
      </form>
      {answer}
      <div className="mt-6 flex flex-wrap gap-1.5">
        {["Prepare a Happy New Month email for all customers", "Show me staff birthdays this month", "Which campaigns are scheduled for December?", "Create a Christmas greeting using our existing customer template", "Show me customers who have not received an appreciation email recently", "Prepare an Independence Day campaign", "Pending approvals"].map((s) => (
          <Link key={s} href={`/assistant?q=${encodeURIComponent(s)}`} className="rounded-full border border-line bg-white px-2.5 py-1 text-xs text-muted hover:border-brand hover:text-brand">{s}</Link>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">The assistant prepares drafts and shortcuts only. It never sends, schedules or approves a message, and every draft goes through the normal approval workflow.</p>
    </div>
  );
}
