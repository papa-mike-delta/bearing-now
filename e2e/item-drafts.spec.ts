import { test, expect } from "./fixtures";
import { InboxPage } from "./pages/InboxPage";
import { LoginPage } from "./pages/LoginPage";

test("A → B → A retains unsaved editor fields without writing them", async ({ page }) => {
  const inbox = new InboxPage(page);
  await inbox.goto();
  const a = await inbox.seed({ title: InboxPage.unique("draft A"), type: "bookmark" });
  const b = await inbox.seed({ title: InboxPage.unique("draft B"), type: "note" });
  await inbox.reload();
  await inbox.navigate("Inbox");
  const opened = page.waitForResponse((r) => r.request().method() === "PUT" && r.url().endsWith(`/api/items/${a.id}/open`));
  await inbox.row(a.title).getByTitle("Edit", { exact: true }).click();
  expect((await opened).status()).toBe(200);
  const dialog = page.getByRole("dialog");
  await dialog.locator("input").first().fill("Unsaved A");
  await dialog.locator("textarea").fill("Unsaved content");
  const closed = page.waitForResponse((r) => r.request().method() === "DELETE" && r.url().endsWith(`/api/items/${a.id}/open`));
  await page.keyboard.press("Escape");
  expect((await closed).status()).toBe(200);
  await inbox.row(b.title).getByTitle("Edit", { exact: true }).click();
  await expect(dialog.locator("input").first()).toHaveValue(b.title);
  await page.keyboard.press("Escape");
  await inbox.row(a.title).getByTitle("Edit", { exact: true }).click();
  await expect(dialog.locator("input").first()).toHaveValue("Unsaved A");
  await expect(dialog.locator("textarea")).toHaveValue("Unsaved content");
  expect((await (await page.request.get(`/api/items/${a.id}`)).json()).title).toBe(a.title);
  await dialog.getByRole("button", { name: "Discard changes" }).click();
  await expect(dialog.locator("input").first()).toHaveValue(a.title);
});

test("a stale save retains the draft and explicit discard loads the refetched Item", async ({ page }) => {
  const inbox = new InboxPage(page);
  await inbox.goto();
  const item = await inbox.seed({ title: InboxPage.unique("conflict draft"), type: "note" });
  await inbox.reload();
  await inbox.navigate("Inbox");
  await inbox.row(item.title).getByTitle("Edit", { exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input").first().fill("Local edit");
  const remoteTitle = InboxPage.unique("remote edit");
  expect((await page.request.patch(`/api/items/${item.id}`, { data: { revision: item.revision, title: remoteTitle } })).ok()).toBeTruthy();
  const refusal = page.waitForResponse((r) => r.request().method() === "PATCH" && r.url().endsWith(`/api/items/${item.id}`));
  const refreshed = page.waitForResponse((r) => r.request().method() === "GET" && r.url().endsWith(`/api/items/${item.id}`));
  await dialog.getByRole("button", { name: "Save changes" }).click();
  expect((await refusal).status()).toBe(409);
  await refreshed;
  await expect(dialog.locator("input").first()).toHaveValue("Local edit");
  await expect(dialog.getByRole("alert")).toContainText("Your edits are retained");
  await dialog.getByRole("button", { name: "Discard changes" }).click();
  await expect(dialog.locator("input").first()).toHaveValue(remoteTitle);
});

test("a delayed save cannot close another Item or overwrite edits made while saving", async ({ page }) => {
  const inbox = new InboxPage(page);
  await inbox.goto();
  const a = await inbox.seed({ title: InboxPage.unique("slow A"), type: "note" });
  const b = await inbox.seed({ title: InboxPage.unique("slow B"), type: "note" });
  await inbox.reload();
  await inbox.navigate("Inbox");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let fetched!: () => void;
  const serverSaved = new Promise<void>((resolve) => { fetched = resolve; });
  await page.route(`**/api/items/${a.id}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    const response = await route.fetch();
    fetched();
    await gate;
    await route.fulfill({ response });
  });
  try {
    await inbox.row(a.title).getByTitle("Edit", { exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("input").first().fill("Submitted A");
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await serverSaved;
    await dialog.locator("input").first().fill("Newer A");
    await page.keyboard.press("Escape");
    await inbox.row(b.title).getByTitle("Edit", { exact: true }).click();
    release();
    await expect(dialog.getByRole("button", { name: "Save changes" })).toBeEnabled();
    await expect(dialog.locator("input").first()).toHaveValue(b.title);
    await page.keyboard.press("Escape");
    await inbox.row("Submitted A").getByTitle("Edit", { exact: true }).click();
    await expect(dialog.locator("input").first()).toHaveValue("Newer A");
  } finally { release(); }
});

test("detail and full journal editors share the same unsaved content", async ({ page }) => {
  const inbox = new InboxPage(page);
  await inbox.goto();
  const item = await inbox.seed({ title: InboxPage.unique("shared journal"), type: "journal", content: "Original" });
  await inbox.reload();
  await inbox.navigate("Inbox");
  await page.getByText(item.title, { exact: true }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Edit", exact: true }).first().click();
  await sheet.locator("textarea").fill("Draft from detail");
  await page.keyboard.press("Escape");
  await page.getByText(item.title, { exact: true }).click();
  // Read-only mode offers Full editor; closing content editing retains the draft.
  if (await sheet.getByRole("button", { name: "Cancel", exact: true }).isVisible()) {
    await sheet.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  await sheet.getByRole("button", { name: "Full editor" }).click();
  await expect(page.locator('.rich-text-editor-wrapper [contenteditable="true"]')).toContainText("Draft from detail");
  await page.getByPlaceholder("Give your entry a title…").fill("Unsaved journal title");
  await inbox.navigate("Inbox");
  await inbox.row(item.title).getByTitle("Edit", { exact: true }).click();
  await expect(page.getByRole("dialog").locator("input").first()).toHaveValue("Unsaved journal title");
  await expect(page.getByRole("dialog").locator("textarea")).toHaveValue("Draft from detail");
});

test("a new journal restores its browser draft and explicit discard clears it", async ({ page }) => {
  const inbox = new InboxPage(page);
  await inbox.goto();
  const openJournal = async () => {
    await page.keyboard.press("Control+p");
    await page.getByRole("option", { name: /Write journal entry/ }).click();
  };
  await openJournal();
  const title = page.getByPlaceholder("Give your entry a title…");
  await title.fill("Persisted new journal");
  await inbox.navigate("Inbox");
  await inbox.reload();
  await openJournal();
  await expect(title).toHaveValue("Persisted new journal");
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(title).toHaveValue("");
  await inbox.reload();
  await openJournal();
  await expect(title).toHaveValue("");
});

test("sign-out clears session-owned Item drafts", async ({ page }) => {
  const inbox = new InboxPage(page);
  await inbox.goto();
  const item = await inbox.seed({ title: InboxPage.unique("session draft"), type: "note" });
  await inbox.reload();
  await inbox.navigate("Inbox");
  await inbox.row(item.title).getByTitle("Edit", { exact: true }).click();
  await page.getByRole("dialog").locator("input").first().fill("Private unsaved edit");
  await page.keyboard.press("Escape");
  await inbox.navigate("Settings");
  await page.locator("main").getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await new LoginPage(page).login();
  await inbox.reload();
  await inbox.navigate("Inbox");
  await inbox.row(item.title).getByTitle("Edit", { exact: true }).click();
  await expect(page.getByRole("dialog").locator("input").first()).toHaveValue(item.title);
});
