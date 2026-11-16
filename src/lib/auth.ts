import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "./db";
import { SESSION_COOKIE, verifySession } from "./session";
import { can, type Permission } from "./permissions";

export const getCurrentUser = cache(async () => {
  const jar = await cookies();
  const s = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!s) return null;
  const user = await prisma.user.findUnique({ where: { id: s.uid } });
  if (!user || !user.active || user.sessionEpoch !== s.epoch) return null;
  return user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** For pages: redirects to the dashboard when the permission is missing. */
export async function requirePermission(p: Permission) {
  const u = await requireUser();
  if (!can(u.role, p)) redirect("/?denied=1");
  return u;
}

/** For server actions: throws so the caller sees an error message. */
export async function assertPermission(p: Permission) {
  const u = await getCurrentUser();
  if (!u) throw new Error("Your session has expired. Please sign in again.");
  if (!can(u.role, p)) throw new Error("You do not have permission to perform this action.");
  return u;
}

export async function assertUser() {
  const u = await getCurrentUser();
  if (!u) throw new Error("Your session has expired. Please sign in again.");
  return u;
}

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
}
