# ServSync Feature Backlog

Last updated: 2026-07-15

Last reconciled through PR #198 / merge commit `1f721ae10fb92de9a76b9f30bf2eeeeab83330bc`.

## Purpose

This document is the living ServSync feature backlog and brainstorming inventory.

Use it to keep product direction consistent across ChatGPT brainstorming chats, Codex implementation chats, and future planning work. It tracks discussed feature ideas, current status, priority, guardrails, implementation state, and recommended next action.

This document does not replace:

- `docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md`
- `docs/servsync-master-plan/CHANGELOG.md`
- PR descriptions
- Codex implementation reports

## How this document should be used

Use this document when:

- A feature idea is discussed and should not be lost.
- A feature moves from brainstorming into audit.
- A Codex audit is completed.
- A feature is approved for implementation.
- A feature enters preview testing.
- A feature is completed and confirmed functional.
- A feature is paused, rejected, or deferred.

The changelog records approved repo/app changes. This backlog records discussed product direction and implementation state.

Do not treat a feature as live just because it appears in this backlog. Live status must be confirmed by code, deployed app behavior, or a completed implementation report.

## Current ServSync beta context

ServSync is in controlled private beta, not public go-live.

Core beta loop:

Homeowner request
→ Contractor estimate
→ Homeowner approval
→ Job/report
→ Invoice
→ Home History
→ Manual reminder

Homeowner invoice closeout now makes the final handoff clearer: once an eligible invoice is durably filed to Home History, the invoice card shows a `View Home History` next action and compact copy explaining that the homeowner can add a manual follow-up reminder there. Contractor accepted-estimate closeout now routes dashboard `need jobs` CTAs directly into Jobs -> Estimates with the Approved filter and stale filters cleared, and accepted estimate cards distinguish `Ready for job` from `Job created` while keeping Create/View Job primary over direct estimate invoice actions. Contractor completed-job closeout now also shows compact recommended-path copy: work-item jobs point contractors toward completed, priced work-item invoicing while legacy/no-work-item jobs point toward one completed-job invoice. These remain display/navigation polish only; they do not add automatic reminders, recurring reminders, payment collection, notifications, invoice eligibility changes, job eligibility changes, or duplicate filing behavior.

The automatic homeowner/contractor role-based onboarding tour has been removed because it duplicated the more actionable initial setup prompts and onboarding checklists. Future help should be searchable, task-specific, and optionally guided, with safe Demo Mode practice where appropriate, rather than an automatic post-setup tour.

Important guardrails:

- Do not claim payments/Stripe checkout are live.
- Do not claim billing enforcement, paywalls, checkout, charging, or paid contractor subscriptions are live.
- Do not claim QuickBooks/accounting sync is live.
- Do not claim push notifications are live unless confirmed.
- Do not claim email/text reminder automation is live.
- Do not claim Home Access invite email delivery is live in production; current production delivery remains disabled unless a later approved enablement says otherwise.
- Do not claim automatic/recurring reminders are live.
- Do not claim native iOS/Android apps are live.
- Do not claim full external calendar sync is live.
- Do not claim broad public marketplace lead generation is live.
- Do not claim paid Discover rankings or pay-to-play marketplace placement are live or planned.
- Do not claim advanced analytics/admin reporting is live.
- Do not claim enterprise dispatch/routing is live.
- Do not claim contractor verification/background checks are live.
- Do not claim formal compliance certifications are live.
- Do not claim guaranteed leads or rankings.

Current presentation-polish sequencing:

- Bundle 1 — Estimate Builder Efficiency Polish is implemented from an approved slice-order standpoint: Slice 1A Estimate Editing Basics, Slice 1B-1 Collapsible Estimate Sections, and Slice 1B-2 Estimate Item Reuse Polish are complete. Historical recent materials, current-draft searchable reuse, single template-item reuse, estimate room association, and stronger authenticated rendered desktop/mobile estimate-builder coverage remain separate follow-ups rather than unfinished Bundle 1 blockers.
- Bundle 2 — Status and Date Presentation Polish is split into Slice 2A Status Badge Foundation, Slice 2B Date Presentation Helpers, Slice 2C Invoice Payment Presentation, and Slice 2D Remaining Status Cleanup. Slice 2A adds the shared status-badge foundation and standardizes primary estimate, job, invoice, and request status badge presentation only. Slice 2B centralizes existing user-facing date/time formatting behind shared presentation helpers while preserving current output. Slice 2C adds reusable invoice payment summaries for Paid, Partially Paid, Overdue, and Void presentation on targeted contractor/homeowner invoice card and detail surfaces using existing invoice fields only. Slice 2D-1 migrates low-risk secondary display badges for service agreements, support, referrals/invites, review moderation, and display-only access/team invite statuses to shared `StatusBadge` presentation helpers. Slice 2D-2 centralizes appointment lifecycle, appointment-window lifecycle, contractor visit lifecycle, and visit homeowner-response presentation while preserving compact calendar month chips, dot-plus-text rows, standalone event-type labels, scheduling, filtering, ordering, actions, permissions, and visibility. Slice 2D-4A centralizes presentation for the five existing finding condition/status values — Pass, Monitor, Fixed On Site, Needs Repair, and Urgent — while preserving their mixed semantics, count formulas, report/app behavior, estimate/work-item logic, AI inference, homeowner/contractor visibility, and PDF output. Slice 2D-4B centralizes reminder lifecycle and due-state presentation for Open, Completed, Dismissed, Upcoming, Due Today, and Overdue states while preserving the existing owner due-state derivation, RPC-derived shared reminder overdue state, reminder actions, privacy, counts, scheduling, notifications, calendar behavior, date semantics, and backend boundaries. Online payment, payment history, payment methods/notes, PDF changes, project/work-item statuses, dashboard summary/attention indicators, billing/subscription statuses, lifecycle behavior, permissions, and business rules remain future or out of scope.
- Bundle 3 — Empty States & Draft Clarity is complete by owner decision. Slice 3A adds a shared reusable empty-state component with standard and compact variants, migrates primary homeowner and contractor true no-data surfaces, and keeps loading, error, search/filter no-results, permission messaging, draft notice migration, workflow actions, routing, SQL/RLS/RPCs, Supabase/Vercel settings, and infrastructure behavior unchanged. Slice 3B-1 adds a shared `DraftNotice` foundation, migrates contractor estimate and invoice composer draft/visibility notices, clarifies save-draft versus send labels, and corrects estimate schedule copy to reflect draft invoice creation without adding dirty-state tracking or changing lifecycle, visibility, notification, payment, PDF, SQL/RLS/RPC, Supabase, or Vercel behavior. Slice 3B-2 adds a focused `VisibilityNotice`, migrates service agreement sent/active states, report review/finalization/file/send helper notices, and contractor Home Map draft review-state presentation, and keeps templates, connected-property proposals, permanent Home Map behavior, report PDF generation, finalization/send handlers, lifecycle, visibility, notifications, payments, SQL/RLS/RPC, Supabase, and Vercel behavior unchanged. Slice 3B-3 templates/admin/support copy was retired after audit because further implementation was not justified, and Slice 3C search/filter/permission empty-state polish is deferred as optional future polish rather than a Bundle 3 blocker.
- Bundle 4 — Feedback Integration & UI Refinement has started. Slice 4A Action Feedback and Confirmation adds a shared presentation-only action-feedback shell and migrates representative high-traffic homeowner and contractor action-result messages while preserving business rules, lifecycle values, action eligibility, routing, notifications, payments, PDFs, SQL/RLS/RPC, Supabase, Vercel, production data, and backend behavior. Slice 4B-1 Search/Filter Recovery Foundation + Primary Workflow Surfaces adds a shared presentation-only filter summary and improves primary homeowner/contractor no-result recovery for Discover, homeowner Records, Home History reminder room filtering, contractor customers/contacts, contractor estimate/invoice records, contractor Jobs, and request-search terminology while preserving existing search/filter formulas, sort order, local persistence, query/RPC behavior, permissions, lifecycle, routing, payments, PDFs, notifications, SQL/RLS/RPC, Supabase, and Vercel behavior. Future Bundle 4 slices remain: 4B-2 Secondary Libraries and Admin Filter Polish only if still needed, 4C Mobile Action and Density Refinement, and 4D Accessibility and Focus Refinement. Navigation/context preservation remains deferred unless later evidence narrows the scope.

## Status definitions

| Status | Meaning |
| --- | --- |
| Brainstorming | Idea is being shaped and is not ready for audit. |
| Backlog | Direction is worth preserving but not active. |
| Needs Audit | Direction is clear enough for a Codex audit prompt. |
| Audit In Progress | Codex or manual review is currently auditing the item. |
| Ready for Implementation | Audit is complete and the user has approved or is preparing implementation scope. |
| Implementation In Progress | Codex or another implementation workflow is actively working on the approved task. |
| Preview Testing | Implementation exists in a preview/branch environment and needs testing. |
| Completed / Functional | Implemented and believed functional, though future polish may remain. |
| Paused | Deliberately stopped or waiting on a dependency. |
| Rejected / Not Pursuing | Decided not to pursue unless reopened later. |
| Later / Future | Useful future direction, but intentionally not near-term. |

## Priority definitions

| Priority | Meaning |
| --- | --- |
| High | Important for beta readiness, core workflow confidence, or contractor/homeowner adoption. |
| Medium | Useful and valuable, but not blocking the immediate beta loop. |
| Low | Nice-to-have, polish, or future convenience. |
| Later / Future | Should be preserved, but not built until stronger prerequisites exist. |

## Feature inventory

