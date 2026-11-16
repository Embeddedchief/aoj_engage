import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runTick } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Called by Vercel Cron (Authorization: Bearer $CRON_SECRET) or any external scheduler. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  try {
    return NextResponse.json(await runTick());
  } catch (e) {
    console.error("engine tick failed", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
