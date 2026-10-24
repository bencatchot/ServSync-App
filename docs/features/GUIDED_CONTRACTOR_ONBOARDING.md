# Guided contractor onboarding — review branch

Issue: https://github.com/bencatchot/ServSync-App/issues/585
Branch: `codex/guided-contractor-first-estimate`
Base: `5ea8fecbb4bd2862775283be010954aa5951c25e`

## Bounded current-flow diagnosis

Signup already asks name, email, password and explicit legal acceptance, with email confirmation when required. This change preserves that logic. PR #583 separately owns legal-policy/versioned-acceptance work and remains a rebase/review touchpoint.

The contractor dashboard previously displayed a broad business-profile prompt (including logo, website and description) and a seven-step checklist: profile, customer, Job, sent Estimate, sent Invoice, homeowner invitation and report. Completion depended on sending documents and performing the full lifecycle. That obscured the useful first-estimate outcome.

The existing Work → Drafts path already provides planning and preview before customer selection, durable Save Draft after selecting a customer, guarded/idempotent output creation, role-aware capabilities, customer/property selection and deliberate Estimate sending. Its editor has scope, reusable pricing, labor models and accurate totals. Reuse it; do not create a second real-record lifecycle.

## Implemented scope

- Replace the competing profile prompt/checklist with a dismissible guide to practice or a real estimate. Existing contractors can open the guide explicitly; regular navigation remains available.
- Keep signup questions and legal/security/billing requirements unchanged. The guide explains customer-visible business information and links to the existing profile editor; business name is required for its real-work entry. Logo and profile polishing are optional. No solo/crew question is collected because it does not change this estimate path.
- Optional practice examples cover general service, plumbing and electrical, with a general-service default. Rates are explicitly fictional examples, not recommendations.
- Practice uses the real `ContractorDraftComposer`, canonical pricing helpers and customer PDF renderer. It has synthetic identities, no API client, no output-launch callback, no send/payment action and no access to real customer options. It is browser-local rather than a shared Demo fixture because a new customer must not receive credentials/access to the operator-only Demo scenario. No fixture seeding or database writes are needed.
- Practice edits persist in sessionStorage for refresh/same-tab resumption. Guide choice/skip/preview flags persist in localStorage under actor + contractor identity. These are not cross-device progress or new product telemetry. Storage failure is visible and does not block using the regular workflow.
- Moving to real work invokes the existing clean Draft action with no sample argument. Real work remains explicitly saved through the existing durable API and resumed from Work → Drafts. Existing retry/idempotency machinery is unchanged.
- The real editor now offers a customer PDF preview before saving/creating/sending. It includes current company/logo, selected customer/property labels, customer-facing scope/lines and the canonical total. Private notes are omitted. Missing prices and invalid labor inputs block a misleading preview. Tax/payment terms are explicitly deferred to the created Estimate; this is a Draft preview, not a final document or delivery.
- After preview, optional Price Book and Customers entries appear. Team/payment setup is described as optional and only where existing availability permits. No new import, team access, payment integration or entitlement behavior.

## Evidence and limits

- TypeScript, production build, app-size ratchet and 27 architecture tests passed during implementation. App.tsx shrinks by 202 lines.
- Focused browser tests execute the actual editor, pricing calculations and PDF generation with fictional browser-local data. Desktop/mobile sample $195 → quantity edit $270, refresh/resume, skip persistence, malformed storage, account scoping, disabled real-work entry and sample-to-real navigation passed. Network observation found no non-GET requests in practice.
- 29 existing Draft creation/workspace browser regressions passed. These use isolated adapters and cover save/resume, duplicate-save protection, interrupted/stale operations and output navigation; they do not prove hosted persistence.
- Existing `validate-admin-office-estimate-authority.sh` passed against disposable local PostgreSQL, including real SQL role boundaries. No shared migration was applied.
- A dedicated authenticated Demo read-only check is included with an explicit opt-in, fixed Demo backend, RPC allowlist, business-write denial and disabled credential-bearing test artifacts. It checks the full app's entry → practice → fresh unsaved real Draft → customer preview. Passed locally against the actual Demo backend on October 15: sample $195, fresh real Draft with blank customer, then unsaved real preview $125; zero blocked/attempted business mutations.
- Hosted verification on October 15 passed on desktop and 390px mobile at `https://servsync-demo-1it47qh03-bencatchots-projects.vercel.app`, exact application commit `877a74c8d649cfb732483de38eb3367da249bb52`. Existing Demo credentials and the explicitly approved bypass were used with an exact-origin header guard; the unrelated Vercel toolbar was blocked. Both runs reached sample $195 → clean real Draft → unsaved $125 customer preview with no attempted business writes. The initial strict run flagged only the toolbar login request, which remained blocked in the passing reruns. No settings or access grants changed.
- Fresh-account signup/confirmation, shared-backend Save Draft/refresh, creation/duplicate retry with a real customer/property and cross-device progression remain release acceptance items. No new user or business record has been created to claim those checks passed.

