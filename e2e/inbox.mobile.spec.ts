import { test, expect } from "./fixtures";
import { InboxPage } from "./pages/InboxPage";

// Paul's live-site report: a bookmark capture filed under a project, saved
// without metadata, did nothing when its pencil was tapped on a phone. The
// editor read form.metadata.medium while metadata was null and crashed.
test("tapping edit on a bookmark capture without metadata opens the editor on a phone", async ({ page }) => {
  const inbox = new InboxPage(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const title = InboxPage.unique("Bearing.now Github");
  await inbox.goto();
  const project = await (await page.request.post("/api/projects", { data: { name: InboxPage.unique("Bearing Now") } })).json();
  const item = await inbox.seed({ title, type: "bookmark", projectId: project.id });
  expect(item.metadata).toBeNull();
  await inbox.reload();
  await inbox.openOnPhone();
  await inbox.row(title).getByTitle("Edit", { exact: true }).tap();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Edit item" })).toBeVisible();
  await expect(dialog.locator("input").first()).toHaveValue(title);
  await dialog.locator("input").first().fill(`${title} edited`);
  const response = page.waitForResponse(r => r.request().method() === "PATCH" && r.url().includes(`/api/items/${item.id}`));
  await dialog.getByRole("button", { name: /Save/ }).tap();
  expect((await response).status()).toBe(200);
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`${title} edited`, { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
