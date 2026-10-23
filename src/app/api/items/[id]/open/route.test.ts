import { beforeEach, expect, it, vi } from "vitest";
import { createSession } from "@/lib/auth";
import { PUT, DELETE } from "./route";

const db = vi.hoisted(() => ({
  setting: { upsert: vi.fn(), deleteMany: vi.fn() },
  operationLedger: { create: vi.fn() }, $transaction: vi.fn(), $queryRaw: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
const ctx = { params: Promise.resolve({ id: "item-1" }) };
const request = (method: string, lease: unknown = "tab-1", authenticated = true) => new Request("http://localhost/api/items/item-1/open", {
  method,
  headers: authenticated ? { cookie: `lifeos-session=${createSession("alice", "alice@example.com", true)}` } : {},
  body: JSON.stringify({ lease, actor: "user:forged" }),
});

beforeEach(() => {
  vi.resetAllMocks();
  db.operationLedger.create.mockResolvedValue({ id: "receipt-1" });
  db.$transaction.mockImplementation((run) => run(db));
});

it.each([PUT, DELETE])("records an open/close marker for the verified user", async (handler) => {
  const response = await handler(request(handler === PUT ? "PUT" : "DELETE"), ctx);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ open: handler === PUT });
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    actor: "user:alice", operation: handler === PUT ? "item.open" : "item.close", status: "success",
  }) });
});

it("requires a verified user to set an open-item marker", async () => {
  const response = await PUT(request("PUT", "tab", false), ctx);
  expect(response.status).toBe(401);
  expect(db.setting.upsert).not.toHaveBeenCalled();
});

it.each([undefined, "", "other:tab", 5])("records and rejects an invalid lease %j", async (lease) => {
  // Construct directly so undefined remains missing rather than taking a default.
  const response = await PUT(new Request("http://localhost/api/items/item-1/open", {
    method: "PUT", headers: { cookie: `lifeos-session=${createSession("alice", "alice@example.com", true)}` },
    body: JSON.stringify({ lease }),
  }), ctx);
  expect(response.status).toBe(400);
  expect(db.setting.upsert).not.toHaveBeenCalled();
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: "refused" }) });
});
