import type { Item } from "@bearing/v1-client";
import crypto from "node:crypto";
import { write, Fault, type Principal } from "./service";
import { snapshot } from "./backup";
import { dateInZone } from "./dates";

const marker = "system.demo";
export class V1Demo {
  static seed(p: Principal) {
    return write(p, "v1.demo.seed", {}, async (tx) => {
      if (!p.actor.startsWith("user:"))
        throw new Fault(403, "Only users may request demo data");
      const exists = await tx.preference.findUnique({
        where: { userId_key: { userId: p.userId, key: marker } },
      });
      if (exists) return { alreadySeeded: true };
      const demoBatchId = crypto.randomUUID(),
        userId = p.userId;
      const area = await tx.tag.create({
        data: {
          userId,
          demoBatchId,
          kind: "area",
          name: `Demo · Wellbeing ${demoBatchId.slice(0, 6)}`,
        },
      });
      const project = await tx.project.create({
        data: {
          userId,
          demoBatchId,
          name: "Demo · A calmer week",
          tags: { create: { tagId: area.id } },
        },
      });
      const items: Item[] = [];
      for (const [type, template, title, metadata, content] of [
        [
          "task",
          "task",
          "Demo · Plan a walk",
          { version: 1 },
          "- [ ] Pick a route\n- [ ] Pack water",
        ],
        [
          "note",
          "note",
          "Demo · Walking ideas",
          { version: 1, summary: "A few nearby routes" },
          "Start with the riverside path.",
        ],
        [
          "habit",
          "routine",
          "Demo · Morning routine",
          { version: 1, cadence: "daily" },
          "- [ ] Stretch\n- [ ] Write a line",
        ],
        [
          "person",
          "person",
          "Demo · Alex",
          { version: 1, importantDates: [] },
          "A fictional friend.",
        ],
        [
          "bookmark",
          "place",
          "Demo · Riverside",
          { version: 1, category: "place", latitude: 40.71, longitude: -74 },
          "",
        ],
        [
          "goal",
          "goal",
          "Demo · Spend time outside",
          { version: 1, outcome: "A little daylight each day" },
          "",
        ],
        [
          "event",
          "event",
          "Demo · Weekend walk",
          { version: 1 },
          "A plan, not a completed interaction.",
        ],
      ] as const) {
        const count = await tx.ledger.count({
          where: {
            userId,
            actor: p.actor,
            operation: { in: ["item.create", "v1.item.create"] },
            status: "success",
            createdAt: { gt: new Date(Date.now() - 3600_000) },
          },
        });
        if (count >= 20)
          throw new Fault(429, "Demo exceeds remaining Item allowance");
        const now = new Date(),
          startAt = type === "event" ? new Date(+now + 86400_000) : null;
        const item = await tx.item.create({
          data: {
            userId,
            demoBatchId,
            type,
            template,
            title,
            metadata,
            content,
            status: "todo",
            projectId: project.id,
            startAt,
            endAt: startAt && new Date(+startAt + 3600_000),
          },
        });
        items.push(item);
        await tx.ledger.create({
          data: {
            userId,
            actor: p.actor,
            operation: "v1.item.create",
            payload: JSON.stringify({ demoBatchId }),
            status: "success",
            receipt: JSON.stringify({ ok: true, value: { id: item.id } }),
          },
        });
      }
      const task = items[0],
        goal = items[5],
        now = new Date(),
        localDate = dateInZone(now, "UTC");
      await tx.itemTag.create({
        data: { userId, itemId: task.id, tagId: area.id },
      });
      const linkCount = await tx.ledger.count({
        where: {
          userId,
          actor: p.actor,
          operation: { in: ["link.create", "v1.link.create"] },
          status: "success",
          createdAt: { gt: new Date(Date.now() - 3600_000) },
        },
      });
      if (linkCount >= 50)
        throw new Fault(429, "Demo exceeds remaining Link allowance");
      const link = await tx.link.create({
        data: {
          userId,
          demoBatchId,
          fromId: task.id,
          toId: goal.id,
          type: "advances",
        },
      });
      await tx.ledger.create({
        data: {
          userId,
          actor: p.actor,
          operation: "v1.link.create",
          payload: JSON.stringify({ demoBatchId }),
          status: "success",
          receipt: JSON.stringify({ ok: true, value: { id: link.id } }),
        },
      });
      const moment = await tx.journalMoment.create({
        data: {
          userId,
          demoBatchId,
          clientId: `demo_${demoBatchId}`,
          text: "Demo · A short walk sounds good.",
          occurredAt: now,
          localDate,
          timezone: "UTC",
          items: { create: { itemId: task.id, relation: "reference" } },
        },
      });
      await tx.activity.create({
        data: {
          userId,
          demoBatchId,
          clientId: `demo_${demoBatchId}`,
          kind: "check_in",
          occurredAt: now,
          localDate,
          timezone: "UTC",
          data: { mood: 4, energy: 3 },
        },
      });
      await tx.review.create({
        data: {
          userId,
          demoBatchId,
          period: "daily",
          localDate,
          timezone: "UTC",
          prompts: { wins: "Demo · Made space for a break", priorities: [] },
          items: { create: { itemId: task.id } },
        },
      });
      const rows = await snapshot(tx, userId);
      const ids = Object.values(rows.tables).flatMap((records) =>
        records
          .filter(
            (r) =>
              "demoBatchId" in r && r.demoBatchId === demoBatchId && "id" in r,
          )
          .map((r) => (r as { id: string }).id),
      );
      await tx.preference.create({
        data: { userId, key: marker, value: { demoBatchId, ids } },
      });
      return { seeded: true, demoBatchId, momentId: moment.id };
    });
  }
  static remove(p: Principal, confirmation: unknown) {
    return write(p, "v1.demo.remove", {}, async (tx) => {
      if (confirmation !== "REMOVE DEMO DATA" || !p.actor.startsWith("user:"))
        throw new Fault(403, "Explicit user confirmation required");
      const entry = await tx.preference.findUnique({
        where: { userId_key: { userId: p.userId, key: marker } },
      });
      if (!entry) return { removed: true };
      const { demoBatchId, ids } = entry.value as {
          demoBatchId: string;
          ids: string[];
        },
        data = await snapshot(tx, p.userId),
        demoIds = new Set(ids);
      for (const [name, rows] of Object.entries(data.tables)) {
        if (name === "ledger" || name === "preferences") continue;
        for (const row of rows) {
          if (
            "id" in row &&
            demoIds.has(row.id as string) &&
            (!("demoBatchId" in row) || row.demoBatchId !== demoBatchId)
          )
            throw new Fault(
              409,
              "Edited demo data is now personal data; remove its references explicitly",
            );
          if ("demoBatchId" in row && row.demoBatchId === demoBatchId) continue;
          // Seed-created join rows are identified by their owning demo record.
          const joinOwner = {
            itemTags: "itemId",
            projectTags: "projectId",
            momentItems: "momentId",
            reviewItems: "reviewId",
          }[name as string];
          if (
            joinOwner &&
            demoIds.has((row as Record<string, unknown>)[joinOwner] as string)
          )
            continue;
          if (
            Object.entries(row).some(
              ([key, value]) =>
                key.endsWith("Id") && demoIds.has(value as string),
            )
          )
            throw new Fault(
              409,
              "Personal data references this demo; remove those references first",
            );
        }
      }
      // Join rows owned by demo entities cascade, other data never participates.
      const where = { userId: p.userId, demoBatchId };
      await tx.activity.deleteMany({ where });
      await tx.journalMoment.deleteMany({ where });
      await tx.review.deleteMany({ where });
      await tx.link.deleteMany({ where });
      await tx.item.deleteMany({ where });
      await tx.project.deleteMany({ where });
      await tx.tag.deleteMany({ where });
      await tx.preference.delete({
        where: { userId_key: { userId: p.userId, key: marker } },
      });
      return { removed: true };
    });
  }
}
