# Playwright end-to-end suite

Run from this checkout on a disposable local PostgreSQL database:

```sh
npm install
npx playwright install chromium webkit  # webkit runs *.mobile.spec.ts as iPhone 13
# DATABASE_URL in .env.local or .env; migrate/seed first if necessary:
bun run src/lib/seed.ts
npm run test:e2e
npx tsc --noEmit
npx vitest run
```

The config starts `npm run dev` on http://localhost:3000 and reuses an existing server outside CI. The setup project submits the real login form using `demo@gmail.com` / `Password123`, then saves cookies and the onboarding preference to ignored `e2e/.auth/demo.json`. Chromium projects depend on that setup. To debug: `npm run test:e2e -- --headed`, `npx playwright show-report`, or `npx playwright show-trace <trace.zip>`.

Tests require PostgreSQL client tools (`pg_dump`, `pg_restore`) compatible with the server. Browser and dev server use `America/New_York` to reproduce the supplied environment and exercise habit date handling. One worker is intentional: restore/reset flows replace shared database contents. An automatic fixture snapshots the entire database before each test, resets the demo user's operation ledger to give that test an independent hourly allowance, and restores the snapshot afterward, including users, settings, ledger, tags and reviews. Unique UUID titles keep test records identifiable. Auth tests have separate empty browser storage. Never interrupt a destructive restore test or run this suite against a shared/production database. Dumps, reports, traces and auth state are ignored by Git.

Page objects are classes under `pages/`; UI actions exercise real forms, buttons and requests. API requests only arrange precise dates/metadata/tags or verify persistence. No application endpoint is mocked. The profile race test delivers the real preferences response after the real 2FA/profile response to deterministically exercise a naturally occurring response ordering.

## Inventory

[INVENTORY.md](INVENTORY.md) records every `page.tsx` and `route.ts`, HTTP methods, source locations for every JSX button/link/form and related input/action component, and client fetch/navigation targets. Regenerate with:

```sh
node e2e/scripts/inventory.cjs
```

There are three page routes: `/`, `/login`, `/app`. Sidebar and command palette navigation switches Zustand views inside `/app`; these are not separate Next.js routes. Every literal internal link/fetch target resolves to an existing route. Dynamic IDs can still refer to nonexistent records. External links and user-provided bookmark URLs are external targets. The inventory includes reusable components and dynamic templates rather than treating one mapped button as one static rendered instance.

## Flows covered

- Landing page Features, Domains and Philosophy anchors; Open app CTA.
- Unauthenticated app redirect; invalid-password rejection; unique account registration; real demo login; logout/session revocation and login again.
- Every sidebar destination: Dashboard, Inbox, Calendar, Agenda, Focus, Projects, Brain Graph, Reviews, Insights, All Items, Mind, Action, Health, Wealth, Network, Growth, Joy, Admin, Settings.
- Command palette navigation to Sanctuary; Sanctuary and journal editor entry points.
- Inbox capture; edit title and persist across reload; preserve tags during editing; archive; convert to task and activate; activate only selected captures in bulk.
- All Items create and persist each of the 17 supported item types; search; task completion, done filter and reopening.
- Dashboard Add task.
- Each of the eight life domains' primary create action and domain assignment.
- Projects create, open dashboard and add associated task.
- Connections add, verify persisted target and remove.
- Habit detail mark/unmark today and persisted logs.
- Calendar and weekly agenda display a newly scheduled event.
- Brain graph search, match count, zoom and reset.
- Focus timer preset, start, countdown, pause and reset.
- Daily and weekly reflection forms save unique content.
- Sanctuary breathing start/end; journal Publish persists entry.
- Insights Sync advances a past recurring finance due date and resets a stale habit streak.
- Settings profile save/reload; AI preference persistence; theme switching; 2FA setup/cancel; QR login generation.
- CSV download contains a newly created item.
- JSON backup download contains a newly created item; small valid import preserves item identity/content; tag roundtrip; full backup roundtrip; invalid import leaves data intact.
- Database reset clears application data and preserves the user session.

The inventory also records secondary controls (for example graph drag, specialized metadata variants, notification permission, AI provider configuration, and external links). Coverage above names the executable flows; an inventory entry alone does not imply a dedicated test. AI Smart Process requires an independently configured provider and is not asserted against an external model. QR generation and 2FA setup are exercised; a physical second-device scan and authenticator enrollment are not automated.

