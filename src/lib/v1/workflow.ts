import crypto from "node:crypto";
import { Prisma } from "@bearing/v1-client";
import { z } from "zod";
import { id as idSchema, revision } from "./contracts";
import { itemDto } from "./client-model";
import { markdownTasks } from "./workflow-dates";
import { v1db } from "./db";
import {
  V1,
  Fault,
  parse,
  write,
  owned,
  guardOpen,
  type Principal,
} from "./service";
import { dateInZone } from "./dates";
import {
  captureInput,
  captureIntent,
  organizeInput,
  momentEditInput,
  preferencesInput,
  searchInput,
} from "./workflow-contracts";
const includeMoment = { items: { include: { item: true } } } as const;
export class Workflow {
  static capture(p: Principal, raw: unknown) {
    return write(p, "v1.capture", raw, async (tx) => {
      const value = parse(captureInput, raw),
        hash = crypto
          .createHash("sha256")
          .update(JSON.stringify(value))
          .digest("hex");
      const previous = await tx.journalMoment.findUnique({
        where: {
          userId_clientId: { userId: p.userId, clientId: value.clientId },
        },
        include: includeMoment,
      });
      if (previous) {
        if (previous.ingestHash !== hash)
          throw new Fault(
            409,
            "Capture key already used for different text or time",
          );
        return previous;
      }
      const intent = value.place
        ? {
            kind: "item" as const,
            item: {
              type: "bookmark" as const,
              template: "place",
              title:
                value.text
                  .trim()
                  .replace(/^\/place\s*/i, "")
                  .split("\n")[0]
                  .slice(0, 300) || "Captured place",
              content: value.text,
              status: "inbox" as const,
              metadata: {
                version: 1 as const,
                category: "place" as const,
                ...value.place,
              },
            },
          }
        : captureIntent(value.text, value.intendedType);
      const { value: moment } = await V1.createMoment(
        p,
        {
          clientId: value.clientId,
          text: value.text,
          occurredAt: value.occurredAt,
          timezone: value.timezone,
          intendedType: value.intendedType,
          items: (value.mentionIds || []).map((itemId) => ({
            itemId,
            relation: "mention",
          })),
        },
        tx,
      );
      if (intent.kind === "item") {
        const { value: item } = await V1.createItem(
          p,
          { ...intent.item, timezone: value.timezone },
          tx,
        );
        await tx.momentItem.create({
          data: {
            userId: p.userId,
            momentId: moment.id,
            itemId: item.id,
            relation: "reference",
          },
        });
      } else if (intent.kind === "check_in")
        await V1.createActivity(
          p,
          {
            clientId: value.clientId,
            occurredAt: value.occurredAt,
            timezone: value.timezone,
            kind: "check_in",
            data: intent.data,
          },
          tx,
        );
      return tx.journalMoment.update({
        where: { id: moment.id },
        data: {
          capturedAt: new Date(value.capturedAt),
          ingestHash: hash,
          needsOrganization: intent.kind !== "check_in",
        },
        include: includeMoment,
      });
    });
  }
  static organize(p: Principal, id: string, raw: unknown) {
    return write(p, "v1.moment.organize", { id, data: raw }, async (tx) => {
      const value = parse(organizeInput, raw);
      await owned(tx, p.userId, "journalMoment", id);
      const moment = await tx.journalMoment.findUniqueOrThrow({
        where: { id },
        include: includeMoment,
      });
      // A repeated promotion returns its canonical reference, never a duplicate Task.
      if (value.item && moment.items.some((r) => r.relation === "reference"))
        return moment;
      if (moment.revision !== value.revision)
        throw new Fault(409, "Journal entry changed", {
          currentRevision: moment.revision,
        });
      if (value.item) {
        const { value: item } = await V1.createItem(p, value.item, tx);
        await tx.momentItem.create({
          data: {
            userId: p.userId,
            momentId: id,
            itemId: item.id,
            relation: "reference",
          },
        });
      }
      if (!value.item && value.resolved) {
        for (const ref of moment.items.filter(
          (r) => r.relation === "reference" && r.item.status === "inbox",
        )) {
          const tags = await tx.itemTag.findMany({
            where: { userId: p.userId, itemId: ref.itemId },
          });
          const dto = itemDto({
            ...JSON.parse(JSON.stringify(ref.item)),
            tagIds: tags.map((t) => t.tagId),
          });
          await V1.updateItem(
            p,
            ref.itemId,
            ref.item.revision,
            { ...dto, status: "todo" },
            tx,
          );
        }
      }
      return tx.journalMoment.update({
        where: { id },
        data: {
          needsOrganization: !value.resolved,
          revision: { increment: 1 },
          demoBatchId: null,
        },
        include: includeMoment,
      });
    });
  }
  static promoteTask(p: Principal, id: string, raw: unknown) {
    return write(p, "v1.checklist.promote", { id, data: raw }, async (tx) => {
      const value = parse(
        z.strictObject({
          revision,
          line: z.number().int().nonnegative(),
          clientId: idSchema,
        }),
        raw,
      );
      const key = `promotion:${value.clientId}`,
        previous = await tx.preference.findUnique({
          where: { userId_key: { userId: p.userId, key } },
        });
      if (previous) {
        const saved = previous.value as {
          parentId: string;
          line: number;
          itemId: string;
        };
        if (saved.parentId !== id || saved.line !== value.line)
          throw new Fault(409, "Promotion key already used");
        return { itemId: saved.itemId };
      }
      const parent = await owned(tx, p.userId, "item", id);
      if (parent.revision !== value.revision)
        throw new Fault(409, "Item changed", {
          currentRevision: parent.revision,
        });
      await guardOpen(tx, p, [id]);
      if (parent.type !== "task")
        throw new Fault(400, "Only Task checklist steps can be promoted");
      const step = markdownTasks(parent.content).find(
        (task) => task.index === value.line,
      );
      if (!step || !step.text.trim() || step.text.trim().length > 300)
        throw new Fault(400, "Choose a checklist step with a short Task title");
      const tags = await tx.itemTag.findMany({
        where: { userId: p.userId, itemId: id },
      });
      const { value: child } = await V1.createItem(
        p,
        {
          type: "task",
          title: step.text.trim(),
          status: step.checked ? "done" : "todo",
          projectId: parent.projectId,
          tagIds: tags.map((t) => t.tagId),
          timezone: parent.timezone,
        },
        tx,
      );
      const lines = parent.content.split("\n"),
        prefix = lines[value.line].match(/^(\s*(?:[-*+]|\d+\.)\s+)/)![1];
      lines[value.line] =
        `${prefix}[${step.text.replace(/[\[\]]/g, "")}](/app/library/${child.id})`;
      await tx.item.update({
        where: { id },
        data: {
          content: lines.join("\n"),
          revision: { increment: 1 },
          demoBatchId: null,
        },
      });
      await tx.preference.create({
        data: {
          userId: p.userId,
          key,
          value: { parentId: id, line: value.line, itemId: child.id },
        },
      });
      return { itemId: child.id };
    });
  }
  static editMoment(p: Principal, id: string, raw: unknown) {
    return write(p, "v1.moment.update", { id, data: raw }, async (tx) => {
      const value = parse(momentEditInput, raw),
        row = await owned(tx, p.userId, "journalMoment", id);
      if (row.revision !== value.revision)
        throw new Fault(409, "Journal entry changed", {
          currentRevision: row.revision,
        });
      return tx.journalMoment.update({
        where: { id },
        data: {
          text: value.text,
          occurredAt: new Date(value.occurredAt),
          localDate: dateInZone(value.occurredAt, value.timezone),
          timezone: value.timezone,
          revision: { increment: 1 },
          demoBatchId: null,
        },
        include: includeMoment,
      });
    });
  }
  static setPreferences(p: Principal, raw: unknown) {
    return write(p, "v1.preferences.update", raw, async (tx) => {
      const value = parse(preferencesInput, raw);
      for (const [key, val] of Object.entries(value))
        await tx.preference.upsert({
          where: { userId_key: { userId: p.userId, key: `workflow.${key}` } },
          create: { userId: p.userId, key: `workflow.${key}`, value: val },
          update: { value: val },
        });
      return value;
    });
  }
  static async preferences(userId: string) {
    const rows = await v1db.preference.findMany({
      where: { userId, key: { startsWith: "workflow." } },
    });
    return Object.fromEntries(rows.map((r) => [r.key.slice(9), r.value]));
  }
  static async workspace(userId: string) {
    const [
      items,
      projects,
      tags,
      moments,
      activities,
      reviews,
      preferences,
      links,
      habitOccurrences,
    ] = await Promise.all([
      V1.items(userId),
      v1db.project.findMany({
        where: { userId },
        include: { tags: { include: { tag: true } } },
      }),
      v1db.tag.findMany({ where: { userId } }),
      v1db.journalMoment.findMany({
        where: { userId },
        include: includeMoment,
        orderBy: { occurredAt: "desc" },
      }),
      v1db.activity.findMany({
        where: { userId },
        orderBy: { occurredAt: "desc" },
      }),
      v1db.review.findMany({ where: { userId } }),
      Workflow.preferences(userId),
      v1db.link.findMany({ where: { userId } }),
      v1db.preference.findMany({
        where: { userId, key: { startsWith: "habit." } },
        select: { key: true, value: true },
      }),
    ]);
    return {
      items,
      projects,
      tags,
      moments,
      activities,
      reviews,
      preferences,
      links,
      habitOccurrences,
    };
  }
  static async search(userId: string, raw: unknown) {
    const value = parse(searchInput, raw),
      q = value.q.replace(/[\\%_]/g, "\\$&");
    const results: {
      id: string;
      kind: string;
      title: string;
      excerpt: string;
      href: string;
    }[] = [];
    const wants = (kind: string) => value.kind === "all" || value.kind === kind;
    const itemWhere = {
      userId,
      ...(value.type ? { type: value.type } : {}),
      ...(value.projectId ? { projectId: value.projectId } : {}),
      ...(value.areaId
        ? {
            OR: [
              {
                tags: { some: { tagId: value.areaId, tag: { kind: "area" } } },
              },
              {
                project: {
                  tags: {
                    some: { tagId: value.areaId, tag: { kind: "area" } },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const match = (fields: string[]) =>
      fields.map((key) => ({
        [key]: { contains: q, mode: "insensitive" as const },
      }));
    const pattern = `%${q}%`;
    const metadataMatches = wants("item")
      ? await v1db.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT "id" FROM "V1Item" WHERE "userId" = ${userId} AND "metadata"::text ILIKE ${pattern}`,
        )
      : [];
    if (wants("item"))
      for (const row of await v1db.item.findMany({
        where: {
          ...itemWhere,
          AND: [
            {
              OR: [
                ...match(["title", "content"]),
                { id: { in: metadataMatches.map((r) => r.id) } },
              ],
            },
          ],
        },
        take: 50,
      }))
        results.push({
          id: row.id,
          kind: "item",
          title: row.title,
          excerpt: row.content.slice(0, 240),
          href: `/app/library/${row.id}`,
        });
    const recordsFilter = !!(value.areaId || value.projectId || value.type);
    if (wants("project") && !value.type)
      for (const row of await v1db.project.findMany({
        where: {
          userId,
          ...(value.projectId ? { id: value.projectId } : {}),
          ...(value.areaId
            ? { tags: { some: { tagId: value.areaId, tag: { kind: "area" } } } }
            : {}),
          OR: match(["name", "description"]),
        },
        take: 50,
      }))
        results.push({
          id: row.id,
          kind: "project",
          title: row.name,
          excerpt: row.description.slice(0, 240),
          href: `/app/projects/${row.id}`,
        });
    if (wants("journal"))
      for (const row of await v1db.journalMoment.findMany({
        where: {
          userId,
          text: { contains: q, mode: "insensitive" },
          ...(recordsFilter ? { items: { some: { item: itemWhere } } } : {}),
        },
        take: 50,
      }))
        results.push({
          id: row.id,
          kind: "journal",
          title: `Journal · ${row.localDate}`,
          excerpt: row.text.slice(0, 240),
          href: `/app/journal?date=${row.localDate}&moment=${row.id}`,
        });
    if (wants("review")) {
      const matches = await v1db.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT "id" FROM "V1Review" WHERE "userId" = ${userId} AND ("prompts"::text ILIKE ${pattern} OR "period" ILIKE ${pattern})`,
      );
      const rows = await v1db.review.findMany({
        where: {
          userId,
          id: { in: matches.map((r) => r.id) },
          ...(recordsFilter ? { items: { some: { item: itemWhere } } } : {}),
        },
        take: 50,
      });
      for (const row of rows)
        results.push({
          id: row.id,
          kind: "review",
          title: `${row.period} review · ${row.localDate}`,
          excerpt: JSON.stringify(row.prompts).slice(0, 240),
          href: `/app/reviews/${row.id}`,
        });
    }
    if (wants("activity")) {
      const matches = await v1db.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT "id" FROM "V1Activity" WHERE "userId" = ${userId} AND ("data"::text ILIKE ${pattern} OR "kind" ILIKE ${pattern})`,
      );
      for (const row of await v1db.activity.findMany({
        where: {
          userId,
          id: { in: matches.map((r) => r.id) },
          ...(recordsFilter ? { item: itemWhere } : {}),
        },
        take: 50,
      }))
        results.push({
          id: row.id,
          kind: "activity",
          title: `${row.kind.replaceAll("_", " ")} · ${row.localDate}`,
          excerpt: JSON.stringify(row.data).slice(0, 240),
          href: `/app/journal?date=${row.localDate}&activity=${row.id}`,
        });
    }
    if (wants("tag") && !recordsFilter)
      for (const row of await v1db.tag.findMany({
        where: { userId, name: { contains: q, mode: "insensitive" } },
        take: 50,
      }))
        results.push({
          id: row.id,
          kind: "tag",
          title: `${row.kind === "area" ? "Area" : "Tag"}: ${row.name}`,
          excerpt: "",
          href: `/app/library?${row.kind === "area" ? "area" : "tag"}=${row.id}`,
        });
    return results;
  }
}
