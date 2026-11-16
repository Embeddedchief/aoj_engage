import clsx, { type ClassValue } from "clsx";

export const cn = (...c: ClassValue[]) => clsx(c);

export const EMAIL_RE = /^[^\s@<>()[\]\,;:"]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isValidEmail(e: string) {
  return e.length <= 254 && EMAIL_RE.test(e.trim());
}

export function normEmail(e: string) {
  return e.trim().toLowerCase();
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function isSafeUrl(u: string) {
  return /^(https?:\/\/|mailto:|tel:)/i.test(u.trim());
}

export function fullName(c: { firstName: string; lastName: string }) {
  return `${c.firstName} ${c.lastName}`.trim();
}

export function pct(n: number, d: number) {
  return d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`;
}

export function titleCase(s: string) {
  return s.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Neutralise spreadsheet formula injection. */
export function safeCell(s: string) {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export function csvEscape(v: unknown) {
  const safe = safeCell(v == null ? "" : String(v));
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvEscape(r[c])).join(","))].join("\n");
}
