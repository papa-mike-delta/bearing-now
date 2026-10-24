import type { Prisma } from "@prisma/client";
import type { Actor } from "./operation-ledger";
import type { DomainResult } from "./result";

const TTL_MS = 90_000;
const validLease = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(value);
const ownerPrefix = (userId: string) => `open-item:${userId}:`;
const itemPrefix = (userId: string, itemId: string) => `${ownerPrefix(userId)}${Buffer.from(itemId).toString("hex")}:`;

function unhex(value: string) {
  if (!/^(?:[0-9a-f]{2})+$/.test(value)) return null;
  const decoded = Buffer.from(value, "hex").toString("utf8");
  if (decoded.includes("\0")) return null; // PostgreSQL text cannot contain NUL.
  return Buffer.from(decoded).toString("hex") === value ? decoded : null;
}

function activeItem(row: { id: string; value: string; userId: string }, userId: string, now: Date) {
  if (row.userId !== userId || !row.id.startsWith(ownerPrefix(userId))) return null;
  const parts = row.id.slice(ownerPrefix(userId).length).split(":");
  if (parts.length !== 3 || !validLease(parts[2])) return null;
  const itemId = unhex(parts[0]);
  const actor = unhex(parts[1]);
  if (!itemId || actor !== `user:${userId}`) return null;
  const expiry = new Date(row.value);
  if (!Number.isFinite(expiry.getTime()) || expiry.toISOString() !== row.value || expiry <= now) return null;
  return itemId;
}

/** Owns the Setting representation. Call mutations under OperationLedger's lock. */
export class OpenItemLeases {
  static async setOpen(tx: Prisma.TransactionClient, userId: string, id: string, lease: unknown, open: boolean, actor: Actor): Promise<DomainResult<{ open: boolean }>> {
    if (!actor.startsWith("user:")) return { ok: false, error: "Only users can mark Items open" };
    if (actor !== `user:${userId}`) return { ok: false, error: "Only the owning user can mark Items open" };
    if (!validLease(lease)) return { ok: false, error: "Invalid open-item lease" };
    const owned = await tx.item.findFirst({ where: { id, userId }, select: { id: true } });
    if (!owned) return { ok: false, error: "Not found" };
    const prefix = itemPrefix(userId, id);
    const key = `${prefix}${Buffer.from(actor).toString("hex")}:${lease}`;
    // A contradictory/corrupt Setting must not be refreshed or reassigned from
    // another owner just because its id happens to match this canonical key.
    const existing = await tx.setting.findUnique({ where: { id: key }, select: { userId: true } });
    if (existing && existing.userId !== userId) return { ok: false, error: "Not found" };
    const now = new Date();
    await tx.setting.deleteMany({ where: { userId, id: { startsWith: prefix }, value: { lte: now.toISOString() } } });
    if (open) {
      const value = new Date(now.getTime() + TTL_MS).toISOString();
      await tx.setting.upsert({ where: { id: key }, create: { id: key, value, userId }, update: { value } });
    } else {
      await tx.setting.deleteMany({ where: { id: key, userId } });
    }
    return { ok: true, value: { open } };
  }

  private static async candidates(tx: Prisma.TransactionClient, userId: string, itemIds?: string[]) {
    if (itemIds?.length === 0) return [];
    const now = new Date();
    const rows = await tx.setting.findMany({ where: {
      userId,
      ...(itemIds ? { OR: [...new Set(itemIds)].map((id) => ({ id: { startsWith: itemPrefix(userId, id) } })) }
        : { id: { startsWith: ownerPrefix(userId) } }),
      value: { gt: now.toISOString() },
    } });
    const allowed = itemIds ? new Set(itemIds) : null;
    return [...new Set(rows.flatMap((row) => {
      const id = activeItem(row, userId, now);
      return id && (!allowed || allowed.has(id)) ? [id] : [];
    }))];
  }

  static async protectedItem(tx: Prisma.TransactionClient, userId: string, itemIds?: string[]) {
    const ids = await OpenItemLeases.candidates(tx, userId, itemIds);
    if (!ids.length) return null;
    // Settings have no Item foreign key. Orphaned/foreign Item markers must not
    // block writes when enumeration would correctly omit them.
    const owned = await tx.item.findMany({ where: { userId, id: { in: ids } }, select: { id: true } });
    const found = new Set(owned.map((item) => item.id));
    return ids.find((id) => found.has(id)) ?? null;
  }

  static async list(tx: Prisma.TransactionClient, userId: string) {
    const ids = await OpenItemLeases.candidates(tx, userId);
    return tx.item.findMany({ where: { userId, id: { in: ids } }, orderBy: { title: "asc" } });
  }
}
