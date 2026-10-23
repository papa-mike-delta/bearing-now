import type { Prisma } from "@prisma/client";
import { LinkType } from "@/lib/link-type";
import { isRevision, type DomainResult } from "./result";
import { OperationLedger, type Actor } from "./operation-ledger";
import { WriteCaps } from "./write-caps";

type LinkData = Prisma.LinkCreateManyInput;

export class LinkDomain {
  // Link changes share the source Item's revision and commit with its increment.
  private static async mutate<T>(
    data: Pick<LinkData, "fromId" | "toId"> & { type: string }, revision: number,
    actor: Actor, entry: { operation: "link.create" | "link.update" | "link.delete"; payload: unknown },
    write: (tx: Prisma.TransactionClient) => Promise<T>, purpose?: "restore",
  ): Promise<DomainResult<T>> {
    return OperationLedger.run(actor, purpose === "restore" && actor.startsWith("user:")
      ? { ...entry, operation: "link.restore" } : entry, async (tx) => {
      if (!data.toId) return { ok: false, error: "toId is required" };
      if (!isRevision(revision)) return { ok: false, error: "revision must be a non-negative integer" };
      const refusal = await WriteCaps.openItem(tx, actor, [data.fromId, data.toId]);
      if (refusal) return refusal;
      if (entry.operation === "link.create") {
        if (!LinkType.isValid(data.type)) return { ok: false, error: "Invalid Link type" };
        const existing = await tx.link.findUnique({ where: { fromId_toId_type: data } });
        if (existing) entry.operation = "link.update";
        else {
          const refusal = await WriteCaps.create(tx, actor, "link.create", 1, purpose);
          if (refusal) return refusal;
        }
      }
      const result = await tx.item.updateMany({
        where: { id: data.fromId, revision }, data: { revision: { increment: 1 } },
      });
      if (!result.count) {
        const current = await tx.item.findUnique({ where: { id: data.fromId }, select: { revision: true } });
        return { ok: false, conflict: true, currentRevision: current?.revision ?? null };
      }
      return { ok: true, value: await write(tx) };
    });
  }

  static async delete(data: Pick<LinkData, "fromId" | "toId" | "type">, revision: number, actor: Actor = "agent:internal") {
    // Legacy Link types must remain removable.
    const { fromId, toId, type = "related_to" } = data;
    return LinkDomain.mutate({ fromId, toId, type }, revision, actor,
      { operation: "link.delete", payload: { data, revision } }, async (tx) => {
        await tx.link.deleteMany({ where: { fromId, toId, type } });
        return { deleted: true };
      });
  }

  static async create(data: LinkData, revision: number, actor: Actor = "agent:internal", purpose?: "restore") {
    const type = data.type === undefined ? "related_to" : data.type;
    const { fromId, toId, note } = data;
    return LinkDomain.mutate({ fromId, toId, type }, revision, actor,
      { operation: "link.create", payload: { data, revision } }, (tx) => tx.link.upsert({
        where: { fromId_toId_type: { fromId, toId, type } },
        update: { note }, create: {
          fromId, toId, type, note,
          ...(data.id !== undefined ? { id: data.id } : {}),
          ...(data.createdAt !== undefined ? { createdAt: data.createdAt } : {}),
        },
      }), purpose);
  }
}
