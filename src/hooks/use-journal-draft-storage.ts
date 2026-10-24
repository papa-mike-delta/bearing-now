"use client";

import { useEffect } from "react";
import { useDraftSession } from "@/components/bearing/item-draft-session";
import { browserJournalStorage, readJournalDraft, writeJournalDraft } from "@/lib/journal-draft-storage";
import type { Draft, ItemDraftOwner } from "@/lib/item-drafts";

const loaded = new WeakMap<ItemDraftOwner, { generation: number; keys: Set<string> }>();

/** Browser persistence is an adapter; it does not own draft identity/revision. */
export function useJournalDraftStorage(key: string, isNew: boolean, draft?: Draft) {
  const { owner, userId } = useDraftSession();
  useEffect(() => {
    if (!isNew || !draft) return;
    let entry = loaded.get(owner);
    if (entry?.generation !== owner.generation) {
      entry = { generation: owner.generation, keys: new Set<string>() };
      loaded.set(owner, entry);
    }
    const keys = entry.keys;
    if (!keys.has(key)) {
      keys.add(key);
      const stored = readJournalDraft(browserJournalStorage(), userId);
      if (stored && !draft.dirtyFields.length) owner.change(key, stored);
    }
    // Flush on view unmount as well as after the existing debounce interval.
    const persist = () => {
      const current = owner.get(key);
      if (current && !current.data.id && (current.data.title || current.data.content)) {
        writeJournalDraft(browserJournalStorage(), userId, current.data);
      }
    };
    const timer = setTimeout(persist, 1000);
    return () => { clearTimeout(timer); persist(); };
  }, [owner, userId, key, isNew, draft]);
}
