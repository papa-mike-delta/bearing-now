# V1 architecture

Next.js App Router serves the public `/`, `/help`, invitation-controlled `/login`
and authenticated `/app/*`. Production and `BEARING_V1_ENABLED=true` serve the V1
workflow. Disabled V1 shows setup guidance and does not mount another product.
There is no legacy shell to fall back to.

V1 UI components are in `src/components/bearing/workflow`. The Focus timer, Graph
explorer, rich-text editor, draft owner, layout and theme components are shared
with that workflow. Product code lives in `src/lib/v1/*`, `prisma/v1` and `/api/v1`.
Do not add a third Prisma client or revive `src/lib/domain` / `src/lib/coach`.

## Storage and authorization

PostgreSQL keeps shared `User`, `Setting` and `OperationLedger` rows, plus additive
`V1*` tables declared in `prisma/v1/schema.prisma`. The legacy Prisma client in
`src/lib/db.ts` is for those shared tables only: sign-in, theme import and receipt
reads. V1 services use `src/lib/v1/db.ts` and map `Account` to `User` and `Ledger`
to `OperationLedger`. V1 creates exactly one canonical Me Person per account through
a migration trigger.

`Item`, `Project`, `Link`, `Domain`, `Tag`, `TagOnItem`, `HabitLog`, `Review`,
`ReviewItem` and `Reminder` remain in the database until a reviewed drop on or
after **2027-01-26** ([ADR 0005](adr/0005-sunset-legacy-domain-and-coach.md)).
Do not query or extend them. There is no `Item` → `V1Item` conversion.

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

Pre-V1 content routes (`/api/items`, `/api/projects`, `/api/coach`, `/api/seed`, and
the other routes listed in `LegacyApi`) return **410**. `/api/auth/*`,
`/api/preferences/theme` and `/api/receipts/:id` stay.

## Offline transport

## Offline transport

`public/bearing-outbox.js` is shared by the online client and minimal offline shell.
IndexedDB entries are keyed by account and stable client capture ID. Server sync
acknowledgement precedes local removal/state transition. Account locking prevents
wrong-account replay. The service worker caches the minimal capture shell, not an
unbounded private database. Browser eviction remains possible.

## Coach

The V1 Coach lives in `src/lib/v1/coach` and `/api/v1/coach`. The AI SDK invokes a
configured server provider with bounded owned-record tools. There is no arbitrary
query/export/web tool and no legacy `/api/coach` tool runner. Saved conversations
and explicit memory are separate from Journal. Proposal tokens are account-bound;
the model never gets an apply tool. Preview/edit/approve runs shared V1 validation
in one transaction, with fresh revisions, leases, rate caps and replay receipts.
See [Coach design and configuration](redesign/CONVERSATIONAL_COACH.md).

## Portability and operations

The full typed backup manifest in `backup-contract.ts` covers all V1 associations,
histories, chats/preferences and account audit. Restore validates the graph then
replaces content atomically for the same owner. Receipts remain append-only.
Optional demo rows carry a batch marker; removal refuses personal dependencies.
See [backup](backup-restore.md) and [release runbook](RELEASE.md).

ADR 0001, ADR 0002 and ADR 0004 describe the removed pre-V1 Item model and Coach
tools. They are history. [ADR 0005](adr/0005-sunset-legacy-domain-and-coach.md) is
the product rule: greenfield V1, no conversion, and a dated table drop.
