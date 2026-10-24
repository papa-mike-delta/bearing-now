import { qk } from "./query-keys";

export type WriteSource = "user" | "coach";
export type WriteOperation = "item.create" | "item.update" | "item.archive" | "link.create" | "link.delete" | "habit.toggle" | "scheduler.run" | "coach.read";
export type WriteRequest = {
  source: WriteSource; operation: WriteOperation; url: string;
  method: "POST" | "PATCH" | "DELETE"; body?: unknown; itemIds?: string[];
};
export type WriteReply = { status: number; body: unknown; parsed: boolean };
export interface WriteTransport { send(request: WriteRequest): Promise<WriteReply> }
export function coachWriteRequest(tool: string, args: unknown): WriteRequest {
  const operations: Record<string, WriteOperation> = {
    createItem: "item.create", updateItem: "item.update", archiveItem: "item.archive",
    createLink: "link.create", deleteLink: "link.delete",
  };
  const operation = operations[tool] ?? "coach.read";
  const body = typeof args === "object" && args !== null ? args as Record<string, unknown> : {};
  const itemIds = (operation.startsWith("link.") ? [body.fromId, body.toId] : [body.id])
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  return { source: "coach", operation, url: "/api/coach", method: "POST", body: { tool, args }, itemIds };
}
type Meta = { source: WriteSource; status?: number; receiptId?: string };
export type WriteFailure = Meta & (
  | { kind: "conflict"; currentRevision: number | null; message: string }
  | { kind: "rate-limit"; limit: number; message: string }
  | { kind: "item-open"; itemId: string; message: string }
  | { kind: "error"; error: string; message: string }
  | { kind: "malformed" | "network"; message: string }
);
export type WriteOutcome<T = unknown> = (Meta & { kind: "success"; value: T; message?: string }) | WriteFailure;
export const operationReceiptHref = (id: string, source: WriteSource) => source === "coach"
  ? `/api/coach?receipt=${encodeURIComponent(id)}` : `/api/receipts/${encodeURIComponent(id)}`;

export class BrowserWriteError extends Error {
  readonly status?: number;
  readonly receiptId?: string;
  constructor(readonly outcome: WriteFailure) {
    super(outcome.message);
    this.name = "BrowserWriteError";
    this.status = outcome.status;
    this.receiptId = outcome.receiptId;
  }
}

const record = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const revision = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;

function validValue(operation: WriteOperation, value: unknown) {
  if (operation === "coach.read") return value !== undefined;
  if (!record(value)) return false;
  if (operation.startsWith("item.")) return text(value.id) && revision(value.revision) && typeof value.title === "string" && text(value.type);
  if (operation === "link.create") return text(value.id) && text(value.fromId) && text(value.toId);
  if (operation === "link.delete") return value.deleted === true;
  if (operation === "habit.toggle") return typeof value.logged === "boolean";
  return text(value.runAt) && Array.isArray(value.results) && record(value.summary);
}

/** Both raw REST values and Coach DomainResult envelopes cross this interface. */
export function decodeWriteReply<T>(request: WriteRequest, reply: WriteReply): WriteOutcome<T> {
  const meta: Meta = { source: request.source, status: reply.status };
  const malformed = (): WriteFailure => ({ ...meta, kind: "malformed", message: "Unexpected server response. Your changes have not been confirmed." });
  if (!reply.parsed || !record(reply.body)) return malformed();
  const body = reply.body;
  if (body.receiptId !== undefined && !text(body.receiptId)) return malformed();
  if (text(body.receiptId)) meta.receiptId = body.receiptId;
  const isSuccessStatus = reply.status >= 200 && reply.status < 300;
  const hasRefusal = body.ok === false || !isSuccessStatus;
  const flags = [body.conflict === true, body.rateLimited === true, body.itemOpen === true, typeof body.error === "string"].filter(Boolean).length;
  if (hasRefusal) {
    if (flags !== 1 || body.ok === true) return malformed();
    const prefix = request.source === "coach" && text(body.message) ? `${body.message.replace(/\s+/g, " ")}. ` : "";
    if (body.conflict === true && (reply.status === 409 || isSuccessStatus) && (body.currentRevision === null || revision(body.currentRevision))) {
      return { ...meta, kind: "conflict", currentRevision: body.currentRevision,
        message: `${prefix}This Item changed. Your edits are retained; reload or discard changes before saving again.` };
    }
    if (body.rateLimited === true && (reply.status === 429 || isSuccessStatus) && Number.isSafeInteger(body.limit) && body.limit > 0) {
      return { ...meta, kind: "rate-limit", limit: body.limit, message: `${prefix}Create limit reached (${body.limit} per rolling hour).` };
    }
    if (body.itemOpen === true && (reply.status === 423 || isSuccessStatus) && text(body.itemId)) {
      return { ...meta, kind: "item-open", itemId: body.itemId, message: `${prefix}The Item is open in an editor. Close it before trying this write again.` };
    }
    if (text(body.error) && ![409, 429, 423].includes(reply.status)) {
      return { ...meta, kind: "error", error: body.error, message: `${prefix}${body.error}` };
    }
    return malformed();
  }
  // A 2xx refusal-shaped body must not become a successful raw value.
  if (flags || (body.ok !== undefined && body.ok !== true)) return malformed();
  const enveloped = body.ok === true;
  if (request.source === "coach" && !enveloped) return malformed();
  const { receiptId: _receiptId, ...rawValue } = body;
  const value = enveloped ? body.value : rawValue;
  if (!validValue(request.operation, value)) return malformed();
  // An update response for a different Item cannot complete the selected draft.
  if (["item.update", "item.archive"].includes(request.operation) && request.itemIds?.length && value.id !== request.itemIds[0]) return malformed();
  return { ...meta, kind: "success", value: value as T, message: text(body.message) ? body.message : undefined };
}