| ID | Feature / Topic | Product Area | Status | Priority | Current Next Step |
| --- | --- | --- | --- | --- | --- |
| FB-001 | Invite a Contractor to ServSync | Homeowner Contractors tab, service request support, contractor acquisition | Completed / Functional | Medium | Future outreach/claim-flow improvements later. |
| FB-002 | Contractor Estimate Defaults & Templates | Contractor tools, estimates, saved charges, templates, Custom Pricing | Beta Ready / Follow-up Backlog | High | Use in controlled beta with CSV preview regression coverage in place; invoice quick-pick, smart dedupe/overwrite, XLSX/PDF/AI import cleanup, and broader trade-library work remain future. |
| FB-003 | Contextual Connection Request Flow with Multi-Property Permission Access | Connections, permissions, property sharing | Controlled Beta Evidence Confirmed / Follow-up Backlog | High | Permission enforcement and contractor visibility audit passed for controlled beta use; future work must remain narrowly scoped around any new permission categories, broader shared-home work-record access, Home History sharing, notifications, media expansion, or visibility-broadening changes. |
| FB-004 | Contractor Reports | Reports, operations, contractor visibility | Backlog | Medium | Hold until estimate/job/invoice statuses are reliable. |
| FB-005 | Awards / Contractor Recognition Badges | Contractor profile, recognition, marketplace trust | Later / Future | Low | Revisit after real platform activity exists. |
| FB-006 | Contractor Auto-Scheduling | Scheduling, appointments, calendar | Later / Future | Medium | Refine after calendar/appointment workflow stabilizes. |
| FB-007 | Trade-Specific Estimate / Pre-Visit Checklists | Estimates, inspections, homeowner intake, templates | Started / Partial | High | Guided Estimate Draft Builder Slices A-E add a focused estimate start flow with saved-template, guided-builder, and blank-start choices; trade, work type, labor style, rough scope, top recipe-match preview, general fallback, collapsed reference tools, inline contractor-private customer creation, first-class contractor-owned saved-template starts, a Save as template modal with structure-only versus structure-and-pricing choices, and removal of visible standalone Advanced Trade Tools while preserving useful deck/plumbing/electrical guidance in the guided builder/helper path. The deck board material allowance helper now normalizes parsed deck dimensions into a true-size source object so material math and grid/reference labels share the same width, depth, area, and perimeter values for rough deck scopes such as `10x10`, while remaining editable, price-free, and contractor-review-required. The first pressure washing / exterior cleaning recipe family adds price-free service bundles for common residential and small-commercial cleaning scopes while keeping runoff, chemical, grease, and local-code-sensitive work contractor-reviewed. The Jobs/Templates taxonomy now presents `estimate_templates` as Saved Work Templates, `inspection_templates` as Inspection Checklists, and home-scoped inspection layouts as Home-specific Inspection Checklists without changing data models or behavior. Saved Work Templates now make Use for Estimate explicit, can create manual invoice drafts only from an already selected customer/context, and can start the existing manual job form from selected customer/context with template name/scope only. Invoice drafts remain unsent until the contractor uses existing invoice actions, and template-started jobs remain unsaved until the contractor uses existing job creation. The manual-job template-limits clarity slice makes name/scope-only behavior explicit, says line items/pricing are intentionally not copied to jobs, and points contractors to add job work items after creating the job. The Home Setup guide shell gives homeowners a lightweight checklist for existing property profile, room, asset, map, photo, document, reminder, and notes surfaces while keeping true Home Setup Templates and Key Home Locations future-scoped. Durable `home_rooms`, reminder-room links, document-room links, homeowner document room chips, Room Detail, `home_assets`, Home Map v1, and Assets & Systems v1 now provide homeowner-owned organization around rooms, room boxes, safe assets/systems, reminders, and documents; the Properties tab consolidates those surfaces into one Home Map & Systems experience so Rooms are the organizing backbone rather than a separate product concept. Owner/admin home managers can manage active rooms, simple not-to-scale map boxes, and safe asset/system basics; shared member/viewer roles can view non-sensitive room/map basics where surfaced; asset browsing stays manager-only; manager-only notes, private documents, and private reminder/document counts remain protected. No contractor Home Map/asset visibility, contractor map permissions/proposals, key locations, sensitive access fields, serial numbers, storage policy changes, floor-plan/CAD/LiDAR/3D behavior, migrations/backfills, report/job media tags, or inspection/job/estimate/invoice map links are included. Ceiling height remains future structured data requiring a separately approved SQL-backed slice if needed. Future work should keep global template-to-invoice without selected customer context, global direct-job Work Template starts, full line-item-to-job-work-item mapping, true Home Setup Templates, Key Home Locations, contractor Home Map/asset permissions, contractor map proposals, room-linked reminder editing/grouping, broader recipe-library expansion, and homeowner pre-visit checklist work separate. |
| FB-008 | Discover Engagement Filter / Recently Active Contractors | Discover, contractor visibility | Later / Future | Low | Revisit after Discover has real contractor activity. |
| FB-009 | Discover Feed Strategy | Discover, marketplace, contractor content | Backlog | Medium | Future audit after core beta workflow confidence improves. |
| FB-010 | General Homeowner-Contractor Messaging | Messaging, connections, service requests | Later / Future | Medium | Revisit after contextual connection flow is tested. |
| FB-011 | Mobile Workflow Polish | Mobile/responsive UX, field workflow | Started / Partial | High | First frontend-only polish pass improves mobile stacking, action hierarchy, spacing, and scanability across request cards, scheduling controls, estimate/Price Book areas, job/work-item cards, invoice cards, Activity timeline, Home Access cards, and entitlement labels. Closeout B fixes a narrow iPhone SE-width homeowner Properties / Home Access overflow and adds settled regression coverage. Mobile Readiness Slice 1 adds conservative PWA manifest/installability metadata and static coverage only. Mobile Readiness Slice 2A packages a frontend-only app-link helper that normalizes current hash-routed auth/invite/profile URL construction while preserving web behavior. Mobile PWA Real-Device QA Checklist adds docs-only installed-PWA/mobile-browser test coverage planning for auth, routes, workflows, file/photo/PDF behavior, and future Capacitor proof-of-concept questions. Mobile UI Foundation Slice 1A adds mobile-only role-based bottom navigation for homeowner and contractor users using existing tabs, state, drawer access, and dashboard data. Slice 1B aligns mobile nav labels with existing web terminology and adds viewport/safe-area/root overflow hardening for real-device mobile review feedback. Slice 1C unifies mobile/desktop nav badge sources where tabs match, removes mobile-only Dashboard badges, adds compact contractor Jobs overview mobile tiles, and adds a mobile-only sticky nested Jobs back control. Slice 1D prioritizes Open Jobs as the full-width top tile on the contractor mobile Jobs overview while keeping New Jobs and Completed / Closed Jobs compact below it and preserving desktop order. Slice 1E removes the inconsistent contractor mobile Jobs bottom-nav badge while preserving Jobs overview tile counts and existing desktop behavior. Slice 1F makes the contractor Jobs overview tile patterns consistent by giving Estimates / Invoices the same active-work priority layout and converting Templates & pricing into compact secondary-tool rows. Slice 1G strengthens the mobile-only nested Jobs subheader so contractors have a clearer Jobs overview escape path in long/search-heavy Jobs sections. Slice 1H makes that nested Jobs escape/orientation header fixed and more visually distinct on mobile so long sections such as Templates keep the Jobs overview control visible while scrolling. Slice 1I tunes that fixed header to be more compact and neutral while preserving the persistent mobile escape path. Slice 1J removes the fixed Jobs nested mobile header and spacer, relying instead on the persistent bottom-nav Jobs re-tap behavior plus retained top-of-card back controls to return contractors to Jobs overview. Slice 1K removes raw-count contractor drawer/sidebar badges for Jobs and Calendar while preserving destination-screen counts/data. Continue mobile QA with real beta fixtures; native apps, universal links/app links, service workers/offline sync, Supabase Auth setting changes, Edge Function email-link changes, backend changes, lifecycle changes, record-specific deep links, notifications, payments, and calendar sync remain out of scope. |
| FB-011A | Backlog-Aware Partial Invoicing | Jobs, work items, invoices, backlog closeout | Job Summary Badges In Progress | High | Phase 1 adds SQL/type/test foundation for durable job work items, invoice line linkage, backlog snapshots, and a guarded partial-invoice RPC. Phase 2A wires durable work items into contractor job detail when rows exist, creates draft invoices from selected completed/priced items, and displays backlog snapshots separately on contractor/homeowner invoice views and PDFs. Phase 2B-1 seeds durable work items from accepted estimate lines. Phase 2B-2 syncs simple service `Work Items` tasks into durable source-backed work items. Phase 2C-1 adds contractor-created manual work items with safe unbilled-only edit/remove rules. The guardrail slice keeps whole-job invoicing available for legacy/no-work-item jobs while steering work-item-backed jobs to item-based invoicing and adding SQL protection against bypassing durable work-item billing safety. The current frontend-only UX slice adds derived contractor job badges/counts for ready-to-invoice, price-required, backlog-open, partially invoiced, fully invoiced, and no-billable-item states without adding new persisted job statuses. Broad legacy backfill, general inspection finding conversion, homeowner-facing job summaries, and broader closeout UI remain future approval-gated slices. |
| FB-012 | Push Notifications | Notifications, mobile, workflow events | Later / Future | Medium | Do not claim live unless confirmed; revisit after stable core workflows. |
| FB-013 | QuickBooks / Accounting Integration | Accounting, invoices, integrations | Later / Future | Medium | Research later after invoice/payment workflow stabilizes. |
| FB-014 | Payments / Stripe | Payments, invoices | Later / Future | Medium | Keep payments/Stripe future-facing despite FB-031 billing-readiness work; revisit only after invoice reliability, pricing, legal/ops, and Stripe rollout plans are approved. |
| FB-015 | Native Mobile Apps | iOS/Android, field workflow | Later / Future | Medium | Validate responsive web first. PWA metadata prep under FB-011 is not a native app launch; evaluate Capacitor vs React Native/Expo later after mobile web QA, auth redirects, file upload/camera behavior, and deep-link readiness are separately audited. |
| FB-016 | PDF / Storage Strategy Audit | Storage, PDFs, media, records | Backlog | Medium | Future technical audit. |
| FB-017 | Pricing Levels / Feature Tier Direction | Pricing, packaging, plan strategy | Brainstorming | High | Use FB-031 entitlement readiness as planning input, but do not imply billing, paywalls, checkout, or Stripe are active. |
| FB-018 | Estimate Helper v1 | Contractor tools, estimates, scope/revenue suggestion support | Completed / Functional | High | Passed implementation validation, Vercel preview smoke, and user preview review; ready for merge after final PR checks. |
| FB-019 | Estimate Labor Model / Line-Specific Labor Inputs | Contractor tools, estimates, invoices, pricing UX | Completed / Functional | High | v1 is complete: schema foundation and RPC/conversion preservation are merged and applied to sandbox/production; app/UI labor support and Build Estimate Draft labor cleanup are merged and passing preview. |
| FB-020 | Security, Records Reliability, Backup/Restore, and Scale Readiness | Security, RLS, storage, records, operations, performance | Controlled Beta Baseline Met / Follow-up Backlog | High | Controlled private beta baseline is met through public smoke coverage, required authenticated production read-only smoke, no-mutation smoke boundaries, backup/restore templates, artifact guardrails, restore-drill planning, and a first non-production schema restore drill. FB-020 is not fully complete; optional role/stable smoke records, full data/auth restore, storage restore verification, backup/PITR verification, public go-live readiness, paid-subscription readiness, and broader readiness remain follow-up backlog. |
| FB-021 | Scheduling + Appointment Confirmation Foundation | Scheduling, service requests, jobs, homeowner visibility | v1 Closeout Complete / Activity Evidence Applied | High | v1 now covers the SQL/RPC/RLS foundation, read display, contractor 1-3 window proposals, homeowner accept/decline, confirmed appointment visibility, contractor replacement reschedule, contractor appointment cancel, compact appointment-state helper copy, and durable Activity rows for contractor replacement reschedule and appointment cancel. Closeout C merged the SQL/RPC/frontend/test/docs patch; Closeout D applied the SQL to sandbox and verified durable Activity writer behavior; Closeout E applied the SQL to production. Production behavior is live at the SQL/RPC layer, but no production appointment lifecycle mutation probe was run. Future follow-ups should focus on richer safe history UI, broader safe appointment history display if approved, targeted sandbox lifecycle/test hardening, and the unrelated FB-021 role-switch/auth-state UI probe failure if it repeats, while keeping calendar sync, dispatch/routing, GPS, email/SMS/push reminders, notification delivery, homeowner-forced booking, scheduling redesign, and new appointment statuses out of scope. |
| FB-022 | Online Booking / Request-to-Booking Flow | Homeowner service requests, contractor intake, scheduling | Backlog | High | Treat true online/self-booking as later. Use FB-021 as the safer contractor-controlled appointment proposal foundation before any booking workflow. |
| FB-023 | Contractor Payment Collection / Deposits | Invoices, estimates, payments | Foundation Started / Contractor Draft UI | High | A structured estimate payment schedule SQL/RLS/types foundation now exists for future deposit/progress/final terms, and the contractor draft estimate editor can now plan full-on-completion, deposit/final, or custom schedule rows. Estimate PDFs show structured schedule rows when present, and homeowners can review those rows in-app before accepting. Contractors can now create/open draft invoices from accepted, unlinked schedule rows through the narrow schedule-row RPC, while draft/sent/non-accepted schedules remain read-only. Invoice sending, Stripe/card/ACH, receipts, reminders, payment status automation, replacement invoices, and accounting sync remain future approval-gated work. |
| FB-024 | Price Book / Estimate Item Library Maturity | Estimates, saved charges, trade libraries, contractor pricing | Started / Partial | High | The estimate composer now has one estimate-only `Add saved item` picker that searches active contractor-owned Price Book items and active saved charges together while keeping source labels, copied-price review copy, independent editable draft lines, and invoice isolation. Future maturity includes default quantity, taxable/category handling, assemblies/job bundles, margin reminders, invoice quick-pick wiring, historical recent materials, template-item reuse, current-draft searchable reuse, and role-access decisions for internal pricing metadata. |
| FB-025 | Job-Centered Communication + Notifications | Messaging, service requests, jobs, invoices, Activity | Started / Partial | High | Workflow message foundations, job message UI, derived/durable Activity timeline writers/readers, first in-app job-message indicators using existing thread read markers, and a gated `send-notification-email` foundation for a narrow allowlist of existing `public.notifications` event types are merged. In-app notifications remain the source of truth; production email delivery still requires separate env/provider/webhook approval. Future work includes broader unread strategy, request-message migration, broader estimate/invoice communication, optional attachments, durable delivery logs, and notification delivery activation planning. |
| FB-026 | Review + Referral Flow | Discover, contractor profiles, completed jobs, trust | Started / Partial | High | Existing ServSync review capture is hardened around completed-work eligibility, private party visibility, external-review separation, review table/function grant posture, pending moderation SQL/RPC foundation, and an internal platform-admin moderation UI. The contractor-to-contractor referral foundation is merged and production-applied for `contractor_refers_contractor` referral invite leads, kept separate from homeowner invite leads, contractor-homeowner invites, reward referrals, contractor team invites, connection requests, service requests, billing, and email. Slice 2 adds a contractor owner/admin/office submit UI using the existing RPC for ServSync team follow-up, and Slice 3A adds platform-admin manual tracking UI using the existing admin RPCs. Public ServSync review averages, counts, kudos, and snippets remain paused during beta; admin approval records moderation status only and does not publish reviews publicly yet. Future work includes approved-only public display/public-rating policy, referral outreach/product decisions, and optional Google review handoff. No fake ratings, paid ranking, rewards, credits, billing, paywalls, automatic outreach, public referral links, contractor-to-contractor permissions, team access, account/profile creation, or premature badges. |
| FB-027 | Contractor Pipeline / Follow-Up Lite | Estimates, requests, reminders, contractor dashboard | Started / Partial | Medium-High | Contractor dashboard now has a lightweight `Workflow overview` / `Needs review` summary derived from existing loaded request, appointment, accepted-estimate, invoice, and profile setup state, plus compact navigation-only CTAs for accepted estimates needing jobs, completed/closed jobs ready to invoice, and status-based invoice attention. The accepted-estimates `need jobs` CTA now opens Jobs -> Estimates with the Approved filter active and stale search/customer filters cleared so the referenced records are immediately visible. Accepted estimate cards now show compact `Ready for job` / `Job created` helper states and keep Create/View Job primary over the direct estimate invoice action, without changing job creation, invoice eligibility, RPCs, or lifecycle behavior. Saved/focused estimate records still include a direct `Create invoice from estimate` action for draft/sent/accepted legacy/no-schedule estimates that opens the existing editable invoice composer seeded from the estimate instead of requiring an ordinary-service contractor to go through the Jobs tab first. The contractor estimate creation cleanup slice makes the normal start choices `Build blank estimate`, `Choose estimate template`, and `Build draft estimator`, keeps blank/template estimates in the normal single-page form, treats templates and Draft Builder as start paths, exposes saved charges and Price Book through one contextual `Add saved item` picker, starts blank estimates with an empty line-item choice, keeps add controls below existing line rows, hides broader create controls while a draft is active, and puts advanced line metadata behind `More details` without changing persistence, statuses, jobs, invoices, SQL/RLS/RPCs, or homeowner behavior. Bundle 1 Slice 1A adds frontend-only estimate editing basics: contractors can duplicate draft estimate lines as new manual rows, desktop focus moves predictably to added/duplicated lines, draft copy clearly says estimates are not sent until saved/sent later, and same-session scroll restoration is scoped to the active estimate draft. Bundle 1 Slice 1B-1 adds frontend-only collapsible visual estimate sections grouped by normalized line type: Labor, Materials / Other, and Fees. The grouping is local UI state only; it does not add persisted section records, mutate `estimateDraft.line_items`, rewrite saved `sort_order`, change calculations, or alter the invoice composer. Bundle 1 Slice 1B-2 adds frontend-only estimate item reuse polish: the unified `Add saved item` picker searches active Price Book items and active saved charges together, keeps source labels and copied-price review copy visible, inserts independent editable draft lines, expands the destination visual group, and leaves historical estimate retrieval, current-draft searchable reuse, single template-item reuse, estimate room association, and authenticated rendered coverage follow-ups separate. A multiple-invoices foundation now adds structured `invoice_type` and nullable `invoice_sequence` fields for future total/deposit/progress/final invoice workflows, keeps multiple invoices per estimate technically allowed, and updates partial job/work-item invoice creation to write `progress`, but it does not add arbitrary frontend invoice type selection, create-another-invoice behavior, remaining balance summaries, or over-invoice warnings yet. Estimate payment schedule work now includes the structured foundation, contractor draft estimate editor UI, estimate PDF output, homeowner in-app review display, a backend RPC foundation, and contractor accepted-estimate row actions for creating/opening draft invoices from customer-approved schedule rows. Future slices should separately consider stale estimates, fuller filtering/queue needs, CTA consolidation, customer-after-estimate save redesign, multi-invoice summary UX, change orders, Price Book assemblies/autopricing, Draft Builder coverage, Estimate Helper placement, and review-related follow-up only after moderation/public-display policy matures. |
| FB-028 | Accounting Export Foundation | Invoices, customers, accounting | Later / Future | Medium | Start with export-ready invoice/customer/payment data and CSV-style export before QuickBooks sync. Do not build or market full accounting sync. |
| FB-029 | Recurring Maintenance / Service Plan Lite | Home reminders, contractor recurring work, homeowner relationships | Later / Future | Medium | Shape after reminders, scheduling, invoices, and Home History are stronger. Start with manual recurring opportunities, not complex memberships or automated reminder delivery. |
| FB-030 | Shared Home / Home Access | Homeowner access, shared homes, invites, reminders, permissions | Started / Guarded Partial | High | Home membership foundations, shared-home shells, shared reminder shells, invite UI, disabled email function deployment, DB delivery-enable contract, and Closeout A permission-boundary tests are merged/applied. Production invite email delivery remains disabled; shared record access expands only one approved surface at a time. |
| FB-031 | Contractor Beta Billing-Readiness / Entitlement Readiness | Contractor billing readiness, entitlements, admin visibility, future subscription prep | Started / Readiness Only | High | DB billing accounts, entitlement RPCs, admin read-only visibility, contractor entitlement loading, labels, and limited read-only UI support are merged/applied. Beta contractors remain free; no Stripe, checkout, payment collection, paywalls, billing enforcement, or editable billing controls are live. |
| FB-032 | Service Agreements Foundation | Contractor maintenance plans, connected homes, agreement offers, renewals | Foundation Loop Complete / Closeout Polish Pending | Medium-High | The core foundation loop is complete: Slice 2 SQL/RLS/RPC foundation is merged and production-applied, Slice 3A adds contractor-side template/offer UI, and Slice 4A adds homeowner offer review, accept/decline, and read-only active agreement display. Service Agreements remain separate from requests, estimates, jobs, invoices, scheduling, reminders, notifications, payments, renewals, and external delivery. |
| FB-033 | Project Collaboration | Multi-contractor project coordination, project parties, authority, events, job grouping | Hidden Foundation In Progress | Later / Future | Slice 1 adds only a hidden SQL/RLS/RPC/types/test/docs foundation for durable project identity, property association, commercial parties, individual memberships, Project Lead authority, project events, and one-project-per-job association. Runtime mutation gate defaults disabled and profile allowlisting is required. No UI, Beta exposure, Project Board, assignments, invitations, financial sharing, project billing, production SQL application, production allowlist activation, or estimate/invoice permission changes are included. |
| FB-034 | Demo Mode / Marketing Capture Environment | Demo data, screenshots, recordings, QA/onboarding support | Presentation Controls In Progress | Medium | Slice 1 adds the dedicated-demo foundation. Slice 2A adds private runner checkpoints for the existing water-heater scenario through `job_created`: `contractor_discovery_ready`, `connected_request_ready`, `request_ready`, `contractor_review_ready`, `estimate_draft`, `estimate_sent`, `estimate_accepted`, and `job_created`. The discovery checkpoint is a pre-connection opening state for recording the existing homeowner contractor search/profile connection request path without adding Discover posts or browser controls, and `connected_request_ready` provides an active-connection/no-request state for recording homeowner new-request setup. Slice 2B extends the same private runner through lightweight job lifecycle checkpoints: `job_scheduled`, `job_in_progress`, `job_review_ready`, and `job_completed`. Slice 2C-A adds frontend-only presentation controls that can activate only for the dedicated demo project and hide capture clutter/mutating controls without adding browser checkpoint or reset controls. No public Demo Mode, role switching, invoices, Home History, report finalization, reminder demo data, production SQL, shared sandbox use, deployment, external notifications, payments, or production data actions are included. |
| FB-035 | Unified Start New Job Workflow | Estimates, jobs, invoices, job scope, approvals, billing history | Slice 2B Durable Draft Launch Foundation Packaged / SQL Not Applied | High | Slice 1 extracts behavior-preserving shared frontend work-composer presentation/types from the existing estimate builder and adds lifecycle guardrail tests. Backend Slice 2 adds the SQL/RPC/RLS foundation for contractor-only Draft Jobs on `inspections` and canonical scope fields/RPCs on `job_work_items`; it has been applied and validated in sandbox and production. Slice 3 adds contractor-side Draft Job save/resume UI in code behind the explicit `VITE_DRAFT_JOB_UI_ENABLED=true` availability gate: enabled environments route `Start New Job` to the Draft Job composer, `Save Draft` calls the Draft Job RPCs, composer Draft Jobs appear in a separate Drafts section, and `Continue Draft` reloads canonical scope while excluding historical generic inspection drafts. A production UI enablement attempt was rolled back after a composer Draft Job leaked into an operational Recent jobs collection; the follow-up correction centralizes job classification so composer Draft Jobs are excluded from operational cards, counts, summaries, and action sets before those collections are derived. Production is currently serving the legacy Jobs workflow because `VITE_DRAFT_JOB_UI_ENABLED` is absent in Production; the Draft backend remains installed and new Draft-first Work-module development should continue in sandbox/preview until the redesigned workflow is approved and validated. The blank-resume corrective slice refetches the canonical Draft inspection and scope rows before opening `Continue Draft`, preserves saved connected/local customer selections with fallback options, and makes supported advanced scope fields such as room, location, and internal line notes usable after resume. Slice 4A adds the first direct Draft outcome in code: `Create Job` validates the current composer state, saves metadata and scope, activates the same inspection through the existing Draft activation RPC, preserves the Draft/job UUID and scope-item UUIDs, and opens the same record as an operational Job when the Draft UI is enabled. Contractor Work Dashboard Slice 1 adds a strict, default-off `VITE_CONTRACTOR_WORK_UI_ENABLED=true` shell inside the existing Jobs overview for sandbox/preview validation only; Production legacy Jobs remains unchanged, the global label remains `Jobs`, and no new route or mobile nav item is added. Top-level Draft notes still have no backend/RPC persistence contract in the legacy inspection-backed Draft Job path and are not treated as durable there. The approved Draft Launch Principle now treats a neutral Draft as temporary private planning; a workflow begins when the Draft is launched, launch creates exactly one initial first-class record, and the consumed Draft no longer remains an active Draft hub. Slice 2A adds the hidden shared Draft Composer frontend foundation. Slice 2B now packages, but does not apply, the durable backend launch foundation with dedicated contractor Draft tables, durable intended output, private Draft notes, consumed state, source-Draft linkage to launched Estimate or Job records, one-Draft/one-launch constraints, idempotency, contractor-only RLS/grants, canonical save/resume RPCs, atomic launch RPCs, and a non-destructive legacy Draft Job import bridge. Contextual `Start New Draft` entries remain appropriate only where existing trusted context can safely prefill the Draft. `Save Draft` remains the optional pause-and-return action. The Product Information Architecture places Draft-first planning inside the long-term Contractor Work module, and the Contractor Work Module Product Specification now defines the target Work Dashboard, Drafts, Draft composer, Draft launch model, shared launch gate and Preview-visibility rules, Job Overview, Job History, Estimate/Invoice placement, Reports/Templates posture, navigation/mobile rules, backend-contract gaps, migration boundaries, and future implementation-slice framing. This slice does not add autosave, visible half-complete shared composer workflows, visible Create Estimate or Create Job launch UI, direct Draft-to-Invoice launch, direct-job replacement, estimate-from-job, invoice allocation tables, payment ledger, final reconciliation, reopening, homeowner approval UI, production SQL, production data mutation, production environment changes, or Vercel configuration changes. Next: perform a focused audit of the Slice 2B draft PR and SQL before authorizing sandbox application. |

