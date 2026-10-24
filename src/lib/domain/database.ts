import { OperationLedger, type Actor } from "./operation-ledger";
import { WriteCaps } from "./write-caps";

export class DatabaseDomain {
  // Reset/restore replaces the whole dataset; it is not an Item edit. Keep the
  // destructive maintenance operation separate from revision-checked mutations.
  static async clear(userId: string, actor: Actor = "agent:internal", plannedCreates?: { items: number; links: number }) {
    return OperationLedger.run(actor, userId, { operation: "database.clear", payload: plannedCreates ?? {} }, async (tx) => {
      const refusal = await WriteCaps.openItem(tx, actor, userId);
      if (refusal) return refusal;
      // Restore must not erase the dataset before discovering that its input
      // cannot fit in the actor's remaining create allowance.
      if (plannedCreates?.items) {
        const capped = await WriteCaps.create(tx, actor, userId, "item.create", plannedCreates.items, "restore");
        if (capped) return capped;
      }
      if (plannedCreates?.links) {
        const capped = await WriteCaps.create(tx, actor, userId, "link.create", plannedCreates.links, "restore");
        if (capped) return capped;
      }
      await tx.habitLog.deleteMany({ where: { item: { userId } } });
      await tx.reviewItem.deleteMany({ where: { review: { userId } } });
      await tx.review.deleteMany({ where: { userId } });
      await tx.link.deleteMany({ where: { from: { userId } } });
      await tx.tagOnItem.deleteMany({ where: { item: { userId } } });
      await tx.tag.deleteMany({ where: { userId } });
      await tx.item.deleteMany({ where: { userId } });
      await tx.project.deleteMany({ where: { userId } });
      await tx.domain.deleteMany({ where: { userId } });
      await tx.setting.deleteMany({ where: { userId } });
      return { ok: true, value: { cleared: true } };
    });
  }
}
