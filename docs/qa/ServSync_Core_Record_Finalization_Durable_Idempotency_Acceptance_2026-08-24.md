# ServSync Core Record Finalization Durable Idempotency Acceptance — 2026-08-24

## Scope

FB-039E2 is the remaining protected Phase 0.4 source slice for canonical Job report finalization and primary-homeowner manual Home History creation with an optional private document. It starts from dispatched `origin/main` commit `a606f34bb0b5817caf3b132a2331217282e11574`.

Branch: `codex/fb-039e2-finalization-reliability`

Migrations:

- `servsync-core-record-finalization-durable-idempotency.sql`
- `servsync-core-record-finalization-legacy-retirement.sql`

Migration SHA-256 values:

- durable idempotency: `b864e61a693ed881eb2abf497adf1833c48cd9803f185ac393e4f8f420fb4461` (1,120 lines)
- staged legacy retirement: `edde0d89c5513cf36e4773ddb798261cf26dd1a4095c59f03875f2b716ce5289` (56 lines)

Status: source complete; the exact durable migration is installed in Sandbox, but protected Sandbox runtime acceptance stopped safely and remains incomplete. Demo, Production, exact-head shared-environment acceptance, and staged legacy retirement remain pending.

## Durable Operation Contract

- A postgres-owned, forced-RLS, policy-free receipt table binds actor, purpose, operation UUID, subject, canonical SHA-256 payload, stable Storage manifest, expiration, and canonical result. Direct browser and generic service-role table access remain revoked.
- Transaction advisory locks serialize actor/operation attempts. Job finalization also has one subject lock and one receipt per Job, so separately keyed concurrent attempts converge on one canonical report operation.
- Same semantic payload replay returns the prepared or succeeded canonical result. Reusing an operation for changed persisted/report semantics raises concise conflict guidance.
- Prepared operations renew for 30 days after authority is revalidated. Deterministic paths use one Job identity for reports and one homeowner operation identity for optional manual Home History documents.
- A regenerated report may have a different derived filename or PDF byte identity without changing its rooms, summary, or report options. Before upload, same-semantic preparation may refresh only the prepared derived-file manifest. The first valid receipt-bound object at the deterministic path is adopted atomically as canonical; concurrent uploaders and later retries reuse it without replacement.
- Commit verifies the private Storage bucket, exact path, size, MIME type, SHA metadata, and operation metadata before changing canonical records. An uncertain commit error never deletes a potentially committed object; the next preparation reconciles the receipt first.
- Connected Job commit atomically finalizes the Job and creates exactly one private document, Job-lineage Home History row, homeowner notification, and succeeded receipt. The Job's canonical homeowner, home, Request, and contractor lineage remain server-derived. Local-customer Jobs finalize one contractor record/private PDF and create no homeowner document, Home History, or notification.
- Manual Home History commit creates exactly one succeeded receipt and History row; when a document is present it atomically adds exactly one `home_history_receipt` document linked through `invoice_document_id`. The no-document variant performs no Storage or document write.
- A report receipt remains foreign-key-bound to its canonical Job. A completed manual receipt preserves `result_id` and `result_payload` as terminal replay/tombstone evidence when an ordinary Home History deletion clears its nullable `history_id` pointer. A stale same-key replay therefore returns the deleted logical result without recreating History, registering another document, or touching the deterministic object. Manual receipt lifecycle cleanup is instead bound to the actor/profile lifecycle; Demo finalized-report reset remains bound to explicit registered-artifact cleanup plus the Job cascade.
- The browser now uses only the new prepare/upload/commit helpers for these two operations. Stable operation keys survive refresh/lost response, duplicate Storage responses are reused, and completed keys rotate only after confirmed success.

## Authority And Privacy Preservation

- Job report authority remains `current_user_can_write_contractor_jobs`: Owner, active Admin, active Office, active Field Technician, and applicable platform admin retain operational authority. Viewer, inactive, homeowner, anonymous, and cross-tenant callers remain denied.
- Manual Home History requires `homes.homeowner_user_id = auth.uid()`. It intentionally does not use the broader shared-home access or management helpers.
- Shared-home admin/member/viewer roles receive no new Home History, document, notification, Storage, Request, Estimate, Job, Invoice, or private workflow access. Their existing address/reminder/room/map shell redaction contract is unchanged.
- Work/Financials ownership, Draft-first workflows, accepted connection-request context, homeowner Needs Attention ordering, and FB-039E1 Request/Estimate/Invoice receipts are unchanged.

