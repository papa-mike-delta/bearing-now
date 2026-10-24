import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import { AppPage } from "./pages/AppPage";
import { LoginPage } from "./pages/LoginPage";

test.use({ storageState: { cookies: [], origins: [] } });

test("one account cannot read or link another account's item", async ({ page, browser }) => {
  await page.addInitScript(() => localStorage.setItem("lifeos-onboarded", "true"));
  await new LoginPage(page).login();
  const created = await page.request.post("/api/items", {
    data: { title: AppPage.unique("private"), type: "note" },
  });
  expect(created.ok()).toBeTruthy();
  const item = await created.json();

  const context = await browser.newContext();
  const other = await context.newPage();
  await other.addInitScript(() => localStorage.setItem("lifeos-onboarded", "true"));
  await other.goto("/login");
  await other.getByRole("button", { name: "Fill demo credentials" }).click();
  await expect(other.locator('input[type="email"]')).toHaveValue("demo@gmail.com");
  await other.getByRole("button", { name: "Create account", exact: true }).click();
  await other.getByPlaceholder("Your name").fill(AppPage.unique("other"));
  await other.locator('input[type="email"]').fill(`e2e-${randomUUID()}@example.com`);
  await other.locator('input[type="password"]').fill("Password123");
  await other.locator('form button[type="submit"]').click();
  await expect(other).toHaveURL(/\/app$/);

  const list = await (await other.request.get("/api/items")).json();
  expect(list.items.map((row: { id: string }) => row.id)).not.toContain(item.id);
  expect((await other.request.get(`/api/items/${item.id}`)).status()).toBe(404);

  const ownResponse = await other.request.post("/api/items", {
    data: { title: AppPage.unique("own"), type: "note" },
  });
  expect(ownResponse.ok()).toBeTruthy();
  const own = await ownResponse.json();
  const link = await other.request.post(`/api/items/${own.id}/links`, {
    data: { toId: item.id, type: "related_to", revision: own.revision },
  });
  expect(link.ok()).toBeFalsy();
  expect((await link.json()).error).toBe("Not found");

  expect((await page.request.get(`/api/items/${item.id}`)).status()).toBe(200);
  await context.close();
});
