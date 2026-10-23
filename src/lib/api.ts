import type { DomainResult } from "@/lib/domain/result";
import type { Actor } from "@/lib/domain/operation-ledger";
import { getUserFromRequest } from "@/lib/auth";
// bearing.now — shared server-side helpers
import { NextResponse } from "next/server";

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export function notFound(msg = "Not found") {
  return NextResponse.json({ error: msg }, { status: 404 });
}

// Parse JSON body safely
export async function parseBody<T = any>(req: Request): Promise<T> {
  try {
    const text = await req.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

export function parseMeta(item: any) {
  if (!item) return item;
  let metadata: any = null;
  try {
    metadata = item.metadata ? JSON.parse(item.metadata) : null;
  } catch {
    metadata = null;
  }
  return { ...item, metadata };
}

export function parseListMeta(items: any[]) {
  return items.map(parseMeta);
}

export function domainResponse<T>(result: DomainResult<T>, serialize: (value: T) => unknown = (value) => value) {
  if (result.ok) return ok(serialize(result.value));
  if ("conflict" in result) return ok(result, { status: 409 });
  if ("rateLimited" in result) return ok(result, { status: 429 });
  if ("itemOpen" in result) return ok(result, { status: 423 });
  return bad(result.error);
}

// Never accept actor identity from a request body/header. Unverified callers
// retain the existing middleware policy and cannot bypass open-item protection.
export async function writeActor(req: Request): Promise<Actor> {
  const session = await getUserFromRequest(req);
  return session ? `user:${session.userId}` : "agent:anonymous";
}
