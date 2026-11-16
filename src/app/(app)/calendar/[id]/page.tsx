import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { eventDatesInRange } from "@/lib/calendar";
import { AUDIENCE_LABEL, STATUS_TONE } from "@/lib/constants";
import { addDays, easterSunday, fmtLocal, MONTHS, parseLocal, todayLocal } from "@/lib/time";
import { titleCase } from "@/lib/utils";
import { Badge, Card, KeyVal, Notice, PageHeader } from "@/components/ui";
import { ActionButton, ActionForm, Submit } from "@/components/forms";
import { deleteEvent, setEventDate, updateEvent } from "@/actions/calendar";

export const metadata = { title: "Occasion" };

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const ev = await prisma.calendarEvent.findUnique({
    where: { id },
    include: { dates: { orderBy: { year: "asc" } }, automations: { include: { template: true, campaigns: { orderBy: { scheduledAt: "desc" }, take: 5, select: { id: true, name: true, status: true } } } } },
  });
  if (!ev) notFound();
  const editable = can(user.role, "calendar:write");
  const today = todayLocal();
  const year = parseLocal(today).year;
  const upcoming = eventDatesInRange(ev, today, addDays(today, 730));
  const ruleText = ev.rule === "FIXED" ? `Every year on ${ev.day} ${MONTHS[(ev.month ?? 1) - 1]}` : ev.rule === "EASTER" ? `${ev.easterOffset === 0 ? "Easter Sunday" : `${Math.abs(ev.easterOffset ?? 0)} day(s) ${(ev.easterOffset ?? 0) < 0 ? "before" : "after"} Easter Sunday`} (computed)` : ev.rule === "MOVABLE" ? "Movable: date set per year, provisional until officially confirmed" : "One-time date";
  const needsDates = ev.rule === "MOVABLE" || ev.rule === "EASTER";

  return (
    <>
      <PageHeader title={ev.name} back={{ href: "/calendar", label: "Calendar" }} description={ev.description ?? undefined}
        actions={editable && !ev.key && <ActionButton action={deleteEvent} fields={{ id: ev.id }} className="btn-danger" confirm="Delete this occasion?">Delete</ActionButton>} />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <Card title="Details">
            <KeyVal items={[["Type", titleCase(ev.category)], ["Recurrence", ruleText], ["Audience", AUDIENCE_LABEL[ev.audience]], ["Status", ev.active ? <Badge key="a" tone="ok">Active</Badge> : <Badge key="i">Inactive</Badge>], ["Reminders", ev.reminderDays.length ? ev.reminderDays.map((d) => `${d} day${d > 1 ? "s" : ""}`).join(", ") + " before" : "None"], ["Next date", upcoming[0] ? `${fmtLocal(upcoming[0].date, { weekday: true })}${upcoming[0].confirmed || ev.rule === "FIXED" ? "" : " (provisional)"}` : "—"]]} />
          </Card>
          {editable && (
            <Card title="Edit occasion">
              <ActionForm action={updateEvent} className="grid gap-4 md:grid-cols-2">
                <input type="hidden" name="id" value={ev.id} />
                <label><span className="label">Name</span><input className="input" name="name" defaultValue={ev.name} /></label>
                <label><span className="label">Audience</span><select className="input" name="audience" defaultValue={ev.audience}>{(["BOTH", "INTERNAL", "EXTERNAL"] as const).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}</select></label>
                {ev.rule === "FIXED" && <label><span className="label">Month-day (MM-DD)</span><input className="input" name="monthDay" defaultValue={`${String(ev.month).padStart(2, "0")}-${String(ev.day).padStart(2, "0")}`} pattern="\d{2}-\d{2}" /></label>}
                <label><span className="label">Reminder days before</span><input className="input" name="reminderDays" defaultValue={ev.reminderDays.join(", ")} /></label>
                <label className="md:col-span-2"><span className="label">Description</span><input className="input" name="description" defaultValue={ev.description ?? ""} /></label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={ev.active} className="h-4 w-4 accent-brand" /> Active on the calendar</label>
                <div className="flex justify-end md:col-span-2"><Submit>Save</Submit></div>
              </ActionForm>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {needsDates && (
            <Card title="Official dates">
              <Notice tone="warn">Religious holiday dates are never sent automatically on a provisional date. Confirm each year&apos;s date against the Federal Government announcement. Linked automations will then prepare the campaign.</Notice>
              <table className="table mt-4">
                <thead><tr><th>Year</th><th>Date</th><th>Status</th><th>Source</th></tr></thead>
                <tbody>
                  {(ev.rule === "EASTER" ? [year, year + 1].map((y) => ev.dates.find((d) => d.year === y) ?? { id: `c${y}`, year: y, date: new Date(`${addDays(easterSunday(y), ev.easterOffset ?? 0)}T00:00:00Z`), confirmed: false, source: "Computed from Easter", confirmedBy: null }) : ev.dates).map((d) => (
                    <tr key={d.id}>
                      <td>{d.year}</td>
                      <td className="font-medium">{fmtLocal(d.date.toISOString().slice(0, 10), { weekday: true })}</td>
                      <td>{d.confirmed ? <Badge tone="ok">Confirmed</Badge> : <Badge tone="warn">Provisional</Badge>}</td>
                      <td className="text-xs text-muted">{d.source}{d.confirmedBy ? ` · ${d.confirmedBy}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {editable && (
                <ActionForm action={setEventDate} className="mt-4 grid gap-3 rounded-lg bg-canvas p-4 md:grid-cols-2">
                  <input type="hidden" name="eventId" value={ev.id} />
                  <label><span className="label">Date</span><input className="input" type="date" name="date" required defaultValue={upcoming[0]?.date} /></label>
                  <label><span className="label">Source of confirmation</span><input className="input" name="source" placeholder="e.g. FG declares Monday public holiday — Ministry of Interior" /></label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirmed" className="h-4 w-4 accent-brand" /> Officially confirmed</label>
                  <div className="flex justify-end"><Submit>Save date</Submit></div>
                </ActionForm>
              )}
            </Card>
          )}

          <Card title="Linked automations & campaigns" actions={can(user.role, "automations:write") && <Link href={`/automations/new?eventId=${ev.id}`} className="link text-xs">Add automation</Link>}>
            {ev.automations.length === 0 ? <p className="text-sm text-muted">No automation sends a message for this occasion yet.</p> : (
              <ul className="space-y-4">
                {ev.automations.map((a) => (
                  <li key={a.id} className="rounded-lg border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/automations/${a.id}`} className="link">{a.name}</Link>
                      <Badge tone={a.status === "ACTIVE" ? "ok" : "neutral"}>{titleCase(a.status)}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted">Template: <Link className="link" href={`/templates/${a.templateId}`}>{a.template.name}</Link> · {AUDIENCE_LABEL[a.audience]} · {a.sendTime} · {a.requiresApproval ? "Requires approval" : "Pre-approved"}</div>
                    {a.campaigns.length > 0 && <ul className="mt-2 space-y-1 text-xs">{a.campaigns.map((c) => <li key={c.id} className="flex justify-between"><Link className="link" href={`/campaigns/${c.id}`}>{c.name}</Link><Badge tone={STATUS_TONE[c.status]}>{titleCase(c.status)}</Badge></li>)}</ul>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
