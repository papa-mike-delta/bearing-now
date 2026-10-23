import { test as base, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { DatabaseSnapshot } from "./pages/DatabaseSnapshot";

export const test = base.extend<{ isolatedDatabase: void }>({
  isolatedDatabase: [async ({}, use, testInfo) => {
    const snapshot = new DatabaseSnapshot(testInfo.outputPath("baseline.dump"));
    await snapshot.save();
    loadEnvConfig(process.cwd());
    const db = new PrismaClient();
    try {
      // Each test starts with its own hourly create allowance. Restore the
      // original ledger along with all data after the browser context closes.
      const demo = await db.user.findUniqueOrThrow({ where: { email: "demo@gmail.com" } });
      await db.operationLedger.deleteMany({ where: { actor: `user:${demo.id}` } });
      await use();
    } finally {
      await db.$disconnect();
      await snapshot.restore();
    }
  }, { auto: true }],
});

export { expect };
