import type { Audience, CalendarEvent, EventCategory, EventDate } from "@prisma/client";
import { prisma } from "./db";
import { addDays, birthdayInYear, daysInMonth, easterSunday, parseLocal, toLocalDate, weekdayOf, type LocalDate } from "./time";
import { fullName } from "./utils";

export type Occurrence = {
  date: LocalDate;
  title: string;
  kind: "event" | "weekly" | "monthly" | "birthday" | "anniversary";
  category: EventCategory | "PERSONAL";
  audience: Audience;
  eventId?: string;
  automationId?: string;
  contactId?: string;
  provisional?: boolean; // movable date not yet officially confirmed
  active: boolean;
  automated?: boolean;
};

type EventWithDates = CalendarEvent & { dates: EventDate[] };

/** Dates (within [from, to]) on which a calendar event falls. */
export function eventDatesInRange(e: EventWithDates, from: LocalDate, to: LocalDate): { date: LocalDate; confirmed: boolean }[] {
  const out: { date: LocalDate; confirmed: boolean }[] = [];
  const y0 = parseLocal(from).year, y1 = parseLocal(to).year;
  for (let y = y0; y <= y1; y++) {
    let d: LocalDate | null = null, confirmed = true;
    if (e.rule === "FIXED" && e.month && e.day) d = toLocalDate(y, e.month, Math.min(e.day, daysInMonth(y, e.month)));
    else if (e.rule === "EASTER") {
      d = addDays(easterSunday(y), e.easterOffset ?? 0);
      const ed = e.dates.find((x) => x.year === y);
      confirmed = ed ? ed.confirmed : false; // computed, but still awaits official confirmation
    } else {
      const ed = e.dates.find((x) => x.year === y);
      if (ed) { d = ed.date.toISOString().slice(0, 10); confirmed = ed.confirmed; }
    }
    if (d && d >= from && d <= to) out.push({ date: d, confirmed });
  }
  return out;
}

/** Everything on the corporate calendar between two dates (inclusive). */
export async function occurrencesBetween(from: LocalDate, to: LocalDate, opts: { includeInactive?: boolean; includeExternalPeople?: boolean } = {}) {
  const [events, automations, people, staff] = await Promise.all([
    prisma.calendarEvent.findMany({ where: opts.includeInactive ? {} : { active: true }, include: { dates: true } }),
    prisma.automation.findMany({ where: { trigger: { in: ["WEEKLY", "MONTHLY"] }, status: { not: "DISABLED" } } }),
    prisma.contact.findMany({
      where: { status: "ACTIVE", birthMonth: { not: null }, birthdayCommsAllowed: true, ...(opts.includeExternalPeople === false ? { category: { in: ["STAFF", "MANAGEMENT", "CONTRACTOR"] } } : {}) },
      select: { id: true, firstName: true, lastName: true, birthMonth: true, birthDay: true, category: true },
    }),
    prisma.staffProfile.findMany({ where: { dateJoined: { not: null }, contact: { status: "ACTIVE" } }, include: { contact: { select: { id: true, firstName: true, lastName: true } } } }),
  ]);

  const out: Occurrence[] = [];
  for (const e of events) {
    for (const { date, confirmed } of eventDatesInRange(e, from, to)) {
      out.push({ date, title: e.name, kind: "event", category: e.category, audience: e.audience, eventId: e.id, provisional: !confirmed, active: e.active });
    }
  }

  for (let d = from; d <= to; d = addDays(d, 1)) {
    const { year, month, day } = parseLocal(d);
    for (const a of automations) {
      if (a.trigger === "WEEKLY" && weekdayOf(d) === a.weekday) out.push({ date: d, title: a.name, kind: "weekly", category: "RECURRING", audience: a.audience, automationId: a.id, active: a.status === "ACTIVE", automated: true });
      if (a.trigger === "MONTHLY" && day === Math.min(a.dayOfMonth ?? 1, daysInMonth(year, month))) out.push({ date: d, title: a.name, kind: "monthly", category: "RECURRING", audience: a.audience, automationId: a.id, active: a.status === "ACTIVE", automated: true });
    }
    for (const p of people) {
      if (birthdayInYear(year, p.birthMonth!, p.birthDay!) === d) {
        const internal = ["STAFF", "MANAGEMENT", "CONTRACTOR"].includes(p.category);
        out.push({ date: d, title: `${fullName(p)} — birthday`, kind: "birthday", category: "PERSONAL", audience: internal ? "INTERNAL" : "EXTERNAL", contactId: p.id, active: true });
      }
    }
    for (const s of staff) {
      const j = s.dateJoined!;
      const years = year - j.getUTCFullYear();
      if (years >= 1 && birthdayInYear(year, j.getUTCMonth() + 1, j.getUTCDate()) === d) {
        out.push({ date: d, title: `${fullName(s.contact)} — ${years} year${years > 1 ? "s" : ""} at AOJ`, kind: "anniversary", category: "PERSONAL", audience: "INTERNAL", contactId: s.contact.id, active: true });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}
