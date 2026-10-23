import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const item = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { item } }));
beforeEach(() => vi.resetAllMocks());

it("quick captures an inbox note at revision zero", async () => {
  item.create.mockResolvedValue({ id: "new", title: "Capture", status: "inbox", revision: 0 });
  const response = await POST(new NextRequest("http://localhost/api/inbox", {
    method: "POST", body: JSON.stringify({ text: "  Capture  " }),
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ title: "Capture", status: "inbox", revision: 0 });
  expect(item.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ title: "Capture", type: "note", status: "inbox", revision: 0 }),
  }));
});
