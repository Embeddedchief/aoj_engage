"use server";

import { z } from "zod";
import type { ContactCategory, ConsentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertUser, clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { opt, run, str, type ActionResult } from "@/lib/action";
import { ALL_CATEGORIES, isInternal } from "@/lib/constants";
import { canAccessCategory } from "@/lib/permissions";
import { isValidEmail, normEmail } from "@/lib/utils";
import { parseBirthday, parseCategory, parseCsv, parseDate, type ImportFieldKey } from "@/lib/contact-parse";

const schema = z.object({
  firstName: z.string().min(1, "is required").max(80),
  lastName: z.string().min(1, "is required").max(80),
  email: z.string().refine(isValidEmail, "is not a valid email address"),
  category: z.enum(ALL_CATEGORIES as [ContactCategory, ...ContactCategory[]]),
});

function fromForm(fd: FormData) {
  const base = schema.parse({ firstName: str(fd, "firstName"), lastName: str(fd, "lastName"), email: normEmail(str(fd, "email")), category: str(fd, "category") });
  const bm = Number(str(fd, "birthMonth")) || null, bd = Number(str(fd, "birthDay")) || null, by = Number(str(fd, "birthYear")) || null;
  if ((bm && !bd) || (!bm && bd)) throw new Error("Birthday: choose both a day and a month, or leave both empty.");
  if (bm && bd && !parseBirthday(`${bd}/${bm}${by ? "/" + by : ""}`)) throw new Error("Birthday is not a valid date.");
  const date = (k: string) => (str(fd, k) ? new Date(`${str(fd, k)}T00:00:00Z`) : null);
  return {
    contact: {
      ...base,
      preferredName: opt(fd, "preferredName"), phone: opt(fd, "phone"), organisation: opt(fd, "organisation"), jobTitle: opt(fd, "jobTitle"),
      department: isInternal(base.category) ? opt(fd, "department") : null, city: opt(fd, "city"),
      birthMonth: bm, birthDay: bd, birthYear: by, anniversary: date("anniversary"), notes: opt(fd, "notes"),
      birthdayCommsAllowed: fd.get("birthdayCommsAllowed") === "on",
    },
    consent: (str(fd, "marketingConsent") || "UNKNOWN") as ConsentStatus,
    consentNote: opt(fd, "consentNote"),
    staff: { dateJoined: date("dateJoined"), employmentStatus: str(fd, "employmentStatus") || "Active", manager: opt(fd, "manager"), birthdayVisibleToColleagues: fd.get("birthdayVisibleToColleagues") === "on" },
    customer: { relationshipManager: opt(fd, "relationshipManager"), customerCategory: opt(fd, "customerCategory"), firstEngagement: date("firstEngagement"), language: str(fd, "language") || "English", relationshipStatus: str(fd, "relationshipStatus") || "Active" },
  };
}

export async function createContact(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await assertUser();
    const d = fromForm(fd);
    if (!canAccessCategory(user.role, d.contact.category, "write")) throw new Error("You are not permitted to add contacts in this category.");
    const dup = await prisma.contact.findUnique({ where: { email: d.contact.email } });
    if (dup) return { ok: false, error: `A contact with ${d.contact.email} already exists (${dup.firstName} ${dup.lastName}).` };
    const internal = isInternal(d.contact.category);
    const c = await prisma.contact.create({
      data: {
        ...d.contact,
        marketingConsent: internal ? "UNKNOWN" : d.consent,
        staffProfile: internal ? { create: d.staff } : undefined,
        customerProfile: internal ? undefined : { create: d.customer },
        consents: internal || d.consent === "UNKNOWN" ? undefined : { create: { status: d.consent, source: "Manual entry", note: d.consentNote, byUserId: user.id } },
      },
    });
    await audit(user.id, "contact.created", "Contact", c.id, `${c.firstName} ${c.lastName} <${c.email}>`, await clientIp());
    return { ok: true, redirectTo: `/contacts/${c.id}?created=1` };
  });
}

export async function updateContact(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await assertUser();
    const id = str(fd, "id");
    const existing = await prisma.contact.findUniqueOrThrow({ where: { id } });
    const d = fromForm(fd);
    if (!canAccessCategory(user.role, existing.category, "write") || !canAccessCategory(user.role, d.contact.category, "write")) throw new Error("You are not permitted to edit this contact.");
    if (d.contact.email !== existing.email) {
      const dup = await prisma.contact.findUnique({ where: { email: d.contact.email } });
      if (dup) return { ok: false, error: `${d.contact.email} is already used by ${dup.firstName} ${dup.lastName}.` };
    }
    const internal = isInternal(d.contact.category);
    await prisma.$transaction(async (tx) => {
      await tx.contact.update({ where: { id }, data: { ...d.contact, marketingConsent: internal ? existing.marketingConsent : d.consent } });
      if (internal) await tx.staffProfile.upsert({ where: { contactId: id }, create: { contactId: id, ...d.staff }, update: d.staff });
      else await tx.customerProfile.upsert({ where: { contactId: id }, create: { contactId: id, ...d.customer }, update: d.customer });
      if (!internal && d.consent !== existing.marketingConsent) {
        await tx.consentRecord.create({ data: { contactId: id, status: d.consent, source: "Manual update", note: d.consentNote, byUserId: user.id } });
      }
    });
    // Correcting the address of a bounced contact lifts the suppression on the new address only.
    await audit(user.id, "contact.updated", "Contact", id, `${d.contact.firstName} ${d.contact.lastName}`, await clientIp());
    return { ok: true, message: "Contact saved." };
  });
}

