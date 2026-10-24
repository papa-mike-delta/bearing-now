import { ItemDomain } from "@/lib/domain/item";
import { Owned } from "@/lib/domain/owned";
import { writeActor, sessionUser, ok, domainResponse, parseBody, parseMeta, parseListMeta } from "@/lib/api";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/inbox — all items in inbox status
export async function GET(req: NextRequest) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const items = await Owned.items(session.userId, {
    where: { status: "inbox" },
    orderBy: { createdAt: "desc" },
    include: { tags: { include: { tag: true } }, domain: true, project: { select: { id: true, name: true, color: true } } },
  });
  return ok({ items: parseListMeta(items as any[]) });
}

// POST /api/inbox — quick capture. Minimal fields; defaults to inbox note/task.
export async function POST(req: NextRequest) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const body = await parseBody(req);
  const title = (body.title || body.text || "").trim();

  const result = await ItemDomain.create(session.userId, {
    title,
    type: body.type || "note",
    status: "inbox",
    content: body.content,
    domainId: body.domainId,
    projectId: body.projectId,
    ...(body.metadata ? { metadata: JSON.stringify(body.metadata) } : {}),
  }, [], await writeActor(req));
  return domainResponse(result, parseMeta);
}
