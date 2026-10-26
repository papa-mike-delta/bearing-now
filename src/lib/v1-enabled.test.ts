import { afterEach, expect, it, vi } from "vitest";
import { v1Enabled } from "./v1-enabled";
afterEach(() => vi.unstubAllEnvs());
it("opens V1 in Vercel production despite an old disabled rollout flag", () => {
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("BEARING_V1_ENABLED", "false");
  expect(v1Enabled()).toBe(true);
});
it("keeps the flag available for isolated preview tests", () => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("BEARING_V1_ENABLED", "false");
  expect(v1Enabled()).toBe(false);
  vi.stubEnv("BEARING_V1_ENABLED", "true");
  expect(v1Enabled()).toBe(true);
});
