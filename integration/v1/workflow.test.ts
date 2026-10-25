import { execFileSync } from "node:child_process";
import { beforeAll, afterAll, beforeEach, expect, it } from "vitest";
import { Workflow } from "@/lib/v1/workflow";
import { V1, type Principal } from "@/lib/v1/service";
import { V1Backup } from "@/lib/v1/backup";
import { v1db } from "@/lib/v1/db";
import { createSession } from "@/lib/session";
import { POST, GET } from "@/app/api/v1/[...path]/route";
const userId = "workflow-alice",
  other = "workflow-bob",
  p: Principal = { userId, actor: `user:${userId}` },
  q: Principal = { userId: other, actor: `user:${other}` };
const input = (extra: object = {}) => ({
  clientId: crypto.randomUUID(),
  text: "  An unclassified line\n",
  capturedAt: new Date().toISOString(),
  occurredAt: "2026-10-25T02:30:00Z",
  timezone: "America/New_York",
  ...extra,
});
beforeAll(async () => {
  for (const schema of ["prisma/schema.prisma", "prisma/v1/schema.prisma"])
    execFileSync(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        "deploy",
        "--schema",
        schema,
      ],
      { env: process.env, stdio: "pipe" },
    );
  await v1db.account.createMany({
    data: [userId, other].map((id) => ({
      id,
      email: `${id}@example.test`,
      passwordHash: "test",
    })),
  });
});
afterAll(async () => {
  const schema = new URL(process.env.DATABASE_URL!).searchParams.get("schema")!;
  if (!/^v1_test_[a-f0-9]+$/.test(schema))
    throw new Error("Unsafe test schema");
  await v1db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await v1db.$disconnect();
});
beforeEach(async () => {
  for (const person of [p, q]) {
    await V1Backup.reset(person, "RESET V1 DATA");
    await v1db.ledger.deleteMany({ where: { userId: person.userId } });
  }
});
it("captures once under retries/concurrency and keeps original text, capture time and local date", async () => {
  const value = input();
  const [a, b] = await Promise.all([
    Workflow.capture(p, value),
    Workflow.capture(p, value),
  ]);
  expect(a.value.id).toBe(b.value.id);
  expect(a.value).toMatchObject({
    text: value.text,
    localDate: "2026-10-24",
    needsOrganization: true,
  });
  expect(a.value.capturedAt.toISOString()).toBe(value.capturedAt);
  await expect(
    Workflow.capture(p, { ...value, text: "Different" }),
  ).rejects.toMatchObject({ status: 409 });
  expect(await v1db.item.count({ where: { userId } })).toBe(1);
});
it("creates one canonical Task from an explicit shortcut and reflects its edits in Journal references", async () => {
  const value = input({ text: "/task Call Alex" });
  const capture = await Workflow.capture(p, value);
  await Workflow.capture(p, value);
  expect(capture.value.items).toHaveLength(1);
  const item = await V1.item(userId, capture.value.items[0].itemId);
  await V1.updateItem(p, item.id, item.revision, {
    type: "task",
    title: item.title,
    content: item.content,
    status: "done",
  });
  const state = await Workflow.workspace(userId);
  expect(state.items.find((i) => i.id === item.id)?.status).toBe("done");
  expect(state.moments[0].items[0].item.status).toBe("done");
  expect(await v1db.item.count({ where: { userId, type: "task" } })).toBe(1);
});
it("promotes a raw entry atomically and retry after organization/edit never duplicates the source", async () => {
  const value = input();
  const moment = (await Workflow.capture(p, value)).value;
  const body = {
    revision: moment.revision,
    item: { type: "task", title: "Clarified Task", status: "todo" },
  };
  await Promise.all([
    Workflow.organize(p, moment.id, body),
    Workflow.organize(p, moment.id, body),
  ]);
  const current = await v1db.journalMoment.findUniqueOrThrow({
    where: { id: moment.id },
  });
  await Workflow.editMoment(p, moment.id, {
    revision: current.revision,
    text: "Clarified Journal context",
    occurredAt: value.occurredAt,
    timezone: value.timezone,
  });
  await Workflow.capture(p, value);
  expect(await v1db.item.count({ where: { userId, type: "task" } })).toBe(1);
  expect((await Workflow.workspace(userId)).moments[0].text).toBe(
    "Clarified Journal context",
  );
});
it("separates check-ins from Journal records, preserves incomplete commands for clarification", async () => {
  const a = input({ text: "/mood 4 energy 3" });
  await Workflow.capture(p, a);
  await Workflow.capture(p, a);
  await Workflow.capture(p, input({ text: "/task" }));
  const state = await Workflow.workspace(userId);
  expect(state.activities).toHaveLength(1);
  expect(state.moments.filter((m) => m.needsOrganization)).toHaveLength(1);
  expect(await v1db.item.count({ where: { userId, type: "task" } })).toBe(0);
});
it("promotes a Markdown checkbox once with an atomic parent update", async () => {
  const parent = (
    await V1.createItem(p, {
      type: "task",
      title: "Parent",
      content: "- [ ] Call Alex",
    })
  ).value;
  const body = { revision: parent.revision, line: 0, clientId: "promote-step" };
  const a = await Workflow.promoteTask(p, parent.id, body),
    b = await Workflow.promoteTask(p, parent.id, body);
  expect(a.value.itemId).toBe(b.value.itemId);
  expect((await V1.item(userId, parent.id)).content).toContain(
    `/app/library/${a.value.itemId}`,
  );
  expect(await v1db.item.count({ where: { userId, type: "task" } })).toBe(2);
});
it("universal keyword search finds every supported record kind and respects Area inheritance and ownership", async () => {
  const area = (await V1.createTag(p, { name: "Needle Area", kind: "area" }))
    .value;
  const project = (
    await V1.createProject(p, { name: "Needle Project", tagIds: [area.id] })
  ).value;
  const task = (
    await V1.createItem(p, {
      type: "task",
      title: "Needle Task",
      projectId: project.id,
    })
  ).value;
  await Workflow.capture(p, input({ text: "Needle Journal" }));
  await V1.createReview(p, {
    period: "daily",
    localDate: "2026-10-24",
    timezone: "UTC",
    prompts: { notes: "Needle Review" },
  });
  await V1.createActivity(p, {
    clientId: "activity",
    kind: "observation",
    occurredAt: new Date().toISOString(),
    timezone: "UTC",
    data: { text: "Needle observation" },
  });
  const foreign = (
    await V1.createItem(q, { type: "note", title: "Needle Private" })
  ).value;
  const results = await Workflow.search(userId, { q: "Needle" });
  expect(new Set(results.map((r) => r.kind)).size).toBe(6);
  expect(results.some((r) => r.id === foreign.id)).toBe(false);
  expect(
    (await Workflow.search(userId, { q: "Needle", areaId: area.id })).map(
      (r) => r.id,
    ),
  ).toContain(task.id);
  expect(
    await Workflow.search(other, { q: "Needle", areaId: area.id }),
  ).toHaveLength(0);
  expect(results.every((r) => r.href.startsWith("/app/"))).toBe(true);
});
it("treats wildcard characters as literal keywords and searches typed metadata", async () => {
  await V1.createItem(p, {
    type: "person",
    title: "Alex",
    metadata: { email: "a_percent@example.test" },
  });
  expect(
    (await Workflow.search(userId, { q: "_percent" })).map((r) => r.title),
  ).toEqual(["Alex"]);
  expect(await Workflow.search(userId, { q: "%" })).toHaveLength(0);
});
it("refuses cross-account classification, preferences and sync under a switched cookie", async () => {
  const moment = (await Workflow.capture(p, input())).value;
  await expect(
    Workflow.organize(q, moment.id, { revision: 0 }),
  ).rejects.toMatchObject({ status: 404 });
  const req = new Request("http://localhost/api/v1/capture", {
    method: "POST",
    headers: {
      cookie: `lifeos-session=${createSession(other, "other@example.test", true)}`,
      "X-Bearing-Account": userId,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input()),
  });
  const result = await POST(req, {
    params: Promise.resolve({ path: ["capture"] }),
  });
  expect(result.status).toBe(409);
  expect(await v1db.journalMoment.count({ where: { userId: other } })).toBe(0);
  await Workflow.setPreferences(p, {
    startup: "journal",
    timezone: "America/New_York",
  });
  expect((await Workflow.preferences(other)).startup).toBeUndefined();
  const search = await GET(
    new Request("http://localhost/api/v1/search?q=Needle", {
      headers: {
        cookie: `lifeos-session=${createSession(other, "other@example.test", false)}`,
      },
    }),
    { params: Promise.resolve({ path: ["search"] }) },
  );
  expect(search.status).toBe(401);
});

it("organizing an explicit Task capture clears both Inbox flags without another Item", async () => {
  const captured = (
    await Workflow.capture(p, input({ text: "/task Ready to organize" }))
  ).value;
  const itemId = captured.items[0].itemId;
  const organized = await Workflow.organize(p, captured.id, {
    revision: captured.revision,
  });
  expect(organized.value.needsOrganization).toBe(false);
  expect((await V1.item(userId, itemId)).status).toBe("todo");
  expect(await v1db.item.count({ where: { userId, type: "task" } })).toBe(1);
});
