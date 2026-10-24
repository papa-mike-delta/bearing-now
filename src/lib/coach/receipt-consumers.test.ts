import { beforeEach, expect, it, vi } from "vitest";
import { coachReceiptFixtures } from "@/lib/fixtures/coach-receipts";
import { ItemDomain } from "@/lib/domain/item";
import { LinkDomain } from "@/lib/domain/link";
import { OperationLedger } from "@/lib/domain/operation-ledger";
import { CoachTools } from "./tools";

const db = vi.hoisted(() => ({
  item: { findFirst: vi.fn(), findMany: vi.fn() },
  operationLedger: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));
beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  db.item.findFirst.mockResolvedValue({ title: "Stored" });
  db.item.findMany.mockResolvedValue([{ id: "item", title: "Stored" }, { id: "other", title: "Destination" }]);
});

function execute(fixture: typeof coachReceiptFixtures[number]) {
  const payload = fixture.payload;
  const args = fixture.operation.startsWith("link.") && "data" in payload ? { ...payload.data, revision: 4 } : payload;
  switch (fixture.tool) {
    case "createItem": return CoachTools.createItem("alice", args as Parameters<typeof CoachTools.createItem>[1]);
    case "updateItem": return CoachTools.updateItem("alice", args as Parameters<typeof CoachTools.updateItem>[1]);
    case "archiveItem": return CoachTools.archiveItem("alice", args as Parameters<typeof CoachTools.archiveItem>[1]);
    case "createLink": return CoachTools.createLink("alice", args as Parameters<typeof CoachTools.createLink>[1]);
    case "deleteLink": return CoachTools.deleteLink("alice", args as Parameters<typeof CoachTools.deleteLink>[1]);
    case "getItem": return CoachTools.getItem("alice", args as { id: string });
    case "getLinks": return CoachTools.getLinks("alice", args as { id: string });
    case "searchItems": return CoachTools.searchItems("alice", args as { q: string });
    case "listOpenItems": return CoachTools.listOpenItems("alice");
  }
}

it.each(coachReceiptFixtures)("shares $operation meaning through feedback and activity consumers", async (fixture) => {
  for (const ok of [true, false]) {
    const result = ok ? { ok: true, value: fixture.value, receiptId: "receipt" } : { ok: false, conflict: true, currentRevision: 5, receiptId: "receipt" };
    for (const method of ["create", "update", "archive"] as const) vi.spyOn(ItemDomain, method).mockResolvedValue(result as never);
    for (const method of ["create", "delete"] as const) vi.spyOn(LinkDomain, method).mockResolvedValue(result as never);
    vi.spyOn(OperationLedger, "run").mockResolvedValue(result as never);
    db.operationLedger.findMany.mockResolvedValue([{
      id: "receipt", operation: fixture.operation, status: ok ? "success" : "refused",
      payload: JSON.stringify(fixture.payload), receipt: JSON.stringify(result), createdAt: new Date("2026-01-01"),
    }]);
    if (fixture.tool === "getItem" && !ok) db.item.findMany.mockResolvedValue([]);
    const feedback = await execute(fixture);
    const [activity] = await OperationLedger.listCoachActivity("alice");
    expect(feedback.message).toBe(activity.line);
    expect(feedback.message).toMatch(new RegExp(`^${ok ? fixture.success : fixture.refused} `));
    expect(feedback.receiptId).toBe(activity.id);
    expect(feedback.message).not.toContain("\n");
    if (fixture.operation.startsWith("link.")) {
      expect(feedback.message).toMatch(/Stored → Destination$/);
      expect(db.item.findMany).toHaveBeenCalledWith({ where: { id: { in: ["item", "other"] }, userId: "alice" }, select: { id: true, title: true } });
    }
  }
});

it("keeps execution-time feedback stable while activity uses the current owned title", async () => {
  const result = { ok: true, value: { id: "item", title: "Executed" }, receiptId: "receipt" };
  vi.spyOn(ItemDomain, "update").mockResolvedValue(result as never);
  const feedback = await CoachTools.updateItem("alice", { id: "item", revision: 4, data: { title: "Executed" } });
  db.item.findMany.mockResolvedValue([{ id: "item", title: "Renamed" }]);
  db.operationLedger.findMany.mockResolvedValue([{ id: "receipt", operation: "item.update", status: "success", payload: '{"id":"item"}', receipt: JSON.stringify(result), createdAt: new Date() }]);
  expect(feedback.message).toBe("Updated Executed");
  expect((await OperationLedger.listCoachActivity("alice"))[0].line).toBe("Updated Renamed");
  db.item.findMany.mockResolvedValue([]);
  expect((await OperationLedger.listCoachActivity("alice"))[0].line).toBe("Updated Executed");
});

it("uses Item fallback for missing or unowned Link endpoints with one scoped title query", async () => {
  vi.spyOn(LinkDomain, "delete").mockResolvedValue({ ok: false, error: "Not found", receiptId: "receipt" });
  db.item.findMany.mockResolvedValue([]);
  expect((await CoachTools.deleteLink("alice", { fromId: "foreign", toId: "missing", revision: 4, type: "tracks" })).message).toBe("Refused unlink Item");
  expect(db.item.findMany).toHaveBeenCalledTimes(1);
  expect(db.item.findMany).toHaveBeenCalledWith({ where: { id: { in: ["foreign", "missing"] }, userId: "alice" }, select: { id: true, title: true } });
});
