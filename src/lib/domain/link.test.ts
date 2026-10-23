import { beforeEach, expect, it, vi } from "vitest";
import { LinkDomain } from "./link";

const db = vi.hoisted(() => ({
  item: { updateMany: vi.fn(), findUnique: vi.fn() },
  link: { upsert: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((run) => run(db));
});

it("creates a typed Link when the source revision matches", async () => {
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.link.upsert.mockResolvedValue({ id: "link-1", type: "tracks" });
  expect(await LinkDomain.create({ fromId: "from", toId: "to", type: "tracks" }, 4)).toEqual({
    ok: true, value: { id: "link-1", type: "tracks" },
  });
  expect(db.item.updateMany).toHaveBeenCalledWith({
    where: { id: "from", revision: 4 }, data: { revision: { increment: 1 } },
  });
});

it("deletes a Link when the source revision matches", async () => {
  db.item.updateMany.mockResolvedValue({ count: 1 });
  expect(await LinkDomain.delete({ fromId: "from", toId: "to", type: "tracks" }, 4)).toEqual({
    ok: true, value: { deleted: true },
  });
  expect(db.link.deleteMany).toHaveBeenCalledWith({ where: { fromId: "from", toId: "to", type: "tracks" } });
});

it.each(["create", "delete"] as const)("rejects stale Link %s without writing", async (operation) => {
  db.item.updateMany.mockResolvedValue({ count: 0 });
  db.item.findUnique.mockResolvedValue({ revision: 5 });
  expect(await LinkDomain[operation]({ fromId: "from", toId: "to" }, 4)).toEqual({
    ok: false, conflict: true, currentRevision: 5,
  });
  expect(db.link.upsert).not.toHaveBeenCalled();
  expect(db.link.deleteMany).not.toHaveBeenCalled();
});

it("validates Link types in the domain before writing", async () => {
  expect(await LinkDomain.create({ fromId: "from", toId: "to", type: "unknown" }, 4)).toEqual({
    ok: false, error: "Invalid Link type",
  });
  expect(db.$transaction).not.toHaveBeenCalled();
});

it.each(["create", "delete"] as const)("rejects Link %s without a source revision", async (operation) => {
  expect(await LinkDomain[operation]({ fromId: "from", toId: "to" }, undefined as unknown as number)).toMatchObject({
    ok: false, error: expect.any(String),
  });
  expect(db.$transaction).not.toHaveBeenCalled();
});
