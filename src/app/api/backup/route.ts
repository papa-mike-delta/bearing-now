import { ItemDomain } from "@/lib/domain/item";
import { LinkDomain } from "@/lib/domain/link";
import { DatabaseDomain } from "@/lib/domain/database";
import { Owned } from "@/lib/domain/owned";
import { db } from "@/lib/db";
import { writeActor, sessionUser, ok, bad, domainResponse, parseBody } from "@/lib/api";
import { LinkType } from "@/lib/link-type";

export const dynamic = "force-dynamic";

// GET /api/backup — the caller's data as JSON
export async function GET(req: Request) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const userId = session.userId;
  const [domains, projects, items, links, tags, reviews, habitLogs] = await Promise.all([
    Owned.domains(userId),
    Owned.projects(userId),
    Owned.items(userId, { include: { tags: { include: { tag: true } } } }),
    Owned.links(userId),
    Owned.tags(userId),
    Owned.reviews(userId),
    Owned.habitLogs(userId),
  ]);

  return ok({
    version: 1,
    exportedAt: new Date().toISOString(),
    domains,
    projects,
    items,
    links,
    tags,
    reviews,
    habitLogs,
  });
}

// POST /api/backup — restore into the caller's account
export async function POST(req: Request) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const body = await parseBody(req);
  if (!body || !body.version) return bad("Invalid backup file");
  if (body.links && (!Array.isArray(body.links) || body.links.some(
    (link: { type?: unknown } | null) => !LinkType.isValid(link?.type),
  ))) return bad("Invalid Link type");

  const userId = session.userId;
  const actor = await writeActor(req);
  try {
    const cleared = await DatabaseDomain.clear(userId, actor, { items: body.items?.length ?? 0, links: body.links?.length ?? 0 });
    if (!cleared.ok) return domainResponse(cleared);

    if (body.domains) {
      for (const d of body.domains) {
        const { items, projects, user, userId: _userId, ...data } = d;
        await db.domain.create({ data: { ...data, userId } });
      }
    }
    if (body.tags) {
      for (const t of body.tags) {
        const { items, user, userId: _userId, ...data } = t;
        await db.tag.create({ data: { ...data, userId } });
      }
    }
    if (body.projects) {
      for (const p of body.projects) {
        const { items, domain, user, userId: _userId, ...data } = p;
        await db.project.create({ data: { ...data, userId } });
      }
    }
    if (body.items) {
      for (const i of body.items) {
        const { tags, domain, project, user, userId: _userId, linksFrom, linksTo, habitLogs, reviewItems, reminders, ...itemData } = i;
        const result = await ItemDomain.create(userId, itemData, (tags || []).map((t: { tag: { name: string } }) => t.tag.name), actor, "restore");
        if (!result.ok) return domainResponse(result);
      }
    }
    if (body.links) {
      for (const l of body.links) {
        const source = await db.item.findFirst({ where: { id: l.fromId, userId } });
        if (!source) return bad("Not found");
        const result = await LinkDomain.create(userId, l, source.revision, actor, "restore");
        if (!result.ok) return domainResponse(result);
      }
    }
    if (body.reviews) {
      for (const r of body.reviews) {
        const { items, user, userId: _userId, ...reviewData } = r;
        await db.review.create({ data: { ...reviewData, userId } });
      }
    }
    if (body.habitLogs) {
      for (const h of body.habitLogs) {
        const owned = await db.item.findFirst({ where: { id: h.itemId, userId }, select: { id: true } });
        if (!owned) return bad("Not found");
        const { id, itemId, date, value, note, createdAt } = h;
        await db.habitLog.create({ data: { id, itemId, date, value, note, createdAt } });
      }
    }

    return ok({ success: true, message: "Backup restored successfully" });
  } catch (e: any) {
    return bad(`Restore failed: ${e.message}`, 500);
  }
}
