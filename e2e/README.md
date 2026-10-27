# V1 browser verification

Use Node 22+, PostgreSQL 16 client tools (`pg_dump`/`pg_restore`) on PATH, installed
Playwright Chromium (`npx playwright install chromium`) and a **disposable** database.
Build first with `npm run build`. Then:

```bash
V1_TEST_DATABASE_URL=postgresql://... npm run test:e2e:release
```

The release config applies both migration sets to the supplied disposable DB,
provisions a test-only account, starts the production build and deterministic local
Coach provider, signs in, and runs V1 suites on desktop and emulated phone Chromium.
Do not point this command at live data. Tests snapshot/restore the full disposable
DB around each test and reset fixture account allowances. Test-only credentials are
not advertised or provisioned by the application. Use a fresh DB for each release.

`RELEASE_CHROMIUM_PATH` optionally selects a portable Chromium executable for
restricted CI. `RELEASE_BASE_URL` skips local server provisioning and targets an
already provisioned isolated test deployment; use only with a disposable DB that
matches that deployment and the fixture provider configuration. It is not a command
to reset a production deployment. Hosted live-provider smoke tests must be performed
separately with fictional records and approval/refusal checks.

`test:e2e:coach` runs only Coach browser journeys. `test:e2e` uses the general
config. With `BEARING_V1_ENABLED=true` it selects V1 workflow tests. Without the
flag it runs landing and auth only. The pre-V1 shell suite is gone
([ADR 0005](../docs/adr/0005-sunset-legacy-domain-and-coach.md)).
`INVENTORY.md` is a historical snapshot of controls that have been removed.

See [release matrix and preview checklist](../docs/RELEASE.md). Screenshot assets
must come from actual V1 pages with fictional data; never publish private accounts.
