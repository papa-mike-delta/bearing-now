import { ItemDomain } from "@/lib/domain/item";
import { LinkDomain } from "@/lib/domain/link";
import { DatabaseDomain } from "@/lib/domain/database";
import { db } from "@/lib/db";
import { writeActor, ok, bad, domainResponse, parseBody } from "@/lib/api";
import { LinkType } from "@/lib/link-type";

export const dynamic = "force-dynamic";

// GET /api/backup — full database export as JSON
export async function GET() {
  const [domains, projects, items, links, tags, reviews, habitLogs] = await Promise.all([
    db.domain.findMany(),
    db.project.findMany(),
    db.item.findMany({ include: { tags: { include: { tag: true } } } }),
    db.link.findMany(),
    db.tag.findMany(),
    db.review.findMany(),
    db.habitLog.findMany(),
  ]);

  return ok({
    version: 1,
    exportedAt: new Date().toISOString(),
    domains,
    projects,
    items: items.map((i) => ({ ...i, metadata: i.metadata })),
    links,
    tags,
    reviews,
    habitLogs,
  });
}

// POST /api/backup — restore from JSON backup
export async function POST(req: Request) {
  const body = await parseBody(req);
  if (!body || !body.version) return bad("Invalid backup file");
  if (body.links && (!Array.isArray(body.links) || body.links.some(
    (link: { type?: unknown } | null) => !LinkType.isValid(link?.type),
  ))) return bad("Invalid Link type");

  const actor = await writeActor(req);
  try {
    // Clear existing data (except users)
    const cleared = await DatabaseDomain.clear(actor, { items: body.items?.length ?? 0, links: body.links?.length ?? 0 });
    if (!cleared.ok) return domainResponse(cleared);

    // Restore domains
    if (body.domains) {
      for (const d of body.domains) {
        await db.domain.create({ data: { ...d, items: undefined, projects: undefined } });
      }
    }

    // Restore tags
    if (body.tags) {
      for (const t of body.tags) {
        await db.tag.create({ data: { ...t, items: undefined } });
      }
    }

    // Restore projects
    if (body.projects) {
      for (const p of body.projects) {
        await db.project.create({ data: { ...p, items: undefined, domain: undefined } });
      }
    }

    // Restore items
    if (body.items) {
      for (const i of body.items) {
        const { tags, domain, project, ...itemData } = i;
        const result = await ItemDomain.create(itemData, (tags || []).map((t: { tag: { name: string } }) => t.tag.name), actor, "restore");
        if (!result.ok) return domainResponse(result);
      }
    }

    // Restore links
    if (body.links) {
      for (const l of body.links) {
        const source = await db.item.findUniqueOrThrow({ where: { id: l.fromId } });
        const result = await LinkDomain.create(l, source.revision, actor, "restore");
        if (!result.ok) return domainResponse(result);
      }
    }

    // Restore reviews
    if (body.reviews) {
      for (const r of body.reviews) {
        const { items, ...reviewData } = r;
        await db.review.create({ data: reviewData });
      }
    }

    // Restore habit logs
    if (body.habitLogs) {
      for (const h of body.habitLogs) {
        await db.habitLog.create({ data: h });
      }
    }

    return ok({ success: true, message: "Backup restored successfully" });
  } catch (e: any) {
    return bad(`Restore failed: ${e.message}`, 500);
  }
}
