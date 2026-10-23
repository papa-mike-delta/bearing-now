import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const item = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { item } }));
beforeEach(() => vi.resetAllMocks());

it("creates an Item through the domain with revision zero and parsed metadata", async () => {
  item.create.mockResolvedValue({ id: "new", revision: 0, metadata: '{"pages":10}' });
  const response = await POST(new NextRequest("http://localhost/api/items", {
    method: "POST",
    body: JSON.stringify({ title: "New", type: "note", revision: 99, metadata: { pages: 10 } }),
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ id: "new", revision: 0, metadata: { pages: 10 } });
  expect(item.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ revision: 0, metadata: '{"pages":10}' }),
  }));
});
