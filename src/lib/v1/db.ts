import { PrismaClient } from "@bearing/v1-client";
const globalV1 = globalThis as unknown as { v1Db?: PrismaClient };
export const v1db = globalV1.v1Db ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalV1.v1Db = v1db;
