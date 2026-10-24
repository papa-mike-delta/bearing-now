import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ItemDomain } from "./item";

const db = vi.hoisted(() => ({
  item: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  tagOnItem: { deleteMany: vi.fn(), createMany: vi.fn() },
  tag: { upsert: vi.fn() },
  operationLedger: { create: vi.fn(), count: vi.fn() },
  setting: { findFirst: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));

// Each public mutation exercised below must finish through a ledger transaction,
// including validation, revision, cap, and open-item refusals.
afterEach(() => {
  expect(db.$transaction).toHaveBeenCalled();
  expect(db.operationLedger.create).toHaveBeenCalledTimes(db.$transaction.mock.calls.length);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.resetAllMocks();
  db.operationLedger.create.mockResolvedValue({ id: "receipt-1" });
  db.item.findFirst.mockResolvedValue({ id: "item-1" });
  db.$transaction.mockImplementation((run) => run(db));
});

it("updates at the loaded revision and returns the next revision", async () => {
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.item.findUniqueOrThrow.mockResolvedValue({ id: "item-1", title: "Updated", revision: 5 });

  expect(await ItemDomain.update("alice", "item-1", 4, { title: "Updated" })).toEqual({
    receiptId: "receipt-1", ok: true, value: { id: "item-1", title: "Updated", revision: 5 },
  });
  expect(db.item.updateMany).toHaveBeenCalledWith({
    where: { id: "item-1", userId: "alice", revision: 4 },
    data: { title: "Updated", revision: { increment: 1 } },
  });
});

it("rejects a stale revision without changing tags", async () => {
  db.item.updateMany.mockResolvedValue({ count: 0 });
  db.item.findFirst.mockResolvedValue({ revision: 5 });
  expect(await ItemDomain.update("alice", "item-1", 4, { title: "Stale" }, ["new"])).toEqual({
    receiptId: "receipt-1", ok: false, conflict: true, currentRevision: 5,
  });
  expect(db.tagOnItem.deleteMany).not.toHaveBeenCalled();
});

it("archives at the loaded revision", async () => {
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.item.findUniqueOrThrow.mockResolvedValue({ id: "item-1", status: "archived", revision: 5 });
  expect(await ItemDomain.archive("alice", "item-1", 4)).toMatchObject({
    ok: true, value: { status: "archived", revision: 5 },
  });
  expect(db.item.updateMany).toHaveBeenCalledWith({
    where: { id: "item-1", userId: "alice", revision: 4 },
    data: { status: "archived", completedAt: null, revision: { increment: 1 } },
  });
});

it("creates an Item with its initial revision and tags", async () => {
  db.item.create.mockResolvedValue({ id: "new", title: "New", revision: 0, tags: [{ tag: { name: "work" } }] });
  expect(await ItemDomain.create("alice", { type: "note", title: "New" }, ["work"])).toMatchObject({
    ok: true, value: { id: "new", revision: 0, tags: [{ tag: { name: "work" } }] },
  });
  expect(db.item.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ title: "New", type: "note", revision: 0 }),
  }));
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    actor: "agent:internal", operation: "item.create", status: "success",
    payload: JSON.stringify({ data: { type: "note", title: "New" }, tagNames: ["work"] }),
    receipt: expect.any(String),
  }) });
});

it("returns synchronized tags and manages completion on status changes", async () => {
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.tag.upsert.mockResolvedValue({ id: "tag-1" });
  db.item.findUniqueOrThrow.mockResolvedValue({ revision: 5, tags: [{ tag: { name: "work" } }] });
  expect(await ItemDomain.update("alice", "item-1", 4, { status: "done" }, ["work"])).toMatchObject({
    ok: true, value: { revision: 5, tags: [{ tag: { name: "work" } }] },
  });
  expect(db.item.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: { status: "done", completedAt: expect.any(Date), revision: { increment: 1 } },
  }));
  expect(db.tagOnItem.createMany).toHaveBeenCalledWith({ data: [{ itemId: "item-1", tagId: "tag-1" }] });
});

it("rejects an archive with a stale revision", async () => {
  db.item.updateMany.mockResolvedValue({ count: 0 });
  db.item.findFirst.mockResolvedValue({ revision: 5 });
  expect(await ItemDomain.archive("alice", "item-1", 4)).toEqual({ receiptId: "receipt-1", ok: false, conflict: true, currentRevision: 5 });
});

it("reports a removed Item as a conflict with no current revision", async () => {
  db.item.updateMany.mockResolvedValue({ count: 0 });
  db.item.findFirst.mockResolvedValue(null);
  expect(await ItemDomain.update("alice", "missing", 4, { title: "Stale" })).toEqual({
    receiptId: "receipt-1", ok: false, conflict: true, currentRevision: null,
  });
});

it.each([undefined, null, "4", -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid revision %j in the domain", async (revision) => {
  expect(await ItemDomain.update("alice", "item-1", revision as number, { title: "Invalid" })).toMatchObject({ ok: false, error: expect.any(String) });
  expect(db.item.updateMany).not.toHaveBeenCalled();
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "refused" }) });
});

