# V1 release runbook and acceptance matrix

V1 implementation spans #44–#48. #55 audits the actual UI transition and fills gaps, including the missing Review composer. Closed tickets and a passing local build do not establish verified production behavior. See the [acceptance report](qa/V1_ACCEPTANCE.md) and [requirements ledger](qa/V1_REQUIREMENTS.md).

## Preview first

1. Create an isolated preview project/environment and external PostgreSQL database.
   Never copy production connection strings into tests. Pin Node 22+.
2. Install with `npm ci`, configure `DATABASE_URL`, a unique 32+ character
   `SESSION_SECRET` and server-only Coach provider/model credentials if testing AI.
3. Build with `npm run build:vercel` (legacy migrations only). Review V1 migration
   SQL against the preview DB, then explicitly run
   `BEARING_V1_SCHEMA_REVIEWED=yes npm run db:v1:deploy`. Set
   `BEARING_V1_ENABLED=true`. No live conversion/reset is part of this process.
4. Create a short-lived invitation using `npm run db:invite --
   preview-user@example.com`; register at `/login`. Check an empty account with Me.
5. Follow the matrix below using two invited accounts and fictional data. Verify
   responsive desktop/phone layouts, keyboard focus and labels, reduced motion,
   error/retry states and provider disclosure. Use an actual configured provider
   for a small read + approved/refused write smoke test; deterministic fixture
   tests do not prove production provider behavior.
6. Export a preview backup, clear and restore, and inspect records/history in both
   accounts. Confirm the unrelated account is unchanged. Test demo add/repeat/remove.
7. Record preview URL, commit, runtime, database migration status, browser versions,
   provider/model and checks. Any unrun check remains open. Do not describe a local
   test server or public landing-page HTTP check as authenticated staging QA.

Vercel Hobby requires external PostgreSQL and server-side secrets. Keep preview
and production databases/keys separate. Match the chosen runtime's function time
limits to the Coach route; streaming timeout/provider errors are retryable and
must not claim writes succeeded. QR challenges are ephemeral and may fail across
workers/restarts; normal password/TOTP sign-in is the supported reliable path.

## Production and rollback

Production deployment requires explicit deployment-specific approval **after** the
preview evidence is reviewed. Before migration: take a provider-level backup,
verify recovery in an isolated database, retain the previous build and review SQL.
Do not run `db:reset`, `db:push`, `migrate dev`, table drops or demo CLI seeding.

Apply only reviewed additive migrations and enable the feature flag after success.
Monitor auth, account isolation, API errors and outbox/Coach refusal behavior. To
rollback, disable `BEARING_V1_ENABLED` and restore the previous application build;
leave additive V1 tables intact. The current build shows setup guidance when disabled; only restoring an earlier build re-exposes the legacy UI. Neither action converts V1
records. Preserve V1 data for a forward fix. Database disaster recovery is separate,
reviewed operator work; never silently restore over new live writes.

## Acceptance journeys and evidence owners

The numbered journeys correspond to the approved specification. These test files
are the executable checks; also run every journey on the isolated hosted preview.

| Spec journey | Automated coverage |
| --- | --- |
| 1 Invitation, empty account, isolated Me | `v1-foundations.spec.ts`; foundations integration invitation/ownership/2FA cases |
| 2 Offline launch, capture, reconnect exactly once and account switch | `v1-workflow.spec.ts`; outbox unit and workflow integration retry cases |
| 3 One Task across Journal/Today/Search/Project | workflow browser and integration canonical-reference cases |
| 4 Optional Project; inherited vs direct Areas | workflow browser; foundations ownership/inheritance cases |
| 5 Interactive checklist and promotion once | workflow browser; promotion idempotency integration |
| 6 Routine checklist vs completion and next-period reset | `v1-connected.spec.ts`; occurrence integration cases |
| 7 GPS Place and external Navigate | connected browser and capture integration; explicit mocked location permission |
| 8 Media Bookmark with creator/format | connected browser and typed-contract tests |
| 9 Person references, follow-up vs real interaction | connected browser and Person context integration |
| 10 Private Me-linked health reference | connected browser and cross-user integration |
| 11 Multiple check-ins and separate Review | connected browser; foundations/workflow integration |
| 12 Focus session persisted once | connected browser; stable-key Focus integration |
| 13 Calendar/completion recurrence, timezone/DST/history | foundations integration; dates unit tests; release recurrence browser |
| 14 Canonical Search/Calendar/Graph references | workflow and connected browser; bounded search integration |
| 15 Grounded Coach, approved batch, refusal/retry | `v1-coach.spec.ts`; Coach integration with AI SDK fixture |
| 16 Full export/clear/restore, history and isolation | foundations round-trip/rollback tests; Settings release browser |
| 17 Truthful public copy and complete setup | release browser, source/metadata tests, docs review |

`npm run test:e2e:release` runs V1 browser suites on desktop Chromium and emulated
phone Chromium using the deterministic local provider. Native Safari and assistive
technology checks remain explicit manual preview checks; emulation is not Safari
certification. DB suites include full table coverage (including saved messages,
proposals, preferences, recurrence, joins and audit), foreign collisions and
late-insert rollback. Demo tests include concurrent setup, repeat setup, injected
late failure, retry and unrelated data preservation.

## Known boundaries

Offline supports text capture only, after a prior signed-in visit. Browser storage
can be evicted; local outbox/drafts are not server backups. Restore is same-account,
not migration to another identity. Coach has no external research and no autonomous
writes. Keys and requests go through configured external providers; their retention
rules apply. No uploaded-file hosting, notification delivery or collaboration.

## Existing accounts and deployment mismatch

`BEARING_V1_ENABLED=false` remains the safe initial setting. `/app` and recognized `/app/*` routes explain setup rather than mounting the retired Finance/Domain/17-type shell. Enabling the flag does not migrate legacy Items, Projects or Journal content. Shared identity does not imply shared content tables.

Before a live cutover, inventory legacy and V1 records per account, back up both schemas, and agree whether to retain legacy content for reference or implement a separately reviewed conversion with explicit mappings. No automatic conversion/deletion is included in #55. Never present an empty V1 workspace as proof an existing account had no data.

For an old-sidebar report, record deployment URL and Git SHA, confirm the hosting flag without copying secrets, confirm both migration histories, then use the landing CTA and normal login to open `/app`. Compare with a direct V1 route and fresh session. Test installed PWA/reload without deleting unsynced local data. This build never mounts legacy `Shell` from `/app`; a persistent old UI requires checking the deployed build and cached document.

Hosted verification needs access through deployment protection and two invited test accounts in an isolated preview. An inaccessible deployment is blocked, not passed. Production flags, security protection and data must not be changed simply to obtain screenshots.
