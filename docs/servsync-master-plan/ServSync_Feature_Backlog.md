# ServSync Feature Backlog

Last updated: 2026-08-01

Last reconciled against `origin/main` at `6e5226e869e64bfed3102acfa09779b846cbbb88` (merged PR #357).

## Purpose

This document is the active ServSync feature backlog. It contains unfinished product outcomes only.

Completed v1 milestones are archived in [ServSync Completed Features](ServSync_Completed_Features.md). Detailed implementation history, PR sequencing, validation notes, SQL rollout notes, and operational reports belong in [CHANGELOG.md](CHANGELOG.md), not repeated inside active backlog entries.

Use this backlog to preserve desired outcomes, current state, guardrails, and the next reviewable step. Do not treat an entry here as proof that a feature is live. Live status must be confirmed by source, deployed app behavior, SQL rollout state, gates, cohort status, or a completed release report.

## Current ServSync Beta Context

ServSync remains in controlled private beta. The current beta loop is:

Homeowner request -> contractor estimate -> homeowner approval -> job/report -> invoice -> Home History -> manual reminder.

Current repository evidence through PR #357 shows these relevant states:

- Local-customer profile editing, property management, single-property claim invitations, guarded manual Copy Link / QR preparation, token-free ordinary claim-invite reads, and final Production token containment are complete from PR #346 and PR #347.
- PR #348 merged the local-customer multi-property claim invitation source. The reviewed SQL was applied to Production with catalog/security validation, public Production smoke passed 7/7, and the full authenticated Tests A-H passed only in the dedicated Demo environment. FB-003A is archived; automated delivery remains excluded and request-free operational delivery remains FB-003B.
- PR #349 replaced the Codex workflow instructions and does not change product capability.
- PR #351 and PR #353 restored contractor invoice PDF access from Jobs -> Invoices and immediate post-save invoice detail actions. They do not add payment processing or provider delivery.
- PR #352 added the private Preview/Sandbox all-contractor Draft-first rollout mode source and Sandbox validation evidence; Production rollout still requires separate owner-approved gates.
- PR #354 added contractor-owned Saved Work Template selection inside the standard Draft-first composer. Inspection Checklists remain in their separate work-format path.
- PR #355 simplified the Draft Composer template area and moved Add work line beneath the final line item.
- Draft-first Work remains gated/cohort-bound. Hidden foundations, source wiring, Sandbox validation, or internal cohort evidence must not be described as general Production-live capability unless the relevant Production gates and cohorts are enabled and validated.
- Provider-neutral foundations for accounting, payments, communication, delivery, Demo Mode, Project Collaboration, and operations readiness are foundations only unless a later entry explicitly says the user-facing capability is live.

Important guardrails:

- Do not claim payment collection, Stripe checkout, ACH/card processing, billing enforcement, checkout, charging, or paid contractor subscriptions are live.
- Do not claim QuickBooks/accounting sync, OAuth accounting connection, or production export delivery is live.
- Do not claim push notifications, email/SMS reminders, provider delivery, or automated invitation delivery are live unless a later approved rollout says so.
- Do not claim Home Access invite email delivery is live; production delivery remains disabled unless later enabled by an approved gate.
- Do not claim automatic recurring reminders, native iOS/Android apps, full external calendar sync, broad public marketplace lead generation, paid rankings, advanced analytics, dispatch/routing, background checks, license verification, insurance verification, or formal compliance certification.

## Status Definitions

| Status | Meaning |
| --- | --- |
| Backlog | Desired outcome preserved, not actively being implemented. |
| Needs Audit | Clear enough for a focused audit before implementation. |
| Ready for Implementation | Audited or scoped enough for a later approval prompt. |
| Implementation In Progress | Active source or PR work is underway. |
| Preview Testing | Reviewable branch/preview exists and still needs validation. |
| Gated Rollout | Source and/or SQL exists but user-facing rollout depends on explicit gates, cohorts, SQL, deployment, or validation. |
| Later / Future | Valid future direction, not near-term. |
| Paused | Deliberately stopped or waiting on a dependency. |
| Rejected / Not Pursuing | Decided not to pursue unless reopened later. |

## Active Feature Inventory

| ID | Active unfinished outcome | Product area | Status | Priority | Current state / next step |
| --- | --- | --- | --- | --- | --- |
| FB-003B | Request-Free Operational Document Delivery Authorization | Local customers, estimates, invoices, operational delivery | Backlog | High | Keep separate from claim-link/QR delivery. Future work must define safe authorization for request-free operational document send paths without weakening token containment or homeowner-controlled claimed profiles. |
| FB-004 | Contractor Reporting Beyond Attention Queues | Contractor operations, reporting | Backlog | Medium | Follow-Up Lite is archived. Retain only reporting not already handled by dashboard workflow summaries or attention queues, such as filtered operational reports, exports, or owner/admin management views. |
| FB-005 | Awards / Contractor Recognition Badges | Contractor profiles, recognition, marketplace trust | Later / Future | Low | Preserve as future trust work after real platform activity and moderation/public-display rules exist. |
| FB-006 | Contractor-Controlled Online Booking | Scheduling, service requests, intake | Later / Future | High | Appointment confirmation v1 is archived. True online booking remains unfinished and should start with contractor-controlled availability/proposal rules, not homeowner-forced booking. |
| FB-007 | Trade Checklist Coverage and Draft-First Inspection Path | Estimates, inspections, checklists, Draft-first Work | Gated Rollout | High | Completed estimate recipe, Rooms, Assets, Home Map, and template-history work is archived in the changelog/completed archive. Remaining work is focused trade-checklist coverage plus the gated Draft-first inspection/checklist path, including SQL/runtime gates before any Production-visible workflow. |
| FB-008 | Discover Recently Active Filter | Discover, contractor visibility | Later / Future | Low | Revisit after enough trustworthy contractor activity exists to rank or filter honestly. |
| FB-009 | Discover Feed Strategy | Discover, marketplace content | Backlog | Medium | Future audit should define feed purpose, source data, moderation, ranking rules, and no-paid-ranking guardrails. |
| FB-010 | Workflow-Scoped Communication | Messaging, Activity, notifications | Backlog | High | Job/request-scoped communication and Activity foundations exist, but broader unread strategy, request-message migration, estimate/invoice communication, attachments, delivery logs, and delivery activation remain unfinished. Broader homeowner-started communication stays a future subtrack. |
| FB-011A | Backlog-Aware Partial Invoicing | Jobs, work items, invoices | Gated Rollout | High | Historical ID retained. Durable work-item and partial-invoicing foundations exist, but broader legacy backfill, inspection-finding conversion, homeowner-facing job summaries, final closeout rules, and additional runtime rollout remain unfinished. |
| FB-012 | Push Notifications | Notifications, mobile, workflow events | Later / Future | Medium | Not live. Revisit after notification policy, permissions, delivery logs, provider choice, and opt-in/out behavior are approved. |
| FB-013 | Accounting Export and QuickBooks Readiness | Accounting, invoices, integrations | Backlog | Medium | Consolidates FB-013 and FB-028. Provider-neutral integration foundations do not mean CSV export, QuickBooks OAuth, accounting sync, payment export, or provider delivery is live. Start with export-ready records and explicit owner-approved provider boundaries. |
| FB-014 | Online Payment Collection | Payments, invoices, estimates | Backlog | High | Consolidates FB-014 and FB-023. Payment schedules, invoice generation, and manual payment status are not payment processing. Stripe/card/ACH, receipts, reminders, disputes, refunds, and provider reconciliation require separate approval. |
| FB-015 | Native Mobile Apps | iOS/Android, field workflow | Later / Future | Medium | Responsive web and PWA metadata are not native apps. Decide Capacitor vs React Native/Expo only after mobile web QA, auth redirects, file/photo behavior, and deep links are audited. |
| FB-016 | Public-Launch Operational Readiness, Records, PDF, Storage, Restore, Retention, Recovery | Security, records, storage, restore, operations, scale | Backlog | High | Consolidates FB-016 and remaining FB-020 work. Controlled-beta baseline is archived; remaining work includes full data/auth restore, storage restore, backup/PITR verification, retention/export/deletion policy, public smoke/monitoring strategy, scale readiness, security follow-ups, and recovery drills. |
| FB-017 | Pricing Levels / Feature Tier Direction | Pricing, packaging, plan strategy | Backlog | High | Entitlement readiness exists, but billing enforcement, checkout, paid subscription activation, plan limits, and packaging decisions remain future product and rollout work. |
| FB-024 | Price Book / Reusable Estimate Content Maturity | Estimates, saved charges, trade libraries, Draft-first reusable work | Backlog | High | Estimate defaults/templates v1 is archived. Existing contractor-owned saved estimate templates now feed the standard Draft-first composer as reusable work content; Inspection Checklists remain separate. Remaining maturity includes reusable assemblies, default quantity/tax/category behavior, margin reminders, invoice quick-pick decisions, dedupe/overwrite policy, XLSX/PDF/import cleanup, and broader trade-library decisions. |
| FB-026 | Review Moderation and Public Display | Reviews, referrals, Discover trust | Backlog | High | Contractor referral v1 is archived. Remaining work is approved-only public ServSync review/rating display, moderation policy, snippets/kudos visibility, external-review handoff, and no-fake-rating/no-paid-ranking boundaries. |
| FB-029 | Recurring Service Automation | Service agreements, reminders, renewals, recurring billing | Later / Future | Medium | Service Agreements foundation v1 is archived. Retain recurring automation only as future selected visits, renewals, reminders, or recurring billing after explicit workflow/payment/notification approvals. |
| FB-030 | Home Access Invite Email Enablement and Shared-Record Expansion | Shared homes, Home Access, permissions | Backlog | High | Shared Home/Home Access foundation v1 is archived. Remaining work is guarded invite-email enablement and one-surface-at-a-time expansion of shared records such as requests, estimates, invoices, jobs, documents, reminders, notifications, and storage. |
| FB-033 | Project Collaboration Rollout | Projects, multi-contractor coordination | Gated Rollout | Later / Future | PR #273 merged the hidden Slice 1 foundation. Project Collaboration is not live: no ordinary-user UI, Project Board, assignments, invitations, project billing, production allowlist activation, or broad financial sharing is enabled. Next work requires rollout and surface-specific authorization. |
| FB-034A | Demo Mode Extended Scenario Coverage | Demo data, marketing capture, QA support | Later / Future | Medium | The request-to-job capture milestone is archived. Future demo work may cover invoices, Home History, report finalization, reminders, media, role switching, or browser controls only in approved demo environments. |
| FB-035 | Draft-First Work Rollout | Contractor Work, Drafts, estimates, jobs, invoices | Gated Rollout | High | Keep active. Source and SQL foundations exist in stages, but Production gates/cohorts and full rollout remain controlled. See the rollout matrix below. |
| FB-036 | Claim-Link Expected-Error Presentation Polish | Local-customer claim invitations, error UX | Backlog | Low | P3 polish only. Keep the clear handled unavailable-invite message, but suppress raw RPC/JSON detail from the user-facing page for expected stale, invalid, expired, or already-used claim links. Preserve useful internal/runtime diagnostics and do not change replay protection, lookup rejection, token containment, or acceptance behavior. |

## FB-035 Rollout Status Matrix

| Dimension | Current status | Remaining blockers / next gate |
| --- | --- | --- |
| Source status | Multiple Draft-first Work foundations and follow-up fixes are merged through current `origin/main`; direct Draft-to-Invoice app wiring and entitlement-hardening source are included on main. This branch adds a private Preview/Sandbox all-contractor rollout-mode SQL source without changing app action authority. | Verify the currently deployed Production source and gate behavior before any Production expansion. |
| SQL application status | Durable Draft foundations and selected follow-up SQL have been reviewed/applied in prior controlled gates where noted in the changelog. The Preview/Sandbox rollout-mode SQL defaults to `cohort`; in approved Sandbox validation it was applied to `zpzdkoaubyjtsomccxya` and explicitly set to `all_contractors`. | Do not assume a source file is live SQL. Re-prove installed functions, grants, RLS, runtime setting, and hashes before any Production rollout. |
| Gate state | Draft-first Work remains controlled by explicit global gates plus a server-side entitlement decision. Preview can expose all valid contractor contexts only when the private DB rollout mode is `all_contractors` and the three Vercel Preview gates are true. | No Production gate expansion without separate owner approval, deployment/source verification, and rollback plan. |
| Cohort state | Internal/cohort-bound validation has occurred for selected paths; broad contractor Production beta is not enabled by this backlog entry. Preview/Sandbox all-contractor rendering was validated on PR #352 and PR #351 previews against Sandbox data after the private mode was set to `all_contractors`. | Owner must approve any Production cohort enablement or expansion. |
| Validated outputs | Draft-to-Estimate, Draft-to-Job, inspection checklist, and Draft-to-Invoice paths have source/Sandbox/internal evidence recorded in the changelog. This branch validated read-only Preview rendering of Saved Drafts, Start New Draft, and shared Draft composer open/back-out behavior without saving or launching. | Runtime evidence remains bounded. Do not claim universal concurrency, saved-output validation, or real-user rollout completion. |
| Remaining blockers | Production rollout planning, Production SQL/setting decision, Production gate decision, role-matrix follow-up with a non-cohort contractor fixture, telemetry, Production smoke, mobile review, and owner release decisions. | Complete controlled gates before describing Draft-first Work as live. |

## Consolidation And Retirement Crosswalk

| Prior ID | Current disposition | Where unfinished work lives |
| --- | --- | --- |
| FB-001 | Archived: Invite a Contractor to ServSync v1. | Future outreach or claim-flow work should use a new focused entry or FB-003/FB-026 only when the scope matches. |
| FB-002 | Archived: Contractor Estimate Defaults & Templates v1. | FB-024 Price Book / Reusable Estimate Content Maturity. |
| FB-003 | Split. Core connection and multi-property permission milestone archived. | FB-003A local-customer multi-property claim is archived; FB-003B retains request-free operational document delivery authorization. |
| FB-003A | Archived: Local-Customer Multi-Property Claim. | FB-003B retains request-free operational document delivery; replay error-presentation polish is FB-036. |
| FB-004 | Retained but narrowed. | FB-004 contractor reporting beyond existing attention queues. |
| FB-005 | Retained. | FB-005 awards/badges. |
| FB-006 | Retained and consolidated with FB-021/FB-022 booking follow-ups. | FB-006 contractor-controlled online booking. |
| FB-007 | Retained but narrowed. Completed recipe/Home Map/Rooms/Assets/template history moved out. | FB-007 trade checklist coverage and Draft-first inspection path. |
| FB-008 | Retained. | FB-008 Discover recently active filter. |
| FB-009 | Retained. | FB-009 Discover feed strategy. |
| FB-010 | Consolidated with FB-025. | FB-010 workflow-scoped communication; broader homeowner-started communication is a future subtrack. |
| FB-011 | Archived: mobile workflow polish controlled-beta baseline. | Native apps remain FB-015; future mobile QA should be a new focused item if needed. |
| FB-011A | Retained historical ID. | FB-011A backlog-aware partial invoicing. |
| FB-012 | Retained. | FB-012 push notifications. |
| FB-013 | Consolidated with FB-028. | FB-013 accounting export and QuickBooks readiness. |
| FB-014 | Consolidated with FB-023. | FB-014 online payment collection. |
| FB-015 | Retained. | FB-015 native mobile apps. |
| FB-016 | Consolidated with remaining FB-020 operational work. | FB-016 public-launch operational readiness, records, PDF, storage, restore, retention, recovery. |
| FB-017 | Retained. | FB-017 pricing levels / feature tier direction. |
| FB-018 | Archived: Estimate Helper v1. | Any future helper work should be scoped under FB-024 or a new focused entry. |
| FB-019 | Archived: Estimate Labor Model v1. | Future labor-model polish should be a regression/follow-up item, not the v1 milestone. |
| FB-020 | Split. Controlled-beta operational baseline archived. | FB-016 for public-launch operational readiness. |
| FB-021 | Archived: Appointment Confirmation foundation v1. | FB-006 true contractor-controlled online booking. |
| FB-022 | Consolidated. | FB-006 contractor-controlled online booking. |
| FB-023 | Consolidated. | FB-014 online payment collection. |
| FB-024 | Retained. | FB-024 price book / reusable estimate content maturity. |
| FB-025 | Consolidated. | FB-010 workflow-scoped communication. |
| FB-026 | Split. Contractor referral v1 archived. | FB-026 review moderation and public display. |
| FB-027 | Archived: Contractor Pipeline / Follow-Up Lite. | FB-004 contractor reporting beyond attention queues. |
| FB-028 | Consolidated. | FB-013 accounting export and QuickBooks readiness. |
| FB-029 | Retained and narrowed. | FB-029 recurring service automation. |
| FB-030 | Split. Shared Home/Home Access foundation v1 archived. | FB-030 invite-email enablement and shared-record expansion. |
| FB-031 | Archived: Contractor Beta Billing/Entitlement Readiness v1. | FB-017 for pricing/packaging; implementation-specific entitlement follow-ups should be new scoped work. |
| FB-032 | Archived: Service Agreements foundation v1. | FB-029 recurring service automation. |
| FB-033 | Retained. | FB-033 Project Collaboration rollout. |
| FB-034 | Archived: Demo Mode request-to-job capture milestone. | FB-034A demo extended scenario coverage if later prioritized. |
| FB-035 | Retained. | FB-035 Draft-first Work rollout. |
| FB-036 | New focused follow-up. | FB-036 claim-link expected-error presentation polish. |

## Current Work Snapshot

This section is factual repo state, not a product-priority decision.

| Work | Current evidence | Backlog relationship |
| --- | --- | --- |
| PR #348 Add multi-property local customer claim flow | Merged through `origin/main` at `a20cee5ef184709ca462f6546f54a61e655aa058`. Reviewed Production SQL/catalog security and public smoke confirmation remain distinct from the authenticated Demo Tests A-H pass recorded in [FB-003A Authenticated Demo Validation](../demo/validation/FB-003A_Authenticated_Demo_Validation.md). | FB-003A archived; nonblocking replay error presentation is FB-036. |
| PR #73 marketing demo screenshot tooling | Open draft and conflicting against current main. | Potentially useful marketing/demo support; do not close without owner approval. |
| PR #183 shared-home boundary tests | Open draft and mergeable. | Partially superseded by later FB-030 closeout evidence, but may contain reusable test coverage. |
| PR #187 Discover trust-layer backlog additions | Open draft and mergeable. | Still potentially valid planning input for FB-005/FB-008/FB-009/FB-026. |
| PR #256 multiple invoices frontend MVP | Open draft and conflicting. | Partially superseded by later invoice schedule/partial-invoicing foundations, but may contain useful frontend direction for FB-014/FB-011A. |

## Update Rules

- Add only unfinished product outcomes to this active backlog.
- Move completed v1 milestones to [ServSync Completed Features](ServSync_Completed_Features.md).
- Keep detailed PR history, long implementation diaries, validation transcripts, SQL rollout notes, and release gate reports in [CHANGELOG.md](CHANGELOG.md).
- Use precise rollout terms: source merged, SQL applied in Sandbox, SQL applied in Production, gate enabled, cohort enabled, validated in Preview, live in Production, or completed milestone.
- Do not use "completed", "live", "enabled", or equivalent terms when only source, hidden foundation, disabled gate, Sandbox-only SQL, or planning exists.
- Preserve retired and consolidated IDs in the crosswalk. Do not reuse a retired ID for an unrelated feature.
- Update the backlog when feature status, completed scope, current next step, guardrails, future follow-ups, public/private capability boundaries, or backlog priority changes.
