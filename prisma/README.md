# Database setup

Bearing requires PostgreSQL. Use Node 22+ and `npm ci`, then `npm run db:generate`
to generate both Prisma clients. Configure a private `DATABASE_URL`.

For a disposable development/preview database:

```bash
npx prisma migrate deploy
# Review prisma/v1/schema.prisma and its migration SQL first:
BEARING_V1_SCHEMA_REVIEWED=yes npm run db:v1:deploy
```

The separate migration histories share User and OperationLedger. V1 adds `V1*`
tables, ownership constraints and one Me profile per account. Enabling
`BEARING_V1_ENABLED=true` requires both histories applied. `build:vercel` deploys
legacy migrations only; production V1 migration remains an explicit operator step.
Legacy content tables (`Item`, `Project`, `Link`, and the others named in
[ADR 0005](../docs/adr/0005-sunset-legacy-domain-and-coach.md)) stay until a
reviewed drop on or after 2027-01-26. Do not extend them. There is no conversion
into `V1Item`.
Never use `db:push`, `migrate dev`, resets or schema drops on live data.

Create accounts with `npm run db:invite -- email@example.com` and
invitation-only registration. Demo examples are an explicit per-account Settings
action. Legacy shared seed is disabled in V1. See [release runbook](../docs/RELEASE.md)
and [backup/restore](../docs/backup-restore.md).