## Findings

All five regression tests assert correct user-visible behavior as normal passing tests.

| Flow | Expected | Actual | File/route at fault | Status (fixed in this PR / open) |
| --- | --- | --- | --- | --- |
| Settings profile reload | Saved name remains visible after reload regardless of response ordering | Preferences response contains no `name` but calls `setName("")`, overwriting the name from 2FA status when preferences arrives last | `src/components/bearing/views/settings-view.tsx`, mount effect | fixed in this PR — Guard preferences name updates with a string check so absent names cannot overwrite profile state. |
| JSON backup tag roundtrip | Restored item retains its tags | Import removes the item's `tags` field and calls `ItemDomain.create(itemData, [], actor)`; tag rows survive but associations are empty | `src/app/api/backup/route.ts` POST | fixed in this PR — Pass exported tag names to ItemDomain.create to reconnect imported items to tags. |
| Item editor tag preservation | Changing only the title preserves tags | Editor seeds `tagNames: []` rather than mapping existing `item.tags`, then saves the empty array and removes all associations | `src/components/bearing/item-editor.tsx` initialization/save | fixed in this PR — Initialize tagNames from the existing item tag associations. |
| Habit Mark today | Today becomes logged and the button changes to Done today | Parsing YYYY-MM-DD as UTC and then setting local midnight stores the previous date in America/New_York; UI still offers Mark today | `src/app/api/items/[id]/habit-logs/route.ts` POST | fixed in this PR — Use local calendar keys in the browser and store supplied dates at UTC midnight without local normalization. |
| Full JSON backup import | The app can restore its own exported dataset | HTTP 429 when item count exceeds the remaining 20-per-hour actor create allowance, including the seeded dataset; import is rejected before clearing data | `src/lib/domain/database.ts` `DatabaseDomain.clear` / `src/lib/domain/write-caps.ts`, reached by `/api/backup` POST | fixed in this PR — Exempt authenticated user restores at the domain cap boundary; ordinary creates and agent restores remain capped. |
| Inbox edit on a phone (live report) | Tapping the pencil on a bookmark capture opens the editor | Nothing happens: items saved without metadata come back as `metadata: null`; the editor seed spread overwrote the `{}` default and the bookmark fields read `form.metadata.medium` during render, crashing the dialog | `src/components/bearing/item-editor.tsx` initialization | fixed (fix-inbox-edit-and-app-guard) |
| Signed-in back navigation | Swipe-back from /app stays in the app | Landing and login pages were served (and bfcached) to signed-in users | `src/middleware.ts` (now `src/proxy.ts`) | fixed (fix-inbox-edit-and-app-guard) |

Restore exemptions apply only to authenticated user backup operations and retain distinct item.restore/link.restore ledger receipts so restored records do not consume ordinary create allowances. Agent restores still undergo cap preflight before data is cleared. Tests isolate tag restoration with a one-item backup and separately exercise the full exported dataset.

## Inbox edit 404 root cause

The reported 404 does **not reproduce in this checkout**. Both the current code and the original inbox implementation in this branch's history open the shared item editor with `openItemEditor(item)`; they do not navigate to an `/inbox/[id]/edit` page. Save uses `useUpdateItem` to PATCH `/api/items/${id}`. The matching route exists at `src/app/api/items/[id]/route.ts` and awaits Next.js's asynchronous params. Opening/closing the editor also calls the existing `/api/items/[id]/open` route.

The regression test creates its own capture, clicks that row's Edit button, changes the title, asserts HTTP **200** on the real PATCH, checks that the dialog closes, reloads, navigates back to Inbox, and asserts the updated title persists. It passes without an application change. The route inventory found no literal dangling inbox edit link or fetch. Consequently there is no evidence-supported root-cause fix to make here, and no application source was changed to manufacture one. A specific failing URL/click sequence is needed to investigate a different path. This test remains a normal passing test.

## Validation

Validated with:

- `npx tsc --noEmit`: passed; the suite is included in TypeScript checking.
- `npx vitest run`: 14 files, 133 tests passed; `e2e/**` is explicitly excluded.
- `npm run test:e2e`: exit 0, 83 green results in 4.8 minutes: 78 ordinary passes (including login setup) and 5 expected failures, with no skips or unexpected failures. Playwright's console reports both categories together as “83 passed”.

Reports, snapshots and session files stay untracked. Nothing is pushed.
