import { test, expect } from "./fixtures";
import { AppPage } from "./pages/AppPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { LoginPage } from "./pages/LoginPage";

const navigation = [
  ["Dashboard", ""], ["Inbox", "Inbox"], ["Calendar", "Master Calendar"],
  ["Agenda", "Weekly Agenda"], ["Focus", "Focus & Deep Work"],
  ["Projects", "Projects & Threads"], ["Brain Graph", "Digital Brain"],
  ["Reviews", "Reviews & Reflections"], ["Insights", "Insights"], ["All Items", "All Items"],
  ["Mind", "Mind & Soul"], ["Action", "Time & Action"], ["Health", "Health & Body"],
  ["Wealth", "Wealth & Career"], ["Network", "Network"], ["Growth", "Growth"],
  ["Joy", "Creativity & Joy"], ["Admin", "Admin"], ["Settings", "Settings"],
];
for (const [name, heading] of navigation) {
  test(`navigate to ${name}`, async ({ page }) => {
    const app = new AppPage(page);
    await app.goto();
    await app.navigate(name);
    if (heading) await expect(page.getByRole("main").getByRole("heading", { name: heading, exact: true })).toBeVisible();
    else await expect(page.getByText("Today's focus", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/app$/);
  });
}

test("logout revokes session and demo form logs in again", async ({ page }) => {
  const app = new AppPage(page);
  await app.goto();
  await page.locator("aside").getByRole("button", { name: /Sign out/ }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await (await page.request.get("/api/auth/session")).json()).toMatchObject({ authenticated: false });
  await new LoginPage(page).login();
});

test("items create, search, complete and reopen", async ({ page }) => {
  const app = new AppPage(page);
  const title = AppPage.unique("task");
  await app.goto();
  await app.createItem(title);
  await page.getByPlaceholder("Search title or content…").fill(title);
  const card = page.getByRole("heading", { name: title, exact: true }).locator('xpath=ancestor::div[button or div/button[@aria-label="toggle complete"]][1]');
  await card.getByRole("button", { name: "toggle complete" }).click();
  await expect(page.getByText(title, { exact: true })).toBeHidden();
  await page.getByRole("main").getByRole("button", { name: "done", exact: true }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "toggle complete" }).click();
  await expect(page.getByText(title, { exact: true })).toBeHidden();
  expect(await app.item(title)).toMatchObject({ status: "active" });
});

test("project create and add an associated task", async ({ page }) => {
  const projects = new ProjectsPage(page);
  const name = AppPage.unique("project");
  const title = AppPage.unique("project task");
  await projects.goto();
  await projects.create(name);
  await projects.addItem(title);
  const item = await projects.item(title);
  const response = await page.request.get(`/api/projects/${item.projectId}`);
  expect(await response.json()).toMatchObject({ project: { name }, items: expect.arrayContaining([expect.objectContaining({ title })]) });
});

test("connections add, persist and remove", async ({ page }) => {
  const app = new AppPage(page);
  const from = AppPage.unique("source");
  const to = AppPage.unique("target");
  await app.goto();
  await app.createItem(to, "Note");
  await app.createItem(from, "Note");
  await page.getByText(from, { exact: true }).click();
  await page.getByPlaceholder("Search to connect…").fill(to);
  await page.getByRole("button", { name: to, exact: true }).click();
  await expect(page.getByTitle("Remove connection")).toHaveCount(1);
  const item = await app.item(from);
  const detail = await (await page.request.get(`/api/items/${item.id}`)).json();
  expect(detail.linksFrom).toEqual([expect.objectContaining({ to: expect.objectContaining({ title: to }) })]);
  await page.getByTitle("Remove connection").click();
  await expect(page.getByTitle("Remove connection")).toHaveCount(0);
  const removed = await (await page.request.get(`/api/items/${item.id}`)).json();
  expect(removed.linksFrom).toEqual([]);
});

test("settings profile persists after reload", async ({ page }) => {
  const settings = new SettingsPage(page);
  const name = AppPage.unique("profile");
  await settings.goto();
  await settings.open();
  await page.getByRole("main").locator("input").first().fill(name);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile updated", { exact: true })).toBeVisible();
  // Exercise the real response ordering that triggers the race. Neither API
  // response is mocked: preferences is delivered after the profile response.
  const profileLoaded = page.waitForResponse(response => response.url().endsWith("/api/auth/2fa-status"));
  await page.route("**/api/preferences", async route => {
    const response = await route.fetch();
    await profileLoaded;
    await route.fulfill({ response });
  });
  await settings.reload();
  await settings.open();
  // BUG: saved profile name disappears on reload — see e2e/README.md#findings
  test.fail();
  await expect(page.getByRole("main").locator("input").first()).toHaveValue(name);
});

test("backup JSON includes newly created data", async ({ page }) => {
  const settings = new SettingsPage(page);
  const title = AppPage.unique("backup");
  await settings.goto();
  await settings.createItem(title, "Note");
  await settings.open();
  const backup = await settings.backup();
  expect(backup).toMatchObject({ version: 1, items: expect.arrayContaining([expect.objectContaining({ title })]) });
});

test("invalid backup is rejected without deleting existing data", async ({ page }) => {
  const settings = new SettingsPage(page);
  const title = AppPage.unique("invalid backup survivor");
  await settings.goto();
  await settings.createItem(title, "Note");
  await settings.open();
  expect((await settings.restore({ invalid: true })).status()).toBe(400);
  expect(await settings.item(title)).toMatchObject({ title });
});

