import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { LinkType } from "@/lib/link-type";
import { isRevision, type DomainResult } from "./result";

type LinkData = Prisma.LinkCreateManyInput;

export class LinkDomain {
  // Link changes share the source Item's revision and commit with its increment.
  private static async mutate<T>(fromId: string, revision: number, write: (tx: Prisma.TransactionClient) => Promise<T>): Promise<DomainResult<T>> {
    if (!isRevision(revision)) return { ok: false, error: "revision must be a non-negative integer" };
    return db.$transaction(async (tx) => {
      const result = await tx.item.updateMany({
        where: { id: fromId, revision }, data: { revision: { increment: 1 } },
      });
      if (!result.count) {
        const current = await tx.item.findUnique({ where: { id: fromId }, select: { revision: true } });
        return { ok: false, conflict: true, currentRevision: current?.revision ?? null };
      }
      return { ok: true, value: await write(tx) };
    });
  }

  static async delete(data: Pick<LinkData, "fromId" | "toId" | "type">, revision: number) {
    // Legacy Link types must remain removable.
    const { fromId, toId, type = "related_to" } = data;
    return LinkDomain.mutate(fromId, revision, async (tx) => {
      await tx.link.deleteMany({ where: { fromId, toId, type } });
      return { deleted: true };
    });
  }

  static async create(data: LinkData, revision: number) {
    const type = data.type === undefined ? "related_to" : data.type;
    if (!LinkType.isValid(type)) return { ok: false, error: "Invalid Link type" } as const;
    const { fromId, toId, note } = data;
    return LinkDomain.mutate(fromId, revision, (tx) => tx.link.upsert({
      where: { fromId_toId_type: { fromId, toId, type } },
      update: { note }, create: {
        fromId, toId, type, note,
        ...(data.id !== undefined ? { id: data.id } : {}),
        ...(data.createdAt !== undefined ? { createdAt: data.createdAt } : {}),
      },
    }));
  }
}
