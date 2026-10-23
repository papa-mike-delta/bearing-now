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

Item `revision` starts at zero for existing and new Items. It is the concurrency
token for the domain write path described in Phase 1 of
[`docs/implementation-plan.md`](../docs/implementation-plan.md).
The nullable core columns allow existing callers to continue loading Items;
legacy metadata and date columns are retained. Task `status`, `dueDate`, and
`priority` already have normalized columns and are reused.

Link `type` remains a string to preserve existing values, including `related`,
`blocks`, `parent`, `subtask`, `references`, and `depends-on`. The core types
are `advances`, `tracks`, `related_to`, `mentions`, `scheduled_at`, and
`located_at`; the database default for new Links is `related_to`.
