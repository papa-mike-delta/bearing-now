# Coach receipt explanation

`src/lib/coach/receipt-explanation.ts` is the in-process boundary for interpreting Coach operation ledger data. It accepts an operation, durable status, payload and receipt (decoded values or stored JSON strings), plus an already resolved, user-scoped title map. It performs no I/O and does not alter stored receipts.

The explanation contains the operation, success/refusal outcome, action, Item references, subject title and optional Link destination title. One vocabulary covers supported Item writes, Link writes (including legacy `link.update`) and Coach reads. Unknown operations retain their operation name; malformed data uses safe Item/Items fallbacks. An explicit refused receipt cannot be rendered as success even if its status is inconsistent.

`CoachTools` supplies execution-time titles. A successful Item receipt supplies its resulting title, including a title changed by that operation. Refusals prefer the title resolved before execution, then stored title data, then Item. Link tools resolve both endpoints in one user-scoped query and preserve source → destination order. Missing destination titles remain omitted, matching the activity presentation.

`OperationLedger.listCoachActivity` supplies current titles from its existing batched, user-scoped query. Current titles take precedence over receipt/payload titles, with Item as the final fallback. Its eligibility policy remains successful supported writes plus all refusals; successful reads remain excluded. Ordering, the 50-entry limit, ownership filters and receipt storage are unchanged. The supported write list is derived from the interpreter's vocabulary.

`receiptFeedback` and `receiptActivityLine` present the structured explanation as a single line. Receipt-link rendering stays in `receipt-link.tsx`; receipt IDs and navigation are unchanged. Whitespace in displayed titles is collapsed to retain one-line feedback; Item IDs are preserved verbatim.

Shared fixtures exercise both real consumers. Tests cover successful/refused Item and Link operations, read wording, legacy shapes, unknown operations, malformed JSON, title freshness, missing endpoints, and scoped title lookup. Existing domain/access-control and receipt-link tests remain in place.
