import type { ItemRecord, Workspace } from "./client-model";

const WORD = /[^\p{L}\p{N}]+/u;
const HEALTH_WORDS = new Set([
  "medication",
  "medications",
  "medicine",
  "medicines",
  "prescription",
  "prescriptions",
  "symptom",
  "symptoms",
  "diagnosis",
  "diagnoses",
  "allergy",
  "allergies",
  "dosage",
  "dosages",
  "health",
]);

export type LinkAccept = {
  kind: "link";
  fromId: string;
  toId: string;
  type: "mentions" | "related_to";
  fromRevision: number;
  toRevision: number;
};
export type AreaAccept = {
  kind: "area";
  itemId: string;
  tagId: string;
  revision: number;
};
export type LinkProposal = {
  id: string;
  confidence: "proposal" | "suggestion";
  title: string;
  reason: string;
  acceptLabel: string;
  rejectLabel: string;
  momentId?: string;
  itemIds: string[];
  accept: LinkAccept | AreaAccept;
};
export type UnsupportedMention = { momentId: string; summary: string };

/**
 * Derived Link cards. Nothing here is stored.
 * Task–Project membership and GPS coordinates are intentionally absent:
 * see `modelingGaps`. A Journal mention with no second Item stays a MomentItem.
 */
export class LinkProposals {
  static readonly mentionLimit =
    "A Journal Person mention is stored as a MomentItem. It is proposed as a mentions Link only when that same entry also references another Item.";
  static readonly modelingGaps = [
    {
      code: "task-in-project" as const,
      summary:
        "Task membership in a Project is Item.projectId. A Project is not an Item, so it cannot be a Link endpoint. A Goal that happens to sit in that Project is not evidence for an advances Link.",
    },
    {
      code: "gps-place" as const,
      summary:
        "A GPS capture stores coordinates on a Place bookmark after an explicit location request. Those coordinates do not prove that Me, or any other Item, is located_at that Place, including for older captures. No Link is proposed from coordinates alone.",
    },
  ] as const;

  static infer(workspace: Workspace) {
    const cards: LinkProposal[] = [];
    const me = LinkProposals.me(workspace.items);
    for (const moment of workspace.moments) {
      const mentioned = LinkProposals.unique(
        moment.items
          .filter((ref) => ref.relation === "mention")
          .map((ref) => LinkProposals.active(workspace.items, ref.itemId))
          .filter((item): item is ItemRecord => item?.type === "person"),
      );
      const recorded = LinkProposals.unique(
        moment.items
          .filter((ref) => ref.relation === "reference")
          .map((ref) => LinkProposals.active(workspace.items, ref.itemId))
          .filter((item): item is ItemRecord => !!item),
      );
      for (const source of recorded)
        for (const person of mentioned) {
          if (source.id === person.id) continue;
          if (
            LinkProposals.hasLink(
              workspace,
              source.id,
              person.id,
              "mentions",
            )
          )
            continue;
          cards.push({
            id: `mention:${moment.id}:${source.id}:${person.id}`,
            confidence: "proposal",
            momentId: moment.id,
            itemIds: [source.id, person.id],
            title: `“${source.title}” mentions “${person.title}”`,
            reason: `This Journal entry mentions ${person.title} and records ${source.title}. Accepting creates a mentions Link from “${source.title}” to “${person.title}”. Rejecting writes nothing and leaves the Journal mention in place.`,
            acceptLabel: `Accept mentions link for ${source.title}`,
            rejectLabel: `Reject mentions link for ${source.title}`,
            accept: {
              kind: "link",
              fromId: source.id,
              toId: person.id,
              type: "mentions",
              fromRevision: source.revision,
              toRevision: person.revision,
            },
          });
        }
    }
    if (me)
      for (const note of workspace.items) {
        if (note.type !== "note" || note.status === "archived" || note.id === me.id)
          continue;
        const word = LinkProposals.healthToken(note.title, note.content);
        if (!word) continue;
        if (LinkProposals.hasLink(workspace, note.id, me.id, "related_to", true))
          continue;
        cards.push({
          id: `health:${note.id}:${me.id}`,
          confidence: "suggestion",
          itemIds: [note.id, me.id],
          title: `Link “${note.title}” to Me`,
          reason: `Suggestion only. “${note.title}” contains the word “${word}”. Accepting creates a related_to Link to Me. Rejecting writes nothing.`,
          acceptLabel: `Accept link to Me for ${note.title}`,
          rejectLabel: `Reject link to Me for ${note.title}`,
          accept: {
            kind: "link",
            fromId: note.id,
            toId: me.id,
            type: "related_to",
            fromRevision: note.revision,
            toRevision: me.revision,
          },
        });
      }
    for (const item of workspace.items) {
      if (item.status === "archived" || !item.project) continue;
      const direct = new Set(item.directAreas.map((area) => area.id));
      for (const area of item.inheritedAreas) {
        if (direct.has(area.id)) continue;
        cards.push({
          id: `area:${item.id}:${area.id}`,
          confidence: "suggestion",
          itemIds: [item.id],
          title: `Assign Area “${area.name}”`,
          reason: `Suggestion only. “${item.title}” inherits Area “${area.name}” from Project “${item.project.name}”. Accepting assigns that Area on this Item. Rejecting writes nothing. The Area still shows as inherited.`,
          acceptLabel: `Accept Area ${area.name} on ${item.title}`,
          rejectLabel: `Reject Area ${area.name} on ${item.title}`,
          accept: {
            kind: "area",
            itemId: item.id,
            tagId: area.id,
            revision: item.revision,
          },
        });
      }
    }
    return cards.sort((a, b) => a.id.localeCompare(b.id));
  }

