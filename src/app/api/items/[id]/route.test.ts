import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH, DELETE } from "./route";

const db = vi.hoisted(() => ({
  item: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
}));
const { item } = db;
vi.mock("@/lib/db", () => ({ db }));

const ctx = { params: Promise.resolve({ id: "item-1" }) };

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((run) => run(db));
});

it("returns the Item revision on reads", async () => {
  item.findUnique.mockResolvedValue({ id: "item-1", revision: 4, metadata: null });

  const response = await GET(new NextRequest("http://localhost/api/items/item-1"), ctx);

  expect(await response.json()).toMatchObject({ id: "item-1", revision: 4 });
});

it("atomically increments and returns the revision when updating an Item", async () => {
  item.updateMany.mockResolvedValue({ count: 1 });
  item.findUniqueOrThrow.mockResolvedValue({ id: "item-1", title: "Updated", revision: 5, metadata: null });

  const response = await PATCH(new NextRequest("http://localhost/api/items/item-1", {
    method: "PATCH",
    body: JSON.stringify({ title: "Updated", revision: 4 }),
  }), ctx);

  expect(item.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: "item-1", revision: 4 },
    data: { title: "Updated", revision: { increment: 1 } },
  }));
  expect(await response.json()).toMatchObject({ id: "item-1", revision: 5 });
});

it.each(["PATCH", "DELETE"])("returns 409 for a stale %s", async (method) => {
  item.updateMany.mockResolvedValue({ count: 0 });
  item.findUnique.mockResolvedValue({ revision: 5 });
  const req = new NextRequest("http://localhost/api/items/item-1", {
    method, body: JSON.stringify({ revision: 4, title: "Stale" }),
  });
  const response = await (method === "PATCH" ? PATCH : DELETE)(req, ctx);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ conflict: true, currentRevision: 5 });
});

it.each([undefined, null, "4", -1, 1.5])("rejects invalid revision %j before updating", async (revision) => {
  const response = await PATCH(new NextRequest("http://localhost/api/items/item-1", {
    method: "PATCH", body: JSON.stringify({ revision, title: "Invalid" }),
  }), ctx);
  expect(response.status).toBe(400);
  expect(item.updateMany).not.toHaveBeenCalled();
});

it("archives rather than physically deleting an Item", async () => {
  item.updateMany.mockResolvedValue({ count: 1 });
  item.findUniqueOrThrow.mockResolvedValue({ id: "item-1", status: "archived", revision: 5 });
  const response = await DELETE(new NextRequest("http://localhost/api/items/item-1", {
    method: "DELETE", body: JSON.stringify({ revision: 4 }),
  }), ctx);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: "archived", revision: 5 });
});
