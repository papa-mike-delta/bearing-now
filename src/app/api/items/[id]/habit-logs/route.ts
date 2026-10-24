import { format } from "date-fns";
import { db } from "@/lib/db";
import { ok, bad, parseBody } from "@/lib/api";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// GET /api/items/[id]/habit-logs
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const logs = await db.habitLog.findMany({ where: { itemId: id }, orderBy: { date: "desc" } });
  return ok({ logs });
}

// POST /api/items/[id]/habit-logs — toggle log for a given date
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
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
