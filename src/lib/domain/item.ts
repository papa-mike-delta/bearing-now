import type { Prisma } from "@prisma/client";
import { OperationLedger, type Actor } from "./operation-ledger";
import { WriteCaps } from "./write-caps";
import { isRevision, type DomainResult } from "./result";

type ItemData = Omit<Prisma.ItemCreateManyInput, "revision" | "userId">;
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
  // One check: a parent id the caller does not own is the same as a missing id.
  private static async sameOwner(
    tx: Prisma.TransactionClient,
    userId: string,
    data: { domainId?: string | null; projectId?: string | null },
  ): Promise<{ ok: false; error: string } | null> {
    if (data.domainId) {
      const domain = await tx.domain.findFirst({ where: { id: data.domainId, userId }, select: { id: true } });
      if (!domain) return { ok: false, error: "Not found" };
    }
    if (data.projectId) {
      const project = await tx.project.findFirst({ where: { id: data.projectId, userId }, select: { id: true } });
      if (!project) return { ok: false, error: "Not found" };
    }
    return null;
  }

  static setOpen(userId: string, id: string, lease: string, open: boolean, actor: Actor) {
    return OperationLedger.run(actor, userId, { operation: open ? "item.open" : "item.close", payload: { id, lease } }, async (tx) => {
      if (!actor.startsWith("user:")) return { ok: false, error: "Only users can mark Items open" };
      if (typeof lease !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(lease)) return { ok: false, error: "Invalid open-item lease" };
      const owned = await tx.item.findFirst({ where: { id, userId }, select: { id: true } });
      if (!owned) return { ok: false, error: "Not found" };
      const prefix = WriteCaps.openPrefix(userId, id);
      const key = `${prefix}${Buffer.from(actor).toString("hex")}:${lease}`;
      const now = new Date();
      await tx.setting.deleteMany({ where: { userId, id: { startsWith: prefix }, value: { lte: now.toISOString() } } });
      if (open) {
        const value = new Date(now.getTime() + 90_000).toISOString();
        await tx.setting.upsert({ where: { id: key }, create: { id: key, value, userId }, update: { value } });
      } else {
        await tx.setting.deleteMany({ where: { id: key, userId } });
      }
      return { ok: true, value: { open } };
    });
  }

  static async create(userId: string, data: ItemData, tagNames: string[] = [], actor: Actor = "agent:internal", purpose?: "restore", transaction?: Prisma.TransactionClient) {
    return OperationLedger.run(actor, userId, { operation: purpose === "restore" && actor.startsWith("user:") ? "item.restore" : "item.create", payload: { data, tagNames } }, async (tx) => {
      if (!data.title) return { ok: false, error: "title is required" };
      if (!data.type) return { ok: false, error: "type is required" };
      const parent = await ItemDomain.sameOwner(tx, userId, data);
      if (parent) return parent;
      const refusal = await WriteCaps.create(tx, actor, userId, "item.create", 1, purpose);
      if (refusal) return refusal;
      const value = await tx.item.create({
        data: {
          ...changes(data), type: data.type, title: data.title, userId,
          id: data.id, createdAt: data.createdAt, updatedAt: data.updatedAt,
          revision: 0,
          tags: { create: [...new Set(tagNames)].map((name) => ({
            tag: { connectOrCreate: { where: { userId_name: { userId, name } }, create: { name, userId } } },
          })) },
        },
        include,
      });
      return { ok: true, value } as const;
    }, transaction);
  }

  static archive(userId: string, id: string, revision: number, actor: Actor = "agent:internal") {
    return ItemDomain.edit(userId, id, revision, { status: "archived", completedAt: null }, undefined, actor, "item.archive");
  }

  static update(userId: string, id: string, revision: number, data: ItemChanges, tagNames?: string[], actor: Actor = "agent:internal") {
    return ItemDomain.edit(userId, id, revision, data, tagNames, actor, "item.update");
  }

  private static async edit(userId: string, id: string, revision: number, data: ItemChanges, tagNames: string[] | undefined, actor: Actor, operation: string) {
    const patch = changes(data);
    if (patch.status === "done" && !patch.completedAt) patch.completedAt = new Date();
    if (patch.status && patch.status !== "done") patch.completedAt = null;
    return OperationLedger.run(actor, userId, { operation, payload: { id, revision, data, tagNames } }, async (tx): Promise<DomainResult<Prisma.ItemGetPayload<{ include: typeof include }>>> => {
      if (!isRevision(revision)) return { ok: false, error: "revision must be a non-negative integer" };
      const parent = await ItemDomain.sameOwner(tx, userId, patch);
      if (parent) return parent;
      const refusal = await WriteCaps.openItem(tx, actor, userId, [id]);
      if (refusal) return refusal;
      const result = await tx.item.updateMany({
        where: { id, userId, revision },
        data: { ...patch, revision: { increment: 1 } },
      });
      if (!result.count) {
        const current = await tx.item.findFirst({ where: { id, userId }, select: { revision: true } });
        return { ok: false, conflict: true, currentRevision: current?.revision ?? null };
      }
      if (tagNames) {
        await tx.tagOnItem.deleteMany({ where: { itemId: id } });
        const rows = await Promise.all([...new Set(tagNames)].map(async (name) => {
          const tag = await tx.tag.upsert({ where: { userId_name: { userId, name } }, update: {}, create: { name, userId } });
          return { itemId: id, tagId: tag.id };
        }));
        if (rows.length) await tx.tagOnItem.createMany({ data: rows });
      }
      return { ok: true, value: await tx.item.findUniqueOrThrow({ where: { id }, include }) };
    });
  }
}