## Detailed feature notes

### FB-001 — Invite a Contractor to ServSync

Status: Completed / Functional

Product area:

- Homeowner Contractors tab
- Service Requests support link
- Contractor acquisition / growth
- Admin invite lead workflow

Summary:
Homeowners can invite or recommend a contractor to join ServSync. This is separate from service requests and connection requests.

Key decisions:

- Feature name: "Invite a contractor to ServSync."
- Do not call it a request.
- Contractors tab should show connected contractors and the invite button.
- Service Requests tab can include: "Don’t see your contractor? Invite them to join ServSync."
- Required invite fields: business name and location.
- Optional fields: trade/category, contact name, phone, email, website, Facebook/social link, homeowner note.
- Contractor outreach can mention that a local homeowner invited/requested the business to join ServSync.
- Do not frame the 30-day trial as exclusive to invited contractors.

Future possible improvements:

- Automated outreach
- Contractor claim flow
- Homeowner follow-up automation
- Invite analytics
- Duplicate lead grouping
- Outreach history

### FB-002 — Contractor Estimate Defaults & Templates

Status: Beta Ready / Follow-up Backlog

Priority: High

Product area:

- Contractor tools
- Estimate workflow
- Estimate templates
- Saved estimate charges

Summary:
Contractors can save recurring estimate charges and estimate templates so they do not have to rebuild common estimates from scratch.

Current next step:
Use the existing saved charges, estimate templates, and private Custom Pricing / Pricing Library workflow in controlled beta. CSV import now has focused regression coverage for preview-before-import, row/file limits, required title validation, invalid/negative price blocking, blank price versus `$0`, warning-only line-type fallback, warning-only duplicate detection, valid-row-only import, add-only insert behavior, estimate-only Price Book quick-pick, and homeowner/invoice privacy boundaries. The estimate composer now consolidates active Price Book items and active saved charges into one estimate-only `Add saved item` picker with shared search, source labels, and copied-price review copy. Future work should keep invoice quick-pick, smart dedupe/overwrite, XLSX/PDF/AI import cleanup, default quantity/tax/category propagation, historical recent materials, template-item reuse, current-draft searchable reuse, estimate room association, and broader trade-library or FB-007 checklist work separate.

Key decisions:

- The current feature has code and static regression coverage suitable for controlled beta use, but contractor beta feedback should still validate the CSV import workflow with representative files before any larger import expansion.
- Saved charges should not auto-load into every estimate.
- Contractors should choose saved charges from a quick-pick list.
- Labor should support flat labor charges and hourly rate × estimated hours.
- Contractors should be able to create multiple estimate templates.
- Templates can be organized by service type or common job type.
- Copied line items must remain editable/removable per estimate.
- Homeowners only see final estimate line items, not internal templates.
- Contractors should be able to save an estimate they create as a reusable template.
- Custom Pricing / Pricing Library v1 should remain a private contractor-owned price-book foundation; CSV import may add new private items after preview, but separate approval is still required before invoice quick-pick wiring, smart dedupe/overwrite, XLSX/PDF imports, AI cleanup, automation, broader trade library work, or FB-007 pre-visit/checklist expansion.

Initial trades to support/test:

- HVAC
- Plumbing
- Electrical
- Carpentry

Product direction:

- These are labor + materials estimating workflows.
- Each trade needs realistic trade-specific material categories.
- Do not hardcode a massive material catalog too early.
- Better direction is starter material categories/templates that contractors can customize.

Template structure should support:

- Materials
- Labor
- Trip/service fees
- Optional add-ons
- Line-item notes
- Terms
- Optional scope inclusions/exclusions
- Optional estimated schedule

Saved charge examples:

- Service call fee
- Diagnostic fee
- Trip charge
- Standard labor rate
- Emergency fee
- Permit/admin fee
- Disposal fee
- Custom "other" charge that the contractor can name/create

Saved charges and templates should remain distinct:

- A saved charge can be used on a template.
- A saved charge does not have to be part of a template.
- Templates are reusable estimate structures.
- Saved charges are reusable line items or fees.

Homeowner view direction:

- Keep the homeowner estimate view as simple as possible.
- Make full context obvious.
- Line items should not be long paragraphs.
- Contractors may add optional notes under line items if desired.
- Scope inclusions/exclusions, terms, and estimated schedule should be optional sections, likely controlled by checkbox/toggle options.

Testing needed:

- Contractor can create saved/default charges.
- Contractor can create estimate templates.
- Saved charges can be selected during estimate creation.
- Templates can be used without breaking blank estimate creation.
- Flat labor and hourly labor behave correctly.
- Copied line items remain editable/removable.
- Homeowners only see final estimate line items.
- RLS/security prevents cross-contractor access.
- Existing estimate flow still works.
- Mobile estimate workflow is usable.

Recommended sequence:

1. Audit current estimate defaults/templates/saved charges implementation.
2. Create and run a manual test plan.
3. Decide whether the current feature is ready as-is, needs fixes, or needs redesign.
4. Polish estimate/mobile workflow.
5. Then move into trade-specific estimate/pre-visit checklist features.

### FB-003 — Contextual Connection Request Flow with Multi-Property Permission Access

Status: Controlled Beta Evidence Confirmed / Follow-up Backlog

Product area:

- Connections
- Permissions
- Homeowner property sharing
- Contractor customer/property view

Summary:
One homeowner-contractor connection can include access to one or more homeowner properties, with separate permissions per property.

Key decisions:

- There should be one homeowner-contractor connection.
- Do not create separate connections per property.
- Homeowner can choose which properties the contractor can see.
- Permissions can be set separately per property.
- Homeowner can copy permissions from one property to another.
- Preferred copy UI: "Copy permissions from: [Primary Home ▼] [Apply to this property]"
- Contractor sees one connected homeowner/customer relationship.
- Contractor sees only shared properties and allowed permission categories.

Contractor action guardrails:

- Contractor cannot create a service request for the homeowner.
- Contractor cannot send an estimate unless tied to an allowed workflow.
- Contractor cannot create a job unless tied to an allowed workflow.
- Contractor cannot initiate general messaging unless the homeowner starts communication.

Contractor shortcuts:

- View shared profile
- View shared properties
- View open Jobs/Estimates/Invoices
- View Homeowner History

Follow-up testing:

- FB-003 Closeout A permission enforcement and contractor visibility audit passed for controlled beta use with no blockers or high-risk issues found.
- Validated evidence included typecheck, build, security catalog checks, cross-user RLS checks, and expanded RLS/privacy checks.
- Confirmed boundaries: homeowner-owned homes remain owner-scoped; shared access remains property-scoped and directional; accepted shared-home shells expose limited fields; viewer shared-home access hides street/zip and shows city/state only; admin/member address-shell behavior remains scoped; contractor visibility remains mediated by active connection plus permission/shared-property/workflow rules; unrelated contractors/homeowners cannot read each other's service requests, estimates, estimate lines, jobs, invoices, invoice lines, or high-risk RPC actions; activity/timeline visibility remains scoped to authorized homeowner, contractor access, or platform admin.
- Shared-home shell/address RPCs do not broaden base `homes` RLS and explicitly exclude work records.
- Medium-risk follow-up: legacy/global connection permission compatibility remains sensitive and should stay under focused regression coverage if expanded.
- Mutation-heavy shared-home specs were reviewed but not rerun during the audit because that audit did not approve sandbox fixture mutation.

Future backlog guardrails:

- Do not treat this as full public go-live readiness.
- Do not imply broad shared-home work-record access, full Home History sharing, notification delivery, media sharing expansion, new permission categories, or contractor visibility beyond authorized connection/property/workflow rules.
- Any new permission category, broader shared-home work-record access, Home History sharing, notification, media, contractor messaging, or visibility-broadening change needs its own narrow audit/implementation slice.

### FB-004 — Contractor Reports

Status: Started / Partial

Priority: Medium

Purpose:
Give contractors practical reports based on real ServSync activity so they can understand estimates, jobs, invoices, open items, and customer activity.

Initial report ideas:

- Estimate Report
- Invoice Report
- Jobs Report
- Customer / Property Report
- Revenue Snapshot
- Open Items Report

Recommended first report:
Open Items Report.

Open Items Report would show:

- Draft estimates
- Sent estimates waiting on homeowner
- Accepted estimates needing job creation
- Open jobs
- Completed jobs needing invoice
- Sent/unpaid invoices
- Overdue invoices

Guardrails:

- Do not call this accounting.
- Do not build tax reporting in MVP.
- Do not build payroll reporting in MVP.
- Do not build profit/loss reporting in MVP.
- Do not build QuickBooks-style reporting in MVP.
- Do not overclaim analytics.
- Use only real ServSync data.
- Make report numbers traceable back to actual records.

Recommended timing:
Hold until the estimate/job/invoice workflows are tested harder. Reporting is only useful if the underlying statuses are reliable.

### FB-005 — Awards / Contractor Recognition Badges

Status: Later / Future

Purpose:
Create recognition badges contractors can display on their profile, such as "Best Plumber of 2026."

Examples:

- Best Plumber of 2026
- Best HVAC Contractor of 2026
- Best Electrician of 2026
- Most Recommended Contractor
- Homeowner Favorite
- Top Rated Local Contractor

Guardrails:

- Do not make this feel fake or premature.
- Do not imply contractors are verified/licensed/insured unless that is actually implemented.
- Do not create fake ratings.
- Needs real platform activity before it feels credible.
- Avoid pay-to-win perception.

Recommended timing:
Later, after ServSync has real contractor/homeowner activity.

### FB-006 — Contractor Auto-Scheduling

Status: Later / Future

Purpose:
Allow contractors to optionally let homeowners schedule visits or request appointment windows.

Direction:

- This must be contractor-controlled.
- Some contractors will like it; others may not want customers booking directly.
- MVP should likely start as appointment request windows, not full automatic scheduling.

Possible controls:

- Allowed days/times
- Service types available for scheduling
- Travel radius
- Buffer times
- Approval required vs auto-confirm
- Max bookings per day

Guardrails:

- Do not create full dispatch/routing too early.
- Do not overcomplicate calendar sync.
- Do not promise external Google/Outlook sync unless built.
- Do not allow homeowners to force bookings onto contractor calendars without contractor control.

### FB-007 — Trade-Specific Estimate / Pre-Visit Checklists

Status: Started / Partial

Priority: High

Purpose:
Help contractors gather the right information before creating an estimate and potentially reduce unnecessary site visits.

Direction:

- Contractor creates the checklist.
- Contractor fills in known variables.
- Homeowner fills out what they can.
- Existing homeowner/property data may prefill later if permissions allow.
- Checklist answers can help inform the estimate.

Examples:

- Deck size
- Roof size
- HVAC equipment info
- Electrical panel info
- Plumbing fixture count
- Water heater model/serial
- Photos of issue
- Measurements
- Access notes
- Urgency

Homeowner pre-visit version:
Contractor can send a checklist to the homeowner before a visit. Homeowner fills it out. If the information already exists in the homeowner profile and permissions allow, ServSync can prefill it.

Fit:

- Estimate workflow
- Inspection/checklist workflow
- Home profile
- Permission-based sharing
- Contractor templates

Guardrails:

- Do not overbuild every trade at once.
- Start with one or two common templates.
- Keep homeowner forms simple.
- Respect permissions when pulling from home profile data.

Recommended timing:
After estimate defaults/templates are audited, tested, and mobile estimate workflow is polished.

Foundation slice:

