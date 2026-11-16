"use client";

import { useMemo, useState } from "react";
import type { Audience, CampaignType, ContactCategory } from "@prisma/client";
import { ActionForm, Submit } from "./forms";
import { AUDIENCE_LABEL, CATEGORY_LABEL, EXTERNAL_CATEGORIES, INTERNAL_CATEGORIES } from "@/lib/constants";
import type { ActionResult } from "@/lib/action";

type Opt = { id: string; name: string };
export type CampaignFormValues = {
  id?: string; name?: string; type?: CampaignType; audience?: Audience; templateId?: string; segmentId?: string | null; categories?: ContactCategory[];
  contactIds?: string[]; senderIdentity?: string; scheduledAt?: string; eventName?: string | null; eventDate?: string | null; isMarketing?: boolean; templateVersion?: number; latestVersion?: number;
};

const TYPES: { v: CampaignType; label: string; hint: string }[] = [
  { v: "ONE_TIME", label: "One-time", hint: "A single communication" },
  { v: "ANNOUNCEMENT", label: "Announcement", hint: "Company / internal notice, always approved" },
  { v: "EVENT", label: "Occasion greeting", hint: "Festive or national occasion" },
  { v: "RELATIONSHIP", label: "Customer relationship", hint: "Routine greeting, subject to frequency limits" },
  { v: "RECURRING", label: "Monthly greeting", hint: "New month or monthly appreciation" },
  { v: "PROJECT", label: "Project communication", hint: "Milestone / completion: operational, not marketing" },
  { v: "BIRTHDAY", label: "Birthday", hint: "Individual birthday greeting" },
];

