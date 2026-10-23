import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST, DELETE } from "./route";

const db = vi.hoisted(() => ({
  link: { upsert: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() },
  item: { updateMany: vi.fn(), findUnique: vi.fn() },
  operationLedger: { create: vi.fn(), count: vi.fn() },
  setting: { findFirst: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
const { link } = db;
vi.mock("@/lib/db", () => ({ db }));

const ctx = { params: Promise.resolve({ id: "item-1" }) };
const request = (body: unknown) => new NextRequest("http://localhost/api/items/item-1/links", {
  method: "POST",
  body: JSON.stringify(body),
});

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((run) => run(db));
  db.item.updateMany.mockResolvedValue({ count: 1 });
});

it.each([
  "advances", "tracks", "related_to", "mentions", "scheduled_at", "located_at",
  undefined,
])("writes the validated type %s, defaulting to related_to", async (type) => {
  link.upsert.mockResolvedValue({ id: "link-1" });

  const response = await POST(request({ toId: "item-2", type, revision: 4 }), ctx);

  expect(response.status).toBe(200);
  expect(link.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { fromId_toId_type: { fromId: "item-1", toId: "item-2", type: type ?? "related_to" } },
    create: { fromId: "item-1", toId: "item-2", type: type ?? "related_to", note: undefined },
  }));
});

it.each(["related", "unknown", "", null, 0, false, {}, [[]]])("rejects type %j with 400 before writing", async (type) => {
  link.upsert.mockResolvedValue({ id: "link-1" });
  const response = await POST(request({ toId: "item-2", type, revision: 4 }), ctx);

  expect(response.status).toBe(400);
  expect(await response.json()).toHaveProperty("error");
  expect(link.upsert).not.toHaveBeenCalled();
});

it.each(["POST", "DELETE"])("returns 409 for stale Link %s", async (method) => {
  db.item.updateMany.mockResolvedValue({ count: 0 });
  db.item.findUnique.mockResolvedValue({ revision: 5 });
  const req = method === "POST" ? request({ toId: "item-2", revision: 4 }) :
    new NextRequest("http://localhost/api/items/item-1/links?toId=item-2&revision=4", { method: "DELETE" });
  const response = await (method === "POST" ? POST : DELETE)(req, ctx);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ conflict: true, currentRevision: 5 });
  expect(link.upsert).not.toHaveBeenCalled();
  expect(link.deleteMany).not.toHaveBeenCalled();
});

it("deletes a Link with a matching revision", async () => {
  const response = await DELETE(new NextRequest("http://localhost/api/items/item-1/links?toId=item-2&revision=4", { method: "DELETE" }), ctx);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ deleted: true });
});

it("rejects a Link delete without a revision", async () => {
  const response = await DELETE(new NextRequest("http://localhost/api/items/item-1/links?toId=item-2", { method: "DELETE" }), ctx);
  expect(response.status).toBe(400);
  expect(link.deleteMany).not.toHaveBeenCalled();
});

it("returns 429 for a capped Link create", async () => {
  db.operationLedger.count.mockResolvedValue(50);
  const response = await POST(request({ toId: "item-2", revision: 4 }), ctx);
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({ ok: false, rateLimited: true, limit: 50 });
  expect(link.upsert).not.toHaveBeenCalled();
});

it.each(["POST", "DELETE"])("returns 423 for Link %s touching an open target", async (method) => {
  db.setting.findFirst.mockResolvedValue({ id: "open-item:6974656d2d32:user:tab" });
  const req = method === "POST" ? request({ toId: "item-2", revision: 4 }) :
    new NextRequest("http://localhost/api/items/item-1/links?toId=item-2&revision=4", { method: "DELETE" });
  const response = await (method === "POST" ? POST : DELETE)(req, ctx);
  expect(response.status).toBe(423);
  expect(await response.json()).toEqual({ ok: false, itemOpen: true, itemId: "item-2" });
  expect(db.item.updateMany).not.toHaveBeenCalled();
});