it("blocks identity changes and nested writes that would bypass revision checks", async () => {
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.item.findUniqueOrThrow.mockResolvedValue({ id: "item-1", revision: 5 });
  const untrusted = JSON.parse('{"title":"Allowed","id":"other","revision":99,"linksFrom":{"create":{"toId":"other"}}}');
  await ItemDomain.update("alice", "item-1", 4, untrusted);
  expect(db.item.updateMany).toHaveBeenCalledWith({
    where: { id: "item-1", userId: "alice", revision: 4 }, data: { title: "Allowed", revision: { increment: 1 } },
  });
});

it("refuses a 21st Item create in the actor's rolling hour and records the refusal", async () => {
  db.operationLedger.count.mockResolvedValue(20);
  expect(await ItemDomain.create("alice", { type: "note", title: "Over cap" }, [], "agent:coach")).toEqual({
    receiptId: "receipt-1", ok: false, rateLimited: true, limit: 20,
  });
  expect(db.item.create).not.toHaveBeenCalled();
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    actor: "agent:coach", operation: "item.create", status: "refused",
    receipt: '{"ok":false,"rateLimited":true,"limit":20}',
  }) });
});

it.each(["update", "archive"] as const)("refuses an agent %s of an open Item and records the refusal", async (operation) => {
  db.setting.findFirst.mockResolvedValue({ id: "open-item:alice:6974656d2d31:user:tab", value: "2099-01-01T00:00:00.000Z" });
  const result = operation === "archive" ? await ItemDomain.archive("alice", "item-1", 4) :
    await ItemDomain.update("alice", "item-1", 4, { title: "Agent edit" });
  expect(result).toEqual({ receiptId: "receipt-1", ok: false, itemOpen: true, itemId: "item-1" });
  expect(db.item.updateMany).not.toHaveBeenCalled();
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    operation: `item.${operation}`, status: "refused",
  }) });
});

it("refreshes a user's open-item lease without editing the Item revision", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
  const result = await ItemDomain.setOpen("alice", "item-1", "tab-1", true, "user:alice");
  expect(result).toMatchObject({ ok: true, value: { open: true } });
  expect(db.setting.upsert).toHaveBeenCalledWith({
    where: { id: "open-item:alice:6974656d2d31:757365723a616c696365:tab-1" },
    create: { id: "open-item:alice:6974656d2d31:757365723a616c696365:tab-1", value: "2026-10-23T12:01:30.000Z", userId: "alice" },
    update: { value: "2026-10-23T12:01:30.000Z" },
  });
  expect(db.item.updateMany).not.toHaveBeenCalled();
});

it("permits the user's own edits while the Item is open", async () => {
  db.setting.findFirst.mockResolvedValue({ id: "open-item:6974656d2d31:user:tab" });
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.item.findUniqueOrThrow.mockResolvedValue({ id: "item-1", revision: 5 });
  expect(await ItemDomain.update("alice", "item-1", 4, { title: "My edit" }, undefined, "user:alice")).toMatchObject({ ok: true });
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actor: "user:alice", status: "success" }) });
});

it("closes only this user's lease, leaving other tabs' leases intact", async () => {
  expect(await ItemDomain.setOpen("alice", "item-1", "tab-1", false, "user:alice")).toEqual({ receiptId: "receipt-1", ok: true, value: { open: false } });
  expect(db.setting.deleteMany).toHaveBeenLastCalledWith({ where: { id: "open-item:alice:6974656d2d31:757365723a616c696365:tab-1", userId: "alice" } });
  expect(db.setting.upsert).not.toHaveBeenCalled();
});

it.each(["agent:coach", "user:alice"] as const)("records invalid presence from %s without changing any marker", async (actor) => {
  expect(await ItemDomain.setOpen("alice", "item-1", "bad:lease", true, actor)).toMatchObject({ ok: false, error: expect.any(String) });
  expect(db.setting.upsert).not.toHaveBeenCalled();
  expect(db.setting.deleteMany).not.toHaveBeenCalled();
});

it("allows the 20th Item create and counts only this actor's successful creates in the preceding hour", async () => {
  vi.spyOn(Date, "now").mockReturnValue(new Date("2026-10-23T12:00:00Z").getTime());
  db.operationLedger.count.mockResolvedValue(19);
  db.item.create.mockResolvedValue({ id: "twentieth", revision: 0 });
  expect(await ItemDomain.create("alice", { title: "Twentieth", type: "note" }, [], "agent:coach")).toMatchObject({ ok: true });
  expect(db.operationLedger.count).toHaveBeenCalledWith({ where: {
    userId: "alice", actor: "agent:coach", operation: "item.create", status: "success",
    createdAt: { gt: new Date("2026-10-23T11:00:00Z") },
  } });
});

it("permits agent writes once all leases have expired, including the exact TTL boundary", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-23T12:01:30Z"));
  db.setting.findFirst.mockResolvedValue(null);
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.item.findUniqueOrThrow.mockResolvedValue({ id: "item-1", revision: 5 });
  expect(await ItemDomain.update("alice", "item-1", 4, { title: "After expiry" })).toMatchObject({ ok: true });
  expect(db.setting.findFirst).toHaveBeenCalledWith({ where: {
    userId: "alice",
    OR: [{ id: { startsWith: "open-item:alice:6974656d2d31:" } }],
    value: { gt: "2026-10-23T12:01:30.000Z" },
  } });
});
