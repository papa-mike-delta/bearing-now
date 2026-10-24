import { db } from "@/lib/db";
import { Owned } from "@/lib/domain/owned";
import { ok, parseBody, sessionUser } from "@/lib/api";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/tags
export async function GET(req: NextRequest) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const tags = await Owned.tags(session.userId, {
    orderBy: { name: "asc" },
    include: { _count: { select: { items: true } } },
  });
  return ok({ tags });
}

// POST /api/tags
export async function POST(req: NextRequest) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const body = await parseBody(req);
  if (!body.name) return ok({ error: "name required" }, { status: 400 });
  const tag = await db.tag.upsert({
    where: { userId_name: { userId: session.userId, name: body.name } },
    update: { color: body.color },
    create: { name: body.name, color: body.color || "#71717a", userId: session.userId },
  });
  return ok(tag);
}
