import { defineConfig, devices } from "@playwright/test";
const url = process.env.V1_TEST_DATABASE_URL;
if (!url)
  throw new Error(
    "V1_TEST_DATABASE_URL must identify a migrated, seeded disposable database",
  );
process.env.DATABASE_URL = url;
const secret =
  process.env.SESSION_SECRET ||
  "coach-local-test-secret-at-least-32-characters";
process.env.BEARING_V1_ENABLED = "true";
process.env.BEARING_COACH_MODEL = "fixture";
process.env.BEARING_COACH_OPENROUTER_URL = "http://127.0.0.1:5555/v1";
export default defineConfig({
  testDir: ".",
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:3000", timezoneId: "America/New_York" },
  projects: [
    { name: "setup", testMatch: /v1-workflow.setup.ts/ },
    ...["desktop", "phone"].map((name) => ({
      name,
      testMatch: /v1-coach.spec.ts/,
      dependencies: ["setup"],
      use: {
        ...devices[name === "phone" ? "iPhone 13" : "Desktop Chrome"],
        defaultBrowserType: "chromium" as const,
        storageState: "e2e/.auth/workflow.json",
      },
    })),
  ],
  webServer: [
    {
      command: "node e2e/scripts/coach-provider.mjs",
      port: 5555,
      reuseExistingServer: false,
    },
    {
      command: "npm run dev",
      url: "http://127.0.0.1:3000/login",
      reuseExistingServer: false,
      env: {
        SESSION_SECRET: secret,
        DATABASE_URL: url,
        BEARING_V1_ENABLED: "true",
        BEARING_COACH_PROVIDER: "openrouter",
        BEARING_COACH_MODEL: "fixture",
        OPENROUTER_API_KEY: "fixture-key",
        BEARING_COACH_OPENROUTER_URL: "http://127.0.0.1:5555/v1",
      },
    },
  ],
});
