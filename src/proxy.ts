import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { coachToolsEnabled } from "@/lib/coach/feature-flag";
import { verifySession } from "@/lib/session";

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/", "/login", "/help", "/api/auth", "/api/public-prefs"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Signed-in users never see the landing or login pages, so browser back
  // navigation (e.g. iOS swipe-back) from /app lands in /app again.
  // Verify the signature so a stale cookie can't loop /login <-> /app.
  if (pathname === "/" || pathname === "/login") {
    const token = req.cookies.get("lifeos-session")?.value;
    if (token && verifySession(token)?.twoFactorVerified && !req.nextUrl.searchParams.has("qr")) return NextResponse.redirect(new URL("/app", req.url));
    // no-store keeps these pages out of the back/forward cache, so going back
    // after signing in re-requests them and hits the redirect above.
    const res = NextResponse.next();
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
  if (pathname === "/api/coach" && !coachToolsEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(route + "/"))) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.includes(".") || pathname.startsWith("/manifest")) {
    return NextResponse.next();
  }

  // Check if session cookie exists (full verification happens server-side)
  const cookie = req.headers.get("cookie") || "";
  const hasSession = cookie.includes("lifeos-session=");

  if (!hasSession) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
