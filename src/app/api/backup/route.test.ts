import { beforeEach, expect, it, vi } from "vitest";
import { createSession } from "@/lib/auth";
import { POST } from "./route";

const db = vi.hoisted(() => ({
  habitLog: { deleteMany: vi.fn(), create: vi.fn() },
  reviewItem: { deleteMany: vi.fn() },
  review: { deleteMany: vi.fn(), create: vi.fn() },
  link: { deleteMany: vi.fn(), upsert: vi.fn(), findUnique: vi.fn() },
  tagOnItem: { deleteMany: vi.fn() },
  tag: { deleteMany: vi.fn(), create: vi.fn() },
  item: { deleteMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  project: { deleteMany: vi.fn(), create: vi.fn() },
  domain: { deleteMany: vi.fn(), create: vi.fn() },
  operationLedger: { create: vi.fn(), count: vi.fn() },
  setting: { findMany: vi.fn(), deleteMany: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));

const cookie = `lifeos-session=${createSession("alice", "alice@example.com", true)}`;
const request = (links: unknown, authenticated = true) => new Request("http://localhost/api/backup", {
  method: "POST",
  headers: authenticated ? { cookie } : {},
  body: JSON.stringify({ version: 1, links }),
});

beforeEach(() => {
  vi.resetAllMocks();
  db.setting.findMany.mockResolvedValue([]);
  db.operationLedger.create.mockResolvedValue({ id: "receipt-1" });
  db.$transaction.mockImplementation((run) => run(db));
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.item.findFirst.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id, revision: 0 }));
  db.item.findMany.mockImplementation(async ({ where }) => (where?.id?.in ?? []).map((id: string) => ({ id })));
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
  expect(db.link.upsert.mock.calls.map(([{ create }]) => create)).toEqual(links.map((link) => ({ ...link, note: undefined })));
});

it.each([
  { field: "items", count: 21, entry: { id: "item", type: "note", title: "Restore" } },
  { field: "links", count: 51, entry: { fromId: "item-1", toId: "item-2", type: "mentions" } },
])("requires a session before an over-cap $field restore can clear data", async ({ field, count, entry }) => {
  db.operationLedger.count.mockResolvedValue(0);
  const response = await POST(new Request("http://localhost/api/backup", {
    method: "POST", body: JSON.stringify({ version: 1, [field]: Array.from({ length: count }, () => entry) }),
  }));
  expect(response.status).toBe(401);
  expect(db.item.deleteMany).not.toHaveBeenCalled();
  expect(db.habitLog.deleteMany).not.toHaveBeenCalled();
  expect(db.operationLedger.create).not.toHaveBeenCalled();
});

it("requires a session before a restore can clear data", async () => {
  db.operationLedger.count.mockResolvedValue(19);
  const response = await POST(new Request("http://localhost/api/backup", {
    method: "POST", body: JSON.stringify({ version: 1, items: [
      { id: "one", title: "One", type: "note" }, { id: "two", title: "Two", type: "note" },
    ] }),
  }));
  expect(response.status).toBe(401);
  expect(db.item.deleteMany).not.toHaveBeenCalled();
});

it("restores tagged items and links for a verified user with exhausted create allowances", async () => {
  db.operationLedger.count.mockResolvedValue(50);
  const response = await POST(new Request("http://localhost/api/backup", {
    method: "POST",
    headers: { cookie },
    body: JSON.stringify({ version: 1,
      items: [{ id: "item-1", title: "Tagged", type: "note", tags: [{ tag: { name: "work" } }] }],
      links: [{ fromId: "item-1", toId: "item-2", type: "mentions" }],
    }),
  }));
  expect(response.status).toBe(200);
  expect(db.item.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
    id: "item-1",
    userId: "alice",
    tags: { create: [{ tag: { connectOrCreate: {
      where: { userId_name: { userId: "alice", name: "work" } },
      create: { name: "work", userId: "alice" },
    } } }] },
  }) }));
  expect(db.link.upsert).toHaveBeenCalled();
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actor: "user:alice", operation: "link.restore", status: "success" }) });
  expect(db.operationLedger.count).not.toHaveBeenCalled();
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actor: "user:alice", operation: "item.restore", status: "success" }) });
});

it("returns a late domain refusal without a rolled-back receipt id", async () => {
  const response = await POST(new Request("http://localhost/api/backup", {
    method: "POST", headers: { cookie },
    body: JSON.stringify({ version: 1, items: [
      { id: "first", title: "First", type: "note" },
      { id: "invalid", type: "note" },
    ] }),
  }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "title is required" });
  // Real rollback is covered against PostgreSQL in integration/backup.test.ts.
  await expect(db.$transaction.mock.results[0].value).rejects.toBeDefined();
  expect(db.$transaction).toHaveBeenCalledTimes(1);
});

it("serializes a late database failure as the existing restore error response", async () => {
  db.link.upsert.mockRejectedValue(new Error("database unavailable"));
  const response = await POST(request([{ fromId: "item-1", toId: "item-2", type: "mentions" }]));
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Restore failed: database unavailable" });
  await expect(db.$transaction.mock.results[0].value).rejects.toThrow("database unavailable");
});

it.each([{ items: {} }, { items: "items" }, { items: [null] }])("rejects malformed Item collections $items before a transaction", async ({ items }) => {
  const response = await POST(new Request("http://localhost/api/backup", {
    method: "POST", headers: { cookie }, body: JSON.stringify({ version: 1, items }),
  }));
  expect(response.status).toBe(400);
  expect(db.$transaction).not.toHaveBeenCalled();
});
