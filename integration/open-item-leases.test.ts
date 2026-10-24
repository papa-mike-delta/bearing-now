import { execFileSync } from "node:child_process";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { ItemDomain } from "@/lib/domain/item";
import { DatabaseDomain } from "@/lib/domain/database";
import { OpenItemLeases } from "@/lib/domain/open-item-leases";
import { OperationLedger } from "@/lib/domain/operation-ledger";
import { listOpenItems } from "@/lib/domain/item-queries";
import { CoachTools } from "@/lib/coach/tools";

const owner = "lease:owner";
const other = "lease:other";
const user = `user:${owner}` as const;
const id = "lease:Item / α";
const target = "lease-target";
const foreign = "foreign-item";
const start = new Date("2026-10-24T12:00:00.000Z").getTime();
const at = (ms: number) => vi.setSystemTime(new Date(start + ms));
const open = (lease: string) => ItemDomain.setOpen(owner, id, lease, true, user);
const close = (lease: string) => ItemDomain.setOpen(owner, id, lease, false, user);
const ids = async (userId = owner) => (await listOpenItems(userId)).map((item) => item.id);

beforeAll(async () => {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env: process.env, stdio: "pipe" });
  await db.user.createMany({ data: [owner, other].map((userId) => ({ id: userId, email: `${userId}@example.test`, passwordHash: "test" })) });
});
afterAll(async () => {
  const schema = new URL(process.env.DATABASE_URL!).searchParams.get("schema")!;
  if (!/^restore_test_[a-f0-9]+$/.test(schema)) throw new Error("Refusing to drop a non-test schema");
  try { await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
  finally { await db.$disconnect(); }
});
beforeEach(async () => {
  vi.useRealTimers();
  for (const userId of [owner, other]) {
    await DatabaseDomain.clear(userId, `user:${userId}`);
    await db.operationLedger.deleteMany({ where: { userId } });
  }
  await db.item.createMany({ data: [
    { id, userId: owner, type: "note", title: "Zebra" },
    { id: target, userId: owner, type: "note", title: "Alpha" },
    { id: foreign, userId: other, type: "note", title: "Other user's Item" },
  ] });
});
afterEach(() => vi.useRealTimers());

it("keeps independent tabs protected until both close, without editing the Item revision", async () => {
  expect((await open("tab-a")).ok).toBe(true);
  expect((await open("tab-b")).ok).toBe(true);
  expect(await ids()).toEqual([id]);
  expect(await CoachTools.listOpenItems(owner)).toMatchObject({ ok: true, value: [{ id }] });
  expect((await close("tab-a")).ok).toBe(true);
  expect(await ids()).toEqual([id]);
  const refused = await CoachTools.updateItem(owner, { id, revision: 0, data: { title: "Refused" } });
  expect(refused).toMatchObject({ ok: false, itemOpen: true, itemId: id });
  expect(await db.operationLedger.findUnique({ where: { id: refused.receiptId } })).toMatchObject({ status: "refused" });
  expect(await db.item.findUnique({ where: { id } })).toMatchObject({ revision: 0, title: "Zebra" });
  expect((await close("tab-b")).ok).toBe(true);
  expect(await ids()).toEqual([]);
  expect(await CoachTools.updateItem(owner, { id, revision: 0, data: { title: "Accepted" } })).toMatchObject({ ok: true });
});

it("expires at exactly 90 seconds in both enumeration and write protection", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(0);
  await open("tab-a");
  at(89_999);
  expect(await ids()).toEqual([id]);
  expect(await CoachTools.archiveItem(owner, { id, revision: 0 })).toMatchObject({ ok: false, itemOpen: true });
  at(90_000);
  expect(await ids()).toEqual([]);
  expect(await CoachTools.listOpenItems(owner)).toMatchObject({ ok: true, value: [] });
  expect(await CoachTools.archiveItem(owner, { id, revision: 0 })).toMatchObject({ ok: true });
});

it("refreshes only one tab's lifetime and closing an expired tab leaves the refreshed tab active", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(0);
  await open("tab-a"); await open("tab-b");
  at(30_000);
  await open("tab-a");
  at(90_000);
  await close("tab-b");
  expect(await ids()).toEqual([id]);
  at(119_999);
  expect(await CoachTools.updateItem(owner, { id, revision: 0, data: { title: "Too early" } })).toMatchObject({ ok: false, itemOpen: true });
  at(120_000);
  expect(await ids()).toEqual([]);
  expect(await CoachTools.updateItem(owner, { id, revision: 0, data: { title: "After refresh expiry" } })).toMatchObject({ ok: true });
});

it("isolates owners even when they use the same lease token", async () => {
  await open("shared-token");
  await ItemDomain.setOpen(other, foreign, "shared-token", true, `user:${other}`);
  expect(await ids(other)).toEqual([foreign]);
  for (const isOpen of [true, false]) {
    expect(await ItemDomain.setOpen(other, id, "shared-token", isOpen, `user:${other}`)).toMatchObject({ ok: false, error: "Not found" });
    expect(await ItemDomain.setOpen(owner, id, "shared-token", isOpen, `user:${other}`)).toMatchObject({ ok: false });
  }
  expect(await ids()).toEqual([id]);
  expect(await ids(other)).toEqual([foreign]);
  await ItemDomain.setOpen(other, foreign, "shared-token", false, `user:${other}`);
  expect(await ids(other)).toEqual([]);
  expect(await ids()).toEqual([id]);
});

