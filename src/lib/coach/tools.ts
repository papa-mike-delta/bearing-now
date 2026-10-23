import { ItemDomain } from "@/lib/domain/item";
import { LinkDomain } from "@/lib/domain/link";
import { getItem, getLinks, searchItems, listOpenItems } from "@/lib/domain/item-queries";
import { db } from "@/lib/db";
import { OperationLedger } from "@/lib/domain/operation-ledger";

export class CoachTools {
  static async deleteLink({ revision, ...data }: Parameters<typeof LinkDomain.delete>[0] & { revision: number }) {
    const item = await db.item.findUnique({ where: { id: data.fromId }, select: { title: true } });
    const result = await LinkDomain.delete(data, revision, "agent:coach");
    return { ...result, message: `${result.ok ? "Unlinked" : "Refused unlink"} ${item?.title ?? data.fromId}` };
  }

  static async createLink({ revision, ...data }: Parameters<typeof LinkDomain.create>[0] & { revision: number }) {
    const item = await db.item.findUnique({ where: { id: data.fromId }, select: { title: true } });
    const result = await LinkDomain.create(data, revision, "agent:coach");
    return { ...result, message: `${result.ok ? "Linked" : "Refused link"} ${item?.title ?? data.fromId}` };
  }

  static async archiveItem({ id, revision }: { id: string; revision: number }) {
    const item = await db.item.findUnique({ where: { id }, select: { title: true } });
    const result = await ItemDomain.archive(id, revision, "agent:coach");
    return { ...result, message: `${result.ok ? "Archived" : "Refused archive"} ${result.ok ? result.value.title : item?.title ?? id}` };
  }

  static async updateItem({ id, revision, data, tagNames }: {
    id: string; revision: number; data: Parameters<typeof ItemDomain.update>[2]; tagNames?: string[];
  }) {
    const item = await db.item.findUnique({ where: { id }, select: { title: true } });
    const result = await ItemDomain.update(id, revision, data, tagNames, "agent:coach");
    return { ...result, message: `${result.ok ? "Updated" : "Refused update"} ${result.ok ? result.value.title : item?.title ?? id}` };
  }

  static async listOpenItems() {
    const result = await OperationLedger.run("agent:coach", { operation: "coach.listOpenItems", payload: {} }, async (tx) => ({
      ok: true, value: await listOpenItems(tx),
    }));
    return { ...result, message: `Listed open ${result.ok ? result.value[0]?.title ?? "Items" : "Items"}` };
  }

  static async getLinks({ id }: { id: string }) {
    const item = await db.item.findUnique({ where: { id }, select: { title: true } });
    const result = await OperationLedger.run("agent:coach", { operation: "coach.getLinks", payload: { id } }, async (tx) => ({
      ok: true, value: await getLinks(id, tx),
    }));
    return { ...result, message: `Read links ${item?.title ?? id}` };
  }

  static async searchItems({ q }: { q: string }) {
    const result = await OperationLedger.run("agent:coach", { operation: "coach.searchItems", payload: { q } }, async (tx) => ({
      ok: true, value: await searchItems(q, tx),
    }));
    return { ...result, message: `Searched ${result.ok ? result.value[0]?.title ?? "Items" : "Items"}` };
  }

  static async getItem({ id }: { id: string }) {
    const result = await OperationLedger.run("agent:coach", { operation: "coach.getItem", payload: { id } }, async (tx) => {
      const value = await getItem(id, tx);
      return value ? { ok: true, value } : { ok: false, error: "Item not found" };
    });
    return { ...result, message: `${result.ok ? "Read" : "Refused read"} ${result.ok ? result.value.title : id}` };
  }

  static async createItem({ data, tagNames }: {
    data: Parameters<typeof ItemDomain.create>[0]; tagNames?: string[];
  }) {
    const result = await ItemDomain.create(data, tagNames, "agent:coach");
    return { ...result, message: `${result.ok ? "Created" : "Refused create"} ${data.title}` };
  }
}
