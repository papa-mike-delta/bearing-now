import { PrismaClient } from '@prisma/client'

// Live callers use User, Setting and OperationLedger. Legacy content models
// stay in prisma/schema.prisma until the 2027-01-26 drop (ADR 0005).
// Do not query them from product code. There is no Item to V1Item conversion.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error', 'warn'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db