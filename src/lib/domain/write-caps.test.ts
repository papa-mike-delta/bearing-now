import { expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { WriteCaps } from "./write-caps";

it.each(["item.create", "link.create"] as const)("exempts only user restores from %s caps", async (operation) => {
  const count = vi.fn().mockResolvedValue(50);
  const tx = { operationLedger: { count } } as unknown as Prisma.TransactionClient;
  expect(await WriteCaps.create(tx, "user:alice", "alice", operation, 100, "restore")).toBeNull();
  expect(count).not.toHaveBeenCalled();
  expect(await WriteCaps.create(tx, "agent:internal", "alice", operation, 100, "restore")).toMatchObject({ ok: false, rateLimited: true });
  expect(await WriteCaps.create(tx, "user:alice", "alice", operation)).toMatchObject({ ok: false, rateLimited: true });
  expect(count).toHaveBeenCalledWith({ where: expect.objectContaining({ userId: "alice", actor: "user:alice", operation: { in: [operation, `v1.${operation}`] } }) });
});
