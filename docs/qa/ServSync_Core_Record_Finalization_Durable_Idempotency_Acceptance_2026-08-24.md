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

Status: source complete; the exact durable migration is installed and runtime-accepted in Sandbox. Demo, Production, exact deployed-application Preview acceptance, and staged legacy retirement remain pending.

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
- Backend and runtime parity source suites: passed. The rollout ledger records the exact durable foundation as Applied and runtime-accepted in Sandbox, Pending in Demo and Production, and records the staged retirement as Pending in all three environments.
- Isolated PostgreSQL 16 compilation: both exact migrations installed successfully in staged order over a bounded local foundation with all functions, grants, policies, indexes, forced-RLS receipt state, and final legacy grant/policy retirement.
- Isolated runtime matrix passed: sequential replay, lost-response replay, true concurrent report commit, true concurrent regenerated-PDF attempts with different file SHA/size/name converging on the first valid object, true concurrent document-free manual History commit, changed-semantic conflict, regenerated-PDF manifest refresh before upload, expired preparation renewal, Storage metadata verification, report document/Home History/notification convergence, manual History with and without a document, Viewer denial, cross-owner denial, forced-RLS/no-policy receipts, and exact canonical counts. Final-byte PostgreSQL 16 regressions additionally commit and delete manual History both with and without a document, retry the same operation key/payload, and prove zero History resurrection, zero duplicate document/object registration, stable logical result IDs, nullable live-row pointers, and preserved succeeded tombstones.
- Final source hygiene passed: `git diff --check`, changed-file sensitive-value scan, changed Markdown-link resolution, and exact migration hash/line verification.

The isolated matrix is source evidence, not a substitute for the required exact-byte shared-environment acceptance.

## Sandbox Protected Rollout Attempt — 2026-08-24

Owner approval pinned PR #517 head `73faad19d73719327c08df2194b9a2bdc4f62dc2` and durable migration SHA-256 `b864e61a693ed881eb2abf497adf1833c48cd9803f185ac393e4f8f420fb4461` for Sandbox project `zpzdkoaubyjtsomccxya` only. Preflight proved the receipt table, four public RPCs, and prepared-upload policy were absent; the expected legacy finalizer/helper/policy and one generic homeowner upload policy were present; and the relevant business and private Storage baselines were fingerprinted without reading business content.

The exact durable bytes were applied once. Post-install catalog/security passed: the receipt table is postgres-owned, forced-RLS, policy-free, empty, and has no browser/generic service-role table grants; all four public RPCs are postgres-owned, volatile `SECURITY DEFINER`, fixed to `search_path=public`, and executable only by `authenticated`; the manual `history_id` FK is `ON DELETE SET NULL`; the new authenticated prepared-upload policy exists; and the deliberate database-ahead legacy finalizer/upload policy remains present. The staged retirement migration was not applied.

Runtime acceptance stopped before report commit. The first harness inserted a prepared report Storage metadata row transactionally as the contractor and then incorrectly asserted it through the existing homeowner-folder-only Storage `SELECT` policy, so the assertion saw zero rows even though the security-definer preparation path could see the row. That transaction rolled back. Its emergency cleanup then attempted a direct `storage.objects` delete and Sandbox correctly rejected it with the Storage protection trigger. This is a harness/cleanup-surface discrepancy, not accepted runtime evidence, and triggered the required stop condition.

Read-only residue inspection found 11 fictional auth/profile users, two contractors, four team rows, two homes, three shared-home memberships, and one Job from the committed fixture setup, with zero receipts, documents, Home History rows, notifications, or Storage objects. Exact lifecycle cleanup deleted only those 11 fixed fictional auth-user IDs. Final residue was zero across auth users, profiles, referral codes, contractor billing, contractors, team rows, homes, memberships, Jobs, receipts, documents, Home History, notifications, and Storage. The relevant pre/post business counts and ID fingerprints remained exact: profiles 19, contractors 6, homes 9, Requests 47, quotes 0, Jobs 208, documents 11, Home History 30, and notifications 163. The `home-documents` bucket remained 26 objects with name fingerprint `80db891372c29592d0afb4eb69ae53b1`; receipt count returned to zero.

The corrected follow-up retained this stopped attempt as audit history and replaced its invalid assumptions rather than interpreting it as product evidence.

## Corrected Sandbox Runtime Acceptance — 2026-08-24

