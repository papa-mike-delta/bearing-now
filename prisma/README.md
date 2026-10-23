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
