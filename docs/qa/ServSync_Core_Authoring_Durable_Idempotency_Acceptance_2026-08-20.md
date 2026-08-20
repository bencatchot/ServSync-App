# ServSync Core-Authoring Durable Idempotency Acceptance - 2026-08-20

## Scope

FB-039E1 is the protected Phase 0.4 backend slice for homeowner service Request creation and direct Estimate/Invoice Draft create/update saves. It starts from merged PR #509 at `4a2fb59b1701d25e6903e564ac2e2337358842be`. It does not change role authority, lifecycle meaning, payment rules, provider behavior, environment configuration, or Production business data.

Branch: `codex/fb039e1-core-authoring-idempotency-v1`

Draft PR: [#510](https://github.com/bencatchot/ServSync-App/pull/510), initial implementation head `e1ef6e51734aef37677ffd16fba81fff8aeeaa44`.

Migration: `servsync-core-authoring-durable-idempotency.sql`

Migration SHA-256: `5a364e95d2e791f0adc4712bc71502ebc732f3285e79c690220020e83b9f77f6`

Migration lines: 961

Forward fix: `servsync-core-authoring-request-preparation-renewal-forward-fix.sql`

Forward-fix SHA-256: `b4db9bebfc085e7b2c02a48797ed05c99f4e3aa81739c35d84c84bc36de28eb8`

Forward-fix lines: 207

## Durable Operation Contract

- Private `servsync_core_authoring_operations` receipts are purpose-bound by actor, operation type, and operation UUID. The table is postgres-owned, forced-RLS, policy-free, and unavailable through direct browser or generic service-role table access.
- Canonical JSON fingerprints include every persisted semantic field, ordered line/schedule payloads, subject/property/source lineage, pricing, and Request media metadata. SHA-256 is computed server-side.
- A transaction-scoped advisory lock is acquired before receipt/result resolution. The same key and canonical payload returns the original result; changed payload reuse fails closed.
- Request preparation gives each approved media item one deterministic actor/operation/ordinal/SHA path. Finalization verifies Storage owner, size, MIME type, SHA metadata, and operation metadata before one transaction inserts exactly one Request, one initial message, and its registered media rows.
- An expired same-payload prepared Request renews the same receipt for 30 days under the existing advisory lock after revalidating the active contractor connection and homeowner-owned property. It preserves the operation key and deterministic manifest, rejects conflicting payload reuse, and never mutates a succeeded receipt. Existing partial or complete deterministic uploads remain reusable.
- Estimate save replaces draft header, ordered lines, and optional payment schedule in one transaction. Invoice save replaces an unpaid Draft header and ordered lines in one transaction without resetting payment state.
- Existing capability helpers remain authoritative. Request creation derives the homeowner and contractor through the active connection and owned home. Estimate authority remains Owner/Admin/Office. Invoice authority remains billing-authorized Owner/Admin/Office. Field Technician, Viewer, homeowner authoring, and cross-tenant calls remain denied.
- SECURITY DEFINER functions are postgres-owned with fixed `search_path=public`, explicit PUBLIC/anon/service-role revocation, and only the intended authenticated grants. Private hash/lock/media helpers are not browser-callable.

## Rollout Evidence

### Sandbox

- Target: `zpzdkoaubyjtsomccxya`.
- Exact migration applied once from `2026-08-20T17:15:07Z` through `17:15:07Z` after rollback-only compile and security review.
- Sequential replay, true concurrent replay, lost-response replay, same-key/conflicting-payload denial, Request media registration, Estimate/Invoice create and update replay, invalid replacement rollback, sent/non-Draft denial, connected/local parity, cross-tenant denial, homeowner denial, and Owner/Admin/Office versus Field Technician/Viewer role boundaries passed.
- Relevant pre/post domain counts were exact: Requests 45, messages 72, Request media 3, Estimates 138, Estimate lines 317, schedules 3, Invoices 84, and Invoice lines 105.
- Controlled marker rows, receipts, temporary local Customer/property records, and prepared Storage objects returned to zero.
- The exact 207-line renewal forward fix was applied from `2026-08-20T18:56:55.931Z` through `18:56:56.199Z`. The expanded runtime matrix proved expired same-payload renewal with one of two objects present, renewal with both objects present, duplicate-object reuse, conflicting-payload denial, successful-receipt immutability, exact two-file commit, role/tenant boundaries, and cleanup. Pre/post counts remained Requests 47, messages 74, Request media 3, Estimates 139, Estimate lines 318, schedules 5, Invoices 84, and Invoice lines 105.

### Demo

- Target: `bdytwgejqnlblhrnqxkp`.
- Exact bytes applied from `2026-08-20T17:19:59Z` through `17:20:00Z` after Sandbox passed.
- Catalog/security parity and bounded fictional Owner/homeowner replay, media, connected/local, lifecycle, cross-tenant, and zero-residue checks passed. Demo Recorder and existing Marketing state were outside the migration and unchanged.
- The same forward-fix bytes were applied from `2026-08-20T18:59:47.325Z` through `18:59:47.778Z`. The expanded bounded replay matrix passed, including partial/all-existing media renewal and successful-receipt immutability, then returned Requests, messages, media, Estimates, lines, schedules, Invoices, lines, and receipts to zero.

### Production

- Target: `uqgtheclhxqlnjpfmheq`.
- Exact bytes applied from `2026-08-20T17:24:07Z` through `17:24:08Z` after Sandbox and Demo passed.
- Read-only signature, owner, search-path, volatility, grant, forced-RLS, policy, and empty-receipt verification passed. No mutating fixture was run.
- Exact pre/post counts remained Requests 23, messages 29, Request media 1, Estimates 22, Estimate lines 39, schedules 12, Invoices 12, and Invoice lines 33. The new receipt table remained empty.
- The same forward-fix bytes were applied from `2026-08-20T19:01:51.729Z` through `19:01:52.211Z`. Owner, `SECURITY DEFINER`, `VOLATILE`, fixed `search_path=public`, authenticated-only execution, marker, and repeat-install refusal checks passed. Production remained at the exact counts above with zero receipts; only the approved function replacement ran and no Production fixture or business record was created.

## Application Evidence

- The browser creates one stable operation key for each semantic form payload, retains it in local storage across safe retry/lost-response recovery, coordinates same-browser tabs with Web Locks when available, and rotates only after confirmed success or a changed semantic operation.
- Request preparation, deterministic attachment upload, and commit are centralized in one client helper. A replayed successful preparation receipt is accepted immediately, so a lost commit response with attachments cannot be mistaken for a missing upload manifest or trigger another upload.
- Empty browser MIME values for allowed Request media now resolve deterministically from the allowlisted extension (`image/heic`, `image/heif`, standard image types, or supported video types). The resolved value is shared by payload fingerprinting, the server manifest, Storage upload metadata, and commit verification; unsupported extensions remain denied by the existing server allowlist.
- `App.tsx` uses only `servsync_prepare_service_request_creation` / `servsync_commit_service_request_creation`, `servsync_save_estimate_draft_idempotent`, and `servsync_save_invoice_draft_idempotent` for the protected operations. Direct header/delete/insert sequences are no longer used by these UI paths.
- Pending states and synchronous action guards from PR #509 remain. Recoverable failure preserves the form and destination; conflicts display concise retry guidance without raw SQL/RPC details.
- The resettable Sandbox full core loop passed both full-payment and partial-then-final variants through Request, Estimate, acceptance, Job, persisted work progress, Invoice, payment, PDF, and Home History with exact cleanup.

## Compatibility And Remaining Work

The rollout is database-ahead-of-application compatible: historical direct table paths and the prior Request RPC remain temporarily callable so the currently deployed application is not broken while the new source is in Preview. The new source does not bypass the idempotent path. After this application head is merged, deployed, and observed, a separate protected cleanup should revoke/retire those legacy write paths; this PR does not remove them prematurely.

FB-039E remains active. FB-039E2 must make finalized-report, Home History, and document registration replay-safe. Phase 0.5 mobile acceptance remains behind full Phase 0.4 acceptance. FB-037 Marketing remains the bounded parallel strategic lane.
