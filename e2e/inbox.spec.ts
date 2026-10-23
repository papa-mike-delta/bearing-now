import { test, expect } from "./fixtures";
import { InboxPage } from "./pages/InboxPage";

test("inbox capture and edit persist without a 404", async ({ page }) => {
  const inbox = new InboxPage(page);
  const title = InboxPage.unique("inbox edit");
  await inbox.goto();
  await inbox.capture(title);
  await inbox.edit(title, `${title} edited`);
  await inbox.reload();
  await inbox.navigate("Inbox");
  await expect(page.getByText(`${title} edited`, { exact: true })).toBeVisible();
});

test("inbox archive removes only its own capture", async ({ page }) => {
  const inbox = new InboxPage(page);
  const title = InboxPage.unique("archive");
  await inbox.goto();
  await inbox.capture(title);
  await inbox.row(title).getByTitle("Archive", { exact: true }).click();
  await expect(page.getByText(title, { exact: true })).toBeHidden();
  expect(await inbox.item(title)).toMatchObject({ status: "archived" });
});

test("inbox convert to task and activate", async ({ page }) => {
  const inbox = new InboxPage(page);
  const title = InboxPage.unique("convert");
  await inbox.goto();
  await inbox.capture(title);
  await inbox.row(title).getByTitle("Edit", { exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Task", exact: true }).click();
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();
  await inbox.row(title).getByTitle("Activate", { exact: true }).click();
  await expect(page.getByText(title, { exact: true })).toBeHidden();
  expect(await inbox.item(title)).toMatchObject({ type: "task", status: "active" });
});

test("inbox bulk processing affects only selected capture", async ({ page }) => {
  const inbox = new InboxPage(page);
  const title = InboxPage.unique("bulk selected");
  const other = InboxPage.unique("bulk unselected");
  await inbox.goto();
  await inbox.capture(other);
  await inbox.capture(title);
  await inbox.row(title).locator(":scope > button").click();
  await page.getByRole("button", { name: "Activate all (1)", exact: true }).click();
  await expect(page.getByText(title, { exact: true })).toBeHidden();
  await expect(page.getByText(other, { exact: true })).toBeVisible();
  expect(await inbox.item(title)).toMatchObject({ status: "active" });
  expect(await inbox.item(other)).toMatchObject({ status: "inbox" });
});

test("editing an inbox title preserves its existing tags", async ({ page }) => {
  const inbox = new InboxPage(page);
  const title = InboxPage.unique("tag preservation");
  const tag = InboxPage.unique("existing tag").toLowerCase();
  await inbox.goto();
  await inbox.capture(title);
  const item = await inbox.item(title);
  expect((await page.request.patch(`/api/items/${item.id}`, { data: { revision: item.revision, tagNames: [tag] } })).ok()).toBeTruthy();
  await inbox.goto();
  await inbox.navigate("Inbox");
  await inbox.edit(title, `${title} edited`);
  const edited = await inbox.item(`${title} edited`);
  // BUG: item editor erases existing tags when saving a title — see e2e/README.md#findings
  test.fail();
  expect(edited.tags).toEqual(expect.arrayContaining([expect.objectContaining({ tag: expect.objectContaining({ name: tag }) })]));
});
