import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LinkDomain } from "./link";

const db = vi.hoisted(() => ({
  item: { updateMany: vi.fn(), findUnique: vi.fn() },
  link: { upsert: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() },
  operationLedger: { create: vi.fn(), count: vi.fn() },
  setting: { findFirst: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));

// Each public mutation exercised below must finish through a ledger transaction,
// including validation, revision, cap, and open-item refusals.
afterEach(() => {
  expect(db.$transaction).toHaveBeenCalled();
  expect(db.operationLedger.create).toHaveBeenCalledTimes(db.$transaction.mock.calls.length);
});
beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((run) => run(db));
});

it("creates a typed Link when the source revision matches", async () => {
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.link.upsert.mockResolvedValue({ id: "link-1", type: "tracks" });
  expect(await LinkDomain.create({ fromId: "from", toId: "to", type: "tracks" }, 4)).toEqual({
    ok: true, value: { id: "link-1", type: "tracks" },
  });
  expect(db.item.updateMany).toHaveBeenCalledWith({
    where: { id: "from", revision: 4 }, data: { revision: { increment: 1 } },
  });
});

it("deletes a Link when the source revision matches", async () => {
  db.item.updateMany.mockResolvedValue({ count: 1 });
  expect(await LinkDomain.delete({ fromId: "from", toId: "to", type: "tracks" }, 4)).toEqual({
    ok: true, value: { deleted: true },
  });
  expect(db.link.deleteMany).toHaveBeenCalledWith({ where: { fromId: "from", toId: "to", type: "tracks" } });
});

it.each(["create", "delete"] as const)("rejects stale Link %s without writing", async (operation) => {
  db.item.updateMany.mockResolvedValue({ count: 0 });
  db.item.findUnique.mockResolvedValue({ revision: 5 });
  expect(await LinkDomain[operation]({ fromId: "from", toId: "to" }, 4)).toEqual({
    ok: false, conflict: true, currentRevision: 5,
  });
  expect(db.link.upsert).not.toHaveBeenCalled();
  expect(db.link.deleteMany).not.toHaveBeenCalled();
});

it("validates Link types in the domain before writing", async () => {
  expect(await LinkDomain.create({ fromId: "from", toId: "to", type: "unknown" }, 4)).toEqual({
    ok: false, error: "Invalid Link type",
  });
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "refused" }) });
});

it.each(["create", "delete"] as const)("rejects Link %s without a source revision", async (operation) => {
  expect(await LinkDomain[operation]({ fromId: "from", toId: "to" }, undefined as unknown as number)).toMatchObject({
    ok: false, error: expect.any(String),
  });
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "refused" }) });
});

it("refuses a 51st Link create and records it without incrementing the source revision", async () => {
  db.operationLedger.count.mockResolvedValue(50);
  expect(await LinkDomain.create({ fromId: "from", toId: "to" }, 4)).toEqual({
    ok: false, rateLimited: true, limit: 50,
  });
  expect(db.item.updateMany).not.toHaveBeenCalled();
  expect(db.link.upsert).not.toHaveBeenCalled();
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    operation: "link.create", status: "refused", receipt: '{"ok":false,"rateLimited":true,"limit":50}',
  }) });
});

it.each(["create", "delete"] as const)("refuses Link %s when either endpoint is open", async (operation) => {
  db.setting.findFirst.mockResolvedValue({ id: "open-item:746f:user:tab" });
  expect(await LinkDomain[operation]({ fromId: "from", toId: "to" }, 4)).toEqual({
    ok: false, itemOpen: true, itemId: "to",
  });
  expect(db.item.updateMany).not.toHaveBeenCalled();
  expect(db.link.upsert).not.toHaveBeenCalled();
  expect(db.link.deleteMany).not.toHaveBeenCalled();
  expect(db.setting.findFirst).toHaveBeenCalledWith({ where: {
    OR: [{ id: { startsWith: "open-item:66726f6d:" } }, { id: { startsWith: "open-item:746f:" } }],
    value: { gt: expect.any(String) },
  } });
});

it("allows the 50th Link create and records a successful Link receipt", async () => {
  db.operationLedger.count.mockResolvedValue(49);
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.link.upsert.mockResolvedValue({ id: "fiftieth", type: "related_to" });
  expect(await LinkDomain.create({ fromId: "from", toId: "to" }, 4, "agent:coach")).toMatchObject({ ok: true });
  expect(db.operationLedger.count).toHaveBeenCalledWith({ where: {
    actor: "agent:coach", operation: "link.create", status: "success", createdAt: { gt: expect.any(Date) },
  } });
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    actor: "agent:coach", operation: "link.create", status: "success",
    receipt: '{"ok":true,"value":{"id":"fiftieth","type":"related_to"}}',
  }) });
});

it("updates an existing Link even at the create cap, recording an update", async () => {
  db.operationLedger.count.mockResolvedValue(50);
  db.link.findUnique.mockResolvedValue({ id: "existing" });
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.link.upsert.mockResolvedValue({ id: "existing", note: "Revised" });
  expect(await LinkDomain.create({ fromId: "from", toId: "to", note: "Revised" }, 4)).toMatchObject({ ok: true });
  expect(db.operationLedger.count).not.toHaveBeenCalled();
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ operation: "link.update", status: "success" }) });
});
