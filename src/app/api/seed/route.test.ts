import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const db = vi.hoisted(() => ({
  user: { upsert: vi.fn() }, domain: { count: vi.fn(), create: vi.fn() },
  project: { create: vi.fn() }, habitLog: { create: vi.fn() }, review: { create: vi.fn() },
  item: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
  link: { upsert: vi.fn(), findUnique: vi.fn() },
  setting: { findFirst: vi.fn() }, operationLedger: { create: vi.fn(), count: vi.fn() },
  $transaction: vi.fn(), $queryRaw: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((run) => run(db));
  db.domain.count.mockResolvedValue(0);
  db.domain.create.mockImplementation(async ({ data }) => ({ id: data.key }));
  db.project.create.mockImplementation(async ({ data }) => ({ ...data, id: data.name }));
  db.item.create.mockImplementation(async ({ data }) => ({ ...data, id: data.title }));
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.habitLog.create.mockResolvedValue({});
  // Model the allowance from completed ledger entries, rather than granting
  // seeds an exemption or a hardcoded zero count.
  db.operationLedger.count.mockImplementation(async ({ where }) => db.operationLedger.create.mock.calls.filter(([{ data }]) =>
    data.actor === where.actor && data.operation === where.operation && data.status === "success").length);
});

it("finishes a fresh demo seed within the cap, ledgering all 20 Item creates", async () => {
  const response = await POST(new NextRequest("http://localhost/api/seed", { method: "POST" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ success: true });
  expect(db.item.create).toHaveBeenCalledTimes(20);
  const creates = db.operationLedger.create.mock.calls.filter(([{ data }]) => data.operation === "item.create");
  expect(creates).toHaveLength(20);
  expect(creates.every(([{ data }]) => data.status === "success" && data.actor === "agent:seed")).toBe(true);
});
