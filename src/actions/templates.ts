"use server";
import type { Role } from "@prisma/client";

import type { Audience } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertPermission, assertUser, clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { run, str, type ActionResult } from "@/lib/action";
import { canWorkWithAudience } from "@/lib/permissions";
import { newBlock, type EmailBlock } from "@/lib/blocks";
import { getSettings } from "@/lib/settings";
import { renderForContact } from "@/lib/engine";
import { sendEmail } from "@/lib/email/provider";
import { isValidEmail, normEmail } from "@/lib/utils";

async function editableTemplate(id: string) {
  const u = await assertPermission("templates:write");
  const t = await prisma.template.findUniqueOrThrow({ where: { id } });
  if (!canWorkWithAudience(u.role, t.audience)) throw new Error("You cannot edit templates for this audience.");
  return { u, t };
}

const BLOCK_TYPES = new Set(["logo", "banner", "heading", "paragraph", "image", "button", "divider", "signature", "contact", "social", "footer"]);
function cleanBlocks(blocks: unknown): EmailBlock[] {
  if (!Array.isArray(blocks) || blocks.length > 60) throw new Error("Invalid template content.");
  return blocks.map((b) => {
    if (!b || typeof b !== "object" || !BLOCK_TYPES.has((b as EmailBlock).type)) throw new Error("Invalid block.");
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(b)) if (typeof v === "string") out[k] = v.slice(0, 10000);
    return out as EmailBlock;
  });
}

/** Admins and communications staff may send a [TEST] copy to any address (e.g. sales or marketing reviewers). */
const canTestAnyAddress = (role: Role) => role === "SUPER_ADMIN" || role === "COMMS_OFFICER" || role === "HR";

export async function createTemplate(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("templates:write");
    const audience = str(fd, "audience") as Audience;
    if (!canWorkWithAudience(u.role, audience)) throw new Error("You cannot create templates for this audience.");
    const name = str(fd, "name");
    if (!name) throw new Error("Enter a template name.");
    const blocks: EmailBlock[] = [newBlock("logo"), { ...newBlock("banner"), title: name } as EmailBlock, { ...newBlock("heading"), text: "Dear {{first_name}}," } as EmailBlock, newBlock("paragraph"), newBlock("signature"), newBlock("divider"), newBlock("contact")];
    const t = await prisma.template.create({
      data: {
        name, category: str(fd, "category") || "General", audience, department: str(fd, "department") || "Communications", createdBy: u.name, updatedBy: u.name,
        versions: { create: { version: 1, subject: name, preheader: "", blocks: blocks as object[], note: "Created", createdBy: u.name } },
      },
    });
    await audit(u.id, "template.created", "Template", t.id, name, await clientIp());
    return { ok: true, redirectTo: `/templates/${t.id}` };
  });
}

/** Saving never edits an existing version: it writes version N+1, so scheduled/approved campaigns keep their exact content. */
export async function saveTemplateVersion(input: { templateId: string; name: string; category: string; subject: string; preheader: string; blocks: EmailBlock[]; note: string }): Promise<ActionResult> {
  return run(async () => {
    const { u, t } = await editableTemplate(input.templateId);
    if (!input.subject.trim()) throw new Error("The subject line cannot be empty.");
    const blocks = cleanBlocks(input.blocks);
    const version = t.currentVersion + 1;
    await prisma.$transaction([
      prisma.templateVersion.create({ data: { templateId: t.id, version, subject: input.subject.replace(/[\r\n]+/g, " ").slice(0, 300), preheader: input.preheader.slice(0, 300), blocks: blocks as object[], note: input.note.slice(0, 300) || null, createdBy: u.name } }),
      prisma.template.update({ where: { id: t.id }, data: { currentVersion: version, name: input.name.trim() || t.name, category: input.category.trim() || t.category, updatedBy: u.name } }),
    ]);
    await audit(u.id, "template.updated", "Template", t.id, `${t.name} → v${version}${input.note ? `: ${input.note}` : ""}`, await clientIp());
    return { ok: true, message: `Saved as version ${version}. Campaigns already approved or scheduled keep their original version.`, data: version };
  });
}

export async function restoreVersion(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const { u, t } = await editableTemplate(str(fd, "templateId"));
    const from = await prisma.templateVersion.findUniqueOrThrow({ where: { templateId_version: { templateId: t.id, version: Number(str(fd, "version")) } } });
    const version = t.currentVersion + 1;
    await prisma.$transaction([
      prisma.templateVersion.create({ data: { templateId: t.id, version, subject: from.subject, preheader: from.preheader, blocks: from.blocks as object[], note: `Restored from v${from.version}`, createdBy: u.name } }),
      prisma.template.update({ where: { id: t.id }, data: { currentVersion: version, updatedBy: u.name } }),
    ]);
    await audit(u.id, "template.restored", "Template", t.id, `v${from.version} → v${version}`);
    return { ok: true, message: `Version ${from.version} restored as version ${version}.` };
  });
}

export async function duplicateTemplate(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const { u, t } = await editableTemplate(str(fd, "templateId"));
    const v = await prisma.templateVersion.findUniqueOrThrow({ where: { templateId_version: { templateId: t.id, version: t.currentVersion } } });
    const base = t.name.replace(/\s+V\d+$/i, "");
    const siblings = await prisma.template.count({ where: { name: { startsWith: base } } });
    const copy = await prisma.template.create({
      data: {
        name: `${base} V${siblings + 1}`, category: t.category, audience: t.audience, department: t.department, active: false, createdBy: u.name, updatedBy: u.name,
        versions: { create: { version: 1, subject: v.subject, preheader: v.preheader, blocks: v.blocks as object[], note: `Duplicated from ${t.name} v${v.version}`, createdBy: u.name } },
      },
    });
    await audit(u.id, "template.duplicated", "Template", copy.id, `${t.name} → ${copy.name}`);
    return { ok: true, redirectTo: `/templates/${copy.id}` };
  });
}

