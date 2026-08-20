# ServSync Core-State Reliability Acceptance — 2026-08-20

## Scope

FB-039E Phase 0.4 stabilizes the established Request/Draft -> Estimate -> Job -> Invoice -> payment record -> Home History loop. This candidate changes application presentation and browser-side operation handling only. It does not change SQL, schema, RLS, RPCs, authentication, permissions, environment settings, providers, or Production data.

Branch: `codex/fb039e-core-state-reliability-v1`

Base: `0b73ce7073bf76ce1f328ae6698cbf6b0fec3f4b`

## Canonical Loading And Recovery Contract

- Contractor and homeowner identity, role, workspace records, lifecycle records, and counts remain behind one stable loading surface until their canonical query set resolves.
- A failed canonical query no longer renders a legitimate-looking zero count or a partially updated workspace.
- The recovery surface keeps the selected destination, Customer/property context, filters, and safe in-memory form state intact and retries the same workspace load.
- The contractor shell does not render a stale business identity while a replacement identity/capability snapshot is loading.
- Ordinary-user error text preserves concise product guidance while suppressing raw RPC, PostgREST, SQL, schema-cache, stack, URL, and serialized backend details.
- Existing actionable empty states remain authoritative in Work, Financials, Customers, Properties, Records, Requests, Documents, and Home History.
- Invoice payment-history failure now includes a bounded retry without closing the selected Invoice or clearing payment-entry context.

## Mutation And Duplicate-Safety Matrix

| Transition | Browser behavior in this candidate | Durable server guarantee already present | Classification |
| --- | --- | --- | --- |
| Draft -> Estimate/Job/Invoice | Existing durable attempt identity, reconciliation, pending state, and same-attempt retry remain intact. | Launch ledger, idempotency key, advisory lock, and unique output constraints. | Durable idempotency proven. |
| Accepted Estimate -> Job | Synchronous record-scoped action guard prevents same-page repeated submission. | Unique Estimate-to-Job lineage plus existing-record return. | Durable duplicate prevention proven. |
| Estimate/Job -> Invoice | Synchronous source-scoped action guard prevents same-page repeated submission. | Source-specific advisory lock and existing non-void Invoice return. | Durable idempotency proven. |
| Invoice payment record | Synchronous Invoice/idempotency-key guard, pending state, and retryable history remain intact. | Required idempotency key, advisory lock, exact-payload conflict check, and existing-record return. | Durable idempotency proven. |
| Estimate/Invoice -> homeowner Home History | Synchronous record-scoped action guard and existing-record precheck remain intact. | Unique source lineage and existing-record return. | Durable duplicate prevention proven. |
| Request creation | Synchronous action guard and pending button prevent repeated same-page clicks. | No durable client operation key or server receipt was found. | Frontend prevention only; protected backend follow-up required. |
| Direct Estimate/Invoice save | Synchronous editor-scoped action guard and pending state prevent repeated same-page saves. | Current header/line/schedule writes are not one idempotent transactional operation. | Frontend prevention only; protected backend follow-up required. |
| Job report finalization | The browser reads canonical Job state before generating/uploading and reconciles an already-finalized report without a second upload. | One Home History row is constrained by Job lineage, but document insertion, random Storage path, and notification are not one replay-safe operation. | Reconciliation reduces risk; protected backend follow-up required. |
| Manual Home History plus document | Synchronous action guard prevents repeated same-page saves. | Storage, document, and history writes do not share a durable operation receipt. | Frontend prevention only; protected backend follow-up required. |
| Job completion | Synchronous Job-scoped action guard, visible pending state, and autosave exclusion prevent competing same-page completion/save requests. | Job-derived Invoice creation is idempotent; the wider completion/visit/follow-up sequence is not one durable operation. | Safe browser behavior; wider atomicity remains a backend follow-up if required for interruption recovery. |

Client action guards intentionally make no server-level claim. They acquire synchronously before the first awaited operation so rapid repeat clicks in the same application instance cannot start a second request. Refresh, another tab, a lost response, or another client still requires a durable server contract.

## Protected Backend Follow-Up Status

The owner subsequently authorized FB-039E1. Request creation and direct Estimate/Invoice Draft save requirements are now implemented and rolled out through the exact checksummed migration documented in [FB-039E1 acceptance](ServSync_Core_Authoring_Durable_Idempotency_Acceptance_2026-08-20.md). They remain subject to review of the draft application PR, but are no longer unimplemented backend gaps.