## Source And Isolated Validation Evidence

- Focused finalization contracts: 12/12 passed.
- Combined Phase 0.4 reliability contracts: 32/32 passed, including all FB-039E1 contracts.
- TypeScript and Production build: passed.
- ESLint: passed at the existing exact 80-warning baseline with zero errors and no new warnings.
- App architecture: `src/App.tsx` reduced to 50,824 lines; the ratcheting baseline was lowered by 10 lines. Architecture suite passed after the ratchet update.
- Backend and runtime parity source suites: passed before rollout. The rollout ledger now records the exact durable foundation as Applied in Sandbox with runtime acceptance incomplete, Pending in Demo and Production, and records the staged retirement as Pending in all three environments.
- Isolated PostgreSQL 16 compilation: both exact migrations installed successfully in staged order over a bounded local foundation with all functions, grants, policies, indexes, forced-RLS receipt state, and final legacy grant/policy retirement.
- Isolated runtime matrix passed: sequential replay, lost-response replay, true concurrent report commit, true concurrent regenerated-PDF attempts with different file SHA/size/name converging on the first valid object, true concurrent document-free manual History commit, changed-semantic conflict, regenerated-PDF manifest refresh before upload, expired preparation renewal, Storage metadata verification, report document/Home History/notification convergence, manual History with and without a document, Viewer denial, cross-owner denial, forced-RLS/no-policy receipts, and exact canonical counts. Final-byte PostgreSQL 16 regressions additionally commit and delete manual History both with and without a document, retry the same operation key/payload, and prove zero History resurrection, zero duplicate document/object registration, stable logical result IDs, nullable live-row pointers, and preserved succeeded tombstones.
- Final source hygiene passed: `git diff --check`, changed-file sensitive-value scan, changed Markdown-link resolution, and exact migration hash/line verification.

The isolated matrix is source evidence, not a substitute for the required exact-byte shared-environment acceptance.

## Sandbox Protected Rollout Attempt — 2026-08-24

Owner approval pinned PR #517 head `73faad19d73719327c08df2194b9a2bdc4f62dc2` and durable migration SHA-256 `b864e61a693ed881eb2abf497adf1833c48cd9803f185ac393e4f8f420fb4461` for Sandbox project `zpzdkoaubyjtsomccxya` only. Preflight proved the receipt table, four public RPCs, and prepared-upload policy were absent; the expected legacy finalizer/helper/policy and one generic homeowner upload policy were present; and the relevant business and private Storage baselines were fingerprinted without reading business content.

The exact durable bytes were applied once. Post-install catalog/security passed: the receipt table is postgres-owned, forced-RLS, policy-free, empty, and has no browser/generic service-role table grants; all four public RPCs are postgres-owned, volatile `SECURITY DEFINER`, fixed to `search_path=public`, and executable only by `authenticated`; the manual `history_id` FK is `ON DELETE SET NULL`; the new authenticated prepared-upload policy exists; and the deliberate database-ahead legacy finalizer/upload policy remains present. The staged retirement migration was not applied.

Runtime acceptance stopped before report commit. The first harness inserted a prepared report Storage metadata row transactionally as the contractor and then incorrectly asserted it through the existing homeowner-folder-only Storage `SELECT` policy, so the assertion saw zero rows even though the security-definer preparation path could see the row. That transaction rolled back. Its emergency cleanup then attempted a direct `storage.objects` delete and Sandbox correctly rejected it with the Storage protection trigger. This is a harness/cleanup-surface discrepancy, not accepted runtime evidence, and triggered the required stop condition.

Read-only residue inspection found 11 fictional auth/profile users, two contractors, four team rows, two homes, three shared-home memberships, and one Job from the committed fixture setup, with zero receipts, documents, Home History rows, notifications, or Storage objects. Exact lifecycle cleanup deleted only those 11 fixed fictional auth-user IDs. Final residue was zero across auth users, profiles, referral codes, contractor billing, contractors, team rows, homes, memberships, Jobs, receipts, documents, Home History, notifications, and Storage. The relevant pre/post business counts and ID fingerprints remained exact: profiles 19, contractors 6, homes 9, Requests 47, quotes 0, Jobs 208, documents 11, Home History 30, and notifications 163. The `home-documents` bucket remained 26 objects with name fingerprint `80db891372c29592d0afb4eb69ae53b1`; receipt count returned to zero.

