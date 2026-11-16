import type { Automation, CalendarEvent } from "@prisma/client";
import { WEEKDAYS } from "./time";

export function triggerText(a: Pick<Automation, "trigger" | "weekday" | "dayOfMonth" | "sendTime">, event?: Pick<CalendarEvent, "name"> | null) {
  switch (a.trigger) {
    case "WEEKLY": return `Every ${WEEKDAYS[(a.weekday ?? 1) - 1]} at ${a.sendTime}`;
    case "MONTHLY": return `Day ${a.dayOfMonth ?? 1} of every month at ${a.sendTime}`;
    case "CALENDAR_EVENT": return `On ${event?.name ?? "calendar occasion"} at ${a.sendTime}`;
    case "BIRTHDAY": return `On each contact's birthday at ${a.sendTime}`;
    case "WORK_ANNIVERSARY": return `On each employee's work anniversary at ${a.sendTime}`;
    case "RELATIONSHIP_ANNIVERSARY": return `On each customer's relationship anniversary at ${a.sendTime}`;
  }
}
