import { canonicalJson } from "./json";
import { Prisma, type Item } from "@bearing/v1-client";
import { z } from "zod";
import { v1db } from "./db";
import * as schema from "./contracts";
import { dateInZone, nextOccurrence } from "./dates";
import { validLinkEndpoints } from "./link-policy";

export type Principal = {
  userId: string;
  actor: `user:${string}` | `agent:${string}`;
  approved?: boolean;
};
export type Tx = Prisma.TransactionClient;
export class Fault extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}
export function parse<T>(contract: z.ZodType<T>, raw: unknown): T {
  const result = contract.safeParse(raw);
  if (!result.success)
    throw new Fault(400, "Invalid V1 input", {
      issues: result.error.issues.map((i) => ({
        path: i.path,
        message: i.message,
      })),
    });
  return result.data;
}
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function write<T>(
  principal: Principal,
  operation: string,
  payload: unknown,
  work: (tx: Tx) => Promise<T>,
  transaction?: Tx,
) {
  const { userId, actor } = principal;
  if (actor.startsWith("user:") && actor !== `user:${userId}`)
    throw new Fault(403, "Actor does not own this account");
  const run = async (tx: Tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(731909)::text`;
    if (actor.startsWith("agent:") && !principal.approved)
      throw new Fault(403, "An approved change set is required");
    const value = await work(tx);
    const receipt = await tx.ledger.create({
      data: {
        userId,
        actor,
        operation,
        payload: JSON.stringify(payload ?? null),
        status: "success",
        receipt: JSON.stringify({ ok: true, value }),
      },
    });
    return { ok: true as const, value, receiptId: receipt.id };
  };
  // Composition shares writes and receipts; only the outer transaction records refusal.
  if (transaction) return run(transaction);
  try {
    return await v1db.$transaction(run, { timeout: 30_000 });
  } catch (error) {
    const fault =
      error instanceof Fault
        ? error
        : error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ? new Fault(409, "Record already exists")
          : error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === "P2003"
            ? new Fault(400, "Invalid owned relationship")
            : new Fault(
                500,
                "V1 operation failed; no changes were saved",
                {},
                { cause: error },
              );
    const receipt = await v1db.ledger.create({
      data: {
        userId,
        actor,
        operation,
        payload: JSON.stringify(payload ?? null),
        status: "refused",
        receipt: JSON.stringify({
          ok: false,
          error: fault.message,
          ...fault.details,
        }),
      },
    });
    throw new Fault(
      fault.status,
      fault.message,
      { ...fault.details, receiptId: receipt.id },
      { cause: fault.cause },
    );
  }
}
export async function owned(
  tx: Tx,
  userId: string,
  kind:
    | "item"
    | "project"
    | "tag"
    | "journalMoment"
    | "review"
    | "recurrence"
    | "conversation",
  id: string,
) {
  // Keep a narrow delegate dispatch; every lookup includes ownership.
  const found = await (tx[kind] as typeof tx.item).findFirst({
    where: { userId, id },
  });
  if (!found) throw new Fault(404, "Not found");
  return found;
}
export async function guardOpen(tx: Tx, p: Principal, itemIds?: string[]) {
  if (p.actor.startsWith("user:")) return;
  const lease = await tx.lease.findFirst({
    where: {
      userId: p.userId,
      expiresAt: { gt: new Date() },
      ...(itemIds ? { itemId: { in: itemIds } } : {}),
    },
  });
  if (lease) throw new Fault(423, "Item is open", { itemId: lease.itemId });
}
async function cap(tx: Tx, p: Principal, kind: "item" | "link") {
  const limit = kind === "item" ? 20 : 50;
  const count = await tx.ledger.count({
    where: {
      userId: p.userId,
      actor: p.actor,
      operation: { in: [`${kind}.create`, `v1.${kind}.create`] },
      status: "success",
      createdAt: { gt: new Date(Date.now() - 3600_000) },
    },
  });
  if (count >= limit) throw new Fault(429, "Write cap reached", { limit });
}
async function validTags(tx: Tx, userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  if (
    (await tx.tag.count({ where: { userId, id: { in: unique } } })) !==
    unique.length
  )
    throw new Fault(404, "Not found");
  return unique;
}
async function itemRelations(
  tx: Tx,
  userId: string,
  value: schema.CanonicalItem,
) {
  if (value.projectId) await owned(tx, userId, "project", value.projectId);
  if (value.delegateId) {
    const person = await owned(tx, userId, "item", value.delegateId);
    if (person.type !== "person")
      throw new Fault(400, "Delegate must be a Person");
  }
  return validTags(tx, userId, value.tagIds);
}
function scalars(value: schema.CanonicalItem) {
  const { tagIds: _, ...rest } = value;
  return {
    ...rest,
    metadata: json(value.metadata),
    dueAt: value.dueAt && new Date(value.dueAt),
    scheduledAt: value.scheduledAt && new Date(value.scheduledAt),
    startAt: value.startAt && new Date(value.startAt),
    endAt: value.endAt && new Date(value.endAt),
    followUpAt: value.followUpAt && new Date(value.followUpAt),
  };
}
const itemInclude = {
  tags: { include: { tag: true } },
  project: { include: { tags: { include: { tag: true } } } },
  selfProfile: true,
} as const;
export function withAreas(
  item: Prisma.ItemGetPayload<{ include: typeof itemInclude }>,
) {
  return {
    ...item,
    directAreas: item.tags
      .filter((t) => t.tag.kind === "area")
      .map((t) => t.tag),
    inheritedAreas:
      item.project?.tags
        .filter((t) => t.tag.kind === "area")
        .map((t) => t.tag) ?? [],
  };
}
export class V1 {
  static async items(
    userId: string,
    filters: {
      areaId?: string;
      status?: string;
      projectId?: string;
      type?: string;
      limit?: number;
    } = {},
  ) {
    const rows = await v1db.item.findMany({
      where: {
        userId,
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        ...(filters.status
          ? {
              status:
                filters.status === "in_progress"
                  ? { in: ["in_progress", "delegated"] }
                  : filters.status,
            }
          : {}),
        ...(filters.areaId
          ? {
              OR: [
                {
                  tags: {
                    some: { tagId: filters.areaId, tag: { kind: "area" } },
                  },
                },
                {
                  project: {
                    tags: {
                      some: { tagId: filters.areaId, tag: { kind: "area" } },
                    },
                  },
                },
              ],
            }
          : {}),
      },
      ...(filters.limit
        ? { take: Math.max(1, Math.min(50, filters.limit)) }
        : {}),
      include: itemInclude,
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
    return rows.map(withAreas);
  }
  static async item(userId: string, id: string) {
    const row = await v1db.item.findFirst({
      where: { userId, id },
      include: itemInclude,
    });
    if (!row) throw new Fault(404, "Not found");
    return withAreas(row);
  }
  static createItem(p: Principal, raw: unknown, transaction?: Tx) {
    return write(
      p,
      "v1.item.create",
      raw,
      async (tx) => {
        const value = parse(schema.itemInput, raw),
          tagIds = await itemRelations(tx, p.userId, value);
        await cap(tx, p, "item");
        const row = await tx.item.create({
          data: {
            ...scalars(value),
            userId: p.userId,
            completedAt: value.status === "done" ? new Date() : null,
            tags: { create: tagIds.map((tagId) => ({ tagId })) },
          },
          include: itemInclude,
        });
        return withAreas(row);
      },
      transaction,
    );
  }
  static updateItem(
    p: Principal,
    id: string,
    revision: number,
    raw: unknown,
    transaction?: Tx,
  ) {
    return write(
      p,
      "v1.item.update",
      { id, revision, changes: raw },
      async (tx) => {
        parse(schema.revision, revision);
        const previous = await owned(tx, p.userId, "item", id);
        if (previous.revision !== revision)
          throw new Fault(409, "Item changed", {
            currentRevision: previous.revision,
          });
        await guardOpen(tx, p, [id]);
        const value = parse(schema.itemInput, raw);
        const me = await tx.selfProfile.findUnique({
          where: { userId: p.userId },
        });
        if (
          me?.itemId === id &&
          (value.status === "archived" || value.type !== "person")
        )
          throw new Fault(400, "Me must remain an unarchived Person");
        const tags = await itemRelations(tx, p.userId, value);
        if (value.type !== previous.type) {
          const hasHistory = await tx.taskOccurrence.count({
            where: { userId: p.userId, itemId: id },
          });
          const usedAsDelegate = await tx.item.count({
            where: { userId: p.userId, delegateId: id },
          });
          const activities = await tx.activity.findMany({
            where: { userId: p.userId, itemId: id },
          });
          const expected = {
            habit_completion: "habit",
            task_completion: "task",
            interaction: "person",
          };
          if (
            hasHistory ||
            (usedAsDelegate && value.type !== "person") ||
            activities.some(
              (a) =>
                expected[a.kind as keyof typeof expected] &&
                expected[a.kind as keyof typeof expected] !== value.type,
            )
          )
            throw new Fault(
              400,
              "Existing history or delegation requires this Item type",
            );
        }
        const links = await tx.link.findMany({
          where: { userId: p.userId, OR: [{ fromId: id }, { toId: id }] },
          include: { from: true, to: true },
        });
        if (
          links.some(
            (link) =>
              !validLinkEndpoints(
                link.type,
                link.fromId === id ? value : link.from,
                link.toId === id ? value : link.to,
              ),
          )
        )
          throw new Fault(
            400,
            "Existing semantic Links require compatible Item types",
          );
        if (
          previous.status === "done" &&
          value.status !== "done" &&
          (await tx.taskOccurrence.findFirst({
            where: { userId: p.userId, itemId: id, completedAt: { not: null } },
          }))
        )
          throw new Fault(
            400,
            "Completed recurring occurrences are immutable history",
          );
        await tx.itemTag.deleteMany({
          where: { userId: p.userId, itemId: id },
        });
        const row = await tx.item.update({
          where: { userId_id: { userId: p.userId, id } },
          data: {
            ...scalars(value),
            completedAt:
              value.status === "done"
                ? (previous.completedAt ?? new Date())
                : null,
            revision: { increment: 1 },
            demoBatchId: null,
            tags: { create: tags.map((tagId) => ({ tagId })) },
          },
          include: itemInclude,
        });
        if (
          previous.status !== "done" &&
          value.status === "done" &&
          row.type === "task"
        ) {
          await tx.activity.create({
            data: {
              userId: p.userId,
              clientId: `task_${id}_${row.revision}`,
              kind: "task_completion",
              itemId: id,
              occurredAt: row.completedAt!,
              localDate: dateInZone(row.completedAt!, row.timezone),
              timezone: row.timezone,
              data: {},
            },
          });
          await V1.completeOccurrence(tx, p, row);
        }
        return withAreas(row);
      },
      transaction,
    );
  }
  static async me(userId: string) {
    const self = await v1db.selfProfile.findUniqueOrThrow({
      where: { userId },
    });
    return V1.item(userId, self.itemId);
  }
  static createProject(p: Principal, raw: unknown, transaction?: Tx) {
    return write(
      p,
      "v1.project.create",
      raw,
      async (tx) => {
        const value = parse(schema.projectInput, raw),
          tagIds = await validTags(tx, p.userId, value.tagIds);
        const { tagIds: _, ...data } = value;
        return tx.project.create({
          data: {
            ...data,
            userId: p.userId,
            tags: { create: tagIds.map((tagId) => ({ tagId })) },
          },
          include: { tags: { include: { tag: true } } },
        });
      },
      transaction,
    );
  }
  static updateProject(
    p: Principal,
    id: string,
    revision: number,
    raw: unknown,
    transaction?: Tx,
  ) {
    return write(
      p,
      "v1.project.update",
      { id, revision, changes: raw },
      async (tx) => {
        parse(schema.revision, revision);
        const previous = await owned(tx, p.userId, "project", id);
        if (previous.revision !== revision)
          throw new Fault(409, "Project changed", {
            currentRevision: previous.revision,
          });
        await guardOpen(
          tx,
          p,
          (
            await tx.item.findMany({
              where: { userId: p.userId, projectId: id },
              select: { id: true },
            })
          ).map((i) => i.id),
        );
        const value = parse(schema.projectInput, raw),
          tagIds = await validTags(tx, p.userId, value.tagIds);
        const { tagIds: _, ...data } = value;
        await tx.projectTag.deleteMany({
          where: { userId: p.userId, projectId: id },
        });
        return tx.project.update({
          where: { userId_id: { userId: p.userId, id } },
          data: {
            ...data,
            revision: { increment: 1 },
            demoBatchId: null,
            tags: { create: tagIds.map((tagId) => ({ tagId })) },
          },
        });
      },
      transaction,
    );
  }
  static createTag(p: Principal, raw: unknown, transaction?: Tx) {
    return write(
      p,
      "v1.tag.create",
      raw,
      async (tx) =>
        tx.tag.create({
          data: { ...parse(schema.tagInput, raw), userId: p.userId },
        }),
      transaction,
    );
  }
  static createLink(p: Principal, raw: unknown, transaction?: Tx) {
    return write(
      p,
      "v1.link.create",
      raw,
      async (tx) => {
        const value = parse(schema.linkInput, raw),
          from = await owned(tx, p.userId, "item", value.fromId),
          to = await owned(tx, p.userId, "item", value.toId);
        await guardOpen(tx, p, [value.fromId, value.toId]);
        await cap(tx, p, "link");
        if (!validLinkEndpoints(value.type, from, to))
          throw new Fault(400, "Invalid semantic Link endpoints");
        return tx.link.create({ data: { ...value, userId: p.userId } });
      },
      transaction,
    );
  }
  static deleteLink(p: Principal, id: string, transaction?: Tx) {
    return write(
      p,
      "v1.link.delete",
      { id },
      async (tx) => {
        const row = await tx.link.findFirst({
          where: { id, userId: p.userId },
        });
        if (!row) throw new Fault(404, "Not found");
        await guardOpen(tx, p, [row.fromId, row.toId]);
        await tx.link.delete({ where: { id } });
        return { deleted: true };
      },
      transaction,
    );
  }
  static createMoment(p: Principal, raw: unknown, transaction?: Tx) {
    return write(
      p,
      "v1.moment.create",
      raw,
      async (tx) => {
        const value = parse(schema.momentInput, raw),
          existing = await tx.journalMoment.findUnique({
            where: {
              userId_clientId: { userId: p.userId, clientId: value.clientId },
            },
          });
        if (existing) {
          if (
            existing.text !== value.text ||
            +existing.occurredAt !== Date.parse(value.occurredAt) ||
            existing.timezone !== value.timezone
          )
            throw new Fault(
              409,
              "Idempotency key already used for different capture",
            );
          return existing;
        }
        for (const ref of value.items)
          await owned(tx, p.userId, "item", ref.itemId);
        const { items, ...data } = value;
        return tx.journalMoment.create({
          data: {
            ...data,
            userId: p.userId,
            occurredAt: new Date(value.occurredAt),
            localDate: dateInZone(value.occurredAt, value.timezone),
            items: { create: items.map((ref) => ({ ...ref })) },
          },
        });
      },
      transaction,
    );
  }
  static createActivity(p: Principal, raw: unknown, transaction?: Tx) {
    return write(
      p,
      "v1.activity.create",
      raw,
      async (tx) => {
        const value = parse(schema.activityInput, raw),
          existing = await tx.activity.findUnique({
            where: {
              userId_clientId: { userId: p.userId, clientId: value.clientId },
            },
          });
        if (existing) {
          if (
            existing.kind !== value.kind ||
            +existing.occurredAt !== Date.parse(value.occurredAt) ||
            existing.itemId !== value.itemId ||
            existing.timezone !== value.timezone ||
            canonicalJson(existing.data) !== canonicalJson(value.data)
          )
            throw new Fault(
              409,
              "Idempotency key already used for different Activity",
            );
          return existing;
        }
        if (value.kind === "task_completion")
          throw new Fault(
            400,
            "Task completion is recorded by saving the Task",
          );
        if (value.itemId) {
          const item = await owned(tx, p.userId, "item", value.itemId);
          if (value.kind === "focus" && !["task", "habit"].includes(item.type))
            throw new Fault(400, "Focus can reference a Task or Habit");
          const required = {
            habit_completion: "habit",
            task_completion: "task",
            interaction: "person",
          }[value.kind as string];
          if (required && item.type !== required)
            throw new Fault(400, "Activity has incompatible Item type");
        }
        return tx.activity.create({
          data: {
            ...value,
            data: json(value.data),
            userId: p.userId,
            occurredAt: new Date(value.occurredAt),
            localDate: dateInZone(value.occurredAt, value.timezone),
          },
        });
      },
      transaction,
    );
  }
  static createReview(p: Principal, raw: unknown) {
    return write(p, "v1.review.create", raw, async (tx) => {
      const { itemIds, ...value } = parse(schema.reviewInput, raw);
      for (const id of itemIds) await owned(tx, p.userId, "item", id);
      return tx.review.create({
        data: {
          ...value,
          userId: p.userId,
          prompts: json(value.prompts),
          items: {
            create: [...new Set(itemIds)].map((itemId) => ({ itemId })),
          },
        },
      });
    });
  }
  static setLease(p: Principal, itemId: string, token: string, open: boolean) {
    return write(p, "v1.item.lease", { itemId, token, open }, async (tx) => {
      if (p.actor !== `user:${p.userId}`)
        throw new Fault(403, "Only users may hold editor leases");
      parse(schema.id, token);
      await owned(tx, p.userId, "item", itemId);
      const key = { userId: p.userId, itemId, token };
      if (open)
        await tx.lease.upsert({
          where: { userId_itemId_token: key },
          create: { ...key, expiresAt: new Date(Date.now() + 90_000) },
          update: { expiresAt: new Date(Date.now() + 90_000) },
        });
      else await tx.lease.deleteMany({ where: key });
      return { open };
    });
  }
  static createRecurrence(
    p: Principal,
    itemId: string,
    revision: number,
    raw: unknown,
  ) {
    return write(
      p,
      "v1.recurrence.create",
      { itemId, revision, rule: raw },
      async (tx) => {
        const rule = parse(schema.recurrenceRule, raw),
          item = await owned(tx, p.userId, "item", itemId);
        parse(schema.revision, revision);
        if (item.revision !== revision)
          throw new Fault(409, "Item changed", {
            currentRevision: item.revision,
          });
        if (item.type !== "task" || item.status === "done" || !item.scheduledAt)
          throw new Fault(
            400,
            "Recurrence requires an unfinished scheduled Task",
          );
        await guardOpen(tx, p, [itemId]);
        const recurrence = await tx.recurrence.create({
          data: { userId: p.userId, itemId, rule: json(rule) },
        });
        await tx.taskOccurrence.create({
          data: {
            userId: p.userId,
            recurrenceId: recurrence.id,
            itemId,
            scheduledAt: item.scheduledAt,
          },
        });
        await tx.item.update({
          where: { id: itemId },
          data: { revision: { increment: 1 }, demoBatchId: null },
        });
        return recurrence;
      },
    );
  }
  private static async completeOccurrence(tx: Tx, p: Principal, item: Item) {
    const occurrence = await tx.taskOccurrence.findUnique({
      where: { userId_itemId: { userId: p.userId, itemId: item.id } },
      include: { recurrence: true },
    });
    if (!occurrence || occurrence.completedAt) return;
    await tx.taskOccurrence.update({
      where: { id: occurrence.id },
      data: { completedAt: item.completedAt },
    });
    if (!occurrence.recurrence.active) return;
    await cap(tx, p, "item");
    const rule = parse(schema.recurrenceRule, occurrence.recurrence.rule);
    const anchor = await tx.taskOccurrence.findFirstOrThrow({
      where: { userId: p.userId, recurrenceId: occurrence.recurrenceId },
      orderBy: { scheduledAt: "asc" },
    });
    const nextAt = nextOccurrence(
      rule,
      occurrence.scheduledAt,
      item.completedAt!,
      anchor.scheduledAt,
    );
    const stored = await tx.item.findUniqueOrThrow({ where: { id: item.id } });
    const {
      id: _,
      revision: _r,
      createdAt: _c,
      updatedAt: _u,
      completedAt: _d,
      ...data
    } = stored;
    const tags = await tx.itemTag.findMany({
      where: { userId: p.userId, itemId: item.id },
    });
    // Date-only deadlines retain their offset from the occurrence's local calendar day.
    const calendarOffset = item.localDate
      ? Math.round(
          (Date.parse(`${item.localDate}T00:00:00Z`) -
            Date.parse(
              `${dateInZone(occurrence.scheduledAt, item.timezone)}T00:00:00Z`,
            )) /
            86400_000,
        )
      : 0;
    const nextDate = item.localDate
      ? new Date(
          Date.parse(`${dateInZone(nextAt, rule.timezone)}T00:00:00Z`) +
            calendarOffset * 86400_000,
        )
          .toISOString()
          .slice(0, 10)
      : null;
    const next = await tx.item.create({
      data: {
        ...data,
        timezone: rule.timezone,
        localDate: nextDate,
        metadata: json(data.metadata),
        status: "todo",
        scheduledAt: nextAt,
        dueAt: item.dueAt
          ? new Date(+nextAt + (+item.dueAt - +occurrence.scheduledAt))
          : null,
        demoBatchId: null,
        tags: { create: tags.map((t) => ({ tagId: t.tagId })) },
      },
    });
    await tx.taskOccurrence.create({
      data: {
        userId: p.userId,
        recurrenceId: occurrence.recurrenceId,
        itemId: next.id,
        scheduledAt: nextAt,
      },
    });
    await tx.taskOccurrence.update({
      where: { id: occurrence.id },
      data: { nextItemId: next.id },
    });
    await tx.ledger.create({
      data: {
        userId: p.userId,
        actor: p.actor,
        operation: "v1.item.create",
        payload: JSON.stringify({ recurrenceId: occurrence.recurrenceId }),
        status: "success",
        receipt: JSON.stringify({ ok: true, value: { id: next.id } }),
      },
    });
  }
}
