import { ItemDomain } from "@/lib/domain/item";
import { LinkDomain } from "@/lib/domain/link";
import { getItem, getLinks, searchItems, listOpenItems } from "@/lib/domain/item-queries";
import { db } from "@/lib/db";
import { OperationLedger } from "@/lib/domain/operation-ledger";

export class CoachTools {
  private static title(userId: string, id: string) {
    return db.item.findFirst({ where: { id, userId }, select: { title: true } });
  }

  static async deleteLink(userId: string, { revision, ...data }: Parameters<typeof LinkDomain.delete>[1] & { revision: number }) {
    const item = await CoachTools.title(userId, data.fromId);
    const result = await LinkDomain.delete(userId, data, revision, "agent:coach");
    return { ...result, message: `${result.ok ? "Unlinked" : "Refused unlink"} ${item?.title ?? data.fromId}` };
  }

  static async createLink(userId: string, { revision, ...data }: Parameters<typeof LinkDomain.create>[1] & { revision: number }) {
    const item = await CoachTools.title(userId, data.fromId);
    const result = await LinkDomain.create(userId, data, revision, "agent:coach");
    return { ...result, message: `${result.ok ? "Linked" : "Refused link"} ${item?.title ?? data.fromId}` };
  }

  static async archiveItem(userId: string, { id, revision }: { id: string; revision: number }) {
    const item = await CoachTools.title(userId, id);
    const result = await ItemDomain.archive(userId, id, revision, "agent:coach");
    return { ...result, message: `${result.ok ? "Archived" : "Refused archive"} ${result.ok ? result.value.title : item?.title ?? id}` };
  }

  static async updateItem(userId: string, { id, revision, data, tagNames }: {
    id: string; revision: number; data: Parameters<typeof ItemDomain.update>[3]; tagNames?: string[];
  }) {
    const item = await CoachTools.title(userId, id);
    const result = await ItemDomain.update(userId, id, revision, data, tagNames, "agent:coach");
    return { ...result, message: `${result.ok ? "Updated" : "Refused update"} ${result.ok ? result.value.title : item?.title ?? id}` };
  }

  static async listOpenItems(userId: string) {
    const result = await OperationLedger.run("agent:coach", userId, { operation: "coach.listOpenItems", payload: {} }, async (tx) => ({
      ok: true as const, value: await listOpenItems(userId, tx),
    }));
    return { ...result, message: `Listed open ${result.ok ? result.value[0]?.title ?? "Items" : "Items"}` };
  }

  static async getLinks(userId: string, { id }: { id: string }) {
    const item = await CoachTools.title(userId, id);
    const result = await OperationLedger.run("agent:coach", userId, { operation: "coach.getLinks", payload: { id } }, async (tx) => ({
      ok: true as const, value: await getLinks(id, userId, tx),
    }));
    return { ...result, message: `Read links ${item?.title ?? id}` };
  }

  static async searchItems(userId: string, { q }: { q: string }) {
    const result = await OperationLedger.run("agent:coach", userId, { operation: "coach.searchItems", payload: { q } }, async (tx) => ({
      ok: true as const, value: await searchItems(q, userId, tx),
    }));
    return { ...result, message: `Searched ${result.ok ? result.value[0]?.title ?? "Items" : "Items"}` };
  }

  static async getItem(userId: string, { id }: { id: string }) {
    const result = await OperationLedger.run("agent:coach", userId, { operation: "coach.getItem", payload: { id } }, async (tx) => {
      const value = await getItem(id, userId, tx);
      return value ? { ok: true as const, value } : { ok: false as const, error: "Item not found" };
    });
    return { ...result, message: `${result.ok ? "Read" : "Refused read"} ${result.ok ? result.value.title : id}` };
  }

  static async createItem(userId: string, { data, tagNames }: {
    data: Parameters<typeof ItemDomain.create>[1]; tagNames?: string[];
  }) {
    const result = await ItemDomain.create(userId, data, tagNames, "agent:coach");
    return { ...result, message: `${result.ok ? "Created" : "Refused create"} ${data.title}` };
  }
}
