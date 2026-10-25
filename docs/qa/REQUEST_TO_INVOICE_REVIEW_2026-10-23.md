# Request-to-invoice usability review — October 23, 2026

Implementation record: [#590](https://github.com/bencatchot/ServSync-App/issues/590). Baseline `origin/main` at `5ea8fec`. The onboarding and Practice checkouts remain separate and unchanged. This is a bounded source/domain/browser-fixture review, not a new hosted transaction-chain acceptance or a Production release.

## Journey reviewed

| Stage | Existing behavior/evidence | Result and limits |
| --- | --- | --- |
| Request and customer context | Accepted connection request context reader, exact homeowner message/property context, contractor request actions passing `serviceRequestId` into estimate creation | Existing context/empty-state tests pass. No live request or customer was created. |
| Scope, prices and estimate | Shared Draft composer; idempotent saved Estimate payload includes validated payment schedule; onboarding sample uses actual PDF renderer | Existing desktop/mobile guide tests pass at PR586; $195 sample, edited $270, skip/resume and clean real start retained. No claim of fresh signup. |
| Customer acceptance | Connected homeowner response RPC, guarded repeated action and feedback; secure guest snapshot acceptance/stale-version controls | Source and synthetic gateway/browser tests pass, including desktop/mobile confirmation and stale-version no-action. No hosted acceptance, notifications or electronic signature created. |
| Job and scheduling | Accepted-only create-job path reopens existing linked jobs; request-linked shared appointment entry; separate contractor calendar and homeowner-response statuses | Job classification and calendar/appointment presentation tests pass. No appointment, visit or Job was created or shared. |
| Invoice and deposit | Accepted schedule creates a deliberate unsent draft; loaded linked invoice opens; no automatic send; offline-payment validation and partial/full balances | One misleading missing-linked-invoice state repaired below. No invoice, payment or provider transaction created. |
| Customer-facing documents | Existing explicit Send/acceptance boundaries, invoice/payment display, private draft distinction | Synthetic desktop/mobile fixtures cover invoice dialog and secure guest estimate display. No end-to-end real-account delivery claim. |

## Confirmed defect and repair

When `linked_invoice_id` exists but the invoice list does not contain that record, `invoiceForScheduleRow` returns null. Previously the shared presentation then said **Not requested / Not invoiced** and `canRequestScheduleInvoice` allowed a new request. The App uses both helpers on accepted estimate schedule rows. This can occur with incomplete/stale list data; it is not proof that a duplicate invoice was created. The server has its own existing linked-row protections.

The UI now says **Invoice linked** with: “Invoice details are unavailable. Refresh to load the linked Invoice before taking another billing action.” Creation is withheld until the linked record is available. Unlinked rows, loaded drafts and the existing unpaid-void replacement behavior are preserved. No RPC, database, financial calculation, role or permission changes.

The regression failed against the original helper before the fix. It covers deposit/progress/final/total rows, null/undefined missing records, later draft loading, and permitted/unpermitted void replacement. Source review separately confirmed both actual App call sites and server linked-row guards.

The audit also found an obsolete test expecting direct `estimate_payment_schedule_items` inserts. It now checks the already-existing `servsync_save_estimate_draft_idempotent` call and `payment_schedule_items: scheduleForSave.rows`, and disallows that direct-table path. Application persistence was not changed.

## Validation scope

Final focused request/estimate/acceptance/job/calendar/invoice suite: 65 cases across domain functions, source contracts and synthetic browser fixtures. These are not 65 hosted end-to-end journeys. Typecheck, build, lint (existing 76-warning baseline) and diff checks pass. The browser run uses a loopback frontend with backend configuration blank. Browser/provider requests in acceptance fixtures are intercepted; no shared account or business write is needed.

Publication, exact commit, Preview status, tutorial freshness and any hosted sign-in barrier are recorded in the draft PR after deployment verification. Do not infer hosted acceptance from a READY build.

## Resumed work and remaining gates

- **PR586 onboarding:** unchanged `e907926`; fresh recheck passed six guide cases and two recorder safeguards. Preserved review MP4/VTT/PDF hashes match; the guide/editor/PDF sources have no changes since the recording's application revision. Existing real Demo unsent-Estimate persistence evidence remains valid historical evidence. Fresh signup needs an owner-controlled unused test inbox and owner-performed password/legal/confirmation actions. TUT-002 remains UPDATE REQUIRED; the preserved silent addendum is review-only, not an ingestible/published revision. Protected Help job/narration/upload/publication gates remain.
- **PR588 Practice:** unchanged `da79d31`; 44 disposable PostgreSQL/contract tests pass, including snapshot filtering, tenant isolation, persistence, expiry, transfer/recovery and cleanup guards. Read-only Demo access check found one pilot, zero unexpired pilots, latest access end October 17 at 18:54 UTC. No renewal or cleanup. Current shared dispatcher still generates a fictional snapshot and accepts only existing synthetic state/start/save behavior. The tested local business/pricing/template snapshot and transfer model already exists; connecting real business setup requires approved identity binding/export/refresh and hosted import/security work. The function-owner maintenance denial is not bypassed. No real snapshots, live Draft promotion or scheduled deletion implemented here.
- **Full hosted workflow:** not rerun because the current full-core-loop runner creates/responds/schedules/invoices/payments and performs cleanup; those effects are beyond this safe read-only/synthetic pass. A separate bounded, retained synthetic account/record plan is needed before such execution. Physical iPhone and actual cross-device checks remain owner/device acceptance steps.

No real customer notifications/invoices, charges, SQL application, new credentials/infrastructure, access grants, expiry extension, record deletion, merges or Production releases occurred.

## October 25 hosted continuation (in progress)

The owner authorized a bounded retained fictional Demo scenario using existing ordinary Demo identities: one request, estimate, job, appointment and invoice, zero payments. Current main after PR593 was integrated into this feature branch. Actual hosted request creation, $250.50 draft persistence, portal estimate delivery, homeowner acceptance and job creation passed; double-click Send, Accept and Create Job each issued one successful RPC. No external provider endpoint is permitted by the browser harness. Live read-only catalog inspection found no external notification triggers, cron scheduler, or network calls in the workflow RPCs/helpers. Internal fictional portal notifications remain enabled.

A hosted scheduling dead end was reproduced: Calendar lists an open request after it becomes a Job, but its Open request link routes to a queue that filters out all job-linked requests. Preserve the explicitly selected request in the detailed queue while leaving the overview/intake exclusions unchanged, clear stale search text on explicit navigation, and retain existing scheduling/role/backend rules. Existing queue sorting moved to its owning feature module without changing priorities. Two focused regressions plus the existing 12 deposit/schedule checks pass; typecheck, build and architecture baseline pass. Hosted verification of the repaired navigation and the remaining appointment/invoice transitions is pending.

The harness deliberately blocks read-marker writes and automatic job autosave; resulting fetch errors are harness limits, not proven application regressions. No earlier records are intentionally changed. Public evidence excludes private fixture identifiers. Tutorial freshness must be rechecked after final application validation; no Help media publication is authorized.
