import { beforeEach, expect, it, vi } from "vitest";
import { DatabaseDomain } from "./database";

const db = vi.hoisted(() => ({
  habitLog: { deleteMany: vi.fn() }, reviewItem: { deleteMany: vi.fn() },
  review: { deleteMany: vi.fn() }, link: { deleteMany: vi.fn() },
  tagOnItem: { deleteMany: vi.fn() }, tag: { deleteMany: vi.fn() },
  item: { deleteMany: vi.fn() }, project: { deleteMany: vi.fn() }, domain: { deleteMany: vi.fn() },
  setting: { findFirst: vi.fn() }, operationLedger: { create: vi.fn() },
  $transaction: vi.fn(), $queryRaw: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((run) => run(db));
});

it("records dataset deletion atomically and preserves audit history", async () => {
  expect(await DatabaseDomain.clear("user:alice")).toEqual({ ok: true, value: { cleared: true } });
  expect(db.item.deleteMany).toHaveBeenCalled();
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    actor: "user:alice", operation: "database.clear", status: "success",
  }) });
});

it("records and refuses an agent clear when an Item is open", async () => {
  db.setting.findFirst.mockResolvedValue({ id: "open-item:6974656d:user:tab" });
  expect(await DatabaseDomain.clear()).toEqual({ ok: false, itemOpen: true, itemId: "item" });
  expect(db.item.deleteMany).not.toHaveBeenCalled();
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "refused" }) });
});
