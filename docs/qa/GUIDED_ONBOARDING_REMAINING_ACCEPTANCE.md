# Guided onboarding — exact remaining acceptance scope

Issue #585 / draft PR #586. The bounded Demo record test below was explicitly approved and completed on October 15. Fresh signup remains unverified. No test credentials or private record IDs belong in this document.

## Verified existing fixture

- Environment: dedicated Demo Supabase project `bdytwgejqnlblhrnqxkp`.
- Existing account: Marcus Bennett, owner of **Gulf Coast Home Services**, bound to the existing `DEMO_CONTRACTOR_EMAIL` / `DEMO_CONTRACTOR_PASSWORD` configuration. Normal authentication verified `servsync_demo_owned=true`, scenario `water_heater_core_loop`, role `contractor_owner`; no identity, password, metadata or access changes.
- Existing customer/property: **Sarah Johnson → Demo Bay Home · Fairhope, AL**. Read-only ordinary Draft UI lookup returned exactly one Sarah Johnson match, marked Connected, and that property. Save Draft was visible. No customer/property was created, edited or selected in a persisted record.
- Corrected application Preview: `https://servsync-demo-mddems300-bencatchots-projects.vercel.app`, commit `fc4d2d770ab536a1c41151a73601d8326bf39361`. Vercel confirms `servsync-demo`, READY, Preview target, this repository and branch. The earlier approved URL is a different immutable build. Destination-specific bypass approval was granted and desktop/mobile read-only verification passed. No new bypass link or grant was created.

The established Demo account is suitable for persistence testing but cannot prove fresh signup. Do not reset its profile/history to simulate a new contractor. Do not run the existing seed/reset/full-core-loop tools: their cleanup permanently deletes records, and some workflows create additional records or messages outside this bounded test.

## Minimal hosted save/resume/retry test — approved and passed October 15

Exactly one Draft/item and one unsent $125 Estimate/item were retained, with one durable launch receipt. The interrupted initial Save first wrote nothing; its forwarded retry committed once and an intentionally suppressed response was reconciled through the unique Draft list entry. Refresh, navigation, another browser login and known-ID save preserved the same Draft. A suppressed successful launch response followed by the UI's same-key retry returned the same Estimate with `idempotent=true`; independent read-only verification confirmed the counts, consumed Draft, unsent Estimate and total. The automatic private audit row was not inspected. IDs and complete receipts remain in the private local test report. No deletion, messages, signup or configuration changes occurred.

The following describes the exact executed scope, including its limits:

Executed authorization: use the existing Demo owner and existing Sarah Johnson / Demo Bay Home fixture to **create and retain one uniquely labeled synthetic Draft with one line, then one unsent Estimate from that same Draft**. No other business objects are needed.

Use a unique title such as `ONBOARDING QA PR586 <UTC run timestamp> — DO NOT SEND`, scope `Synthetic acceptance fixture; retain for review; do not send`, one labor line `Synthetic repair`, quantity 1, price $125.00, tax zero. Do not use a real customer, add contacts/properties, connect payments or alter the existing shared fixture.

1. Verify fixture ownership/capabilities and the exact runtime project again. Read the owner's Draft/Estimate lists for the unique marker; refuse if it already exists. Keep a local receipt of only this run's new IDs.
2. Open a clean real Draft. Exercise an interruption before forwarding the initial Save request, then retry once through the UI. Forward that retry once, capture the success receipt outside the page, and suppress its response to model an ambiguous save outcome. This creates the one Draft and one line. Never automatically resubmit an initial Save with an unknown outcome.
3. Reconcile that ambiguous save through the existing read-only Draft list before doing anything else. Resume the unique matching saved ID and verify it matches the captured success receipt; stop if the result is ambiguous. Refresh, leave and reopen Work → Drafts, then open a new browser session with the same existing account. Verify title, scope, customer/property, one line and $125 total. Repeat Save only with the known Draft/item IDs; verify no extra Draft/item appears.
4. Keep the distinction explicit: this is recovery by finding the existing record, not proof of blind retry safety. Source review shows a null-ID initial Save creates a new Draft, while output creation has a separate durable idempotency key. Existing double-click tests are not proof that blindly replaying a null-ID Save is safe. Record any confusing recovery behavior as an acceptance finding; do not create a second Draft to conceal it.
5. Explicitly select Create Estimate and confirm, forwarding one launch for this known Draft. Suppress only its response to simulate interruption. Refresh/reconcile/retry through the existing retained launch key. Require exactly one returned Estimate ID, one launch receipt and the consumed Draft pointing to that same output. Verify the Estimate remains Draft/unsent, total $125, and one line. No Send action is permitted.
6. Leave all newly created records in place for review and record their IDs locally. No reset, discard, hard delete, trigger change or shared SQL. Stop on any unexpected write, customer-delivery request, additional output or identity mismatch.

Expected retained footprint is **six product rows**: one `contractor_work_drafts`, one `contractor_work_draft_items`, one `contractor_work_draft_launches`, one `estimates`, one `estimate_line_items`, and the existing automatic `estimate_actor_audit` row. This follows the prior six-record Draft-first Demo receipt in PR #577 and the existing SQL path. The Owner cannot directly inspect the private audit table; do not grant access or claim a privileged audit-row count was checked. Keep all other records and the shared scenario registry unchanged.

Permitted mutation RPCs for this run are only `servsync_save_work_draft` and `servsync_launch_work_draft`, with payload checks binding them to this run and the verified fixture. The save payload must not remove items. Block notifications, email/SMS, payment, other outputs, deletes and all other write endpoints. The current recorder/read-only test deliberately permits neither mutation RPC.

## Fresh-account signup and first-run acceptance — owner action required

No unused, never-onboarded hosted account has been identified in the established fixture evidence. The verified Marcus account already has a company and history; a new browser profile is not a new account. Do not create credentials, rotate passwords or clear existing records to manufacture this test.

To verify the actual signup/confirmation boundary, the owner must use **one owner-controlled dedicated test inbox not already registered in the Demo environment**, choose their own password in the ordinary contractor signup on the corrected Demo Preview, complete the existing legal acceptance and any confirmation email, then return to that same Preview. The owner should record only the test-account identifier and result through the approved local credential/session mechanism; passwords and confirmation tokens must not be relayed in chat or committed. No real customer inbox or invitation is involved.

Expected minimum effects of that owner action: one Auth user, its application profile and the existing automatic referral-code record; normal authentication/audit metadata and confirmation delivery as required by existing Auth configuration. Use no referral/invite code. The browser-local sample/preview needs no customer, Estimate or payment record. If testing real business setup as well, save one synthetic contractor business profile using the existing required business-name field; keep optional branding, price imports, team and payment setup skipped. Existing normal security/legal rules remain in force.

After the owner completes that action, verify new-account first entry, empty states, sample preview, skip/reopen, refresh and business-details explanation without writes. Any hosted real Draft test for that fresh tenant needs its own synthetic customer/property fixture and separate scope; the existing-owner test above avoids that extra footprint. If the owner does not want a new retained test identity, leave true signup/email-confirmation acceptance explicitly unverified. No configuration changes or account deletion are needed or proposed.

## Narrow decisions

1. Completed: exact corrected-Preview bypass approval and desktop/mobile read-only verification.
2. Completed: the separately approved one-Draft/one-unsent-Estimate retained fixture test above. No approval to seed/reset or delete anything.
3. Owner performs the one dedicated-inbox signup/confirmation if fresh-account acceptance is required; Codex does not create its credentials.

Help recording review is independent of these writes. Help ingestion, paid narration and publication remain outside this authorization.
