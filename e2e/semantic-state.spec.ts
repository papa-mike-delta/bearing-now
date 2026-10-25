import { test, expect } from "./fixtures";
import { InboxPage } from "./pages/InboxPage";

async function navigate(page: import("@playwright/test").Page, name: string) {
  if (await page.getByRole("button", { name: "Open menu", exact: true }).isVisible()) {
    await page.getByRole("button", { name: "Open menu", exact: true }).tap();
    await page.getByRole("dialog", { name: "Navigation" }).getByRole("button", { name: new RegExp(`^${name}(?: \\d+)?$`) }).tap();
  } else await page.locator("aside").getByRole("button", { name: new RegExp(`^${name}(?: \\d+)?$`) }).click();
}
async function grayscale(page: import("@playwright/test").Page) {
  await page.addStyleTag({ content: "html { filter: grayscale(1); }" });
}

test("mood and energy announce names, values and pressed state with keyboard selection", async ({ page }, testInfo) => {
  await page.route("**/api/reviews?type=daily", (route) => route.fulfill({ json: { reviews: [] } }));
  const app = new InboxPage(page); await app.goto();
  const mood = page.getByRole("group", { name: "Mood", exact: true });
  const energy = page.getByRole("group", { name: "Energy", exact: true });
  await expect(mood.getByRole("button", { name: "Mood: Okay, 3 of 5" })).toHaveAttribute("aria-pressed", "false");
  await mood.getByRole("button", { name: "Mood: Great, 5 of 5" }).click();
  await energy.getByRole("button", { name: "Energy: Low, 2 of 5" }).focus(); await page.keyboard.press("Space");
  await expect(mood.getByRole("button", { name: "Mood: Great, 5 of 5" })).toHaveAttribute("aria-pressed", "true");
  await expect(energy.getByRole("button", { name: "Energy: Low, 2 of 5" })).toHaveAttribute("aria-pressed", "true");
  await grayscale(page);
  await mood.scrollIntoViewIfNeeded(); await page.screenshot({ path: testInfo.outputPath("grayscale-check-in.png"), animations: "disabled" });
  await page.emulateMedia({ forcedColors: "active" });
  await expect(energy.getByRole("button", { name: "Energy: Low, 2 of 5" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("forced-colors-check-in.png"), animations: "disabled" });
  const saved = page.waitForRequest((r) => r.url().endsWith("/api/reviews") && r.method() === "POST");
  await page.getByRole("button", { name: "Save check-in", exact: true }).click();
  expect((await saved).postDataJSON()).toMatchObject({ mood: 5, energy: 2 });
  await expect(page.getByText("Thanks for checking in", { exact: true })).toBeVisible();
  await page.keyboard.press("Control+p"); await page.getByRole("option", { name: /Write journal entry/ }).click();
  await expect(page.getByRole("group", { name: "Mood", exact: true }).getByRole("button", { name: "Mood: Okay, 3 of 5" })).toHaveAttribute("aria-pressed", "true");
});

test("Item states and finance kinds remain explicit under a monochrome imported theme", async ({ page }, testInfo) => {
  const app = new InboxPage(page); await app.goto();
  const titles: Record<string, string> = {};
  for (const status of ["inbox", "active", "done", "archived", "snoozed"]) {
    titles[status] = InboxPage.unique(status); await app.seed({ title: titles[status], type: "task", status, priority: 4 });
  }
  for (const kind of ["income", "expense", "goal"]) { titles[kind] = InboxPage.unique(kind); await app.seed({ title: titles[kind], type: "finance", status: "active", metadata: { kind, amount: 100 } }); }
  const tokens = Object.fromEntries(["status-inbox", "status-active", "status-done", "status-archived", "status-snoozed", "priority-urgent", "income", "expense", "type-goal"].map((key) => [key, "hsl(0 0% 50%)"]));
  expect((await page.request.post("/api/preferences/theme", { data: { input: JSON.stringify({ light: tokens, dark: tokens }) } })).ok()).toBeTruthy();
  await app.reload(); await navigate(page, "All Items"); await page.locator("main").getByRole("button", { name: /^all$/i }).click();
  const card = (title: string) => page.getByRole("button", { name: title, exact: true }).locator('xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," group ")][1]');
  for (const status of ["inbox", "active", "done", "archived", "snoozed"]) {
    await expect(card(titles[status]).getByText(status[0].toUpperCase() + status.slice(1), { exact: true })).toBeVisible();
    await expect(card(titles[status]).getByText("Priority Urgent", { exact: true })).toBeVisible();
  }
  await expect(card(titles.income).getByText("Income +$100", { exact: true })).toBeVisible();
  await expect(card(titles.expense).getByText("Expense −$100", { exact: true })).toBeVisible();
  await expect(card(titles.goal).getByText("Savings goal $100", { exact: true })).toBeVisible();
  await expect(card(titles.done).getByRole("button", { name: `Reopen ${titles.done}`, exact: true })).toHaveAttribute("aria-pressed", "true");
  await grayscale(page); await page.screenshot({ path: testInfo.outputPath("grayscale-states.png"), animations: "disabled" });
});

test("charts expose data tables and reflection sliders expose keyboard-readable values", async ({ page }, testInfo) => {
  const app = new InboxPage(page); await app.goto();
  const data = await (await page.request.get("/api/insights")).json();
  await navigate(page, "Insights");
  await page.getByText("Mood and energy data", { exact: true }).click();
  const moodTable = page.getByRole("table", { name: "Mood and energy", exact: true });
  await expect(moodTable.getByRole("row")).toHaveCount(data.moodTrend.length + 1);
  await page.getByText("Activity data", { exact: true }).click();
  await expect(page.getByRole("table", { name: "Activity", exact: true }).getByRole("row")).toHaveCount(31);
  await page.getByText("Habit consistency data", { exact: true }).click();
  await expect(page.getByRole("table", { name: "Habit consistency", exact: true }).getByRole("row")).toHaveCount(data.habitMatrix.reduce((sum: number, h: { days: unknown[] }) => sum + h.days.length, 1));
  await expect(moodTable).toContainText("Good, 4 of 5");
  await expect(page.getByRole("table", { name: "Habit consistency", exact: true }).getByRole("cell", { name: "Not done", exact: true }).first()).toBeVisible();
  await page.getByRole("heading", { name: "Mood & Energy trend", exact: true }).scrollIntoViewIfNeeded();
  const energyLine = page.locator('path.recharts-line-curve[stroke="var(--energy-series)"]');
  // Recharts expands the dash pattern while drawing and retains that form afterward.
  await expect.poll(async () => {
    const dash = await energyLine.getAttribute("stroke-dasharray") ?? "";
    return dash === "4 3" || (dash.startsWith("4px, 3px,") && dash.endsWith("0px, 0px"));
  }).toBe(true);
  await grayscale(page); await page.screenshot({ path: testInfo.outputPath("grayscale-charts.png"), animations: "disabled" });
  await page.emulateMedia({ forcedColors: "active" }); await page.screenshot({ path: testInfo.outputPath("forced-colors-data.png"), animations: "disabled" });
  await navigate(page, "Reviews");
  await page.getByRole("button", { name: /New reflection|Write reflection|Reflect/ }).first().click();
  const mood = page.getByRole("slider", { name: "Mood", exact: true });
  await expect(mood).toHaveAttribute("aria-valuetext", "Okay, 3 of 5");
  if (page.viewportSize()!.width < 768) { const bounds = (await mood.boundingBox())!; expect(bounds.width).toBeGreaterThanOrEqual(44); expect(bounds.height).toBeGreaterThanOrEqual(44); }
  await mood.focus(); await page.keyboard.press("ArrowRight");
  await expect(mood).toHaveAttribute("aria-valuenow", "4");
  await expect(mood).toHaveAttribute("aria-valuetext", "Good, 4 of 5");
  await expect(page.getByRole("slider", { name: "Energy", exact: true })).toHaveAttribute("aria-valuetext", "Steady, 3 of 5");
});
