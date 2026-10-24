import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSession } from "@/lib/auth";
import { GET, PATCH, DELETE } from "./route";

const db = vi.hoisted(() => ({
  item: { findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
  operationLedger: { create: vi.fn(), count: vi.fn() },
  setting: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
const { item } = db;
vi.mock("@/lib/db", () => ({ db }));

const ctx = { params: Promise.resolve({ id: "item-1" }) };
const cookie = `lifeos-session=${createSession("alice", "alice@example.com", true)}`;
const authed = (method: string, body?: unknown) => new NextRequest("http://localhost/api/items/item-1", {
  method,
  headers: { cookie },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

beforeEach(() => {
  vi.resetAllMocks();
  db.setting.findMany.mockResolvedValue([]);
  db.operationLedger.create.mockResolvedValue({ id: "receipt-1" });
  db.$transaction.mockImplementation((run) => run(db));
});

it("returns the Item revision on reads", async () => {
  item.findFirst.mockResolvedValue({ id: "item-1", revision: 4, metadata: null });

  const response = await GET(authed("GET"), ctx);

  expect(await response.json()).toMatchObject({ id: "item-1", revision: 4 });
  expect(item.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "item-1", userId: "alice" } }));
});

it("atomically increments and returns the revision when updating an Item", async () => {
  item.updateMany.mockResolvedValue({ count: 1 });
  item.findUniqueOrThrow.mockResolvedValue({ id: "item-1", title: "Updated", revision: 5, metadata: null });

  const response = await PATCH(authed("PATCH", { title: "Updated", revision: 4 }), ctx);

  expect(item.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: "item-1", userId: "alice", revision: 4 },
    data: { title: "Updated", revision: { increment: 1 } },
  }));
  expect(await response.json()).toMatchObject({ id: "item-1", revision: 5 });
});

it.each(["PATCH", "DELETE"])("returns 409 for a stale %s", async (method) => {
  item.updateMany.mockResolvedValue({ count: 0 });
  item.findFirst.mockResolvedValue({ revision: 5 });
  const response = await (method === "PATCH" ? PATCH : DELETE)(authed(method, { revision: 4, title: "Stale" }), ctx);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ conflict: true, currentRevision: 5 });
});

it.each([undefined, null, "4", -1, 1.5])("rejects invalid revision %j before updating", async (revision) => {
  const response = await PATCH(authed("PATCH", { revision, title: "Invalid" }), ctx);
  expect(response.status).toBe(400);
  expect(item.updateMany).not.toHaveBeenCalled();
});

it("archives rather than physically deleting an Item", async () => {
  item.updateMany.mockResolvedValue({ count: 1 });
  item.findUniqueOrThrow.mockResolvedValue({ id: "item-1", status: "archived", revision: 5 });
  const response = await DELETE(authed("DELETE", { revision: 4 }), ctx);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: "archived", revision: 5 });
});

it.each([PATCH, DELETE])("returns 401 before writing when the session is missing", async (handler) => {
  const response = await handler(new NextRequest("http://localhost/api/items/item-1", {
    method: handler === PATCH ? "PATCH" : "DELETE", body: JSON.stringify({ revision: 4, title: "Automated edit" }),
  }), ctx);
  expect(response.status).toBe(401);
  expect(item.updateMany).not.toHaveBeenCalled();
  expect(db.operationLedger.create).not.toHaveBeenCalled();
});
