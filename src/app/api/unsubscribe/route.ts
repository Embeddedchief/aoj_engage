import { NextResponse, type NextRequest } from "next/server";
import { unsubscribeByToken } from "@/lib/unsubscribe";

// RFC 8058 one-click unsubscribe (mail clients POST here).
export async function POST(req: NextRequest) {
  const t = req.nextUrl.searchParams.get("t");
  if (!t) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const c = await unsubscribeByToken(t, "One-click unsubscribe");
  return c ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Invalid token" }, { status: 400 });
}
