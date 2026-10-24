import { isProjectColor } from "@/lib/product-colors";
import { db } from "@/lib/db";
import { Owned } from "@/lib/domain/owned";
import { ok, bad, notFound, parseBody, parseMeta, sessionUser } from "@/lib/api";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/projects
export async function GET(req: NextRequest) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const sp = req.nextUrl.searchParams;
  const where: any = {};
  const status = sp.get("status");
  if (status) where.status = status.split(",").length > 1 ? { in: status.split(",") } : status;
  const domain = sp.get("domain");
  if (domain) where.domainId = domain;

  const projects = await Owned.projects(session.userId, {
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      domain: true,
      _count: { select: { items: true } },
    },
  });
  // attach computed item stats
  const withStats = await Promise.all(
    projects.map(async (p) => {
      const items = await Owned.items(session.userId, {
        where: { projectId: p.id, status: { in: ["active", "done", "inbox"] } },
        select: { type: true, status: true, dueDate: true },
      });
      const tasks = items.filter((i) => i.type === "task");
      return {
        ...p,
        itemCount: items.length,
        taskTotal: tasks.length,
        taskDone: tasks.filter((t) => t.status === "done").length,
        taskActive: tasks.filter((t) => t.status === "active").length,
        upcomingDue: items.filter((i) => i.dueDate && new Date(i.dueDate) >= new Date()).length,
      };
    }),
  );
  return ok({ projects: withStats });
}

// POST /api/projects
export async function POST(req: NextRequest) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const body = await parseBody(req);
  if (!body.name) return bad("name is required");
  const { userId: _userId, ...data } = body;
  if (data.color !== undefined && data.color !== null && !isProjectColor(data.color)) return bad("color must be a hex color or null");
  if (data.domainId && !await Owned.domain(session.userId, data.domainId)) return notFound();
  const project = await db.project.create({ data: { ...data, color: data.color ?? null, userId: session.userId }, include: { domain: true } });
  return ok(parseMeta(project as any));
}
