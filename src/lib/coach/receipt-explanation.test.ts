import { expect, it } from "vitest";
import { coachReceiptFixtures } from "@/lib/fixtures/coach-receipts";
import { explainReceipt, receiptItemRefs, receiptActivityLine, receiptFeedback } from "./receipt-explanation";

it.each(coachReceiptFixtures)("interprets $operation success and refusal from structured or stored data", (fixture) => {
  for (const ok of [true, false]) {
    const data = { ...fixture, status: ok ? "success" : "refused", receipt: ok ? { ok, value: fixture.value } : { ok, conflict: true, currentRevision: 5 } };
    const structured = explainReceipt(data);
    expect(explainReceipt({ ...data, payload: JSON.stringify(data.payload), receipt: JSON.stringify(data.receipt) })).toEqual(structured);
    expect(structured.action).toBe(ok ? fixture.success : fixture.refused);
    expect(structured.outcome).toBe(ok ? "success" : "refused");
    expect(receiptActivityLine(structured)).toBe(receiptFeedback(structured));
  }
});

it("preserves execution titles while activity prefers renamed Items", () => {
  const data = { operation: "item.update", status: "success", payload: { id: "item", data: { title: "Attempt" } }, receipt: { ok: true, value: { id: "item", title: "Executed" } } };
  const titles = new Map([["item", "Renamed"]]);
  expect(explainReceipt(data, titles, "execution").subject).toBe("Executed");
  expect(explainReceipt(data, titles).subject).toBe("Renamed");
  expect(explainReceipt(data).subject).toBe("Executed");
  expect(explainReceipt({ ...data, status: "refused", receipt: { ok: false } }, titles, "execution").subject).toBe("Renamed");
  expect(explainReceipt({ ...data, status: "refused", receipt: { ok: false } }).subject).toBe("Attempt");
});

it.each([undefined, null, [], 3, "{broken", '"string"', '{"data":[]}'])("tolerates malformed/legacy stored data %j", (value) => {
  const data = { operation: "item.archive", status: "refused", payload: value, receipt: value };
  expect(receiptActivityLine(explainReceipt(data))).toBe("Refused archive Item");
  expect(receiptItemRefs(data)).toEqual({ itemId: undefined });
});

it.each(["legacy.write", "constructor", "__proto__"])("handles unknown operation %s without inherited verbs", (operation) => {
  expect(receiptFeedback(explainReceipt({ operation, status: "success", payload: {}, receipt: {} }))).toBe(`${operation} Item`);
  expect(receiptFeedback(explainReceipt({ operation, status: "refused", payload: {}, receipt: {} }))).toBe(`Refused ${operation} Item`);
});

it("cannot label an explicit refusal as success and keeps feedback on one line", () => {
  expect(receiptFeedback(explainReceipt({ operation: "item.create", status: "success", payload: { data: { title: "Line\n two" } }, receipt: { ok: false } }))).toBe("Refused create Line two");
});

it("resolves legacy Link shapes and never mistakes a Link id for an Item", () => {
  const data = { operation: "link.update", status: "success", payload: {}, receipt: { ok: true, value: { id: "link", fromId: "from", toId: "to" } } };
  expect(receiptItemRefs(data)).toEqual({ fromId: "from", toId: "to" });
  expect(receiptFeedback(explainReceipt(data, new Map([["to", "Destination"]])))).toBe("Linked Item → Destination");
  expect(receiptFeedback(explainReceipt(data))).toBe("Linked Item");
  expect(receiptItemRefs({ ...data, payload: { fromId: "old-from", toId: "old-to" } })).toEqual({ fromId: "old-from", toId: "old-to" });
});
