import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { createSession } from "@/lib/auth";

const db = vi.hoisted(() => ({
  item: { create: vi.fn() },
  operationLedger: { create: vi.fn(), count: vi.fn() },
  $queryRaw: vi.fn(), $transaction: vi.fn(),
}));
const { item } = db;
vi.mock("@/lib/db", () => ({ db }));
beforeEach(() => {
  vi.resetAllMocks();
  db.operationLedger.create.mockResolvedValue({ id: "receipt-1" });
  db.$transaction.mockImplementation((run) => run(db));
});

it("creates an Item through the domain with revision zero and parsed metadata", async () => {
  item.create.mockResolvedValue({ id: "new", revision: 0, metadata: '{"pages":10}' });
  const response = await POST(new NextRequest("http://localhost/api/items", {
    method: "POST",
    body: JSON.stringify({ title: "New", type: "note", revision: 99, metadata: { pages: 10 } }),
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ id: "new", revision: 0, metadata: { pages: 10 } });
  expect(item.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ revision: 0, metadata: '{"pages":10}' }),
  }));
});

it("returns 429 and records the refused create for the verified user", async () => {
  db.operationLedger.count.mockResolvedValue(20);
  const response = await POST(new NextRequest("http://localhost/api/items", {
    method: "POST", headers: { cookie: `lifeos-session=${createSession("alice", "alice@example.com", true)}` },
    body: JSON.stringify({ title: "Over cap", type: "note", actor: "user:forged" }),
  }));
  expect(response.status).toBe(429);
  expect(await response.json()).toEqual({ receiptId: "receipt-1", ok: false, rateLimited: true, limit: 20 });
  expect(item.create).not.toHaveBeenCalled();
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actor: "user:alice", status: "refused" }) });
});

it("records a validation refusal rather than skipping the domain ledger", async () => {
  const response = await POST(new NextRequest("http://localhost/api/items", {
    method: "POST", body: JSON.stringify({ type: "note" }),
  }));
  expect(response.status).toBe(400);
  expect(item.create).not.toHaveBeenCalled();
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "refused" }) });
});
