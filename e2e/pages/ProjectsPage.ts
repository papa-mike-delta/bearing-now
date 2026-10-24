import { expect } from "@playwright/test";
import { AppPage } from "./AppPage";

export class ProjectsPage extends AppPage {
  async create(name: string) {
    await this.navigate("Projects");
    await this.page.getByRole("button", { name: "New", exact: true }).click();
    const dialog = this.page.getByRole("dialog");
    await dialog.getByPlaceholder("e.g. Japan Trip 2025").fill(name);
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog).toBeHidden();
    await this.page.getByRole("heading", { name, exact: true }).click();
    await expect(this.page.getByRole("heading", { name, exact: true })).toBeVisible();
  }

  async addItem(title: string) {
    await this.page.getByRole("button", { name: "Add item", exact: true }).click();
    const dialog = this.page.getByRole("dialog");
    await dialog.locator("input").first().fill(title);
    await dialog.getByRole("button", { name: "Create", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(this.page.getByText(title, { exact: true })).toBeVisible();
  }
}
