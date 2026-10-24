import { ItemDomain } from "@/lib/domain/item";
import { Owned } from "@/lib/domain/owned";
import { domainResponse, ok, sessionUser } from "@/lib/api";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

// POST /api/scheduler — roll the session user's recurring items whose due date has passed.
export async function POST(req: NextRequest) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const userId = session.userId;
  const now = new Date();
  const results: { type: string; created: number; details: string[] }[] = [];

  const recurringFinances = await Owned.items(userId, {
    where: { type: "finance", status: "active", dueDate: { lt: now } },
  });

  const financeDetails: string[] = [];
  for (const f of recurringFinances) {
    const meta = f.metadata ? safeParse(f.metadata) : {};
    if (!meta.recurring || meta.recurring === "one-time") continue;

    const oldDue = f.dueDate ? new Date(f.dueDate) : now;
    let nextDue = new Date(oldDue);
    const periods: Record<string, number> = { weekly: 7, monthly: 30, yearly: 365 };
    const days = periods[meta.recurring] || 30;
    while (nextDue < now) nextDue = new Date(nextDue.getTime() + days * 86400000);

    const result = await ItemDomain.update(userId, f.id, f.revision, { dueDate: nextDue }, undefined, "agent:scheduler");
    if (!result.ok) return domainResponse(result);
    financeDetails.push(`${f.title} → ${nextDue.toISOString().slice(0, 10)}`);
  }
  if (financeDetails.length) results.push({ type: "finance", created: financeDetails.length, details: financeDetails });

  const habits = await Owned.items(userId, {
    where: { type: "habit", status: "active" },
    include: { habitLogs: { orderBy: { date: "desc" }, take: 2 } },
  });

  let streaksReset = 0;
  for (const h of habits) {
    const meta = h.metadata ? safeParse(h.metadata) : {};
    if (!meta.streak || meta.streak === 0) continue;
    const lastLog = h.habitLogs[0];
    if (lastLog) {
      const daysSince = Math.floor((now.getTime() - new Date(lastLog.date).getTime()) / 86400000);
      if (daysSince > 2) {
        const result = await ItemDomain.update(userId, h.id, h.revision, { metadata: JSON.stringify({ ...meta, streak: 0 }) }, undefined, "agent:scheduler");
        if (!result.ok) return domainResponse(result);
        streaksReset++;
      }
    }
  }
  if (streaksReset > 0) {
    results.push({ type: "habit-streak-reset", created: streaksReset, details: [`${streaksReset} habit streaks reset due to inactivity`] });
  }

  return ok({
    runAt: now.toISOString(),
    results,
    summary: { financeUpdated: financeDetails.length, streaksReset },
  });
}

function safeParse(s: string) {
  try { return JSON.parse(s); } catch { return {}; }
}
