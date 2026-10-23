import { ItemDomain } from "@/lib/domain/item";
import { bad, domainResponse, parseBody } from "@/lib/api";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

async function setOpen(req: Request, ctx: { params: Promise<{ id: string }> }, open: boolean) {
  const session = await getUserFromRequest(req);
  if (!session) return bad("Unauthorized", 401);
  const { id } = await ctx.params;
  const { lease } = await parseBody<{ lease: string }>(req);
  return domainResponse(await ItemDomain.setOpen(id, lease, open, `user:${session.userId}`));
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return setOpen(req, ctx, true);
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return setOpen(req, ctx, false);
}
