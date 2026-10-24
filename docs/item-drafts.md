# Item draft ownership

The editor dialog, detail content editor, reading-progress control and full
journal editor use one `createItemDraftOwner` instance inside the signed-in
`ItemDraftSession`. Views own their rendering, selection and existing open Item
leases; the owner holds normalized snapshots, dirty fields, captured revision
and save outcomes. An existing Item without a valid revision cannot initialize
an editable draft. Editor partial seeds are completed by the Item query.

Saved Items use `item:<id>` keys. New drafts use independent `new:<UUID>` keys.
Switching views or unmounting an editor does not discard an Item's draft.
Closing the dialog retains edits; **Discard changes** resets the draft to the
latest received snapshot. Clean drafts follow refetches. Dirty or pending
drafts retain their original baseline revision, so a remote change produces a
conflict instead of silently replacing the user's content. A conflict refreshes
the Item query for the explicit discard action.

Every save captures a request ticket with its Item identity, session generation,
snapshot and submitted fields. Only the matching pending request can complete.
Success adopts the returned revision, retains changes made after submission,
and preserves dirty fields omitted by a partial content/journal save. New Items
adopt their server identity without losing newer edits. View callbacks check
the current selection before closing or navigating. Failures preserve content;
sign-out clears the owner and invalidates outstanding request tickets. Each
account gets its own provider instance.

The journal storage adapter retains browser restoration for new entries. It
stores title, content, domain and project under `lifeos-journal-draft:<userId>`,
migrating the old unscoped key once. Browser storage is separate from snapshot
and revision ownership and may be unavailable without disabling session drafts.
Successful publication clears the new-entry browser draft. Existing Item edits
remain in memory for the signed-in application session. No new automatic server
saves are introduced; reading progress retains its existing explicit control /
input-blur save behavior.

Unit tests exercise the owner and storage interfaces. `e2e/item-drafts.spec.ts`
covers navigation, conflicts, delayed replies, shared journal content, browser
restoration and sign-out. Keep `e2e/inbox.mobile.spec.ts` as the null-metadata
mobile regression. Follow `e2e/README.md` to run browser tests on a disposable
PostgreSQL database.
