import { test, expect } from "./fixtures";
import { SettingsPage } from "./pages/SettingsPage";
import { DatabaseSnapshot } from "./pages/DatabaseSnapshot";

test("JSON export/import preserves item content and identity", async ({ page }, testInfo) => {
  const settings = new SettingsPage(page);
  const title = SettingsPage.unique("roundtrip");
  await settings.goto();
  await settings.createItem(title, "Note");
  const original = await settings.item(title);
  await settings.open();
  const fullBackup = await settings.backup();
  // Minimal valid roundtrip fixture, independent of the existing dataset size.
  const backup = { ...fullBackup, items: fullBackup.items.filter((item: { id: string }) => item.id === original.id), links: [], reviews: [], habitLogs: [] };
  const snapshot = new DatabaseSnapshot(testInfo.outputPath("database.dump"));
  await snapshot.save();
  try {
    expect((await settings.restore(backup)).status()).toBe(200);
    expect(await settings.item(title)).toMatchObject({ id: original.id, title, type: "note" });
  } finally {
    await page.close();
    await snapshot.restore();
  }
});

test("JSON export/import preserves item tags", async ({ page }, testInfo) => {
  const settings = new SettingsPage(page);
  const title = SettingsPage.unique("tagged roundtrip");
  const tag = SettingsPage.unique("tag").toLowerCase();
  await settings.goto();
  await settings.createItem(title, "Note");
  const original = await settings.item(title);
  const updated = await page.request.patch(`/api/items/${original.id}`, { data: { revision: original.revision, tagNames: [tag] } });
  expect(updated.ok()).toBeTruthy();
  await settings.open();
  const fullBackup = await settings.backup();
  // Minimal valid roundtrip fixture, independent of the existing dataset size.
  const backup = { ...fullBackup, items: fullBackup.items.filter((item: { id: string }) => item.id === original.id), links: [], reviews: [], habitLogs: [] };
  const snapshot = new DatabaseSnapshot(testInfo.outputPath("database.dump"));
  await snapshot.save();
  try {
    expect((await settings.restore(backup)).status()).toBe(200);
    const restored = await settings.item(title);
    // BUG: JSON restore discards item tag associations — see e2e/README.md#findings
    test.fail();
    expect(restored.tags).toEqual(expect.arrayContaining([expect.objectContaining({ tag: expect.objectContaining({ name: tag }) })]));
  } finally {
    await page.close();
    await snapshot.restore();
  }
});

test("a full exported backup can be restored", async ({ page }) => {
  const settings = new SettingsPage(page);
  await settings.goto();
  await settings.open();
  const backup = await settings.backup();
  expect(backup.items.length).toBeGreaterThan(20);
  const response = await settings.restore(backup);
  // BUG: full backup restore exceeds the user create cap — see e2e/README.md#findings
  test.fail();
  expect(response.status()).toBe(200);
  expect((await settings.backup()).items).toHaveLength(backup.items.length);
});
