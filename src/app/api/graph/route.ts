import { itemColor, projectColor } from "@/lib/product-colors";
import { Owned } from "@/lib/domain/owned";
import { db } from "@/lib/db";
import { ok, sessionUser } from "@/lib/api";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/graph?center=<itemId>&depth=1|2&limit=80
export async function GET(req: NextRequest) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const userId = session.userId;
  const sp = req.nextUrl.searchParams;
  const centerId = sp.get("center");
  const depth = Number(sp.get("depth") || 2);
  const limit = Math.min(Number(sp.get("limit") || 100), 200);

  let itemIds = new Set<string>();
  const projectIds = new Set<string>();

  if (centerId) {
    const center = await db.item.findFirst({ where: { id: centerId, userId }, select: { id: true } });
    if (!center) return ok({ nodes: [], edges: [] });
    const visited = new Set<string>([centerId]);
    let frontier = [centerId];
    for (let d = 0; d < depth && frontier.length; d++) {
      const next: string[] = [];
      const links = await Owned.links(userId, {
        where: { OR: [{ fromId: { in: frontier } }, { toId: { in: frontier } }] },
      });
      for (const l of links) {
        for (const id of [l.fromId, l.toId]) {
          if (!visited.has(id)) { visited.add(id); next.push(id); }
        }
      }
      frontier = next;
    }
    itemIds = visited;
  }

  const items = await Owned.items(userId, {
    where: centerId ? { id: { in: Array.from(itemIds) } } : { status: { not: "archived" } },
    take: limit,
    include: { domain: true, project: { select: { id: true, name: true, color: true, domain: { select: { key: true } } } } },
  });

  for (const it of items) {
    if (it.projectId) projectIds.add(it.projectId);
  }

  const itemIdSet = items.map((i) => i.id);
  const links = await Owned.links(userId, {
    where: { AND: [{ fromId: { in: itemIdSet } }, { toId: { in: itemIdSet } }] },
  });
  const projects = await Owned.projects(userId, {
    where: projectIds.size ? { id: { in: Array.from(projectIds) } } : { status: "active" },
    take: 30,
    include: { domain: { select: { key: true } } },
  });

  const nodes = [
    ...items.map((it) => ({
      id: it.id,
      kind: "item" as const,
      type: it.type,
      title: it.title,
      status: it.status,
      color: itemColor(it.type),
      domainId: it.domainId,
      projectId: it.projectId,
      projectName: it.project?.name,
      projectColor: it.project ? projectColor(it.project, it.type) : undefined,
      priority: it.priority,
    })),
    ...projects.map((p) => ({
      id: p.id,
      kind: "project" as const,
      type: "project",
      title: p.name,
      status: p.status,
      color: projectColor(p),
      progress: p.progress,
      domainId: p.domainId,
    })),
  ];

  const edges = [
    ...links.map((l) => ({ id: l.id, source: l.fromId, target: l.toId, type: l.type, kind: "link" as const })),
    ...items.filter((it) => it.projectId).map((it) => ({
      id: `proj-${it.id}-${it.projectId}`,
      source: it.id,
      target: it.projectId!,
      type: "belongs",
      kind: "project" as const,
    })),
  ];

  return ok({ nodes, edges });
}
