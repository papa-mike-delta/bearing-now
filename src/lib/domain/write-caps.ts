import type { Prisma } from "@prisma/client";
import type { Actor } from "./operation-ledger";

export class WriteCaps {
  static openPrefix(userId: string, itemId: string) {
    return `open-item:${userId}:${Buffer.from(itemId).toString("hex")}:`;
  }

  static async openItem(tx: Prisma.TransactionClient, actor: Actor, userId: string, itemIds?: string[]) {
    if (actor.startsWith("user:")) return null;
    const marker = await tx.setting.findFirst({ where: {
      userId,
      ...(itemIds ? { OR: itemIds.map((id) => ({ id: { startsWith: WriteCaps.openPrefix(userId, id) } })) } :
        { id: { startsWith: `open-item:${userId}:` } }),
      value: { gt: new Date().toISOString() },
    } });
    return marker ? {
      ok: false, itemOpen: true,
      itemId: Buffer.from(marker.id.split(":")[2], "hex").toString(),
    } as const : null;
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
