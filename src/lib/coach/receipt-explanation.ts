/** Pure interpretation of durable ledger data. Callers supply only titles scoped to their user. */
const actions: Record<string, { success: string; refused: string; write?: true; plural?: true }> = {
  "item.create": { success: "Created", refused: "Refused create", write: true },
  "item.update": { success: "Updated", refused: "Refused update", write: true },
  "item.archive": { success: "Archived", refused: "Refused archive", write: true },
  "link.create": { success: "Linked", refused: "Refused link", write: true },
  "link.update": { success: "Linked", refused: "Refused link", write: true },
  "link.delete": { success: "Unlinked", refused: "Refused unlink", write: true },
  "coach.getItem": { success: "Read", refused: "Refused read" },
  "coach.getLinks": { success: "Read links", refused: "Refused read links" },
  "coach.searchItems": { success: "Searched", refused: "Refused search", plural: true },
  "coach.listOpenItems": { success: "Listed open", refused: "Refused list", plural: true },
};

export const coachActivityWrites = Object.keys(actions).filter((operation) => actions[operation].write);
export type ReceiptData = { operation: string; status: string; payload: unknown; receipt: unknown };
export type ReceiptRefs = { itemId?: string; fromId?: string; toId?: string };
export type ReceiptExplanation = {
  operation: string;
  outcome: "success" | "refused";
  action: string;
  refs: ReceiptRefs;
  subject: string;
  destination?: string;
};

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.replace(/\s+/g, " ").trim() : undefined;
}
function id(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
function parsed(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return undefined; }
}
function parts(data: ReceiptData) {
  const body = record(parsed(data.payload));
  const input = record(body?.data);
  const result = record(parsed(data.receipt));
  const value = record(result?.value);
  const first = Array.isArray(result?.value) ? record(result.value[0]) : undefined;
  return { body, input, result, value, first };
}
export function receiptItemRefs(data: ReceiptData): ReceiptRefs {
  const { body, input, result, value } = parts(data);
  if (data.operation.startsWith("link.")) return {
    fromId: id(input?.fromId) ?? id(body?.fromId) ?? id(value?.fromId),
    toId: id(input?.toId) ?? id(body?.toId) ?? id(value?.toId),
  };
  return { itemId: id(body?.id) ?? id(input?.id) ?? id(value?.id) ?? id(result?.itemId) };
}

export function explainReceipt(
  data: ReceiptData,
  titles: ReadonlyMap<string, string> = new Map(),
  freshness: "execution" | "current" = "current",
): ReceiptExplanation {
  const { input, result, value, first } = parts(data);
  // The durable status is authoritative; an explicit refusal cannot become success.
  const outcome = data.status === "success" && result?.ok !== false ? "success" : "refused";
  const verbs = Object.hasOwn(actions, data.operation) ? actions[data.operation] : undefined;
  const action = outcome === "success" ? verbs?.success ?? text(data.operation) ?? "Operation" : verbs?.refused ?? `Refused ${text(data.operation) ?? "operation"}`;
  const refs = receiptItemRefs(data);
  const live = (id?: string) => id ? text(titles.get(id)) : undefined;
  const stored = text(value?.title) ?? text(input?.title) ?? text(first?.title);
  const executionTitle = outcome === "success" && !data.operation.startsWith("link.") ? text(value?.title) : undefined;
  return {
    operation: data.operation, outcome, action, refs,
    subject: (freshness === "execution" ? executionTitle : undefined)
      ?? live(refs.fromId ?? refs.itemId) ?? stored ?? (verbs?.plural ? "Items" : "Item"),
    ...(live(refs.toId) ? { destination: live(refs.toId) } : {}),
  };
}

/** Presentation stays separate from interpretation and receipt navigation. */
export function receiptFeedback(explanation: ReceiptExplanation): string {
  return `${explanation.action} ${explanation.subject}${explanation.destination ? ` → ${explanation.destination}` : ""}`;
}
export function receiptActivityLine(explanation: ReceiptExplanation): string {
  return receiptFeedback(explanation);
}
