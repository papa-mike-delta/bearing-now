import { isProjectColor } from "@/lib/product-colors";
import { ItemDomain } from "@/lib/domain/item";
import { Owned } from "@/lib/domain/owned";
import { db } from "@/lib/db";
import { writeActor, sessionUser, bad, ok, domainResponse, notFound, parseBody, parseMeta } from "@/lib/api";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/projects/[id] — unified dashboard
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const project = await Owned.project(session.userId, id);
  if (!project) return notFound();

  const items = await Owned.items(session.userId, {
    where: { projectId: id },
    include: { tags: { include: { tag: true } }, domain: true },
  });

  const byType: Record<string, any[]> = {};
  for (const it of items) {
    (byType[it.type] ||= []).push(parseMeta(it as any));
  }

  const tasks = items.filter((i) => i.type === "task");
  const finances = items.filter((i) => i.type === "finance").map((f) => parseMeta(f as any));
  const income = finances.filter((f) => f.metadata?.kind === "income").reduce((s, f) => s + (f.metadata?.amount || 0), 0);
  const expense = finances.filter((f) => f.metadata?.kind === "expense").reduce((s, f) => s + (f.metadata?.amount || 0), 0);

  return ok({
    project,
    items: items.map((i) => parseMeta(i as any)),
    byType,
    stats: {
      total: items.length,
      tasksDone: tasks.filter((t) => t.status === "done").length,
      tasksActive: tasks.filter((t) => t.status === "active").length,
      income,
      expense,
      net: income - expense,
    },
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!await Owned.project(session.userId, id)) return notFound();
  const body = await parseBody(req);
  const { userId: _userId, ...data } = body;
  if (data.color !== undefined && data.color !== null && !isProjectColor(data.color)) return bad("color must be a hex color or null");
  if (data.domainId && !await Owned.domain(session.userId, data.domainId)) return notFound();
  const project = await db.project.update({ where: { id }, data, include: { domain: true } });
  return ok(parseMeta(project as any));
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!await Owned.project(session.userId, id)) return notFound();
  const actor = await writeActor(req);
  // unlink items first
  const items = await Owned.items(session.userId, { where: { projectId: id } });
  for (const item of items) {
    const result = await ItemDomain.update(session.userId, item.id, item.revision, { projectId: null }, undefined, actor);
    if (!result.ok) return domainResponse(result);
  }
  await db.project.delete({ where: { id } }).catch(() => {});
  return ok({ deleted: true });
}
