import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { db } from "@/lib/db";
import { BackupDomain } from "@/lib/domain/backup";
import { DatabaseDomain } from "@/lib/domain/database";
import { ItemDomain } from "@/lib/domain/item";
import { LinkDomain } from "@/lib/domain/link";

const owner = "restore-owner";
const other = "other-owner";
const agent = "agent:restore-test" as const;
const user = `user:${owner}` as const;
const note = (id: string) => ({ id, title: id, type: "note" });
const backup = (extra: object = {}) => ({ version: 1, items: [note("new-a"), note("new-b")], ...extra });

beforeAll(async () => {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    env: process.env, stdio: "pipe",
  });
  await db.user.createMany({ data: [owner, other].map((id) => ({ id, email: `${id}@example.test`, passwordHash: "test" })) });
});

afterAll(async () => {
  const schema = new URL(process.env.DATABASE_URL!).searchParams.get("schema")!;
  if (!/^restore_test_[a-f0-9]+$/.test(schema)) throw new Error("Refusing to drop a non-test schema");
  try {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await db.$disconnect();
  }
});

beforeEach(async () => {
  for (const userId of [owner, other]) {
    await DatabaseDomain.clear(userId, `user:${userId}`);
    await db.operationLedger.deleteMany({ where: { userId } });
    const domain = await db.domain.create({ data: { id: `${userId}-domain`, userId, key: "health", name: "Health" } });
    const project = await db.project.create({ data: { id: `${userId}-project`, userId, name: "Original", domainId: domain.id } });
    const created = await ItemDomain.create(userId, { ...note(`${userId}-original`), domainId: domain.id, projectId: project.id }, ["original-tag"], `user:${userId}`);
    expect(created.ok).toBe(true);
    await db.habitLog.create({ data: { itemId: `${userId}-original`, date: new Date("2026-10-01") } });
    await db.review.create({ data: { userId, type: "daily", date: new Date("2026-10-01") } });
    await db.setting.create({ data: { id: `${userId}-setting`, userId, value: "original" } });
  }
});

async function snapshot(userId?: string) {
  const filter = userId ? { userId } : {};
  return {
    domains: await db.domain.findMany({ where: filter, orderBy: { id: "asc" } }),
    projects: await db.project.findMany({ where: filter, orderBy: { id: "asc" } }),
    tags: await db.tag.findMany({ where: filter, orderBy: { id: "asc" } }),
    items: await db.item.findMany({ where: filter, include: { tags: true, reminders: true }, orderBy: { id: "asc" } }),
    links: await db.link.findMany({ where: userId ? { from: filter } : {}, orderBy: { id: "asc" } }),
    reviews: await db.review.findMany({ where: filter, include: { items: true }, orderBy: { id: "asc" } }),
    habitLogs: await db.habitLog.findMany({ where: userId ? { item: filter } : {}, orderBy: { id: "asc" } }),
    settings: await db.setting.findMany({ where: filter, orderBy: { id: "asc" } }),
    receipts: await db.operationLedger.findMany({ where: filter, orderBy: { id: "asc" } }),
  };
}

it("restores exported v1 data, tags, Links and receipts without changing another owner", async () => {
  const priorHistory = await db.operationLedger.findMany({ where: { userId: owner } });
  const untouched = await snapshot(other);
  const before = await snapshot(owner);
  const payload = {
    version: 1,
    domains: before.domains, projects: before.projects, tags: before.tags,
    items: before.items.map((item) => ({ ...item, tags: [{ tag: { name: "original-tag" } }] })),
    links: [], reviews: before.reviews, habitLogs: before.habitLogs,
  };
  expect((await BackupDomain.restore(owner, JSON.parse(JSON.stringify(payload)), user)).ok).toBe(true);
  const after = await snapshot(owner);
  expect(after.items[0]).toMatchObject({ id: before.items[0].id, title: before.items[0].title });
  expect(after.tags).toEqual(before.tags);
  expect(after.items[0].tags).toEqual(before.items[0].tags);
  expect(after.habitLogs).toEqual(before.habitLogs);
  expect(after.reviews).toEqual(before.reviews);
  expect(after.receipts).toEqual(expect.arrayContaining(priorHistory));
  expect(after.receipts.filter((r) => r.operation === "item.restore")).toHaveLength(1);
  expect(await snapshot(other)).toEqual(untouched);

  const linked = backup({ links: [{ id: "new-link", fromId: "new-a", toId: "new-b", type: "mentions" }] });
  expect((await BackupDomain.restore(owner, linked, user)).ok).toBe(true);
  expect(await db.link.findUnique({ where: { id: "new-link" } })).toMatchObject({ fromId: "new-a", toId: "new-b" });
  expect(await db.item.findUnique({ where: { id: "new-a" } })).toMatchObject({ revision: 1 });
  expect(await db.operationLedger.count({ where: { userId: owner, operation: "link.restore", status: "success" } })).toBe(1);
});

