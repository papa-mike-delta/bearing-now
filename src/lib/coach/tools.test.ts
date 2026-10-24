import { OpenItemLeases } from "@/lib/domain/open-item-leases";
import { beforeEach, expect, it, vi } from "vitest";
import { CoachTools } from "./tools";

const db = vi.hoisted(() => ({
  item: { create: vi.fn(), findFirst: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
  link: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  setting: { findFirst: vi.fn(), findMany: vi.fn() },
  operationLedger: { create: vi.fn(), count: vi.fn() },
  $queryRaw: vi.fn(), $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  db.setting.findMany.mockResolvedValue([]);
  db.$transaction.mockImplementation((run) => run(db));
  db.operationLedger.create.mockResolvedValue({ id: "receipt-1" });
  db.item.findFirst.mockResolvedValue({ id: "item", title: "Read", revision: 4 });
  db.item.findMany.mockImplementation(async ({ where }) => where?.id?.in ? where.id.in.map((id: string) => ({ id, title: "Read" })) : []);
});

it("creates an Item as the Coach through the domain rails and returns its receipt", async () => {
  db.item.create.mockResolvedValue({ id: "new", title: "Read", revision: 0 });
  expect(await CoachTools.createItem("alice", { data: { title: "Read", type: "task" } })).toMatchObject({
    ok: true, value: { title: "Read", revision: 0 }, receiptId: "receipt-1", message: "Created Read",
  });
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    actor: "agent:coach", operation: "item.create", status: "success",
  }) });
  expect(db.operationLedger.count).toHaveBeenCalledWith({ where: expect.objectContaining({ actor: "agent:coach" }) });
});

it("gets an Item with the existing detail query and a read receipt", async () => {
  db.item.findFirst.mockResolvedValue({ id: "item", title: "Read", revision: 4 });
  expect(await CoachTools.getItem("alice", { id: "item" })).toMatchObject({
    ok: true, value: { title: "Read", revision: 4 }, receiptId: "receipt-1", message: "Read Read",
  });
  expect(db.item.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: "item", userId: "alice" }, include: expect.objectContaining({ tags: expect.any(Object), linksFrom: expect.any(Object) }),
  }));
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    actor: "agent:coach", operation: "coach.getItem", status: "success",
  }) });
});

it("searches Item titles and content using the existing bounded search", async () => {
  db.item.findMany.mockResolvedValue([{ id: "item", title: "Read", revision: 4 }]);
  expect(await CoachTools.searchItems("alice", { q: "Read" })).toMatchObject({
    ok: true, value: [{ title: "Read" }], receiptId: "receipt-1", message: "Searched Read",
  });
  expect(db.item.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { userId: "alice", OR: [{ title: { contains: "Read" } }, { content: { contains: "Read" } }] }, take: 20,
  }));
});

it("gets only one hop of Links in both directions", async () => {
  db.item.findFirst.mockResolvedValue({ title: "Read" });
  db.link.findMany.mockResolvedValueOnce([{ id: "out", to: { id: "other" } }]).mockResolvedValueOnce([]);
  expect(await CoachTools.getLinks("alice", { id: "item" })).toMatchObject({
    ok: true, value: { outgoing: [{ id: "out" }], incoming: [] }, receiptId: "receipt-1", message: "Read links Read",
  });
  expect(db.link.findMany).toHaveBeenCalledWith({
    where: { fromId: "item", from: { userId: "alice" }, to: { userId: "alice" } },
    include: { to: { include: { domain: true, project: { select: { id: true, name: true, color: true } } } } },
  });
  expect(db.link.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { toId: "item", from: { userId: "alice" }, to: { userId: "alice" } } }));
});

it("lists open Items through the shared lease interface and retains its receipt", async () => {
  vi.spyOn(OpenItemLeases, "list").mockResolvedValue([{ id: "item", title: "Read", revision: 4 }] as any);
  expect(await CoachTools.listOpenItems("alice")).toMatchObject({
    ok: true, value: [{ id: "item", revision: 4 }], receiptId: "receipt-1", message: "Listed open Read",
  });
  expect(OpenItemLeases.list).toHaveBeenCalledWith(db, "alice");
});

it("updates at the supplied revision as Coach and reports the new title", async () => {
  db.item.findFirst.mockResolvedValue({ title: "Read" });
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.item.findUniqueOrThrow.mockResolvedValue({ id: "item", title: "Read more", revision: 5 });
  expect(await CoachTools.updateItem("alice", { id: "item", revision: 4, data: { title: "Read more" } })).toMatchObject({
    ok: true, value: { revision: 5 }, receiptId: "receipt-1", message: "Updated Read more",
  });
  expect(db.item.updateMany).toHaveBeenCalledWith({
    where: { id: "item", userId: "alice", revision: 4 }, data: { title: "Read more", revision: { increment: 1 } },
  });
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actor: "agent:coach", operation: "item.update" }) });
});

