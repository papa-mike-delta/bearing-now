import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { v1db } from "@/lib/v1/db";
import { V1 } from "@/lib/v1/service";
import { proxy } from "@/proxy";

beforeAll(() => {
  const migrate = (schema: string) =>
    execFileSync(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        "deploy",
        "--schema",
        schema,
      ],
      { env: process.env, stdio: "pipe" },
    );
  migrate("prisma/schema.prisma");
  migrate("prisma/v1/schema.prisma");
});

afterAll(async () => {
  await db.$disconnect();
  await v1db.$disconnect();
});

it("keeps shared and legacy tables and does not copy a V1 note into Item", async () => {
  const rows = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema()
  `;
  const names = new Set(rows.map((row) => row.tablename));
  for (const table of [
    "User",
    "Setting",
    "OperationLedger",
    "Item",
    "Project",
    "Link",
    "Domain",
    "Tag",
    "HabitLog",
    "Review",
    "Reminder",
    "V1Item",
  ]) {
    expect(names.has(table), table).toBe(true);
  }

  const userId = "sunset-user";
  await v1db.account.create({
    data: {
      id: userId,
      email: "sunset@example.test",
      passwordHash: "not-used",
    },
  });
  const created = await V1.createItem(
    { userId, actor: `user:${userId}` },
    { type: "note", title: "Greenfield" },
  );
  expect(created.value.type).toBe("note");
  expect(await db.item.count({ where: { userId } })).toBe(0);
  expect(await v1db.item.count({ where: { userId, type: "note" } })).toBe(1);
  expect(proxy(new NextRequest("http://localhost/api/items")).status).toBe(410);
});
