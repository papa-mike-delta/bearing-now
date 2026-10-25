import { test, expect } from "./fixtures";
import { InboxPage } from "./pages/InboxPage";
import type { Page } from "@playwright/test";

async function importTheme(page: Page, app: InboxPage, input: object | null) {
  await app.navigate("Settings");
  if (input) {
    await page.getByLabel("Import theme", { exact: true }).fill(JSON.stringify(input));
    await page.getByRole("button", { name: "Import theme", exact: true }).click();
    await expect(page.getByText("Theme imported", { exact: true })).toBeVisible();
  } else {
    await page.getByRole("button", { name: "Reset imported theme", exact: true }).click();
    await expect(page.getByText("Imported theme reset", { exact: true })).toBeVisible();
  }
}
async function resolvedColor(page: Page, name: string) {
  return page.evaluate((name) => {
    const span = document.createElement("span");
    span.style.color = `var(--${name})`; document.body.append(span);
    const color = getComputedStyle(span).color; span.remove(); return color;
  }, name);
}
async function screenshot(page: Page, path: string) {
  // Framer Motion uses inline opacity; CSS sheet animations can be fast-forwarded.
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('main [style*="opacity"]')].every((el) => !el.style.opacity || Number(el.style.opacity) === 1));
  await page.screenshot({ path, animations: "disabled" });
}
const palette = {
  light: { primary: "hsl(265 65% 40%)", "chart-1": "hsl(180 70% 35%)", "chart-2": "oklch(0.5 0.15 150)", "chart-3": "hsl(220 70% 40%)", "chart-4": "hsl(40 80% 35%)", "chart-5": "oklch(0.5 0.15 310)" },
  dark: { primary: "hsl(265 65% 75%)", "chart-1": "hsl(180 70% 65%)", "chart-2": "oklch(0.8 0.15 150)", "chart-3": "hsl(220 70% 75%)", "chart-4": "hsl(40 80% 65%)", "chart-5": "oklch(0.8 0.15 310)" },
};

