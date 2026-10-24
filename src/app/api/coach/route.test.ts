import { OpenItemLeases } from "@/lib/domain/open-item-leases";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSession } from "@/lib/auth";
import { GET, POST } from "./route";

const db = vi.hoisted(() => ({
  item: { create: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  link: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  setting: { findFirst: vi.fn(), findMany: vi.fn() },
  operationLedger: { create: vi.fn(), count: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
  $queryRaw: vi.fn(), $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  db.setting.findMany.mockResolvedValue([]);
  vi.stubEnv("COACH_TOOLS_ENABLED", "true");
  db.$transaction.mockImplementation((run) => run(db));
  db.operationLedger.create.mockResolvedValue({ id: "receipt-1" });
  db.item.findFirst.mockResolvedValue({ id: "item", title: "Read", revision: 4 });
  db.item.findMany.mockImplementation(async ({ where }) => where?.id?.in ? where.id.in.map((id: string) => ({ id, title: "Read" })) : []);
});
afterEach(() => vi.unstubAllEnvs());

function request(body: unknown, session = createSession("alice", "alice@example.com", true)) {
  return new NextRequest("http://localhost/api/coach", {
    method: "POST", headers: { cookie: `lifeos-session=${session}` }, body: JSON.stringify(body),
  });
}

it.each([undefined, "false", "1", "TRUE"])("returns 404 unless the flag is explicitly true (%s)", async (flag) => {
  vi.stubEnv("COACH_TOOLS_ENABLED", flag);
  const response = await POST(request({ tool: "createItem", args: { data: { title: "Read", type: "task" } } }));
  expect(response.status).toBe(404);
  expect(db.$transaction).not.toHaveBeenCalled();
});

it.each(["", "forged", createSession("alice", "alice@example.com", false)])("requires the existing verified user session (%s)", async (session) => {
  expect((await POST(request({ tool: "listOpenItems" }, session))).status).toBe(401);
  expect(db.$transaction).not.toHaveBeenCalled();
});

it("dispatches a write with the session but ignores a forged user actor", async () => {
  db.item.create.mockResolvedValue({ id: "new", title: "Read", revision: 0 });
  const response = await POST(request({ tool: "createItem", args: {
    data: { title: "Read", type: "task", metadata: { pages: 10 } }, actor: "user:forged",
  } }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, receiptId: "receipt-1", message: "Created Read" });
  expect(db.item.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ metadata: '{"pages":10}' }) }));
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actor: "agent:coach" }) });
});

it.each([
  { tool: "searchItems", args: { q: "Read" } },
  { tool: "getItem", args: { id: "item" } },
  { tool: "getLinks", args: { id: "item" } },
  { tool: "listOpenItems", args: {} },
  { tool: "updateItem", args: { id: "item", revision: 4, data: { title: "Read more" } } },
  { tool: "archiveItem", args: { id: "item", revision: 4 } },
  { tool: "createLink", args: { fromId: "item", toId: "other", type: "tracks", revision: 4 } },
  { tool: "deleteLink", args: { fromId: "item", toId: "other", type: "tracks", revision: 4 } },
])("dispatches $tool and returns its ledger receipt", async (call) => {
  db.item.findUniqueOrThrow.mockResolvedValue({ id: "item", title: "Read more", revision: 5 });
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.link.findMany.mockResolvedValue([]);
  db.link.upsert.mockResolvedValue({ id: "link" });
  db.setting.findMany.mockResolvedValue([]);
  const response = await POST(request(call));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ ok: true, receiptId: "receipt-1", message: expect.any(String) });
  expect(db.operationLedger.create).toHaveBeenCalledTimes(1);
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actor: "agent:coach" }) });
});

it.each([
  { name: "stale revision", status: 409, setup: () => { db.item.updateMany.mockResolvedValue({ count: 0 }); db.item.findFirst.mockResolvedValue({ revision: 5, title: "Read" }); }, expected: { conflict: true, currentRevision: 5 } },
  { name: "open Item", status: 423, setup: () => vi.spyOn(OpenItemLeases, "protectedItem").mockResolvedValue("item"), expected: { itemOpen: true, itemId: "item" } },
])("propagates $name refusal with its receipt", async ({ status, setup, expected }) => {
  setup();
  const response = await POST(request({ tool: "updateItem", args: { id: "item", revision: 4, data: { title: "Read more" } } }));
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject({ ok: false, ...expected, receiptId: "receipt-1" });
  expect(db.item.create).not.toHaveBeenCalled();
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actor: "agent:coach", status: "refused" }) });
});

