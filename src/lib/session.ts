import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "aoj_session";
export const SESSION_HOURS = 10;

function key() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set to at least 32 characters");
  return new TextEncoder().encode(s);
}

/** mcp = must change password (issued/temporary password); cleared by signing in again after changing it. */
export type SessionPayload = { uid: string; epoch: number; mcp?: boolean };

export async function signSession(p: SessionPayload) {
  return new SignJWT(p).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${SESSION_HOURS}h`).sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return { uid: String(payload.uid), epoch: Number(payload.epoch), mcp: payload.mcp === true };
  } catch {
    return null;
  }
}

/** Signed purpose-bound tokens, e.g. for unsubscribe links. */
export async function signToken(purpose: string, subject: string) {
  return new SignJWT({ p: purpose, s: subject }).setProtectedHeader({ alg: "HS256" }).sign(key());
}

export async function verifyToken(purpose: string, token: string) {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return payload.p === purpose ? String(payload.s) : null;
  } catch {
    return null;
  }
}