it("preserves actor exemptions and blocks Coach Item, Link and maintenance writes", async () => {
  await db.link.create({ data: { fromId: target, toId: id, type: "mentions" } });
  await open("tab-a");
  const results = [
    await CoachTools.updateItem(owner, { id, revision: 0, data: { title: "Blocked" } }),
    await CoachTools.archiveItem(owner, { id, revision: 0 }),
    await CoachTools.createLink(owner, { fromId: target, toId: id, type: "related_to", revision: 0 }),
    await CoachTools.deleteLink(owner, { fromId: target, toId: id, type: "mentions", revision: 0 }),
    await DatabaseDomain.clear(owner, "agent:internal"),
  ];
  for (const result of results) expect(result).toMatchObject({ ok: false, itemOpen: true, itemId: id });
  expect(await db.item.count({ where: { userId: owner } })).toBe(2);
  expect(await db.link.count({ where: { fromId: target } })).toBe(1);
  expect(await ItemDomain.update(owner, id, 0, { title: "User may edit" }, undefined, user)).toMatchObject({ ok: true });
  expect(await ItemDomain.setOpen(owner, id, "agent-tab", true, "agent:coach")).toMatchObject({ ok: false });
});

it("lists each active Item once, in title order, after independent closes", async () => {
  await open("tab-a"); await open("tab-b");
  await ItemDomain.setOpen(owner, target, "tab-c", true, user);
  expect(await ids()).toEqual([target, id]);
  await close("tab-a");
  expect(await ids()).toEqual([target, id]);
  await close("tab-b");
  expect(await ids()).toEqual([target]);
});

it("reads and closes the existing stored lease format without a migration", async () => {
  const legacyKey = `open-item:${owner}:${Buffer.from(id).toString("hex")}:${Buffer.from(user).toString("hex")}:existing-tab`;
  await db.setting.create({ data: { id: legacyKey, userId: owner, value: new Date(Date.now() + 90_000).toISOString() } });
  expect(await ids()).toEqual([id]);
  expect(await CoachTools.archiveItem(owner, { id, revision: 0 })).toMatchObject({ ok: false, itemOpen: true });
  await close("existing-tab");
  expect(await db.setting.findUnique({ where: { id: legacyKey } })).toBeNull();
  expect(await ids()).toEqual([]);
});

it("ignores corrupt, expired, orphaned and foreign markers consistently", async () => {
  const prefix = `open-item:${owner}:`;
  const hex = (value: string) => Buffer.from(value).toString("hex");
  const key = (item: string, actor: string, lease: string) => `${prefix}${hex(item)}:${hex(actor)}:${lease}`;
  const future = "2099-01-01T00:00:00.000Z";
  const row = (key: string, value = future, userId = owner) => ({ id: key, value, userId });
  await db.setting.createMany({ data: [
    row(`${prefix}zz:${hex(user)}:bad-hex`),
    row(`${prefix}f:${hex(user)}:odd-hex`),
    row(`${prefix}ff:${hex(user)}:invalid-utf8`),
    row(`${prefix}00:${hex(user)}:nul-item`),
    row(key(id, `user:${other}`, "wrong-actor")),
    row(key(id, "agent:coach", "agent-marker")),
    row(key(id, user, "has:colon")),
    row(key(id, user, "")),
    row(key(id, user, "bad-date"), "9999-not-a-date"),
    row(key(id, user, "noncanonical-date"), "2099-01-01"),
    row(key(id, user, "expired"), "2000-01-01T00:00:00.000Z"),
    row(key(id, user, "wrong-column-owner"), future, other),
    row(key("missing-item", user, "orphan")),
    row(key(foreign, user, "foreign-item")),
    row(`open-item:${other}:${hex(id)}:${hex(user)}:wrong-prefix`),
  ] });
  expect(await ids()).toEqual([]);
  expect(await ids(other)).toEqual([]);
  const contradictory = await db.setting.findUnique({ where: { id: key(id, user, "wrong-column-owner") } });
  expect(await open("wrong-column-owner")).toMatchObject({ ok: false, error: "Not found" });
  expect(await close("wrong-column-owner")).toMatchObject({ ok: false, error: "Not found" });
  expect(await db.setting.findUnique({ where: { id: key(id, user, "wrong-column-owner") } })).toEqual(contradictory);
  expect(await CoachTools.updateItem(owner, { id, revision: 0, data: { title: "No valid lease" } })).toMatchObject({ ok: true });
  await open("valid-tab");
  expect(await ids()).toEqual([id]);
  expect(await CoachTools.updateItem(owner, { id, revision: 1, data: { title: "Now protected" } })).toMatchObject({ ok: false, itemOpen: true, itemId: id });
});

it("serializes a concurrent Coach write behind a lease refresh using the existing ledger lock", async () => {
  let acquired!: () => void, release!: () => void;
  const ready = new Promise<void>((resolve) => { acquired = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const refreshing = OperationLedger.run(user, owner, { operation: "item.open", payload: { id, lease: "tab" } }, async (tx) => {
    const result = await OpenItemLeases.setOpen(tx, owner, id, "tab", true, user);
    acquired();
    await gate;
    return result;
  });
  let writing: ReturnType<typeof CoachTools.updateItem> | undefined;
  try {
    await ready;
    writing = CoachTools.updateItem(owner, { id, revision: 0, data: { title: "Concurrent" } });
    // Observe PostgreSQL waiting on the lock, rather than guessing with a sleep.
    await vi.waitFor(async () => {
      const [row] = await db.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND objid = 731909 AND NOT granted`;
      expect(Number(row.count)).toBeGreaterThan(0);
    }, { timeout: 2000, interval: 10 });
  } finally { release(); }
  expect((await refreshing).ok).toBe(true);
  expect(await writing).toMatchObject({ ok: false, itemOpen: true, itemId: id });
  expect(await db.item.findUnique({ where: { id } })).toMatchObject({ revision: 0, title: "Zebra" });
});
