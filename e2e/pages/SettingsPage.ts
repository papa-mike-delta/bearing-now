import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { AppPage } from "./AppPage";

export class SettingsPage extends AppPage {
  async open() { await this.navigate("Settings"); await expect(this.page.getByRole("button", { name: "Save profile" })).toBeVisible(); }

  async backup() {
    const download = this.page.waitForEvent("download");
    await this.page.getByRole("button", { name: "Full backup (JSON)", exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.json$/);
    return JSON.parse(await readFile((await file.path())!, "utf8"));
  }

  async restore(data: unknown) {
    const chooser = this.page.waitForEvent("filechooser");
    await this.page.getByRole("button", { name: "Restore backup", exact: true }).click();
    const response = this.page.waitForResponse(r => r.url().endsWith("/api/backup") && r.request().method() === "POST");
    await (await chooser).setFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
    return response;
  }
}
