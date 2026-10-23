import { beforeEach, expect, it, vi } from "vitest";
import { ItemDomain } from "./item";

const db = vi.hoisted(() => ({
  item: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  tagOnItem: { deleteMany: vi.fn(), createMany: vi.fn() },
  tag: { upsert: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((run) => run(db));
});

it("updates at the loaded revision and returns the next revision", async () => {
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.item.findUniqueOrThrow.mockResolvedValue({ id: "item-1", title: "Updated", revision: 5 });

  expect(await ItemDomain.update("item-1", 4, { title: "Updated" })).toEqual({
    ok: true, value: { id: "item-1", title: "Updated", revision: 5 },
  });
  expect(db.item.updateMany).toHaveBeenCalledWith({
    where: { id: "item-1", revision: 4 },
    data: { title: "Updated", revision: { increment: 1 } },
  });
});

it("rejects a stale revision without changing tags", async () => {
  db.item.updateMany.mockResolvedValue({ count: 0 });
  db.item.findUnique.mockResolvedValue({ revision: 5 });
  expect(await ItemDomain.update("item-1", 4, { title: "Stale" }, ["new"])).toEqual({
    ok: false, conflict: true, currentRevision: 5,
  });
  expect(db.tagOnItem.deleteMany).not.toHaveBeenCalled();
});

it("archives at the loaded revision", async () => {
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.item.findUniqueOrThrow.mockResolvedValue({ id: "item-1", status: "archived", revision: 5 });
  expect(await ItemDomain.archive("item-1", 4)).toMatchObject({
    ok: true, value: { status: "archived", revision: 5 },
  });
  expect(db.item.updateMany).toHaveBeenCalledWith({
    where: { id: "item-1", revision: 4 },
    data: { status: "archived", completedAt: null, revision: { increment: 1 } },
  });
});

it("creates an Item with its initial revision and tags", async () => {
  db.item.create.mockResolvedValue({ id: "new", title: "New", revision: 0, tags: [{ tag: { name: "work" } }] });
  expect(await ItemDomain.create({ type: "note", title: "New" }, ["work"])).toMatchObject({
    ok: true, value: { id: "new", revision: 0, tags: [{ tag: { name: "work" } }] },
  });
  expect(db.item.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ title: "New", type: "note", revision: 0 }),
  }));
});

it("returns synchronized tags and manages completion on status changes", async () => {
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.tag.upsert.mockResolvedValue({ id: "tag-1" });
  db.item.findUniqueOrThrow.mockResolvedValue({ revision: 5, tags: [{ tag: { name: "work" } }] });
  expect(await ItemDomain.update("item-1", 4, { status: "done" }, ["work"])).toMatchObject({
    ok: true, value: { revision: 5, tags: [{ tag: { name: "work" } }] },
  });
  expect(db.item.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: { status: "done", completedAt: expect.any(Date), revision: { increment: 1 } },
  }));
  expect(db.tagOnItem.createMany).toHaveBeenCalledWith({ data: [{ itemId: "item-1", tagId: "tag-1" }] });
});

it("rejects an archive with a stale revision", async () => {
  db.item.updateMany.mockResolvedValue({ count: 0 });
  db.item.findUnique.mockResolvedValue({ revision: 5 });
  expect(await ItemDomain.archive("item-1", 4)).toEqual({ ok: false, conflict: true, currentRevision: 5 });
});

it("reports a removed Item as a conflict with no current revision", async () => {
  db.item.updateMany.mockResolvedValue({ count: 0 });
  db.item.findUnique.mockResolvedValue(null);
  expect(await ItemDomain.update("missing", 4, { title: "Stale" })).toEqual({
    ok: false, conflict: true, currentRevision: null,
  });
});

it.each([undefined, null, "4", -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid revision %j in the domain", async (revision) => {
  expect(await ItemDomain.update("item-1", revision as number, { title: "Invalid" })).toMatchObject({ ok: false, error: expect.any(String) });
  expect(db.$transaction).not.toHaveBeenCalled();
});

it("blocks identity changes and nested writes that would bypass revision checks", async () => {
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.item.findUniqueOrThrow.mockResolvedValue({ id: "item-1", revision: 5 });
  const untrusted = JSON.parse('{"title":"Allowed","id":"other","revision":99,"linksFrom":{"create":{"toId":"other"}}}');
  await ItemDomain.update("item-1", 4, untrusted);
  expect(db.item.updateMany).toHaveBeenCalledWith({
    where: { id: "item-1", revision: 4 }, data: { title: "Allowed", revision: { increment: 1 } },
  });
});
