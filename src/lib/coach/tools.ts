import { ItemDomain } from "@/lib/domain/item";
import { LinkDomain } from "@/lib/domain/link";
import { getItem, getLinks, searchItems, listOpenItems } from "@/lib/domain/item-queries";
import { db } from "@/lib/db";
import { explainReceipt, receiptFeedback } from "./receipt-explanation";
import { OperationLedger } from "@/lib/domain/operation-ledger";

export class CoachTools {
  private static title(userId: string, id: string) {
    return db.item.findFirst({ where: { id, userId }, select: { title: true } });
  }

  private static async linkTitles(userId: string, fromId: string, toId: string) {
    const items = await db.item.findMany({
      where: { id: { in: [...new Set([fromId, toId])] }, userId }, select: { id: true, title: true },
    });
    return new Map(items.map((item) => [item.id, item.title]));
  }

  private static feedback<T extends { ok: boolean }>(operation: string, payload: unknown, result: T, titles: ReadonlyMap<string, string> = new Map()) {
    const explanation = explainReceipt({ operation, payload, receipt: result, status: result.ok ? "success" : "refused" }, titles, "execution");
    return { ...result, message: receiptFeedback(explanation) };
  }

  static async deleteLink(userId: string, { revision, ...data }: Parameters<typeof LinkDomain.delete>[1] & { revision: number }) {
    const titles = await CoachTools.linkTitles(userId, data.fromId, data.toId);
    const result = await LinkDomain.delete(userId, data, revision, "agent:coach");
    return CoachTools.feedback("link.delete", { data, revision }, result, titles);
  }

  static async createLink(userId: string, { revision, ...data }: Parameters<typeof LinkDomain.create>[1] & { revision: number }) {
    const titles = await CoachTools.linkTitles(userId, data.fromId, data.toId);
    const result = await LinkDomain.create(userId, data, revision, "agent:coach");
    return CoachTools.feedback("link.create", { data, revision }, result, titles);
  }

  static async archiveItem(userId: string, { id, revision }: { id: string; revision: number }) {
    const item = await CoachTools.title(userId, id);
    const result = await ItemDomain.archive(userId, id, revision, "agent:coach");
    return CoachTools.feedback("item.archive", { id, revision }, result, new Map(item ? [[id, item.title]] : []));
  }

  static async updateItem(userId: string, { id, revision, data, tagNames }: {
    id: string; revision: number; data: Parameters<typeof ItemDomain.update>[3]; tagNames?: string[];
  }) {
    const item = await CoachTools.title(userId, id);
    const result = await ItemDomain.update(userId, id, revision, data, tagNames, "agent:coach");
    return CoachTools.feedback("item.update", { id, revision, data, tagNames }, result, new Map(item ? [[id, item.title]] : []));
  }

  static async listOpenItems(userId: string) {
    const result = await OperationLedger.run("agent:coach", userId, { operation: "coach.listOpenItems", payload: {} }, async (tx) => ({
      ok: true as const, value: await listOpenItems(userId, tx),
    }));
    return CoachTools.feedback("coach.listOpenItems", {}, result);
  }

  static async getLinks(userId: string, { id }: { id: string }) {
    const item = await CoachTools.title(userId, id);
    const result = await OperationLedger.run("agent:coach", userId, { operation: "coach.getLinks", payload: { id } }, async (tx) => ({
      ok: true as const, value: await getLinks(id, userId, tx),
    }));
    return CoachTools.feedback("coach.getLinks", { id }, result, new Map(item ? [[id, item.title]] : []));
  }

  static async searchItems(userId: string, { q }: { q: string }) {
    const result = await OperationLedger.run("agent:coach", userId, { operation: "coach.searchItems", payload: { q } }, async (tx) => ({
      ok: true as const, value: await searchItems(q, userId, tx),
    }));
    return CoachTools.feedback("coach.searchItems", { q }, result);
  }

  static async getItem(userId: string, { id }: { id: string }) {
    const result = await OperationLedger.run("agent:coach", userId, { operation: "coach.getItem", payload: { id } }, async (tx) => {
      const value = await getItem(id, userId, tx);
      return value ? { ok: true as const, value } : { ok: false as const, error: "Item not found" };
    });
    return CoachTools.feedback("coach.getItem", { id }, result);
  }

  static async createItem(userId: string, { data, tagNames }: {
    data: Parameters<typeof ItemDomain.create>[1]; tagNames?: string[];
  }) {
    const result = await ItemDomain.create(userId, data, tagNames, "agent:coach");
    return CoachTools.feedback("item.create", { data, tagNames }, result);
  }
}
