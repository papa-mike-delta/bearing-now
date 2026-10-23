import { test, expect } from "./fixtures";
import { AppPage } from "./pages/AppPage";
import { DOMAINS, ITEM_TYPES } from "../src/lib/constants";

for (const domain of DOMAINS) {
  test(`${domain.name} primary create action assigns its domain`, async ({ page }) => {
    const app = new AppPage(page);
    const title = AppPage.unique(domain.key);
    await app.goto();
    await app.navigate(domain.short);
    await expect(page.getByRole("main").locator('[aria-busy]')).toHaveAttribute("aria-busy", "false");
    await page.getByRole("main").getByRole("button").first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("input").first().fill(title);
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
    const item = await app.item(title);
    expect(item.domain.key).toBe(domain.key);
  });
}

for (const type of ITEM_TYPES) {
  test(`create ${type.name} using the item editor`, async ({ page }) => {
    const app = new AppPage(page);
    const title = AppPage.unique(type.type);
    await app.goto();
    await app.createItem(title, type.name);
    expect(await app.item(title)).toMatchObject({ type: type.type, title, status: "active" });
  });
}

test("calendar and agenda show a newly scheduled event", async ({ page }) => {
  const app = new AppPage(page);
  const title = AppPage.unique("calendar");
  await app.goto();
  await app.createItem(title, "Event");
  const item = await app.item(title);
  const scheduledAt = new Date();
  scheduledAt.setHours(12, 0, 0, 0);
  expect((await page.request.patch(`/api/items/${item.id}`, { data: { revision: item.revision, scheduledAt: scheduledAt.toISOString() } })).ok()).toBeTruthy();
  await app.navigate("Calendar");
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  await app.navigate("Agenda");
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
});

test("graph search and zoom controls", async ({ page }) => {
  const app = new AppPage(page);
  const title = AppPage.unique("graph");
  await app.goto();
  await app.createItem(title, "Note");
  await app.navigate("Brain Graph");
  await page.getByPlaceholder("Search nodes…").fill(title);
  await expect(page.getByText("1 match · non-matches dimmed", { exact: true })).toBeVisible();
  await page.getByTitle("Zoom in", { exact: true }).click();
  await expect(page.getByText("120%", { exact: true })).toBeVisible();
  await page.getByTitle("Reset view", { exact: true }).click();
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
});

test("scheduler rolls a past recurring finance due date forward", async ({ page }) => {
  const app = new AppPage(page);
  const title = AppPage.unique("recurring");
  await app.goto();
  await app.createItem(title, "Finance");
  const item = await app.item(title);
  const oldDue = new Date(Date.now() - 2 * 86400000).toISOString();
  expect((await page.request.patch(`/api/items/${item.id}`, { data: { revision: item.revision, dueDate: oldDue, metadata: { kind: "expense", amount: 17, recurring: "monthly" } } })).ok()).toBeTruthy();
  await app.navigate("Insights");
  const response = page.waitForResponse(r => r.url().endsWith("/api/scheduler") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Sync", exact: true }).click();
  expect((await response).status()).toBe(200);
  expect(new Date((await app.item(title)).dueDate).getTime()).toBeGreaterThan(Date.now());
});

test("dashboard add task creates a persisted task", async ({ page }) => {
  const app = new AppPage(page);
  const title = AppPage.unique("dashboard task");
  await app.goto();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input").first().fill(title);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(await app.item(title)).toMatchObject({ type: "task", title });
});

test("sanctuary breathing starts and stops", async ({ page }) => {
  const app = new AppPage(page);
  await app.goto();
  await page.keyboard.press("g");
  await page.keyboard.press("n");
  await expect(page.getByRole("heading", { name: "Sanctuary", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Begin breathing/i }).click();
  await page.getByRole("button", { name: /End session/i }).click();
  await expect(page.getByRole("button", { name: /Begin breathing/i })).toBeVisible();
});

test("journal publishes a new entry from sanctuary", async ({ page }) => {
  const app = new AppPage(page);
  const title = AppPage.unique("journal publish");
  await app.goto();
  await page.keyboard.press("g");
  await page.keyboard.press("n");
  await page.getByRole("button", { name: "Write journal", exact: true }).click();
  await page.getByPlaceholder("Give your entry a title…").fill(title);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mind & Soul", exact: true })).toBeVisible();
  expect(await app.item(title)).toMatchObject({ type: "journal", title });
});

test("scheduler resets an inactive habit streak", async ({ page }) => {
  const app = new AppPage(page);
  const title = AppPage.unique("stale streak");
  await app.goto();
  await app.createItem(title, "Habit");
  const item = await app.item(title);
  expect((await page.request.patch(`/api/items/${item.id}`, { data: { revision: item.revision, metadata: { streak: 7 } } })).ok()).toBeTruthy();
  expect((await page.request.post(`/api/items/${item.id}/habit-logs`, { data: { date: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10) } })).ok()).toBeTruthy();
  await app.navigate("Insights");
  const response = page.waitForResponse(r => r.url().endsWith("/api/scheduler") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Sync", exact: true }).click();
  expect((await response).status()).toBe(200);
  expect((await app.item(title)).metadata.streak).toBe(0);
});
