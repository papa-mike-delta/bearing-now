import { expect, it } from "vitest";
import { readJournalDraft, writeJournalDraft, clearJournalDraft, journalStorageKey } from "./journal-draft-storage";

function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
}
it("roundtrips journal draft fields without crossing account boundaries", () => {
  const port = storage();
  writeJournalDraft(port, "alice", { title: "Private", content: "Draft", domainId: "domain", projectId: "project", revision: 5 });
  expect(readJournalDraft(port, "alice")).toEqual({ title: "Private", content: "Draft", domainId: "domain", projectId: "project" });
  expect(readJournalDraft(port, "bob")).toBeNull();
  clearJournalDraft(port, "bob");
  expect(readJournalDraft(port, "alice")?.title).toBe("Private");
  clearJournalDraft(port, "alice");
  expect(readJournalDraft(port, "alice")).toBeNull();
});
it("migrates the legacy key once and validates its fields", () => {
  const port = storage();
  port.setItem("lifeos-journal-draft", JSON.stringify({ title: "Legacy", content: "", domainId: null, projectId: 5 }));
  expect(readJournalDraft(port, "alice")).toEqual({ title: "Legacy", content: "" });
  expect(port.getItem("lifeos-journal-draft")).toBeNull();
  expect(port.getItem(journalStorageKey("alice"))).not.toBeNull();
  expect(readJournalDraft(port, "bob")).toBeNull();
});
it("tolerates malformed data and disabled storage", () => {
  const port = storage();
  port.setItem(journalStorageKey("alice"), "not-json");
  expect(readJournalDraft(port, "alice")).toBeNull();
  const disabled = { getItem() { throw new Error("disabled"); }, setItem() { throw new Error("disabled"); }, removeItem() { throw new Error("disabled"); } };
  expect(readJournalDraft(disabled, "alice")).toBeNull();
  expect(() => writeJournalDraft(disabled, "alice", {})).not.toThrow();
  expect(() => clearJournalDraft(disabled, "alice")).not.toThrow();
});
