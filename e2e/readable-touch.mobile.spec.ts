import { test, expect } from "./fixtures";
import { InboxPage } from "./pages/InboxPage";
import type { Page, Locator } from "@playwright/test";

async function navigate(page: Page, name: string) {
  if (await page.getByRole("button", { name: "Open menu", exact: true }).isVisible()) {
    await page.getByRole("button", { name: "Open menu", exact: true }).tap();
    await page.getByRole("dialog", { name: "Navigation" }).getByRole("button", { name: new RegExp(`^${name}(?: \\d+)?$`) }).tap();
  } else await page.locator("aside").getByRole("button", { name: new RegExp(`^${name}(?: \\d+)?$`) }).click();
}
async function settled(page: Page) {
  await expect(page.locator("main .skeleton")).toHaveCount(0);
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLElement>('main [style*="opacity"]')].every((el) => !el.style.opacity || Number(el.style.opacity) === 1 || getComputedStyle(el).visibility === "hidden"));
}
async function audit(scope: Locator) {
  await scope.evaluate(async (root) => { for (const animation of root.getAnimations({ subtree: true })) { if (animation.effect?.getComputedTiming().iterations !== Infinity) { try { animation.finish(); } catch {} } } });
  const findings = await scope.evaluate((root) => {
    const visible = (el: Element) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 1 && r.height > 1 && s.display !== "none" && s.visibility !== "hidden" && !el.closest('[aria-hidden="true"], .sr-only'); };
    const controls = [...root.querySelectorAll('button, input:not([type="hidden"]), select, summary, [role="checkbox"], [role="radio"], [role="switch"], [role="option"], a[href]')].filter(visible);
    const small = controls.flatMap((el) => { const r = el.getBoundingClientRect(); return r.width < 43.9 || r.height < 43.9 ? [`${el.tagName} ${el.getAttribute("title") || el.textContent?.slice(0, 40)} ${r.width}×${r.height}`] : []; });
    const smallText: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let node;
    while ((node = walker.nextNode())) { const el = node.parentElement!; if (node.textContent?.trim() && visible(el) && !el.closest('script, style, svg, [aria-hidden="true"], .sr-only') && parseFloat(getComputedStyle(el).fontSize) < 12) smallText.push(node.textContent.trim().slice(0, 40)); }
    const overlap: string[] = [];
    for (let i = 0; i < controls.length; i++) for (let j = i + 1; j < controls.length; j++) {
      if (controls[i].contains(controls[j]) || controls[j].contains(controls[i])) continue;
      const clipped = (el: Element) => {
        const r = el.getBoundingClientRect(); let left = r.left, right = r.right, top = r.top, bottom = r.bottom;
        for (let parent = el.parentElement; parent; parent = parent.parentElement) {
          const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
          if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) { left = Math.max(left, box.left); right = Math.min(right, box.right); }
          if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
        }
        return { left, right, top, bottom };
      };
      const a = clipped(controls[i]), b = clipped(controls[j]);
      const reachable = (el: Element, r: DOMRect) => { const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return hit && el.contains(hit); };
      if (!reachable(controls[i], controls[i].getBoundingClientRect()) || !reachable(controls[j], controls[j].getBoundingClientRect())) continue;
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) overlap.push(`${controls[i].textContent?.slice(0, 20)} / ${controls[j].textContent?.slice(0, 20)}`);
    }
    return { small, smallText, overlap };
  });
  expect(findings).toEqual({ small: [], smallText: [], overlap: [] });
}
async function noOverflow(page: Page) {
  expect(await page.locator("main").evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
}

for (const width of [320, 375, 640]) {
  test(`${width}px: readable metadata and 44px controls across main views and sheets`, async ({ page }, testInfo) => {
    test.setTimeout(60_000); await page.setViewportSize({ width, height: 900 });
    const app = new InboxPage(page); await app.goto();
    const project = await (await page.request.post("/api/projects", { data: { name: InboxPage.unique("Long project title with meaningful planning context") } })).json();
    const title = InboxPage.unique("Long readable bookmark title with useful information");
    const item = await app.seed({ title, type: "bookmark", projectId: project.id, tagNames: ["a-very-long-tag-with-important-context"], priority: 4, metadata: { medium: "book", currentPage: 10, totalPages: 400, status: "reading" } });
    const archivable = await app.seed({ title: InboxPage.unique("Archive target"), type: "task" });
    const other = await app.seed({ title: InboxPage.unique("Linked note"), type: "note" });
    expect((await page.request.post(`/api/items/${item.id}/links`, { data: { toId: other.id, type: "related_to", revision: item.revision } })).ok()).toBeTruthy();
    await app.reload(); await navigate(page, "Inbox");
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    await settled(page); await audit(page.locator("main")); await noOverflow(page);
    await audit(page.locator("header"));
    await page.screenshot({ path: testInfo.outputPath(`${width}-inbox.png`), animations: "disabled" });
    await app.row(archivable.title).getByTitle("Archive", { exact: true }).tap();
    await expect(app.row(archivable.title)).toBeHidden();
    await expect(page.getByRole("dialog")).toBeHidden();
    // Editing is a separate target and must not also open detail.
    await app.row(title).getByTitle("Edit", { exact: true }).tap();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Edit item", exact: true })).toBeVisible();
    await audit(dialog);
    await dialog.getByRole("button", { name: "Close", exact: true }).last().tap();
    await expect(dialog).toBeHidden();
    await page.getByRole("button", { name: title, exact: true }).tap();
    await expect(dialog.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await audit(dialog);
    const remove = dialog.getByTitle("Remove connection", { exact: true });
    await expect(remove).toHaveCSS("opacity", "1");
    await dialog.getByTitle("Forward 10 pages", { exact: true }).tap();
    await expect.poll(async () => (await (await page.request.get(`/api/items/${item.id}`)).json()).metadata.currentPage).toBe(20);
    await remove.tap(); await expect(remove).toBeHidden();
    await expect(dialog.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Close", exact: true }).last().tap();
    await page.keyboard.press("Tab");
    await page.getByRole("button", { name: title, exact: true }).focus();
    await expect(page.getByRole("button", { name: title, exact: true })).toHaveCSS("outline-width", "2px");
    await page.keyboard.press("Enter");
    await expect(dialog.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Close", exact: true }).last().tap();
    for (const view of ["Agenda", "Projects", "Insights", "Settings"]) {
      await navigate(page, view);
      const headings = { Agenda: "Weekly Agenda", Projects: "Projects & Threads", Insights: "Insights", Settings: "Settings" };
      await expect(page.getByRole("heading", { level: 1, name: headings[view as keyof typeof headings], exact: true })).toBeVisible();
      if (view === "Settings") await expect(page.getByLabel("Import theme", { exact: true })).toBeVisible();
      await settled(page);
      if (view === "Projects") await expect(page.getByRole("heading", { name: project.name, exact: true })).toBeVisible();
      if (view === "Settings") {
        const ai = page.getByText("Enable AI features", { exact: true }).locator('xpath=ancestor::div[button[@role="switch"]][1]').getByRole("switch");
        await ai.tap(); await expect(ai).toHaveAttribute("aria-checked", "false");
        await ai.tap(); await expect(ai).toHaveAttribute("aria-checked", "true");
      }
      await audit(page.locator("main")); await noOverflow(page);
      await page.locator("main").evaluate((el) => { el.scrollTop = 0; });
      await page.screenshot({ path: testInfo.outputPath(`${width}-${view}.png`), animations: "disabled" });
    }
    await navigate(page, "Projects"); await page.getByRole("button", { name: "New", exact: true }).tap();
    await audit(dialog); await expect(dialog.getByRole("button", { name: "Create", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).tap();
    await page.keyboard.press("Control+p");
    await page.getByRole("option", { name: /Write journal entry/ }).click();
    await expect(page.getByPlaceholder("Give your entry a title…")).toBeVisible();
    await page.getByPlaceholder("Give your entry a title…").fill("A longer journal title remains editable on a narrow screen");
    await page.locator('.rich-text-editor-wrapper [contenteditable="true"]').fill("A longer journal paragraph keeps its useful detail when text wraps on a narrow screen. ".repeat(3));
    await settled(page); await audit(page.locator("main")); await noOverflow(page);
    await page.locator("main").evaluate((el) => { el.scrollTop = 0; });
    await page.screenshot({ path: testInfo.outputPath(`${width}-journal.png`), animations: "disabled" });
  });
}
