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

const coachWrites = Object.entries(coachActions).flatMap(([operation, verbs]) => verbs.success ? [operation] : []);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function itemTitle(payload: unknown, receipt: unknown): string {
  const body = record(payload);
  const result = record(receipt);
  const data = record(body?.data);
  const value = record(result?.value);
  const first = Array.isArray(result?.value) ? record(result.value[0]) : null;
  return text(value?.title) ?? text(data?.title) ?? text(first?.title)
    ?? text(body?.id) ?? text(data?.fromId) ?? text(body?.q) ?? "Item";
}

function activityLine(entry: { operation: string; status: string; payload: string; receipt: string }): string {
  const verbs = coachActions[entry.operation];
  const verb = entry.status === "success" ? verbs?.success ?? entry.operation : verbs?.refused ?? `Refused ${entry.operation}`;
  let payload: unknown;
  let receipt: unknown;
  try { payload = JSON.parse(entry.payload); } catch { payload = null; }
  try { receipt = JSON.parse(entry.receipt); } catch { receipt = null; }
  return `${verb} ${itemTitle(payload, receipt)}`;
}

export class OperationLedger {
  static async run<T>(
    actor: Actor,
    entry: { operation: string; payload: unknown },
    write: (tx: Prisma.TransactionClient) => Promise<DomainResult<T>>,
  ): Promise<DomainResult<T>> {
    return db.$transaction(async (tx) => {
      // One transaction lock keeps cap counts and open-item checks sound across
      // workers, including concurrent maintenance and presence changes.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(731909)::text`;
      const result = await write(tx);
      const receipt = await tx.operationLedger.create({ data: {
        actor,
        operation: entry.operation,
        payload: JSON.stringify(entry.payload),
        status: result.ok ? "success" : "refused",
        receipt: JSON.stringify(result),
        createdAt: new Date(),
      } });
      return { ...result, receiptId: receipt.id };
    });
  }

  static async listCoachActivity(): Promise<CoachActivity[]> {
    const entries = await db.operationLedger.findMany({
      where: {
        actor: "agent:coach",
        OR: [{ status: "refused" }, { operation: { in: coachWrites } }],
      },
      orderBy: { createdAt: "desc" },
    });
    return entries.map((entry) => ({
      id: entry.id,
      operation: entry.operation,
      status: entry.status,
      line: activityLine(entry),
      createdAt: entry.createdAt.toISOString(),
    }));
  }
}
