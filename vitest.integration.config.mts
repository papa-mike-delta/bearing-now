import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

if (!process.env.RESTORE_TEST_DATABASE_URL) {
  throw new Error("Set RESTORE_TEST_DATABASE_URL to a disposable PostgreSQL database");
}
// Never replace existing application data: each run migrates its own schema.
const url = new URL(process.env.RESTORE_TEST_DATABASE_URL);
url.searchParams.set("schema", `restore_test_${randomUUID().replaceAll("-", "")}`);
process.env.DATABASE_URL = url.toString();

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["integration/**/*.test.ts"],
    exclude: ["integration/v1/**"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
