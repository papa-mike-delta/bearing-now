import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

export class AppPage {
  constructor(readonly page: Page) {}

  static unique(prefix: string) { return `E2E ${prefix} ${randomUUID()}`; }

  async goto() {
    const mounted = this.page.waitForResponse(response =>
      response.url().endsWith("/api/scheduler") && response.request().method() === "POST");
    await this.page.goto("/app");
    // Shell runs the scheduler from its mount effect, after hydration commits.
    await mounted;
  }

  async reload() {
    const mounted = this.page.waitForResponse(response =>
      response.url().endsWith("/api/scheduler") && response.request().method() === "POST");
    await this.page.reload();
    await mounted;
  }

  async navigate(name: string) {
    await this.page.locator("aside").getByRole("button", { name: new RegExp(`^${name}(?: \\d+)?$`) }).click();
  }

  async createItem(title: string, type = "Task") {
    await this.navigate("All Items");
    await this.page.getByRole("button", { name: "New item", exact: true }).click();
    const dialog = this.page.getByRole("dialog");
    await dialog.getByRole("button", { name: type, exact: true }).click();
    await dialog.locator("input").first().fill(title);
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(this.page.getByText(title, { exact: true })).toBeVisible();
  }

  async item(title: string) {
    const response = await this.page.request.get(`/api/items?q=${encodeURIComponent(title)}&status=active,done,inbox,archived,snoozed`);
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    return data.items.find((item: { title: string }) => item.title === title);
  }
}
