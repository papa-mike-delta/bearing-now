import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure", timezoneId: "America/New_York" },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/demo.json" },
      dependencies: ["setup"],
      testIgnore: [/auth\.setup\.ts/, /\.mobile\.spec\.ts/],
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"], storageState: "e2e/.auth/demo.json" },
      dependencies: ["setup"],
      testMatch: /\.mobile\.spec\.ts/,
    },
  ],
  webServer: {
    command: "npm run dev",
    env: { TZ: "America/New_York", COACH_TOOLS_ENABLED: "true" },
    url: "http://localhost:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
