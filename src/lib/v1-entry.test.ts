import { beforeEach, expect, it, vi } from "vitest";
import React from "react";
const { preferences } = vi.hoisted(() => ({ preferences: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "session" }) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/lib/session", () => ({
  verifySession: () => ({ userId: "alice", twoFactorVerified: true }),
}));
vi.mock("@/lib/v1/workflow", () => ({ Workflow: { preferences } }));
vi.mock("@/components/bearing/deployment/setup-required", () => ({
  SetupRequired: () => null,
}));
import AppPage from "@/app/app/page";
import { SetupRequired } from "@/components/bearing/deployment/setup-required";
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.unstubAllEnvs();
  preferences.mockReset();
});
it("disabled V1 shows setup without querying data or rendering the legacy shell", async () => {
  vi.stubEnv("BEARING_V1_ENABLED", "false");
  expect((await AppPage()).type).toBe(SetupRequired);
  expect(preferences).not.toHaveBeenCalled();
});
it("enabled V1 respects startup preference and opens a canonical route", async () => {
  vi.stubEnv("BEARING_V1_ENABLED", "true");
  preferences.mockResolvedValue({ startup: "journal" });
  await expect(AppPage()).rejects.toThrow("redirect:/app/journal");
});
it("database failure provides recovery guidance without exposing internal details", async () => {
  vi.stubEnv("BEARING_V1_ENABLED", "true");
  preferences.mockRejectedValue(new Error("private database diagnostic"));
  const result = await AppPage();
  expect(result.type).toBe(SetupRequired);
  expect(result.props).toEqual({ unavailable: true });
});
