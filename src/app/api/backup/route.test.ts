import { beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";

const db = vi.hoisted(() => ({
  habitLog: { deleteMany: vi.fn() },
  reviewItem: { deleteMany: vi.fn() },
  review: { deleteMany: vi.fn() },
  link: { deleteMany: vi.fn(), upsert: vi.fn() },
  tagOnItem: { deleteMany: vi.fn() },
  tag: { deleteMany: vi.fn() },
  item: { deleteMany: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn(), updateMany: vi.fn() },
  project: { deleteMany: vi.fn() },
  domain: { deleteMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));

const request = (links: unknown) => new Request("http://localhost/api/backup", {
  method: "POST",
  body: JSON.stringify({ version: 1, links }),
});

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((run) => run(db));
  db.item.findUniqueOrThrow.mockResolvedValue({ id: "item-1", revision: 0 });
  db.item.updateMany.mockResolvedValue({ count: 1 });
  db.link.upsert.mockResolvedValue({ id: "link-1" });
});

it.each(["related", "unknown", null, 42])("rejects backup Link type %j before clearing data", async (type) => {
  const response = await POST(request([
    { fromId: "item-1", toId: "item-2", type: "mentions" },
    { fromId: "item-2", toId: "item-3", type },
  ]));

  expect(response.status).toBe(400);
  expect(db.habitLog.deleteMany).not.toHaveBeenCalled();
  expect(db.link.upsert).not.toHaveBeenCalled();
});

it("restores all six core Link types", async () => {
  const types = ["advances", "tracks", "related_to", "mentions", "scheduled_at", "located_at"];
  const links = types.map((type) => ({ id: `link-${type}`, createdAt: "2026-10-01T00:00:00.000Z", fromId: "item-1", toId: "item-2", type }));

  const response = await POST(request(links));

  expect(response.status).toBe(200);
  expect(db.link.upsert.mock.calls.map(([{ create }]) => create)).toEqual(links);
});
