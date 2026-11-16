import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Pencil } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, canWorkWithAudience } from "@/lib/permissions";
import { AUDIENCE_LABEL, CATEGORY_LABEL, STATUS_TONE } from "@/lib/constants";
import { automationOccurrences } from "@/lib/engine";
import { triggerText } from "@/lib/automation-text";
import { getSettings, senderFor } from "@/lib/settings";
import { addDays, fmtDateTime, fmtLocal, todayLocal } from "@/lib/time";
import { titleCase } from "@/lib/utils";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { duplicateAutomation, saveAutomation, setAutomationStatus } from "@/actions/automations";
import { AutomationBuilder } from "@/components/automation-builder";

export const metadata = { title: "Automation" };

export default async function AutomationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ eventId?: string; created?: string }> }) {
  const user = await requirePermission("automations:read");
  const { id } = await params;
  const sp = await searchParams;
  const canWrite = can(user.role, "automations:write");
  const [templates, events, segments, settings] = await Promise.all([
    prisma.template.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, audience: true } }),
    prisma.calendarEvent.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.segment.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, audience: true } }),
    getSettings(),
  ]);

  if (id === "new") {
    if (!canWrite) notFound();
    return (
      <div className="max-w-4xl">
        <PageHeader title="New automation" back={{ href: "/automations", label: "Automation Centre" }} description="Define the trigger, the conditions recipients must meet, and the action to take. New automations start paused so you can review them first." />
        <AutomationBuilder action={saveAutomation} templates={templates} events={events} segments={segments} senders={settings.senders} values={{ eventId: sp.eventId, trigger: sp.eventId ? "CALENDAR_EVENT" : "WEEKLY" }} />
      </div>
    );
  }

  const a = await prisma.automation.findUnique({
    where: { id },
    include: { template: true, event: { include: { dates: true } }, runs: { orderBy: { createdAt: "desc" }, take: 50, include: { campaign: { select: { id: true, name: true, status: true } } } } },
  });
  if (!a || !canWorkWithAudience(user.role, a.audience === "BOTH" ? "INTERNAL" : a.audience)) notFound();
  const seg = a.segmentId ? segments.find((s) => s.id === a.segmentId) : null;
  const today = todayLocal();
  const nexts = automationOccurrences(a, today, addDays(today, 400)).slice(0, 5);
  const failures = a.runs.filter((r) => r.status === "FAILED");

  return (
    <>
      <PageHeader
        title={a.name}
        back={{ href: "/automations", label: "Automation Centre" }}
        description={<span className="flex items-center gap-2"><Badge tone={a.status === "ACTIVE" ? "ok" : a.status === "PAUSED" ? "warn" : "neutral"}>{titleCase(a.status)}</Badge>{a.description}</span>}
        actions={canWrite && (
          <>
            <Link href={`/automations/${a.id}/edit`} className="btn-secondary"><Pencil className="h-4 w-4" /> Edit</Link>
            <ActionButton action={duplicateAutomation} fields={{ id: a.id }}>Duplicate</ActionButton>
            {a.status !== "ACTIVE" && <ActionButton action={setAutomationStatus} fields={{ id: a.id, status: "ACTIVE" }} className="btn-primary">Enable</ActionButton>}
            {a.status === "ACTIVE" && <ActionButton action={setAutomationStatus} fields={{ id: a.id, status: "PAUSED" }}>Pause</ActionButton>}
            {a.status !== "DISABLED" && <ActionButton action={setAutomationStatus} fields={{ id: a.id, status: "DISABLED" }} className="btn-danger">Disable</ActionButton>}
          </>
        )}
      />
      {sp.created && <div className="mb-5"><Notice tone="ok">Automation created in a paused state. Review it, then enable it.</Notice></div>}
      {!a.template.active && <div className="mb-5"><Notice tone="bad">The template “{a.template.name}” is inactive, so this automation will not prepare campaigns until it is reactivated.</Notice></div>}

      <div className="mb-6 grid items-stretch gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <Flow step="Trigger" tone="bg-navy text-white">{triggerText(a, a.event)}{a.event && <div className="mt-1 text-xs opacity-80"><Link href={`/calendar/${a.event.id}`} className="underline">View occasion</Link></div>}</Flow>
        <ArrowRight className="hidden h-5 w-5 self-center text-muted lg:block" />
        <Flow step="Conditions" tone="bg-white">
          <ul className="space-y-1 text-sm">
            <li>Audience: {AUDIENCE_LABEL[a.audience]}</li>
            <li>Categories: {a.categories.length ? a.categories.map((c) => CATEGORY_LABEL[c]).join(", ") : "All in audience"}</li>
            {seg && <li>Segment: {seg.name}</li>}
            <li>Contact status is Active</li>
            {a.isMarketing && <li>External contacts: marketing consent granted</li>}
            {a.trigger === "CALENDAR_EVENT" && <li>Occasion date officially confirmed</li>}
            <li>Not suppressed (bounce / complaint / unsubscribe)</li>
            {a.trigger === "WEEKLY" && a.audience !== "INTERNAL" && <li>Within frequency limit ({settings.limits.routinePerWeek}/week)</li>}
          </ul>
        </Flow>
        <ArrowRight className="hidden h-5 w-5 self-center text-muted lg:block" />
        <Flow step="Actions" tone="bg-brand-50">
          <ul className="space-y-1 text-sm">
            <li>Template: <Link className="link" href={`/templates/${a.templateId}`}>{a.template.name}</Link> (current version at preparation)</li>
            <li>Personalise per recipient</li>
            <li>Prepare {a.leadDays} day(s) ahead · send at {a.sendTime}</li>
            <li>From: {senderFor(settings, a.senderIdentity).name}</li>
            <li>{a.requiresApproval ? "Submit for management approval" : "Schedule (pre-approved by policy)"}</li>
          </ul>
        </Flow>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.5fr]">
        <div className="space-y-6">
          <Card title="Next executions">
            {a.status !== "ACTIVE" && <p className="mb-2 text-xs text-warn">This automation is {a.status.toLowerCase()}, so nothing will run.</p>}
            {nexts.length === 0 ? <p className="text-sm text-muted">No upcoming occurrences. For movable occasions, add the year&apos;s date in the calendar.</p> : (
              <ul className="space-y-1.5 text-sm">{nexts.map((o) => <li key={o.key} className="flex justify-between">{fmtLocal(o.date, { weekday: true })} · {a.sendTime}{!o.confirmed && <Badge tone="warn">Awaiting confirmation</Badge>}</li>)}</ul>
            )}
          </Card>
          <Card title={`Failures (${failures.length})`}>
            {failures.length === 0 ? <p className="text-sm text-muted">No failed executions.</p> : <ul className="space-y-2 text-sm">{failures.map((r) => <li key={r.id}><span className="font-medium">{r.occurrenceKey}</span> <span className="text-bad">{r.message}</span></li>)}</ul>}
          </Card>
        </div>
        <Card title="Execution history" bodyClass="p-0">
          {a.runs.length === 0 ? <p className="p-5 text-sm text-muted">This automation has not executed yet.</p> : (
            <table className="table">
              <thead><tr><th>Occurrence</th><th>Result</th><th>Campaign</th><th className="text-right">Recipients</th><th>Recorded</th></tr></thead>
              <tbody>
                {a.runs.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.occurrenceKey}</td>
                    <td><Badge tone={r.status === "CREATED" ? "ok" : r.status === "FAILED" ? "bad" : "neutral"}>{titleCase(r.status)}</Badge><div className="text-xs text-muted">{r.message}</div></td>
                    <td>{r.campaign ? <><Link className="link" href={`/campaigns/${r.campaign.id}`}>{r.campaign.name}</Link> <Badge tone={STATUS_TONE[r.campaign.status]}>{titleCase(r.campaign.status)}</Badge></> : "—"}</td>
                    <td className="text-right tabular-nums">{r.recipients}</td>
                    <td className="whitespace-nowrap text-xs text-muted">{fmtDateTime(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  );
}

function Flow({ step, tone, children }: { step: string; tone: string; children: React.ReactNode }) {
  return (
    <div className={`card p-4 ${tone}`}>
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] opacity-70">{step}</div>
      {children}
    </div>
  );
}
