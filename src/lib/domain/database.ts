import { OperationLedger, type Actor } from "./operation-ledger";
import { WriteCaps } from "./write-caps";

export class DatabaseDomain {
  // Reset/restore replaces the whole dataset; it is not an Item edit. Keep the
  // destructive maintenance operation separate from revision-checked mutations.
  static async clear(actor: Actor = "agent:internal", plannedCreates?: { items: number; links: number }) {
    return OperationLedger.run(actor, { operation: "database.clear", payload: plannedCreates ?? {} }, async (tx) => {
      const refusal = await WriteCaps.openItem(tx, actor);
      if (refusal) return refusal;
      // Restore must not erase the dataset before discovering that its input
      // cannot fit in the actor's remaining create allowance.
      if (plannedCreates?.items) {
        const capped = await WriteCaps.create(tx, actor, "item.create", plannedCreates.items, "restore");
        if (capped) return capped;
      }
      if (plannedCreates?.links) {
        const capped = await WriteCaps.create(tx, actor, "link.create", plannedCreates.links, "restore");
        if (capped) return capped;
      }
      await tx.habitLog.deleteMany();
      await tx.reviewItem.deleteMany();
      await tx.review.deleteMany();
      await tx.link.deleteMany();
      await tx.tagOnItem.deleteMany();
      await tx.tag.deleteMany();
      await tx.item.deleteMany();
      await tx.project.deleteMany();
      await tx.domain.deleteMany();
      return { ok: true, value: { cleared: true } };
    });
  }
}