- Estimate Draft Library path-flow v1 introduces a code-only app data structure for trade -> work category -> job bundle -> estimate sections -> recommended items -> scope wording helpers -> notes/terms candidates -> contractor review reminders.
- v1 starts with bounded proof bundles only: HVAC system replacement, HVAC seasonal tune-up / maintenance visit, plumbing faucet replacement, and carpentry trim/baseboard repair.
- The library is price-free and does not replace contractor review.
- Existing Build Estimate Draft fallback behavior must remain in place whenever no matching bundle exists.
- Focused path-flow regression coverage now protects the HVAC replacement proof-bundle resolver, fallback behavior, price-free output, editor-only review reminders, and homeowner/PDF/invoice boundary.
- A second bounded HVAC seasonal tune-up proof bundle adds a price-free service/maintenance path while preserving fallback behavior, contractor review, and homeowner/PDF/invoice boundaries.
- A first bounded non-HVAC plumbing faucet replacement proof bundle adds a price-free replacement path while keeping faucet repair-only, drain relocation, sink replacement, garbage disposal, toilet, water heater, electrical, and carpentry scopes on fallback behavior unless separately approved.
- A bounded carpentry trim/baseboard repair proof bundle adds a price-free interior repair path while keeping door repair/replacement, drywall, flooring, painting, rot/water damage, mold remediation, structural/framing work, cabinetry, exterior trim/siding, deck/railing, electrical, plumbing, and HVAC scopes on fallback behavior unless separately approved.
- Guided Estimate Draft Builder Slice A changes the contractor estimate creation flow for existing connected/local customers only: contractors choose trade, broad work type, labor style, and rough scope, review up to three deterministic app-owned recipe matches with "why this matched" copy, or choose the existing general fallback builder before editing the draft. Saved Charges, Price Book, Estimate Templates, Estimate Helper, and, at the time, Advanced Trade Tools remained available in a collapsed Reference tools area by default.
- Guided Estimate Draft Builder Slice B adds inline "Create new customer" from the Jobs estimate creation flow. It reuses the existing contractor-private local customer/contact RPC path, returns directly to the guided builder for the created local customer/property, and does not create a job, inspection, invoice, ServSync account, invite, connection, notification, or homeowner account.
- Guided Estimate Draft Builder Slice C makes contractor-owned saved estimate templates a first-class estimate start path alongside the guided draft builder and blank/manual start. It uses the existing template-to-editable-draft clone helper, shows copied-pricing or structure-only review copy, keeps ServSync app-owned recipes separate from contractor-owned templates, and does not create, update, delete, or save template records.
- Guided Estimate Draft Builder Slice D replaces the prompt-based Save as template flow with a modal that lets contractors save reusable templates as structure-only, with line prices cleared, or as structure and pricing, with current line prices preserved. It uses the existing `estimate_templates` insert path, preserves the original estimate, keeps template rename/delete prompts out of scope, and does not change SQL, backend behavior, estimate sending, jobs, invoices, accounts, invites, connections, notifications, AI, or pricing recommendations.
- Pressure washing / exterior cleaning service recipes add price-free app-owned bundles for house exterior soft wash, driveway concrete cleaning, sidewalk/walkway cleaning, patio or pool deck cleaning, deck soft wash, fence washing, roof soft wash, gutter exterior brightening, and commercial flatwork or grease-area cleaning. These recipes use service work-category only, keep generated draft lines editable and unpriced, separate customer-facing descriptions from contractor-only review notes, and keep runoff, chemical, grease, and local-code-sensitive candidates contractor-reviewed instead of silently adding them to generated drafts.
- Estimate Builder Cleanup E removes visible standalone Advanced Trade Tools from Reference tools so contractors are not routed into a competing deck/plumbing/electrical calculator path. Saved Charges, Price Book, Estimate Templates, and Estimate Helper remain reachable; useful deck/plumbing/electrical estimating guidance is preserved in the guided fallback/helper path, including a deterministic, price-free deck board material allowance helper for rough deck scopes with dimensions. The deck helper now parses those dimensions into one normalized true-size object used by material calculations and grid/reference labels so `10x10`, `10 x 10`, and `10 by 10` remain tied to 10 ft by 10 ft, 100 sq ft, and 40 ft perimeter rather than arbitrary visual constants.
- The Jobs/Templates taxonomy cleanup clarifies that `estimate_templates` are presented as Saved Work Templates, `inspection_templates` are presented as Inspection Checklists, and home-scoped inspection layouts are presented as Home-specific Inspection Checklists. This is frontend/test/docs copy cleanup only; true Work Template starts for direct jobs/invoices, Home Setup Templates, and Home Map/floor-plan tooling remain future scope.
- The Saved Work Template actions clarity slice makes Use for Estimate the explicit supported action and presents Create Invoice Draft / Start Direct Job only as future workflow options. It does not add direct-job-from-template behavior, invoice-draft-from-template behavior, backend/data-model changes, SQL/RLS/RPC changes, or template persistence changes.
- The customer-context-only invoice draft slice enables Saved Work Templates to create manual invoice drafts only after a contractor has selected a connected homeowner or local/manual customer context. The draft opens in the existing invoice composer, copies editable template scope/notes/terms/line items/pricing where present, stays unsaved until the contractor uses the existing save-draft invoice action, and does not create a job, create an estimate, send an invoice, mutate the source template, or change backend/data model behavior. Start Direct Job remains future-only, and global template-to-invoice without selected customer context remains future work.
- The selected-customer/context-only manual job starter slice enables Saved Work Templates to open the existing direct job form with template name and scope only. It does not copy template line items, quantities, pricing, labor hours, terms, model/spec, supply status, billable status, completion status, or invoice reservation fields into jobs; it does not create the job automatically, create job work items, create an estimate, create/send an invoice, mutate the source template, or change backend/data model behavior. Global direct-job-from-template and full line-item-to-job-work-item mapping remain future design work.
- The manual-job template-limits clarity slice strengthens selected-customer/context helper copy so contractors understand Start Manual Job copies template name/scope only, template line items and pricing are intentionally not copied into jobs, and job work items can be added after creating the job. Full line-item-to-job-work-item mapping remains future design work because job work items affect completion, billability, partial invoicing, invoice reservations, and billing lifecycle.
- The Home Setup guide shell adds homeowner-facing setup guidance in the Properties/Home area using only existing property profile, home photo, document, reminder, and notes surfaces. It explicitly keeps true Home Setup Templates, Rooms & Systems, Key Home Locations, and Home Map as future tools, and says Home Map should start as a simple not-to-scale room/system map rather than CAD, floor-plan generation, LiDAR, measured layouts, or 3D modeling. Home-specific Inspection Checklists remain separate inspection/report layouts, and no backend/data model, shared-home permission, address-visibility, room/system/key-location persistence, map/layout metadata, storage, estimate/job/invoice, or service agreement behavior changes are included.
- The `home_rooms` foundation is the first backend step toward future Rooms & Systems and Home Map. It creates durable homeowner-owned room records only, treats room basics as non-sensitive shared-home readable data, limits create/update/archive to owner/admin home managers, omits normal browser hard delete, does not add Home Map, assets/systems, key locations, floor-plan/CAD/layout metadata, contractor local property rooms, contractor connected-home room access, or inspection-room migration, and does not change shared-home address visibility.
- The first homeowner Rooms UI uses the existing production-verified `home_rooms` table in the Properties/Home area. Owner/admin home managers can view, add, edit, and soft-archive active room basics; shared member/viewer roles see read-only non-sensitive room basics where surfaced; room notes are shown only to managers; archived rooms are hidden by default; and the Home Setup guide now marks Rooms as available while keeping Systems & Assets, Key Home Locations, Home Map, and true Home Setup Templates future-only.
- The reminder-to-room backend foundation adds optional `home_reminders.home_room_id` support, and the first UI slices let homeowners tag new Home Reminders to active rooms at creation time, show non-sensitive room chips, and locally filter the selected-property Home History reminder list by room. Room links are optional, same-home validation prevents reminders from pointing at rooms from another home, room notes are not shown on reminders, and shared reminder shells, contractor visibility, edit-reminder room changes, grouping, document/photo room tags, inspection room linking, job/work-item room tags, estimate/invoice room tags, Home Map, assets/systems, and key locations remain deferred.
- The document-to-room backend foundation adds optional `home_documents.home_room_id` support for homeowner document organization. Room links are optional, same-home validation prevents documents from pointing at rooms from another home, unassigned documents cannot point at rooms, and room notes are not exposed through documents.
- The manual document upload room-registration foundation lets the prepare/register RPC path carry optional same-home room links from upload reservations into newly registered homeowner documents. The first document-room UI lets homeowners choose an optional active room during manual upload and shows non-sensitive room chips on homeowner-owned document cards. The first homeowner-owned Room Detail panel lets owner/admin homeowners open active room details and see room basics, manager-visible notes, linked reminder counts/lists, and linked document counts/lists using existing loaded room/reminder/document data only. Null room links remain supported, existing upload limits and storage path rules remain in place, no broad `home_documents` update grant is added, and document edit-room assignment, document filters, shared/contractor visibility, storage policy changes, photos, report/job media tags, floor-plan behavior, Home Map, assets/systems, and key locations remain future work.
- Home Map v1 and Assets & Systems v1 build on durable rooms and the `home_assets` foundation. Owner/admin homeowners can create/link simple not-to-scale room boxes, move/resize boxes, save layout rows, open Room Detail from map boxes, and create/edit/soft-archive safe asset/system basics with optional room links. The Properties UX now uses a clean Home Map entry card that opens a dedicated full-page Home Map Builder as the primary room-management experience instead of embedding separate Rooms, Home Map, and Assets & Systems surfaces. The builder lets homeowners add a new room, add a hallway as a normal room/map space, add existing unmapped rooms to the map without duplicating rooms, and manage the selected room through a drawer/bottom-sheet detail surface with room details, manager-only notes, linked assets/systems, linked documents, and linked reminders where already permitted. Room boxes are roughly proportional to entered length x width while remaining manually movable/resizable organization boxes, not scale drawings, and show only essential map labels plus a clear Edit action instead of linked-record clutter. Clicking a room now selects/highlights it only, dragging moves it only, and the detail drawer opens from the explicit Edit action with room name, room type, floor, and rough dimensions immediately available before linked records. The builder autosaves dirty move/resize changes, flushes pending layout saves before actions that reload map data, shows save status in a minimal header, provides a larger canvas-first scrollable workspace with zoom/fit controls in a visibly labeled side toolbar on desktop, uses a compact bottom action toolbar on mobile so the canvas remains full-width, and keeps room lists as secondary collapsible overlays or mobile sheets. The builder grid now uses a rough visible 1-ft minor grid with stronger 5-ft major lines, shares one pixels-per-foot rendering path with room box sizing and snap behavior, suppresses mobile text selection/callouts on room move/resize controls, snaps room/hallway movement and resizing to the grid, maps entered length x width dimensions directly to measured grid footprints such as 1 x 1, 2 x 2, 5 x 5, and 4 x 16 hallway shapes without fake-enlarging the footprint for tap targets, and now normalizes rendering, labels, dimension edits, drag, resize, and autosave through one feet-based frontend model before writing matching layout and measured values into existing columns. Room labels now adapt to the measured box size with full, compact, minimal, and selected external-callout modes so narrow true-size spaces can stay accurate without label overflow. The builder canvas supports display-only mobile zoom through the existing zoom path and now owns canvas-local touch gestures with non-passive listeners, two-finger pinch plus midpoint-based pan, and scoped empty-canvas pan while keeping persisted room geometry and grid true-size scaling unchanged. Visible room Edit, resize, and move affordances now appear only on the selected manageable room so unselected room boxes keep the canvas cleaner while preserving true-size footprints and responsive labels. Shared member/viewer roles can view non-sensitive map basics read-only where surfaced, but asset browsing stays manager-only, while manager-only notes, document visibility, and private reminder/document counts remain protected. Contractor map/asset visibility, contractor map permissions/proposals, serial numbers, sensitive access fields, key locations, asset media/document linking, migrations/backfills, floor-plan/CAD/LiDAR/3D behavior, workflow links, and ceiling-height schema remain deferred. SVG rendering remains a future optional improvement; L-shaped and other multi-section rooms require a separately approved SQL/RLS foundation, likely room layout sections, because the current UI treats `home_room_layouts` as one active layout row per room. Future floor-plan upload/recreation and basic map objects such as doors, windows, stairs, counters, islands, cabinets, closets, appliance markers, and utility markers require a separate `home_map_objects` data model plus storage, privacy, and permission review.
- The Home Map Draft foundation adds the first SQL/RLS/RPC boundary for contractor-created map proposals without direct permanent map access. Contractors with an authorized active service request tied to a homeowner property can create service-request-scoped draft headers and draft room/layout proposal rows through SECURITY DEFINER RPCs only; browser table grants remain read-only behind RLS. The first contractor UI slice adds a blank request-scoped draft builder inside contractor Service Requests so contractors can create a draft, add/edit draft rooms and hallways, submit it for homeowner review, or revoke it before approval through the existing draft RPCs. Homeowner managers must accept a submitted draft before any canonical `home_rooms` or `home_room_layouts` rows are created/updated, and decline leaves the permanent map unchanged. Contractors still cannot directly read/write permanent `home_rooms`, `home_room_layouts`, or `home_assets`; asset notes, documents, reminders, storage, key locations, contractor asset browsing, estimate/job anchors, homeowner review UI, permanent map import, and production SQL application remain separate approval-gated follow-ups.
- This does not complete full trade-specific estimate/pre-visit checklist coverage.

Current next step:
Validate the estimate start-choice, Save as template modal, Advanced Trade Tools cleanup, clarified Jobs/Templates taxonomy, Saved Work Template action clarity, customer-context-only manual invoice draft creation, selected-context manual job form starts, name/scope-only manual-job template-limit copy, Home Setup guide shell, `home_rooms` RLS foundation, first homeowner Rooms UI, reminder-to-room SQL/UI foundation, document-to-room SQL/RPC foundations, homeowner document room picker/chip UI, homeowner-owned Room Detail panel, `home_assets` SQL/RLS foundation, Home Map v1 / Assets & Systems v1, the dedicated Home Map Builder, the Home Map Draft SQL/RLS/RPC foundation, and the first contractor request-scoped Home Map Draft UI with connected homeowners, shared-home roles, contractor-private local customers, inline-created local customers, and homeowner beta fixtures in preview/beta. Keep global template-to-invoice without selected customer context, global direct-job-from-template, full line-item-to-job-work-item mapping, true Home Setup Templates, key locations, contractor Home Map/asset direct access, homeowner Home Map draft review UI, permanent map import into contractor drafts, room-linked reminder edit assignment/grouping, document edit-room assignment/filtering, photo room tagging, report/job media tagging, shared-home document expansion, shared-home/contractor Room Detail expansion, contractor room/document visibility expansion, broader recipe-library expansion, homeowner pre-visit checklist work, pricing suggestions, recipe catalog UX, and trade-coverage expansion separately approved.

### FB-008 — Discover Engagement Filter / Recently Active Contractors

Status: Later / Future

Purpose:
Help homeowners find contractors who are active on ServSync and encourage contractors to keep profiles/content current.

Possible wording:

- Recently Active
- Active on ServSync
- Recently Posted
- Active Contractors

Possible metrics:

- Number of Discover posts
- Recent posting activity
- Completed profile
- Response rate, if reliable
- Recent platform activity
- Homeowner engagement

Guardrails:

- Do not reward spammy posting.
- Do not imply guaranteed response time.
- Do not create public rankings before marketplace behavior is reliable.
- Do not claim "top contractor" unless backed by clear criteria.

### FB-009 — Discover Feed Strategy

Status: Backlog

Priority: Medium

Purpose:
Make Discover feel like a useful local contractor feed, not just a generic search page.

Direction:

- Discover should show contractor posts/feed-style content.
- It should focus on useful contractor visibility.
- Contractor search belongs primarily in Contractors tab/search context.
- Discover should not be a generic property-selector-driven page.

Possible content:

- Contractor posts
- Service examples
- Maintenance tips
- Before/after content later when real
- Local service updates
- Seasonal reminders

Guardrails:

- No fake activity.
- No fake contractor posts.
- No fake metrics.
- No broad marketplace lead-generation claims until real.

### FB-010 — General Homeowner-Contractor Messaging

Status: Later / Future

Purpose:
Allow homeowner-contractor communication outside a specific service request, while preserving homeowner control.

Current rule:
Homeowner must initiate communication.

Contractor should not cold-message a homeowner just because they are connected.

Possible homeowner-initiated communication paths:

- Connection request message
- Service request message
- Future homeowner-started general message

Guardrails:

- Do not allow unrestricted contractor-initiated messaging.
- Make it clear whether a message is general, tied to a connection request, or tied to a service request/job.
- Avoid creating a chaotic chat system.

Recommended timing:
After contextual connection flow is tested.

### FB-011 — Mobile Workflow Polish

Status: Started / Partial

Priority: High

Purpose:
Improve mobile usability for field use and homeowner convenience.

Current closeout evidence:

