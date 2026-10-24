import { beforeEach, expect, it, vi } from "vitest";
import { ItemDomain } from "./item";
import { LinkDomain } from "./link";
import { DatabaseDomain } from "./database";

const { db, tx } = vi.hoisted(() => ({
  // The root client deliberately exposes no writes. Only its transaction does.
  db: { $transaction: vi.fn() },
  tx: {
    item: {
      create: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), deleteMany: vi.fn(),
      findFirst: vi.fn(), findMany: vi.fn(),
    },
    link: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    setting: { findFirst: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    operationLedger: { create: vi.fn(), count: vi.fn() },
    habitLog: { deleteMany: vi.fn() }, reviewItem: { deleteMany: vi.fn() },
    review: { deleteMany: vi.fn() }, tagOnItem: { deleteMany: vi.fn() },
    tag: { deleteMany: vi.fn() }, project: { deleteMany: vi.fn() }, domain: { deleteMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));
vi.mock("@/lib/db", () => ({ db }));

beforeEach(() => {
  vi.resetAllMocks();
  tx.operationLedger.create.mockResolvedValue({ id: "receipt-1" });
  db.$transaction.mockImplementation((run) => run(tx));
  tx.item.findFirst.mockResolvedValue({ id: "item" });
  tx.item.findMany.mockImplementation(async ({ where }) => (where?.id?.in ?? []).map((id: string) => ({ id })));
  tx.item.create.mockResolvedValue({ id: "item", revision: 0 });
  tx.item.updateMany.mockResolvedValue({ count: 1 });
  tx.item.findUniqueOrThrow.mockResolvedValue({ id: "item", revision: 1 });
  tx.link.upsert.mockResolvedValue({ id: "link" });
});

const mutations = [
  { operation: "item.create", run: () => ItemDomain.create("alice", { title: "New", type: "note" }) },
  { operation: "item.update", run: () => ItemDomain.update("alice", "item", 0, { title: "Updated" }) },
  { operation: "item.archive", run: () => ItemDomain.archive("alice", "item", 0) },
  { operation: "link.create", run: () => LinkDomain.create("alice", { fromId: "item", toId: "other" }, 0) },
  { operation: "link.delete", run: () => LinkDomain.delete("alice", { fromId: "item", toId: "other" }, 0) },
  { operation: "database.clear", run: () => DatabaseDomain.clear("alice") },
  { operation: "item.open", run: () => ItemDomain.setOpen("alice", "item", "tab", true, "user:alice") },
  { operation: "item.close", run: () => ItemDomain.setOpen("alice", "item", "tab", false, "user:alice") },
];

it.each(mutations)("commits $operation and its receipt through the same transaction", async ({ operation, run }) => {
  const result = await run();
  expect(result.ok).toBe(true);
  expect(db.$transaction).toHaveBeenCalledTimes(1);
  expect(tx.operationLedger.create).toHaveBeenCalledTimes(1);
  const [{ data }] = tx.operationLedger.create.mock.calls[0];
  expect(data).toMatchObject({ operation, status: "success" });
  expect(result.receiptId).toBe("receipt-1");
  const { receiptId, ...outcome } = result;
  expect(JSON.parse(data.receipt)).toEqual(outcome);
});

it.each(mutations)("cannot commit $operation when its ledger write fails", async ({ run }) => {
  const failure = new Error("Ledger unavailable");
  tx.operationLedger.create.mockRejectedValue(failure);
  await expect(run()).rejects.toThrow("Ledger unavailable");
  // Rejecting the actual transaction callback, rather than returning a failure
  // after it commits, makes Prisma roll back every write above.
  await expect(db.$transaction.mock.results[0].value).rejects.toBe(failure);
});
