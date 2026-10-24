import { beforeEach, expect, it, vi } from "vitest";
import { createSession } from "@/lib/auth";
import { POST } from "./route";

const db = vi.hoisted(() => ({
  habitLog: { deleteMany: vi.fn() },
  reviewItem: { deleteMany: vi.fn() },
  review: { deleteMany: vi.fn() },
  link: { deleteMany: vi.fn(), upsert: vi.fn(), findUnique: vi.fn() },
  tagOnItem: { deleteMany: vi.fn() },
  tag: { deleteMany: vi.fn() },
  item: { deleteMany: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
  project: { deleteMany: vi.fn() },
  domain: { deleteMany: vi.fn() },
  operationLedger: { create: vi.fn(), count: vi.fn() },
  setting: { findFirst: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));

const request = (links: unknown) => new Request("http://localhost/api/backup", {
  method: "POST",
  body: JSON.stringify({ version: 1, links }),
});

beforeEach(() => {
  vi.resetAllMocks();
  db.operationLedger.create.mockResolvedValue({ id: "receipt-1" });
  db.$transaction.mockImplementation((run) => run(db));
  db.item.findUniqueOrThrow.mockResolvedValue({ id: "item-1", revision: 0 });
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.link.upsert.mockResolvedValue({ id: "link-1" });
});

it.each(["related", "unknown", null, 42])("rejects backup Link type %j before clearing data", async (type) => {
  const response = await POST(request([
    { fromId: "item-1", toId: "item-2", type: "mentions" },
    { fromId: "item-2", toId: "item-3", type },
  ]));

  expect(response.status).toBe(400);
  expect(db.habitLog.deleteMany).not.toHaveBeenCalled();
  expect(db.link.upsert).not.toHaveBeenCalled();
});

it("restores all six core Link types", async () => {
  const types = ["advances", "tracks", "related_to", "mentions", "scheduled_at", "located_at"];
  const links = types.map((type) => ({ id: `link-${type}`, createdAt: "2026-10-01T00:00:00.000Z", fromId: "item-1", toId: "item-2", type }));

  const response = await POST(request(links));

  expect(response.status).toBe(200);
  expect(db.link.upsert.mock.calls.map(([{ create }]) => create)).toEqual(links);
});

it.each([
  { field: "items", count: 21, entry: { id: "item", type: "note", title: "Restore" }, limit: 20 },
  { field: "links", count: 51, entry: { fromId: "item-1", toId: "item-2", type: "mentions" }, limit: 50 },
])("refuses an over-cap $field restore before deleting existing data", async ({ field, count, entry, limit }) => {
  db.operationLedger.count.mockResolvedValue(0);
  const response = await POST(new Request("http://localhost/api/backup", {
    method: "POST", body: JSON.stringify({ version: 1, [field]: Array.from({ length: count }, () => entry) }),
  }));
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({ receiptId: "receipt-1", ok: false, rateLimited: true, limit });
  expect(db.item.deleteMany).not.toHaveBeenCalled();
  expect(db.habitLog.deleteMany).not.toHaveBeenCalled();
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ operation: "database.clear", status: "refused" }) });
});

it("preserves data if the actor lacks enough remaining allowance for a small restore", async () => {
  db.operationLedger.count.mockResolvedValue(19);
  const response = await POST(new Request("http://localhost/api/backup", {
    method: "POST", body: JSON.stringify({ version: 1, items: [
      { id: "one", title: "One", type: "note" }, { id: "two", title: "Two", type: "note" },
    ] }),
  }));
  expect(response.status).toBe(429);
  expect(db.item.deleteMany).not.toHaveBeenCalled();
});

it("restores tagged items and links for a verified user with exhausted create allowances", async () => {
  db.operationLedger.count.mockResolvedValue(50);
  const response = await POST(new Request("http://localhost/api/backup", {
    method: "POST",
    headers: { cookie: `lifeos-session=${createSession("alice", "alice@example.com", true)}` },
    body: JSON.stringify({ version: 1,
      items: [{ id: "item-1", title: "Tagged", type: "note", tags: [{ tag: { name: "work" } }] }],
      links: [{ fromId: "item-1", toId: "item-2", type: "mentions" }],
    }),
  }));
  expect(response.status).toBe(200);
  expect(db.item.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
    id: "item-1", tags: { create: [{ tag: { connectOrCreate: { where: { name: "work" }, create: { name: "work" } } } }] },
  }) }));
  expect(db.link.upsert).toHaveBeenCalled();
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actor: "user:alice", operation: "link.restore", status: "success" }) });
  expect(db.operationLedger.count).not.toHaveBeenCalled();
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actor: "user:alice", operation: "item.restore", status: "success" }) });
});
