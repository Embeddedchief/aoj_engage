// All scheduling runs on Africa/Lagos time (WAT, UTC+1, no daylight saving).
export const TZ = "Africa/Lagos";
const OFFSET_MS = 60 * 60 * 1000;

export type LocalDate = string; // "YYYY-MM-DD"

const pad = (n: number) => String(n).padStart(2, "0");

/** Calendar parts of an instant, as seen in Lagos. */
export function lagosParts(d: Date = new Date()) {
  const l = new Date(d.getTime() + OFFSET_MS);
  return {
    year: l.getUTCFullYear(),
    month: l.getUTCMonth() + 1,
    day: l.getUTCDate(),
    weekday: ((l.getUTCDay() + 6) % 7) + 1, // 1 = Monday … 7 = Sunday
    hour: l.getUTCHours(),
    minute: l.getUTCMinutes(),
  };
}

export function toLocalDate(year: number, month: number, day: number): LocalDate {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function todayLocal(now: Date = new Date()): LocalDate {
  const p = lagosParts(now);
  return toLocalDate(p.year, p.month, p.day);
}

export function parseLocal(d: LocalDate) {
  const [year, month, day] = d.split("-").map(Number);
  return { year, month, day };
}

/** Add days to a local date (pure calendar arithmetic). */
export function addDays(d: LocalDate, n: number): LocalDate {
  const { year, month, day } = parseLocal(d);
  const t = new Date(Date.UTC(year, month - 1, day + n));
  return toLocalDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function weekdayOf(d: LocalDate) {
  const { year, month, day } = parseLocal(d);
  return ((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7) + 1;
}

export function daysBetween(a: LocalDate, b: LocalDate) {
  const pa = parseLocal(a), pb = parseLocal(b);
  return Math.round((Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / 86400000);
}

/** The UTC instant for a Lagos wall-clock date + "HH:mm". */
export function lagosInstant(d: LocalDate, time = "08:00"): Date {
  const { year, month, day } = parseLocal(d);
  const [h, m] = time.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, h, m) - OFFSET_MS);
}

/** <input type="datetime-local"> value (Lagos) → Date */
export function fromLocalInput(v: string): Date {
  const [d, t] = v.split("T");
  return lagosInstant(d, t?.slice(0, 5) || "08:00");
}

export function toLocalInput(d: Date): string {
  const p = lagosParts(d);
  return `${toLocalDate(p.year, p.month, p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function isLeap(y: number) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function fmtLocal(d: LocalDate, opts: { weekday?: boolean; year?: boolean } = {}) {
  const { year, month, day } = parseLocal(d);
  const wd = opts.weekday ? WEEKDAYS[weekdayOf(d) - 1].slice(0, 3) + " " : "";
  return `${wd}${day} ${MONTHS[month - 1].slice(0, 3)}${opts.year === false ? "" : " " + year}`;
}

export function fmtDateTime(d: Date | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
}

export function fmtDate(d: Date | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(d);
}

/** Western (Gregorian) Easter Sunday — anonymous Gregorian algorithm. */
export function easterSunday(year: number): LocalDate {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toLocalDate(year, month, day);
}

/** Birthday occurrence in a year; 29 Feb falls on 28 Feb in non-leap years. */
export function birthdayInYear(year: number, month: number, day: number): LocalDate {
  if (month === 2 && day === 29 && !isLeap(year)) return toLocalDate(year, 2, 28);
  return toLocalDate(year, month, day);
}
