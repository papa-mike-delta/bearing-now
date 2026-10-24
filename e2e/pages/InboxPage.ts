import { expect } from "@playwright/test";
import { AppPage } from "./AppPage";

export class InboxPage extends AppPage {
  async capture(title: string) {
    await this.navigate("Inbox");
    await this.page.getByRole("button", { name: "Capture", exact: true }).click();
    await this.page.getByRole("dialog").locator("textarea").fill(title);
    await this.page.getByRole("button", { name: "Capture to inbox" }).click();
    await expect(this.page.getByRole("dialog").locator("textarea")).toHaveValue("");
    await this.page.keyboard.press("Escape");
    await expect(this.page.getByRole("dialog")).toBeHidden();
    await expect(this.page.getByText(title, { exact: true })).toBeVisible();
  }

  row(title: string) {
    return this.page.getByText(title, { exact: true }).locator('xpath=ancestor::div[div/button[@title="Edit"]][1]');
  }

  async edit(title: string, replacement: string) {
    await this.row(title).getByTitle("Edit", { exact: true }).click();
    const dialog = this.page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Edit item" })).toBeVisible();
    await dialog.locator("input").first().fill(replacement);
    const response = this.page.waitForResponse(r => r.request().method() === "PATCH" && r.url().includes("/api/items/"));
    await dialog.getByRole("button", { name: /Save/ }).click();
    expect((await response).status()).toBe(200);
    await expect(dialog).toBeHidden();
    await expect(this.page.getByText(replacement, { exact: true })).toBeVisible();
  }

  // Arrange a capture through the API, for shapes Quick Capture can't produce
  // (e.g. a typed item filed under a project with no metadata saved).
  async seed(data: Record<string, unknown>) {
    const response = await this.page.request.post("/api/items", { data: { status: "inbox", ...data } });
    expect(response.ok()).toBeTruthy();
    return response.json();
  }

  async openOnPhone() {
    await this.page.getByRole("button", { name: "Open menu" }).tap();
    await this.page.getByRole("dialog", { name: "Navigation" }).getByRole("button", { name: /^Inbox(?: \d+)?$/ }).tap();
  }
}