export async function setContactStatus(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await assertUser();
    const c = await prisma.contact.findUniqueOrThrow({ where: { id: str(fd, "id") } });
    if (!canAccessCategory(user.role, c.category, "write")) throw new Error("You are not permitted to change this contact.");
    const status = str(fd, "status") === "ACTIVE" ? "ACTIVE" : "INACTIVE";
    await prisma.contact.update({ where: { id: c.id }, data: { status } });
    await audit(user.id, status === "ACTIVE" ? "contact.reactivated" : "contact.deactivated", "Contact", c.id, `${c.firstName} ${c.lastName}`, await clientIp());
    return { ok: true, message: status === "ACTIVE" ? "Contact reactivated." : "Contact deactivated. Communication history is kept." };
  });
}

export async function deleteContact(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await assertUser();
    if (user.role !== "SUPER_ADMIN") throw new Error("Only the ICT Administrator can permanently delete contacts.");
    const c = await prisma.contact.findUniqueOrThrow({ where: { id: str(fd, "id") }, include: { _count: { select: { recipients: true } } } });
    if (c._count.recipients > 0) return { ok: false, error: "This contact has communication history. Deactivate instead so the audit trail is preserved." };
    await prisma.contact.delete({ where: { id: c.id } });
    await audit(user.id, "contact.deleted", "Contact", c.id, `${c.firstName} ${c.lastName} <${c.email}>`, await clientIp());
    return { ok: true, redirectTo: "/contacts" };
  });
}

export async function removeSuppression(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await assertUser();
    if (user.role !== "SUPER_ADMIN" && user.role !== "COMMS_OFFICER") throw new Error("Not permitted.");
    const email = normEmail(str(fd, "email"));
    const s = await prisma.suppression.findUnique({ where: { email } });
    if (!s) return { ok: true };
    if (s.reason === "UNSUBSCRIBE" || s.reason === "COMPLAINT") return { ok: false, error: "Unsubscribes and complaints can only be lifted by the recipient re-consenting." };
    await prisma.suppression.delete({ where: { email } });
    await audit(user.id, "suppression.removed", "Suppression", s.id, email);
    return { ok: true, message: "Suppression removed." };
  });
}

export async function saveProject(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await assertUser();
    const contact = await prisma.contact.findUniqueOrThrow({ where: { id: str(fd, "contactId") } });
    if (!canAccessCategory(user.role, contact.category, "write")) throw new Error("Not permitted.");
    const id = str(fd, "id");
    const data = { name: str(fd, "name"), stage: str(fd, "stage") || "Awarded", location: opt(fd, "location") };
    if (!data.name) throw new Error("Project name is required.");
    if (id) await prisma.project.update({ where: { id }, data });
    else await prisma.project.create({ data: { ...data, contactId: contact.id } });
    await audit(user.id, id ? "project.updated" : "project.created", "Project", id || undefined, `${data.name} → ${data.stage}`);
    return { ok: true, message: id ? "Project updated." : "Project added." };
  });
}

// ── Bulk import ──────────────────────────────────────────────────────────

const MAX_ROWS = 5000;

export async function parseImportFile(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await assertUser();
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a CSV or Excel file." };
    if (file.size > 5 * 1024 * 1024) return { ok: false, error: "File is larger than 5 MB." };
    const name = file.name.toLowerCase();
    let rows: string[][];
    if (name.endsWith(".csv") || file.type === "text/csv") {
      rows = parseCsv(await file.text());
    } else if (name.endsWith(".xlsx")) {
      const buf = Buffer.from(await file.arrayBuffer());
      if (buf.subarray(0, 2).toString() !== "PK") return { ok: false, error: "This is not a valid .xlsx file." };
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf as unknown as ArrayBuffer);
      const ws = wb.worksheets[0];
      rows = [];
      ws?.eachRow({ includeEmpty: false }, (r) => {
        const vals = (r.values as unknown[]).slice(1).map(cellText);
        rows.push(vals);
      });
    } else return { ok: false, error: "Unsupported file type. Upload a .csv or .xlsx file." };
    if (rows.length < 2) return { ok: false, error: "The file needs a header row and at least one contact." };
    if (rows.length - 1 > MAX_ROWS) return { ok: false, error: `The file has ${rows.length - 1} rows. Split it into files of ${MAX_ROWS} rows or fewer.` };
    const width = Math.max(...rows.map((r) => r.length));
    const headers = rows[0].map((h, i) => h.trim() || `Column ${i + 1}`);
    while (headers.length < width) headers.push(`Column ${headers.length + 1}`);
    return { ok: true, data: { headers, rows: rows.slice(1).map((r) => headers.map((_, i) => (r[i] ?? "").trim())), fileName: file.name } };
  });
}

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return `${String(v.getUTCDate()).padStart(2, "0")}/${String(v.getUTCMonth() + 1).padStart(2, "0")}/${v.getUTCFullYear()}`;
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.text) return String(o.text);
    if (o.result !== undefined) return cellText(o.result);
    return "";
  }
  return String(v);
}

