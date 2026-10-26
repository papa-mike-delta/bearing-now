import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures";
import { LoginPage } from "./pages/LoginPage";

test.use({ storageState: { cookies: [], origins: [] } });

test("unauthenticated app navigation goes to login", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login$/);
});

test("login rejects an incorrect password", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill("demo@gmail.com");
  await page.locator('input[type="password"]').fill("Password123");
  await expect(page.locator('input[type="email"]')).toHaveValue("demo@gmail.com");
  await page.locator('input[type="password"]').fill("IncorrectPassword123");
  await page.locator('form button[type="submit"]').click();
  await expect(page.getByText(/Invalid email or password/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("register a unique account through the real form", async ({ page }) => {
  const name = `E2E registration ${randomUUID()}`;
  await page.goto("/login");
  await page.addInitScript(() => localStorage.setItem("lifeos-onboarded", "true"));
  // Use only the account provisioned in the disposable test fixture.
  await page.locator('input[type="email"]').fill("demo@gmail.com");
  await page.locator('input[type="password"]').fill("Password123");
  await expect(page.locator('input[type="email"]')).toHaveValue("demo@gmail.com");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByPlaceholder("Your name").fill(name);
  await page.locator('input[type="email"]').fill(`e2e-${Date.now()}@example.com`);
  await page.locator('input[type="password"]').fill("Password123");
  await page.locator('form button[type="submit"]').click();
  await expect(page).toHaveURL(/\/app$/);
});

test("demo login form authenticates", async ({ page }) => {
  await new LoginPage(page).login();
  expect(await (await page.request.get("/api/auth/session")).json()).toMatchObject({ authenticated: true });
});

test("a forged session cookie still sees the landing and login pages", async ({ page, context }) => {
  await context.addCookies([{ name: "lifeos-session", value: "forged", url: "http://localhost:3000" }]);
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/login$/);
});

test("going back after signing in from the landing page stays in the app", async ({ page }) => {
  await page.goto("/");
  await new LoginPage(page).login();
  await page.goBack();
  await expect(page).toHaveURL(/\/app$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/app$/);
});
