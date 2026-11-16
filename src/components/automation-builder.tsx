"use client";

import { useState } from "react";
import type { Audience, ContactCategory, TriggerType } from "@prisma/client";
import { ActionForm, Submit } from "./forms";
import { AUDIENCE_LABEL, CATEGORY_LABEL, EXTERNAL_CATEGORIES, INTERNAL_CATEGORIES } from "@/lib/constants";
import { WEEKDAYS } from "@/lib/time";
import type { ActionResult } from "@/lib/action";

export type AutomationValues = {
  id?: string; name?: string; description?: string | null; trigger?: TriggerType; weekday?: number | null; dayOfMonth?: number | null; sendTime?: string; eventId?: string | null;
  audience?: Audience; categories?: ContactCategory[]; segmentId?: string | null; templateId?: string; senderIdentity?: string; isMarketing?: boolean; requiresApproval?: boolean; leadDays?: number;
};

const TRIGGERS: { v: TriggerType; label: string; kind: string }[] = [
  { v: "WEEKLY", label: "Every week", kind: "Time-based" },
  { v: "MONTHLY", label: "Every month", kind: "Time-based" },
  { v: "CALENDAR_EVENT", label: "Calendar occasion", kind: "Time-based" },
  { v: "BIRTHDAY", label: "Contact birthday", kind: "Event-based" },
  { v: "WORK_ANNIVERSARY", label: "Employment anniversary", kind: "Event-based" },
  { v: "RELATIONSHIP_ANNIVERSARY", label: "Customer relationship anniversary", kind: "Event-based" },
];

export function AutomationBuilder(props: {
  action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  values?: AutomationValues;
  templates: { id: string; name: string; audience: Audience }[];
  events: { id: string; name: string }[];
  segments: { id: string; name: string; audience: Audience }[];
  senders: { id: string; name: string }[];
}) {
  const v = props.values ?? {};
  const [trigger, setTrigger] = useState<TriggerType>(v.trigger ?? "WEEKLY");
  const [audience, setAudience] = useState<Audience>(v.audience ?? "INTERNAL");
  const cats = audience === "INTERNAL" ? INTERNAL_CATEGORIES : audience === "EXTERNAL" ? EXTERNAL_CATEGORIES : [...INTERNAL_CATEGORIES, ...EXTERNAL_CATEGORIES];
  return (
    <ActionForm action={props.action} className="space-y-5">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <section className="card grid gap-4 p-5 md:grid-cols-2">
        <label><span className="label">Name *</span><input className="input" name="name" defaultValue={v.name} required /></label>
        <label><span className="label">Description</span><input className="input" name="description" defaultValue={v.description ?? ""} /></label>
      </section>

      <Section n="1" title="Trigger" tone="border-l-navy">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="md:col-span-3"><span className="label">When should this run?</span>
            <select className="input" name="trigger" value={trigger} onChange={(e) => setTrigger(e.target.value as TriggerType)}>
              {TRIGGERS.map((t) => <option key={t.v} value={t.v}>{t.kind}: {t.label}</option>)}
            </select>
          </label>
          {trigger === "WEEKLY" && <label><span className="label">Day of week</span><select className="input" name="weekday" defaultValue={v.weekday ?? 1}>{WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></label>}
          {trigger === "MONTHLY" && <label><span className="label">Day of month</span><input className="input" type="number" min={1} max={28} name="dayOfMonth" defaultValue={v.dayOfMonth ?? 1} /></label>}
          {trigger === "CALENDAR_EVENT" && <label className="md:col-span-2"><span className="label">Occasion</span><select className="input" name="eventId" defaultValue={v.eventId ?? ""} required><option value="" disabled>Choose…</option>{props.events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>}
          <label><span className="label">Send time (Africa/Lagos)</span><input className="input" type="time" name="sendTime" defaultValue={v.sendTime ?? "08:00"} /></label>
          <label><span className="label">Prepare campaign days ahead</span><input className="input" type="number" min={0} max={14} name="leadDays" defaultValue={v.leadDays ?? (trigger === "CALENDAR_EVENT" ? 7 : 1)} /></label>
        </div>
      </Section>

      <Section n="2" title="Conditions" tone="border-l-navy-300">
        <div className="grid gap-4 md:grid-cols-2">
          <label><span className="label">Audience</span><select className="input" name="audience" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>{(["INTERNAL", "EXTERNAL", "BOTH"] as const).map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}</select></label>
          <label><span className="label">Segment (optional)</span><select className="input" name="segmentId" defaultValue={v.segmentId ?? ""}><option value="">— None —</option>{props.segments.filter((s) => s.audience === audience || audience === "BOTH").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <fieldset className="md:col-span-2"><legend className="label">Contact categories</legend>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{cats.map((c) => <label key={c} className="flex items-center gap-2 text-sm"><input type="checkbox" name="categories" value={c} defaultChecked={v.categories?.includes(c)} className="h-4 w-4 accent-brand" />{CATEGORY_LABEL[c]}</label>)}</div>
          </fieldset>
          <p className="text-xs text-muted md:col-span-2">Always applied: contact is active, address not suppressed (bounced / complained / unsubscribed), occasion date officially confirmed, template active, and for marketing, external contacts have recorded consent.</p>
        </div>
      </Section>

      <Section n="3" title="Actions" tone="border-l-brand">
        <div className="grid gap-4 md:grid-cols-2">
          <label><span className="label">Template</span><select className="input" name="templateId" defaultValue={v.templateId ?? ""} required><option value="" disabled>Choose…</option>{props.templates.filter((t) => t.audience === audience || t.audience === "BOTH").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <label><span className="label">Sender identity</span><select className="input" name="senderIdentity" defaultValue={v.senderIdentity ?? "communications"}>{props.senders.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label><span className="label">Classification</span><select className="input" name="classification" defaultValue={v.isMarketing ?? audience !== "INTERNAL" ? "marketing" : "operational"}><option value="marketing">Marketing / relationship (consent required for external)</option><option value="operational">Operational / internal</option></select></label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="requiresApproval" defaultChecked={v.requiresApproval ?? trigger === "CALENDAR_EVENT"} className="h-4 w-4 accent-brand" /> Require management approval for each campaign</label>
        </div>
        <p className="mt-2 text-xs text-muted">Leave approval off only for routine, low-risk messages (e.g. staff birthdays). That is the controlled pre-approval policy.</p>
      </Section>
      <div className="flex justify-end"><Submit>Save automation</Submit></div>
    </ActionForm>
  );
}

function Section({ n, title, tone, children }: { n: string; title: string; tone: string; children: React.ReactNode }) {
  return (
    <section className={`card border-l-4 p-5 ${tone}`}>
      <h2 className="mb-4 text-sm font-semibold text-navy"><span className="mr-2 text-muted">{n}.</span>{title}</h2>
      {children}
    </section>
  );
}
