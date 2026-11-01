# Business-aware Practice — November 1 Preview slice

Branch: `codex/temporary-practice-workspace`, PR #588. Reconciled with main `93cf7862b4690ff097663744689798fcbd197f3d` after PR #586 released the dedicated Practice tab. This is an unmerged Preview continuation, not a Production release.

## What this slice delivers

Practice remains the central home for future practice experiences. The existing example guide remains available. Owners with existing Price Book access can choose **My pricing and templates**, explicitly read and review a business setup snapshot, then create fictional practice estimates with the shared composer. Existing authenticated SELECT/RLS paths supply the business name, labor rate, active selling prices and estimate templates. Sanitized snapshots exclude private notes/costs and customer records. No schema, RPC, auth, access, environment or settings change is introduced.

Each saved practice estimate binds to a numbered, timestamped snapshot. Refresh reads a candidate for review/cancel; accepting it supplies new estimates only. Existing estimates keep their snapshot, entered prices and templates. The UI states that prices can become stale. Legacy equipment templates normalize to material, retaining customer-facing titles, display order and labor hours. Source read failure preserves existing work.

Practice drafts and snapshots are stored in session storage, scoped to the signed-in owner and contractor. This supports ordinary same-tab reload/resume, not cross-device persistence. Closing/clearing the tab can lose Practice. Storage failure preserves currently mounted inputs and blocks transfer; malformed storage is not overwritten. Limits are ten setup snapshots, twenty practice estimates and one MiB per tab. No cleanup, renewal or silent reset is added. Incomplete editor input is retained; preview/transfer validate it separately.

Practice PDFs have the existing PRACTICE marker on every page and a PRACTICE filename. A downloaded PDF can be forwarded manually; Practice itself has no delivery or payment action.

## Explicit real-Draft handoff and its boundary

A valid practice estimate can be reviewed for transfer to the explicitly selected current business destination. Confirmation opens **one new unsaved Estimate Draft editor**, clearing all fictional customer/property IDs, private notes, source relationships, lifecycle state and original line IDs. The original practice estimate remains available. This action itself makes no business write, creates no Estimate, sends nothing and charges nothing. The user must choose a real customer, review current prices/tax/terms and explicitly use the existing **Save Draft** workflow in Work.

The tab journal preserves the original clean transferred copy. Before the first real save starts, the owner can review and reopen that original copy. Work warns that unsaved edits made there are not copied back into Practice and will be lost if its editor is closed/reloaded. Reopening does not promise recovery of those later edits.

The canonical Draft editor durably fences this tab's journal before its first Save request. A successful response records the saved Draft ID; an ambiguous/error response keeps the fence and tells the owner to check Work. Stale mounted Practice edits cannot downgrade the fence or replace the original handoff payload. Initial-save retries are blocked when the outcome is uncertain. An implicit Create Estimate action is blocked until an explicit first Save. Subsequent editing of the saved canonical Draft uses its normal existing workflow.

This is **not** the deferred persistent importer. The journal is same-tab only; duplicated tabs, cleared storage, other devices and eventual server-side reconciliation require durable provenance/idempotency design. No claim of cross-device exactly-once transfer is made. There is intentionally no abandon/reset button that could replay an uncertain server write.

## Inherited PR #588 work

The older default-off `#/practice-demo` synthetic pilot remains separate. Its exact Demo gates, transport, access expiry and retained synthetic work are unchanged. The installed SQL file and separate unapplied deadline-response draft remain byte-identical. Disposable database/import/cleanup experiments remain local test tools; they do not become live Practice capabilities. No pilot renewal or hosted fixture reset occurred.

PR #591 request navigation/linked-Invoice fixes and PR #593 Safari/landing behavior are preserved. Legal PR #583 and Help media work are outside this change.

## Validation and limitations

- Six new domain tests cover template fidelity/allowlists, stripped real handoff payload, same-tab resume, storage failures and monotonic initial-save fences after stale edits.
- Eight new Chromium/WebKit desktop/mobile cases exercise explicit snapshot refresh, frozen old prices, template selection, reload/resume, marked PDF bytes, source failures, storage failures, destination confirmation, pre-save reopen, explicit-Save launch guard, uncertain Save retry blocking and stale Practice edit/replay rejection.
- The inherited 44 disposable PostgreSQL/contract tests (50 total with the six new domain tests) and 28 Demo Chromium/WebKit browser tests pass. Synthetic claims and local routing are used; no hosted database or customer records are accessed.
- Full/Practice types, production build, lint (0 errors, unchanged 76-warning baseline), 27 architecture checks, 16 backend-parity tool tests, six runtime-parity tool tests, 60 recorder tests and App budget pass. These tooling tests do not assert live environment parity. Existing build chunk-size/Browserslist warnings remain.
- All 108 focused Chromium/WebKit onboarding/navigation/request-invoice/Draft regression cases pass: 60 unaffected-area cases and 48 Draft cases after repairing the existing mock fixture to wait for its requested React-effect RPC. Initial WebKit failures were mock registration races, not failed service calls. Exact remote CI/Preview is recorded on PR #588 after publication. New browser fixtures replace App with synthetic adapters and run the actual composer/entry/router. No authenticated hosted business-read, persistent customer save, physical-iPhone PDF or cross-device acceptance claim is made.
- Independent source review found and verified repairs for unsaved-handoff recovery, template compatibility, App journal propagation and stale-state fence downgrades. No remaining source blocker was reported before publication.

## Publication verification record

The first published app commit `742fad2f90192139d9d823f5865a472417c2773f` produced READY Preview `dpl_5wTWyozcorbQRXt7WLqtWm7Cs4Af` at [the exact deployment](https://servsync-demo-krstgkjjh-bencatchots-projects.vercel.app/#/contractor?practice=estimate). Anonymous HEAD returned HTTP 302 to Vercel `/sso-api`; protection was preserved and not bypassed. PR #588 is draft and mergeable against main `93cf7862`. Its first quality run stopped at the tutorial declaration before application checks because the PR body omitted the separate `Affected tutorials` and `Tutorial follow-up` fields. The body now includes both and passes the repository validator. This documentation-only follow-up triggers quality checks with the corrected declaration; final exact head/CI/Preview status is recorded on PR #588. It makes no app-code change or tutorial-completion claim.

## Remaining work and tutorial impact

Next owner step: review the protected Preview on the existing account, without renewing the historical Demo pilot. Production merge requires separate approval. Remaining broader Practice work includes durable/cross-device business snapshots and real Draft import provenance/receipts/reconciliation, approved retention/cleanup, additional practice document/scenario types and hosted acceptance. Those are not implemented by this browser-tab slice.

Tutorial impact: **UPDATE REQUIRED**. TUT-002's existing guided-first-estimate replacement should explain Dashboard → Practice, example versus business setup, explicit refresh/frozen versions, fictional PDF and the separately confirmed unsaved Work handoff. No tutorial/narration/media work or Help Studio data access was performed. The user kept that work separate; this Preview does not claim the guidance gap complete. Previously recorded Help evidence is historical, not a fresh catalog/playback check.
