import type { Role } from "@prisma/client";
import { prisma } from "./db";

/** Append-only audit trail. There is no UI or action that updates or deletes audit rows. */
export async function audit(userId: string | null, action: string, entity?: string, entityId?: string, detail?: string, ip?: string | null) {
  await prisma.auditLog.create({ data: { userId, action, entity, entityId, detail: detail?.slice(0, 2000), ip: ip ?? undefined } });
}

/** Creates an in-app notification once per dedupeKey (safe to call repeatedly). */
export async function notify(n: { key?: string; roles?: Role[]; userId?: string; level?: "info" | "warning" | "error" | "success"; title: string; body?: string; link?: string }) {
  const data = { dedupeKey: n.key, roles: n.roles ?? ["SUPER_ADMIN"], userId: n.userId, level: n.level ?? "info", title: n.title, body: n.body, link: n.link };
  if (!n.key) return prisma.notification.create({ data });
  try {
    return await prisma.notification.upsert({ where: { dedupeKey: n.key }, create: data, update: {} });
  } catch (e) {
    // Concurrent workers can race on the same key; the notification already exists, which is the goal.
    if ((e as { code?: string }).code === "P2002") return null;
    throw e;
  }
}
