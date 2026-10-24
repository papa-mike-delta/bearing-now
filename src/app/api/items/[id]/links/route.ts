import { getItem, getLinks } from "@/lib/domain/item-queries";
import { writeActor, sessionUser, ok, domainResponse, notFound, parseBody } from "@/lib/api";
import { LinkDomain } from "@/lib/domain/link";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/items/[id]/links — return related items (both directions)
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const links = await getLinks(id, session.userId);
  if (!links) return notFound();
  return ok(links);
}

// POST /api/items/[id]/links — create a link from this item to another
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!await getItem(id, session.userId)) return notFound();
  const body = await parseBody(req);
  return domainResponse(await LinkDomain.create(session.userId, {
    fromId: id, toId: body.toId, type: body.type, note: body.note,
  }, body.revision, await writeActor(req)));
}

// DELETE /api/items/[id]/links — remove a link
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!await getItem(id, session.userId)) return notFound();
  const sp = req.nextUrl.searchParams;
  const toId = sp.get("toId");
  const type = sp.get("type") || "related_to";
  const revision = sp.get("revision");
  return domainResponse(await LinkDomain.delete(session.userId, { fromId: id, toId: toId ?? "", type }, revision === null || revision.trim() === "" ? NaN : Number(revision), await writeActor(req)));
}
