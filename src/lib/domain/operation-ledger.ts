import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { DomainResult } from "./result";
import { coachActivityWrites, explainReceipt, receiptActivityLine, receiptItemRefs } from "@/lib/coach/receipt-explanation";

export type Actor = `user:${string}` | `agent:${string}`;

export type CoachActivity = {
  id: string;
  operation: string;
  status: string;
  line: string;
  createdAt: string;
};

export class OperationLedger {
  static async run<T>(
    actor: Actor,
    userId: string,
    entry: { operation: string; payload: unknown },
    write: (tx: Prisma.TransactionClient) => Promise<DomainResult<T>>,
    transaction?: Prisma.TransactionClient,
  ): Promise<DomainResult<T>> {
    // Composition (e.g. restore) must share both writes and receipts. Always
    // take the same reentrant transaction lock, including for supplied clients.
    const run = async (tx: Prisma.TransactionClient) => {
      // One transaction lock keeps cap counts and open-item checks sound across
      // workers, including concurrent maintenance and presence changes.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(731909)::text`;
      const result = await write(tx);
      const receipt = await tx.operationLedger.create({ data: {
        actor,
        userId,
        operation: entry.operation,
        payload: JSON.stringify(entry.payload),
        status: result.ok ? "success" : "refused",
        receipt: JSON.stringify(result),
        createdAt: new Date(),
      } });
      return { ...result, receiptId: receipt.id };
    };
    return transaction ? run(transaction) : db.$transaction(run);
  }

  static async coachReceipt(userId: string, id: string) {
    const entry = await db.operationLedger.findFirst({ where: { id, userId, actor: "agent:coach" } });
    if (!entry || entry.actor !== "agent:coach" || entry.userId !== userId) return null;
    return entry;
  }

  static async listCoachActivity(userId: string): Promise<CoachActivity[]> {
    const entries = await db.operationLedger.findMany({
      where: {
        userId,
        actor: "agent:coach",
        OR: [{ status: "refused" }, { operation: { in: coachActivityWrites } }],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const ids = [...new Set(entries.flatMap((entry) => {
      const refs = receiptItemRefs(entry);
      return [refs.itemId, refs.fromId, refs.toId].filter((id): id is string => id !== undefined);
    }))];
    const items = await db.item.findMany({ where: { id: { in: ids }, userId }, select: { id: true, title: true } });
    const titles = new Map(items.map((item) => [item.id, item.title]));
    return entries.map((entry) => ({
      id: entry.id,
      operation: entry.operation,
      status: entry.status,
      line: receiptActivityLine(explainReceipt(entry, titles)),
      createdAt: entry.createdAt.toISOString(),
    }));
  }
}
