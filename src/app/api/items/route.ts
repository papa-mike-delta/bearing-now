import { ItemDomain } from "@/lib/domain/item";
import { Owned } from "@/lib/domain/owned";
import { writeActor, sessionUser, ok, domainResponse, parseBody, parseListMeta, parseMeta } from "@/lib/api";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/items — list with rich filtering
export async function GET(req: NextRequest) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const sp = req.nextUrl.searchParams;
  const where: any = {};

  const type = sp.get("type");
  if (type) where.type = type.split(",").length > 1 ? { in: type.split(",") } : type;

  const status = sp.get("status");
  if (status) where.status = status.split(",").length > 1 ? { in: status.split(",") } : status;

  const domain = sp.get("domain");
  if (domain) where.domainId = domain;

  const project = sp.get("project");
  if (project) where.projectId = project;

  const q = sp.get("q");
  if (q) where.OR = [{ title: { contains: q } }, { content: { contains: q } }];

  const tag = sp.get("tag");
  if (tag) where.tags = { some: { tag: { name: tag } } };

  const hasDate = sp.get("hasDate");
  if (hasDate === "true") {
    where.OR = [{ dueDate: { not: null } }, { scheduledAt: { not: null } }, { startDate: { not: null } }];
  }

  const orderBy = sp.get("orderBy") || "createdAt";
  const order = sp.get("order") === "asc" ? "asc" : "desc";
  const limit = Math.min(Number(sp.get("limit") || 200), 500);

  const items = await Owned.items(session.userId, {
    where,
    orderBy: { [orderBy]: order },
    take: limit,
    include: {
      tags: { include: { tag: true } },
      domain: true,
      project: { select: { id: true, name: true, color: true } },
    },
  });

  return ok({ items: parseListMeta(items as any[]) });
}

// POST /api/items — create
export async function POST(req: NextRequest) {
  const body = await parseBody(req);

  const { metadata, tagNames, userId: _userId, ...rest } = body;

  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const result = await ItemDomain.create(session.userId, {
    ...rest,
    ...(metadata ? { metadata: JSON.stringify(metadata) } : {}),
  }, tagNames, await writeActor(req));
  return domainResponse(result, parseMeta);
}
