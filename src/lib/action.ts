import { ZodError } from "zod";

export type ActionResult = { ok: boolean; error?: string; message?: string; redirectTo?: string; data?: unknown };

/** Wraps a server action body so thrown errors become a displayable result. */
export async function run(fn: () => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    if (e instanceof ZodError) return { ok: false, error: e.issues.map((i) => `${i.path.join(".") || "Field"}: ${i.message}`).join("; ") };
    const msg = e instanceof Error ? e.message : String(e);
    if (/Unique constraint/i.test(msg)) return { ok: false, error: "A record with these details already exists." };
    console.error(e);
    return { ok: false, error: msg.length > 300 ? "Something went wrong. Please try again." : msg };
  }
}

export function str(fd: FormData, k: string) {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}

export function opt(fd: FormData, k: string) {
  const v = str(fd, k);
  return v === "" ? null : v;
}
