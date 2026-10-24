import { OpenItemLeases } from "./open-item-leases";
import { beforeEach, expect, it, vi } from "vitest";
import { ItemDomain } from "./item";
import { LinkDomain } from "./link";
import { getItem, getLinks, listOpenItems, searchItems } from "./item-queries";

const userA = "user-a";
const userB = "user-b";

const db = vi.hoisted(() => ({
  item: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn() },
  link: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(), findUnique: vi.fn() },
  domain: { findFirst: vi.fn() },
  project: { findFirst: vi.fn() },
  setting: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  tag: { upsert: vi.fn() },
  tagOnItem: { deleteMany: vi.fn(), createMany: vi.fn() },
  operationLedger: { create: vi.fn(), count: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  db.setting.findMany.mockResolvedValue([]);
  db.operationLedger.create.mockResolvedValue({ id: "receipt-1" });
  db.$transaction.mockImplementation((run) => run(db));
});

it("reads items, links, and open-item settings only for the caller", async () => {
  db.item.findFirst.mockResolvedValue(null);
  expect(await getItem("item-a", userB)).toBeNull();
  expect(db.item.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "item-a", userId: userB } }));

  db.item.findMany.mockResolvedValue([]);
  await searchItems("secret", userB);
  expect(db.item.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { userId: userB, OR: [{ title: { contains: "secret" } }, { content: { contains: "secret" } }] },
  }));

  expect(await getLinks("item-a", userB)).toBeNull();
  expect(db.link.findMany).not.toHaveBeenCalled();

  db.item.findFirst.mockResolvedValue({ id: "item-b" });
  db.link.findMany.mockResolvedValue([]);
  await getLinks("item-b", userB);
  expect(db.link.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { fromId: "item-b", from: { userId: userB }, to: { userId: userB } },
  }));

  db.setting.findMany.mockResolvedValue([]);
  const list = vi.spyOn(OpenItemLeases, "list");
  await listOpenItems(userB);
  expect(list).toHaveBeenCalledWith(db, userB);
  expect(db.item.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: userB, id: { in: [] } } }));
});

it("does not update or archive another user's item or reveal its revision", async () => {
  db.item.updateMany.mockResolvedValue({ count: 0 });
  db.item.findFirst.mockResolvedValue(null);
  const updated = await ItemDomain.update(userB, "item-a", 4, { title: "Stolen" }, ["leaked"]);
  expect(updated).toMatchObject({ ok: false, conflict: true, currentRevision: null });
  expect(updated).not.toHaveProperty("value");
  expect(db.item.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: "item-a", userId: userB, revision: 4 },
  }));
  expect(db.tag.upsert).not.toHaveBeenCalled();

  db.item.updateMany.mockClear();
  const archived = await ItemDomain.archive(userB, "item-a", 4);
  expect(archived).toMatchObject({ ok: false, conflict: true, currentRevision: null });
  expect(db.item.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: "item-a", userId: userB, revision: 4 },
  }));
});

it("does not write an open-item setting for another user's item", async () => {
  db.item.findFirst.mockResolvedValue(null);
  expect(await ItemDomain.setOpen(userB, "item-a", "tab-1", true, `user:${userB}`)).toMatchObject({ ok: false, error: "Not found" });
  expect(db.item.findFirst).toHaveBeenCalledWith({ where: { id: "item-a", userId: userB }, select: { id: true } });
  expect(db.setting.upsert).not.toHaveBeenCalled();
});

it("writes an open-item setting only on the caller's item and key", async () => {
  db.item.findFirst.mockResolvedValue({ id: "item-b" });
  expect(await ItemDomain.setOpen(userB, "item-b", "tab-1", true, `user:${userB}`)).toMatchObject({ ok: true, value: { open: true } });
  expect(db.setting.upsert).toHaveBeenCalledWith(expect.objectContaining({
    create: expect.objectContaining({ userId: userB }),
  }));
  expect(db.setting.deleteMany).toHaveBeenCalledWith({ where: expect.objectContaining({ userId: userB }) });
  expect(JSON.stringify(db.setting.upsert.mock.calls)).not.toContain(userA);
});

it("refuses a link that touches another user's item before any write", async () => {
  db.item.findMany.mockResolvedValue([{ id: "item-b" }]);
  const created = await LinkDomain.create(userB, { fromId: "item-b", toId: "item-a", type: "related_to" }, 1, `user:${userB}`);
  expect(created).toMatchObject({ ok: false, error: "Not found" });
  expect(db.item.findMany).toHaveBeenCalledWith({
    where: { id: { in: ["item-b", "item-a"] }, userId: userB }, select: { id: true },
  });
  expect(db.link.upsert).not.toHaveBeenCalled();
  expect(db.item.updateMany).not.toHaveBeenCalled();

  db.item.findMany.mockClear();
  const deleted = await LinkDomain.delete(userB, { fromId: "item-a", toId: "item-b", type: "related_to" }, 1, `user:${userB}`);
  expect(deleted).toMatchObject({ ok: false, error: "Not found" });
  expect(db.item.findMany).toHaveBeenCalledWith({
    where: { id: { in: ["item-a", "item-b"] }, userId: userB }, select: { id: true },
  });
  expect(db.link.deleteMany).not.toHaveBeenCalled();
});

it("refuses an item whose domain or project belongs to someone else", async () => {
  db.domain.findFirst.mockResolvedValue(null);
  const withDomain = await ItemDomain.create(userB, { title: "Note", type: "note", domainId: "domain-a" });
  expect(withDomain).toMatchObject({ ok: false, error: "Not found" });
  expect(db.domain.findFirst).toHaveBeenCalledWith({ where: { id: "domain-a", userId: userB }, select: { id: true } });
  expect(db.item.create).not.toHaveBeenCalled();

  db.project.findFirst.mockResolvedValue(null);
  const withProject = await ItemDomain.create(userB, { title: "Note", type: "note", projectId: "project-a" });
  expect(withProject).toMatchObject({ ok: false, error: "Not found" });
  expect(db.project.findFirst).toHaveBeenCalledWith({ where: { id: "project-a", userId: userB }, select: { id: true } });
  expect(db.item.create).not.toHaveBeenCalled();
});

it("creates an item only under the caller's own domain", async () => {
  db.domain.findFirst.mockResolvedValue({ id: "domain-b" });
  db.item.create.mockResolvedValue({ id: "new", revision: 0 });
  expect(await ItemDomain.create(userB, { title: "Mine", type: "note", domainId: "domain-b" })).toMatchObject({ ok: true });
  expect(db.item.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ userId: userB, domainId: "domain-b" }),
  }));
});
