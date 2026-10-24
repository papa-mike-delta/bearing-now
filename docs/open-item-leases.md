# Open Item leases

`OpenItemLeases` owns the server-side Setting representation, identity checks,
expiry, active lease lookup and enumeration. `ItemDomain.setOpen` retains its
public interface and operation ledger transaction; `WriteCaps.openItem` retains
its actor exemptions and delegates protected-Item lookup; `listOpenItems`
delegates enumeration. There is no schema or stored-key migration.

Each browser mount uses an independent lease token. Refresh replaces only that
lease's expiry with the captured current time plus 90 seconds. Close removes
only that owner/Item/actor/token key. Refresh and close do not change the Item
revision. Mutations and protected writes still use OperationLedger's existing
transaction-scoped advisory lock, so a Coach write waits for a pending refresh
before deciding whether the Item is protected.

A lease is active only when its key has canonical UTF-8 hex Item/actor fields,
the actor matches its owner, its token is valid, its canonical ISO expiry is
strictly later than the lookup's captured time, and the referenced Item exists
under that owner. Expiry at exactly the current time is inactive. Multiple
leases for the same Item are deduplicated for enumeration. Corrupt, orphaned,
foreign and expired markers cannot create inconsistent protection/read results.
Contradictory Setting ownership is refused during refresh/close rather than
updating another owner's row. Enumeration keeps the existing title ordering.

The browser hook is unchanged: refresh every 30 seconds, serialize refreshes,
and queue DELETE after every already-pending refresh during cleanup. A remount
(including React effect replay) uses a new token, so old cleanup cannot close
the new lease. Transport failure remains best-effort; expiry clears abandoned
leases.

## Validation

`npm test` includes production-effect callback tests for delayed refresh ordering,
30-second refresh, cleanup, failed transport and remount tokens. PostgreSQL tests
in `integration/open-item-leases.test.ts` exercise the public Item/Coach/domain
interfaces for independent tabs, exact 90-second expiry, refresh extension,
isolation, valid legacy keys, malformed markers and write exemptions. A
concurrency test observes a waiting advisory lock in PostgreSQL before releasing
the refresh transaction.

Run with the existing disposable-database integration command:

```sh
RESTORE_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/bearing_restore_test npm run test:integration
```

The existing config uses a randomly named schema and deploys the migrations;
each integration file cleans up its test schema. The CI integration job includes
both backup rollback and lease behavior tests. Domain/Coach unit tests now use
the lease interface for refusal scenarios instead of repeating storage keys.
