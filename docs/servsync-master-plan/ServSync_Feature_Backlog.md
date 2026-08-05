# ServSync Feature Backlog

Last updated: 2026-08-05

Last reconciled against `origin/main` at `753a0d25db3c282a0dd86d3001aa1ae4217e6d48` (merged PR #375).

## Purpose

This document is the active ServSync feature backlog. It contains unfinished product outcomes only.

Completed v1 milestones are archived in [ServSync Completed Features](ServSync_Completed_Features.md). Detailed implementation history, PR sequencing, validation notes, SQL rollout notes, and operational reports belong in [CHANGELOG.md](CHANGELOG.md), not repeated inside active backlog entries.

Use this backlog to preserve desired outcomes, current state, guardrails, and the next reviewable step. Do not treat an entry here as proof that a feature is live. Live status must be confirmed by source, deployed app behavior, SQL rollout state, gates, cohort status, or a completed release report.

## Current ServSync Beta Context

ServSync remains in controlled private beta. The current beta loop is:

Homeowner request -> contractor estimate -> homeowner approval -> job/report -> invoice -> Home History -> manual reminder.

Current repository evidence through PR #372 shows these relevant states:

- Local-customer profile editing, property management, single-property claim invitations, guarded manual Copy Link / QR preparation, token-free ordinary claim-invite reads, and final Production token containment are complete from PR #346 and PR #347.
- PR #348 merged the local-customer multi-property claim invitation source. The reviewed SQL was applied to Production with catalog/security validation, public Production smoke passed 7/7, and the full authenticated Tests A-H passed only in the dedicated Demo environment. FB-003A is archived; automated delivery remains excluded and request-free operational delivery remains FB-003B.
- PR #349 replaced the Codex workflow instructions and does not change product capability.
- PR #351 and PR #353 restored contractor invoice PDF access from Jobs -> Invoices and immediate post-save invoice detail actions. They do not add payment processing or provider delivery.
- PR #352 added the reviewed private all-contractor Draft-first rollout mode source. On 2026-08-02, the owner-approved Production rollout independently verified the installed foundation and enabled that mode without bulk-changing contractor billing rows.
- PR #354 added contractor-owned Saved Work Template selection inside the standard Draft-first composer. Inspection Checklists remain in their separate work-format path.
- PR #355 simplified the Draft Composer template area and moved Add work line beneath the final line item.
- PR #359 restored Service Plans discoverability in the gated Draft-first contractor experience without changing plan authority, automation, or rollout state.
- PR #360 merged the first gated Jobs landing redesign with one At a Glance navigation system, bounded Needs Attention, dedicated Drafts, and role-safe Actions & Tools while preserving existing rollout gates and backend authority.
- PR #361 merged Price Book management cleanup: search-first organization, active/archived views, existing-field filters, compact client-side pages, progressive item forms, explicit load states, secondary CSV tools, and owner/admin/office management alignment.
- PR #362 merged the Draft-first Price Book Picker v1 for standard Estimate-intent Drafts. It copies active Price Book items into editable Draft lines as bounded snapshots without autosave, launch, Price Book mutation, private metadata, IDs, or live linkage.
- PR #365 merged Price Book Organization Foundation v1; its additive migration was applied and verified in Sandbox and Production.
- PR #366 merged Price Book Repeat-Import Reconciliation v1; migration SHA-256 `7dac1b3c7fd62240d9d05e498a3db0af39fe93549c375ca8262f941cbb6d14a3` was applied and verified in Sandbox and Production. Guarded rollback mutation remains a separate future slice.
- PR #367 merged Draft-first Inspection Path Completion v1. Its reviewed migration (SHA-256 `f4ab79b68ebe56edd36f6c545fac08584558f6da520672e2bee74b3508f93473`) was applied and catalog-verified in Production, and automatic deployment `dpl_EVyf2uB49Uq53ufzw6ZwG9n7z8Vd` reached `READY` from merge commit `052d13ca061653f0bfa6bad4353d2f47eb95c205`. Bounded Production validation passed for public health, contractor-owner Jobs access, homeowner Documents access, desktop/mobile layout, selected denials, runtime health, and data/security preservation. Exact-head Sandbox evidence remains authoritative for mutating inspection/checklist, media/PDF, broader role, cross-tenant, and cleanup paths not exercised in Production.
- PR #369 merged Request-Free Local Invoice Delivery Slice 1 through commit `bb471e2d62cd70abcdd66cb57582e660e97af1cd`. Its three reviewed migrations, server-only Production Supabase configuration, same-origin gateway, and IP-keyed 100-request/60-second Firewall rule are installed in Production. Deployment `dpl_7JKiCdPfCN8XKdMBVUyxKFv5AvKU` reached `READY`, `https://servsync.app` returned HTTP 200, and controlled Production validation passed 9/9 plus the bounded issuance, denial, recipient-session, concurrency, rotation/revocation, request/response-limit, throttling, and cleanup checks recorded in the changelog.
- PR #371 merged the contractor Customer terminology/status foundation through commit `6221bd9935b490a797b526881551faf48a1a7623`: contractor navigation and the combined workspace use one `Customer` category, while connection remains visible status and canonical connected/local subject models remain unchanged.
- PR #372 merged Unified Draft Customer Selection and Customer Profile Entry v1 through normal two-parent commit `854372c8609a67d7de16dac33550762d9d750d74`. Automatic Production deployment `dpl_3jkDZ6MKxyLZd9qCxCxi7YQGEqTY` reached `READY` from that exact commit. Draft creation now uses one Customer selector, derives the existing connected/local subject internally, preserves saved historical subject types and authorized property context, auto-selects only one eligible property, leaves multiple-property selection explicit, and routes eligible connected/not-connected customer-profile initial work through neutral `Create Draft` with no preselected output. Exact-head authenticated Sandbox Preview evidence covers connected/local profiles, property variants, saved Drafts, Viewer denial, desktop/mobile, accessibility, and runtime health. Bounded Production smoke confirmed the merged generic composer and mobile layout without mutation; its approved account had zero customers, so profile/property/Viewer scenarios were not repeated there.
- Draft-first Work is now the standard Production Jobs experience for authorized contractor contexts. Production serves main SHA `854372c8609a67d7de16dac33550762d9d750d74`, all three global gates remain enabled, and the server rollout mode remains `all_contractors`; the original all-contractors public smoke passed 7/7, and subsequent bounded authenticated Production checks confirmed the Draft-first Jobs landing and unified Customer composer on desktop and mobile. This does not broaden output-specific permissions or prove mutating Production save/launch paths for every role.
- Provider-neutral foundations for accounting, payments, communication, delivery, Demo Mode, Project Collaboration, and operations readiness are foundations only unless a later entry explicitly says the user-facing capability is live.

Important guardrails:

- Do not claim payment collection, Stripe checkout, ACH/card processing, billing enforcement, checkout, charging, or paid contractor subscriptions are live.
- Do not claim QuickBooks/accounting sync, OAuth accounting connection, or production export delivery is live.
- Do not claim push notifications, email/SMS reminders, provider delivery, or automated invitation delivery are live unless a later approved rollout says so.
- Do not claim Home Access invite email delivery is live; production delivery remains disabled unless later enabled by an approved gate.
- Do not claim full customer-management role parity. Customer Management Edit Boundary Correction v1 is merged and active in Production from PR #374 through normal merge commit `015e731b52c64168ceba5caa04669b2bc5fb798d`. Exact migration `servsync-customer-management-edit-boundary.sql` (SHA-256 `b86b3af7524d3d0122f97e21609569dfa316b7f87d2d2df213c5e73478d66427`) was applied transactionally to Production project `uqgtheclhxqlnjpfmheq` on `2026-08-05`, and automatic deployment `dpl_8m9W44zhmoCY636uWitHJcApaZCC` reached Production `READY` from the merge commit. Sandbox authenticated validation established owner/admin/office profile and local-property mutation authority plus field tech, viewer, inactive, removed, cross-tenant, and anonymous denial; Production validation confirmed exact deployed-function correspondence, ownership, fixed search path, grants, PUBLIC/anon denial, preservation, 2/2 bounded authenticated read-only smoke, and healthy aliases without customer/property mutation. Customer-management authority is separate from general Job-write authority, and existing Draft, Job, output, claim, invitation, connected-homeowner, tenant, and mapping boundaries remain intact. Contractor Local Customer Read/List Parity v1 is implemented on draft PR #376: role-shaped summary and management-detail RPCs replace the direct browser list query, owner/admin/office receive eligible management context, field tech receives redacted context for existing Draft/Job authority, and Viewer is limited to exact local subjects linked to work already readable by that role. The exact additive migration (SHA-256 `0b90e4548ceec24e7bdd96a12ad9951f74b7ffc064f222a2f41b0e2ce109f41f`) is installed and validated only in Sandbox `zpzdkoaubyjtsomccxya`; authenticated role/security, cross-tenant, claimed-record, Viewer exact-property, loading/retry, cleanup, and exact-head desktop/mobile Preview validation passed. PR #376 remains draft and unmerged, Sandbox is temporarily ahead of main, and merge plus controlled Production rollout remain pending. Admin/Office creation parity, archive/restore lifecycle, direct-table privilege cleanup, broader customer-model maturity, Demo SQL disposition, the inherited non-owner appointment-window 401, and inherited ESLint 9 startup incompatibility remain separate. Demo and Production do not have the PR #376 migration, and read/list parity is not claimed there.
- Any unified Draft customer selector must preserve canonical subject mapping, same-type saved-Draft fallback, stale-selection protection, authorized property scope, save/resume behavior, Draft gates, and the existing role matrix without merging customer records.
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
| FB-003B | Request-Free Operational Document Delivery Authorization | Local customers, estimates, invoices, operational delivery | Implementation In Progress | High | Request-Free Local Invoice Delivery Slice 1 is operational in Production from merged PR #369 at commit `bb471e2d62cd70abcdd66cb57582e660e97af1cd`. Authorized owner/admin/office users can issue an eligible invoice for an unclaimed contractor-created local customer/property and create, rotate, or revoke an expiring Copy Link. The recipient flow uses a same-origin gateway, server-only credentials, an IP-keyed 100-request/60-second Firewall rule, private atomic database limits, direct browser-RPC revocation, exact line/response bounds, immediate bearer clearing, and a digest-only fixed 30-minute protected session. Controlled Production validation passed 9/9 and verified the bounded issuance, denial, desktop/mobile, cookie, concurrency, rotation/revocation, malformed-request, throttling, fail-closed configuration, oversized-response, and cleanup paths. FB-003B remains active: anonymous invoice PDFs, immutable/versioned estimate delivery, finalized-report delivery, claimed-account transition, email/SMS, reminders, approval/payment/reply actions, and broader delivery maturity remain future work. |
| FB-004 | Contractor Reporting Beyond Attention Queues | Contractor operations, reporting | Backlog | Medium | Follow-Up Lite is archived. Retain only reporting not already handled by dashboard workflow summaries or attention queues, such as filtered operational reports, exports, or owner/admin management views. |
| FB-005 | Awards / Contractor Recognition Badges | Contractor profiles, recognition, marketplace trust | Later / Future | Low | Preserve as future trust work after real platform activity and moderation/public-display rules exist. |
| FB-006 | Contractor-Controlled Online Booking | Scheduling, service requests, intake | Later / Future | High | Appointment confirmation v1 is archived. True online booking remains unfinished and should start with contractor-controlled availability/proposal rules, not homeowner-forced booking. |
| FB-007 | Trade Checklist Coverage and Draft-First Inspection Path | Estimates, inspections, checklists, Draft-first Work | Implementation In Progress | High | Draft-first Inspection Path Completion v1 is merged and deployed to Production. The bounded slice routes contextual connected/local customer starts through the shared Draft composer, binds home-specific checklist choices to the exact selected property, records `Not Applicable` as a neutral finding, corrects report lifecycle copy, and applies the reviewed role/security hardening. Production validation was intentionally non-mutating and limited to public health, contractor-owner Jobs access, homeowner Documents access, desktop/mobile layout, selected denials, runtime health, and data/security preservation; exact-head Sandbox evidence covers the mutating lifecycle, media/PDF, broader role, tenant-isolation, and cleanup checks. FB-007 remains active for broader trade-specific checklist maturity, finding-to-follow-up-work conversion, reopening/correction rules, and other deferred inspection/checklist work. |
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
| FB-024 | Price Book / Reusable Estimate Content Maturity | Estimates, saved charges, trade libraries, Draft-first reusable work | Implementation In Progress | High | The contractor-owned Price Book foundation, PR #361 management cleanup, PR #362 Draft-first Price Book Picker v1, PR #365 Price Book Organization Foundation v1, and PR #366 Price Book Repeat-Import Reconciliation v1 are complete. Both additive Price Book migrations were applied through controlled Sandbox and Production rollouts. Repeat imports use stable tenant-owned sources, deterministic matching, explicit Add/Update/Skip review, three-way manual-edit preservation, private mappings, idempotent transactional execution, and sanitized immutable audit. Standard Estimate-intent Drafts continue to append safe editable snapshots without private organization/import metadata, IDs, or live linkage. Guarded batch rollback is the next focused slice. XLSX, cost/margin, Saved Charges, assemblies, favorites/usage, export, quantity staging, invoice selection, provider-specific parsers/APIs, scheduled sync, and broader maturity remain future work. |
| FB-026 | Review Moderation and Public Display | Reviews, referrals, Discover trust | Backlog | High | Contractor referral v1 is archived. Remaining work is approved-only public ServSync review/rating display, moderation policy, snippets/kudos visibility, external-review handoff, and no-fake-rating/no-paid-ranking boundaries. |
| FB-029 | Recurring Service Automation | Service Plans, reminders, renewals, recurring billing | Later / Future | Medium | Service Plans foundation v1 is archived. Retain recurring automation only as future selected visits, renewals, reminders, or recurring billing after explicit workflow/payment/notification approvals. |
| FB-030 | Home Access Invite Email Enablement and Shared-Record Expansion | Shared homes, Home Access, permissions | Backlog | High | Shared Home/Home Access foundation v1 is archived. Remaining work is guarded invite-email enablement and one-surface-at-a-time expansion of shared records such as requests, estimates, invoices, jobs, documents, reminders, notifications, and storage. |
| FB-033 | Project Collaboration Rollout | Projects, multi-contractor coordination | Gated Rollout | Later / Future | PR #273 merged the hidden Slice 1 foundation. Project Collaboration is not live: no ordinary-user UI, Project Board, assignments, invitations, project billing, production allowlist activation, or broad financial sharing is enabled. Next work requires rollout and surface-specific authorization. |
| FB-034A | Demo Mode Extended Scenario Coverage | Demo data, marketing capture, QA support | Later / Future | Medium | The request-to-job capture milestone is archived. Future demo work may cover invoices, Home History, report finalization, reminders, media, role switching, or browser controls only in approved demo environments. |
| FB-035 | Draft-First Work Rollout | Contractor Jobs, Drafts, estimates, jobs, invoices | Implementation In Progress | High | Keep active. The redesigned Jobs landing and Draft-first workspace are now the standard Production experience for authorized contractors under the reviewed `all_contractors` server mode and three enabled global gates. Existing save/launch RPCs, tenant checks, output-specific role authority, and fail-closed fallback remain authoritative. Mutating Production workflow smoke, optional role-account coverage, telemetry, and later Draft-first maturity remain follow-ups. See the rollout matrix below. |
| FB-036 | Claim-Link Expected-Error Presentation Polish | Local-customer claim invitations, error UX | Backlog | Low | P3 polish only. Keep the clear handled unavailable-invite message, but suppress raw RPC/JSON detail from the user-facing page for expected stale, invalid, expired, or already-used claim links. Preserve useful internal/runtime diagnostics and do not change replay protection, lookup rejection, token containment, or acceptance behavior. |

## FB-035 Rollout Status Matrix

| Dimension | Current status | Remaining blockers / next gate |
| --- | --- | --- |
| Source status | Draft-first Work foundations, Estimate/Job/Invoice and inspection-checklist paths, entitlement hardening, Service Plans discoverability, the Jobs landing redesign, and PR #362 Draft-first Price Book Picker v1 are merged through main SHA `b23e18708601c515ff218823caf8825d5d72fd00`. The visible `Jobs` landing uses At a Glance, Actions & Tools, dedicated Drafts, and bounded Needs Attention while existing RPCs, record destinations, role checks, and legacy fallback remain authoritative. | Keep future workflow expansion and permission changes separately scoped. |
| SQL application status | The controlled Production audit verified the required durable Draft, item, launch, checklist, invoice, cohort-entitlement, runtime-setting, and rollout-mode foundations already installed with reviewed RLS, grants, signatures, and tenant boundaries. No SQL file was applied during the 2026-08-02 activation. | Re-audit catalog state before any later schema or permission change; do not infer installed state from repository files alone. |
| Gate state | Production's three Draft/Work Vercel gates are present and compiled as `true`. The active READY deployment is `dpl_4XotZUAJFBqmEqqVtiz1EyLNyyQi` at main SHA `b23e18708601c515ff218823caf8825d5d72fd00`. | Preserve the global gates as the emergency UI kill switch and keep rollback procedures current. |
| Cohort state | Production server mode is `all_contractors`. All seven existing contractor profiles resolved entitled at activation while the seven existing cohort billing rows remained unchanged; future authorized contractor contexts no longer require individual cohort enrollment for Draft-first visibility. | Output-specific role and tenant authorization still applies; `all_contractors` is exposure mode, not universal mutation authority. |
| Validated outputs | Source/Sandbox/Preview evidence covers Draft persistence and Estimate, Job, inspection-checklist, and Invoice launch paths. Production public smoke passed 7/7 before and after activation. Dedicated homeowner read-only smoke passed, and contractor owner read-only validation confirmed the Draft-first Jobs landing on desktop 1280x720 and mobile 390x844 with zero console errors and failed requests. Service Plans remain separate from Draft outcomes. | Mutating Production save/reopen/launch smoke was not performed. Do not claim universal role coverage, mutation coverage, or provider delivery. |
| Remaining blockers | Standard Production exposure is complete. Remaining FB-035 work includes optional field-tech/viewer Production smoke accounts, controlled mutating workflow smoke if separately approved, privacy-safe telemetry, longer-running operational evidence, and later Draft-first product maturity. | Keep FB-035 active until those deliberately separate readiness and maturity outcomes are resolved or retired. |

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
| FB-032 | Archived: Service Plans foundation v1 (internal `service_agreement` identifiers retained). | FB-029 recurring service automation. |
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
