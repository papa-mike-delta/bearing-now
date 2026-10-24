import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

const db = vi.hoisted(() => ({ habitLog: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db }));
beforeEach(() => vi.resetAllMocks());

it.each(["2026-10-23", "2026-03-08", "2026-11-01"])("stores calendar date %s without shifting and toggles the same log", async (date) => {
  const request = () => new NextRequest("http://localhost/api/items/habit/habit-logs", {
    method: "POST", body: JSON.stringify({ date }),
  });
  const ctx = { params: Promise.resolve({ id: "habit" }) };
  const stored = { id: "log", itemId: "habit", date: new Date(`${date}T00:00:00.000Z`), value: 1 };
  db.habitLog.create.mockResolvedValue(stored);
  expect(await (await POST(request(), ctx)).json()).toMatchObject({ logged: true });
  expect(db.habitLog.create).toHaveBeenCalledWith({ data: { itemId: "habit", date: stored.date, value: 1, note: undefined } });
  db.habitLog.findUnique.mockResolvedValue(stored);
  expect(await (await POST(request(), ctx)).json()).toEqual({ logged: false });
  expect(db.habitLog.findUnique).toHaveBeenLastCalledWith({ where: { itemId_date: { itemId: "habit", date: stored.date } } });
  expect(db.habitLog.delete).toHaveBeenCalledWith({ where: { id: "log" } });
});
