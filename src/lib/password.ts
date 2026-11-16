import { hash, verify } from "@node-rs/argon2";
import { prisma } from "./db";

// Argon2id (algorithm 2) with OWASP-recommended parameters.
const OPTS = { algorithm: 2 as const, memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (pw: string) => hash(pw, OPTS);
export const verifyPassword = (h: string, pw: string) => verify(h, pw).catch(() => false);

let dummy: Promise<string> | null = null;
/** Spend the same time as a real check when the account doesn't exist (prevents user enumeration). */
export async function dummyVerify(pw: string) {
  dummy ??= hashPassword("aoj-engage-timing-equaliser");
  await verifyPassword(await dummy, pw);
}

export function passwordProblem(pw: string) {
  if (pw.length < 12) return "Password must be at least 12 characters.";
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return "Password must contain letters and numbers.";
  return null;
}

/** Fixed-window rate limiter stored in Postgres (works across serverless instances). */
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const now = new Date();
  const row = await prisma.rateLimit.findUnique({ where: { key } });
  if (!row || row.resetAt < now) {
    await prisma.rateLimit.upsert({ where: { key }, create: { key, count: 1, resetAt: new Date(now.getTime() + windowSec * 1000) }, update: { count: 1, resetAt: new Date(now.getTime() + windowSec * 1000) } });
    return true;
  }
  if (row.count >= limit) return false;
  await prisma.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
  return true;
}
