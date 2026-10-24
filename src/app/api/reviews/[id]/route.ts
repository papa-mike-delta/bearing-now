import { db } from "@/lib/db";
import { Owned } from "@/lib/domain/owned";
import { ok, notFound, parseBody, sessionUser } from "@/lib/api";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!await Owned.review(session.userId, id)) return notFound();
  const body = await parseBody(req);
  const { priorities, userId: _userId, ...rest } = body;
  const review = await db.review.update({
    where: { id },
    data: {
      ...rest,
      ...(priorities !== undefined
        ? { priorities: typeof priorities === "string" ? priorities : JSON.stringify(priorities) }
        : {}),
    },
  });
  return ok(review);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await sessionUser(req);
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!await Owned.review(session.userId, id)) return notFound();
  await db.review.delete({ where: { id } }).catch(() => {});
  return ok({ deleted: true });
}