it("archives through the revision-checked domain as Coach", async () => {
  db.item.findFirst.mockResolvedValue({ title: "Read" });
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.item.findUniqueOrThrow.mockResolvedValue({ id: "item", title: "Read", status: "archived", revision: 5 });
  expect(await CoachTools.archiveItem("alice", { id: "item", revision: 4 })).toMatchObject({
    ok: true, value: { status: "archived", revision: 5 }, receiptId: "receipt-1", message: "Archived Read",
  });
  expect(db.item.updateMany).toHaveBeenCalledWith({
    where: { id: "item", userId: "alice", revision: 4 }, data: { status: "archived", completedAt: null, revision: { increment: 1 } },
  });
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actor: "agent:coach", operation: "item.archive" }) });
});

it("creates a Link through Coach caps and increments its source revision", async () => {
  db.item.findFirst.mockResolvedValue({ title: "Read" });
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.link.upsert.mockResolvedValue({ id: "link", fromId: "item", toId: "other", type: "tracks" });
  expect(await CoachTools.createLink("alice", { fromId: "item", toId: "other", type: "tracks", revision: 4 })).toMatchObject({
    ok: true, value: { type: "tracks" }, receiptId: "receipt-1", message: "Linked Read → Read",
  });
  expect(db.item.updateMany).toHaveBeenCalledWith({
    where: { id: "item", userId: "alice", revision: 4 }, data: { revision: { increment: 1 } },
  });
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actor: "agent:coach", operation: "link.create" }) });
  expect(db.operationLedger.count).toHaveBeenCalledWith({ where: expect.objectContaining({ actor: "agent:coach", operation: "link.create" }) });
});

it("deletes a Link through the revision-checked domain as Coach", async () => {
  db.item.findFirst.mockResolvedValue({ title: "Read" });
  db.item.updateMany.mockResolvedValue({ count: 1 });
  expect(await CoachTools.deleteLink("alice", { fromId: "item", toId: "other", type: "tracks", revision: 4 })).toMatchObject({
    ok: true, value: { deleted: true }, receiptId: "receipt-1", message: "Unlinked Read → Read",
  });
  expect(db.link.deleteMany).toHaveBeenCalledWith({ where: { fromId: "item", toId: "other", type: "tracks" } });
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actor: "agent:coach", operation: "link.delete" }) });
});

it("labels a refused create accurately while keeping its receipt", async () => {
  db.operationLedger.count.mockResolvedValue(20);
  expect(await CoachTools.createItem("alice", { data: { title: "Read", type: "task" } })).toMatchObject({
    ok: false, rateLimited: true, receiptId: "receipt-1", message: "Refused create Read",
  });
});

it.each(["updateItem", "archiveItem", "createLink", "deleteLink"] as const)("refuses %s of an open Item as Coach", async (tool) => {
  db.item.findFirst.mockResolvedValue({ title: "Read" });
  vi.spyOn(OpenItemLeases, "protectedItem").mockResolvedValue("item");
  expect(await CoachTools[tool]("alice", { id: "item", fromId: "item", toId: "other", revision: 4, data: { title: "Changed" } })).toMatchObject({
    ok: false, itemOpen: true, itemId: "item", receiptId: "receipt-1", message: expect.stringContaining("Refused"),
  });
  expect(db.item.updateMany).not.toHaveBeenCalled();
  expect(db.link.upsert).not.toHaveBeenCalled();
  expect(db.link.deleteMany).not.toHaveBeenCalled();
  expect(db.operationLedger.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actor: "agent:coach", status: "refused" }) });
});

it.each(["updateItem", "archiveItem", "createLink", "deleteLink"] as const)("propagates a stale revision refusal from %s", async (tool) => {
  db.item.findFirst.mockResolvedValue({ title: "Read", revision: 5 });
  db.item.updateMany.mockResolvedValue({ count: 0 });
  expect(await CoachTools[tool]("alice", { id: "item", fromId: "item", toId: "other", revision: 4, data: { title: "Changed" } })).toMatchObject({
    ok: false, conflict: true, currentRevision: 5, receiptId: "receipt-1",
  });
  expect(db.link.upsert).not.toHaveBeenCalled();
  expect(db.link.deleteMany).not.toHaveBeenCalled();
});

it("propagates a Link create cap refusal", async () => {
  db.operationLedger.count.mockResolvedValue(50);
  expect(await CoachTools.createLink("alice", { fromId: "item", toId: "other", revision: 4 })).toMatchObject({
    ok: false, rateLimited: true, limit: 50, receiptId: "receipt-1",
  });
  expect(db.item.updateMany).not.toHaveBeenCalled();
  expect(db.link.upsert).not.toHaveBeenCalled();
});