Owner approval pinned PR #517 head `d8a3f6487f6245c18f39eae6bb21c7403b8209c9` and the unchanged durable SHA-256 `b864e61a693ed881eb2abf497adf1833c48cd9803f185ac393e4f8f420fb4461`. Preflight found zero receipts and zero fixed `FB039E2RT2` markers. The five installed public/policy-helper definition MD5 values exactly matched a fresh PostgreSQL 16 compile of the pinned migration: prepared-upload predicate `d9fde3b6502820c2a51befa7dc9f68d3`, report prepare `669744e3521def83b715f3c973990879`, report commit `2ec472c1d7b5eb4e5dfb41f2d7f7fff7`, manual prepare `65cb802125f40233ff1c7fb53c3e90e2`, and manual commit `a346916bef87e946f9efe39ce18bf220`. Ownership, fixed search paths, volatility, forced RLS/no receipt policies, `ON DELETE SET NULL`, authenticated-only prepared upload, and the deliberate legacy finalizer remained exact.

The corrected fail-closed harness used real authenticated Supabase Storage API upload/download for receipt-prepared paths, did not directly mutate `storage.objects`, did not grant or assume contractor `SELECT` visibility into homeowner folders, used the primary homeowner only for established private reads, and used the service-authorized Storage API solely for exact cleanup. Independent authenticated sessions passed Job-report same-payload preparation and lost-response commit replay, changed-payload conflict, regenerated-byte preparation plus first-valid deterministic object preservation, duplicate-upload non-replacement, true concurrent commit convergence, metadata rejection with no Job/document/History/notification writes, retry after exact API cleanup, 30-day renewal, Owner/Admin/Office/Field Technician authority, Viewer/homeowner/cross-tenant denial, atomic canonical Job/document/Home History/notification/receipt lineage, homeowner-only report read, contractor read denial, and the still-available legacy upload/finalizer plus new-path read-only adoption.

Manual Home History passed true concurrent same-operation commit and replay without a document, changed-payload conflict, expiry renewal, verified-metadata rejection and retry with a document, deterministic duplicate-upload reuse, concurrent commit/lost-response replay, primary-homeowner ownership, cross-homeowner denial, shared-home admin/member/viewer RPC and private History/document/Storage denial, and ordinary-History deletion tombstone replay both without and with a document. Deleted logical results were not resurrected; the document variant retained exactly one registered document and one Storage object while its succeeded receipt kept the logical result ID with nullable live `history_id`.

The exact cleanup trap removed all run-created objects through the Supabase Storage API, signed out sessions, deleted all 11 fixed-prefix fictional identities through the Auth lifecycle, and then independently proved zero auth/profile/contractor/team/home/membership/Job/receipt/document/History/Storage residue. Fresh pre/post counts and ID/name fingerprints were byte-for-byte equal across Auth users, profiles, contractor profiles/team/billing, referral codes/referrals/invites, homes/memberships, Requests/quotes, Jobs, documents, Home History, notifications, and `home-documents` Storage. The final independent read showed profiles 19, contractors 6, homes 9, Requests 47, quotes 0, Jobs 208, documents 11, Home History 30, notifications 163, 26 Storage objects, and zero receipts/markers. The five installed definition hashes and durable migration SHA remained unchanged.

An independent evidence review then identified that Admin, Office, and Field Technician had prepared but not committed their dedicated reports. Under the existing complete-matrix approval, the corrected harness at SHA-256 `c3d024222ff2135c34fa8976cbd6a66d18ea881320b0185640f780e0c6edd53d` reran against repository head `433d22940384fcd875e1820108b4c47bc81f4db9` while pinning the unchanged approved product contract from `d8a3f6487f6245c18f39eae6bb21c7403b8209c9`: `src/App.tsx` `745350c8560682d87249c8b62b592abfbee4c84dce23d8da6571e381e1491017`, finalization helper `74cd65f9d726a98bc07739a71607962fc63316bf277b59fb43a1949daed4b5b1`, durable migration `b864e61a693ed881eb2abf497adf1833c48cd9803f185ac393e4f8f420fb4461`, and staged retirement `edde0d89c5513cf36e4773ddb798261cf26dd1a4095c59f03875f2b716ce5289`. Approved-head ancestry plus all four hashes fail closed against arbitrary later product changes without pretending the one-time evidence script belongs to the earlier Git commit.

