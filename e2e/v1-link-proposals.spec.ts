import { expect, test } from "./fixtures";

test("a health suggestion rejects with no Link and accepts one receipt", async ({
  page,
}) => {
  const created = await (
    await page.request.post("/api/v1/items", {
      data: {
        type: "note",
        title: "Medication log",
        content: "Take with food.",
      },
    })
  ).json();
  expect(created.value.id).toBeTruthy();
  await page.goto(`/app/library/${created.value.id}`);
  await expect(
    page.getByRole("button", {
      name: "Reject link to Me for Medication log",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Suggestion only.")).toBeVisible();
  await page
    .getByRole("button", {
      name: "Reject link to Me for Medication log",
      exact: true,
    })
    .click();
  await expect(page.getByText("Rejected. Nothing was written.")).toBeVisible();
  const before = await (await page.request.get("/api/v1/links")).json();
  expect(
    before.some(
      (link: { fromId: string }) => link.fromId === created.value.id,
    ),
  ).toBe(false);
  await page.reload();
  await page
    .getByRole("button", {
      name: "Accept link to Me for Medication log",
      exact: true,
    })
    .click();
  const receipt = page.getByRole("status").filter({ hasText: "Saved. Receipt" });
  await expect(receipt).toBeVisible();
  const receiptText = await receipt.innerText();
  const receiptId = receiptText.match(/Receipt (\S+)\./)?.[1];
  expect(receiptId).toBeTruthy();
  const links = await (await page.request.get("/api/v1/links")).json();
  expect(
    links.filter(
      (link: { fromId: string; type: string }) =>
        link.fromId === created.value.id && link.type === "related_to",
    ),
  ).toHaveLength(1);
  const audit = await (
    await page.request.get(`/api/receipts/${receiptId}`)
  ).json();
  expect(audit.status).toBe("success");
  expect(audit.operation).toBe("v1.link.create");
  const note = (
    await (await page.request.get(`/api/v1/items/${created.value.id}`)).json()
  );
  const me = await (await page.request.get("/api/v1/me")).json();
  const replay = await page.request.post("/api/v1/links", {
    data: {
      fromId: note.id,
      toId: me.id,
      type: "related_to",
      fromRevision: note.revision,
      toRevision: me.revision,
    },
  });
  expect(replay.ok()).toBeTruthy();
  expect((await replay.json()).receiptId).toBe(receiptId);
  expect(
    (
      await (await page.request.get("/api/v1/links")).json()
    ).filter(
      (link: { fromId: string; type: string }) =>
        link.fromId === created.value.id && link.type === "related_to",
    ),
  ).toHaveLength(1);
});

test("a Journal Person mention without another Item is not turned into a Link", async ({
  page,
}) => {
  const identity = await (await page.request.get("/api/v1/identity")).json();
  const person = await (
    await page.request.post("/api/v1/items", {
      data: { type: "person", title: "Alex Rivera" },
    })
  ).json();
  const captured = await page.request.post("/api/v1/capture", {
    headers: { "X-Bearing-Account": identity.userId },
    data: {
      clientId: `mention-${Date.now()}`,
      text: "Saw Alex Rivera today",
      capturedAt: "2026-11-06T15:00:00.000Z",
      occurredAt: "2026-11-06T15:00:00.000Z",
      timezone: "America/New_York",
      mentionIds: [person.value.id],
    },
  });
  expect(captured.ok()).toBeTruthy();
  await page.goto("/app/journal?date=2026-11-06");
  await expect(
    page.getByText("That mention stays on the Journal entry."),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/v1/links")).json()).some(
      (link: { type: string }) => link.type === "mentions",
    ),
  ).toBe(false);
  const filed = await page.request.post("/api/v1/capture", {
    headers: { "X-Bearing-Account": identity.userId },
    data: {
      clientId: `note-${Date.now()}`,
      text: "/note Clinic note",
      capturedAt: "2026-11-06T16:00:00.000Z",
      occurredAt: "2026-11-06T16:00:00.000Z",
      timezone: "America/New_York",
      mentionIds: [person.value.id],
    },
  });
  expect(filed.ok()).toBeTruthy();
  await page.reload();
  await page
    .getByRole("button", { name: "Accept mentions link for Clinic note", exact: true })
    .click();
  await expect(page.getByRole("status").filter({ hasText: "Saved. Receipt" })).toBeVisible();
  const links = await (await page.request.get("/api/v1/links")).json();
  expect(
    links.filter(
      (link: { type: string; toId: string }) =>
        link.type === "mentions" && link.toId === person.value.id,
    ),
  ).toHaveLength(1);
});