## Review recording and scoped correction

The subsequent TUT-002 recording exposed `Updated: Invalid Date` in the actual sample PDF. Full Chromium reproduced the problem, and source review confirmed that the presentation-only record intentionally has no persisted timestamps. Commit `fc4d2d770ab536a1c41151a73601d8326bf39361` adds an optional preview-generation date to the existing PDF renderer, passed only by the unsaved preview. Persisted Estimate PDFs retain their existing Updated date. This is the only application change after the original hosted-tested commit.

Six focused checks now pass, including actual PDF text on desktop/mobile and a saved-Estimate date regression; the strengthened authenticated local frontend → actual Demo backend flow also passes with no business-write attempt. Type/build, focused lint, two recorder safety tests, GitHub quality run `38756636425` and all three Preview builds pass. The new immutable Demo Preview is `https://servsync-demo-mddems300-bencatchots-projects.vercel.app`; its desktop/mobile read-only browser checks passed after explicit destination approval, including actual generated-PDF date assertions. No business-write attempt was detected.

A 68.92-second, 1440×900 silent review package was recorded from the validated local frontend at `fc4d2d7` against the real Demo backend. It shows isolated practice, $270 PDF preview, refresh/resume, skip/reopen and a blank unsaved real Draft. Existing shared recorder pacing and media tooling are reused with a dedicated read-only network guard. No seed, reset, save/launch RPC, customer delivery, payment, account change or Help job is permitted. Authentication is outside the recording; account state remains in memory. Full Chromium displays the generated PDF correctly; headless-shell does not provide its PDF viewer and is not used for the final recording.

Local package: `~/Documents/Codex/2026-10-15/task-3/tut002-guided-setup-review/` (`preview.html`, MP4, 15-cue VTT, narration script, hash manifest, actual sample PDF and review images). It is explicitly a local review artifact, not an ingestible/published Help Studio package. Media SHA-256: `9cb7b1850ba8c6d816751c0add76efa16ff07259208b24794d83250525f92d1b`. Full playback completed at 68.92 seconds with no media error; 15 cues loaded and visible captions were visually checked using the existing Help caption font size. Package/media/PDF hashes were verified independently. No paid narration or new provider request. The existing narrated TUT-002 remains unchanged.

The [exact remaining acceptance plan](../qa/GUIDED_ONBOARDING_REMAINING_ACCEPTANCE.md) identifies the verified Demo Owner/customer/property, a proposed retained one-Draft/one-unsent-Estimate test, the expected six-row footprint, initial-save versus launch retry limits, and the owner-controlled signup action needed for a genuinely fresh account. On October 15 the owner separately approved this bounded test: one retained Draft and one unsent $125 Estimate passed refresh, navigation, independent-login resume and same-key launch retry without duplicates. Private record IDs are held in the local acceptance receipt, not this repository. Fresh signup remains unverified; recovery of an ambiguous initial save used the existing Draft list, not blind replay.

## Existing adoption signals (source review only)

Existing Draft `created_at`/`updated_at`, launch receipts and Estimate timestamps/status can support a reviewed first-Draft/first-created-Estimate funnel. The old checklist used customer count and non-draft Estimate/Invoice counts, not preview completion. Vercel Analytics is mounted in App, but no custom onboarding timing/drop-off event was identified in this bounded path. Help Studio/pilot docs track assistance and task-based learning. No live analytics query, new tracker, consent change, email, content upload or additional personal-data collection is part of this branch. Browser-local guide flags are not evidence of successful sending or measured adoption.

