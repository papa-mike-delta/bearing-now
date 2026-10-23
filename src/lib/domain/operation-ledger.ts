import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { DomainResult } from "./result";

export type Actor = `user:${string}` | `agent:${string}`;

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
}
