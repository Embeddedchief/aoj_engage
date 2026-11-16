import type { ContactCategory } from "@prisma/client";
import { ALL_CATEGORIES, CATEGORY_LABEL } from "./constants";
import { MONTHS } from "./time";

/** Parse a birthday in common Nigerian/UK formats: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD/MM, "12 March 1990", "March 12". */
export function parseBirthday(raw: string | null | undefined): { month: number; day: number; year: number | null } | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[2], +m[3], +m[1]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (m) return valid(+m[2], +m[1], m[3] ? normYear(+m[3]) : null);
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\.?,?\s*(\d{4})?$/);
  if (m) return valid(monthIdx(m[2]), +m[1], m[3] ? +m[3] : null);
  m = s.match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?$/);
  if (m) return valid(monthIdx(m[1]), +m[2], m[3] ? +m[3] : null);
  return null;
}

function normYear(y: number) {
  return y < 100 ? (y > 30 ? 1900 + y : 2000 + y) : y;
}
function monthIdx(name: string) {
  const i = MONTHS.findIndex((m) => m.toLowerCase().startsWith(name.toLowerCase().slice(0, 3)));
  return i + 1;
}
function valid(month: number, day: number, year: number | null) {
  if (!month || month < 1 || month > 12 || day < 1) return null;
  const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day > max) return null;
  if (year !== null && (year < 1900 || year > new Date().getFullYear())) return null;
  return { month, day, year };
}

export function parseDate(raw: string | null | undefined): Date | null {
  const b = parseBirthday(raw);
  if (!b || !b.year) return null;
  return new Date(Date.UTC(b.year, b.month - 1, b.day));
}

export function parseCategory(raw: string | null | undefined, fallback?: ContactCategory): ContactCategory | null {
  if (!raw || !raw.trim()) return fallback ?? null;
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const direct = ALL_CATEGORIES.find((c) => c.toLowerCase() === s);
  if (direct) return direct;
  const byLabel = ALL_CATEGORIES.find((c) => CATEGORY_LABEL[c].toLowerCase().replace(/[\s-]+/g, "_") === s);
  if (byLabel) return byLabel;
  const aliases: Record<string, ContactCategory> = { employee: "STAFF", staffs: "STAFF", manager: "MANAGEMENT", client: "CUSTOMER", customers: "CUSTOMER", partner: "PARTNER", prospect: "PROSPECT", vendor: "SUPPLIER", former: "FORMER_CUSTOMER" };
  return aliases[s] ?? null; // a value was given but not recognised: flag it, never guess
}

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') q = false;
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export const IMPORT_FIELDS = [
  { key: "firstName", label: "First name", required: true, guess: ["first name", "firstname", "first", "given name"] },
  { key: "lastName", label: "Last name", required: true, guess: ["last name", "lastname", "surname", "last", "family name"] },
  { key: "email", label: "Email", required: true, guess: ["email", "email address", "e-mail", "mail"] },
  { key: "category", label: "Category", required: false, guess: ["category", "type", "contact type", "group"] },
  { key: "phone", label: "Phone", required: false, guess: ["phone", "phone number", "mobile", "telephone"] },
  { key: "organisation", label: "Company / organisation", required: false, guess: ["company", "organisation", "organization", "company name"] },
  { key: "department", label: "Department", required: false, guess: ["department", "dept", "unit"] },
  { key: "jobTitle", label: "Job title", required: false, guess: ["job title", "title", "position", "role", "designation"] },
  { key: "birthday", label: "Birthday", required: false, guess: ["birthday", "date of birth", "dob", "birth date"] },
  { key: "city", label: "City", required: false, guess: ["city", "location", "state"] },
  { key: "dateJoined", label: "Date joined (staff)", required: false, guess: ["date joined", "joined", "start date", "employment date", "hire date"] },
  { key: "notes", label: "Notes", required: false, guess: ["notes", "note", "comments"] },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];

export function guessMapping(headers: string[]): Partial<Record<ImportFieldKey, number>> {
  const map: Partial<Record<ImportFieldKey, number>> = {};
  headers.forEach((h, i) => {
    const n = h.trim().toLowerCase();
    for (const f of IMPORT_FIELDS) if (map[f.key] === undefined && (f.guess as readonly string[]).includes(n)) map[f.key] = i;
  });
  return map;
}