- First frontend-only polish pass improved mobile stacking, action hierarchy, spacing, and scanability across core homeowner and contractor beta surfaces.
- Closeout A mobile fixture QA found one narrow homeowner Properties / Home Access overflow at iPhone SE width.
- Closeout B fixes that narrow overflow and adds a settled iPhone SE regression check for the homeowner Properties / Home Access surface.
- Mobile Readiness Slice 1 adds a conservative PWA manifest, app icon metadata, mobile web meta tags, and source-static installability coverage. It does not add service worker registration, offline sync, push notifications, Capacitor/native projects, auth redirect changes, or backend behavior.
- Mobile Readiness Slice 2A adds a small frontend helper for current web hash-route URL construction covering password reset redirects, homeowner claim/invite links, contractor team invite links, public profile links, and legal route links. It preserves current hash-routed web behavior and does not add native deep links, Capacitor, iOS universal links, Android app links, Supabase Auth setting changes, signup confirmation behavior changes, Edge Function email-link changes, service worker/offline sync behavior, or record-specific estimate/invoice/appointment/notification deep links.
- Mobile PWA Real-Device QA Checklist adds a reusable docs-only checklist for installed-PWA and mobile-browser QA across iPhone Safari, Android Chrome, auth/recovery links, current hash routes, workflow smokes, file/photo/PDF behavior, and future Capacitor proof-of-concept notes. It does not change app behavior, auth behavior, Supabase/Vercel settings, SQL/RLS/RPCs, Edge Functions, native projects, service workers, offline sync, push notifications, or deployment behavior.
- Mobile UI Foundation Slice 1A adds a mobile-only role-based bottom navigation shell for homeowner and contractor dashboards. Contractor mobile nav maps Dashboard, Jobs, Money, Messages, and More to existing contractor tabs/views; homeowner mobile nav maps Home, Requests, Projects, Contractors, and More to existing homeowner tabs/views. The slice preserves desktop sidebar navigation, keeps secondary destinations in the existing drawer, and does not add SQL/RLS/RPCs, auth changes, backend behavior, project-management data models, scheduling changes, messaging systems, notifications, payments, or native app projects.
- Mobile UI Foundation Slice 1B updates the mobile bottom nav labels to Contractor: Discover / Jobs / Dashboard / Homeowners / More and Homeowner: Discover / Requests / Dashboard / Contractors / More. Money is removed because the existing Jobs area already groups jobs, estimates, and invoices; Projects is removed until a stronger project hub exists. The slice also adds `viewport-fit=cover`, root width/overflow guards, mobile top safe-area padding, and centralized mobile input font-size hardening without adding backend, auth, entitlement, scheduling, messaging, notification, native, service worker, payment, or project-management behavior.
- Mobile UI Foundation Slice 1C unifies shared nav badge count sources where desktop and mobile represent the same workflow, removes mobile-only Dashboard badges, adds compact two-column mobile tiles to the contractor Jobs overview, and adds a mobile-only sticky nested Jobs back control. It does not add horizontal rails, broad dashboard redesign, backend behavior, SQL/RLS/RPC changes, auth changes, native app work, notifications, payments, scheduling changes, or service worker/offline behavior.
- Mobile UI Foundation Slice 1D polishes contractor mobile Jobs tile priority by making Open Jobs the full-width top tile and keeping New Jobs plus Completed / Closed Jobs as compact secondary tiles below it. Desktop Jobs layout/order, counts, click behavior, badges, homeowner layout, backend behavior, SQL/RLS/RPCs, auth, entitlement, scheduling, notifications, payments, native app work, and service worker/offline behavior remain unchanged.
- Mobile UI Foundation Slice 1E removes the contractor mobile Jobs bottom-nav badge so mobile navigation does not show an inconsistent workflow count. The Open Jobs count remains inside the Jobs overview tile; desktop navigation, homeowner navigation, badge count sources, labels, backend behavior, SQL/RLS/RPCs, auth, entitlement, scheduling, notifications, payments, native app work, and service worker/offline behavior remain unchanged.
- Mobile UI Foundation Slice 1F makes contractor Jobs overview tile patterns consistent: Estimates / Invoices now mirrors the active-work priority pattern with Open Estimates / Invoices full-width on mobile, while Templates & pricing uses compact secondary-tool rows because no single tool is the primary action. Labels, counts, click behavior, desktop behavior, mobile bottom nav, homeowner layout, backend behavior, SQL/RLS/RPCs, auth, entitlement, scheduling, notifications, payments, native app work, and service worker/offline behavior remain unchanged.
- Mobile UI Foundation Slice 1G strengthens the contractor Jobs nested-section mobile subheader so long/search-heavy Jobs sections keep a clearer Jobs overview escape path. Jobs overview, Slice 1F tile patterns, mobile bottom nav, homeowner layouts, labels, counts, click behavior, desktop behavior, backend behavior, SQL/RLS/RPCs, auth, entitlement, scheduling, notifications, payments, native app work, and service worker/offline behavior remain unchanged.
- Mobile UI Foundation Slice 1H makes the contractor Jobs nested-section escape/orientation header fixed and more visually distinct on mobile, with spacer protection so long sections such as Templates keep the Jobs overview control available while scrolling. Jobs overview, Slice 1F tile patterns, mobile bottom nav, homeowner layouts, labels, counts, click behavior, desktop behavior, backend behavior, SQL/RLS/RPCs, auth, entitlement, scheduling, notifications, payments, native app work, and service worker/offline behavior remain unchanged.
- Mobile UI Foundation Slice 1I tunes the contractor Jobs nested fixed mobile header from the heavier Slice 1H treatment to a more compact neutral bar while preserving the persistent Jobs overview control in long nested sections. Jobs overview, Slice 1F tile patterns, mobile bottom nav, homeowner layouts, labels, counts, click behavior, desktop behavior, backend behavior, SQL/RLS/RPCs, auth, entitlement, scheduling, notifications, payments, native app work, and service worker/offline behavior remain unchanged.
- Mobile UI Foundation Slice 1J removes the contractor Jobs fixed nested mobile header and spacer after real-device feedback rejected the pattern, relying on the existing persistent bottom-nav `Jobs` re-tap behavior plus retained top-of-card back controls to return to Jobs overview. Jobs overview, Slice 1F tile patterns, mobile bottom nav labels, homeowner layouts, labels, counts, click behavior, search/filter behavior, desktop behavior, backend behavior, SQL/RLS/RPCs, auth, entitlement, scheduling, notifications, payments, native app work, and service worker/offline behavior remain unchanged.
- Mobile UI Foundation Slice 1K removes inconsistent raw-count contractor drawer/sidebar badges for Jobs and Calendar while preserving destination-screen counts/data, Jobs overview tile counts, Calendar data, mobile bottom nav labels, Jobs re-tap return behavior, homeowner layouts, labels, click behavior, search/filter behavior, desktop layout, backend behavior, SQL/RLS/RPCs, auth, entitlement, scheduling, notifications, payments, native app work, and service worker/offline behavior.

Areas to watch:

- Dense contractor cards
- Estimate creation on mobile
- Job workflow on mobile
- Invoice view/send on mobile
- Connection/property permission flow on mobile
- Homeowner request flow on mobile
- Contractor customer/property views

Guardrails:

- Current app is responsive web, not native mobile.
- Do not claim iOS/Android native app until built.
- Do not claim offline support, push notifications, or native wrapper support from PWA metadata alone.
- Do not treat normalized frontend hash-route URL helpers as universal links, Android app links, custom schemes, Supabase Auth settings approval, Edge Function email-link activation, or native app readiness.
- Treat the real-device QA checklist as a testing aid only; it is not evidence that installed-PWA behavior, auth recovery links, file/photo upload, PDFs, or future Capacitor behavior have passed on actual devices.
- Do not overbuild mobile-only workflows before testing current responsive app.

Recommended timing:
High before broader beta.

### FB-012 — Push Notifications

Status: Later / Future

Purpose:
Notify users when key events happen.

Potential events:

- Contractor receives connection request
- Homeowner receives estimate
- Contractor receives accepted estimate
- Homeowner receives invoice
- Reminder due
- Contractor invite status changes
- Connection accepted/declined
- Message received

Guardrails:

- Do not claim push notifications are live unless confirmed.
- In-app attention badges may exist, but push/email/text automation should be treated separately.
- Native app push will likely depend on mobile app strategy.

### FB-013 — QuickBooks / Accounting Integration

Status: Foundation Started / Future

Purpose:
Potentially allow contractors to connect invoices/customers/payments with QuickBooks later.

Current foundation:
ServSync now has a provider-neutral integration foundation planned/implemented at the SQL/test/docs level through `external_object_mappings` and `integration_outbox_events`. This foundation gives future accounting export/sync work a safe place to map ServSync records to external provider objects and queue idempotent external side effects without adding provider-specific columns to invoices, customers, estimates, jobs, or homes. QuickBooks/accounting sync is not live, no OAuth/token storage exists, and no browser/client access is granted to these internal tables.

Guardrails:

- Do not build before invoice/payment workflow is stable.
- Do not overclaim accounting support.
- Requires Intuit/QuickBooks approval/research.
- Should remain optional for contractors.
- ServSync should not become full accounting software.
- Future QuickBooks/accounting IDs should use provider-neutral external object mappings or a reviewed extension of that pattern, not ad hoc columns on core business records.

### FB-014 — Payments / Stripe

Status: Foundation Planned / Future

Purpose:
Allow homeowners to pay invoices through ServSync later.

Current foundation:
The provider-neutral integration foundation gives future payment work an internal event/outbox and external-object mapping pattern, but payments/Stripe remain inactive. No payment provider wiring, checkout, card/ACH collection, webhook handling, subscription payment flow, or payment ledger behavior is live.

Guardrails:

- Payment collection currently happens outside ServSync.
- Do not claim in-app payments are live.
- Manual mark-paid may exist, but that is not payment processing.
- Stripe should come after invoice workflow is tested.
- Do not store provider-specific payment IDs directly on core invoice/customer tables unless a separately approved payment-ledger design requires it.

### FB-015 — Native Mobile Apps

Status: Later / Future

Purpose:
Create iOS/Android apps for field use, homeowner requests, notifications, and mobile-first workflows.

Possible paths:

- Capacitor
- React Native / Expo

Guardrails:

- Current app is responsive web.
- Do not claim native apps are live.
- PWA metadata/installability preparation may happen under FB-011, but it is not a native app launch.
- Push notifications may depend on this direction.
- Validate mobile web first before committing to native.

### FB-016 — PDF / Storage Strategy Audit

Status: Backlog

Purpose:
Make sure PDFs, media, reports, invoices, estimates, and job records are stored efficiently and safely.

Guiding principle:
Keep estimates, invoices, reports, and job records as structured database data. Generate PDFs on demand where possible. Store only business/legal final snapshots when needed.

Audit should inspect:

- Current PDF generation/storage
- Duplicate PDFs
- Draft PDF storage
- Final/legal snapshots
- Report photos
- Media compression
- Supabase storage usage
- Egress risk
- Archival strategy

Guardrails:

- Avoid storing duplicate/draft PDFs.
- Compress/resize photos.
- Monitor Supabase storage and egress.
- Use signed/private media access where appropriate.

### FB-017 — Pricing Levels / Feature Tier Direction

Status: Brainstorming

Priority: High

Purpose:
Define pricing levels and features offered at each level.

Direction:
ServSync’s pricing model should stay simple and contractor-friendly. Homeowners should remain free because homeowner adoption helps create value for contractors. Contractors are the paying customer.

This is product direction only. Do not treat pricing tiers as live unless they are implemented and confirmed in the app.

Possible early structure:

- Homeowner Free
- Contractor Starter
- Contractor Pro
- Contractor Team

Homeowner Free possible features:

- Homeowner profile
- Home/property profiles
- Service requests
- Contractor connections
- Permission-based sharing
- Estimate review and approval
- Job/report visibility
- Invoice visibility
- Home History
- Manual reminders
- Ability to invite a contractor to ServSync

Contractor Starter possible features:

- Contractor business profile
- Connection requests
- Service request management
- Estimate creation
- Basic estimate templates
- Saved charges
- Job creation from accepted estimates
- Basic job/report workflow
- Invoice creation
- Manual mark-paid workflow
- Customer/property view based on homeowner permissions
- Basic Home History visibility where permitted
- Basic Discover/profile visibility
- One contractor/admin user

Contractor Pro possible features:

- Everything in Contractor Starter
- Multiple estimate templates
- Trade-specific starter template categories
- Rich estimate sections
- Save estimate as reusable template
- More saved charges
- More advanced customer/property organization
- More robust job/report records
- More complete invoice tools
- Open items report when reporting is ready
- Expanded Discover/profile content
- Limited team/user access if implemented

Contractor Team possible features:

- Everything in Contractor Pro
- Multiple team users
- Role-based access
- Team job visibility
- Assignment/status visibility if implemented
- More advanced reporting when ready
- More template capacity
- More customer/property organization
- Stronger mobile workflow support
- Future calendar/job coordination tools when implemented

Possible future add-ons:

- Payments / Stripe processing
- QuickBooks/accounting integration
- Advanced reporting
- Automated reminders
- Push notifications
- Native mobile app features
- External calendar sync
- Premium Discover/profile visibility
- Additional storage/media capacity
- Advanced team/dispatch tools

Guardrails:

- Do not claim pricing tiers are live unless implemented and confirmed.
- Do not claim payments are live until implemented.
- Do not claim QuickBooks/accounting sync is live until implemented.
- Do not claim push notifications are live unless confirmed.
- Do not claim automated reminders are live unless confirmed.
- Do not claim native iOS/Android apps are live until built.
- Do not claim broad marketplace lead generation or guaranteed leads.
- Do not make pricing feel enterprise-heavy.

Pricing philosophy:

- Starter helps contractors get organized.
- Pro helps contractors estimate and operate more efficiently.
- Team helps small companies coordinate work across multiple users.
- Avoid building too many tiers too early.
- Exact prices should be finalized later after competitor review, beta feedback, and confirmation of live features.

### FB-018 — Estimate Helper v1

Status: Completed / Functional

Priority: High

Product area:

- Contractor tools
- Estimate composer
- Scope/revenue suggestion support

Purpose:
Give contractors an internal, contractor-only estimate-builder suggestion panel for commonly missed scope or revenue items without adding automation, persistent settings, or homeowner-facing helper text.

Initial suggestion categories:

- Permit / inspection fee
- Disposal / haul-off
- Trip / service call fee
- Testing/startup
- Delivery / material handling
- Access difficulty
- Optional maintenance plan add-ons
- Hidden condition or scope allowance

Key decisions:

- Estimate Helper v1 is code-only.
- No SQL, schema, RLS, RPC, storage, auth, environment, or production setting changes.
- Suggestions are not automatically added.
- Contractor can click Add item to add a normal editable estimate line.
- Added helper lines should default to blank price / Price Required.
- Suggestion rationale must use contractor editor-only helper/source-note behavior.
- No persistent dismissals, global settings, per-template settings, source metadata schema, or customer-visible visibility flags in v1.
- Homeowner estimate views and PDFs must not show helper rationale unless the contractor intentionally turns a suggestion into normal customer-facing estimate content.

Validation completed:

- Estimate Helper appears only in contractor estimate creation/editing.
- Suggestions can be ignored.
- Add item creates editable Price Required lines.
- Saved draft persists only normal line fields, not helper rationale.
- Homeowner estimate view does not show helper/source notes.
- Estimate PDF does not show helper/source notes.
- Build Estimate Draft, saved-charge quick-pick, and starter/saved template surfaces remain reachable.
- Estimate Helper accordion/dropdown starts collapsed, expands to show suggestions, and collapses to hide suggestions.

### FB-019 — Estimate Labor Model / Line-Specific Labor Inputs

Status: Completed / Functional

Priority: High

Product area:

- Contractor estimates
- Build Estimate Draft
- Estimate/invoice line items
- Homeowner estimate/PDF display
- Estimate-to-job and estimate-to-invoice conversion

Summary:
Completed v1 of the schema-backed labor model so contractors can use one estimate-level labor rate with either job-total labor hours or line-specific labor hours attached to material/scope lines. Line-specific labor no longer creates standalone generated labor rows in Build Estimate Draft and does not bury labor inside material pricing.

Key decisions:

- One labor rate belongs to the estimate, defaulting from contractor profile when available.
- Job-total labor uses estimate-level labor hours.
- Line-specific labor stores labor hours on estimate line items.
- Labor totals are calculated from hours x estimate labor rate.
- Blank labor hours do not show to homeowners/PDFs.
- Labor hours with blank labor rate should warn and behave like a Price Required-style issue.
- $0.00 remains intentional no charge.
- Estimate-to-invoice and linked job-to-invoice conversion must preserve labor fields before app rollout is considered complete.
- Accepted estimate-to-job approved scope may preserve labor as rendered approved-scope text/JSON for v1.
- Existing estimates remain compatible.