Admin, Office, and Field Technician each completed prepare, authenticated exact-path Storage upload, commit, one finalized Job, one canonical document, one Home History row, one homeowner notification, one succeeded receipt, one matching Storage object, and same-key success replay preserving every returned ID. Viewer, homeowner, and cross-tenant attempts remained denied. The rerun again removed all exact objects and identities, returned every marker and receipt to zero, matched the full before-state fingerprint set, retained profiles 19/contractors 6/homes 9/Requests 47/Jobs 208/documents 11/Home History 30/notifications 163/Storage 26, and preserved the five installed definition hashes. The package command no longer supplies the mutation flag: ordinary `npm run test:core-record-finalization-sandbox-runtime` refuses before credential loading, and only an explicitly approved operator invocation may append `-- --execute-sandbox`.

## Compatibility And Remaining Protected Work

The durable migration is database-ahead-of-application compatible. It intentionally leaves the legacy six-argument `servsync_finalize_field_work` RPC and broad legacy report-upload policy available while the currently deployed application still uses them. The separately staged retirement migration is now included in the reviewed source: after the new application path is deployed and observed, it revokes every client/trusted-role grant on the legacy RPC and broad upload predicate and drops the old report-upload policy. Existing finalized reports are adopted read-only by the new path without replacement uploads or fabricated historical equivalence.

Full Phase 0.4 acceptance still requires:

1. Identical-byte Demo rollout with bounded fictional validation and Demo Recorder/Marketing preservation.
2. Identical-byte Production rollout with read-only catalog/security and exact business-count preservation; no Production fixture mutation.
3. Exact deployed-application Preview against the rolled-out backend.
4. Identical-byte staged retirement of the legacy finalizer and legacy upload bypass after deployment observation, followed by durable replay and delivery preservation checks.

Phase 0.5 mobile remains blocked until those gates pass.

## Rollout, Preservation, And Rollback Plan

1. Reconfirm both migration SHA-256 values and line counts; run rollback-only compile and duplicate/precondition checks in order.
2. Snapshot relevant Job, document, Home History, notification, Storage-object, and receipt counts/fingerprints.
3. Treat the completed Sandbox authenticated/Storage API/zero-residue matrix as the first protected gate; do not rerun it without a new discrepancy or explicit reason.
4. Repeat with identical bytes in Demo and verify Demo Recorder/Marketing preservation.
5. After explicit Production approval, apply the identical bytes once; verify function ownership, fixed search paths, volatility, authenticated-only public grants, private helper denial, forced RLS/no policies, Storage policy, marker, repeat-install refusal, parity, and exact pre/post business counts without fixtures.
6. Merge/deploy the application only after the durable backend is ahead and accepted. Observe the new path, then apply the already reviewed staged retirement migration in Sandbox -> Demo -> Production order with a separate approval at each protected gate.

Before any successful receipt exists, rollback may drop only the new Storage policy, restore the prior generic homeowner upload policy, and drop the four public RPCs, private helpers, indexes, and receipt table in dependency order. After successful receipts exist, use a reviewed roll-forward repair rather than deleting operation evidence or canonical records. Before retirement rollback, restore only the reviewed broad report policy plus its authenticated helper/RPC grants; after retirement acceptance, prefer roll-forward. The legacy path remains available only during the deliberate database-ahead deployment window.

## Tutorial Freshness

`NOT APPLICABLE`. The source preserves the existing visible report-finalization and Add Home History workflows, labels, role assumptions, ordering, and success outcomes; it changes only retry, Storage identity, transaction, and reconciliation behavior. The published **How to create an estimate** walkthrough does not cover either operation.

## Protected Actions Not Taken

- No SQL was applied to Demo or Production. The exact approved durable migration was applied only to Sandbox; the staged retirement was not applied anywhere.
- Only fixed-prefix fictional Sandbox fixtures were created during the stopped and corrected runtime attempts. Both runs returned every exact marker to zero. The corrected run used Storage API cleanup and Auth lifecycle deletion and preserved all snapshotted Auth/business/Storage counts and fingerprints. No Demo or Production record, provider, environment, secret, or infrastructure setting was mutated.
- No merge or manual deployment/promotion occurred.

## Status

FB-039E2 source is complete and the durable migration is installed and runtime-accepted in Sandbox, including the previously outstanding shared-home member/viewer boundary. Phase 0.4 remains open pending Demo/Production rollout, exact deployed-application Preview acceptance, and staged legacy-bypass retirement.