The following protected changes still remain for full Phase 0.4 acceptance:

1. Make Job report finalization one replay-safe operation across canonical report identity, document registration, Home History, and notification. Storage preparation/finalization may be split, but the stable operation identity must prevent duplicate documents, notifications, and orphaned replacement uploads.
2. Make manual Home History plus optional document registration transactional or operation-receipted, with one stable document/storage identity and conflict detection.

Each requires separately approved SQL/RPC/security work, focused concurrency and lost-response tests, cross-tenant/RLS validation, Sandbox -> Demo -> Production rollout, and exact preservation checks. Client hiding or button disabling is not an acceptable substitute.

## Role And Ownership Preservation

- Owner/Admin/Office retain established operational and financial actions.
- Field Technician retains operational Work actions and receives no financial-authoring path.
- Viewer remains read-only.
- Homeowner owner/member/viewer visibility remains governed by the existing home-access contract.
- Work owns Requests, Drafts, Estimates, Jobs, Reports, Templates, Service Plans, and Price Book; Financials owns Invoice Drafts, Invoices, and payment actions.
- Existing Request/Estimate/Job/Invoice/Home History lineage is unchanged.

## Acceptance Evidence

Automated source and contract evidence:

- Core-state reliability contract: 8/8 passed.
- Resettable Sandbox core loop: 2/2 passed. Both variants proved the matching Job-save response, checked approved work and work notes after reload, exact Invoice filter state, durable partial/final payment state through a fresh contractor session, PDF access, and prefix-scoped fixture cleanup. The full variant continued through homeowner Invoice filing, Home History, and reminder creation.
- Focused lifecycle, payment, report, role, and mobile regressions: 60 passed; 11 authenticated role cases were intentionally skipped in the local source run and remain assigned to exact-head Preview validation.
- TypeScript and Production build: passed.
- ESLint budget: passed at the existing 80-warning baseline with no errors or new warnings.
- App architecture: `src/App.tsx` baseline reduced from 50,913 to 50,880 lines; architecture guardrails 10/10 passed.
- Backend parity: 16/16 passed.
- Changed-file sensitive-value scan, changed Markdown links, and `git diff --check`: passed.

Authenticated Preview evidence:

- Exact application commit: `36add537e7ad21a100c21e5b3bb47e1c748c9b21` at [the protected Vercel Preview](https://serv-sync-app-refresh-36l6198j6-bencatchots-projects.vercel.app).
- Recurring authenticated role smoke: 8/8 passed. Owner, Admin, Office, Field Technician, Viewer, and homeowner core read surfaces loaded without captured browser-console or HTTP errors; contractor and homeowner `390x844` navigation had no horizontal overflow.
- Financial role presentation: 13/13 passed. Owner/Admin/Office retained Draft Invoice entry; Field Technician and Viewer had no Financials or financial-authoring entry on desktop or `390x844`; Field Technician retained Job Draft entry and Viewer did not.
- Job role presentation: 8 passed and 2 fixture-dependent checks skipped. Viewer opened an existing Job read-only on desktop and `390x844`; the approved Field Technician fixture had no mutable Job card, while its operational Job Draft entry was proven in the financial-role matrix.
- The Preview homeowner owner account loaded Properties, Contractors, Estimates/Invoices, and Home History on desktop and Properties on `390x844`. A separate resettable shared-home member/viewer fixture run remains unavailable because the approved validation credential target does not align with the direct Sandbox client required by that fixture harness; no Auth fixture or product permission was changed in this unprotected application slice.
- The resettable exact-head Sandbox loop remains the transition authority for loading, save response, reload persistence, interrupted-payment recovery, homeowner Home History continuation, and prefix-scoped cleanup. The Preview checks are read-only and therefore did not repeat those mutations against another environment.

## Status

The application layer merged through PR #509 at `4a2fb59`. FB-039E1 now closes the Request and direct Estimate/Invoice Draft durable-operation gaps, subject to its draft PR review. FB-039E Phase 0.4 must not be marked fully complete until FB-039E2 report/Home History/document finalization and the remaining shared-home member/viewer acceptance are implemented and validated. Existing authority was not weakened to manufacture evidence.
