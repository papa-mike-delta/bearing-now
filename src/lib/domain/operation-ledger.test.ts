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

it("uses stored titles then Item when current Items no longer exist", async () => {
  db.operationLedger.findMany.mockResolvedValue([
    entry({ id: "stored", operation: "item.update", status: "refused", payload: JSON.stringify({ id: "gone", data: { title: "Stored" } }), receipt: '{"ok":false}' }),
    entry({ id: "missing", operation: "item.archive", status: "refused", payload: '{"id":"gone"}', receipt: '{"ok":false}' }),
  ]);
  expect((await OperationLedger.listCoachActivity("alice")).map(({ line }) => line)).toEqual([
    "Refused update Stored", "Refused archive Item",
  ]);
});

it("renders malformed and unknown stored operations without changing feed order or title scope", async () => {
  db.operationLedger.findMany.mockResolvedValue([
    entry({ id: "legacy", operation: "legacy.write", status: "refused", payload: "{broken", receipt: "null" }),
    entry({ id: "missing", operation: "item.archive", status: "refused", payload: '{"id":"foreign"}', receipt: "[]" }),
  ]);
  const activity = await OperationLedger.listCoachActivity("alice");
  expect(activity.map(({ id, line }) => ({ id, line }))).toEqual([
    { id: "legacy", line: "Refused legacy.write Item" },
    { id: "missing", line: "Refused archive Item" },
  ]);
  expect(db.item.findMany).toHaveBeenCalledTimes(1);
  expect(db.item.findMany).toHaveBeenCalledWith({ where: { id: { in: ["foreign"] }, userId: "alice" }, select: { id: true, title: true } });
});
