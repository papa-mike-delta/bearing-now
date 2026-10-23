import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const link = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { link } }));

const ctx = { params: Promise.resolve({ id: "item-1" }) };
const request = (body: unknown) => new NextRequest("http://localhost/api/items/item-1/links", {
  method: "POST",
  body: JSON.stringify(body),
});

beforeEach(() => vi.resetAllMocks());

it.each([
  "advances", "tracks", "related_to", "mentions", "scheduled_at", "located_at",
  undefined,
])("writes the validated type %s, defaulting to related_to", async (type) => {
  link.upsert.mockResolvedValue({ id: "link-1" });

  const response = await POST(request({ toId: "item-2", type }), ctx);

  expect(response.status).toBe(200);
  expect(link.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { fromId_toId_type: { fromId: "item-1", toId: "item-2", type: type ?? "related_to" } },
    create: { fromId: "item-1", toId: "item-2", type: type ?? "related_to", note: undefined },
  }));
});

it.each(["related", "unknown", "", null, 0, false, {}, [[]]])("rejects type %j with 400 before writing", async (type) => {
  link.upsert.mockResolvedValue({ id: "link-1" });
  const response = await POST(request({ toId: "item-2", type }), ctx);

  expect(response.status).toBe(400);
  expect(await response.json()).toHaveProperty("error");
  expect(link.upsert).not.toHaveBeenCalled();
});
