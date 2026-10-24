import type { Prisma } from "@prisma/client";
import { OpenItemLeases } from "./open-item-leases";
import type { Actor } from "./operation-ledger";

export class WriteCaps {
  static async openItem(tx: Prisma.TransactionClient, actor: Actor, userId: string, itemIds?: string[]) {
    if (actor.startsWith("user:")) return null;
    const itemId = await OpenItemLeases.protectedItem(tx, userId, itemIds);
    return itemId ? { ok: false, itemOpen: true, itemId } as const : null;
  }

  // Called under OperationLedger's transaction lock; only committed creates count.
  static async create(tx: Prisma.TransactionClient, actor: Actor, userId: string, operation: "item.create" | "link.create", amount = 1, purpose?: "restore") {
    // Only an authenticated user may bypass create caps for a backup restore.
    if (purpose === "restore" && actor.startsWith("user:")) return null;
    const limit = operation === "item.create" ? 20 : 50;
    const count = await tx.operationLedger.count({ where: {
      userId, actor, operation, status: "success",
      createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
    } });
    return count + amount > limit ? { ok: false, rateLimited: true, limit } as const : null;
  }
}
