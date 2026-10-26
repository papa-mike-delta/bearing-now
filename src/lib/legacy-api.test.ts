import { expect, it } from "vitest";
import { LegacyApi } from "./legacy-api";

it("retires pre-V1 content routes and keeps theme, receipts, auth and V1", () => {
  for (const path of [
    "/api/items",
    "/api/items/abc/open",
    "/api/coach",
    "/api/seed",
    "/api/projects/p1",
    "/api/preferences",
    "/api/ai/smart-inbox",
  ]) {
    expect(LegacyApi.matches(path)).toBe(true);
  }
  for (const path of [
    "/api/preferences/theme",
    "/api/receipts/receipt-1",
    "/api/auth/login",
    "/api/v1/items",
    "/api/v1/coach/chat",
    "/app/today",
  ]) {
    expect(LegacyApi.matches(path)).toBe(false);
  }
});

it("names the removal date, the table-drop date and the V1 replacement", async () => {
  const response = LegacyApi.response();
  expect(response.status).toBe(410);
  const body = await response.json();
  expect(body.error).toContain(LegacyApi.removedOn);
  expect(body.error).toContain(LegacyApi.dropTablesOn);
  expect(body.error).toContain("/api/v1");
  expect(body.error).toContain("no Item to V1Item conversion");
});
