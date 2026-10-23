import { db } from "@/lib/db";

export class DatabaseDomain {
  // Reset/restore replaces the whole dataset; it is not an Item edit. Keep the
  // destructive maintenance operation separate from revision-checked mutations.
  static async clear() {
    await db.habitLog.deleteMany();
    await db.reviewItem.deleteMany();
    await db.review.deleteMany();
    await db.link.deleteMany();
    await db.tagOnItem.deleteMany();
    await db.tag.deleteMany();
    await db.item.deleteMany();
    await db.project.deleteMany();
    await db.domain.deleteMany();
  }
}
