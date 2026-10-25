import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
if (!process.env.V1_TEST_DATABASE_URL)
  throw new Error("V1_TEST_DATABASE_URL must point to disposable PostgreSQL");
const url = new URL(process.env.V1_TEST_DATABASE_URL);
url.searchParams.set("schema", `v1_test_${randomUUID().replaceAll("-", "")}`);
process.env.DATABASE_URL = url.toString();
process.env.BEARING_V1_ENABLED = "true";
process.env.SESSION_SECRET = "v1-test-only-secret-at-least-32-characters";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["integration/v1/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