test("project create/edit persists inherited and explicit colors across reload and theme import", async ({ page }) => {
  const app = new InboxPage(page); await app.goto(); await app.navigate("Projects");
  await page.getByRole("button", { name: "New", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Use theme default" })).toHaveAttribute("aria-pressed", "true");
  const name = InboxPage.unique("theme project"); await dialog.getByLabel("Name", { exact: true }).fill(name);
  const created = page.waitForResponse((r) => r.url().endsWith("/api/projects") && r.request().method() === "POST");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  const project = await (await created).json(); expect(project.color).toBeNull();
  await expect(dialog).toBeHidden(); await page.getByRole("button").filter({ has: page.getByRole("heading", { name, exact: true }) }).click();
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  await dialog.getByRole("button", { name: "Project color #ec4899", exact: true }).click();
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(dialog).toBeHidden();
  await app.reload(); await importTheme(page, app, palette);
  expect(await (await page.request.get(`/api/projects/${project.id}`)).json()).toMatchObject({ project: { color: "#ec4899" } });
  await app.navigate("Projects"); await page.getByRole("button").filter({ has: page.getByRole("heading", { name, exact: true }) }).click();
  await page.getByRole("button", { name: "Edit project", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Project color #ec4899", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Use theme default" }).click();
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(dialog).toBeHidden();
  await app.reload();
  expect(await (await page.request.get(`/api/projects/${project.id}`)).json()).toMatchObject({ project: { color: null } });
});

for (const mode of ["light", "dark"] as const) {
  test(`${mode}: default/import/reset semantics render on projects, agenda, detail and mood`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const app = new InboxPage(page); await app.goto();
    await page.evaluate((mode) => localStorage.setItem("theme", mode), mode); await app.reload();
    await expect(page.locator("html")).toHaveClass(mode === "dark" ? /dark/ : /light/);
    const { domains } = await (await page.request.get("/api/domains")).json();
    const health = domains.find((d: { key: string }) => d.key === "health");
    const inherited = await (await page.request.post("/api/projects", { data: { name: InboxPage.unique("inherited"), domainId: health.id } })).json();
    const item = await app.seed({ title: InboxPage.unique("themed task"), type: "task", projectId: inherited.id, status: "active", dueDate: new Date().toISOString(), priority: 4 });
    await app.reload();
    const baseline = await resolvedColor(page, "type-task");
    for (const stage of ["default", "imported", "reset"] as const) {
      if (stage === "imported") await importTheme(page, app, palette);
      if (stage === "reset") await importTheme(page, app, null);
      const color = await resolvedColor(page, "type-task");
      if (stage === "imported") expect(color).not.toBe(baseline); else expect(color).toBe(baseline);
      await app.navigate("Projects");
      const card = page.getByRole("button").filter({ has: page.getByRole("heading", { name: inherited.name, exact: true }) });
      await expect(card).toBeVisible();
      expect(await card.locator('[style*="color:"]').first().evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
      const contrast = await card.locator("span.font-semibold").last().evaluate((el) => {
        const context = document.createElement("canvas").getContext("2d")!;
        const rgba = (value: string) => { context.clearRect(0, 0, 1, 1); context.fillStyle = value; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data]; };
        const blend = (fg: number[], bg: number[]) => fg.slice(0, 3).map((v, i) => v * fg[3] / 255 + bg[i] * (1 - fg[3] / 255));
        const ancestors: Element[] = []; for (let node: Element | null = el; node; node = node.parentElement) ancestors.unshift(node);
        let bg = [255, 255, 255]; for (const node of ancestors) bg = blend(rgba(getComputedStyle(node).backgroundColor), bg);
        const fg = blend(rgba(getComputedStyle(el).color), bg);
        const luminance = (rgb: number[]) => rgb.map((c) => c / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
        const [a, b] = [luminance(fg), luminance(bg)].sort((a, b) => b - a); return (a + .05) / (b + .05);
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
      if (stage === "imported") await screenshot(page, testInfo.outputPath(`${mode}-projects.png`));
      await app.navigate("Agenda");
      await expect(page.getByText(item.title, { exact: true })).toBeVisible();
      await page.getByText(item.title, { exact: true }).click();
      const detail = page.getByRole("dialog"); await expect(detail.getByRole("heading", { name: item.title, exact: true })).toBeVisible();
      const gradient = await detail.locator('[style*="linear-gradient"]').first().evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(gradient).toContain("gradient");
      if (stage === "imported") await screenshot(page, testInfo.outputPath(`${mode}-detail.png`));
      await page.keyboard.press("Escape");
      await app.navigate("Insights");
      const chart = page.locator(".recharts-line-curve").first();
      await expect(page.locator(".recharts-wrapper").first()).toBeVisible();
      await expect(chart).toHaveAttribute("stroke", "var(--mood-series)");
      expect(await chart.evaluate((el) => (el as SVGPathElement).getTotalLength())).toBeGreaterThan(0);
      expect(await chart.evaluate((el) => getComputedStyle(el).stroke)).not.toBe("none");
      if (stage === "imported") {
        await expect.poll(async () => { const dash = await chart.getAttribute("stroke-dasharray"); return dash === null || dash.endsWith(" 0px"); }).toBe(true);
        await screenshot(page, testInfo.outputPath(`${mode}-charts.png`));
      }
      await app.navigate("Dashboard");
      await expect(page.getByRole("heading", { name: "Today's focus", exact: true })).toBeVisible();
      // A stored reflection may already cover today in the browser timezone.
      await expect(page.getByText(/^Mood(?:$| (?:Low|Meh|Okay|Good|Great) · Energy)/).first()).toBeVisible();
      if (stage === "imported") {
        await page.getByText(/^Mood(?:$| (?:Low|Meh|Okay|Good|Great) · Energy)/).first().scrollIntoViewIfNeeded();
        await screenshot(page, testInfo.outputPath(`${mode}-mood.png`));
      }
    }
    // Explicit semantic values override the derived palette without affecting stored colors.
    await importTheme(page, app, { light: { "type-task": "hsl(12 70% 35%)" }, dark: { "type-task": "hsl(12 70% 75%)" } });
    expect(await resolvedColor(page, "type-task")).toBe(mode === "light" ? "rgb(152, 52, 27)" : "rgb(236, 164, 147)");
  });
}