test("focus start, pause and reset", async ({ page }) => {
  const app = new AppPage(page);
  await app.goto();
  await app.navigate("Focus");
  await page.getByRole("button", { name: "Short Break", exact: true }).click();
  await expect(page.getByText("05:00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByText("04:59", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByText("05:00", { exact: true })).toBeVisible();
});

for (const type of ["Daily", "Weekly"]) {
  test(`${type} review saves unique reflection`, async ({ page }) => {
    const app = new AppPage(page);
    const wins = AppPage.unique("reflection");
    await app.goto();
    await app.navigate("Reviews");
    await page.getByRole("tab", { name: type, exact: true }).click();
    await page.getByRole("button", { name: "New reflection" }).click();
    await page.getByPlaceholder("Even small wins count…").fill(wins);
    await page.getByRole("button", { name: "Save reflection" }).click();
    const response = await page.request.get("/api/reviews");
    expect((await response.json()).reviews).toEqual(expect.arrayContaining([expect.objectContaining({ wins, type: type.toLowerCase() })]));
  });
}

test("settings AI preference persists and theme switches", async ({ page }) => {
  const settings = new SettingsPage(page);
  await settings.goto();
  await settings.open();
  const toggle = page.getByText("Enable AI features", { exact: true }).locator('xpath=ancestor::div[contains(@class,"justify-between")][1]').getByRole("switch");
  const checked = await toggle.getAttribute("aria-checked");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", checked === "true" ? "false" : "true");
  await settings.reload();
  await settings.open();
  await expect(toggle).toHaveAttribute("aria-checked", checked === "true" ? "false" : "true");
  const before = await page.locator("html").getAttribute("class");
  await page.getByRole("button", { name: /Switch to .* theme/ }).click();
  await expect(page.locator("html")).not.toHaveAttribute("class", before!);
});

test("global search opens its own item", async ({ page }) => {
  const app = new AppPage(page);
  const title = AppPage.unique("global search");
  await app.goto();
  await app.createItem(title, "Note");
  await page.getByPlaceholder("Search your brain…").fill(title);
  await page.getByRole("dialog").getByRole("button", { name: title, exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: title, exact: true })).toBeVisible();
});

test("command palette navigates to sanctuary", async ({ page }) => {
  const app = new AppPage(page);
  await app.goto();
  await page.keyboard.press("Control+p");
  await page.getByRole("option", { name: /Sanctuary/ }).click();
  await expect(page.getByRole("heading", { name: "Sanctuary", exact: true })).toBeVisible();
});

test("settings 2FA setup can be opened and cancelled", async ({ page }) => {
  const settings = new SettingsPage(page);
  await settings.goto();
  await settings.open();
  const toggle = page.getByText("Two-factor authentication", { exact: true }).locator('xpath=ancestor::div[contains(@class,"justify-between")][1]').getByRole("switch");
  await toggle.click();
  await expect(page.getByRole("heading", { name: "Set up 2FA", exact: true })).toBeVisible();
  await expect(page.getByAltText("2FA QR")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Set up 2FA", exact: true })).toBeHidden();
});

test("settings generates a QR login for another device", async ({ page }) => {
  const settings = new SettingsPage(page);
  await settings.goto();
  await settings.open();
  await page.getByRole("button", { name: /Generate QR/ }).click();
  await expect(page.locator('img[alt*="QR"]')).toBeVisible();
});

test("habit detail logs and unlogs today", async ({ page }) => {
  const app = new AppPage(page);
  const title = AppPage.unique("habit log");
  await app.goto();
  await app.createItem(title, "Habit");
  await page.getByText(title, { exact: true }).click();
  const logged = page.waitForResponse(response => response.url().includes("/habit-logs") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Mark today", exact: true }).click();
  expect((await logged).status()).toBe(200);
  const item = await app.item(title);
  expect((await (await page.request.get(`/api/items/${item.id}/habit-logs`)).json()).logs).toHaveLength(1);
  // BUG: habit log normalizes the date to the previous day — see e2e/README.md#findings
  test.fail();
  await expect(page.getByRole("button", { name: "Done today", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Done today", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mark today", exact: true })).toBeVisible();
  expect((await (await page.request.get(`/api/items/${item.id}/habit-logs`)).json()).logs).toHaveLength(0);
});

test("settings exports CSV with newly created item", async ({ page }) => {
  const settings = new SettingsPage(page);
  const title = AppPage.unique("CSV export");
  await settings.goto();
  await settings.createItem(title, "Note");
  await settings.open();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.csv$/);
  const { readFile } = await import("node:fs/promises");
  expect(await readFile((await file.path())!, "utf8")).toContain(title);
});

test("settings reset clears data and preserves the login", async ({ page }) => {
  const settings = new SettingsPage(page);
  const title = AppPage.unique("reset");
  await settings.goto();
  await settings.createItem(title, "Note");
  await settings.open();
  await page.getByRole("button", { name: "Reset database", exact: true }).click();
  const response = page.waitForResponse(r => r.url().endsWith("/api/reset-db"));
  await page.getByRole("button", { name: "Reset everything", exact: true }).click();
  expect((await response).status()).toBe(200);
  expect((await (await page.request.get("/api/items")).json()).items).toEqual([]);
  expect((await (await page.request.get("/api/auth/session")).json()).authenticated).toBe(true);
});
