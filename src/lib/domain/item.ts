import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isRevision, type DomainResult } from "./result";

type ItemData = Omit<Prisma.ItemCreateManyInput, "revision">;
type ItemChanges = Partial<Omit<ItemData, "id" | "createdAt" | "updatedAt">>;

const include = {
  tags: { include: { tag: true } },
  domain: true,
  project: { select: { id: true, name: true, color: true } },
} as const;

// Only scalar editable fields may cross the write boundary. Nested writes could
// otherwise bypass revision checks on other Items or Links.
const fields = [
  "type", "title", "content", "domainId", "projectId", "status", "priority", "energy",
  "startDate", "dueDate", "scheduledAt", "completedAt", "summary", "relationshipTier",
  "phone", "birthday", "startAt", "endAt", "frequency", "metadata",
] as const;

function changes(data: ItemChanges): ItemChanges {
  return Object.fromEntries(fields.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]));
}

export class ItemDomain {
  static async create(data: ItemData, tagNames: string[] = []) {
    const value = await db.item.create({
      data: {
        ...changes(data), type: data.type, title: data.title,
        id: data.id, createdAt: data.createdAt, updatedAt: data.updatedAt,
        revision: 0,
        tags: { create: [...new Set(tagNames)].map((name) => ({
          tag: { connectOrCreate: { where: { name }, create: { name } } },
        })) },
      },
      include,
    });
    return { ok: true, value } as const;
  }

  static archive(id: string, revision: number) {
    return ItemDomain.update(id, revision, { status: "archived", completedAt: null });
  }

  static async update(id: string, revision: number, data: ItemChanges, tagNames?: string[]) {
    if (!isRevision(revision)) return { ok: false, error: "revision must be a non-negative integer" } as const;
    const patch = changes(data);
    if (patch.status === "done" && !patch.completedAt) patch.completedAt = new Date();
    if (patch.status && patch.status !== "done") patch.completedAt = null;
    return db.$transaction(async (tx): Promise<DomainResult<Prisma.ItemGetPayload<{ include: typeof include }>>> => {
      const result = await tx.item.updateMany({
        where: { id, revision },
        data: { ...patch, revision: { increment: 1 } },
      });
      if (!result.count) {
        const current = await tx.item.findUnique({ where: { id }, select: { revision: true } });
        return { ok: false, conflict: true, currentRevision: current?.revision ?? null };
      }
      if (tagNames) {
        await tx.tagOnItem.deleteMany({ where: { itemId: id } });
        const rows = await Promise.all([...new Set(tagNames)].map(async (name) => {
          const tag = await tx.tag.upsert({ where: { name }, update: {}, create: { name } });
          return { itemId: id, tagId: tag.id };
        }));
        if (rows.length) await tx.tagOnItem.createMany({ data: rows });
      }
      return { ok: true, value: await tx.item.findUniqueOrThrow({ where: { id }, include }) };
    });
  }
}