it.each([
  { tool: "createItem", args: { data: { title: "Read", type: "task" } }, limit: 20 },
  { tool: "createLink", args: { fromId: "item", toId: "other", revision: 4 }, limit: 50 },
])("propagates the $tool create cap without a write", async ({ tool, args, limit }) => {
  db.operationLedger.count.mockResolvedValue(limit);
  const response = await POST(request({ tool, args }));
  expect(response.status).toBe(429);
  expect(await response.json()).toMatchObject({ ok: false, rateLimited: true, limit, receiptId: "receipt-1" });
  expect(db.item.create).not.toHaveBeenCalled();
  expect(db.item.updateMany).not.toHaveBeenCalled();
  expect(db.link.upsert).not.toHaveBeenCalled();
});

it.each(["updateItem", "archiveItem", "createLink", "deleteLink"])("keeps missing revisions as ledgered domain refusals for %s", async (tool) => {
  const response = await POST(request({ tool, args: { id: "item", fromId: "item", toId: "other", data: { title: "Read" } } }));
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ ok: false, error: "revision must be a non-negative integer", receiptId: "receipt-1" });
  expect(db.item.updateMany).not.toHaveBeenCalled();
});

it.each([null, [], { tool: "constructor" }, { tool: "setOpen" }, { tool: "getItem", args: [] }, { tool: "updateItem", args: { id: "item", data: null } }])("rejects invalid calls without dispatch (%j)", async (body) => {
  expect((await POST(request(body))).status).toBe(400);
  expect(db.$transaction).not.toHaveBeenCalled();
});

it("lists Coach writes and conflict receipts for the verified session", async () => {
  db.item.findMany.mockResolvedValue([{ id: "item-1", title: "Read" }]);
  db.operationLedger.findMany.mockResolvedValue([
    {
      id: "receipt-2", actor: "agent:coach", operation: "item.update", status: "refused",
      payload: JSON.stringify({ id: "item-1", revision: 4, data: { title: "Read more" } }),
      receipt: JSON.stringify({ ok: false, conflict: true, currentRevision: 5 }),
      createdAt: new Date("2026-03-02T00:00:00.000Z"),
    },
    {
      id: "receipt-1", actor: "agent:coach", operation: "item.create", status: "success",
      payload: JSON.stringify({ data: { title: "Read" } }),
      receipt: JSON.stringify({ ok: true, value: { title: "Read" } }),
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    },
  ]);
  const response = await GET(new NextRequest("http://localhost/api/coach", { headers: request({}).headers }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    activity: [
      { id: "receipt-2", operation: "item.update", status: "refused", line: "Refused update Read", createdAt: "2026-03-02T00:00:00.000Z" },
      { id: "receipt-1", operation: "item.create", status: "success", line: "Created Read", createdAt: "2026-03-01T00:00:00.000Z" },
    ],
  });
  expect(db.operationLedger.findUnique).not.toHaveBeenCalled();
  expect(db.item.findMany).toHaveBeenCalledTimes(1);
  expect(db.item.findMany).toHaveBeenCalledWith({
    where: { id: { in: ["item-1"] }, userId: "alice" },
    select: { id: true, title: true },
  });
});

it.each(["disabled", "unsigned"])("protects the activity feed (%s)", async (scenario) => {
  if (scenario === "disabled") vi.stubEnv("COACH_TOOLS_ENABLED", "false");
  const response = await GET(new NextRequest("http://localhost/api/coach", {
    headers: scenario === "unsigned" ? {} : request({}).headers,
  }));
  expect(response.status).toBe(scenario === "unsigned" ? 401 : 404);
  expect(db.operationLedger.findMany).not.toHaveBeenCalled();
});

it("reads the linked Coach receipt using the same session", async () => {
  db.operationLedger.findFirst.mockResolvedValue({
    id: "receipt-1", actor: "agent:coach", userId: "alice", operation: "item.create", status: "success",
    payload: '{"data":{"title":"Read"}}', receipt: '{"ok":true,"value":{"title":"Read"}}',
  });
  const response = await GET(new NextRequest("http://localhost/api/coach?receipt=receipt-1", {
    headers: request({}).headers,
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    id: "receipt-1", payload: { data: { title: "Read" } }, receipt: { ok: true, value: { title: "Read" } },
  });
});

it.each(["disabled", "unsigned", "missing", "other actor"])("protects receipt access (%s)", async (scenario) => {
  if (scenario === "disabled") vi.stubEnv("COACH_TOOLS_ENABLED", "false");
  db.operationLedger.findFirst.mockResolvedValue(scenario === "other actor" ? { actor: "user:alice", userId: "alice" } : null);
  const response = await GET(new NextRequest("http://localhost/api/coach?receipt=receipt-1", {
    headers: scenario === "unsigned" ? {} : request({}).headers,
  }));
  expect(response.status).toBe(scenario === "unsigned" ? 401 : 404);
  if (scenario === "disabled" || scenario === "unsigned") expect(db.operationLedger.findUnique).not.toHaveBeenCalled();
});
