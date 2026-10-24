import { beforeEach, expect, it, vi } from "vitest";
import { OperationLedger } from "./operation-ledger";

const db = vi.hoisted(() => ({ operationLedger: { findMany: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));

beforeEach(() => vi.resetAllMocks());

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "receipt-1",
    actor: "agent:coach",
    operation: "item.create",
    status: "success",
    payload: JSON.stringify({ data: { title: "Read", type: "note" } }),
    receipt: JSON.stringify({ ok: true, value: { title: "Read" } }),
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    ...overrides,
  };
}

it("lists Coach writes and conflict receipts newest first", async () => {
  db.operationLedger.findMany.mockResolvedValue([
    entry({
      id: "receipt-new",
      operation: "item.update",
      status: "refused",
      payload: JSON.stringify({ id: "item-1", revision: 4, data: { title: "Read more" } }),
      receipt: JSON.stringify({ ok: false, conflict: true, currentRevision: 5 }),
      createdAt: new Date("2026-03-02T00:00:00.000Z"),
    }),
    entry(),
  ]);

  await expect(OperationLedger.listCoachActivity()).resolves.toEqual([
    {
      id: "receipt-new", operation: "item.update", status: "refused",
      line: "Refused update Read more", createdAt: "2026-03-02T00:00:00.000Z",
    },
    {
      id: "receipt-1", operation: "item.create", status: "success",
      line: "Created Read", createdAt: "2026-03-01T00:00:00.000Z",
    },
  ]);
  expect(db.operationLedger.findMany).toHaveBeenCalledWith({
    where: {
      actor: "agent:coach",
      OR: [
        { status: "refused" },
        { operation: { in: [
          "item.create", "item.update", "item.archive",
          "link.create", "link.update", "link.delete",
        ] } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
});

it.each([
  { operation: "item.archive", status: "success", payload: { id: "item-1", data: { status: "archived" } }, receipt: { ok: true, value: { title: "Read" } }, line: "Archived Read" },
  { operation: "link.create", status: "success", payload: { data: { fromId: "item-1", toId: "item-2", type: "tracks" } }, receipt: { ok: true, value: { type: "tracks" } }, line: "Linked item-1" },
  { operation: "link.delete", status: "refused", payload: { data: { fromId: "item-1", toId: "item-2" } }, receipt: { ok: false, conflict: true, currentRevision: 3 }, line: "Refused unlink item-1" },
  { operation: "item.update", status: "refused", payload: { id: "item-1", revision: 4, data: {} }, receipt: { ok: false, itemOpen: true, itemId: "item-1" }, line: "Refused update item-1" },
  { operation: "coach.getItem", status: "refused", payload: { id: "missing" }, receipt: { ok: false, error: "Item not found" }, line: "Refused read missing" },
])("labels $operation $status as $line", async ({ operation, status, payload, receipt, line }) => {
  db.operationLedger.findMany.mockResolvedValue([
    entry({ operation, status, payload: JSON.stringify(payload), receipt: JSON.stringify(receipt) }),
  ]);
  await expect(OperationLedger.listCoachActivity()).resolves.toEqual([
    expect.objectContaining({ operation, status, line }),
  ]);
});