## Tutorial and release gate

**Tutorial impact: UPDATE REQUIRED.** Post-verification authenticated Demo Help searches succeeded but found no published matches for onboarding, estimate, first estimate, contractor.dashboard or contractor.drafts. PR #577 records the published TUT-002 revision 4. Its preserved publication package passed video/caption hash verification and full 62.44-second local browser playback with 14 cues and no media errors. It covers Save/Create/Send distinctions, but omits the new guide and preview controls. This is not a fresh Production Help retrieval.

The [bounded update brief](../tutorials/GUIDED_FIRST_ESTIMATE_UPDATE_BRIEF.md) records evidence, affected steps and proposed scenes. Reuse PR #577's recorder/Help Studio process. Fresh Production contextual playback and the approved replacement/addendum publication remain release gates. No paid narration, recording upload or Help content mutation occurred. Repository `AGENTS.md` requires that an UPDATE REQUIRED task not be reported complete until its replacement is published and verified; overall completion is not claimed.

## Factual wording after release

“Guided setup helps you try a sample estimate or prepare your own Draft and review a customer preview. Optional business setup can wait.”

Do not claim seamless onboarding is proven, advertise a completion-time guarantee, imply practice is a live customer record, promise autosave/cross-device guide progress, or describe this review branch as released.

## Fresh post-confirmation fixture acceptance — October 24

A separately approved, confirmed fictional contractor fixture allowed initial onboarding to be tested without a real inbox. This verifies the post-confirmation journey, not public signup, email delivery, confirmation-link redemption or legal-acceptance submission. No global Auth setting or existing identity was changed.

The current PR source ran locally in an isolated Chromium browser against the real Demo backend, with an exact-origin network guard and bounded UI writes. This is distinct from deployed-Preview acceptance. The fresh account reached the guide before creating a business, previewed the isolated sample, retained edited sample quantities after refresh, skipped optional setup, and reopened the guide. Business-name validation prevented an empty save; a minimal fictional business unlocked real estimates without a logo, service catalog, service area or teammate setup. The real editor started empty and produced an accurate customer PDF before selecting a customer.

This run exposed a guidance mismatch: existing Draft validation requires a customer before Save Draft, while the guide implied customer selection could wait until Estimate creation. The guide, shared editor and real-preview help now state that distinction explicitly. Validation, authorization and persistence rules are unchanged; sample help does not instruct users to save real records.

Using the existing inline contractor-only customer flow, the fixture saved a Draft and resumed its customer, scope, quantity and decimal price through a separate normal login and full refresh. Explicit creation and its confirmation produced an unsent $250.50 Estimate; refresh preserved it. Read-only database checks confirmed the expected single Estimate and no Invoice. Ordinary-owner, foreign-contractor and anonymous Draft read checks exercised the real Demo backend. No send, payment, invitation, real customer data or Practice access was used.

Twelve existing focused checks passed: six guide/PDF/browser/domain checks, including desktop/mobile layouts, and six signup-confirmation source checks. Three fixture-preservation unit tests also passed. Source checks are not email-delivery evidence. Physical-device, additional staff-role and public-signup/confirmation checks remain unverified. Private fixture identifiers, credentials and receipts are kept outside this repository.

Tutorial impact remains **UPDATE REQUIRED** for TUT-002. Its replacement/addendum must explain customer selection before saving a real Draft. The earlier review video is historical evidence, not an updated publication of this wording; the existing Help approval/publication gate remains.

## Safari review-entry correction — October 16

Both Sign in role choices failed in desktop WebKit on the reviewed `mddems300` Demo build: the blur handler hid native links before their click completed. No console/API error occurred. The narrow landing-menu repair keeps null-focus transitions open and closes on outside pointer actions or real focus exit. Chromium and WebKit tests exercise the actual links for both roles at 1440/820/390px plus keyboard/dismissal; all 28 public landing cases pass locally. Existing Demo uses normal email/password authentication; role selection is not automatic Demo login. No auth configuration or role boundary changed. Updated hosted evidence is maintained in PR #586.
