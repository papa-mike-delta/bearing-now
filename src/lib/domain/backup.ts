import { db } from "@/lib/db";
import { LinkType } from "@/lib/link-type";
import { DatabaseDomain } from "./database";
import { ItemDomain } from "./item";
import { LinkDomain } from "./link";
import type { Actor } from "./operation-ledger";
import type { DomainResult } from "./result";

type Row = Record<string, any>;
const collections = ["domains", "tags", "projects", "items", "links", "reviews", "habitLogs"] as const;
type Backup = { version: unknown } & Partial<Record<typeof collections[number], Row[]>>;

function record(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validate(value: unknown): string | null {
  if (!record(value) || !value.version) return "Invalid backup file";
  for (const key of collections) {
    if (value[key] != null && (!Array.isArray(value[key]) || !value[key].every(record))) {
      return `Invalid backup ${key}`;
    }
  }
  if (value.links?.some((link: Row) => !LinkType.isValid(link.type))) return "Invalid Link type";
  if (value.items?.some((item: Row) => item.tags != null && (
    !Array.isArray(item.tags) || item.tags.some((entry: unknown) =>
      !record(entry) || !record(entry.tag) || typeof entry.tag.name !== "string")
  ))) return "Invalid Item tags";
  return null;
}

// Only scalar backup fields may reach ancillary model creates. In particular,
// exported or supplied nested relations cannot perform writes to other owners.
function scalar(row: Row, fields: string[]): any {
  return Object.fromEntries(fields.filter((key) => row[key] !== undefined).map((key) => [key, row[key]]));
}

class RestoreRefusal {
  constructor(readonly result: Exclude<DomainResult<unknown>, { ok: true }>) {}
}

function accepted<T>(result: DomainResult<T>): T {
  if (!result.ok) throw new RestoreRefusal(result);
  return result.value;
}

/** Replace one owner's dataset and its write receipts, or preserve it in full. */
export class BackupDomain {
  static async restore(userId: string, input: unknown, actor: Actor = "agent:internal"):
    Promise<DomainResult<{ success: true; message: string }>> {
    const invalid = validate(input);
    if (invalid) return { ok: false, error: invalid };
    const body = input as Backup;
    try {
      return await db.$transaction(async (tx) => {
        // clear acquires OperationLedger's transaction-scoped advisory lock.
        // Retain it through every create and receipt so cap preflight cannot race.
        accepted(await DatabaseDomain.clear(userId, actor, {
          items: body.items?.length ?? 0, links: body.links?.length ?? 0,
        }, tx));

        for (const row of body.domains ?? []) {
          await tx.domain.create({ data: { ...scalar(row, [
            "id", "key", "name", "description", "icon", "color", "accent", "order", "createdAt",
          ]), userId } });
        }
        for (const row of body.tags ?? []) {
          await tx.tag.create({ data: { ...scalar(row, ["id", "name", "color", "createdAt"]), userId } });
        }
        for (const row of body.projects ?? []) {
          if (row.domainId && !await tx.domain.findFirst({ where: { id: row.domainId, userId }, select: { id: true } })) {
            throw new RestoreRefusal({ ok: false, error: "Not found" });
          }
          await tx.project.create({ data: { ...scalar(row, [
            "id", "name", "description", "color", "icon", "domainId", "status", "progress",
            "startDate", "targetDate", "completedAt", "createdAt", "updatedAt",
          ]), userId } });
        }
        for (const row of body.items ?? []) {
          // ItemDomain itself selects scalar editable fields and verifies parents.
          accepted(await ItemDomain.create(userId, row as Parameters<typeof ItemDomain.create>[1],
            (row.tags ?? []).map((entry: Row) => entry.tag.name), actor, "restore", tx));
        }
        for (const row of body.links ?? []) {
          const source = await tx.item.findFirst({ where: { id: row.fromId, userId }, select: { revision: true } });
          if (!source) throw new RestoreRefusal({ ok: false, error: "Not found" });
          accepted(await LinkDomain.create(userId, row as Parameters<typeof LinkDomain.create>[1], source.revision, actor, "restore", tx));
        }
        for (const row of body.reviews ?? []) {
          await tx.review.create({ data: { ...scalar(row, [
            "id", "type", "date", "status", "weekStart", "weekEnd", "wins", "challenges",
            "learnings", "priorities", "gratitude", "mood", "energy", "notes", "createdAt", "updatedAt",
          ]), userId } });
        }
        for (const row of body.habitLogs ?? []) {
          if (!await tx.item.findFirst({ where: { id: row.itemId, userId }, select: { id: true } })) {
            throw new RestoreRefusal({ ok: false, error: "Not found" });
          }
          await tx.habitLog.create({ data: scalar(row, ["id", "itemId", "date", "value", "note", "createdAt"]) });
        }
        return { ok: true, value: { success: true, message: "Backup restored successfully" } } as const;
      }, { maxWait: 10_000, timeout: 60_000 });
    } catch (error) {
      if (!(error instanceof RestoreRefusal)) throw error;
      // Every receipt from this transaction rolled back, including a refusal's
      // receipt. Never return an id that does not exist. Existing history stays.
      const { receiptId, ...result } = error.result;
      return result;
    }
  }
}
