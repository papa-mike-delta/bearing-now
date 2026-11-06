import { describe, expect, it } from "vitest";
import type {
  ItemRecord,
  MomentRecord,
  ProjectRecord,
  Workspace,
} from "./client-model";
import { LinkProposals } from "./link-proposals";

function item(
  patch: Partial<ItemRecord> & Pick<ItemRecord, "id" | "title" | "type">,
): ItemRecord {
  return {
    content: "",
    status: "todo",
    priority: 0,
    projectId: null,
    delegateId: null,
    dueAt: null,
    scheduledAt: null,
    startAt: null,
    endAt: null,
    followUpAt: null,
    localDate: null,
    timezone: "UTC",
    metadata: { version: 1 },
    template: patch.type,
    revision: 3,
    completedAt: null,
    createdAt: "2026-11-01T00:00:00.000Z",
    tags: [],
    directAreas: [],
    inheritedAreas: [],
    project: null,
    ...patch,
  };
}
function moment(
  id: string,
  items: MomentRecord["items"],
  text = "entry",
): MomentRecord {
  return {
    id,
    clientId: id,
    revision: 1,
    text,
    occurredAt: "2026-11-06T15:00:00.000Z",
    capturedAt: "2026-11-06T15:00:00.000Z",
    createdAt: "2026-11-06T15:00:00.000Z",
    localDate: "2026-11-06",
    timezone: "America/New_York",
    needsOrganization: false,
    items,
  };
}
function workspace(
  partial: Partial<Workspace> & Pick<Workspace, "items" | "moments">,
): Workspace {
  return {
    projects: [],
    tags: [],
    activities: [],
    reviews: [],
    links: [],
    habitOccurrences: [],
    preferences: {},
    ...partial,
  };
}
const me = item({
  id: "me",
  type: "person",
  title: "Me",
  selfProfile: { userId: "owner" },
});
const alex = item({ id: "alex", type: "person", title: "Alex" });
const note = item({ id: "note", type: "note", title: "Clinic note" });
const project: ProjectRecord = {
  id: "proj",
  name: "Launch",
  description: "",
  revision: 0,
  status: "active",
  tags: [
    {
      tagId: "home",
      tag: { id: "home", name: "Home", kind: "area" },
    },
  ],
};

describe("LinkProposals", () => {
  it("proposes a mentions Link when a Journal entry records another Item", () => {
    const cards = LinkProposals.infer(
      workspace({
        items: [me, alex, note],
        moments: [
          moment("m1", [
            { itemId: "alex", relation: "mention" },
            { itemId: "note", relation: "reference" },
          ]),
        ],
      }),
    );
    expect(cards).toMatchObject([
      {
        id: "mention:m1:note:alex",
        confidence: "proposal",
        accept: {
          kind: "link",
          fromId: "note",
          toId: "alex",
          type: "mentions",
          fromRevision: 3,
          toRevision: 3,
        },
      },
    ]);
    expect(LinkProposals.unsupportedMentions(workspace({
      items: [me, alex, note],
      moments: [
        moment("m1", [
          { itemId: "alex", relation: "mention" },
          { itemId: "note", relation: "reference" },
        ]),
      ],
    }))).toEqual([]);
  });

  it("keeps a Person mention without another Item as a MomentItem limit", () => {
    const data = workspace({
      items: [me, alex],
      moments: [moment("m1", [{ itemId: "alex", relation: "mention" }])],
    });
    expect(LinkProposals.infer(data)).toEqual([]);
    expect(LinkProposals.unsupportedMentions(data)[0].summary).toContain(
      "Alex",
    );
    expect(LinkProposals.unsupportedMentions(data)[0].summary).toContain(
      LinkProposals.mentionLimit,
    );
    expect(LinkProposals.reject()).toEqual({ writes: false });
  });

  it("suggests a health word as text, and ignores lookalike tokens and shared Areas", () => {
    const area = { id: "home", name: "Health", kind: "area" as const };
    const medication = item({
      id: "med",
      type: "note",
      title: "Medication log",
      content: "Take with food.",
    });
    const healthcare = item({
      id: "care",
      type: "note",
      title: "Healthcare portal",
      content: "A healthy routine and an allergic note.",
    });
    const neighbor = item({
      id: "groceries",
      type: "note",
      title: "Grocery list",
      content: "eggs",
      directAreas: [area],
      tags: [{ tagId: area.id, tag: area }],
    });
    const linked = item({
      id: "linked",
      type: "note",
      title: "Already linked",
      directAreas: [area],
      tags: [{ tagId: area.id, tag: area }],
    });
    const cards = LinkProposals.infer(
      workspace({
        items: [me, medication, healthcare, neighbor, linked],
        moments: [],
        links: [
          {
            id: "existing",
            fromId: "me",
            toId: "linked",
            type: "related_to",
            note: "",
          },
        ],
      }),
    );
    expect(cards.map((card) => card.id)).toEqual(["health:med:me"]);
    expect(cards[0]).toMatchObject({
      confidence: "suggestion",
      accept: { type: "related_to", fromId: "med", toId: "me" },
    });
    expect(cards[0].reason).toContain("word “medication”");
    expect(cards[0].reason).toContain("Suggestion only");
  });

  it("suggests a directly missing inherited Area and does not copy it", () => {
    const task = item({
      id: "task",
      type: "task",
      title: "Write",
      projectId: project.id,
      project,
      inheritedAreas: [{ id: "home", name: "Home", kind: "area" }],
    });
    const cards = LinkProposals.infer(
      workspace({ items: [me, task], moments: [] }),
    );
    expect(cards).toMatchObject([
      {
        confidence: "suggestion",
        accept: { kind: "area", itemId: "task", tagId: "home", revision: 3 },
      },
    ]);
    task.directAreas = [{ id: "home", name: "Home", kind: "area" }];
    expect(LinkProposals.infer(workspace({ items: [me, task], moments: [] }))).toEqual(
      [],
    );
  });

  it("does not turn a Project Goal or stored coordinates into a Link", () => {
    const goal = item({
      id: "goal",
      type: "goal",
      title: "Ship",
      projectId: project.id,
      project,
    });
    const task = item({
      id: "task",
      type: "task",
      title: "Write",
      projectId: project.id,
      project: { ...project, tags: [] },
      inheritedAreas: [],
    });
    const place = item({
      id: "place",
      type: "bookmark",
      template: "place",
      title: "Cafe",
      metadata: {
        version: 1,
        category: "place",
        latitude: 40.71,
        longitude: -74,
      },
    });
    const cards = LinkProposals.infer(
      workspace({
        items: [me, goal, task, place],
        moments: [
          moment("gps", [{ itemId: "place", relation: "reference" }], "Cafe"),
        ],
      }),
    );
    expect(cards).toEqual([]);
    expect(JSON.stringify(cards)).not.toContain("located_at");
    expect(JSON.stringify(cards)).not.toContain("advances");
    expect(LinkProposals.modelingGaps.map((gap) => gap.code)).toEqual([
      "task-in-project",
      "gps-place",
    ]);
    expect(
      LinkProposals.modelingGaps.find((gap) => gap.code === "task-in-project")
        ?.summary,
    ).toContain("A Project is not an Item");
    expect(
      LinkProposals.modelingGaps.find((gap) => gap.code === "gps-place")
        ?.summary,
    ).toContain("do not prove");
  });
});
