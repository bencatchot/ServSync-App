# Guided contractor onboarding — review branch

Issue: https://github.com/bencatchot/ServSync-App/issues/585
Branch: `codex/guided-contractor-first-estimate`
Base: `5ea8fecbb4bd2862775283be010954aa5951c25e`

## Bounded current-flow diagnosis

Signup already asks name, email, password and explicit legal acceptance, with email confirmation when required. This change preserves that logic. PR #583 separately owns legal-policy/versioned-acceptance work and remains a rebase/review touchpoint.

The contractor dashboard previously displayed a broad business-profile prompt (including logo, website and description) and a seven-step checklist: profile, customer, Job, sent Estimate, sent Invoice, homeowner invitation and report. Completion depended on sending documents and performing the full lifecycle. That obscured the useful first-estimate outcome.

The existing Work → Drafts path already provides optional-customer planning, durable Save Draft, guarded/idempotent output creation, role-aware capabilities, customer/property selection and deliberate Estimate sending. Its editor has scope, reusable pricing, labor models and accurate totals. Reuse it; do not create a second real-record lifecycle.

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

## Existing adoption signals (source review only)

Existing Draft `created_at`/`updated_at`, launch receipts and Estimate timestamps/status can support a reviewed first-Draft/first-created-Estimate funnel. The old checklist used customer count and non-draft Estimate/Invoice counts, not preview completion. Vercel Analytics is mounted in App, but no custom onboarding timing/drop-off event was identified in this bounded path. Help Studio/pilot docs track assistance and task-based learning. No live analytics query, new tracker, consent change, email, content upload or additional personal-data collection is part of this branch. Browser-local guide flags are not evidence of successful sending or measured adoption.

## Tutorial and release gate

**Tutorial impact: UPDATE REQUIRED.** Post-verification authenticated Demo Help searches succeeded but found no published matches for onboarding, estimate, first estimate, contractor.dashboard or contractor.drafts. PR #577 records the published TUT-002 revision 4. Its preserved publication package passed video/caption hash verification and full 62.44-second local browser playback with 14 cues and no media errors. It covers Save/Create/Send distinctions, but omits the new guide and preview controls. This is not a fresh Production Help retrieval.

The [bounded update brief](../tutorials/GUIDED_FIRST_ESTIMATE_UPDATE_BRIEF.md) records evidence, affected steps and proposed scenes. Reuse PR #577's recorder/Help Studio process. Fresh Production contextual playback and the approved replacement/addendum publication remain release gates. No paid narration, recording upload or Help content mutation occurred. Repository `AGENTS.md` requires that an UPDATE REQUIRED task not be reported complete until its replacement is published and verified; overall completion is not claimed.

## Factual wording after release

“Guided setup helps you try a sample estimate or prepare your own Draft and review a customer preview. Optional business setup can wait.”

Do not claim seamless onboarding is proven, advertise a completion-time guarantee, imply practice is a live customer record, promise autosave/cross-device guide progress, or describe this review branch as released.
