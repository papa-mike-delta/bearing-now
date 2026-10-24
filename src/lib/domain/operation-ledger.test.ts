import { beforeEach, expect, it, vi } from "vitest";
import { OperationLedger } from "./operation-ledger";

const db = vi.hoisted(() => ({
  operationLedger: { findMany: vi.fn() },
  item: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

beforeEach(() => {
  vi.resetAllMocks();
  db.item.findMany.mockResolvedValue([]);
});

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "receipt-1",
    actor: "agent:coach",
    operation: "item.create",
    status: "success",
    payload: JSON.stringify({ data: { title: "Read", type: "note" } }),
    receipt: JSON.stringify({ ok: true, value: { id: "item-new", title: "Draft" } }),
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    ...overrides,
  };
}

it("lists the 50 newest Coach writes and conflict receipts with current Item titles", async () => {
  db.item.findMany.mockResolvedValue([
    { id: "item-1", title: "Read" },
    { id: "item-new", title: "Read" },
  ]);
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

  await expect(OperationLedger.listCoachActivity("alice")).resolves.toEqual([
    {
      id: "receipt-new", operation: "item.update", status: "refused",
      line: "Refused update Read", createdAt: "2026-03-02T00:00:00.000Z",
    },
    {
      id: "receipt-1", operation: "item.create", status: "success",
      line: "Created Read", createdAt: "2026-03-01T00:00:00.000Z",
    },
  ]);
  expect(db.operationLedger.findMany).toHaveBeenCalledWith({
    where: {
      userId: "alice",
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
    take: 50,
  });
  expect(db.item.findMany).toHaveBeenCalledTimes(1);
  expect(db.item.findMany).toHaveBeenCalledWith({
    where: { id: { in: ["item-1", "item-new"] }, userId: "alice" },
    select: { id: true, title: true },
  });
});

it.each([
  {
    operation: "item.archive", status: "success",
    payload: { id: "item-1", data: { status: "archived" } },
    receipt: { ok: true, value: { id: "item-1", title: "Old" } },
    items: [{ id: "item-1", title: "Read" }],
    line: "Archived Read",
  },
  {
    operation: "link.create", status: "success",
    payload: { data: { fromId: "item-1", toId: "item-2", type: "tracks" } },
    receipt: { ok: true, value: { type: "tracks" } },
    items: [{ id: "item-1", title: "Read" }, { id: "item-2", title: "Notes" }],
    line: "Linked Read → Notes",
  },
  {
    operation: "link.delete", status: "refused",
    payload: { data: { fromId: "item-1", toId: "item-2" } },
    receipt: { ok: false, conflict: true, currentRevision: 3 },
    items: [{ id: "item-1", title: "Read" }, { id: "item-2", title: "Notes" }],
    line: "Refused unlink Read → Notes",
  },
  {
    operation: "link.create", status: "success",
    payload: { data: { fromId: "item-1", toId: "item-2", type: "tracks" } },
    receipt: { ok: true, value: { type: "tracks" } },
    items: [{ id: "item-1", title: "Read" }],
    line: "Linked Read",
  },
  {
    operation: "link.update", status: "success",
    payload: { data: { fromId: "gone", toId: "item-2", type: "tracks" } },
    receipt: { ok: true, value: { fromId: "gone", toId: "item-2", type: "tracks" } },
    items: [{ id: "item-2", title: "Notes" }],
    line: "Linked Item → Notes",
  },
  {
    operation: "link.delete", status: "success",
    payload: { data: { fromId: "gone", toId: "also-gone" } },
    receipt: { ok: true, value: { deleted: true } },
    items: [],
    line: "Unlinked Item",
  },
  {
    operation: "item.update", status: "refused",
    payload: { id: "item-1", revision: 4, data: {} },
    receipt: { ok: false, itemOpen: true, itemId: "item-1" },
    items: [{ id: "item-1", title: "Read" }],
    line: "Refused update Read",
  },
  {
    operation: "item.update", status: "refused",
    payload: { id: "gone", revision: 4, data: { title: "Read more" } },
    receipt: { ok: false, conflict: true, currentRevision: 5 },
    items: [],
    line: "Refused update Read more",
  },
  {
    operation: "item.archive", status: "refused",
    payload: { id: "gone", revision: 4, data: { status: "archived" } },
    receipt: { ok: false, conflict: true, currentRevision: null },
    items: [],
    line: "Refused archive Item",
  },
  {
    operation: "coach.getItem", status: "refused",
    payload: { id: "missing" },
    receipt: { ok: false, error: "Item not found" },
    items: [],
    line: "Refused read Item",
  },
])("labels $operation $status as $line", async ({ operation, status, payload, receipt, items, line }) => {
  db.item.findMany.mockResolvedValue(items);
  db.operationLedger.findMany.mockResolvedValue([
    entry({ operation, status, payload: JSON.stringify(payload), receipt: JSON.stringify(receipt) }),
  ]);
  await expect(OperationLedger.listCoachActivity("alice")).resolves.toEqual([
    expect.objectContaining({ operation, status, line }),
  ]);
  expect(line).not.toMatch(/\n/);
  expect(db.item.findMany).toHaveBeenCalledTimes(1);
  expect(db.item.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: { id: true, title: true } }));
});
