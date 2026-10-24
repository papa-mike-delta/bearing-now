import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSession } from "@/lib/auth";
import { POST } from "./route";

const db = vi.hoisted(() => ({
  item: { findMany: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
  operationLedger: { create: vi.fn(), count: vi.fn() },
  setting: { findFirst: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));

const request = () => new NextRequest("http://localhost/api/scheduler", {
  method: "POST",
  headers: { cookie: `lifeos-session=${createSession("alice", "alice@example.com", true)}` },
});

beforeEach(() => {
  vi.resetAllMocks();
  db.operationLedger.create.mockResolvedValue({ id: "receipt-1" });
  db.$transaction.mockImplementation((run) => run(db));
  db.item.findMany.mockResolvedValueOnce([{
    id: "rent", title: "Rent", revision: 4, dueDate: new Date("2026-01-01"), metadata: '{"recurring":"monthly"}',
  }]).mockResolvedValueOnce([]);
});

it("advances recurring items through the revision check", async () => {
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.item.findUniqueOrThrow.mockResolvedValue({ id: "rent", revision: 5 });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect((await response.json()).summary.financeUpdated).toBe(1);
  expect(db.item.updateMany).toHaveBeenCalledWith({
    where: { id: "rent", userId: "alice", revision: 4 }, data: { dueDate: expect.any(Date), revision: { increment: 1 } },
  });
});

it("returns a conflict instead of overwriting a concurrent change", async () => {
  db.item.updateMany.mockResolvedValue({ count: 0 });
  db.item.findFirst.mockResolvedValue({ revision: 5 });
  const response = await POST(request());
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ conflict: true, currentRevision: 5 });
});

it("requires a session and does not scan every account", async () => {
  const response = await POST(new NextRequest("http://localhost/api/scheduler", { method: "POST" }));
  expect(response.status).toBe(401);
  expect(db.item.findMany).not.toHaveBeenCalled();
  expect(db.item.updateMany).not.toHaveBeenCalled();
});
