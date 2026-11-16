"use server";

import type { Audience, AutomationStatus, ContactCategory, TriggerType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertPermission, clientIp } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { opt, run, str, type ActionResult } from "@/lib/action";

export async function saveAutomation(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("automations:write");
    const trigger = str(fd, "trigger") as TriggerType;
    const audience = str(fd, "audience") as Audience;
    const name = str(fd, "name");
    if (!name) throw new Error("Name the automation.");
    const templateId = str(fd, "templateId");
    const t = await prisma.template.findUniqueOrThrow({ where: { id: templateId } });
    if (t.audience !== "BOTH" && t.audience !== audience) throw new Error("The template's audience doesn't match the automation's audience.");
    const sendTime = str(fd, "sendTime") || "08:00";
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(sendTime)) throw new Error("Send time must be HH:MM.");
    const eventId = trigger === "CALENDAR_EVENT" ? str(fd, "eventId") : null;
    if (trigger === "CALENDAR_EVENT" && !eventId) throw new Error("Choose the calendar occasion that triggers this automation.");
    const data = {
      name, description: opt(fd, "description"), trigger, audience, sendTime, eventId, templateId,
      weekday: trigger === "WEEKLY" ? Number(str(fd, "weekday")) || 1 : null,
      dayOfMonth: trigger === "MONTHLY" ? Math.min(28, Math.max(1, Number(str(fd, "dayOfMonth")) || 1)) : null,
      categories: fd.getAll("categories").map(String) as ContactCategory[],
      segmentId: opt(fd, "segmentId"),
      requireActive: true,
      senderIdentity: str(fd, "senderIdentity") || "communications",
      isMarketing: str(fd, "classification") === "marketing",
      requiresApproval: fd.get("requiresApproval") === "on",
      leadDays: Math.min(14, Math.max(0, Number(str(fd, "leadDays")) || 1)),
    };
    const id = str(fd, "id");
    const a = id ? await prisma.automation.update({ where: { id }, data }) : await prisma.automation.create({ data: { ...data, status: "PAUSED" } });
    await audit(u.id, id ? "automation.updated" : "automation.created", "Automation", a.id, `${name}: ${trigger}, ${audience}, approval=${data.requiresApproval}`, await clientIp());
    return { ok: true, redirectTo: `/automations/${a.id}${id ? "" : "?created=1"}` };
  });
}

export async function setAutomationStatus(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("automations:write");
    const status = str(fd, "status") as AutomationStatus;
    if (!["ACTIVE", "PAUSED", "DISABLED"].includes(status)) throw new Error("Invalid status.");
    const a = await prisma.automation.update({ where: { id: str(fd, "id") }, data: { status } });
    await audit(u.id, `automation.${status.toLowerCase()}`, "Automation", a.id, a.name);
    return { ok: true, message: status === "ACTIVE" ? "Automation enabled." : status === "PAUSED" ? "Automation paused. Already-prepared campaigns are not affected; pause them individually if needed." : "Automation disabled." };
  });
}

export async function duplicateAutomation(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("automations:write");
    const a = await prisma.automation.findUniqueOrThrow({ where: { id: str(fd, "id") } });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, key, createdAt, updatedAt, ...rest } = a;
    const copy = await prisma.automation.create({ data: { ...rest, name: `${a.name} (copy)`, status: "PAUSED" } });
    await audit(u.id, "automation.duplicated", "Automation", copy.id, a.name);
    return { ok: true, redirectTo: `/automations/${copy.id}` };
  });
}
