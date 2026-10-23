import { searchItems } from "@/lib/domain/item-queries";
import { db } from "@/lib/db";
import { ok, parseListMeta } from "@/lib/api";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/search?q=... — search items, projects, tags
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") || "";
  if (!q.trim()) return ok({ items: [], projects: [], tags: [] });

  const [items, projects, tags] = await Promise.all([
    searchItems(q),
    db.project.findMany({ where: { OR: [{ name: { contains: q } }, { description: { contains: q } }] }, take: 10 }),
    db.tag.findMany({ where: { name: { contains: q } }, take: 10, include: { _count: { select: { items: true } } } }),
  ]);

  return ok({ items: parseListMeta(items as any[]), projects, tags });
}
