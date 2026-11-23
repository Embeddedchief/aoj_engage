import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const PUBLIC = [/^\/login/, /^\/setup/, /^\/u\//, /^\/api\/cron\//, /^\/api\/webhooks\//, /^\/api\/unsubscribe/];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  const ok = await verifySession(req.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  if (ok) {
    // First sign-in with a temporary password: only the password page (and sign-out) is reachable.
    if (ok.mcp && pathname !== "/settings/account") {
      if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Password change required" }, { status: 403 });
      const url = req.nextUrl.clone();
      url.pathname = "/settings/account";
      url.search = "?first=1";
      return NextResponse.redirect(url);
    }
    // Expose the path to server layouts (used to enforce the first-login password change).
    const h = new Headers(req.headers);
    h.set("x-pathname", pathname);
    return NextResponse.next({ request: { headers: h } });
  }
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.png|favicon.ico|email/).*)"],
};