Implementation sequence:

1. PR 1: SQL/schema foundation file only. Completed and applied to sandbox/production with separate approvals.
2. PR 2: SQL-only RPC/conversion preservation so accepted estimate-to-invoice, accepted estimate-to-job approved scope, and linked job-to-invoice paths preserve labor context before app/UI rollout. Completed and applied to sandbox/production with separate approvals.
3. PR 3: App/UI support for contractor labor rate, labor mode, job-total labor hours, line-specific labor hours, totals, save/reopen, homeowner/PDF display, and warnings. Completed and merged.
4. PR 4: Build Estimate Draft behavior update so line-specific labor no longer creates generated standalone labor rows. Completed and merged.

Completed v1 behavior:

- Schema foundation is complete and applied to sandbox/production.
- RPC/conversion preservation is complete and applied to sandbox/production.
- App/UI labor model support is complete for contractor estimate editing, save/reopen, totals, homeowner display, PDF display, and minimal invoice preservation.
- Build Estimate Draft now aligns with the new labor model.
- Job-total labor uses estimate-level labor controls.
- Line-specific labor uses per-line labor-hour inputs.
- Line-specific Build Estimate Draft no longer generates standalone labor-only rows.
- Homeowner and PDF display shows filled labor hours and hides blank labor hours.

Current next step:
Estimate Labor Model v1 is complete. Future work should be optional regression hardening or a deliberate review of advanced trade-tool labor behavior.

### FB-020 — Security, Records Reliability, Backup/Restore, and Scale Readiness

Status: Controlled Beta Baseline Met / Follow-up Backlog

Priority: High

Product area:

- Security / RLS / cross-user privacy
- Storage and private media
- Records durability and data integrity
- Backup, restore, retention, export, and cancellation policy
- Dependency security and operational readiness
- Pagination, query limits, and scale readiness

Purpose:
Make sure ServSync can safely protect private homeowner/contractor information, preserve business-critical service records, recover from data/file loss events, and scale toward real beta/public usage without avoidable privacy, storage, records, or performance failures.

Relationship to FB-016:
FB-016 remains focused on PDF/storage strategy. FB-020 is broader and owns security, records reliability, backup/restore, retention/export, dependency security, and scale readiness.

Audit findings to preserve:

- Current confidence is sufficient for the controlled private beta baseline, medium for many app security foundations, low for full backup/restore readiness, low for deletion/retention/export readiness, medium-low for 1,000-user performance readiness, and low for public go-live readiness.
- Existing foundations include browser-safe Supabase client usage, RLS foundation, private home document bucket design, private media storage policies, signed URL display paths, RLS/storage tests, sign-out local storage cleanup, and duplicate prevention for invoice-to-Home-History filing.
- Gaps include deployed-state verification, SECURITY DEFINER/RPC authorization audit, backup/restore runbooks, storage-object backup strategy, dependency audit vulnerabilities, public-media guardrails, orphan/broken storage-object handling, unpaginated growing lists, and immutable/auditable record snapshots.

Progress through PR #145:

- Public production smoke and smoke-readiness docs exist.
- Security catalog coverage and selected RPC grant hardening have expanded.
- Production smoke credential readiness checks exist, and required homeowner/contractor owner authenticated production read-only smoke passed preflight plus sign-in/navigation without recording credential values.
- Backup/restore ledger templates, backup artifact gitignore guardrails, restore-drill preflight planning, and a non-production restore drill operator checklist exist.
- A first database-only schema restore drill completed against an isolated throwaway Supabase project and was cleaned up. Full data restore remains open because public rows reference `auth.users`, and auth-user restore was not approved for the first drill.
- Authenticated production smoke remains read-only and gated on approved safe credentials/records; optional role credentials and optional stable smoke record IDs remain future/not configured.
- Controlled private beta baseline is met by the combination of production public smoke coverage, required production authenticated read-only smoke for homeowner and contractor owner accounts, no production mutation during smoke testing, restore drill preflight/operator docs, backup/restore evidence templates, backup/restore artifact `.gitignore` guardrails, the first non-production database-only schema restore drill, schema restore verification matching 66 public tables, 179 public functions, and 66 RLS-enabled public tables, cleanup of the throwaway restore target and local artifacts, and no secrets/artifacts committed.
- FB-020 remains follow-up backlog rather than fully complete. Full data/auth restore remains open due to the `auth.users` scope boundary, storage restore remains open, backup/PITR verification remains open, storage-object backup/restore strategy remains unverified, optional production role credentials remain future/not configured, optional stable production smoke record IDs remain future/not configured, public go-live readiness remains a separate gate, and paid-subscription readiness remains a separate gate.
- The storage restore verification planning slice adds a docs-only operational plan and sanitized evidence template for future Supabase Storage backup/restore verification. It does not execute a restore, download storage objects, create backup artifacts, verify storage restore readiness, mutate production or sandbox data, or change Supabase/Vercel/env/auth/provider settings.

Recommended future implementation sequence:

1. Documentation/policy decisions.
2. Test-only security hardening.
3. Dependency security triage/upgrade.
4. SQL/RLS/storage hardening after explicit approval.
5. App pagination and storage-integrity cleanup.
6. Operational backup/restore and deployed-state verification.

Guardrails:

- Do not treat this backlog item as implementation approval.
- Do not claim full security, full backup/restore, compliance, public go-live, paid-subscription readiness, production RLS/storage verification, storage restore, or backup/PITR verification is complete until proven by code, SQL/config, deployed-state checks, tests, and completed implementation reports.
- Keep controlled private beta, broader beta, public go-live, and paid subscription readiness as separate gates.

Current next step:
Treat FB-020 as controlled private beta baseline met while keeping it open as a follow-up readiness backlog. Storage restore verification now has a docs-only plan/template, but actual storage restore execution remains future and separately approved. Next operational readiness work should decide whether to approve a full database restore including required auth rows, create sanitized matching auth fixtures, or accept schema-only restore as the first milestone; optional stable smoke records, optional role smoke credentials, storage restore execution, storage-object backup/restore strategy execution, public go-live readiness, paid-subscription readiness, and broader backup/PITR readiness remain separate follow-ups.

### FB-021 — Scheduling + Appointment Confirmation Foundation

Status: v1 Closeout Complete / Activity Evidence Applied

Priority: High

Product area:

- Scheduling
- Service requests
- Contractor-proposed appointment windows
- Homeowner appointment confirmation
- Calendar/request visibility

Summary:
FB-021 was added from the competition-gap review as the safer near-term alternative to full contractor auto-scheduling. The implemented v1 slices add a SQL/RPC/RLS foundation for appointment windows and history, read-only request-card display for confirmed/pending appointment context, contractor 1-3 window proposals, homeowner accept/decline controls, contractor replacement-window reschedule controls, contractor appointment cancel controls, and compact appointment-state helper copy.

Current guardrails:

- Contractor remains in control of proposed windows.
- Homeowner can accept/decline proposed windows but cannot force a contractor booking.
- Contractor can propose replacement windows for a confirmed appointment, and the current appointment remains scheduled until a homeowner accepts a replacement.
- Contractor can cancel a confirmed appointment without canceling the whole service request.
- No Google/Outlook calendar sync.
- No dispatch/routing/GPS.
- No email/SMS/push reminder automation or notification delivery.

Current next step:
Durable Activity rows for contractor replacement-window proposals and appointment cancellations are merged and SQL-applied to sandbox and production. Sandbox Closeout D verified the new `appointment_reschedule_proposed` and `appointment_cancelled` rows, duplicate prevention, homeowner/contractor visibility, unrelated-user denial, preserved RLS/grants, and cleanup; Closeout E verified the production schema/RPC/grant posture after apply without running production mutation probes. Future work should stay narrow: richer safe appointment event/history UI if needed, broader safe appointment history display only if separately approved, targeted sandbox lifecycle probe hardening, and possible test hardening for the unrelated FB-021 role-switch/auth-state UI probe failure if it repeats. Do not treat this as full online booking, public availability, automated reminders, external calendar sync, dispatch, routing, GPS, notification delivery, homeowner-forced booking, scheduling redesign, or new appointment statuses.

### FB-022 — Online Booking / Request-to-Booking Flow

Status: Backlog

Priority: High

Product area:

- Homeowner requests
- Contractor intake
- Scheduling
- Booking strategy

Summary:
True online booking is not live. FB-021 covers the safer appointment proposal/confirmation foundation, but self-service booking and broader request-to-booking automation remain future work.

Current next step:
Revisit only after FB-021 v1 scheduling behavior has enough beta confidence and any contractor-controlled availability model is explicitly approved. Any future booking slice must preserve contractor control and avoid homeowner-forced bookings.

### FB-023 — Contractor Payment Collection / Deposits

Status: Later / Future

Priority: High

Product area:

- Invoices
- Estimates
- Payments
- Deposits and receipts

Summary:
Contractor payment collection, deposits, card/ACH handling, receipts, and payment reminders are not live. Existing billing-readiness work under FB-031 is entitlement/planning infrastructure only and does not activate Stripe, checkout, payment collection, billing enforcement, or paywalls. The estimate payment schedule foundation introduces structured estimate-side billing terms for future customer-approved deposit/progress/final workflows, the first contractor draft estimate UI lets contractors plan full-on-completion, deposit/final, or custom schedule rows, estimate PDFs show structured payment schedule rows when present, and homeowners can now see configured schedule rows in the expanded estimate review before approval. Contractors can create draft invoices from accepted, unlinked schedule rows through the approved RPC, but invoices are still draft-only until the existing invoice send flow is used. It does not collect payments yet.

Current next step:
Preview the contractor draft payment schedule editor, PDF output, homeowner in-app display, and accepted-estimate schedule-row invoice actions before expanding schedule-row invoicing. Stripe, receipts, payment reminders, replacement invoices, and payment collection remain future work.

### FB-024 — Price Book / Estimate Item Library Maturity

Status: Started / Partial

Priority: High

Product area:

- Estimates
- Saved charges
- Contractor-owned Price Book
- Trade libraries and reusable assemblies

Summary:
Price Book quick-pick support exists in the estimate composer. Contractors can search active private Price Book items and copy safe item data into normal editable estimate lines. Recent polish clarifies that quantity starts at 1, price/scope should be reviewed, internal notes stay private, and taxable/category metadata remains Price Book metadata for now. Broader maturity remains future.

Future directions:

- Default quantity behavior.
- Taxable/category handling.
- Assemblies and job bundles.
- Margin/profit reminders.
- Invoice quick-pick wiring.
- Role-access decisions for internal pricing metadata.

Current next step:
Continue with one narrow maturity slice at a time. Do not expand into invoice quick-pick, default quantity schema, taxable/category propagation, assemblies/job bundles, or role-access redesign without a separate audit and approval.

### FB-025 — Job-Centered Communication + Notifications

Status: Started / Partial

Priority: High

Product area:

- Workflow messages
- Jobs
- Service requests
- Activity timeline
- Notifications

Summary:
FB-025 now has a workflow-scoped SQL/RLS foundation, job-centered message thread UI, derived Activity timeline display, durable event writers for selected lifecycle RPCs, durable Activity reader merge, first in-app job-message indicators backed by existing `workflow_messages` and `workflow_thread_reads` read-marker behavior, and a gated `send-notification-email` Edge Function foundation for a narrow allowlist of existing in-app notification event types. This does not mean broad chat, Activity unread indicators, SMS/text, push, marketing email, or uncontrolled external delivery is live.

Current guardrails:

- Keep communication tied to eligible workflow contexts.
- Preserve homeowner control.
- Do not add contractor cold outreach.
- In-app notifications remain the source of truth.
- Do not claim email/SMS/push notification delivery is broadly live; the email path remains globally gated and requires separate env/provider/webhook approval before any production send behavior.
- Current email allowlist is limited to existing `public.notifications` rows for homeowner requests, appointment confirmed/cancelled, estimate sent/accepted/declined, and invoice sent. Appointment reschedule email remains deferred until there is a clean in-app notification source/hook; Home Access invite email remains on the separate FB-030 disabled-delivery foundation.
- Keep current job-message indicators visual/in-app only; do not expand them into notifications, Activity unread, or permission changes without a separate approved slice.

Current next step:
Plan broader unread strategy only after beta feedback on job-message indicators, then consider request-message bridge strategy, broader estimate/invoice communication, durable email delivery logs, and separately approved sandbox email activation evidence.

### FB-026 — Review + Referral Flow

Status: Started / Partial

Priority: High

Product area:

- Discover
- Contractor profiles
- Completed jobs
- Trust/referrals

Summary:
ServSync needs trust-building flows, but reviews/referrals are not implemented as a complete product surface. Existing partial review surfaces let homeowners leave ServSync reviews for eligible closed requests, preserve party-visible review context where existing request-card data supports it, and keep contractor-provided external review links separate from ServSync reviews. Review writes are intended to flow through guarded RPC logic rather than direct browser table writes. Public ServSync review averages, counts, kudos, and snippets are paused during beta until moderation/public-display policy is approved. A moderation SQL/RPC foundation now defaults reviews to pending moderation and gives platform admins a guarded backend moderation boundary plus an internal admin UI for review status and note updates, but approved-only public display is not live yet. Homeowner review form copy now reflects that optional display details may be reviewed before any future public display. This should avoid fake ratings, paid ranking, pay-to-play placement, premature badges, or claims that external reviews are imported or verified by ServSync.

Current next step:
Contractor-to-contractor referral core loop is closed out through PR #192: production-applied foundation SQL/RLS/RPC, contractor submit UI, and platform-admin manual tracking UI. Defer email/outreach delivery, public referral links, rewards/credits, billing, homeowner recommendations/referrals, Google review handoff, badges/awards, contractor disputes/responses, signup attribution, contractor permissions/team access, account/profile creation, matching automation, and any Discover ranking changes to later approved slices.

Contractor-to-contractor referral foundation:

- Adds the production-applied `servsync_referral_invites` backend table for typed referral/invite leads, initially constrained to `contractor_refers_contractor`.
- Adds RPC boundaries for contractor owner/admin/office submission and platform-admin listing/update.
- Slice 2 adds a compact contractor `Invites & Referrals` submit card for eligible contractor owner/admin/office users to send another contractor's details to the ServSync team for follow-up.
- Slice 3A adds a distinct platform-admin `Contractor-to-Contractor Referrals` tracking card inside the existing admin `Referrals` tab, using only the existing admin list/update RPCs for manual status, notes, and outreach-date/count tracking.
- Contractor `Invites & Referrals` copy now labels the existing one-time links and permanent QR as homeowner/customer invite flows so they stay distinct from contractor-to-contractor referrals.
- Keeps contractor referral leads separate from `homeowner_contractor_invite_leads`, `referrals`, `referral_codes`, `contractor_invites`, `contractor_team_invites`, Home Access invite tables, service requests, connection requests, and contractor-team access.
- No public landing page, email/SMS/push delivery, rewards, credits, subscriptions, billing, paywalls, automatic contractor profile creation, account creation, contractor-to-contractor permissions, contractor team access, homeowner connection, service request, job, estimate, invoice, notification, or workflow automation is included.
- Outreach/email, rewards/credits, public referral links, signup attribution, matching, account/profile creation, and permission/team-access behavior require separate approval.

### FB-027 — Contractor Pipeline / Follow-Up Lite

Status: Started / Partial

Priority: Medium-High

Product area:

- Contractor dashboard
- Requests
- Estimates
- Jobs
- Invoices
- Follow-up queues

