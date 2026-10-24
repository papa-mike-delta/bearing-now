import { Owned } from "@/lib/domain/owned";
import { ok, sessionUser } from "@/lib/api";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/stats — dashboard overview for the session user
export async function GET(req: NextRequest) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const userId = session.userId;
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  const [
    inboxCount,
    tasksToday,
    tasksOverdue,
    tasksWeek,
    activeProjects,
    habits,
    reviews,
    itemsByDomain,
    itemsByType,
    completedToday,
    upcomingFinance,
    domains,
  ] = await Promise.all([
    Owned.itemCount(userId, { status: "inbox" }),
    Owned.itemCount(userId, { type: "task", status: "active", dueDate: { gte: startOfToday, lte: endOfToday } }),
    Owned.itemCount(userId, { type: "task", status: "active", dueDate: { lt: startOfToday } }),
    Owned.itemCount(userId, { type: "task", status: "active", dueDate: { gte: startOfWeek, lte: endOfWeek } }),
    Owned.projectCount(userId, { status: "active" }),
    Owned.items(userId, { where: { type: "habit", status: "active" }, include: { habitLogs: { where: { date: { gte: startOfWeek } } } } }),
    Owned.reviews(userId, { orderBy: { date: "desc" }, take: 7 }),
    Owned.itemGroups(userId, "domainId", { status: { not: "archived" } }),
    Owned.itemGroups(userId, "type", { status: { not: "archived" } }),
    Owned.itemCount(userId, { status: "done", completedAt: { gte: startOfToday, lte: endOfToday } }),
    Owned.items(userId, { where: { type: "finance", status: "active", dueDate: { gte: startOfWeek, lte: endOfWeek } } }),
    Owned.domains(userId),
  ]);

  const habitStats = habits.map((h) => {
    const meta = h.metadata ? safeParse(h.metadata) : {};
    return { id: h.id, title: h.title, target: meta.target, unit: meta.unit, doneThisWeek: h.habitLogs.length, streak: meta.streak || 0 };
  });

  const domainMap = Object.fromEntries(domains.map((d) => [d.id, d]));
  const byDomain = itemsByDomain.map((g) => ({
    domain: domainMap[g.domainId || ""]?.key,
    name: domainMap[g.domainId || ""]?.name,
    color: domainMap[g.domainId || ""]?.color,
    count: g._count,
  }));
  const byType = itemsByType.map((g) => ({ type: g.type, count: g._count }));
  const weekFinance = upcomingFinance.map((f) => safeParseItem(f));
  const weekExpense = weekFinance.filter((f) => f.metadata?.kind === "expense").reduce((s, f) => s + (f.metadata?.amount || 0), 0);
  const weekIncome = weekFinance.filter((f) => f.metadata?.kind === "income").reduce((s, f) => s + (f.metadata?.amount || 0), 0);

  return ok({
    inboxCount, tasksToday, tasksOverdue, tasksWeek, activeProjects, completedToday,
    byDomain, byType, habitStats, lastReview: reviews[0] || null, reviewCount: reviews.length,
    week: { income: weekIncome, expense: weekExpense },
  });
}

function safeParse(s: string) {
  try { return JSON.parse(s); } catch { return {}; }
}
function safeParseItem(i: any) {
  return { ...i, metadata: i.metadata ? safeParse(i.metadata) : null };
}
