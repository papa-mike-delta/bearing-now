import { ItemDomain } from "@/lib/domain/item";
import { db } from "@/lib/db";
import { ok, domainResponse, notFound, parseBody, parseMeta } from "@/lib/api";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/items/[id]
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const item = await db.item.findUnique({
    where: { id },
    include: {
      tags: { include: { tag: true } },
      domain: true,
      project: true,
      linksFrom: { include: { to: { include: { domain: true, project: { select: { id: true, name: true, color: true } } } } } },
      linksTo: { include: { from: { include: { domain: true, project: { select: { id: true, name: true, color: true } } } } } },
      habitLogs: { orderBy: { date: "desc" }, take: 60 },
    },
  });
  if (!item) return notFound();
  return ok(parseMeta(item as any));
}

// PATCH /api/items/[id]
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { revision, metadata, tagNames, ...rest } = await parseBody(req);
  const result = await ItemDomain.update(id, revision, {
    ...rest,
    ...(metadata !== undefined ? { metadata: metadata === null ? null : JSON.stringify(metadata) } : {}),
  }, tagNames);
  return domainResponse(result, parseMeta);
}

// DELETE /api/items/[id] — archive
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { revision } = await parseBody(req);
  return domainResponse(await ItemDomain.archive(id, revision), parseMeta);
}
