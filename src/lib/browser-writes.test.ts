import { afterEach, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { BrowserWriteError, affectedReads, coachWriteRequest, createBrowserWrites, fetchWriteTransport, operationReceiptHref, type WriteReply, type WriteRequest, type WriteSource } from "./browser-writes";
import { ScriptedWriteTransport } from "./fixtures/scripted-write-transport";
import { createItemDraftOwner, itemDraftKey } from "./item-drafts";

const item = { id: "item-a", title: "New title", type: "note", revision: 3 };
const request = (source: WriteSource): WriteRequest => source === "coach"
  ? coachWriteRequest("updateItem", { id: item.id, revision: 2, data: { title: item.title } })
  : { source, operation: "item.update", url: `/api/items/${item.id}`, method: "PATCH", body: { title: item.title, revision: 2 }, itemIds: [item.id] };
const reply = (status: number, body: unknown): WriteReply => ({ status, body, parsed: true });
function harness(replies: (WriteReply | Error)[]) {
  const transport = new ScriptedWriteTransport(replies);
  const invalidate = vi.fn();
  const notifyFailure = vi.fn();
  return { transport, invalidate, notifyFailure, writes: createBrowserWrites({ transport, invalidate, notifyFailure }) };
}
afterEach(() => vi.unstubAllGlobals());

it.each(["user", "coach"] as const)("preserves successful %s values and receipt metadata", async (source) => {
  const value = source === "coach" ? { ok: true, value: item, receiptId: "receipt 1", message: "Updated New title" } : { ...item, receiptId: "receipt 1" };
  const h = harness([reply(200, value)]);
  expect(await h.writes.execute(request(source))).toMatchObject({ kind: "success", source, status: 200, receiptId: "receipt 1", value: item });
  expect(h.notifyFailure).not.toHaveBeenCalled();
  expect(h.transport.requests).toHaveLength(1);
});

const refusals = [
  { status: 409, body: { ok: false, conflict: true, currentRevision: 8 }, expected: { kind: "conflict", currentRevision: 8 } },
  { status: 409, body: { ok: false, conflict: true, currentRevision: null }, expected: { kind: "conflict", currentRevision: null } },
  { status: 429, body: { ok: false, rateLimited: true, limit: 20 }, expected: { kind: "rate-limit", limit: 20 } },
  { status: 423, body: { ok: false, itemOpen: true, itemId: "protected" }, expected: { kind: "item-open", itemId: "protected" } },
  { status: 400, body: { error: "title is required" }, expected: { kind: "error", error: "title is required" } },
  { status: 401, body: { error: "Unauthorized" }, expected: { kind: "error", error: "Unauthorized" } },
  { status: 500, body: { error: "Unavailable" }, expected: { kind: "error", error: "Unavailable" } },
];
it.each(["user", "coach"] as const)("keeps all %s refusal details and reports each outcome exactly once", async (source) => {
  for (const scenario of refusals) {
    const h = harness([reply(scenario.status, { ...scenario.body, receiptId: "refused receipt" })]);
    const outcome = await h.writes.execute(request(source));
    expect(outcome).toMatchObject({ ...scenario.expected, source, status: scenario.status, receiptId: "refused receipt" });
    expect(h.notifyFailure).toHaveBeenCalledExactlyOnceWith(outcome);
    expect(h.invalidate.mock.calls.map(([key]) => key)).not.toContainEqual(["graph"]);
    expect(h.transport.requests).toHaveLength(1);
  }
});

it.each([
  reply(200, {}), reply(200, { ...item, id: "wrong" }), reply(200, { ...item, revision: -1 }),
  reply(409, { ok: false, conflict: true }), reply(429, { ok: false, rateLimited: true, limit: "20" }),
  reply(423, { ok: false, itemOpen: true }), reply(409, { ok: true, value: item }),
  reply(200, { ok: true, value: item, conflict: true }), reply(200, { ...item, receiptId: 5 }),
  reply(400, { ok: false, conflict: true, rateLimited: true }),
  { status: 200, parsed: false, body: null }, { status: 502, parsed: false, body: null },
])("rejects malformed or contradictory HTTP responses (%j)", async (response) => {
  const h = harness([response]);
  expect(await h.writes.execute(request("user"))).toMatchObject({ kind: "malformed", status: response.status });
  expect(h.notifyFailure).toHaveBeenCalledTimes(1);
  expect(h.invalidate).not.toHaveBeenCalled();
});

it("treats a 2xx structured refusal as a refusal, never as a value", async () => {
  const h = harness([reply(200, { ok: false, conflict: true, currentRevision: 4 })]);
  expect(await h.writes.execute(request("coach"))).toMatchObject({ kind: "conflict", currentRevision: 4 });
});

it("distinguishes transport failure and does not retry an unconfirmed write", async () => {
  const h = harness([new Error("connection lost"), reply(200, item)]);
  const outcome = await h.writes.execute(request("user"));
  expect(outcome).toMatchObject({ kind: "network", source: "user" });
  expect(outcome).not.toHaveProperty("status");
  expect(h.notifyFailure).toHaveBeenCalledTimes(1);
  expect(h.transport.requests).toHaveLength(1);
});

it.each(["user", "coach"] as const)("invalidates affected %s reads, including parameterized graph/calendar, while keeping unrelated reads cached", async (source) => {
  const cache = new QueryClient();
  const affected = [["items", { q: "old" }], ["inbox"], ["item", item.id], ["graph", { center: item.id }],
    ["calendar", { month: "10" }], ["project", "previous-project"], ["project", "new-project"], ["projects"], ["stats"],
    ["tags"], ["insights"], ["search", "old title"], ["onThisDay"], ["coachActivity"]];
  const unrelated = [["item", "unrelated"], ["habitLogs", "unrelated"], ["domains"], ["reviews"], ["theme-override"], ["preferences"], ["session"]];
  for (const key of [...affected, ...unrelated]) cache.setQueryData(key, { cached: true });
  const writes = createBrowserWrites({
    transport: new ScriptedWriteTransport([reply(200, source === "coach" ? { ok: true, value: item } : item)]),
    invalidate: (key) => cache.invalidateQueries({ queryKey: key }), notifyFailure: vi.fn(),
  });
  expect((await writes.execute(request(source))).kind).toBe("success");
  for (const key of affected) expect(cache.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
  for (const key of unrelated) expect(cache.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(false);
  cache.clear();
});

it("refreshes both Link endpoints and graph without refreshing independent aggregates", async () => {
  const h = harness([reply(200, { ok: true, value: { deleted: true }, receiptId: "receipt" })]);
  await h.writes.execute(coachWriteRequest("deleteLink", { fromId: "from", toId: "to", revision: 1 }));
  const keys = h.invalidate.mock.calls.map(([key]) => key);
  for (const key of [["item", "from"], ["item", "to"], ["graph"], ["coachActivity"]]) expect(keys).toContainEqual(key);
  for (const key of [["preferences"], ["domains"], ["reviews"], ["projects"], ["stats"], ["tags"]]) expect(keys).not.toContainEqual(key);
  expect(keys.filter((key) => key[0] === "coachActivity")).toHaveLength(1);
});

it("refreshes conflict detail and Coach refusal activity without clearing the draft", async () => {
  const owner = createItemDraftOwner();
  const key = itemDraftKey(item.id);
  owner.receive(key, { ...item, revision: 2 }); owner.change(key, { title: "Unsaved" });
  const ticket = owner.beginSave(key)!;
  const h = harness([reply(409, { ok: false, conflict: true, currentRevision: 9, receiptId: "refused" })]);
  const outcome = await h.writes.execute(request("coach"));
  if (outcome.kind === "success") throw new Error("Expected refusal");
  const error = new BrowserWriteError(outcome);
  owner.fail(ticket, error);
  expect(error).toMatchObject({ status: 409, receiptId: "refused", outcome: { currentRevision: 9 } });
  expect(owner.get(key)).toMatchObject({ conflict: true, data: { title: "Unsaved", revision: 2 }, failure: { receiptId: "refused", currentRevision: 9 } });
  expect(h.invalidate.mock.calls.map(([key]) => key)).toEqual([["item", item.id], ["coachActivity"]]);
  expect(h.notifyFailure).toHaveBeenCalledTimes(1);
});

it("leaves successful Coach reads out of data-write refreshes but refreshes refused read receipts", async () => {
  const h = harness([reply(200, { ok: true, value: [], receiptId: "read" }), reply(400, { ok: false, error: "Not found", receiptId: "refusal" })]);
  await h.writes.execute(coachWriteRequest("searchItems", { q: "hello" }));
  expect(h.invalidate).not.toHaveBeenCalled();
  await h.writes.execute(coachWriteRequest("getItem", { id: "missing" }));
  expect(h.invalidate.mock.calls.map(([key]) => key)).toEqual([["coachActivity"]]);
});

it("uses the typed outcome, rather than HTTP status alone, for draft conflicts", () => {
  for (const [failure, conflict] of [
    [{ source: "user", kind: "malformed", status: 409, message: "Invalid response" }, false],
    [{ source: "user", kind: "conflict", status: 200, currentRevision: 5, message: "Changed" }, true],
  ] as const) {
    const owner = createItemDraftOwner();
    const key = itemDraftKey(item.id);
    owner.receive(key, item); owner.change(key, { title: "Unsaved" });
    owner.fail(owner.beginSave(key)!, new BrowserWriteError(failure));
    expect(owner.get(key)?.conflict).toBe(conflict);
    expect(owner.get(key)?.data.title).toBe("Unsaved");
  }
});

it("does not reclassify a committed write when a cache refresh fails", async () => {
  const h = harness([reply(200, item)]);
  h.invalidate.mockImplementationOnce(() => { throw new Error("cache offline"); });
  h.invalidate.mockRejectedValueOnce(new Error("refresh failed"));
  expect((await h.writes.execute(request("user"))).kind).toBe("success");
  expect(h.notifyFailure).not.toHaveBeenCalled();
  expect(h.invalidate.mock.calls.length).toBeGreaterThan(2);
});

it("reconciles scheduler partial failures without claiming success or invalidating preferences", () => {
  const keys = affectedReads({ source: "user", operation: "scheduler.run", url: "/api/scheduler", method: "POST" },
    { source: "user", kind: "item-open", itemId: "open", message: "Refused", status: 423 });
  expect(keys).toContainEqual(["graph"]); expect(keys).toContainEqual(["item"]);
  expect(keys).not.toContainEqual(["preferences"]);
});

it("encodes working receipt routes for ordinary and Coach outcomes", () => {
  expect(operationReceiptHref("receipt /1", "user")).toBe("/api/receipts/receipt%20%2F1");
  expect(operationReceiptHref("receipt /1", "coach")).toBe("/api/coach?receipt=receipt%20%2F1");
});

it("uses the owned fetch adapter without hiding status or malformed JSON", async () => {
  const send = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, rateLimited: true, limit: 20 }), { status: 429 }))
    .mockResolvedValueOnce(new Response("not-json", { status: 502 }));
  vi.stubGlobal("fetch", send);
  expect(await fetchWriteTransport.send(request("user"))).toMatchObject({ status: 429, parsed: true, body: { limit: 20 } });
  expect(send.mock.calls[0][1]).toMatchObject({ method: "PATCH", credentials: "same-origin", body: JSON.stringify(request("user").body) });
  expect(await fetchWriteTransport.send(request("user"))).toEqual({ status: 502, parsed: false, body: null });
});
