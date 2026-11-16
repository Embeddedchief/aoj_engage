import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { occurrencesBetween, type Occurrence } from "@/lib/calendar";
import { addDays, daysInMonth, fmtLocal, MONTHS, parseLocal, todayLocal, toLocalDate, weekdayOf, WEEKDAYS } from "@/lib/time";
import { AUDIENCE_LABEL } from "@/lib/constants";
import { visibleAudiences } from "@/lib/queries";
import { cn, titleCase } from "@/lib/utils";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { createEvent } from "@/actions/calendar";

export const metadata = { title: "Corporate calendar" };

const KIND_STYLE: Record<string, string> = {
  PUBLIC_HOLIDAY: "bg-brand-50 text-brand-700 border-brand-100",
  RELIGIOUS: "bg-violet-50 text-violet-800 border-violet-100",
  INTERNATIONAL: "bg-sky-50 text-sky-800 border-sky-100",
  COMPANY: "bg-navy-50 text-navy border-navy-100",
  RECURRING: "bg-emerald-50 text-emerald-800 border-emerald-100",
  PERSONAL: "bg-amber-50 text-amber-900 border-amber-100",
};

function hrefFor(o: Occurrence) {
  if (o.eventId) return `/calendar/${o.eventId}`;
  if (o.automationId) return `/automations/${o.automationId}`;
  if (o.contactId) return `/contacts/${o.contactId}`;
  return "/calendar";
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayLocal();
  const view = sp.view === "week" || sp.view === "list" ? sp.view : "month";
  const anchor = sp.d && /^\d{4}-\d{2}-\d{2}$/.test(sp.d) ? sp.d : today;
  const { year, month } = parseLocal(anchor);
  const auds = visibleAudiences(user.role);

  let from: string, to: string;
  if (view === "month") { from = toLocalDate(year, month, 1); to = toLocalDate(year, month, daysInMonth(year, month)); }
  else if (view === "week") { from = addDays(anchor, 1 - weekdayOf(anchor)); to = addDays(from, 6); }
  else { from = sp.past ? addDays(today, -90) : today; to = sp.past ? addDays(today, -1) : addDays(today, 90); }

  // Grid needs padding days around the month.
  const gridFrom = view === "month" ? addDays(from, 1 - weekdayOf(from)) : from;
  const gridTo = view === "month" ? addDays(to, 7 - weekdayOf(to)) : to;
  let occ = (await occurrencesBetween(gridFrom, gridTo, { includeInactive: sp.inactive === "1", includeExternalPeople: auds.includes("EXTERNAL") })).filter((o) => auds.includes(o.audience) || o.audience === "BOTH" && auds.includes("INTERNAL"));
  if (sp.audience) occ = occ.filter((o) => o.audience === sp.audience || (o.audience === "BOTH" && sp.audience !== "BOTH"));
  if (sp.type) occ = occ.filter((o) => o.category === sp.type);
  if (sp.auto === "automated") occ = occ.filter((o) => o.automated || o.kind === "birthday" || o.kind === "anniversary");
  if (sp.past && view === "list") occ = occ.reverse();

  const qs = (o: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ view, d: anchor, audience: sp.audience, type: sp.type, auto: sp.auto, inactive: sp.inactive, ...o }).filter(([, v]) => v) as [string, string][]).toString();
  const prev = view === "month" ? toLocalDate(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1, 1) : addDays(anchor, -7);
  const next = view === "month" ? toLocalDate(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1, 1) : addDays(anchor, 7);
  const byDay = new Map<string, Occurrence[]>();
  for (const o of occ) byDay.set(o.date, [...(byDay.get(o.date) ?? []), o]);
  const days: string[] = [];
  for (let d = gridFrom; d <= gridTo; d = addDays(d, 1)) days.push(d);

  return (
    <>
      <PageHeader
        title="Corporate calendar"
        description="Nigerian public holidays, religious and international occasions, company dates, recurring communications, birthdays and work anniversaries, all in one place."
        actions={can(user.role, "calendar:write") && <Link href={qs({ new: "1" })} className="btn-primary"><Plus className="h-4 w-4" /> Add occasion</Link>}
      />

      {sp.new && can(user.role, "calendar:write") && (
        <Card title="Add a company occasion" className="mb-6">
          <ActionForm action={createEvent} className="grid gap-4 md:grid-cols-3">
            <label><span className="label">Name *</span><input className="input" name="name" required placeholder="e.g. AOJ Global Anniversary" /></label>
            <label><span className="label">Date *</span><input className="input" type="date" name="date" required /></label>
            <label><span className="label">Repeats</span><select className="input" name="recurrence"><option value="yearly">Every year</option><option value="once">One time only</option></select></label>
            <label><span className="label">Type</span><select className="input" name="category"><option value="COMPANY">Company occasion</option><option value="INTERNATIONAL">International observance</option><option value="PUBLIC_HOLIDAY">Public holiday</option></select></label>
            <label><span className="label">Audience</span><select className="input" name="audience">{(["BOTH", "INTERNAL", "EXTERNAL"] as const).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}</select></label>
            <label><span className="label">Reminder days before</span><input className="input" name="reminderDays" defaultValue="14, 7, 3, 1" /></label>
            <label className="md:col-span-3"><span className="label">Description</span><input className="input" name="description" /></label>
            <div className="flex justify-end gap-2 md:col-span-3"><Link href={qs({ new: undefined })} className="btn-ghost">Cancel</Link><Submit>Add occasion</Submit></div>
          </ActionForm>
        </Card>
      )}

      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="flex rounded-lg border border-line p-0.5 text-sm">
          {(["month", "week", "list"] as const).map((v) => <Link key={v} href={qs({ view: v, past: undefined })} className={cn("rounded-md px-3 py-1 capitalize", view === v ? "bg-navy text-white" : "text-muted hover:text-ink")}>{v === "list" ? "Upcoming" : v}</Link>)}
          {view === "list" && <Link href={qs({ past: sp.past ? undefined : "1" })} className={cn("rounded-md px-3 py-1", sp.past ? "bg-navy text-white" : "text-muted")}>Past</Link>}
        </div>
        {view !== "list" && (
          <div className="flex items-center gap-1">
            <Link href={qs({ d: prev })} className="btn-ghost px-2" aria-label="Previous"><ChevronLeft className="h-4 w-4" /></Link>
            <span className="min-w-40 text-center font-semibold text-navy">{view === "month" ? `${MONTHS[month - 1]} ${year}` : `${fmtLocal(from, { year: false })} – ${fmtLocal(to)}`}</span>
            <Link href={qs({ d: next })} className="btn-ghost px-2" aria-label="Next"><ChevronRight className="h-4 w-4" /></Link>
            <Link href={qs({ d: today })} className="btn-secondary ml-1 px-2.5 py-1 text-xs">Today</Link>
          </div>
        )}
        <form className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          <input type="hidden" name="view" value={view} /><input type="hidden" name="d" value={anchor} />
          <select name="audience" defaultValue={sp.audience ?? ""} className="input w-auto py-1.5"><option value="">All audiences</option><option value="INTERNAL">Staff</option><option value="EXTERNAL">External</option><option value="BOTH">Staff + External</option></select>
          <select name="type" defaultValue={sp.type ?? ""} className="input w-auto py-1.5"><option value="">All types</option>{Object.keys(KIND_STYLE).map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}</select>
          <select name="auto" defaultValue={sp.auto ?? ""} className="input w-auto py-1.5"><option value="">Any automation</option><option value="automated">Automated only</option></select>
          <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" name="inactive" value="1" defaultChecked={sp.inactive === "1"} className="accent-brand" /> Inactive</label>
          <button className="btn-navy py-1.5">Apply</button>
        </form>
      </div>

      {view === "list" ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Date</th><th>Occasion</th><th>Type</th><th>Audience</th><th /></tr></thead>
            <tbody>
              {occ.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-muted">Nothing in this period.</td></tr>}
              {occ.map((o, i) => (
                <tr key={i} className={!o.active ? "opacity-50" : ""}>
                  <td className="whitespace-nowrap font-medium text-navy">{fmtLocal(o.date, { weekday: true })}</td>
                  <td>{o.title} {o.provisional && <Badge tone="warn">Provisional</Badge>} {!o.active && <Badge>Inactive</Badge>}</td>
                  <td><span className={cn("rounded border px-1.5 py-0.5 text-xs", KIND_STYLE[o.category])}>{titleCase(o.category)}</span></td>
                  <td className="text-muted">{AUDIENCE_LABEL[o.audience]}</td>
                  <td className="text-right"><Link className="link text-xs" href={hrefFor(o)}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-7 border-b border-line bg-canvas/60 text-center text-xs font-semibold uppercase tracking-wide text-muted">
            {WEEKDAYS.map((d) => <div key={d} className="py-2"><span className="hidden sm:inline">{d.slice(0, 3)}</span><span className="sm:hidden">{d[0]}</span></div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const items = byDay.get(d) ?? [];
              const out = view === "month" && parseLocal(d).month !== month;
              return (
                <div key={d} className={cn("border-b border-r border-line/70 p-1.5", view === "week" ? "min-h-64" : "min-h-28", out && "bg-canvas/50")}>
                  <div className={cn("mb-1 text-right text-xs", d === today ? "font-bold text-brand" : out ? "text-muted/50" : "text-muted")}>
                    {d === today ? <span className="rounded-full bg-brand px-1.5 py-0.5 text-white">{parseLocal(d).day}</span> : parseLocal(d).day}
                  </div>
                  <div className="space-y-1">
                    {items.slice(0, view === "week" ? 20 : 4).map((o, i) => (
                      <Link key={i} href={hrefFor(o)} title={`${o.title} · ${AUDIENCE_LABEL[o.audience]}${o.provisional ? " · provisional" : ""}`} className={cn("block truncate rounded border px-1.5 py-0.5 text-[11px] leading-tight", KIND_STYLE[o.category], !o.active && "opacity-50", o.provisional && "border-dashed")}>
                        {o.title}
                      </Link>
                    ))}
                    {items.length > (view === "week" ? 20 : 4) && <Link href={qs({ view: "week", d })} className="block text-[11px] text-muted hover:text-brand">+{items.length - 4} more</Link>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
        {Object.keys(KIND_STYLE).map((k) => <span key={k} className="flex items-center gap-1.5"><span className={cn("h-3 w-3 rounded border", KIND_STYLE[k])} />{titleCase(k)}</span>)}
        <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-dashed border-navy-300" />Provisional date</span>
      </div>
    </>
  );
}
