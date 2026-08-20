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

## Protected Backend Changes Required For Full Phase 0.4 Acceptance

These changes were not authorized and were not applied:

1. Add a purpose-bound idempotency key and durable operation receipt to service-request creation. Reusing a key must return the original Request; conflicting payload reuse must fail closed.
2. Replace direct multi-write Estimate and Invoice authoring with transactional, idempotent save operations covering header, lines, schedule, lineage, and one durable result.
3. Make Job report finalization one replay-safe operation across canonical report identity, document registration, Home History, and notification. Storage preparation/finalization may be split, but the stable operation identity must prevent duplicate documents, notifications, and orphaned replacement uploads.
4. Make manual Home History plus optional document registration transactional or operation-receipted, with one stable document/storage identity and conflict detection.

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

- Desktop role/lifecycle matrix: pending.
- `390x844` role/lifecycle matrix: pending.
- Loading, retry, refresh, interrupted-transition, overflow, browser/page/`5xx`, and fixture cleanup evidence: pending.

## Status

Application candidate validated locally and awaiting exact-head Preview acceptance. The presentation and browser-side reliability work may be reviewed independently, but FB-039E Phase 0.4 must not be marked fully complete until the protected backend operation contracts above are approved, implemented, and validated.
