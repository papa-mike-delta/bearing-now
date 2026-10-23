import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE } from "./route";

const db = vi.hoisted(() => ({
  item: { findMany: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
  project: { delete: vi.fn() },
  operationLedger: { create: vi.fn(), count: vi.fn() },
  setting: { findFirst: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
const ctx = { params: Promise.resolve({ id: "project-1" }) };
beforeEach(() => {
  vi.resetAllMocks();
  db.operationLedger.create.mockResolvedValue({ id: "receipt-1" });
  db.$transaction.mockImplementation((run) => run(db));
  db.item.findMany.mockResolvedValue([{ id: "item-1", revision: 4 }]);
});

it("unlinks project Items using their loaded revisions", async () => {
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.item.findUniqueOrThrow.mockResolvedValue({ id: "item-1", revision: 5, projectId: null });
  db.project.delete.mockResolvedValue({ id: "project-1" });
  const response = await DELETE(new NextRequest("http://localhost/api/projects/project-1", { method: "DELETE" }), ctx);
  expect(response.status).toBe(200);
  expect(db.item.updateMany).toHaveBeenCalledWith({
    where: { id: "item-1", revision: 4 }, data: { projectId: null, revision: { increment: 1 } },
  });
  expect(db.project.delete).toHaveBeenCalledWith({ where: { id: "project-1" } });
});

it("keeps the project when an Item changed concurrently", async () => {
  db.item.updateMany.mockResolvedValue({ count: 0 });
  db.item.findUnique.mockResolvedValue({ revision: 5 });
  const response = await DELETE(new NextRequest("http://localhost/api/projects/project-1", { method: "DELETE" }), ctx);
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ conflict: true, currentRevision: 5 });
  expect(db.project.delete).not.toHaveBeenCalled();
});
