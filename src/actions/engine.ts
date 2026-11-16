"use server";

import { assertPermission } from "@/lib/auth";
import { run, type ActionResult } from "@/lib/action";
import { runTick } from "@/lib/engine";

export async function runEngineNow(_: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("engine:run");
    const r = await runTick(new Date(), u.id);
    const msg = [`Engine ran in ${r.ms} ms (${r.mode === "ses" ? "Amazon SES" : "simulation mode"}).`, ...r.planned, ...r.dispatched].join(" ");
    return { ok: true, message: r.planned.length + r.dispatched.length === 0 ? `${msg} Nothing was due.` : msg };
  });
}
