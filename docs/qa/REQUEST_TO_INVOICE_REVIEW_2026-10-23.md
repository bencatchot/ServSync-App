# Request-to-invoice usability review — October 23, 2026

Historical October 23 baseline (superseded by the hosted continuation below where noted). Implementation record: [#590](https://github.com/bencatchot/ServSync-App/issues/590). Baseline `origin/main` at `5ea8fec`. The onboarding and Practice checkouts remain separate and unchanged. This is a bounded source/domain/browser-fixture review, not a new hosted transaction-chain acceptance or a Production release.

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

## October 25 hosted continuation — verified bounded scenario

The owner authorized one retained fictional Demo scenario using existing ordinary Demo identities: one request, estimate, job, appointment and invoice, zero payments. Current main after PR593 was integrated into this feature branch. No fixture reset or additional auth provisioning was used.

### Actual hosted results

- Existing fictional homeowner/contractor signed in normally to the protected Demo Preview. The browser permitted only reviewed workflow RPCs; provider endpoints, app APIs, direct table writes and unrelated mutations were blocked. Live read-only catalog inspection found no external delivery calls in the workflow RPCs/helpers, no notification webhook triggers and no cron scheduler. Internal fictional portal notifications remained enabled.
- Homeowner UI created exactly one request for the existing fictional property/contractor. Contractor UI saved one linked estimate: two units at $125.25, total $250.50, deposit/final schedule $125.25 each. No auto-send occurred.
- Explicit portal delivery, homeowner review/acceptance, and job creation succeeded. The persisted job and invoice retain the same request/estimate lineage.
- Calendar's Open request action initially failed after job creation: the destination queue excluded all job-linked requests. The scoped repair retains only the explicitly opened request in the detailed queue, clears stale search text, and preserves normal overview exclusions and sorting. Actual hosted mouse and keyboard navigation, mobile layout, and stale-search recovery passed after the repair.
- Contractor UI proposed one fictional time window; homeowner UI accepted it. The backend retained one confirmed appointment and both parties can see its confirmation. No real visit or automated reminder was initiated.
- Request deposit created exactly one unsent $125.25 invoice. Rapid double-clicks on estimate Send, estimate Accept, Create Job, proposed-time Send/Accept and Request deposit each produced one successful RPC. Invoice Send likewise produced one successful action. This checks the observed browser behavior, not an exhaustive concurrency/load test.
- The fictional homeowner could open the explicitly delivered portal invoice. The normal view RPC changed its status to Viewed. Invoice total/balance is $125.25, amount paid is zero. The contractor schedule now shows Viewed and, after the final caption repair, no longer calls an unnumbered sent/viewed invoice a draft.
- Fresh authenticated browser contexts for both roles reopened the retained state. Normal refresh recovered the same invoice without new records.

### Fault injection, layout and test scope

Two read faults were kept separate from actual transaction evidence. Aborting all invoice reads caused the existing workspace load-error/retry surface. To exercise the linked-but-unloaded row specifically, the browser added an exclusion to the actual invoice read query while retaining the real schedule link; no success payload was fabricated and the database invoice stayed unchanged. Desktop and 390px mobile then showed **Invoice linked**, refresh guidance, and no second deposit-create button. Restoring the normal query and refreshing recovered Draft initially and Viewed after portal viewing. These cases passed again on application commit `7e01cebad97ce29f7e1c5ab503b84a257a304ee0`.

Hosted evidence is automated Chromium with the actual Demo backend. Mobile invoice/request views had no horizontal overflow. This run is not native Safari, a physical iPhone, or two physical devices. Existing actor-role and backend checks remain active; new employee/admin role fixtures were not provisioned or exercised. Deposit billing through a confirmed appointment is verified; job completion, final invoicing, Home History filing and payments were deliberately not executed.

Fourteen focused domain/source checks pass (two request-queue regressions and twelve existing deposit/schedule checks); these are not fourteen hosted journeys. Typecheck/build and architecture checks pass; lint retains the existing 76 warnings. Exact application-head quality CI: [40196852318](https://github.com/bencatchot/ServSync-App/actions/runs/40196852318). All three normal Preview builds passed. Final documentation-head CI and Preview are recorded on PR591.

### Preservation and limitations

Per-row hashes before/after match for every preexisting contractor-visible request, estimate and invoice; final additions are exactly one request, estimate, job, appointment and invoice. Read-only checks also confirm the original two Practice drafts retain their prior aggregate fingerprint, the third retained draft remains at revision 1, Practice access is expired, and the separate onboarding estimate remains an unsent draft with its previous amount/update time. Private IDs and credentials are excluded from this record.

The harness blocked automatic read-marker writes and job autosave. Their fetch errors are harness restrictions, not proven application regressions. No external customer messages, emails/SMS, payments, production transactions, new credentials/access, shared SQL application, Help publication or Production merge occurred.

Tutorial impact: NONE. After application validation, Demo contextual searches returned no matches; read-only published-catalog review found five relevant walkthroughs. Their retained media matched published hashes, completed full muted playback, and middle/end frames and transcripts were compared with the finished changes. No guidance depends on the broken Calendar link or incorrect Invoice caption. This is published-byte local playback, not a new authenticated in-app Help playback. PR586's separate TUT-002 replacement gate is unchanged. No new marketing claim or workflow/security boundary is introduced.
