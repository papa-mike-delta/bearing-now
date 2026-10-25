import { test as setup, expect } from "@playwright/test";
setup("sign into the V1 workflow", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Fill demo credentials" }).click();
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/app\/today$/);
  await expect(
    page.getByRole("heading", { name: "Today", exact: true }),
  ).toBeVisible();
  await page.context().storageState({ path: "e2e/.auth/workflow.json" });
});
