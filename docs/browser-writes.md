# Browser Item write outcomes

`createBrowserWrites` owns outcome decoding, affected-read invalidation and one
refusal-notification callback for ordinary Item/Link writes and Coach calls.
Domain decisions remain on the server. `fetchWriteTransport` is the owned HTTP
adapter; `ScriptedWriteTransport` supplies deterministic replies in tests.

The discriminated outcome is success, conflict, rate-limit, item-open, error,
malformed or network. Structured refusals preserve their current revision,
limit, protected Item id and optional receipt id. HTTP 2xx alone cannot turn a
refusal into success. Missing fields, contradictory envelopes and invalid success
shapes produce an unconfirmed/malformed outcome. Transport failure is distinct
from a server refusal. Neither case automatically retries a write.

`useBrowserWrites().value` preserves the existing mutation-hook success values
and throws `BrowserWriteError` on failure. Its `outcome` exposes the complete
typed failure; `status` and `receiptId` remain directly available. Draft owners
retain this failure without clearing edits or replacing the captured revision.
The shared boundary already reports it; view catch handlers call
`reportWriteError` only as a fallback for errors outside that boundary. Coach
success feedback stays in the panel, using the server's message; operation
meaning and title interpretation remain the subject of #35.

## Refresh ownership

Query keys live in `query-keys.ts` and remain re-exported by `hooks.ts`.
Invalidation uses family prefixes so every parameterized graph, calendar, search
and list variant matches. Detail refreshes target the affected Item ids.

| Outcome / operation | Affected reads |
| --- | --- |
| Item create/update/archive/capture success | Item detail, lists/inbox, graph, calendar, project details/summaries, stats, insights, search, on-this-day, tag membership counts and Coach activity title references |
| Link create/delete success | Both endpoint details and Item-containing lists/calendar/project/insights/search/on-this-day, graph and Coach activity |
| Habit toggle success | Detail/logs, Item lists, stats, insights and project details |
| Conflict | Affected Item details, so explicit discard can use the refreshed snapshot |
| Coach refusal with a receipt | Coach activity, plus conflict detail refresh when applicable |
| Successful Coach read | No write-dependent refresh |
| Scheduler run | Item-dependent families and cached details; also reconciled on failure because earlier scheduler writes may already have committed |

Domains, reviews, preferences, theme and session queries are not flushed by these
writes. Cache refresh failures do not reclassify a committed write as a failed
write. The Coach activity feed uses its own query key instead of panel-owned
fetch/refresh state; successful ordinary title changes also refresh live titles.

## Receipt access

Coach links retain `/api/coach?receipt=...`. Ordinary refusal links use the new
authenticated `GET /api/receipts/[id]`, scoped to the session user's operation
ledger entries and available when Coach tools are disabled. Missing and foreign
receipts both return 404. The endpoint performs no mutation. It also tolerates
legacy payloads that are not valid JSON. Existing write response bodies and
server-side write guards are unchanged; receipt ids are preserved when supplied
by the response, not fabricated for REST successes that omit them.

## Validation

Unit tests drive ordinary and Coach requests through the same interface with
scripted success/refusal/malformed/network replies. A real QueryClient verifies
that parameterized affected caches become stale while unrelated caches remain
valid. Tests also cover receipt routes, notification count, draft preservation,
invalid response identities and failed cache refreshes.

`e2e/browser-writes.spec.ts` exercises an ordinary edit and a Coach edit against
the real server, verifying graph/list/detail freshness. A stale save must retain
its draft, display exactly one toast and resolve its owned receipt link. The
Playwright-managed disposable test server enables `COACH_TOOLS_ENABLED=true`;
when reusing an already-running server, start that server with the same flag.
No production feature-flag default changes.
