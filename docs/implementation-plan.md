# Phased implementation plan: Life OS → bearing.now

Derived from closed Wayfinder decisions (#2–#5) and ADRs 0001–0004.

## Phase 0 — Schema foundations

**Goal**: Prisma schema matches the locked model.
**Tasks**:
- Add `revision` (or optimistic `updatedAt` check) to Item
- Add normalized columns where decided (Note.summary, Person.relationshipTier, Person.phone, Person.birthday, Event.startAt/endAt, Task status/due/priority, Habit frequency)
- Expand Link.type allowed values and add composite indexes + unique (fromId, toId, type)
- Migration
**Done when**: schema migrates cleanly; existing data still loads.

## Phase 1 — Domain write path + revision checks

**Goal**: Every Item update goes through a domain function that enforces revision.
**Tasks**:
- Extract pure domain functions for create/update/archive Item and create/delete Link
- Reject mismatched revision with a conflict result
- Unit tests for conflict and success paths
**Done when**: UI and future Coach both call these functions; direct Prisma writes for mutations are gone.

## Phase 2 — Operation ledger + write caps

**Goal**: Every mutation is ledgered; caps are enforced.
**Tasks**:
- OperationLedger table and write-path recording (actor, payload, status, receipt)
- Cap checks (20 Item creates + 50 Link creates per hour; refuse writes to Items the user has open)
- Tests
**Done when**: a write without a ledger entry is impossible; caps reject excess writes.

## Phase 3 — Coach tools (feature-flagged)

**Goal**: In-app Coach can call the same domain functions.
**Tasks**:
- Tool implementations: searchItems, getItem, getLinks (one hop), createItem, updateItem, archiveItem, createLink, deleteLink, listOpenItems
- Feature flag; tools stay off until Phases 1–2 are tested
- Short toast + receipt return
**Done when**: Coach can perform any user-level action through the rails; flag can be turned on safely.

## Phase 4 — Theming port (parallelizable)

**Goal**: Full shadcn/create theming with override layer.
**Tasks**:
- Generate script from ui.shadcn.com/create
- Settings import (URL or CSS/JSON) that writes an override file
- Light/dark coverage
**Done when**: user can import a theme and see it applied without touching base globals.css.

## Phase 5 — Receipt & activity surfaces

**Goal**: User can review what the Coach did.
**Tasks**:
- Coach activity feed (Coach writes + conflict receipts)
- Short one-line toasts with link to receipt
**Done when**: every Coach write is visible in the feed and via toast.

## Notes

- Implementation of Phase 1 (first rigor rail) is deferred to Codex & Cursor.
- Phases 4 can run in parallel with 1–2.
- No Coach writes until Phase 2 is complete and tested.
