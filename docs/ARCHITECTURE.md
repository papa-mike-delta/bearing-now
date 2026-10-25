# V1 architecture

Next.js App Router serves the public `/`, `/help`, invitation-controlled `/login`
and authenticated `/app/*`. `BEARING_V1_ENABLED` selects the V1 workflow; the legacy
app remains available when disabled. V1 UI components are in
`src/components/bearing/workflow`. Existing editor, rich-text, draft and theme
components are reused. This is not a replacement repository.

## Storage and authorization

PostgreSQL has legacy tables plus additive `V1*` tables declared in
`prisma/v1/schema.prisma`. Both generated Prisma clients share User identity and
OperationLedger. V1 creates exactly one canonical Me Person per account through a
migration trigger. No legacy-data conversion or destructive reset is automatic.

`src/lib/v1/contracts.ts` validates canonical typed metadata. `service.ts`,
`workflow.ts` and `connected-service.ts` implement owned operations;
HTTP routes under `/api/v1` require enabled V1, existing account and fully verified
session. Expected-account headers bind browser writes to their original account.
Composite ownership constraints protect relationships. Writes use the shared audit
lock, transactional receipts and revisions; agents require approval and respect
editor leases. Views query the same Item IDs instead of copying records.

Seven Item kinds, optional singular Project, Tags/Areas and typed Links form durable
context. Journal moments preserve timestamped text and reference Items. Activity is
an observation/completion; Review is a structured reflection. Recurrence preserves
completed Task instances; saved scheduled Tasks expose fixed-calendar or
completion-relative setup and occurrence-history links in their editor. A Routine is Habit content plus independent occurrence
snapshots, not child Tasks. See [data foundations](redesign/DATA_FOUNDATIONS.md),
[daily workflow](redesign/DAILY_WORKFLOW.md) and [connected life](redesign/CONNECTED_LIFE.md).

## Offline transport

`public/bearing-outbox.js` is shared by the online client and minimal offline shell.
IndexedDB entries are keyed by account and stable client capture ID. Server sync
acknowledgement precedes local removal/state transition. Account locking prevents
wrong-account replay. The service worker caches the minimal capture shell, not an
unbounded private database. Browser eviction remains possible.

## Coach

The AI SDK invokes a configured server provider with bounded owned-record tools.
There is no arbitrary query/export/web tool. Saved conversations and explicit memory
are separate from Journal. Proposal tokens are account-bound; the model never gets
an apply tool. Preview/edit/approve runs shared domain validation in one transaction,
with fresh revisions, leases, rate caps and replay receipts. See
[Coach design and configuration](redesign/CONVERSATIONAL_COACH.md).

## Portability and operations

The full typed backup manifest in `backup-contract.ts` covers all V1 associations,
histories, chats/preferences and account audit. Restore validates the graph then
replaces content atomically for the same owner. Receipts remain append-only.
Optional demo rows carry a batch marker; removal refuses personal dependencies.
See [backup](backup-restore.md) and [release runbook](RELEASE.md).

Legacy component/docs are retained as historical implementation references, not
current product promises. No Finance ledger, fixed Domains or 17-type ontology is
exposed in V1 navigation. Invitation-only registration, external-file references,
provider disclosure and offline limits must remain consistent across public copy.
