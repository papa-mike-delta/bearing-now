import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH } from "./route";

const item = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { item } }));

const ctx = { params: Promise.resolve({ id: "item-1" }) };

beforeEach(() => vi.resetAllMocks());

it("returns the Item revision on reads", async () => {
  item.findUnique.mockResolvedValue({ id: "item-1", revision: 4, metadata: null });

  const response = await GET(new NextRequest("http://localhost/api/items/item-1"), ctx);

  expect(await response.json()).toMatchObject({ id: "item-1", revision: 4 });
});

it("atomically increments and returns the revision when updating an Item", async () => {
  item.update.mockResolvedValue({ id: "item-1", title: "Updated", revision: 5, metadata: null });

  const response = await PATCH(new NextRequest("http://localhost/api/items/item-1", {
    method: "PATCH",
    body: JSON.stringify({ title: "Updated", revision: 99 }),
  }), ctx);

  expect(item.update).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: "item-1" },
    data: { title: "Updated", revision: { increment: 1 } },
  }));
  expect(await response.json()).toMatchObject({ id: "item-1", revision: 5 });
});
