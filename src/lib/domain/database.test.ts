import { beforeEach, expect, it, vi } from "vitest";
import { DatabaseDomain } from "./database";

const db = vi.hoisted(() => ({
  habitLog: { deleteMany: vi.fn() }, reviewItem: { deleteMany: vi.fn() },
  review: { deleteMany: vi.fn() }, link: { deleteMany: vi.fn() },
  tagOnItem: { deleteMany: vi.fn() }, tag: { deleteMany: vi.fn() },
  item: { deleteMany: vi.fn() }, project: { deleteMany: vi.fn() }, domain: { deleteMany: vi.fn() },
  setting: { findFirst: vi.fn(), deleteMany: vi.fn() }, operationLedger: { create: vi.fn(), count: vi.fn() },
  $transaction: vi.fn(), $queryRaw: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
beforeEach(() => {
  vi.resetAllMocks();
  db.operationLedger.create.mockResolvedValue({ id: "receipt-1" });
  db.$transaction.mockImplementation((run) => run(db));
});

it("records dataset deletion atomically and preserves audit history", async () => {
  expect(await DatabaseDomain.clear("alice", "user:alice")).toEqual({ receiptId: "receipt-1", ok: true, value: { cleared: true } });
  expect(db.item.deleteMany).toHaveBeenCalledWith({ where: { userId: "alice" } });
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    actor: "user:alice", userId: "alice", operation: "database.clear", status: "success",
  }) });
});

it("records and refuses an agent clear when an Item is open", async () => {
  db.setting.findFirst.mockResolvedValue({ id: "open-item:alice:6974656d:user:tab" });
  expect(await DatabaseDomain.clear("alice")).toEqual({ receiptId: "receipt-1", ok: false, itemOpen: true, itemId: "item" });
  expect(db.item.deleteMany).not.toHaveBeenCalled();
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "refused" }) });
});

it("allows a user restore above create caps", async () => {
  db.operationLedger.count.mockResolvedValue(50);
  expect((await DatabaseDomain.clear("alice", "user:alice", { items: 100, links: 100 })).ok).toBe(true);
  expect(db.item.deleteMany).toHaveBeenCalled();
});
