import { format } from "date-fns";
import { db } from "@/lib/db";
import { getHabitLogs } from "@/lib/domain/item-queries";
import { ok, bad, notFound, parseBody, sessionUser } from "@/lib/api";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/items/[id]/habit-logs
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const logs = await getHabitLogs(id, session.userId);
  if (!logs) return notFound();
  return ok({ logs });
}

// POST /api/items/[id]/habit-logs — toggle log for a given date
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const owned = await db.item.findFirst({ where: { id, userId: session.userId }, select: { id: true } });
  if (!owned) return notFound();
  const body = await parseBody(req);
  const dateStr = body.date || format(new Date(), "yyyy-MM-dd");
  // A habit log stores the supplied calendar date at UTC midnight.
  const date = new Date(dateStr);

  const existing = await db.habitLog.findUnique({ where: { itemId_date: { itemId: id, date } } });
  if (existing) {
    await db.habitLog.delete({ where: { id: existing.id } });
    return ok({ logged: false });
  }
  const log = await db.habitLog.create({ data: { itemId: id, date, value: body.value ?? 1, note: body.note } });
  return ok({ logged: true, log });
}
