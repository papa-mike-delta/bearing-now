import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

const detail = {
  tags: { include: { tag: true } },
  domain: true,
  project: true,
  linksFrom: { include: { to: { include: { domain: true, project: { select: { id: true, name: true, color: true } } } } } },
  linksTo: { include: { from: { include: { domain: true, project: { select: { id: true, name: true, color: true } } } } } },
  habitLogs: { orderBy: { date: "desc" as const }, take: 60 },
};

export async function listOpenItems(userId: string, client: Prisma.TransactionClient = db) {
  const leases = await client.setting.findMany({ where: {
    userId, id: { startsWith: `open-item:${userId}:` }, value: { gt: new Date().toISOString() },
  } });
  const ids = [...new Set(leases.map(({ id }) => Buffer.from(id.split(":")[2], "hex").toString()))];
  return client.item.findMany({ where: { userId, id: { in: ids } }, orderBy: { title: "asc" } });
}

export function getItem(id: string, userId: string, client: Prisma.TransactionClient = db) {
  return client.item.findFirst({ where: { id, userId }, include: detail });
}

export function searchItems(q: string, userId: string, client: Prisma.TransactionClient = db) {
  if (!q.trim()) return Promise.resolve([]);
  return client.item.findMany({
      where: { userId, OR: [{ title: { contains: q } }, { content: { contains: q } }] },
      take: 20,
      include: { domain: true, project: { select: { id: true, name: true, color: true } } },
      orderBy: { updatedAt: "desc" },
    });
}

export async function getLinks(id: string, userId: string, client: Prisma.TransactionClient = db) {
  const item = await client.item.findFirst({ where: { id, userId }, select: { id: true } });
  if (!item) return null;
  const owned = { from: { userId }, to: { userId } };
  const [linksFrom, linksTo] = await Promise.all([
    client.link.findMany({ where: { fromId: id, ...owned }, include: { to: { include: { domain: true, project: { select: { id: true, name: true, color: true } } } } } }),
    client.link.findMany({ where: { toId: id, ...owned }, include: { from: { include: { domain: true, project: { select: { id: true, name: true, color: true } } } } } }),
  ]);
  return {
    outgoing: linksFrom.map((l) => ({ ...l, to: l.to })),
    incoming: linksTo.map((l) => ({ ...l, from: l.from })),
  };
}

export async function getHabitLogs(itemId: string, userId: string, client: Prisma.TransactionClient = db) {
  const item = await client.item.findFirst({ where: { id: itemId, userId }, select: { id: true } });
  if (!item) return null;
  return client.habitLog.findMany({ where: { itemId, item: { userId } }, orderBy: { date: "desc" } });
}
