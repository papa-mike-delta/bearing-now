import type { Prisma } from "@prisma/client";
import type { Actor } from "./operation-ledger";

export class WriteCaps {
  static openPrefix(itemId: string) {
    return `open-item:${Buffer.from(itemId).toString("hex")}:`;
  }

  static async openItem(tx: Prisma.TransactionClient, actor: Actor, itemIds?: string[]) {
    if (actor.startsWith("user:")) return null;
    const marker = await tx.setting.findFirst({ where: {
      ...(itemIds ? { OR: itemIds.map((id) => ({ id: { startsWith: WriteCaps.openPrefix(id) } })) } :
        { id: { startsWith: "open-item:" } }),
      value: { gt: new Date().toISOString() },
    } });
    return marker ? {
      ok: false, itemOpen: true,
      itemId: Buffer.from(marker.id.split(":")[1], "hex").toString(),
    } as const : null;
  }

  // Called under OperationLedger's transaction lock; only committed creates count.
  static async create(tx: Prisma.TransactionClient, actor: Actor, operation: "item.create" | "link.create", amount = 1) {
    const limit = operation === "item.create" ? 20 : 50;
    const count = await tx.operationLedger.count({ where: {
      actor, operation, status: "success",
      createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
    } });
    return count + amount > limit ? { ok: false, rateLimited: true, limit } as const : null;
  }
}
