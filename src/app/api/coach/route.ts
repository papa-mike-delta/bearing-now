import { bad, notFound, ok, parseBody } from "@/lib/api";
import { coachToolsEnabled } from "@/lib/coach/feature-flag";
import { getUserFromRequest } from "@/lib/auth";
import { CoachTools } from "@/lib/coach/tools";
import type { DomainResult } from "@/lib/domain/result";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function itemData(data: Record<string, unknown>) {
  return { ...data, ...(data.metadata !== undefined ? {
    metadata: data.metadata === null ? null : JSON.stringify(data.metadata),
  } : {}) };
}

function toolResponse(result: DomainResult<unknown> & { message: string }) {
  const status = result.ok ? 200 : "conflict" in result ? 409 : "rateLimited" in result ? 429 : "itemOpen" in result ? 423 : 400;
  return ok(result, { status });
}

async function authorize(req: Request) {
  if (!coachToolsEnabled()) return notFound();
  const session = await getUserFromRequest(req);
  if (!session?.twoFactorVerified) return bad("Unauthorized", 401);
}

// A minimal receipt view: the toast opens this authenticated JSON document.
export async function GET(req: Request) {
  const refusal = await authorize(req);
  if (refusal) return refusal;
  const id = new URL(req.url).searchParams.get("receipt");
  if (!id) return bad("receipt is required");
  const entry = await db.operationLedger.findUnique({ where: { id } });
  if (!entry || entry.actor !== "agent:coach") return notFound();
  return ok({ ...entry, payload: JSON.parse(entry.payload), receipt: JSON.parse(entry.receipt) });
}

export async function POST(req: Request) {
  const refusal = await authorize(req);
  if (refusal) return refusal;
  const body = await parseBody<unknown>(req);
  if (!isObject(body)) return bad("Invalid tool call");
  const args = body.args ?? {};
  if (!isObject(args)) return bad("Invalid tool arguments");
  if (args.tagNames !== undefined && (!Array.isArray(args.tagNames) || !args.tagNames.every((name) => typeof name === "string"))) {
    return bad("tagNames must be an array of strings");
  }
  const tagNames = args.tagNames as string[] | undefined;
  switch (body.tool) {
    case "searchItems":
      if (typeof args.q !== "string") return bad("q is required");
      return toolResponse(await CoachTools.searchItems({ q: args.q }));
    case "getItem":
    case "getLinks":
    case "archiveItem":
    case "updateItem": {
      if (typeof args.id !== "string" || !args.id) return bad("id is required");
      if (body.tool === "getItem") return toolResponse(await CoachTools.getItem({ id: args.id }));
      if (body.tool === "getLinks") return toolResponse(await CoachTools.getLinks({ id: args.id }));
      // Do not coerce or refresh revisions: the domain must refuse stale or missing ones.
      const revision = args.revision as number;
      if (body.tool === "archiveItem") return toolResponse(await CoachTools.archiveItem({ id: args.id, revision }));
      if (!isObject(args.data)) return bad("data is required");
      return toolResponse(await CoachTools.updateItem({ id: args.id, revision, data: itemData(args.data), tagNames }));
    }
    case "listOpenItems":
      return toolResponse(await CoachTools.listOpenItems());
    case "createItem":
      if (!isObject(args.data)) return bad("data is required");
      return toolResponse(await CoachTools.createItem({
        data: itemData(args.data) as Parameters<typeof CoachTools.createItem>[0]["data"], tagNames,
      }));
    case "createLink":
    case "deleteLink": {
      if (typeof args.fromId !== "string" || !args.fromId || typeof args.toId !== "string" || !args.toId) {
        return bad("fromId and toId are required");
      }
      const data = {
        fromId: args.fromId, toId: args.toId, type: args.type as string | undefined,
        note: args.note as string | undefined, revision: args.revision as number,
      };
      return toolResponse(await CoachTools[body.tool](data));
    }
  }
  return bad("Unknown tool");
}