export type ImportRow = Partial<Record<ImportFieldKey, string>>;
export type RowCheck = { index: number; status: "ok" | "error" | "duplicate"; messages: string[] };

async function checkRows(rows: ImportRow[], defaultCategory: ContactCategory, role: Parameters<typeof canAccessCategory>[0]) {
  const emails = rows.map((r) => normEmail(r.email ?? ""));
  const existing = new Set((await prisma.contact.findMany({ where: { email: { in: emails.filter(Boolean) } }, select: { email: true } })).map((c) => c.email));
  const seen = new Map<string, number>();
  return rows.map((r, index): RowCheck => {
    const msgs: string[] = [];
    let status: RowCheck["status"] = "ok";
    const email = emails[index];
    if (!r.firstName?.trim()) msgs.push("First name missing");
    if (!r.lastName?.trim()) msgs.push("Last name missing");
    if (!email) msgs.push("Email missing");
    else if (!isValidEmail(email)) msgs.push("Invalid email address");
    const cat = parseCategory(r.category, defaultCategory);
    if (!cat) msgs.push(`Unknown category "${r.category}"`);
    else if (!canAccessCategory(role, cat, "write")) msgs.push(`You cannot import ${cat.toLowerCase()} contacts`);
    if (r.birthday && !parseBirthday(r.birthday)) msgs.push(`Unrecognised birthday "${r.birthday}"`);
    if (msgs.length) status = "error";
    if (email && status === "ok") {
      if (existing.has(email)) { status = "duplicate"; msgs.push("Already in the contact database"); }
      else if (seen.has(email)) { status = "duplicate"; msgs.push(`Duplicate of row ${seen.get(email)! + 1} in this file`); }
      else seen.set(email, index);
    }
    return { index, status, messages: msgs };
  });
}

export async function validateImport(rows: ImportRow[], defaultCategory: ContactCategory): Promise<ActionResult> {
  return run(async () => {
    const user = await assertUser();
    if (rows.length > MAX_ROWS) throw new Error("Too many rows.");
    return { ok: true, data: await checkRows(rows, defaultCategory, user.role) };
  });
}

export async function commitImport(rows: ImportRow[], defaultCategory: ContactCategory, consent: { status: ConsentStatus; source: string }, fileName: string): Promise<ActionResult> {
  return run(async () => {
    const user = await assertUser();
    if (rows.length > MAX_ROWS) throw new Error("Too many rows.");
    const checks = await checkRows(rows, defaultCategory, user.role);
    let created = 0;
    const report: { row: number; email: string; result: string; detail: string }[] = [];
    for (const ch of checks) {
      const r = rows[ch.index];
      if (ch.status !== "ok") {
        report.push({ row: ch.index + 2, email: r.email ?? "", result: ch.status === "duplicate" ? "Skipped (duplicate)" : "Skipped (error)", detail: ch.messages.join("; ") });
        continue;
      }
      const category = parseCategory(r.category, defaultCategory)!;
      const internal = isInternal(category);
      const b = parseBirthday(r.birthday);
      try {
        await prisma.contact.create({
          data: {
            firstName: r.firstName!.trim(), lastName: r.lastName!.trim(), email: normEmail(r.email!), category, phone: r.phone || null,
            organisation: r.organisation || (internal ? "AOJ Global Concept Limited" : null), department: internal ? r.department || null : null,
            jobTitle: r.jobTitle || null, city: r.city || null, notes: r.notes || null, birthMonth: b?.month, birthDay: b?.day, birthYear: b?.year ?? null,
            marketingConsent: internal ? "UNKNOWN" : consent.status,
            staffProfile: internal ? { create: { dateJoined: parseDate(r.dateJoined) } } : undefined,
            customerProfile: internal ? undefined : { create: {} },
            consents: !internal && consent.status !== "UNKNOWN" ? { create: { status: consent.status, source: `Import: ${consent.source || fileName}`, byUserId: user.id } } : undefined,
          },
        });
        created++;
        report.push({ row: ch.index + 2, email: normEmail(r.email!), result: "Imported", detail: category });
      } catch (e) {
        report.push({ row: ch.index + 2, email: r.email ?? "", result: "Failed", detail: String(e).slice(0, 120) });
      }
    }
    await audit(user.id, "contact.imported", "Contact", undefined, `${fileName}: ${created} imported, ${rows.length - created} skipped`, await clientIp());
    return { ok: true, message: `${created} contact(s) imported, ${rows.length - created} skipped.`, data: report };
  });
}
