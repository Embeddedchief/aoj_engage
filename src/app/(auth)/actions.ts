"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { clientIp, getCurrentUser } from "@/lib/auth";
import { run, str, type ActionResult } from "@/lib/action";
import { dummyVerify, hashPassword, passwordProblem, rateLimit, verifyPassword } from "@/lib/password";
import { SESSION_COOKIE, SESSION_HOURS, signSession } from "@/lib/session";
import { isValidEmail, normEmail } from "@/lib/utils";

async function startSession(user: { id: string; sessionEpoch: number }) {
  const token = await signSession({ uid: user.id, epoch: user.sessionEpoch });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_HOURS * 3600 });
}

export async function login(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const email = normEmail(str(fd, "email"));
    const password = str(fd, "password");
    const ip = await clientIp();
    if (!(await rateLimit(`login:${ip ?? "unknown"}`, 20, 900))) return { ok: false, error: "Too many sign-in attempts. Please wait 15 minutes." };

    const user = await prisma.user.findUnique({ where: { email } });
    const generic = { ok: false, error: "Incorrect email or password." };
    if (!user) {
      await dummyVerify(password);
      return generic;
    }
    if (!user.active) return { ok: false, error: "This account has been deactivated. Contact the ICT Administrator." };
    if (user.lockedUntil && user.lockedUntil > new Date()) return { ok: false, error: "Account temporarily locked after repeated failed attempts. Try again later." };

    if (!(await verifyPassword(user.passwordHash, password))) {
      const failed = user.failedLogins + 1;
      await prisma.user.update({ where: { id: user.id }, data: { failedLogins: failed, lockedUntil: failed >= 5 ? new Date(Date.now() + 15 * 60_000) : null } });
      await audit(user.id, "auth.login_failed", "User", user.id, `Attempt ${failed}`, ip);
      return generic;
    }
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    await startSession(user);
    await audit(user.id, "auth.login", "User", user.id, undefined, ip);
    const next = str(fd, "next");
    return { ok: true, redirectTo: next.startsWith("/") && !next.startsWith("//") ? next : "/" };
  });
}

export async function setupAdmin(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    if ((await prisma.user.count()) > 0) return { ok: false, error: "Setup has already been completed." };
    const name = str(fd, "name");
    const email = normEmail(str(fd, "email"));
    const password = str(fd, "password");
    if (!name) return { ok: false, error: "Enter your name." };
    if (!isValidEmail(email)) return { ok: false, error: "Enter a valid email address." };
    const problem = passwordProblem(password);
    if (problem) return { ok: false, error: problem };
    if (password !== str(fd, "confirm")) return { ok: false, error: "Passwords do not match." };
    const user = await prisma.user.create({ data: { name, email, role: "SUPER_ADMIN", department: "ICT", position: "ICT Administrator", passwordHash: await hashPassword(password) } });
    await audit(user.id, "auth.setup", "User", user.id, "Initial ICT Administrator created", await clientIp());
    await startSession(user);
    return { ok: true, redirectTo: "/" };
  });
}

export async function logout() {
  const u = await getCurrentUser();
  if (u) await audit(u.id, "auth.logout", "User", u.id);
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