it.each([
  ["late Item refusal", backup({ items: [note("new-a"), { id: "invalid", type: "note" }] })],
  ["late Link refusal", backup({ links: [
    { fromId: "new-a", toId: "new-b", type: "mentions" },
    { fromId: "new-a", toId: "missing", type: "mentions" },
  ] })],
  ["invalid Link type", backup({ links: [{ fromId: "new-a", toId: "new-b", type: "unknown" }] })],
  ["malformed collection", backup({ reviews: {} })],
  ["foreign Item parent", backup({ items: [{ ...note("new-a"), projectId: `${other}-project` }] })],
  ["foreign project domain", backup({ projects: [{ id: "new-project", name: "Invalid", domainId: `${other}-domain` }] })],
  ["foreign Link endpoint", backup({ links: [{ fromId: "new-a", toId: `${other}-original`, type: "mentions" }] })],
  ["foreign habit log Item", backup({ habitLogs: [{ itemId: `${other}-original`, date: "2026-10-01T00:00:00.000Z" }] })],
])("preserves the complete dataset and receipts on %s", async (_, payload) => {
  const before = await snapshot();
  const result = await BackupDomain.restore(owner, payload, user);
  expect(result.ok).toBe(false);
  expect(result).not.toHaveProperty("receiptId");
  expect(await snapshot()).toEqual(before);
});

it("rolls back accepted writes and receipts on a late PostgreSQL failure", async () => {
  const before = await snapshot();
  // A duplicate primary key fails inside PostgreSQL after clear + Item receipts.
  await expect(BackupDomain.restore(owner, backup({ reviews: [
    { id: "duplicate-review", type: "daily", date: "2026-10-01T00:00:00.000Z" },
    { id: "duplicate-review", type: "daily", date: "2026-10-02T00:00:00.000Z" },
  ] }), user)).rejects.toThrow();
  expect(await snapshot()).toEqual(before);
});

it("preserves data on an agent quota refusal and open Item refusal", async () => {
  for (let i = 0; i < 19; i++) expect((await ItemDomain.create(owner, note(`prior-${i}`), [], agent)).ok).toBe(true);
  let before = await snapshot();
  expect(await BackupDomain.restore(owner, backup(), agent)).toMatchObject({ ok: false, rateLimited: true, limit: 20 });
  expect(await snapshot()).toEqual(before);
  await ItemDomain.setOpen(owner, `${owner}-original`, "tab", true, user);
  before = await snapshot();
  expect(await BackupDomain.restore(owner, backup({ items: [] }), agent)).toMatchObject({ ok: false, itemOpen: true });
  expect(await snapshot()).toEqual(before);
});

it("keeps authenticated restores exempt while ordinary creates remain capped", async () => {
  for (let i = 0; i < 19; i++) expect((await ItemDomain.create(owner, note(`user-prior-${i}`), [], user)).ok).toBe(true);
  expect((await BackupDomain.restore(owner, backup({ items: Array.from({ length: 21 }, (_, i) => note(`restored-${i}`)) }), user)).ok).toBe(true);
  expect(await ItemDomain.create(owner, note("over-cap"), [], user)).toMatchObject({ ok: false, rateLimited: true });
  expect(await db.item.count({ where: { userId: owner } })).toBe(21);
});

it("serializes restore and concurrent agent creates at the cap boundary", async () => {
  for (let i = 0; i < 19; i++) expect((await ItemDomain.create(owner, note(`prior-${i}`), [], agent)).ok).toBe(true);
  const results = await Promise.all([
    BackupDomain.restore(owner, backup({ items: [note("restored-last")] }), agent),
    ItemDomain.create(owner, note("concurrent-last"), [], agent),
  ]);
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(results.find((r) => !r.ok)).toMatchObject({ rateLimited: true, limit: 20 });
  expect(await db.operationLedger.count({ where: { userId: owner, actor: agent, operation: "item.create", status: "success" } })).toBe(20);
});

it("serializes restore and concurrent agent Link creates at the cap boundary", async () => {
  const target = `${owner}-original`;
  for (let i = 0; i < 49; i++) {
    const endpoint = await db.item.create({ data: { ...note(`endpoint-${i}`), userId: owner } });
    const source = await db.item.findUniqueOrThrow({ where: { id: target } });
    expect((await LinkDomain.create(owner, { fromId: target, toId: endpoint.id, type: "mentions" }, source.revision, agent)).ok).toBe(true);
  }
  const source = await db.item.findUniqueOrThrow({ where: { id: target } });
  const results = await Promise.all([
    BackupDomain.restore(owner, backup({ links: [{ fromId: "new-a", toId: "new-b", type: "mentions" }] }), agent),
    LinkDomain.create(owner, { fromId: target, toId: target, type: "related_to" }, source.revision, agent),
  ]);
  // The restore either uses the last allowance or preserves data after refusal.
  // If restore wins, the other write may report missing endpoints after replacement.
  expect(results.filter((r) => r.ok)).toHaveLength(1);
  expect(await db.operationLedger.count({ where: { userId: owner, actor: agent, operation: "link.create", status: "success" } })).toBe(50);
});
