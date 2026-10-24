import { Owned } from "@/lib/domain/owned";
import { ok, sessionUser } from "@/lib/api";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/domains
export async function GET(req: NextRequest) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const domains = await Owned.domains(session.userId);
  return ok({ domains });
}
