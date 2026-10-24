import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { DomainResult } from "./result";

export type Actor = `user:${string}` | `agent:${string}`;

export type CoachActivity = {
  id: string;
  operation: string;
  status: string;
  line: string;
  createdAt: string;
};

// Successful reads stay out of the feed; a missing success verb marks those operations.
const coachActions: Record<string, { success?: string; refused: string }> = {
  "item.create": { success: "Created", refused: "Refused create" },
  "item.update": { success: "Updated", refused: "Refused update" },
  "item.archive": { success: "Archived", refused: "Refused archive" },
  "link.create": { success: "Linked", refused: "Refused link" },
  "link.update": { success: "Linked", refused: "Refused link" },
  "link.delete": { success: "Unlinked", refused: "Refused unlink" },
  "coach.getItem": { refused: "Refused read" },
  "coach.getLinks": { refused: "Refused read links" },
  "coach.searchItems": { refused: "Refused search" },
  "coach.listOpenItems": { refused: "Refused list" },
};

const coachWrites = Object.keys(coachActions).filter((operation) => coachActions[operation].success);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function parseJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}

function itemRefs(operation: string, payload: unknown, receipt: unknown): { itemId?: string; fromId?: string; toId?: string } {
  const body = asRecord(payload);
  const data = asRecord(body?.data);
  const result = asRecord(receipt);
  const value = asRecord(result?.value);
  if (operation.startsWith("link.")) {
    return {
      fromId: nonEmptyString(data?.fromId) ?? nonEmptyString(body?.fromId) ?? nonEmptyString(value?.fromId),
      toId: nonEmptyString(data?.toId) ?? nonEmptyString(body?.toId) ?? nonEmptyString(value?.toId),
    };
  }
  return {
    itemId: nonEmptyString(body?.id) ?? nonEmptyString(data?.id) ?? nonEmptyString(value?.id) ?? nonEmptyString(result?.itemId),
  };
}

function storedTitle(payload: unknown, receipt: unknown): string | undefined {
  const body = asRecord(payload);
  const data = asRecord(body?.data);
  const result = asRecord(receipt);
  const value = asRecord(result?.value);
  const first = Array.isArray(result?.value) ? asRecord(result.value[0]) : null;
  return nonEmptyString(value?.title) ?? nonEmptyString(data?.title) ?? nonEmptyString(first?.title);
}

function liveTitle(id: string | undefined, titles: Map<string, string>): string | undefined {
  return id ? nonEmptyString(titles.get(id)) : undefined;
}

function activityLine(operation: string, status: string, payload: unknown, receipt: unknown, titles: Map<string, string>): string {
  const verbs = coachActions[operation];
  const action = status === "success" ? verbs?.success ?? operation : verbs?.refused ?? `Refused ${operation}`;
  const refs = itemRefs(operation, payload, receipt);
  const stored = storedTitle(payload, receipt);
  if (operation.startsWith("link.")) {
    const from = liveTitle(refs.fromId, titles) ?? stored ?? "Item";
    const to = liveTitle(refs.toId, titles);
    return to ? `${action} ${from} → ${to}` : `${action} ${from}`;
  }
  return `${action} ${liveTitle(refs.itemId, titles) ?? stored ?? "Item"}`;
}

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
        OR: [{ status: "refused" }, { operation: { in: coachWrites } }],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const parsed = entries.map((entry) => ({
      entry,
      payload: parseJson(entry.payload),
      receipt: parseJson(entry.receipt),
    }));
    const ids = [...new Set(parsed.flatMap(({ entry, payload, receipt }) => {
      const refs = itemRefs(entry.operation, payload, receipt);
      return [refs.itemId, refs.fromId, refs.toId].filter((id): id is string => id !== undefined);
    }))];
    const items = await db.item.findMany({ where: { id: { in: ids }, userId }, select: { id: true, title: true } });
    const titles = new Map(items.map((item) => [item.id, item.title]));
    return parsed.map(({ entry, payload, receipt }) => ({
      id: entry.id,
      operation: entry.operation,
      status: entry.status,
      line: activityLine(entry.operation, entry.status, payload, receipt, titles),
      createdAt: entry.createdAt.toISOString(),
    }));
  }
}
