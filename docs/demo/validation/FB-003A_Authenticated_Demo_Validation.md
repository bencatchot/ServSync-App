# FB-003A Authenticated Demo Validation

This is the canonical authenticated Demo browser procedure for FB-003A, Local-Customer Multi-Property Claim.

The procedure remains the reusable validation standard. Its 2026-08-01 authenticated Demo execution and combined evidence review passed; the recorded result appears in [Recorded Completion Result](#recorded-completion-result---2026-08-01). Do not treat the procedure steps alone as evidence of a future run.

## Purpose And Scope

Validate the merged FB-003A product behavior in the dedicated ServSync Demo environment:

- A contractor-created local customer can receive one manual claim invitation covering an explicit selected set of properties.
- The homeowner can preview the token-free selected set.
- The homeowner must choose a valid destination for every invited property.
- Acceptance claims the complete set atomically.
- Single-property claim invitations remain compatible.
- Connected-homeowner detail pages remain null-safe and do not expose local-claim controls.
- Tenant isolation, token containment, and no-provider-delivery boundaries remain intact.

This procedure exercises the actual Demo browser application. Catalog/security checks may support evidence, but they do not replace the browser workflow.

## Demo-Only Target Restrictions

Run only against the positively identified ServSync Demo environment:

- Validation target: `SERVSYNC_VALIDATION_TARGET=demo`
- Demo Supabase ref: `bdytwgejqnlblhrnqxkp`
- Demo app URL: the current dedicated `servsync-demo` Vercel deployment

Do not access, query, mutate, or validate against:

- Production Supabase ref `uqgtheclhxqlnjpfmheq`
- Shared Sandbox Supabase ref `zpzdkoaubyjtsomccxya`
- `https://servsync.app`
- `https://www.servsync.app`

Stop if the configured app URL, Supabase URL, project ref, linked Supabase CLI project, or selected validation target disagree.

## Required Account Personas

Use the approved secret source for these environment-variable slots. Never hardcode, print, screenshot, persist, or report credential values.

| Persona | Environment variables | Required role |
| --- | --- | --- |
| Contractor A | `DEMO_CONTRACTOR_EMAIL`, `DEMO_CONTRACTOR_PASSWORD` | Contractor owner for the primary Demo contractor profile |
| Homeowner A | `DEMO_HOMEOWNER_EMAIL`, `DEMO_HOMEOWNER_PASSWORD` | Homeowner profile used for the primary claim |
| Contractor B | `DEMO_CONTRACTOR_B_EMAIL`, `DEMO_CONTRACTOR_B_PASSWORD` | Separate contractor owner used for isolation checks |
| Homeowner B | `DEMO_HOMEOWNER_B_EMAIL`, `DEMO_HOMEOWNER_B_PASSWORD` | Separate homeowner profile used for stale and single-property checks |

Sign out fully between personas unless the test explicitly uses isolated browser contexts.

## Required Starting State

Before Test A:

- Demo app is serving a source SHA that contains PR #348 / FB-003A.
- Demo database has the claim-invitation baseline and `servsync-local-customer-multi-property-claim.sql` installed.
- Security catalog validation for the Demo target has passed.
- The four account personas authenticate and reach the expected role-specific landing page.
- External-effect flags are unset or explicitly disabled.
- There are no active FB-003A disposable fixtures that could be confused with the run.

If reusable Demo presentation data exists, do not delete it. Create clearly labeled disposable FB-003A records for this validation run.

## Provider-Delivery And External-Effect Prohibitions

The validation must not trigger:

- Email
- SMS
- Push notifications
- Provider delivery
- Payment requests
- Webhooks
- Edge Function delivery calls
- Real-user invitations

Use only the internal/manual/non-delivery claim-invitation path.

## Secret And Token Handling

Raw claim tokens and token-bearing claim URLs are sensitive. The procedure permits a controlled browser-only handoff so the homeowner can open the claim route, but the token must never become evidence.

Canonical safe token handoff:

1. Invite creation must not expose a token.
2. When a later test must open a claim route, Contractor A may use the guarded in-app Copy Link control.
3. Transfer the copied claim URL directly into a separate, isolated Homeowner browser context.
4. Never print, report, journal, screenshot, persist, or commit the token-bearing URL.
5. Do not use email, SMS, notifications, or another provider-delivery mechanism.
6. Clear clipboard or transient token state immediately after navigation.
7. Evidence may show the resulting token-free claim preview, but not the URL, token, QR payload, request authorization data, cookies, or browser storage.

Do not inspect browser storage, network payloads, logs, screenshots, traces, or videos in a way that exposes credentials, cookies, authorization headers, raw tokens, service-role keys, or token-bearing URLs.

## Fixture Creation And State Preservation

Use normal ServSync browser workflows only unless a later prompt separately authorizes a repository-approved Demo seed/reset operation.

Fixtures must be:

- Synthetic and clearly labeled for FB-003A Demo validation.
- Owned by the expected persona.
- Minimal for the test.
- Isolated from unrelated Demo presentation data.

Do not create service requests, estimates, jobs, invoices, payments, messages, provider-delivery rows, or external sends as part of these tests.

Preserve the Test A invite through Tests B, C, D, G, and the Test H checkpoints. Tests E and F must use separate fresh disposable fixtures.

## Execution Order

Run in this order:

1. Test A - Multi-property invite creation.
2. Test H pre-accept isolation checkpoint.
3. Test B - Token-free multi-property claim preview.
4. Test C - Atomic multi-property acceptance using create-new mappings.
5. Test D - Completed-invite replay protection.
6. Test G - Connected-homeowner QR/link regression, using the connected relationship from Test C when practical.
7. Test E - Stale-invite invalidation, using a fresh disposable fixture.
8. Test F - Single-property compatibility, using a fresh disposable fixture.
9. Test H post-accept containment checks.

Tests E and F must not require resetting or recreating the four prepared account personas.

## Tests A-H

### Test A - Multi-Property Invite Creation

Persona: Contractor A.

Prerequisite: A fresh disposable local customer belonging to Contractor A with at least two eligible unclaimed local properties.

Actions:

1. Sign in as Contractor A.
2. Open the Homeowners area.
3. Create or open the disposable local customer.
4. Confirm at least two eligible unclaimed local properties are visible.
5. Select exactly two eligible properties.
6. Create one claim invitation through the normal Demo browser UI.

Expected visible result:

- Confirmation identifies the intended local customer.
- Property count is two.
- Both selected properties are represented.
- No unselected or cross-tenant property is included.
- The UI states that sharing remains manual and non-delivery.

Expected Demo database mutation:

- One pending claim invitation.
- Exactly two associated membership rows in stable order.

Records that must remain unchanged:

- No contractor-homeowner connection is created.
- No homeowner property is created or linked.
- No estimate, job, invoice, payment, message, notification, or delivery record is created.

Forbidden access/effects:

- No cross-tenant property appears.
- Invite creation does not display or return a raw token through the ordinary creation result.
- No provider delivery occurs.

Evidence required:

- Screenshot or trace of the token-free confirmation and selected-property summary.
- Non-secret IDs and aggregate counts for the invite and two membership rows.
- Network/console summary showing no failed ordinary requests and no provider delivery.

State rule: Preserve this invite for Tests B-D and the pre-accept Test H checkpoint.

### Test B - Token-Free Multi-Property Claim Preview

Persona: Homeowner A.

Dependency: Test A and successful Test H pre-accept isolation checkpoint.

Actions:

1. Use the approved guarded Copy Link handoff.
2. Open the route in an isolated Homeowner A browser context.
3. Do not record the token-bearing URL.
4. View the claim preview without accepting.

Expected visible result:

- Preview shows the correct contractor/local-customer context.
- Preview shows exactly the two selected properties.
- No unrelated or cross-tenant property appears.
- Names, addresses, and property count are understandable on mobile.

Expected Demo database mutation:

- None from previewing.

Records that must remain unchanged:

- Invite remains pending.
- Local contact remains unclaimed.
- Local homes remain unclaimed.
- No connection or homeowner property is created.

Forbidden access/effects:

- Captured evidence contains no token, claim URL, QR payload, cookie, authorization header, or browser-storage secret.
- No provider delivery occurs.

Evidence required:

- Token-free preview screenshot.
- Token-free aggregate before/after showing no mutation.
- Console/network error summary with sensitive values redacted or omitted.

### Test C - Atomic Multi-Property Acceptance Using Create-New Mappings

Persona: Homeowner A.

Dependency: Test B.

Actions:

1. In the claim page, choose "Create new ServSync property" for every invited property.
2. Confirm each invited property has a mapping.
3. Accept through the normal v2 browser flow.

Expected visible result:

- All mappings are required before acceptance.
- Acceptance succeeds as one complete operation.
- The success result is clear and non-crashing.

Expected Demo database mutation:

- One active contractor connection exists between Homeowner A and Contractor A.
- The local contact is claimed by Homeowner A.
- Both selected local homes are linked to newly created Homeowner A homes.
- Invite status becomes `claimed`.
- Membership rows record the claimed homeowner home IDs.
- A local-customer claim accepted audit event is present where the implementation records it.

Records that must remain unchanged:

- No duplicate homeowner homes for the same invited property.
- No duplicate contractor connections.
- No duplicate ownership, membership, or claim rows.
- Unrelated tenant records remain unchanged.

Forbidden access/effects:

- No partial claim is acceptable.
- No provider delivery occurs.

Evidence required:

- Success screenshot.
- Non-secret before/after row counts and IDs proving identity preservation and no duplicates.
- If acceptance fails, evidence that none of the acceptance mutations were partially applied.

### Test D - Completed-Invite Replay Protection

Persona: Homeowner A.

Dependency: Test C.

Actions:

1. Attempt to reopen or reuse the completed invitation through the same safe internal path.
2. Do not record or expose the token-bearing URL.

Expected visible result:

- Invite is unavailable or produces a clear handled rejection.
- Application does not crash.

Expected Demo database mutation:

- None.

Records that must remain unchanged:

- No duplicate homes.
- No duplicate connections.
- No duplicate membership rows.
- No new claim mutation.
- Invite status does not regress.

Forbidden access/effects:

- No token-bearing evidence.
- No external delivery.

Evidence required:

- Handled rejection screenshot or route-state evidence without URL/token.
- Non-secret aggregate proving no duplicate rows or status regression.

### Test E - Stale-Invite Invalidation

Personas: Contractor A and Homeowner B.

Prerequisite: A separate fresh disposable local customer and eligible property owned by Contractor A.

Actions:

1. Sign in as Contractor A.
2. Create a pending claim invitation for the fresh disposable local customer.
3. Before acceptance, use the supported contractor profile-edit flow to change a copied public claim/contact field that the implementation treats as invalidating, such as name, phone, or email.
4. Use the safe internal route handoff to attempt preview or acceptance as Homeowner B.

Expected visible result:

- Contractor UI reports the pending invitation was revoked or no longer usable.
- Preview or acceptance is unavailable to Homeowner B.

Expected Demo database mutation:

- The pending invitation becomes `revoked`.
- The local contact edit is applied.

Records that must remain unchanged:

- No contact or property is claimed.
- No homeowner property is created or linked from the stale invite.
- No contractor-homeowner connection is created from the stale invite.
- No partial acceptance mutation occurs.

Forbidden access/effects:

- Do not describe or test unsupported in-place invitation-membership editing.
- No external delivery.
- No token-bearing evidence.

Evidence required:

- Contractor stale-invalidation UI evidence.
- Token-free aggregate showing revoked invite and no claim/connection/home mutation.

Cleanup/state rule: Retain or clean this fixture only through the approved Demo cleanup/reset path.

### Test F - Single-Property Compatibility

Personas: Contractor A and Homeowner B.

Prerequisite: A separate fresh disposable local customer with exactly one eligible local property.

Actions:

1. Contractor A creates a one-property claim invitation through the supported UI.
2. Homeowner B opens the route through the safe internal handoff.
3. Homeowner B previews the single property.
4. Homeowner B accepts with a create-new or valid existing-home mapping.

Expected visible result:

- Preview shows one property.
- Acceptance succeeds with single-property copy and layout.
- Multi-property support does not degrade the original single-property experience.

Expected Demo database mutation:

- Exactly one local property is claimed.
- One valid active connection exists.
- Invite status becomes `claimed`.

Records that must remain unchanged:

- No duplicate homes.
- No duplicate connections.
- No extra claim membership rows beyond the one selected property.

Forbidden access/effects:

- No external delivery.
- No token-bearing evidence.

Evidence required:

- Token-free preview and success evidence.
- Non-secret aggregate proving exactly one property was claimed.

### Test G - Connected-Homeowner QR/Link Regression

Persona: Contractor A.

Dependency: Use a connected homeowner relationship created by a completed earlier test, preferably Test C.

Actions:

1. Sign in as Contractor A.
2. Open the Homeowners area.
3. Open the connected homeowner detail created by the accepted claim.
4. Inspect the profile/home sections where local-claim QR/link controls would otherwise appear for unclaimed local customers.

Expected visible result:

- No blank screen or crash.
- No misleading claim invitation is shown.
- Copy Link and QR controls are not shown for the connected homeowner profile.
- Connected-homeowner shared fields render readable values rather than raw objects.

Expected Demo database mutation:

- None.

Records that must remain unchanged:

- No invite is created, prepared, revoked, or changed.
- No token state is persisted.

Forbidden access/effects:

- No prepare-token RPC is triggered.
- No token-bearing QR renders.
- No external delivery.

Evidence required:

- Connected homeowner detail screenshot.
- Console/network summary showing no crash and no prepare-token call.

### Test H - Tenant Isolation And Token Containment

Personas: Contractor B and an unrelated homeowner persona against Contractor A fixtures.

Required checkpoints:

- Run the pre-accept portion after Test A and before Test B/C.
- Complete applicable post-accept containment checks after Test C.

Actions:

1. As Contractor B, attempt to find or manage Contractor A's pending claim invite through normal browser-visible surfaces.
2. Where safe and supported by existing validation tooling, verify Contractor B cannot list, prepare, revoke, or otherwise manage Contractor A's invitation.
3. As an unrelated homeowner, verify claim details cannot be enumerated without the actual token-bound route.
4. Verify authenticated browser roles cannot directly read protected invitation or raw-token data.
5. After Test C, repeat containment checks that should remain true after claim completion.

Expected visible result:

- Contractor B cannot see or manage Contractor A's invite.
- The unrelated homeowner cannot enumerate Contractor A claim details.
- Ordinary list and preview evidence remains token-free.

Expected Demo database mutation:

- None.

Records that must remain unchanged:

- Contractor A fixture rows remain owned by Contractor A.
- No cross-tenant mutation occurs.
- No claim status, connection, homeowner property, membership, or delivery row changes because of isolation probes.

Forbidden access/effects:

- No direct raw-token access.
- No external delivery.
- No cross-tenant claim or management path.

Evidence required:

- Token-free denial/no-row evidence by persona.
- Security-catalog or browser-role table privilege evidence showing protected invite/token tables are not directly readable.
- Before/after aggregates showing no mutation.

If H requires a separate fresh fixture to keep the procedure deterministic, document the fixture label, expected rows, and supported revocation or cleanup action in the run report before creating it.

## Evidence Requirements And Result Format

The validation report must include:

- Demo deployment URL, source SHA, and Supabase ref.
- Account personas used, by persona label only.
- Fixture labels and non-secret IDs.
- Before/after counts for claim invites, invite-home memberships, local contacts, local homes, homeowner homes, contractor connections, connection permissions, audit events, and delivery/provider records.
- Mobile screenshots for the major user-visible states.
- Desktop screenshots where practical.
- Browser console errors.
- Failed network requests.
- Provider-delivery evidence showing no email, SMS, notification, Edge Function delivery, payment request, or webhook occurred.
- Explicit token-safety confirmation.
- Cleanup or retention status for every disposable Demo fixture.

Never include credentials, cookies, authorization headers, service-role values, raw claim tokens, token-bearing URLs, QR payloads, or browser-storage secrets.

## Post-Run Verification

After the tests:

- Confirm all expected mutations are accounted for in the mutation ledger.
- Confirm no unexpected Demo records changed.
- Confirm no external delivery occurred.
- Confirm no token-bearing evidence was captured.
- Confirm no incomplete transaction or waiting lock remains.
- Confirm disposable fixture cleanup or retention follows the Demo runbook.
- Confirm the run result and the separately controlled minimum Production confirmation are reviewed before closing the applicable milestone.

## Stop Conditions

Stop immediately and report if:

- Demo identity cannot be proven.
- Production or Sandbox is targeted or appears in configured validation values.
- Required credentials are missing.
- The Vercel bypass fails and the Demo app cannot be reached.
- The Demo database lacks the reviewed FB-003A schema/security baseline.
- A raw token, token-bearing URL, QR payload, cookie, authorization header, or credential appears in evidence.
- A provider delivery or Edge Function delivery occurs.
- A cross-tenant or unauthorized claim/manage path is reachable.
- Acceptance is non-atomic or creates partial mutations.
- Replay creates duplicate records or changes claimed state.
- Stale-invite invalidation does not revoke or reject as expected.
- Connected-homeowner detail crashes or exposes claim controls.
- Any P0, P1, or unresolved P2 defect remains.

Do not fix source, apply SQL, reset Demo, or continue into Production from this procedure unless a later prompt separately authorizes that action.

## Expected Mutation Ledger

| Test | Expected mutations |
| --- | --- |
| A | One pending claim invite and two invite-home membership rows for Contractor A's disposable fixture. |
| B | None. |
| C | One active Contractor A/Homeowner A connection, connection permissions, claimed local contact, two linked local homes, two Homeowner A homes, claimed invite status, claimed membership rows, and expected audit event where present. |
| D | None. |
| E | One fresh disposable pending invite, then revoked invite status after supported contact/profile edit; no claim acceptance mutations. |
| F | One fresh disposable one-property invite, one claimed property, one active Contractor A/Homeowner B connection, and expected single-property claim records. |
| G | None. |
| H | None from isolation and containment probes. |

Any additional mutation must be explained, tied to a normal browser action, and classified before the run can pass.

## Completion Meaning

This document keeps Tests A-H canonical for any future execution. A procedure by itself is not evidence of success; each run still requires target proof, sanitized evidence, mutation accounting, and a reviewed result.

The recorded 2026-08-01 execution satisfied the completion conditions below. Future runs must independently satisfy the same standard.

## Recorded Completion Result - 2026-08-01

**Final classification:** FB-003A AUTHENTICATED DEMO VALIDATION PASSED — READY FOR DOCUMENTATION CLOSEOUT

Reviewed identity:

- Repository/source SHA: `6e5226e869e64bfed3102acfa09779b846cbbb88`.
- Preview host: `servsync-demo-5e7r1phvh-bencatchots-projects.vercel.app`.
- Vercel deployment: `dpl_5ftAsDN7kV2qVAvGw67uzKWEBLAs`.
- Dedicated Demo Supabase project: `bdytwgejqnlblhrnqxkp`.

| Test | Reviewed disposition |
| --- | --- |
| A | Passed: one manual pending invitation represented exactly two contractor-selected properties and created exactly two membership rows without claim, connection, homeowner-home, or provider-delivery mutation. |
| B | Passed: Homeowner A received a mobile-readable, token-free preview of only the intended customer and two properties; preview caused no mutation. |
| C | Passed: one v2 acceptance atomically claimed the customer and both local properties, created two distinct homeowner properties, mapped both memberships, reused the valid Contractor A/Homeowner A connection, and recorded the expected profile/audit changes without duplicates or partial state. |
| D | Passed through the supplemental packet: the same transient claim URL was replayed exactly once after successful acceptance; the expected lookup `400` produced a handled unavailable-invite state and protected database state was exactly equal before and after replay. |
| E | Passed: a supported local-customer profile edit revoked only its fresh pending invitation, and stale preview was rejected without claim, property-link, connection, or partial mutation. |
| F | Passed: the legacy-compatible single-property preview and create-new acceptance claimed exactly one intended property without duplicates. |
| G | Passed: connected-homeowner detail remained readable and crash-free with no Copy Link, QR, prepare-token, or misleading claim controls. |
| H | Passed before and after acceptance: Contractor B and the unrelated homeowner could not enumerate or manage Contractor A claim data; browser-role direct reads were denied and no cross-tenant mutation occurred. |

The original run completed A, B, C, E, F, G, and H. Its first Test D replay runner timed out before capturing the handled UI, although no duplicate or regressive mutation occurred. A supplemental Test D run closed only that evidence gap by proving authenticated session continuity, scoped two-property preview, one atomic acceptance, one immediate replay, the handled unavailable state, and exact before/after equality for the contact, local homes, invite, memberships, homeowner homes, connection, permissions, audits, and aggregate counts. Safely stopped locator and execution-order attempts were validation-runner defects, not product failures.

Evidence identity:

- Original A-H packet `servsync-fb003a-demo-validation-20260731T225359`: 31 files, run ID `1785556691`, aggregate review fingerprint `94bd4acaff8b433009b5f89d9455d11d519eec90bbc76d82a88d12b569793f18`.
- Supplemental Test D packet `servsync-fb003a-testd-existing-invite-final.XTdrA3`: 10 files, aggregate review fingerprint `38d769c800661e2f39c301e1bd5f39de751a84c3600d1910771fa514a5e2debe`.

The packet names are runtime evidence identities, not durable repository links. Combined review found no credentials, JWTs, cookies, authorization headers, bypass values, raw claim tokens, token-bearing URLs, or QR payloads in retained evidence. Validation targeted Demo only; no Production or Sandbox validation access, SQL application, deployment/configuration change, external provider delivery, or unrelated data mutation occurred during the authenticated Demo run or combined read-only review.

No FB-003A product defect remained. Two nonblocking observations are separate from milestone completion:

- The handled replay page exposes raw RPC/JSON detail below its clear user-facing message. This is tracked as P3 polish under `FB-036` and does not weaken replay protection or acceptance behavior.
- The original packet lacks a standalone manifest. Its exact report path, run ID, complete test set, and aggregate fingerprint identified it unambiguously; this remains a bounded evidence-packaging weakness rather than product work.

No further authenticated FB-003A validation run is required.
