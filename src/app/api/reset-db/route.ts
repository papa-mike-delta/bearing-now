import { domainResponse } from "@/lib/api";
import { DatabaseDomain } from "@/lib/domain/database";
import { ok, bad, getUserFromRequest } from "@/lib/auth-utils";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/reset-db — clears the caller's data except their account and ledger (dev only)
export async function POST(req: NextRequest) {
  const session = await getUserFromRequest(req);
  if (!session) return bad("Unauthorized", 401);

  if (process.env.NODE_ENV === "production") {
    return bad("Database reset is disabled in production", 403);
  }

  try {
    const cleared = await DatabaseDomain.clear(session.userId, `user:${session.userId}`);
    if (!cleared.ok) return domainResponse(cleared);
    return ok({ success: true, message: "All data cleared. Users preserved." });
  } catch (e: any) {
    return bad(`Reset failed: ${e.message}`, 500);
  }
}
