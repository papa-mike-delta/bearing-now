type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
export const journalStorageKey = (userId: string) => `lifeos-journal-draft:${userId}`;

export function browserJournalStorage(): StoragePort {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

export function readJournalDraft(storage: StoragePort, userId: string) {
  if (!storage) return null;
  try {
    // Migrate the pre-account-scoping key once, then use only this account's key.
    const key = journalStorageKey(userId);
    const legacy = storage.getItem("lifeos-journal-draft");
    const raw = storage.getItem(key) ?? legacy;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const fields = Object.fromEntries(["title", "content", "domainId", "projectId"]
      .filter((field) => typeof parsed[field] === "string").map((field) => [field, parsed[field]]));
    if (legacy) {
      storage.setItem(key, JSON.stringify(fields));
      storage.removeItem("lifeos-journal-draft");
    }
    return fields;
  } catch { return null; }
}

export function writeJournalDraft(storage: StoragePort, userId: string, data: Record<string, any>) {
  if (!storage) return;
  try {
    storage.setItem(journalStorageKey(userId), JSON.stringify({
      title: data.title, content: data.content, domainId: data.domainId, projectId: data.projectId,
    }));
  } catch { /* Storage may be disabled; session drafts still work. */ }
}

export function clearJournalDraft(storage: StoragePort, userId: string) {
  if (!storage) return;
  try { storage.removeItem(journalStorageKey(userId)); } catch {}
}