  static forContext(
    workspace: Workspace,
    scope: { momentId?: string; itemId?: string },
  ) {
    return LinkProposals.infer(workspace).filter((card) =>
      scope.momentId
        ? card.momentId === scope.momentId
        : scope.itemId
          ? card.itemIds.includes(scope.itemId)
          : false,
    );
  }

  static unsupportedMentions(workspace: Workspace): UnsupportedMention[] {
    return workspace.moments.flatMap((moment) => {
      const mentioned = LinkProposals.unique(
        moment.items
          .filter((ref) => ref.relation === "mention")
          .map((ref) => LinkProposals.active(workspace.items, ref.itemId))
          .filter((item): item is ItemRecord => item?.type === "person"),
      );
      const recorded = moment.items.some(
        (ref) =>
          ref.relation === "reference" &&
          !!LinkProposals.active(workspace.items, ref.itemId),
      );
      if (!mentioned.length || recorded) return [];
      const names = mentioned.map((person) => person.title).join(", ");
      return [
        {
          momentId: moment.id,
          summary: `This Journal entry mentions ${names}. That mention stays on the Journal entry. ${LinkProposals.mentionLimit}`,
        },
      ];
    });
  }

  /** Reject is a local decision. It has no service call and no ledger row. */
  static reject() {
    return { writes: false as const };
  }

  private static me(items: ItemRecord[]) {
    return (
      items.find(
        (item) =>
          !!item.selfProfile &&
          item.type === "person" &&
          item.status !== "archived",
      ) ?? null
    );
  }
  private static active(items: ItemRecord[], id: string) {
    const item = items.find((entry) => entry.id === id);
    if (!item || item.status === "archived") return null;
    return item;
  }
  private static unique(items: ItemRecord[]) {
    return [...new Map(items.map((item) => [item.id, item])).values()];
  }
  private static hasLink(
    workspace: Workspace,
    fromId: string,
    toId: string,
    type: string,
    either = false,
  ) {
    return workspace.links.some(
      (link) =>
        link.type === type &&
        ((link.fromId === fromId && link.toId === toId) ||
          (either && link.fromId === toId && link.toId === fromId)),
    );
  }
  private static healthToken(title: string, content: string) {
    for (const word of `${title}\n${content}`
      .toLocaleLowerCase()
      .split(WORD)) {
      if (HEALTH_WORDS.has(word)) return word;
    }
    return null;
  }
}
