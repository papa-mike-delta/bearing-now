import { z } from "zod";
import { V1, write, owned, parse, Fault } from "./service";
import { id, instant, timezone, revision } from "./contracts";
import { habitPeriod } from "./connected";
import { markdownTasks } from "./workflow-dates";
import type { Principal } from "./service";
import type { HabitOccurrence } from "./client-model";
const occurrenceInput = z.strictObject({
  revision,
  occurredAt: instant,
  timezone,
  checklist: z.array(z.boolean()).max(500),
  value: z.number().finite().nonnegative(),
  complete: z.boolean(),
});
export class Connected {
  static mention(p: Principal, momentId: string, raw: unknown) {
    return write(
      p,
      "v1.moment.mention",
      { momentId, data: raw },
      async (tx) => {
        const { itemId } = parse(z.strictObject({ itemId: id }), raw);
        await owned(tx, p.userId, "journalMoment", momentId);
        await owned(tx, p.userId, "item", itemId);
        return tx.momentItem.upsert({
          where: {
            userId_momentId_itemId_relation: {
              userId: p.userId,
              momentId,
              itemId,
              relation: "mention",
            },
          },
          create: { userId: p.userId, momentId, itemId, relation: "mention" },
          update: {},
        });
      },
    );
  }

  static habit(p: Principal, itemId: string, raw: unknown) {
    return write(
      p,
      "v1.habit.occurrence",
      { itemId, data: raw },
      async (tx) => {
        const input = parse(occurrenceInput, raw);
        const item = await owned(tx, p.userId, "item", itemId);
        if (item.type !== "habit" || item.status === "archived")
          throw new Fault(400, "Choose an active Habit");
        // Habit timezone anchors cadence, independent of which device records the occurrence.
        const cadence =
          (item.metadata as { cadence?: string }).cadence || "daily";
        const period = habitPeriod(input.occurredAt, item.timezone, cadence);
        const key = `habit.${itemId}.${cadence}.${period}`;
        const previous = await tx.preference.findUnique({
          where: { userId_key: { userId: p.userId, key } },
        });
        const saved = previous?.value as HabitOccurrence | undefined;
        if (saved?.completed) {
          if (
            input.complete &&
            saved.value === input.value &&
            JSON.stringify(saved.checklist) === JSON.stringify(input.checklist)
          )
            return saved;
          throw new Fault(
            409,
            "This occurrence is complete; its history is retained",
          );
        }
        if ((saved?.revision || 0) !== input.revision)
          throw new Fault(409, "Habit occurrence changed", {
            currentRevision: saved?.revision || 0,
          });
        const content = saved?.content ?? item.content;
        if (input.checklist.length !== markdownTasks(content).length)
          throw new Fault(400, "Checklist changed; reload the occurrence");
        const value: HabitOccurrence = {
          revision: input.revision + 1,
          period,
          content,
          checklist: input.checklist,
          value: input.value,
          completed: input.complete,
        };
        if (input.complete)
          await V1.createActivity(
            p,
            {
              kind: "habit_completion",
              clientId: `habit_${itemId}_${cadence}_${period}`,
              itemId,
              occurredAt: input.occurredAt,
              timezone: item.timezone,
              data: {
                value: input.value,
                checklist: input.checklist,
                content,
                period,
              },
            },
            tx,
          );
        await tx.preference.upsert({
          where: { userId_key: { userId: p.userId, key } },
          create: { userId: p.userId, key, value },
          update: { value },
        });
        return value;
      },
    );
  }
}
