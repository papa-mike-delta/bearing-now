import { NextResponse } from "next/server";

/** Dated removal of the pre-V1 write API. See docs/adr/0005-sunset-legacy-domain-and-coach.md. */
export class LegacyApi {
  static readonly removedOn = "2026-10-26";
  static readonly dropTablesOn = "2027-01-26";
  static readonly roots = [
    "/api/ai",
    "/api/backup",
    "/api/calendar",
    "/api/coach",
    "/api/domains",
    "/api/export",
    "/api/graph",
    "/api/inbox",
    "/api/insights",
    "/api/items",
    "/api/on-this-day",
    "/api/projects",
    "/api/public-prefs",
    "/api/reset-db",
    "/api/reviews",
    "/api/scheduler",
    "/api/search",
    "/api/seed",
    "/api/stats",
    "/api/tags",
  ] as const;

  static matches(pathname: string) {
    if (
      pathname === "/api/preferences/theme" ||
      pathname.startsWith("/api/preferences/theme/")
    )
      return false;
    if (
      pathname === "/api/preferences" ||
      pathname.startsWith("/api/preferences/")
    )
      return true;
    return this.roots.some(
      (root) => pathname === root || pathname.startsWith(`${root}/`),
    );
  }

  static response() {
    return NextResponse.json(
      {
        error: `Removed on ${this.removedOn}. Use /api/v1. Unused legacy tables are scheduled to drop on or after ${this.dropTablesOn}. There is no Item to V1Item conversion.`,
      },
      { status: 410 },
    );
  }
}
