# Schema migrations

The baseline records the schema previously installed with `prisma db push`.
The schema foundations migration adds fields to Item and indexes to Link;
it does not replace Items, change existing Link types, or rewrite metadata.

For a new, empty PostgreSQL database, set `DATABASE_URL` and run:

```sh
npx prisma migrate deploy
npx prisma generate
```

For an existing database that matches the original schema and has no Prisma
migration history, first mark the baseline as already applied. Do not execute
the baseline SQL against an existing database:

```sh
npx prisma migrate resolve --applied 20261023000000_baseline
npx prisma migrate deploy
npx prisma generate
```

Item `revision` starts at zero for existing and new Items. Existing Item reads
return it, and Item updates atomically increment it, including scheduler updates
and project unlinking. Conflict rejection belongs to the domain write path in
Phase 1 of [`docs/implementation-plan.md`](../docs/implementation-plan.md).
The nullable core columns allow existing callers to continue loading Items;
legacy metadata and date columns are retained. Task `status`, `dueDate`, and
`priority` already have normalized columns and are reused.

Link `type` remains a string to preserve existing values, including `related`,
`blocks`, `parent`, `subtask`, `references`, and `depends-on`. The core types
are `advances`, `tracks`, `related_to`, `mentions`, `scheduled_at`, and
`located_at`; the database default for new Links is `related_to`.
`src/lib/link-type.ts` validates new Link writes in the API, seeds, and backup
restore. Invalid types return HTTP 400; backup restore validates all Link types
before clearing existing data. Legacy Link types remain readable in the database,
but must be changed to a core type before restoring an old backup.

Verified on PostgreSQL 17: both migrations deploy to an empty database; marking
the baseline applied and deploying foundations also succeeds with existing core
Items, legacy Link types, metadata, tags, projects, and habit logs. Existing data
is preserved, revisions start at zero, and normalized fields round-trip through
Prisma. Both resulting databases match `schema.prisma` via `prisma migrate diff`;
the three Link indexes, unique constraint, and `related_to` default are verified.

## Operation ledger and write caps (#9)

The operation-ledger migration adds one independent audit table. Each field has
a purpose: `id` identifies a receipt; `actor` attributes the attempt and scopes
caps; `operation` identifies the domain action; `payload` preserves its input as
a JSON string; `status` distinguishes success from refusal; `receipt` preserves
the JSON domain result (including conflict/refusal details); `createdAt` dates
the attempt for rolling-hour counts. The composite index orders actor,
operation, status, and time for those counts. No foreign key ties audit history
to an Item: reset and restore preserve it and cannot reset the cap allowance.

`ItemDomain`, `LinkDomain`, and `DatabaseDomain.clear` use
`OperationLedger.run`: write and receipt commit in one Prisma transaction.
Validation, stale revision, cap, and open-item refusals also commit a receipt.
An unexpected database/ledger error rejects the transaction and rolls back its
writes. One PostgreSQL transaction advisory lock serializes these operations
and presence changes across workers. This deliberately favors a small, sound
write boundary over throughput in this personal app. Counts run after acquiring
the lock; audit timestamps are assigned after the operation, rather than using
client-supplied Item/Link creation dates or a transaction's pre-lock start time.

Caps apply to every actor: 20 successful Item creates and 50 successful Link
creates in `(now - 1 hour, now]`. Refusals and existing-Link note updates do not
consume allowance. A cap refusal is `{ ok: false, rateLimited: true, limit }`
and maps to HTTP 429. Seed and backup restore use the same capped domain path.
Both demo fixtures contain 20 Items so a fresh seed fits the allowance. Restore
checks the entire input's allowance under the transaction lock before clearing
data; an over-budget restore leaves the dataset intact. This is a preflight
check, not a reservation: concurrent same-actor creates or other later failures
can still leave an import partially applied, as these workflows are sequences
of domain transactions. There is no maintenance bypass.

Browser mutation routes derive `user:<id>` only from the signed session cookie;
body/header actor claims have no authority. Unverified requests use
`agent:anonymous` under the existing middleware policy. The scheduler uses
`agent:scheduler`, seeds use `agent:seed`, and omitted domain actors default to
`agent:internal`, so forgetting identity cannot bypass open-item protection.
Future Coach calls must explicitly pass a stable `agent:<id>`, even when run
on behalf of a signed-in user. User actors may edit their own open Items;
agent actors must refuse updates/archives and Link changes touching either
open endpoint. Revision checks still apply to user edits.

The detail sheet, Item editor, and journal editor use `useOpenItem`: PUT
`/api/items/[id]/open` immediately and every 30 seconds, DELETE on close. Each
mount gets a unique lease; close follows pending refreshes. The verified user's
lease is stored in the existing `Setting` table as
`open-item:<hex Item id>:<hex actor>:<lease>`, with a UTC ISO expiry 90 seconds
after refresh. Hex encoding avoids prefix collisions and SQL LIKE wildcards.
Independent leases prevent one tab from clearing another's protection. Expired
markers are ignored (and cleaned on the next presence change), so a crashed tab
does not block writes indefinitely. Open/close operations are ledgered without
changing Item revisions. An active lease yields
`{ ok: false, itemOpen: true, itemId }`, mapped to HTTP 423.

Verified on isolated PostgreSQL 17: all three migrations deploy and the schema
matches Prisma; concurrent requests admit exactly 20/21 Item creates and 50/51
Link creates, actors have separate allowances, the rolling-hour boundary
expires, multiple leases and TTL enforce protection, and a failing ledger
trigger rolls back both an Item create and an Item revision update. Domain and
route Vitest tests mock only the database and cover successes and refusals,
transaction failure, cap boundaries, presence ownership, and HTTP mappings.
The reduced demo completes with 20 Items; over-budget restores leave the
existing dataset intact.
