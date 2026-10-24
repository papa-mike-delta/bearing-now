# Atomic backup restore

`BackupDomain.restore(userId, payload, actor)` owns validation and replacement.
The HTTP route supplies the verified account and actor and serializes the result.
The v1 backup shape and success response remain unchanged; omitted/null
collections are treated as empty, as in older backups.

The clear, ancillary creates, Item/Link domain writes and their operation ledger
receipts use one PostgreSQL transaction. Existing domain functions accept a
transaction client for composition and still acquire the same transaction-scoped
advisory lock and enforce their normal guards. The restore holds that lock from
cap preflight through commit, so another worker cannot consume the allowance
between preflight and replacement. The transaction allows 10 seconds to acquire
a pool connection and 60 seconds to finish; a timeout rolls back the replacement.

Authenticated-user restores retain `item.restore` / `link.restore` receipts and
the existing create-cap exemption. Agent restores remain capped and cannot
replace a dataset with active open Item leases. Every imported owner field is
ignored; parent and endpoint references must belong to the destination account.
Ancillary creates accept only scalar fields, preventing nested relation writes.
Existing replacement semantics (including removal of account settings) remain.

A domain refusal is thrown inside the transaction so earlier accepted writes
and receipts roll back. It is returned as a structured refusal after rollback,
without a `receiptId`: no new refusal or success receipts from that attempt
survive. Existing ledger history remains. Database exceptions also roll back
and retain the route's existing HTTP 500 error response.

## PostgreSQL regression tests

```sh
npm ci
npx prisma generate
RESTORE_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/bearing_restore_test npm run test:integration
npm test
npx tsc --noEmit
```

Use a disposable PostgreSQL database with permission to create/drop schemas.
The integration config creates a random schema, deploys the existing migrations,
and drops only that schema afterward. It refuses to run without the explicit
test database variable. The production database URL is not used as a fallback.

The tests call the production restore interface against PostgreSQL, including
late Item/Link refusals, a late database constraint failure, complete data and
receipt preservation, account isolation, exported data/tag roundtrips,
authenticated-user exemptions and concurrent agent Item/Link allowance use.
Route unit tests cover authentication, early validation and response formatting;
mocked transaction callbacks are not used as evidence of database rollback.
The `restore-integration` CI job runs these tests with PostgreSQL 16.
