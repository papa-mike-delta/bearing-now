import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

function scoped<T extends { where?: object }>(args: T, owner: object): T {
  return { ...args, where: { AND: [args.where ?? {}, owner] } };
}

// The merged where clause hides include/select from Prisma's overloads, so the
// payload is stated from the caller's args.
function many<T extends { where?: object }, R>(args: T, owner: object, read: (args: T) => R): R {
  return read(scoped(args, owner));
}

// Root reads. Routes pass filters; the owner id is applied here.
export class Owned {
  static items<T extends Prisma.ItemFindManyArgs>(userId: string, args: T = {} as T) {
    return many(args, { userId }, (query) => db.item.findMany(query)) as Prisma.PrismaPromise<Prisma.ItemGetPayload<T>[]>;
  }

  static itemCount(userId: string, where: Prisma.ItemWhereInput = {}) {
    return db.item.count({ where: { AND: [where, { userId }] } });
  }

  static itemGroups(userId: string, by: "domainId" | "type", where: Prisma.ItemWhereInput = {}) {
    return db.item.groupBy({
      by: [by],
      where: { AND: [where, { userId }] },
      _count: true,
    });
  }

  static projects<T extends Prisma.ProjectFindManyArgs>(userId: string, args: T = {} as T) {
    return many(args, { userId }, (query) => db.project.findMany(query)) as Prisma.PrismaPromise<Prisma.ProjectGetPayload<T>[]>;
  }

  static projectCount(userId: string, where: Prisma.ProjectWhereInput = {}) {
    return db.project.count({ where: { AND: [where, { userId }] } });
  }

  static project(userId: string, id: string) {
    return db.project.findFirst({ where: { id, userId }, include: { domain: true } });
  }

  static domains(userId: string) {
    return db.domain.findMany({ where: { userId }, orderBy: { order: "asc" } });
  }

  static domain(userId: string, id: string) {
    return db.domain.findFirst({ where: { id, userId } });
  }

  static tags<T extends Prisma.TagFindManyArgs>(userId: string, args: T = {} as T) {
    return many(args, { userId }, (query) => db.tag.findMany(query)) as Prisma.PrismaPromise<Prisma.TagGetPayload<T>[]>;
  }

  static reviews<T extends Prisma.ReviewFindManyArgs>(userId: string, args: T = {} as T) {
    return many(args, { userId }, (query) => db.review.findMany(query)) as Prisma.PrismaPromise<Prisma.ReviewGetPayload<T>[]>;
  }

  static review(userId: string, id: string) {
    return db.review.findFirst({ where: { id, userId } });
  }

  static links<T extends Prisma.LinkFindManyArgs>(userId: string, args: T = {} as T) {
    return many(args, { from: { userId } }, (query) => db.link.findMany(query)) as Prisma.PrismaPromise<Prisma.LinkGetPayload<T>[]>;
  }

  static habitLogs<T extends Prisma.HabitLogFindManyArgs>(userId: string, args: T = {} as T) {
    return many(args, { item: { userId } }, (query) => db.habitLog.findMany(query)) as Prisma.PrismaPromise<Prisma.HabitLogGetPayload<T>[]>;
  }
}