Summary:
Contractors need simple visibility into what needs follow-up. A lightweight foundation now exists in the contractor dashboard through the `Workflow overview` card and conditional `Needs review` strip. It derives attention counts from already-loaded workflow state, including homeowner connection/calendar requests, contractor request follow-up, accepted estimates without linked jobs, draft/overdue/partially-paid invoice records, completed/closed jobs that appear ready for invoice follow-up, and profile setup. The accepted-estimates handoff now sends contractors straight to Jobs -> Estimates with the Approved filter and stale filters cleared, and accepted estimate cards distinguish `Ready for job` from `Job created` while keeping Create/View Job as the primary action. The contractor Jobs workspace now uses in-section header tabs for `Overview`, `Estimates`, `Invoices`, `Jobs & Reports`, and `Templates` so the left sidebar remains a major-section navigator while Jobs sub-views are organized inside the section. The Estimates and Invoices tabs now have compact search, status filter, and sort controls so contractors can find customer/property/title/scope records, filter common estimate/invoice statuses, and sort by updated date, created date, amount, customer, and invoice due date where applicable. The contractor draft estimate editor now includes a compact structured `Payment schedule` section for full-on-completion, deposit/final, or custom billing plans, with fixed/percentage amounts, calculated previews, warning-only schedule-total mismatch copy, estimate PDF output for configured schedule rows, and homeowner in-app display in the expanded estimate review before approval. Accepted estimates with structured schedule rows now show compact row-level invoice actions plus an informational schedule-invoice summary: unlinked rows can create one draft invoice through the schedule-row RPC, linked rows show status and can open the loaded invoice, the summary shows created count, schedule total, uninvoiced scheduled amount, and loaded linked-invoice status counts, and voided linked rows show warning-only replacement-not-supported copy. Draft/sent/non-accepted schedules remain read-only until homeowner approval. Legacy/no-schedule saved estimates still offer `Create invoice from estimate`, opening the existing editable invoice composer with supported estimate context and line items copied by default. This gives ordinary service work an estimate-led path into invoice drafting without changing estimate status, creating a job, filing Home History, changing SQL/RLS/RPCs, adding arbitrary invoice type chooser behavior, or claiming full multi-invoice management. The completed-jobs-ready-to-invoice CTA routes to the existing Closed jobs view and leaves actual invoice creation on job cards/details; completed job rows and detail now clarify the recommended invoice path with compact guidance for item-based versus completed-job fallback invoicing. The invoice-attention CTA routes to the Jobs workspace / Invoices view and uses only the existing status-based draft/overdue/partially-paid invoice attention bucket. Homeowner filed invoice cards now also show a direct `View Home History` next action and compact manual-reminder helper copy once the invoice has been durably filed, including filed invoices that are not paid. This is not a full dedicated follow-up queue yet, and it does not add new lifecycle statuses, SQL/RLS/RPC changes, notifications, broad message aggregation, public review display, direct dashboard job/invoice creation beyond approved schedule rows, payment behavior, automatic reminder/collection behavior, accounting export, or automation.

Current next step:
Use beta feedback to decide whether the next slice should consolidate compact dashboard CTA rows, add stale-estimate rules, refine filtering for existing follow-up surfaces beyond the Jobs Estimates/Invoices list controls, or harden schedule-invoice preview coverage with authenticated sandbox smoke. Keep future work read-only and status-derived where possible. Defer arbitrary invoice type chooser behavior, create-another-invoice behavior beyond schedule rows, replacement invoice behavior for voided linked rows, payment collection, unpaid invoice follow-up beyond existing invoice statuses, broad job-message aggregation, review-request/public-review pipeline work, notification delivery, direct dashboard creation actions, accounting export, reminder/collection behavior, and any new persisted lifecycle statuses until separately audited and approved.

### FB-028 — Accounting Export Foundation

Status: Foundation Started / Future

Priority: Medium

Product area:

- Invoices
- Customers
- Accounting/export

Summary:
QuickBooks/accounting sync is not live. A provider-neutral integration foundation now defines internal-only external object mappings and idempotent integration outbox events so future accounting/export work can avoid rewriting core records or attaching provider-specific IDs directly to business tables. A safer future user-facing step is still export-ready invoice/customer/payment data and CSV-style export before any full accounting integration.

Current next step:
Validate the provider-neutral SQL foundation in sandbox before merge consideration. After that, revisit export-ready invoice/customer/payment data only after invoice reliability and manual payment status workflows are stable. Do not build live accounting sync, provider OAuth, automatic exports, or QuickBooks-specific behavior from this foundation alone.

### FB-029 — Recurring Maintenance / Service Plan Lite

Status: Later / Future

Priority: Medium

Product area:

- Home reminders
- Contractor recurring work
- Homeowner relationships
- Service plans

Summary:
Recurring maintenance/service plan support is future work. Current Home Reminders are manual and in-app only; no recurring reminders, scheduler automation, email/text/push delivery, or service-plan membership automation is live.

Current next step:
Shape manual recurring maintenance opportunities after reminders, scheduling, invoices, and Home History are stronger.

### FB-030 — Shared Home / Home Access

Status: Started / Guarded Partial

Priority: High

Product area:

- Homeowner home sharing
- Home memberships
- Home Access invites
- Shared-home shells
- Shared reminder shells
- Email delivery readiness

Summary:
FB-030 adds the controlled foundation for shared homeowner/home access. Completed slices include home membership tables/RPCs, pending email invite foundations, homeowner Home Access UI, read-only shared-home shells, address-aware shared-home shells, read-only shared reminder shells, a Home Access invite email function scaffold, disabled sandbox/production deployments, disabled UI send wiring, a DB runtime setting contract for future invite email enablement, and Closeout A boundary tests for non-reciprocal/property-scoped access, owner-selector separation, shared-member mutation denial, and revoked membership shell cleanup. Disabled-delivery evidence is now recorded: sandbox ref `zpzdkoaubyjtsomccxya` was verified with the Home Access invite email DB flag `home_access_invite_email_delivery_enabled` set to `enabled=false`, browser/anon runtime-setting reads blocked as expected, mocked disabled Edge Function behavior covered, no real provider call occurred, no invite email was sent, production ref `uqgtheclhxqlnjpfmheq` was avoided, and no runtime setting was toggled.

Current guardrails:

- Production Home Access invite email delivery remains disabled unless a later approved enablement says otherwise.
- Shared homes stay out of owner selectors.
- Shared record access expands one approved surface at a time.
- Service requests, estimates, invoices, jobs, documents, messages, storage, and broader Home History are not broadly shared by default.
- No email/SMS/push delivery should be claimed live from disabled infrastructure.

Current next step:
Use FB-030 Closeout A evidence as the baseline for beta permission boundaries. Choose the next shared-record surface deliberately, or plan controlled invite-email enablement separately with explicit provider/secrets/send approval. Future disabled-only probes should use read-only DB verification or a narrowed test path that does not toggle `servsync_runtime_settings`; the full delivery foundation spec includes runtime-setting toggle/delete cases and should not be used for disabled-only evidence without explicit approval.

### FB-031 — Contractor Beta Billing-Readiness / Entitlement Readiness

Status: Started / Readiness Only

Priority: High

Product area:

- Contractor beta/free billing state
- Founder/future subscription readiness
- Entitlement RPCs
- Platform-admin billing visibility
- Contractor dashboard entitlement consumption

Summary:
FB-031 adds contractor billing-readiness infrastructure without activating billing. Production has `contractor_billing_accounts`, existing contractor backfill as beta/free, future contractor-profile insert trigger, entitlement RPCs, read-only platform-admin visibility, contractor dashboard entitlement loading, non-blocking labels, and limited UI support for future read-only states.

Current guardrails:

- Beta contractors remain free.
- Homeowners remain free and outside contractor billing.
- Stripe checkout, billing portal, payment collection, charging, credit-card requirements, paywalls, and production billing enforcement are not live.
- Contractor entitlement labels are informational.
- Limited read-only UI support is not paid-plan enforcement and does not hide existing records.
- Backend/RPC enforcement and editable billing controls remain future separately approved slices.

Current next step:
Plan any next billing-readiness slice as either admin/readiness polish or a strictly approved backend enforcement audit. Do not start Stripe/payment work without a separate product, legal/ops, and rollout approval.

### FB-032 — Service Agreements Foundation

Status: Foundation Loop Complete / Closeout Polish Pending

Priority: Medium-High

Product area:

- Contractor recurring service agreements
- Maintenance plan templates
- Connected homeowner/property agreement offers
- Agreement status and renewal tracking
- Future planned visits, job links, invoice reminders, renewals, and member indicators

Product goal:
Contractors should eventually be able to create reusable service agreement templates, send property-scoped offers to connected homeowners, let homeowners accept or decline, track pending/active/expired/canceled/renewal-due agreements, and later connect agreement context to visits, jobs, invoices, and customer workflows through explicit links/actions.

Current status:
Slice 1 planning captured the Service Agreements product model and guardrails. Slice 2 merged `servsync-service-agreements-foundation.sql` with the smallest SQL/RLS/RPC foundation for `service_agreement_templates`, `service_agreement_offers`, and `service_agreements`, plus source-static and security-catalog coverage. The SQL foundation has been applied and verified in sandbox and production. Slice 3A adds contractor-side UI: authorized contractor owner/admin/office users can manage templates, create property-scoped draft offers for explicitly shared connected-homeowner properties, and send draft offers. Slice 4A adds homeowner-side offer review, accept/decline through the existing response RPC, and read-only accepted agreement cards inside the homeowner Estimates / Invoices area. This completes the first template -> offer -> homeowner response -> read-only agreement foundation loop. Contractor scheduling and billing remain separate.

MVP guardrails:

- No Stripe/autopay or automatic recurring payments.
- No QuickBooks/accounting sync.
- No legal e-signature integration.
- No automatic renewal.
- No automatic job creation.
- No automatic invoice creation.
- No silent discount or pricing changes inside estimates/invoices.
- No future SQL apply without separate approval.
- No broad shared-home access expansion.
- No SMS, push, marketing email, bulk email, or email delivery expansion.
- No service agreement visits until the core template/offer/accept lifecycle is stable.

Product model:
Service Agreements are their own workflow, separate from service requests, estimates, jobs/inspections, invoices, appointment scheduling, and Home reminders. Future integrations should link to those workflows only through explicit contractor/homeowner-visible actions.

Slice 2 SQL/RLS/RPC direction:

- Contractor owner/admin/office and platform admins can manage templates and offers through RPCs.
- Field tech/viewer roles cannot create pricing-bearing templates or offers.
- Homeowners can select only their own non-draft offers and their own accepted agreements.
- Draft offers are hidden from homeowners.
- Homeowner accept/decline happens through `servsync_homeowner_respond_to_service_agreement_offer`.
- Accepting a sent offer creates exactly one active `service_agreements` row from the offer snapshot.
- Declining a sent offer does not create an agreement.
- Direct browser table writes are denied; authenticated users receive only RLS-scoped select grants.

Recommended implementation sequence:

1. Slice 1: docs-only product/RLS/RPC planning.
2. Slice 2: SQL/RLS/RPC foundation only.
3. Slice 3A: contractor template and offer UI.
4. Slice 4A: homeowner offer review accept/decline UI and read-only agreement display.
5. Future separately approved subtrack: Service Agreement Visits.
6. Future separately approved subtrack: Agreement-to-Job Linking.
7. Future separately approved subtrack: Agreement Invoice Reminders / Draft Invoices.
8. Future separately approved subtrack: Renewals / Cancellations.
9. Future separately approved subtrack: Member Perks / Pricing Indicators.
10. Future separately approved subtrack: Service Agreement Notifications.
11. Future separately approved subtrack: Payment / Autopay Integration.

Relationship to FB-029:
FB-029 remains reminder/service-plan-lite oriented unless the backlog owner later decides to merge or rename it. FB-032 is broader and contractor-agreement centered. Do not claim either feature is live, and do not use FB-032 as approval to add recurring reminders, service-plan billing, subscriptions, recurring invoices, or automatic maintenance automation.

Current next step:
Close out the foundation loop with copy/docs/test alignment. After closeout, pause automation-heavy Service Agreement expansion until a separate backlog item or explicitly approved subtrack is selected; do not add agreement visits, job linking, invoice reminders/drafts, renewals/cancellations, member perks, payments/autopay, reminders, notifications, email/SMS/push, scheduling, Home Timeline writes, or automation without separate approval.

### FB-033 — Project Collaboration

Status: Hidden Foundation In Progress

Priority: Later / Future

Product area:

- Multi-contractor project coordination
- Project parties and individual authority
- Project Lead continuity
- Project event history
- Future Project Board, assignments, and project cost summary

Product goal:
Project Collaboration should eventually let homeowners and contractors coordinate multi-party work around one property without forcing ordinary single-contractor jobs into a project workflow too early. The canonical product reference is `docs/servsync-master-plan/ServSync_Project_Collaboration_Spec_v1.md`.

Current status:
Slice 1 is a hidden SQL/RLS/RPC/types/test/docs foundation only. It creates durable project identity, exactly-one-property association, commercial project parties, individual party memberships, Project Lead authority assignments, append-only project events with structured visibility, and a nullable one-project-per-job association on inspection-backed jobs. Project mutations are disabled by default through `project_collaboration_mutations_enabled` and require a private allowlist. No UI, Beta exposure, production SQL application, production allowlist activation, Project Board, assignments, invitations, pause/close workflow, project billing, financial sharing, estimate/invoice permission changes, or homeowner-led project creation exposure is included.

MVP guardrails:

- Project authority controls ServSync workspace records only; it does not establish legal general-contractor status or control physical work outside ServSync.
- Use Project Lead, not General Contractor, in product-facing language.
- Project membership does not grant estimate or invoice access.
- Project-level authority may never exceed company-level permissions.
- Property ownership does not automatically grant control over a contractor-created project.
- Historical creator, party, authority, and event records must remain durable.
- Runtime gating and allowlisting are required before any mutation RPC can be used.
- Ordinary production users must not be able to use the hidden foundation through direct RPC calls.

Recommended implementation sequence:

1. Slice 1: hidden SQL/RLS/RPC/types/test/docs foundation with runtime gate and private allowlist.
2. Future Slice 2: final audit/sandbox validation and production SQL preparation only after separate approval.
3. Future Slice 3: read-only internal/test project shell if product review approves hidden/internal exposure.
4. Future Slice 4: limited Beta-labeled project UI only after coherent workflow, kill switch, and support guardrails are approved.
5. Future separately approved tracks: invitations, participant management, Project Board, assignments, project calendar, pause/close/reopen, succession, Project Cost Summary, financial-access grants, homeowner-created project subscription, and external integrations.

Current next step:
Finish Slice 1 PR review and sandbox SQL validation. Do not expose Project Collaboration to ordinary production users, do not apply production SQL, and do not add UI or Beta labeling until a separate exposure slice is approved.

### FB-034 — Demo Mode / Marketing Capture Environment

Status: Presentation Controls In Progress

Priority: Medium

Product area:

- Dedicated demo environment
- Marketing screenshots and recordings
- QA and onboarding demo support
- Safe demo seed/reset operations

Product goal:
Demo Mode should provide a reusable, presentation-safe environment for showing real ServSync workflows without confusing demo records with real customer data. It should use dedicated demo identities, realistic fictional data, repeatable scenarios, and deterministic current-looking dates while preserving normal permissions and lifecycle behavior.

Current status:
Slice 1 adds a hidden foundation for a dedicated demo Supabase/Vercel environment. It creates private registry tables for demo scenarios, runs, and resettable records; adds a private Node seed/reset/verify runner; provisions dedicated demo auth identities when run against the dedicated demo project; and seeds a water-heater scenario through homeowner request, contractor estimate, homeowner approval, and accepted-estimate job creation. Slice 2A adds deterministic private checkpoint restore/verify for that same scenario through `job_created`, covering `contractor_discovery_ready`, `connected_request_ready`, `request_ready`, `contractor_review_ready`, `estimate_draft`, `estimate_sent`, `estimate_accepted`, and `job_created`. The discovery checkpoint stops before connection creation so marketing can record Sarah finding Gulf Coast Home Services and sending the existing connection request; the runner can later reset the exact pending demo connection request created during recording. The connected-request checkpoint seeds the active connection and required permission row but stops before the water-heater service request, supporting the homeowner new-request screenshot flow. Slice 2B extends checkpoint restore/verify through lightweight job lifecycle states: `job_scheduled`, `job_in_progress`, `job_review_ready`, and `job_completed`. Slice 2C-A adds frontend-only presentation controls that activate only in the dedicated demo Vercel/Supabase environment, hide setup/checklist/subscription/notification clutter and mutating capture-surface actions, and add presentation-safe checkpoint copy while leaving invoices, Home History, finalized reports, reminders, media, browser checkpoint controls, and reset controls deferred. The runner refuses the known production project and the existing shared sandbox project by default and does not print secrets.