export function CampaignForm(props: {
  action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>;
  values?: CampaignFormValues;
  audiences: Audience[];
  templates: (Opt & { audience: Audience; version: number })[];
  segments: (Opt & { audience: Audience })[];
  contacts: (Opt & { email: string; category: ContactCategory })[];
  senders: { id: string; name: string; email: string }[];
  submitLabel: string;
  editing?: boolean;
}) {
  const v = props.values ?? {};
  const [audience, setAudience] = useState<Audience>(v.audience ?? props.audiences[0]);
  const [type, setType] = useState<CampaignType>(v.type ?? "ONE_TIME");
  const [mode, setMode] = useState<"keep" | "segment" | "categories" | "contacts">(props.editing ? "keep" : v.contactIds?.length ? "contacts" : v.segmentId ? "segment" : "categories");
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<string[]>(v.contactIds ?? []);
  const cats = audience === "INTERNAL" ? INTERNAL_CATEGORIES : audience === "EXTERNAL" ? EXTERNAL_CATEGORIES : [...INTERNAL_CATEGORIES, ...EXTERNAL_CATEGORIES];
  const templates = props.templates.filter((t) => t.audience === audience || t.audience === "BOTH");
  const segments = props.segments.filter((s) => s.audience === audience || audience === "BOTH");
  const contacts = useMemo(() => props.contacts.filter((c) => cats.includes(c.category) && (!filter || `${c.name} ${c.email}`.toLowerCase().includes(filter.toLowerCase()))).slice(0, 200), [props.contacts, cats, filter]);
  const marketingDefault = v.isMarketing ?? (["RELATIONSHIP", "RECURRING", "EVENT", "BIRTHDAY"].includes(type) && audience !== "INTERNAL");

  return (
    <ActionForm action={props.action} className="space-y-5">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      {props.editing && <input type="hidden" name="audience" value={audience} />}
      <Step n={1} title="Name & type">
        <div className="grid gap-4 md:grid-cols-2">
          <label><span className="label">Campaign name *</span><input className="input" name="name" defaultValue={v.name} required placeholder="e.g. Happy New Month – December 2026" /></label>
          <label><span className="label">Communication type</span>
            <select className="input" name="type" value={type} onChange={(e) => setType(e.target.value as CampaignType)} disabled={props.editing}>{TYPES.map((t) => <option key={t.v} value={t.v}>{t.label} — {t.hint}</option>)}</select>
            {props.editing && <input type="hidden" name="type" value={type} />}
          </label>
        </div>
      </Step>

      <Step n={2} title="Audience">
        <div className="flex flex-wrap gap-2">
          {props.audiences.map((a) => (
            <label key={a} className={`cursor-pointer rounded-lg border px-4 py-2 text-sm ${audience === a ? "border-brand bg-brand-50 font-semibold text-brand-700" : "border-line"} ${props.editing ? "pointer-events-none opacity-70" : ""}`}>
              <input type="radio" name={props.editing ? "_aud" : "audience"} value={a} checked={audience === a} onChange={() => setAudience(a)} className="sr-only" />{AUDIENCE_LABEL[a]}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Internal and external communications are kept separate: staff and customers never share default campaign rules.</p>
      </Step>

      <Step n={3} title="Template">
        <select className="input" name="templateId" defaultValue={v.templateId ?? ""} required>
          <option value="" disabled>Choose a template…</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name} (v{t.version})</option>)}
        </select>
        {props.editing && v.templateVersion !== undefined && v.latestVersion !== undefined && v.templateVersion !== v.latestVersion && (
          <label className="mt-2 flex items-center gap-2 text-sm text-warn"><input type="checkbox" name="useLatestVersion" className="accent-brand" /> This campaign uses v{v.templateVersion}. Switch to the latest v{v.latestVersion} (requires re-approval).</label>
        )}
      </Step>

      <Step n={4} title="Recipients">
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          {((props.editing ? ["keep", "segment", "categories", "contacts"] : ["segment", "categories", "contacts"]) as (typeof mode)[]).map((m) => (
            <button type="button" key={m} onClick={() => setMode(m)} className={`rounded-full px-3 py-1 ${mode === m ? "bg-navy text-white" : "bg-canvas text-muted"}`}>{m === "keep" ? "Keep current list" : m === "segment" ? "Saved segment" : m === "categories" ? "By category" : "Specific contacts"}</button>
          ))}
        </div>
        {mode === "keep" && <><input type="hidden" name="keepRecipients" value="1" /><input type="hidden" name="segmentId" value={v.segmentId ?? ""} /><p className="text-sm text-muted">The recipient list stays as it is.</p></>}
        {mode === "segment" && (
          <select className="input" name="segmentId" defaultValue={v.segmentId ?? ""} required>
            <option value="" disabled>Choose a segment…</option>
            {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {mode === "categories" && (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {cats.map((c) => <label key={c} className="flex items-center gap-2 text-sm"><input type="checkbox" name="categories" value={c} defaultChecked={v.categories?.includes(c) ?? ["STAFF", "MANAGEMENT", "CUSTOMER"].includes(c)} className="h-4 w-4 accent-brand" />{CATEGORY_LABEL[c]}</label>)}
          </div>
        )}
        {mode === "contacts" && (
          <div>
            <input className="input mb-2" placeholder="Filter contacts…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <div className="max-h-60 overflow-y-auto rounded-lg border border-line p-2">
              {contacts.map((c) => (
                <label key={c.id} className="flex items-center gap-2 py-1 text-sm">
                  <input type="checkbox" name="contactIds" value={c.id} checked={picked.includes(c.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))} className="h-4 w-4 accent-brand" />
                  {c.name} <span className="text-xs text-muted">{c.email}</span>
                </label>
              ))}
              {picked.filter((id) => !contacts.some((c) => c.id === id)).map((id) => <input key={id} type="hidden" name="contactIds" value={id} />)}
            </div>
            <p className="mt-1 text-xs text-muted">{picked.length} selected</p>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">Only active contacts are included. Suppressed, invalid and non-consenting addresses are shown in the recipient preview and skipped at send time.</p>
      </Step>

      <Step n={5} title="Personalisation & schedule">
        <div className="grid gap-4 md:grid-cols-3">
          <label><span className="label">Occasion name ({"{{event_name}}"})</span><input className="input" name="eventName" defaultValue={v.eventName ?? ""} placeholder="e.g. Christmas" /></label>
          <label><span className="label">Occasion date ({"{{event_date}}"})</span><input className="input" type="date" name="eventDate" defaultValue={v.eventDate ?? ""} /></label>
          <label><span className="label">Send at (Africa/Lagos)</span><input className="input" type="datetime-local" name="scheduledAt" defaultValue={v.scheduledAt ?? ""} /></label>
          <label><span className="label">Sender identity</span><select className="input" name="senderIdentity" defaultValue={v.senderIdentity ?? (audience === "INTERNAL" ? "hr" : "customers")}>{props.senders.map((s) => <option key={s.id} value={s.id}>{s.name} &lt;{s.email}&gt;</option>)}</select></label>
          <label className="md:col-span-2"><span className="label">Classification</span>
            <select className="input" name="classification" key={`${type}-${audience}`} defaultValue={marketingDefault ? "marketing" : "operational"}>
              <option value="marketing">Direct marketing / relationship: external contacts need recorded consent, unsubscribe link added</option>
              <option value="operational">Operational / contractual / internal: no marketing consent required</option>
            </select>
          </label>
        </div>
      </Step>

      <div className="flex justify-end"><Submit>{props.submitLabel}</Submit></div>
    </ActionForm>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-navy"><span className="grid h-6 w-6 place-items-center rounded-full bg-navy text-xs text-white">{n}</span>{title}</h2>
      {children}
    </section>
  );
}
