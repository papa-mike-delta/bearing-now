/** Shared durable examples used by interpretation and both consumer contracts. */
export const coachReceiptFixtures = [
  { operation: "item.create", tool: "createItem", payload: { data: { title: "Stored", type: "task" } }, value: { id: "item", title: "Stored" }, success: "Created", refused: "Refused create" },
  { operation: "item.update", tool: "updateItem", payload: { id: "item", revision: 4, data: { title: "Stored" } }, value: { id: "item", title: "Stored" }, success: "Updated", refused: "Refused update" },
  { operation: "item.archive", tool: "archiveItem", payload: { id: "item", revision: 4 }, value: { id: "item", title: "Stored" }, success: "Archived", refused: "Refused archive" },
  { operation: "link.create", tool: "createLink", payload: { data: { fromId: "item", toId: "other", type: "tracks" }, revision: 4 }, value: { fromId: "item", toId: "other" }, success: "Linked", refused: "Refused link" },
  { operation: "link.update", tool: "createLink", payload: { data: { fromId: "item", toId: "other", type: "tracks" }, revision: 4 }, value: { fromId: "item", toId: "other" }, success: "Linked", refused: "Refused link" },
  { operation: "link.delete", tool: "deleteLink", payload: { data: { fromId: "item", toId: "other", type: "tracks" }, revision: 4 }, value: { deleted: true }, success: "Unlinked", refused: "Refused unlink" },
  { operation: "coach.getItem", tool: "getItem", payload: { id: "item" }, value: { id: "item", title: "Stored" }, success: "Read", refused: "Refused read" },
  { operation: "coach.getLinks", tool: "getLinks", payload: { id: "item" }, value: { outgoing: [], incoming: [] }, success: "Read links", refused: "Refused read links" },
  { operation: "coach.searchItems", tool: "searchItems", payload: { q: "Stored" }, value: [{ id: "item", title: "Stored" }], success: "Searched", refused: "Refused search" },
  { operation: "coach.listOpenItems", tool: "listOpenItems", payload: {}, value: [{ id: "item", title: "Stored" }], success: "Listed open", refused: "Refused list" },
] as const;
