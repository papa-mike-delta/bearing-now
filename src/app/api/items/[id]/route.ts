import { ItemDomain } from "@/lib/domain/item";
import { getItem } from "@/lib/domain/item-queries";
import { writeActor, sessionUser, ok, domainResponse, notFound, parseBody, parseMeta } from "@/lib/api";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/items/[id]
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const item = await getItem(id, session.userId);
  if (!item) return notFound();
  return ok(parseMeta(item as any));
}

// PATCH /api/items/[id]
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const { revision, metadata, tagNames, ...rest } = await parseBody(req);
  const result = await ItemDomain.update(session.userId, id, revision, {
    ...rest,
    ...(metadata !== undefined ? { metadata: metadata === null ? null : JSON.stringify(metadata) } : {}),
  }, tagNames, await writeActor(req));
  return domainResponse(result, parseMeta);
}

// DELETE /api/items/[id] — archive
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const { revision } = await parseBody(req);
  return domainResponse(await ItemDomain.archive(session.userId, id, revision, await writeActor(req)), parseMeta);
}