The next protected Sandbox acceptance attempt must use real authenticated Storage API upload/delete for the exact prepared paths, keep contractor upload verification separate from homeowner read visibility, and retain an exact cleanup/zero-residue trap. No further shared fixture execution was performed after the stop condition.

## Compatibility And Remaining Protected Work

The durable migration is database-ahead-of-application compatible. It intentionally leaves the legacy six-argument `servsync_finalize_field_work` RPC and broad legacy report-upload policy available while the currently deployed application still uses them. The separately staged retirement migration is now included in the reviewed source: after the new application path is deployed and observed, it revokes every client/trusted-role grant on the legacy RPC and broad upload predicate and drops the old report-upload policy. Existing finalized reports are adopted read-only by the new path without replacement uploads or fabricated historical equivalence.

Full Phase 0.4 acceptance still requires:

1. A renewed bounded approval to finish exact Sandbox replay/concurrency/interruption/Storage API/role/tenant/shared-home denial and cleanup evidence against the already-installed durable migration.
2. Successful zero-residue completion of that exact Sandbox runtime matrix.
3. Identical-byte Demo rollout with bounded fictional validation and Demo Recorder/Marketing preservation.
4. Identical-byte Production rollout with read-only catalog/security and exact business-count preservation; no Production fixture mutation.
5. Exact application-head Preview against the rolled-out backend, including the previously outstanding shared-home member/viewer fixture run.
6. Identical-byte staged retirement of the legacy finalizer and legacy upload bypass after deployment observation, followed by durable replay and delivery preservation checks.

Phase 0.5 mobile remains blocked until those gates pass.

## Rollout, Preservation, And Rollback Plan

1. Reconfirm both migration SHA-256 values and line counts; run rollback-only compile and duplicate/precondition checks in order.
2. Snapshot relevant Job, document, Home History, notification, Storage-object, and receipt counts/fingerprints.
3. Against the exact durable bytes already installed in Sandbox, run the full authenticated matrix through real authenticated Storage API upload/delete and remove only prefix-scoped fictional records/objects.
4. Repeat with identical bytes in Demo and verify Demo Recorder/Marketing preservation.
5. After explicit Production approval, apply the identical bytes once; verify function ownership, fixed search paths, volatility, authenticated-only public grants, private helper denial, forced RLS/no policies, Storage policy, marker, repeat-install refusal, parity, and exact pre/post business counts without fixtures.
6. Merge/deploy the application only after the durable backend is ahead and accepted. Observe the new path, then apply the already reviewed staged retirement migration in Sandbox -> Demo -> Production order with a separate approval at each protected gate.

Before any successful receipt exists, rollback may drop only the new Storage policy, restore the prior generic homeowner upload policy, and drop the four public RPCs, private helpers, indexes, and receipt table in dependency order. After successful receipts exist, use a reviewed roll-forward repair rather than deleting operation evidence or canonical records. Before retirement rollback, restore only the reviewed broad report policy plus its authenticated helper/RPC grants; after retirement acceptance, prefer roll-forward. The legacy path remains available only during the deliberate database-ahead deployment window.

## Tutorial Freshness

`NOT APPLICABLE`. The source preserves the existing visible report-finalization and Add Home History workflows, labels, role assumptions, ordering, and success outcomes; it changes only retry, Storage identity, transaction, and reconciliation behavior. The published **How to create an estimate** walkthrough does not cover either operation.

## Protected Actions Not Taken

- No SQL was applied to Demo or Production. The exact approved durable migration was applied only to Sandbox; the staged retirement was not applied anywhere.
- Only fixed-ID fictional Sandbox fixtures were created during the stopped runtime attempt. They were removed through exact actor/profile lifecycle cleanup, leaving zero fixture or Storage residue and preserving all snapshotted business/Storage counts and fingerprints. No Demo or Production record, provider, environment, secret, or infrastructure setting was mutated.
- No merge or manual deployment/promotion occurred.

## Status

FB-039E2 source is complete and locally validated. The durable migration is installed in Sandbox with catalog/security acceptance complete, but Sandbox runtime acceptance remains incomplete after the required safe stop. Phase 0.4 remains open pending renewed Sandbox runtime acceptance, Demo/Production rollout, exact-head shared-home acceptance, and staged legacy-bypass retirement.