export async function setTemplateActive(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const { u, t } = await editableTemplate(str(fd, "templateId"));
    const active = str(fd, "active") === "true";
    await prisma.template.update({ where: { id: t.id }, data: { active, updatedBy: u.name } });
    await audit(u.id, active ? "template.activated" : "template.deactivated", "Template", t.id, t.name);
    return { ok: true, message: active ? "Template activated." : "Template deactivated. Automations using it will pause and notify you." };
  });
}

/** Test sends: marked [TEST], restricted to authorised internal addresses, never counted as deliveries. */
export async function sendTest(input: { to: string; subject: string; preheader: string; blocks: EmailBlock[]; contactId?: string; senderId: string; audience: Audience; eventName?: string }): Promise<ActionResult> {
  return run(async () => {
    const u = await assertUser();
    const s = await getSettings();
    const to = normEmail(input.to);
    if (!isValidEmail(to)) throw new Error("Enter a valid test email address.");
    const domain = to.split("@")[1];
    if (!canTestAnyAddress(u.role) && to !== normEmail(u.email) && !s.sending.testRecipientDomains.map((d) => d.toLowerCase()).includes(to.split("@")[1])) {
      throw new Error(`Tests can only go to your own address or to: ${s.sending.testRecipientDomains.join(", ")}`);
    }
    const contact = input.contactId ? await prisma.contact.findUnique({ where: { id: input.contactId } }) : null;
    const [first, ...rest] = u.name.split(/s+/);
    const sample = contact ?? { id: "sample", firstName: first || "Augustine", lastName: rest.join(" ") || "", preferredName: null, organisation: "Your client company", department: u.department ?? "Engineering", jobTitle: u.position ?? "Engineer", category: input.audience === "INTERNAL" ? "STAFF" : "CUSTOMER" } as const;
    const msg = await renderForContact({ settings: s, subject: input.subject, preheader: input.preheader, blocks: cleanBlocks(input.blocks), contact: sample, senderId: input.senderId, eventName: input.eventName, external: false, isTest: true, yearsOfService: 5, projectName: "Sample Project" });
    const res = await sendEmail({ to, from: `${msg.sender.name} <${msg.sender.email}>`, subject: msg.subject, html: msg.html, text: msg.text });
    await audit(u.id, "test.sent", "Template", undefined, `Test "${msg.subject}" → ${to}: ${res.ok ? (res.simulated ? "simulated" : "accepted") : res.error}`);
    if (!res.ok) return { ok: false, error: `Test failed: ${res.error}` };
    return { ok: true, message: res.simulated ? `Test recorded in simulation mode (no email sent to ${to}). Configure Amazon SES to deliver tests.` : `Test email sent to ${to}.` };
  });
}

/** Optional AI writing assistant (OpenAI). Output is a draft the user must review before saving. */
export async function aiDraft(input: { brief: string; tone: string; audience: Audience }): Promise<ActionResult> {
  return run(async () => {
    await assertPermission("templates:write");
    const key = process.env.OPENAI_API_KEY;
    if (!key) return { ok: false, error: "The AI writing assistant is not configured. Add OPENAI_API_KEY in the Vercel environment settings." };
    if (input.brief.trim().length < 10) throw new Error("Describe the email you want in a sentence or two.");
    const s = await getSettings();
    const system = [
      `You write corporate emails for ${s.brand.companyName}, a Nigerian Mechanical, Electrical and Piping (MEP) engineering company whose values are speed, quality, cost efficiency, innovation, leadership and customer centricity.`,
      "Write in British English with a professional, warm tone. Keep emails concise (80–180 words of body).",
      "STRICT RULES: Never invent company achievements, statistics, awards, customer names, relationships, project details, prices or claims. If specifics are needed, write a bracketed placeholder like [project name].",
      "Use these personalisation placeholders where natural: {{first_name}}, {{current_month}}, {{current_year}}, {{company_name}}, {{event_name}}. Do not invent other placeholders.",
      'Reply ONLY with JSON: {"subject": string, "preheader": string, "heading": string, "paragraphs": string[], "closing": string, "cta": {"label": string, "url": string} | null}. The closing is the sign-off, e.g. "Warm regards,\\nCustomer Relations Team\\n{{company_name}}". Use "{{company_website}}" as the only CTA URL.',
    ].join("\n");
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.7,
        messages: [{ role: "system", content: system }, { role: "user", content: `Audience: ${input.audience === "INTERNAL" ? "AOJ staff" : input.audience === "EXTERNAL" ? "customers and business partners" : "staff and customers"}.\nTone: ${input.tone}.\nBrief: ${input.brief.slice(0, 1500)}` }],
      }),
    });
    if (!res.ok) return { ok: false, error: `AI service error (${res.status}). Try again later.` };
    const json = await res.json();
    const draft = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    if (!draft.subject || !Array.isArray(draft.paragraphs)) return { ok: false, error: "The AI response could not be used. Try rephrasing the brief." };
    return { ok: true, data: draft, message: "Draft inserted. Review every sentence before saving: AI content is never activated automatically." };
  });
}
