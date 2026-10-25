import { defineConfig, devices } from "@playwright/test";

const v1 = process.env.BEARING_V1_ENABLED === "true";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure", timezoneId: "America/New_York" },
  projects: [
    { name: "setup", testMatch: v1 ? /v1-workflow\.setup\.ts/ : /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: v1 ? "e2e/.auth/workflow.json" : "e2e/.auth/demo.json" },
      dependencies: ["setup"],
      testIgnore: [/auth\.setup\.ts/, /\.mobile\.spec\.ts/, ...(v1 ? [] : [/v1-.*\.spec\.ts/])],
      ...(v1 ? { testMatch: /v1-(workflow|foundations|connected)\.spec\.ts/ } : {}),
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"], storageState: v1 ? "e2e/.auth/workflow.json" : "e2e/.auth/demo.json" },
      dependencies: ["setup"],
      testMatch: v1 ? /v1-(workflow|foundations|connected)\.spec\.ts/ : /\.mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command: "npm run dev",
    env: { TZ: "America/New_York", COACH_TOOLS_ENABLED: "true", BEARING_V1_ENABLED: v1 ? "true" : "false" },
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
