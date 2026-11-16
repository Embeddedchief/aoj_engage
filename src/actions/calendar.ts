"use server";

import type { Audience, EventCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertPermission } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { run, str, type ActionResult } from "@/lib/action";

function reminderDays(fd: FormData) {
  return [...new Set(str(fd, "reminderDays").split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0 && n <= 90))].sort((a, b) => b - a);
}

export async function createEvent(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("calendar:write");
    const name = str(fd, "name");
    const date = str(fd, "date");
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Enter a name and a date.");
    const recurring = str(fd, "recurrence") !== "once";
    const [y, m, d] = date.split("-").map(Number);
    const ev = await prisma.calendarEvent.create({
      data: {
        name, description: str(fd, "description") || null, category: (str(fd, "category") || "COMPANY") as EventCategory, audience: (str(fd, "audience") || "BOTH") as Audience,
        rule: recurring ? "FIXED" : "ONCE", month: recurring ? m : null, day: recurring ? d : null, reminderDays: reminderDays(fd),
        dates: recurring ? undefined : { create: { year: y, date: new Date(`${date}T00:00:00Z`), confirmed: true, source: "Company calendar" } },
      },
    });
    await audit(u.id, "calendar.created", "CalendarEvent", ev.id, `${name} (${date}${recurring ? ", yearly" : ""})`);
    return { ok: true, redirectTo: `/calendar/${ev.id}` };
  });
}

export async function updateEvent(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("calendar:write");
    const id = str(fd, "id");
    const ev = await prisma.calendarEvent.findUniqueOrThrow({ where: { id } });
    const data: Parameters<typeof prisma.calendarEvent.update>[0]["data"] = {
      name: str(fd, "name") || ev.name, description: str(fd, "description") || null, audience: (str(fd, "audience") || ev.audience) as Audience,
      active: fd.get("active") === "on", reminderDays: reminderDays(fd),
    };
    if (ev.rule === "FIXED" && str(fd, "monthDay")) {
      const [m, d] = str(fd, "monthDay").split("-").map(Number);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) Object.assign(data, { month: m, day: d });
    }
    await prisma.calendarEvent.update({ where: { id }, data });
    await audit(u.id, "calendar.updated", "CalendarEvent", id, `${ev.name}: active=${data.active}`);
    return { ok: true, message: "Occasion saved." };
  });
}

export async function setEventDate(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("calendar:write");
    const eventId = str(fd, "eventId");
    const date = str(fd, "date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Choose a date.");
    const year = Number(date.slice(0, 4));
    const confirmed = fd.get("confirmed") === "on";
    const source = str(fd, "source") || null;
    if (confirmed && !source) throw new Error("Record the source of confirmation (e.g. FG announcement, Ministry of Interior press release).");
    await prisma.eventDate.upsert({
      where: { eventId_year: { eventId, year } },
      create: { eventId, year, date: new Date(`${date}T00:00:00Z`), confirmed, source, confirmedBy: confirmed ? u.name : null },
      update: { date: new Date(`${date}T00:00:00Z`), confirmed, source, confirmedBy: confirmed ? u.name : null },
    });
    await audit(u.id, confirmed ? "calendar.date_confirmed" : "calendar.date_set", "CalendarEvent", eventId, `${date}${source ? ` — ${source}` : ""}`);
    return { ok: true, message: confirmed ? "Date confirmed. Linked automations can now prepare campaigns." : "Provisional date saved." };
  });
}

export async function deleteEvent(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("calendar:write");
    const ev = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: str(fd, "id") }, include: { _count: { select: { automations: true } } } });
    if (ev.key) return { ok: false, error: "Built-in occasions can be deactivated but not deleted." };
    if (ev._count.automations) return { ok: false, error: "Remove or relink the automations that use this occasion first." };
    await prisma.calendarEvent.delete({ where: { id: ev.id } });
    await audit(u.id, "calendar.deleted", "CalendarEvent", ev.id, ev.name);
    return { ok: true, redirectTo: "/calendar" };
  });
}