/** Owned HTTP adapter. Domain refusals are decoded above, not thrown here. */
export const fetchWriteTransport: WriteTransport = {
  async send(request) {
    const response = await fetch(request.url, {
      method: request.method, credentials: "same-origin", headers: { "Content-Type": "application/json" },
      ...(request.body !== undefined ? { body: JSON.stringify(request.body) } : {}),
    });
    const raw = await response.text();
    try { return { status: response.status, body: JSON.parse(raw), parsed: true }; }
    catch { return { status: response.status, body: null, parsed: false }; }
  },
};

// Item-dependent reads, not an unfiltered cache flush. Domains, reviews, theme,
// preferences and auth do not depend on these writes and stay cached.
const itemReads = [["items"], qk.inbox, ["calendar"], ["project"], qk.projects, qk.stats,
  qk.insights, ["graph"], ["search"], qk.onThisDay, qk.tags, qk.coachActivity] as const;
const linkReads = [["items"], qk.inbox, ["calendar"], ["project"], qk.insights,
  ["graph"], ["search"], qk.onThisDay, qk.coachActivity] as const;

export function affectedReads(request: WriteRequest, outcome: WriteOutcome): readonly (readonly unknown[])[] {
  const keys: (readonly unknown[])[] = [];
  const ids = new Set(request.itemIds ?? []);
  if (outcome.kind === "success") {
    if (record(outcome.value) && request.operation.startsWith("item.") && text(outcome.value.id)) ids.add(outcome.value.id);
    if (request.operation.startsWith("item.")) keys.push(...itemReads);
    else if (request.operation.startsWith("link.")) keys.push(...linkReads);
    else if (request.operation === "habit.toggle") {
      keys.push(["items"], qk.stats, qk.insights, ["project"]);
      for (const id of ids) keys.push(qk.habitLogs(id));
    }
    if (request.operation !== "coach.read") for (const id of ids) keys.push(qk.item(id));
  } else if (outcome.kind === "conflict") {
    for (const id of ids) keys.push(qk.item(id));
  }
  // Scheduler can commit earlier writes before a later refusal. Reconcile only
  // Item reads even on failure; do not present it as a successful run.
  if (request.operation === "scheduler.run") keys.push(...itemReads, ["item"]);
  if (request.source === "coach" && outcome.receiptId && (outcome.kind !== "success" || request.operation !== "coach.read")) keys.push(qk.coachActivity);
  return [...new Map(keys.map((key) => [JSON.stringify(key), key])).values()];
}

export function createBrowserWrites(ports: {
  transport: WriteTransport;
  invalidate: (key: readonly unknown[]) => unknown;
  notifyFailure: (failure: WriteFailure) => void;
}) {
  return {
    async execute<T = any>(request: WriteRequest): Promise<WriteOutcome<T>> {
      let outcome: WriteOutcome<T>;
      try { outcome = decodeWriteReply<T>(request, await ports.transport.send(request)); }
      catch { outcome = { source: request.source, kind: "network", message: "Could not reach the server. Your changes have not been confirmed." }; }
      // Cache refresh cannot turn a committed write into a reported write error.
      for (const key of affectedReads(request, outcome)) {
        try { void Promise.resolve(ports.invalidate(key)).catch(() => {}); } catch {}
      }
      if (outcome.kind !== "success") ports.notifyFailure(outcome);
      return outcome;
    },
  };
}
