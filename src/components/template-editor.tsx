"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Audience } from "@prisma/client";
import { ArrowDown, ArrowUp, Copy, GripVertical, Loader2, Monitor, Plus, Send, Smartphone, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { BLOCK_LABELS, bid, newBlock, type BlockType, type EmailBlock } from "@/lib/blocks";
import { analysePlaceholders, blockTexts, contactFlags, contactVars, findInvalidLinks, PLACEHOLDERS, CONDITION_FLAGS, renderEmail, type Brand } from "@/lib/email/render";
import { aiDraft, restoreVersion, saveTemplateVersion, sendTest } from "@/actions/templates";
import { ActionButton } from "./forms";
import { cn } from "@/lib/utils";

type PreviewContact = { id: string; firstName: string; lastName: string; preferredName: string | null; organisation: string | null; department: string | null; jobTitle: string | null; category: string };
type Version = { version: number; note: string | null; createdBy: string | null; createdAt: string; subject: string };

const SAMPLE_STAFF: PreviewContact = { id: "", firstName: "John", lastName: "Ade", preferredName: null, organisation: "AOJ Global Concept Limited", department: "Engineering", jobTitle: "Mechanical Engineer", category: "STAFF" };
const SAMPLE_CUSTOMER: PreviewContact = { id: "", firstName: "Kelechi", lastName: "Nwosu", preferredName: null, organisation: "ABC Ltd", department: null, jobTitle: "Facilities Manager", category: "CUSTOMER" };

export function TemplateEditor(props: {
  template: { id: string; name: string; category: string; audience: Audience; active: boolean; currentVersion: number };
  initial: { subject: string; preheader: string; blocks: EmailBlock[] };
  versions: Version[];
  contacts: PreviewContact[];
  brand: Brand;
  senders: { id: string; name: string; email: string }[];
  media: { name: string; url: string; kind: string }[];
  canEdit: boolean;
  userEmail: string;
}) {
  const { template, brand, canEdit } = props;
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [category, setCategory] = useState(template.category);
  const [subject, setSubject] = useState(props.initial.subject);
  const [preheader, setPreheader] = useState(props.initial.preheader);
  const [blocks, setBlocks] = useState<EmailBlock[]>(props.initial.blocks);
  const [selected, setSelected] = useState<string | null>(props.initial.blocks[0]?.id ?? null);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [contactId, setContactId] = useState<string>("");
  const [sampleKind, setSampleKind] = useState<"staff" | "customer">(template.audience === "EXTERNAL" ? "customer" : "staff");
  const [eventName, setEventName] = useState("Christmas");
  const [note, setNote] = useState("");
  const [testTo, setTestTo] = useState(props.userEmail);
  const [sender, setSender] = useState(props.senders[0]?.id ?? "communications");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [brief, setBrief] = useState("");
  const [tone, setTone] = useState("Warm and friendly");
  const [pending, start] = useTransition();
  const lastField = useRef<{ el: HTMLInputElement | HTMLTextAreaElement; apply: (v: string) => void } | null>(null);
  const dragFrom = useRef<number | null>(null);

  const contact = props.contacts.find((c) => c.id === contactId) ?? (sampleKind === "staff" ? SAMPLE_STAFF : SAMPLE_CUSTOMER);
  const vars = useMemo(() => contactVars(contact, { brand, senderName: props.senders.find((s) => s.id === sender)?.name ?? brand.companyName, eventName, eventDate: "25 Dec 2026", yearsOfService: 5, projectName: "Lekki Towers MEP Installation" }), [contact, brand, sender, eventName, props.senders]);
  const flags = useMemo(() => contactFlags(contact.category, 5), [contact]);
  const rendered = useMemo(() => renderEmail({ subject, preheader, blocks, vars, flags, brand, unsubscribeUrl: template.audience !== "INTERNAL" && !flags.staff ? "#unsubscribe" : null }), [subject, preheader, blocks, vars, flags, brand, template.audience]);
  const issues = useMemo(() => ({ ...analysePlaceholders(blockTexts(blocks, subject, preheader), vars, flags), links: findInvalidLinks(blocks, vars, flags) }), [blocks, subject, preheader, vars, flags]);

  const update = (id: string, patch: Partial<EmailBlock>) => { setBlocks((bs) => bs.map((b) => (b.id === id ? ({ ...b, ...patch } as EmailBlock) : b))); setDirty(true); };
  const move = (i: number, d: number) => { setBlocks((bs) => { const n = [...bs]; const j = i + d; if (j < 0 || j >= n.length) return bs; [n[i], n[j]] = [n[j], n[i]]; return n; }); setDirty(true); };
  const add = (t: BlockType) => { const b = newBlock(t); const idx = blocks.findIndex((x) => x.id === selected); setBlocks((bs) => { const n = [...bs]; n.splice(idx >= 0 ? idx + 1 : n.length, 0, b); return n; }); setSelected(b.id); setDirty(true); };
  const remove = (id: string) => { setBlocks((bs) => bs.filter((b) => b.id !== id)); setDirty(true); };
  const dup = (b: EmailBlock) => { const c = { ...b, id: bid() }; setBlocks((bs) => { const n = [...bs]; n.splice(bs.indexOf(b) + 1, 0, c); return n; }); setDirty(true); };

  function insertToken(token: string) {
    const f = lastField.current;
    if (!f) return setMsg({ ok: false, text: "Click into a text field first, then insert a variable." });
    const { el } = f;
    const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? el.value.length;
    f.apply(el.value.slice(0, s) + token + el.value.slice(e));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + token.length, s + token.length); });
  }
  const track = (apply: (v: string) => void) => ({ onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => (lastField.current = { el: e.currentTarget, apply }) });

  function save() {
    setMsg(null);
    start(async () => {
      const r = await saveTemplateVersion({ templateId: template.id, name, category, subject, preheader, blocks, note });
      setMsg({ ok: r.ok, text: (r.ok ? r.message : r.error) ?? "" });
      if (r.ok) { setDirty(false); setNote(""); router.refresh(); }
    });
  }
  function test() {
    setMsg(null);
    start(async () => {
      const r = await sendTest({ to: testTo, subject, preheader, blocks, contactId: contactId || undefined, senderId: sender, audience: template.audience, eventName });
      setMsg({ ok: r.ok, text: (r.ok ? r.message : r.error) ?? "" });
    });
  }
  function generate() {
    setMsg(null);
    start(async () => {
      const r = await aiDraft({ brief, tone, audience: template.audience });
      if (!r.ok) return setMsg({ ok: false, text: r.error ?? "AI error" });
      const d = r.data as { subject: string; preheader?: string; heading?: string; paragraphs: string[]; closing?: string; cta?: { label: string; url: string } | null };
      const keep = (t: BlockType) => blocks.find((b) => b.type === t);
      const next: EmailBlock[] = [keep("logo") ?? newBlock("logo")];
      const banner = keep("banner");
      if (banner) next.push(banner);
      if (d.heading) next.push({ id: bid(), type: "heading", text: d.heading });
      next.push({ id: bid(), type: "paragraph", text: d.paragraphs.join("\n\n") });
      if (d.cta?.label) next.push({ id: bid(), type: "button", label: d.cta.label, url: d.cta.url || "{{company_website}}" });
      if (d.closing) next.push({ id: bid(), type: "signature", text: d.closing });
      next.push(newBlock("divider"), newBlock("contact"));
      setSubject(d.subject); setPreheader(d.preheader ?? ""); setBlocks(next); setNote("AI-assisted draft — reviewed"); setDirty(true); setAiOpen(false);
      setMsg({ ok: true, text: r.message ?? "Draft inserted." });
    });
  }

  const sel = blocks.find((b) => b.id === selected);

  return (
    <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ── Editor column ── */}
      <div className="space-y-4">
        <div className="card grid gap-3 p-4 md:grid-cols-2">
          <label><span className="label">Template name</span><input className="input" value={name} disabled={!canEdit} onChange={(e) => { setName(e.target.value); setDirty(true); }} /></label>
          <label><span className="label">Category</span><input className="input" value={category} disabled={!canEdit} onChange={(e) => { setCategory(e.target.value); setDirty(true); }} /></label>
          <label className="md:col-span-2"><span className="label">Subject line</span><input className="input" value={subject} disabled={!canEdit} onChange={(e) => { setSubject(e.target.value); setDirty(true); }} {...track((v) => { setSubject(v); setDirty(true); })} /></label>
          <label className="md:col-span-2"><span className="label">Preview text (preheader)</span><input className="input" value={preheader} disabled={!canEdit} onChange={(e) => { setPreheader(e.target.value); setDirty(true); }} {...track((v) => { setPreheader(v); setDirty(true); })} /></label>
        </div>

        {canEdit && (
          <div className="card p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="label mb-0">Insert variable</span>
              <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setAiOpen((o) => !o)}><Sparkles className="h-3.5 w-3.5 text-brand" /> AI writing assistant</button>
            </div>
            <div className="flex flex-wrap gap-1">
              {PLACEHOLDERS.map((p) => <button key={p.key} type="button" title={p.description} onClick={() => insertToken(`{{${p.key}}}`)} className="rounded-md border border-line bg-canvas px-1.5 py-0.5 font-mono text-[11px] text-navy hover:border-brand">{`{{${p.key}}}`}</button>)}
              <button type="button" title="Conditional content" onClick={() => insertToken("{{#if staff}}Thank you for your contribution to our team's success.{{else}}We look forward to supporting your next project.{{/if}}")} className="rounded-md border border-brand-200 bg-brand-50 px-1.5 py-0.5 font-mono text-[11px] text-brand-700">{"{{#if staff}}…{{else}}…{{/if}}"}</button>
            </div>
            <p className="mt-2 text-[11px] text-muted">Conditions: {CONDITION_FLAGS.join(", ")}. &nbsp;Use **double asterisks** for bold. A blank line starts a new paragraph.</p>
            {aiOpen && (
              <div className="mt-3 space-y-2 rounded-lg border border-brand-100 bg-brand-50/50 p-3">
                <textarea className="input min-h-20" value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. Write a professional Happy New Month email for AOJ customers. Make it warm, appreciative and subtly remind them of our MEP services." />
                <div className="flex flex-wrap items-center gap-2">
                  <select className="input w-auto" value={tone} onChange={(e) => setTone(e.target.value)}>{["Professional", "Warm and friendly", "Appreciative", "Motivational", "Corporate formal", "Festive", "Short and concise"].map((t) => <option key={t}>{t}</option>)}</select>
                  <button type="button" className="btn-primary" disabled={pending} onClick={generate}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Generate draft</button>
                </div>
                <p className="text-[11px] text-muted">The draft replaces the body below. The AI is instructed never to invent achievements, customers or project details. Review before saving.</p>
              </div>
            )}
          </div>
        )}

        <div className="card divide-y divide-line">
          {blocks.map((b, i) => (
            <div
              key={b.id}
              draggable={canEdit}
              onDragStart={() => (dragFrom.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { const f = dragFrom.current; if (f === null || f === i) return; setBlocks((bs) => { const n = [...bs]; const [m] = n.splice(f, 1); n.splice(i, 0, m); return n; }); setDirty(true); dragFrom.current = null; }}
              className={cn("group", selected === b.id && "bg-brand-50/30")}
            >
              <div className="flex cursor-pointer items-center gap-2 px-3 py-2" onClick={() => setSelected(selected === b.id ? null : b.id)}>
                {canEdit && <GripVertical className="h-4 w-4 cursor-grab text-navy-300" aria-hidden />}
                <span className="text-xs font-semibold uppercase tracking-wide text-navy">{BLOCK_LABELS[b.type]}</span>
                <span className="flex-1 truncate text-xs text-muted">{"text" in b ? b.text?.split("\n")[0] : b.type === "banner" ? b.title : b.type === "button" ? b.label : ""}</span>
                {canEdit && (
                  <span className="flex opacity-60 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn-ghost p-1" onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" className="btn-ghost p-1" onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></button>
                    <button type="button" className="btn-ghost p-1" onClick={() => dup(b)} aria-label="Duplicate"><Copy className="h-3.5 w-3.5" /></button>
                    <button type="button" className="btn-ghost p-1 hover:text-bad" onClick={() => remove(b.id)} aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                  </span>
                )}
              </div>
              {selected === b.id && sel && <div className="space-y-2 px-3 pb-3"><BlockFields b={sel} update={update} track={track} disabled={!canEdit} media={props.media} /></div>}
            </div>
          ))}
          {canEdit && (
            <div className="flex flex-wrap items-center gap-1 p-3">
              <Plus className="mr-1 h-4 w-4 text-muted" />
              {(Object.keys(BLOCK_LABELS) as BlockType[]).map((t) => <button type="button" key={t} onClick={() => add(t)} className="rounded-md border border-line px-2 py-1 text-xs hover:border-brand hover:text-brand">{BLOCK_LABELS[t]}</button>)}
            </div>
          )}
        </div>

        {canEdit && (
          <div className="card space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <input className="input flex-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Change note (optional), e.g. Updated Christmas wording for 2026" />
              <button type="button" className="btn-primary" disabled={pending || !dirty} onClick={save}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} Save as v{template.currentVersion + 1}</button>
            </div>
            {dirty && <p className="text-xs text-warn">Unsaved changes.</p>}
          </div>
        )}
        {msg && <div className={cn("rounded-lg px-3 py-2 text-sm", msg.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900")}>{msg.text}</div>}

        <div className="card p-4">
          <div className="label">Version history</div>
          <ul className="max-h-64 divide-y divide-line overflow-y-auto text-sm">
            {props.versions.map((v) => (
              <li key={v.version} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0"><span className="font-semibold text-navy">v{v.version}</span>{v.version === template.currentVersion && <span className="ml-2 text-xs text-ok">current</span>}<div className="truncate text-xs text-muted">{v.note ?? v.subject} · {v.createdBy ?? "System"} · {new Date(v.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</div></div>
                {canEdit && v.version !== template.currentVersion && <ActionButton action={restoreVersion} fields={{ templateId: template.id, version: String(v.version) }} className="btn-ghost px-2 py-1 text-xs" confirm={`Restore v${v.version} as a new version?`}>Restore</ActionButton>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ── Preview column ── */}
      <div className="space-y-4 2xl:sticky 2xl:top-20 2xl:self-start">
        <div className="card flex flex-wrap items-center gap-2 p-3">
          <div className="flex rounded-lg border border-line p-0.5">
            <button type="button" onClick={() => setDevice("desktop")} className={cn("rounded-md px-2.5 py-1 text-xs", device === "desktop" ? "bg-navy text-white" : "text-muted")}><Monitor className="inline h-3.5 w-3.5" /> Desktop</button>
            <button type="button" onClick={() => setDevice("mobile")} className={cn("rounded-md px-2.5 py-1 text-xs", device === "mobile" ? "bg-navy text-white" : "text-muted")}><Smartphone className="inline h-3.5 w-3.5" /> Mobile</button>
          </div>
          <select className="input w-auto flex-1 py-1.5 text-xs" value={contactId} onChange={(e) => setContactId(e.target.value)} aria-label="Preview as">
            <option value="">Preview as sample {sampleKind === "staff" ? "staff (John Ade)" : "customer (Kelechi Nwosu)"}</option>
            {props.contacts.map((c) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName} — {c.category.toLowerCase().replace("_", " ")}</option>)}
          </select>
          {!contactId && template.audience === "BOTH" && <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setSampleKind((k) => (k === "staff" ? "customer" : "staff"))}>Switch to {sampleKind === "staff" ? "customer" : "staff"}</button>}
          <input className="input w-36 py-1.5 text-xs" value={eventName} onChange={(e) => setEventName(e.target.value)} aria-label="Sample event name" title="Sample {{event_name}}" />
        </div>
        {(issues.missing.length > 0 || issues.unknown.length > 0 || issues.links.length > 0) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="mb-1 flex items-center gap-1.5 font-semibold"><TriangleAlert className="h-4 w-4" /> Check before sending</div>
            {issues.missing.length > 0 && <div>No value for this recipient: {issues.missing.map((m) => `{{${m}}}`).join(", ")}</div>}
            {issues.unknown.length > 0 && <div>Unknown variables: {issues.unknown.map((m) => `{{${m}}}`).join(", ")}</div>}
            {issues.links.length > 0 && <div>Invalid links: {issues.links.join("; ")}</div>}
          </div>
        )}
        <div className="card overflow-hidden">
          <div className="border-b border-line bg-canvas/60 px-4 py-2 text-xs">
            <div><span className="text-muted">From:</span> {props.senders.find((s) => s.id === sender)?.name}</div>
            <div className="truncate"><span className="text-muted">Subject:</span> <strong>{rendered.subject}</strong></div>
          </div>
          <div className="flex justify-center bg-[#F4F2EE] p-3">
            <iframe title="Email preview" sandbox="" srcDoc={rendered.html} className="rounded-md bg-white transition-all" style={{ width: device === "desktop" ? "100%" : 375, maxWidth: 680, height: 760, border: device === "mobile" ? "8px solid #15171E" : "none", borderRadius: device === "mobile" ? 24 : 6 }} />
          </div>
        </div>
        <div className="card flex flex-wrap items-center gap-2 p-3">
          <select className="input w-auto py-1.5 text-xs" value={sender} onChange={(e) => setSender(e.target.value)} aria-label="Sender identity">{props.senders.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <input className="input flex-1 py-1.5 text-xs" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} aria-label="Test recipient" />
          <button type="button" className="btn-secondary py-1.5 text-xs" disabled={pending} onClick={test}><Send className="h-3.5 w-3.5" /> Send test</button>
        </div>
      </div>
    </div>
  );
}

type Track = (apply: (v: string) => void) => { onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void };

function BlockFields({ b, update, track, disabled, media }: { b: EmailBlock; update: (id: string, p: Partial<EmailBlock>) => void; track: Track; disabled: boolean; media: { name: string; url: string; kind: string }[] }) {
  const text = (key: string, value: string | undefined, label: string, multiline = false) => {
    const apply = (v: string) => update(b.id, { [key]: v } as Partial<EmailBlock>);
    const common = { value: value ?? "", disabled, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => apply(e.target.value), ...track(apply) };
    return <label className="block"><span className="label">{label}</span>{multiline ? <textarea className="input min-h-36 font-[inherit]" {...common} /> : <input className="input" {...common} />}</label>;
  };
  const mediaPicker = (key: string) => media.length > 0 && !disabled && (
    <select className="input mt-1 text-xs" value="" onChange={(e) => e.target.value && update(b.id, { [key]: e.target.value } as Partial<EmailBlock>)}>
      <option value="">Choose from media library…</option>
      {media.map((m) => <option key={m.url} value={m.url}>{m.kind}: {m.name}</option>)}
    </select>
  );
  switch (b.type) {
    case "logo": return <p className="text-xs text-muted">Shows the AOJ Global logo from Settings → Branding.</p>;
    case "contact": return <p className="text-xs text-muted">Company address, phone, email and website from Settings → Branding.</p>;
    case "social": return <p className="text-xs text-muted">Social links from Settings → Branding.</p>;
    case "divider": return <p className="text-xs text-muted">A thin separator line.</p>;
    case "heading": return text("text", b.text, "Heading");
    case "paragraph": return text("text", b.text, "Message", true);
    case "signature": return text("text", b.text, "Signature", true);
    case "footer": return text("text", b.text, "Footer note");
    case "button": return <div className="grid gap-2 md:grid-cols-2">{text("label", b.label, "Button label")}{text("url", b.url, "Link URL")}</div>;
    case "image": return <div className="space-y-2">{text("url", b.url, "Image URL (https://…)")}{mediaPicker("url")}{text("alt", b.alt, "Alt text")}</div>;
    case "banner": return (
      <div className="space-y-2">
        {text("title", b.title, "Banner title")}
        {text("subtitle", b.subtitle, "Subtitle")}
        <label className="block"><span className="label">Style</span><select className="input" value={b.tone ?? "brand"} disabled={disabled} onChange={(e) => update(b.id, { tone: e.target.value } as Partial<EmailBlock>)}><option value="brand">AOJ orange</option><option value="navy">Deep navy</option><option value="festive">Festive red & gold</option><option value="soft">Soft</option></select></label>
        {text("imageUrl", b.imageUrl, "Banner image URL (optional)")}
        {mediaPicker("imageUrl")}
      </div>
    );
  }
}
