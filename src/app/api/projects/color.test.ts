import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSession } from "@/lib/auth";
import { POST } from "./route";
import { PATCH } from "./[id]/route";
const db = vi.hoisted(() => ({ project: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() }, domain: { findFirst: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));
const ctx = { params: Promise.resolve({ id: "project" }) };
function request(body: object, method: "POST" | "PATCH") {
  return new NextRequest("http://localhost/api/projects", { method, headers: { cookie: `lifeos-session=${createSession("alice", "alice@example.com", true)}` }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.resetAllMocks();
  db.project.findFirst.mockResolvedValue({ id: "project", userId: "alice", color: "#abcdef" });
  db.project.create.mockImplementation(async ({ data }) => ({ id: "project", ...data }));
  db.project.update.mockImplementation(async ({ data }) => ({ id: "project", ...data }));
});
it.each([undefined, null, "#123456"])("creates with color %s, inheriting by default", async (color) => {
  const response = await POST(request({ name: "Project", ...(color !== undefined ? { color } : {}) }, "POST"));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ color: color ?? null });
  expect(db.project.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: "alice", color: color ?? null }) }));
});
it("distinguishes omitted update from clearing an override", async () => {
  expect((await PATCH(request({ name: "Renamed" }, "PATCH"), ctx)).status).toBe(200);
  expect(db.project.update.mock.calls[0][0].data).not.toHaveProperty("color");
  expect((await PATCH(request({ color: null }, "PATCH"), ctx)).status).toBe(200);
  expect(db.project.update.mock.calls[1][0].data).toEqual({ color: null });
});
it.each(["red", "#nope", "var(--primary)", 42, {}])("rejects malformed color %j on create and update", async (color) => {
  expect((await POST(request({ name: "Project", color }, "POST"))).status).toBe(400);
  expect((await PATCH(request({ color }, "PATCH"), ctx)).status).toBe(400);
  expect(db.project.create).not.toHaveBeenCalled();
  expect(db.project.update).not.toHaveBeenCalled();
});
it("checks project ownership before editing its color", async () => {
  db.project.findFirst.mockResolvedValue(null);
  expect((await PATCH(request({ color: null }, "PATCH"), ctx)).status).toBe(404);
  expect(db.project.update).not.toHaveBeenCalled();
  expect(db.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "project", userId: "alice" } }));
});