MVP guardrails:

- Demo Mode must use a dedicated demo Supabase project and dedicated demo Vercel environment.
- Demo reset must delete only explicitly registered demo-owned records from an internal allowlist.
- No broad `is_demo` columns are added to core product tables.
- No service-role key may appear in browser code.
- Demo identities and data must be fictional and presentation-safe.
- Production, shared sandbox, external delivery, payments, webhooks, AI, geocoding, media uploads, public demo access, browser checkpoint/reset controls, and deployment remain out of scope.
- Demo Mode is not a public user feature and must not be marketed as live user-facing functionality.

Recommended implementation sequence:

1. Slice 1: dedicated demo registry foundation, private seed/reset/verify runner, water-heater core scenario through job creation, tests, and runbook.
2. Slice 2A: private deterministic checkpoints through job creation, using reset/rebuild behavior and checkpoint-aware verification.
3. Slice 2B: private deterministic job lifecycle checkpoints through lightweight completion, using existing lifecycle behavior where available and no invoice/Home History/report finalization.
4. Slice 2C-A: frontend-only dedicated-demo presentation controls for capture readiness, without exposing service-role actions, reset actions, or checkpoint controls in the browser.
5. Future Slice 2C-B or Slice 3: richer capture presets, optional guided presentation navigation, completed job closeout expansion, invoice, Home History, reminder, documents/media, and broader capture tooling after separate audit.

Current next step:
Review the Slice 2C-A presentation-controls implementation in a dedicated demo preview, then validate that normal production/shared-sandbox behavior remains unchanged and the demo app hides capture clutter only when the strict dedicated-demo presentation guard passes.

### FB-035 — Unified Start New Job Workflow

Status: Slice 2A Hidden Shared Composer Foundation / Production Disabled

Priority: High

Product area:

- Contractor job start workflow
- Estimates, direct jobs, and invoices
- Job scope and work items
- Approval and billing history
- Future shared Draft launch and invoice allocations

Product goal:
Contractors should eventually enter work scope once in a shared Draft composer, choose an intended output, and launch exactly one initial first-class workflow record. The first approved launch outputs are Estimate and Job. Direct Invoice launch is deferred until a later slice approves the billing and duplicate-prevention contract. Outcome-specific validation should happen at the launch boundary while the form remains shared. The goal is to reduce duplicated entry and inconsistent direct-job behavior without weakening approval, billing, duplicate prevention, or homeowner visibility rules.

The approved Draft Launch Principle now governs this backlog item: `A Draft is temporary planning. A workflow begins when the Draft is launched.` Draft is the neutral private starting workspace for contractor work, and future workflow proposals should ask whether they can begin from a Draft instead of introducing another competing creation path. Contextual entry points such as homeowner/customer profile, property/home profile, service request, calendar appointment, prior work, and lead/opportunity surfaces should use `Start New Draft` or `Start Similar Draft` only when existing trusted context can safely prefill the Draft without side effects. `Save Draft` is optional: it is the pause-and-return action, not a prerequisite before choosing an outcome. Future `Create Estimate` and `Create Job` launch actions should persist current composer edits before creating the selected first workflow record, without requiring the contractor to save, leave, and reopen the Draft first. Once launch succeeds, the Draft is consumed and later records are created from the active workflow, not from a permanent active Draft hub.

The shared Draft Composer architecture must separate intended output from work format. Intended output begins with Estimate and Job, while work format must be able to support standard line-item scope and later inspection/checklist scope. Inspection/checklist work should not bypass Draft; the future model is `Start New Draft -> choose work format -> prepare work -> launch as Estimate or Job`. Do not add inspection UI, checklist persistence, inspection templates, inspection SQL, or report-generation changes to the initial shared launch slices without separate approval.

Current status:
Slice 1 is a behavior-preserving frontend foundation only. It extracts neutral work-composer draft types, shared line-item row presentation, line-item/totals helpers, and totals presentation from the existing estimate builder while keeping estimate save/send/draft loading, templates, recipe behavior, payment schedules, PDFs, and homeowner behavior unchanged. It also adds source-level regression guardrails around accepted-estimate-to-job duplicate prevention, partial-invoicing protections, estimate line editing, and the boundary that the future unified Start New Job outcome flow is not active yet.

Backend Slice 2 adds the reviewable SQL/RPC/RLS foundation for persistent contractor-only Draft Jobs and canonical job scope. It keeps Draft Jobs backed by `inspections` with `status='draft'` and `job_status='draft'`, adds explicit Draft Job metadata and activation metadata, evolves `job_work_items` with additive work-state, approval, and location fields, and adds RPCs for creating/updating Draft Jobs, safely upserting scope, and activating a Draft Job to existing operational statuses. This SQL was not applied by the implementation PR; it has since been applied and validated in sandbox and production.

Slice 3 adds the first Draft Job UI persistence/resume layer behind the explicit `VITE_DRAFT_JOB_UI_ENABLED=true` gate. Enabled environments route the existing `Start New Job` entry to a shared Draft Job composer with explicit `Save Draft`, persisted Draft Job IDs, persisted scope-item IDs after successful upsert, partial-save retry handling, and a separate contractor Drafts section that filters only `job_origin='draft_composer'`, `status='draft'`, and `job_status='draft'`. Historical generic inspection drafts are intentionally excluded. Missing, false, or malformed gate values keep the legacy direct operational job form as the default. A rolled-back production UI enablement attempt found composer Draft Jobs could still enter an operational Recent jobs derivation; the correction centralizes `draft_composer` classification and excludes composer Draft Jobs from operational lists, counts, summaries, search/customer-workspace derivations, and ordinary operational action sets regardless of the feature gate. Production is currently serving the legacy Jobs workflow because `VITE_DRAFT_JOB_UI_ENABLED` is absent in Production. The Draft backend SQL/RPC foundation remains installed, and Draft-first Work-module development should continue in sandbox/preview until the redesigned workflow is approved and validated. The blank-resume corrective slice refetches the canonical Draft inspection and related `job_work_items` before opening `Continue Draft`, validates the record is still an exact composer Draft, preserves connected/local customer selections even when active selector options are missing, and keeps supported advanced scope fields visible after resume. Slice 4A adds `Create Job` directly from the current Draft composer state: the frontend persists current metadata and scope first, activates the same inspection through the existing backend RPC only after those saves succeed, and opens the same record as an operational Job while keeping the legacy operational job form available when the Draft UI is enabled. Create Estimate launch is future work that needs durable Draft consumption/linkage; direct Create Invoice launch is deferred until separately approved. Top-level Draft notes remain unsupported until a backend/RPC persistence contract is separately approved.

Contractor Work Dashboard Slice 1 adds the first frontend-only Work-module shell behind a new strict `VITE_CONTRACTOR_WORK_UI_ENABLED=true` gate. When that gate is enabled in sandbox or preview, only the existing Jobs overview body is replaced with an attention-first Work Dashboard that summarizes Drafts to Continue, Active Jobs, accepted Estimates ready to start Work, Billing Attention, compact Upcoming Work, and Job History access. When the gate is absent or false, legacy Jobs remains unchanged. The global sidebar and mobile label remain `Jobs`; no new global route, mobile bottom-navigation item, contextual Draft entry point, Create Estimate outcome, Create Invoice outcome, backend contract, SQL, Supabase setting, Vercel setting, Production environment change, or Production rollout is included.

Shared Draft Composer launch work should use a new default-off `VITE_SHARED_DRAFT_COMPOSER_LAUNCH_ENABLED === 'true'` gate. Work Dashboard and existing Draft gates remain separate. Slice 2A may merge hidden behind the new gate, but it should not be enabled for owner-facing Preview testing as a complete workflow until Slice 2B durable launch foundation and Slice 2C Estimate/Job launch are ready.

Slice 2A adds the hidden frontend shared Draft Composer UI foundation only. It uses the new strict gate, renders at the existing Draft composer path only when the shared gate and existing Draft Job gate are enabled, preserves existing gate-off behavior, reuses existing Draft Job save/resume persistence for supported shared fields, hides top-level notes because they are not durably persisted, keeps intended output session-only, and exposes no Create Estimate, Create Job, Create Invoice, Launch, disabled launch, or pretend launch controls. Production remains on the legacy workflow because no environment gate is enabled.

Slice 2B packages the corrected durable Draft Launch Foundation for review without applying it to sandbox or Production. It proposes dedicated `contractor_work_drafts`, `contractor_work_draft_items`, and private success-only `contractor_work_draft_launches` tables, durable nullable intended output, contractor-private Draft notes, consumed launch state, private-ledger Estimate/Job reverse linkage, stable Draft item IDs, one-successful-launch constraints, contractor-serialized idempotency protection, atomic launch rollback behavior, launch-time relationship revalidation, contractor-only RLS/grants, canonical save/resume RPCs, a public launch RPC, private Estimate/Job launch helpers, and a non-destructive legacy inspection-backed Draft Job import bridge whose intended output defaults to null. Private Draft IDs are not placed on homeowner-readable Estimate or Job rows. Current permission helpers preserve corresponding existing workflow boundaries and do not settle future role policy. The packaged SQL remains hidden and unapplied until another focused audit approves sandbox execution. It exposes no Create Estimate or Create Job UI, no Invoice launch, no inspection/checklist implementation, no Production workflow change, and no Production data or environment changes.

Product decisions:

- Prefer evolving the existing `job_work_items` model into the canonical job-scope model instead of introducing a competing `job_scope_items` table unless later backend analysis proves reuse unsafe.
- User-facing naming should move toward `Start New Draft`, `Start Similar Draft`, `Drafts`, and `Continue Draft`; avoid long-term general use of `Draft Job` when the record has not yet become a job.
- `Save Draft` is the pause-and-return option, not a required step before direct outcome selection. `Create Job` now follows that model in code by persisting the current Draft state before activation; future Create Estimate launch should do the same before creating the proposal snapshot, consuming the Draft, and continuing into the Estimate workflow. Direct Draft-to-Invoice launch remains deferred.
- Do not expose a selectable Estimate intent that cannot launch, disabled Create Estimate controls presented as product behavior, or a Job-only shared composer that implies Estimate support is complete.
- The first coherent owner-facing Preview validation should include shared Draft Composer, Estimate intent, Job intent, Create Estimate, Create Job, Draft consumption, duplicate prevention, resume behavior, and workflow navigation.
- Contextual Draft starts must not create estimates, activate jobs, create invoices, create appointments, send notifications, create customer-facing activity, create billing activity, or expose Drafts to homeowners.
- Offline approval attachments are not required for the first version; record approver, time, method, and optional note.
- Billing incomplete line items is allowed with explicit confirmation; work status and billing action history must remain separate.
- Draft Jobs are contractor-only until an estimate is sent, a job is activated/shared, or an invoice is sent.
- Current Estimate, Job, and Draft creation checks remain compatibility boundaries with the corresponding existing workflows. Detailed employee roles and configurable company permissions are not finalized here; Slice 2B does not add a role-name-based prohibition or broaden current creation authority. View-only users remain unable to mutate unless an existing corresponding creation flow already permits it.
- Work state, approval state, and billing state should remain separate. Billing state should be derived primarily from invoice allocations and payment records rather than maintained as a freely editable scope-item status.

Guardrails:

- Do not reapply Draft Job SQL, add outcome buttons, replace direct-job creation, add estimate-from-existing-job, additional-work approval, deposit/progress/final billing changes, amount-only progress invoices, invoice allocation rewrites, revision history, reopening, audit-history tables, paid-invoice changes, or production configuration changes without separate approval.
- Do not introduce competing `draft_jobs`, `work_records`, or `job_scope_items` tables unless a later audit proves reuse unsafe.
- Do not claim the unified Start New Job workflow is live until the production composer, backend model, and outcome actions ship.
- Do not claim the shared Draft Composer launch workflow is Preview-ready until both Estimate and Job launch work through durable launch contracts.
- Existing accepted-estimate-to-job duplicate prevention is a critical protected behavior.
- Existing direct job creation remains live until an approved removal slice.

Recommended implementation sequence:

1. Add regression and lifecycle guardrails, extract reusable composer presentation, and introduce neutral draft types.
2. Add the Draft Job and canonical-scope backend foundation on `inspections` and `job_work_items`.
3. Apply the approved backend foundation SQL to the intended environment after final audit/approval.
4. Add persistent contractor-only Draft Job UI save/resume behavior.
4a. Keep composer Draft Jobs out of operational lists/actions before any production UI enablement.
4b. Plan the Jobs landing and contextual `Start New Draft` entry points against the Draft Launch Principle and Product Information Architecture before adding more creation buttons.
4c. Merge/deploy/validate the blank Draft resume correction without broadening into outcome actions.
5. Slice 2A: add the hidden shared Draft Composer UI foundation behind `VITE_SHARED_DRAFT_COMPOSER_LAUNCH_ENABLED`, including Estimate/Job intended output session state, shared supported fields, Save Draft/resume through existing Draft Job persistence, outcome-specific containers, and no visible unfinished launch actions.
6. Slice 2B: add the durable Draft Launch Foundation, including persisted intended output, supported notes, consumed state, launched output type/id, launched timestamp/user, private-ledger reverse linkage, duplicate-launch prevention, idempotency, atomic transaction boundaries, rollback behavior, consumed Draft exclusion, RLS/grants/RPC contracts, and sandbox-first SQL validation. This corrected implementation package requires another focused read-only audit, and the SQL remains unapplied until owner approval.
7. Slice 2C: connect the shared Draft Composer to both complete launch outcomes together: Create Estimate and Create Job. This is the first coherent owner-facing Preview workflow.
8. Slice 2D: add contextual starts and workflow handoffs such as Service Request -> Draft with Estimate default, accepted Estimate -> Job, Customer/Property -> Draft, Calendar -> Draft, Template -> Draft, Job -> later Estimate, and Estimate -> later Job.
9. Slice 2E: migrate legacy paths only after parity is proven and preserve valid direct paths until end-to-end approval.
10. Later: add Job/Estimate-to-Invoice workflow wiring, direct Invoice exceptions if approved, partial billing, payment schedules, workflow linkage, and financial permissions.
11. Later: add invoice allocation, deposit, itemized progress, amount-only progress, final reconciliation, document revisions, comprehensive history, explicit reopening, and legacy direct-job retirement only after approval.

Current next step:
Perform another focused read-only audit of the corrected Slice 2B draft PR and SQL before authorizing sandbox application. Do not re-enable the Production Draft UI, enable a half-complete shared composer for ordinary Preview users, ship Create Estimate without durable launch/consumption approval, ship direct Draft-to-Invoice launch, add invoice allocation changes, replace direct-job creation, add additional contextual Draft entry points, rename global navigation, add a Work route, or add mobile navigation items until separately approved.

## Current next recommended focus

1. FB-020 follow-up readiness: controlled private beta baseline is met; decide the full data/auth restore path after the first schema-only restore drill, plus storage restore, backup/PITR verification, optional stable smoke records, optional role smoke credentials, public go-live readiness, and paid-subscription readiness when needed.
2. FB-024 Price Book maturity, one narrow slice at a time.
3. FB-025 unread indicators or scoped communication/Activity follow-up; FB-021 durable reschedule/cancel Activity rows are already merged and SQL-applied to sandbox/production.
4. FB-026 review/referral flow audit after core request-to-job confidence improves.
5. FB-021 optional follow-up only if beta feedback needs richer appointment event/history UI, broader safe appointment history display, or targeted lifecycle/test hardening.

## Update rules

- Update this document when a feature direction, priority, workflow definition, or feature status changes.
- When a feature moves into audit, update its status to `Audit In Progress`.
- When Codex returns an audit and the user approves implementation, update its status to `Ready for Implementation` or `Implementation In Progress`.
- When a PR is opened, add the PR number/link only after it exists. Do not invent PR numbers.
- When implementation is completed and merged/confirmed, update status to `Completed / Functional`.
- If a feature is deferred, mark it `Paused` or `Later / Future`.
- If a feature is rejected, mark it `Rejected / Not Pursuing` and preserve the reason.
- Keep roadmap ideas separate from implemented features.
- Do not use this document as proof that a feature is live.
- Keep this document concise enough to remain usable. Detailed research and implementation reports should live in separate docs or PRs when needed.
