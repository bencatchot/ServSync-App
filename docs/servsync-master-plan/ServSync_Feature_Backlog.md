# ServSync Feature Backlog

Last updated: 2026-07-04

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
| FB-007 | Trade-Specific Estimate / Pre-Visit Checklists | Estimates, inspections, homeowner intake, templates | Started / Partial | High | Guided Estimate Draft Builder Slices A-E add a focused estimate start flow with saved-template, guided-builder, and blank-start choices; trade, work type, labor style, rough scope, top recipe-match preview, general fallback, collapsed reference tools, inline contractor-private customer creation, first-class contractor-owned saved-template starts, a Save as template modal with structure-only versus structure-and-pricing choices, and removal of visible standalone Advanced Trade Tools while preserving useful deck/plumbing/electrical guidance in the guided builder/helper path. The first pressure washing / exterior cleaning recipe family adds price-free service bundles for common residential and small-commercial cleaning scopes while keeping runoff, chemical, grease, and local-code-sensitive work contractor-reviewed. Future work should keep broader recipe-library expansion and homeowner pre-visit checklist work separate. |
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
| FB-023 | Contractor Payment Collection / Deposits | Invoices, estimates, payments | Later / Future | High | Revisit after invoice reliability, partial invoicing, pricing, legal/ops, and Stripe plans are approved. Do not claim card/ACH, deposits, receipts, reminders, or payment status automation as live. |
| FB-024 | Price Book / Estimate Item Library Maturity | Estimates, saved charges, trade libraries, contractor pricing | Started / Partial | High | Price Book quick-pick exists with clearer estimate-line copy and privacy regression coverage. Future maturity includes default quantity, taxable/category handling, assemblies/job bundles, margin reminders, invoice quick-pick wiring, and role-access decisions for internal pricing metadata. |
| FB-025 | Job-Centered Communication + Notifications | Messaging, service requests, jobs, invoices, Activity | Started / Partial | High | Workflow message foundations, job message UI, derived/durable Activity timeline writers/readers, first in-app job-message indicators using existing thread read markers, and a gated `send-notification-email` foundation for a narrow allowlist of existing `public.notifications` event types are merged. In-app notifications remain the source of truth; production email delivery still requires separate env/provider/webhook approval. Future work includes broader unread strategy, request-message migration, broader estimate/invoice communication, optional attachments, durable delivery logs, and notification delivery activation planning. |
| FB-026 | Review + Referral Flow | Discover, contractor profiles, completed jobs, trust | Started / Partial | High | Existing ServSync review capture is hardened around completed-work eligibility, private party visibility, external-review separation, review table/function grant posture, pending moderation SQL/RPC foundation, and an internal platform-admin moderation UI. The contractor-to-contractor referral foundation is merged and production-applied for `contractor_refers_contractor` referral invite leads, kept separate from homeowner invite leads, contractor-homeowner invites, reward referrals, contractor team invites, connection requests, service requests, billing, and email. Slice 2 adds a contractor owner/admin/office submit UI using the existing RPC for ServSync team follow-up, and Slice 3A adds platform-admin manual tracking UI using the existing admin RPCs. Public ServSync review averages, counts, kudos, and snippets remain paused during beta; admin approval records moderation status only and does not publish reviews publicly yet. Future work includes approved-only public display/public-rating policy, referral outreach/product decisions, and optional Google review handoff. No fake ratings, paid ranking, rewards, credits, billing, paywalls, automatic outreach, public referral links, contractor-to-contractor permissions, team access, account/profile creation, or premature badges. |
| FB-027 | Contractor Pipeline / Follow-Up Lite | Estimates, requests, reminders, contractor dashboard | Started / Partial | Medium-High | Contractor dashboard now has a lightweight `Workflow overview` / `Needs review` summary derived from existing loaded request, appointment, accepted-estimate, invoice, and profile setup state, plus compact navigation-only CTAs for accepted estimates needing jobs, completed/closed jobs ready to invoice, and status-based invoice attention. Future slices should separately consider stale estimates, fuller filtering/queue needs, CTA consolidation, and review-related follow-up only after moderation/public-display policy matures. |
| FB-028 | Accounting Export Foundation | Invoices, customers, accounting | Later / Future | Medium | Start with export-ready invoice/customer/payment data and CSV-style export before QuickBooks sync. Do not build or market full accounting sync. |
| FB-029 | Recurring Maintenance / Service Plan Lite | Home reminders, contractor recurring work, homeowner relationships | Later / Future | Medium | Shape after reminders, scheduling, invoices, and Home History are stronger. Start with manual recurring opportunities, not complex memberships or automated reminder delivery. |
| FB-030 | Shared Home / Home Access | Homeowner access, shared homes, invites, reminders, permissions | Started / Guarded Partial | High | Home membership foundations, shared-home shells, shared reminder shells, invite UI, disabled email function deployment, DB delivery-enable contract, and Closeout A permission-boundary tests are merged/applied. Production invite email delivery remains disabled; shared record access expands only one approved surface at a time. |
| FB-031 | Contractor Beta Billing-Readiness / Entitlement Readiness | Contractor billing readiness, entitlements, admin visibility, future subscription prep | Started / Readiness Only | High | DB billing accounts, entitlement RPCs, admin read-only visibility, contractor entitlement loading, labels, and limited read-only UI support are merged/applied. Beta contractors remain free; no Stripe, checkout, payment collection, paywalls, billing enforcement, or editable billing controls are live. |
| FB-032 | Service Agreements Foundation | Contractor maintenance plans, connected homes, agreement offers, renewals | Foundation Loop Complete / Closeout Polish Pending | Medium-High | The core foundation loop is complete: Slice 2 SQL/RLS/RPC foundation is merged and production-applied, Slice 3A adds contractor-side template/offer UI, and Slice 4A adds homeowner offer review, accept/decline, and read-only active agreement display. Service Agreements remain separate from requests, estimates, jobs, invoices, scheduling, reminders, notifications, payments, renewals, and external delivery. |

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
Use the existing saved charges, estimate templates, and private Custom Pricing / Pricing Library workflow in controlled beta. CSV import now has focused regression coverage for preview-before-import, row/file limits, required title validation, invalid/negative price blocking, blank price versus `$0`, warning-only line-type fallback, warning-only duplicate detection, valid-row-only import, add-only insert behavior, estimate-only Price Book quick-pick, and homeowner/invoice privacy boundaries. Future work should keep invoice quick-pick, smart dedupe/overwrite, XLSX/PDF/AI import cleanup, default quantity/tax/category propagation, and broader trade-library or FB-007 checklist work separate.

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
- Estimate Builder Cleanup E removes visible standalone Advanced Trade Tools from Reference tools so contractors are not routed into a competing deck/plumbing/electrical calculator path. Saved Charges, Price Book, Estimate Templates, and Estimate Helper remain reachable; useful deck/plumbing/electrical estimating guidance is preserved in the guided fallback/helper path, including a deterministic, price-free deck board material allowance helper for rough deck scopes with dimensions.
- This does not complete full trade-specific estimate/pre-visit checklist coverage.

Current next step:
Validate the estimate start-choice, Save as template modal, and Advanced Trade Tools cleanup with connected homeowners, contractor-private local customers, and inline-created local customers in preview/beta. Keep broader recipe-library expansion, homeowner pre-visit checklist work, pricing suggestions, recipe catalog UX, and trade-coverage expansion separately approved.

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

Status: Later / Future

Purpose:
Potentially allow contractors to connect invoices/customers/payments with QuickBooks later.

Guardrails:

- Do not build before invoice/payment workflow is stable.
- Do not overclaim accounting support.
- Requires Intuit/QuickBooks approval/research.
- Should remain optional for contractors.
- ServSync should not become full accounting software.

### FB-014 — Payments / Stripe

Status: Later / Future

Purpose:
Allow homeowners to pay invoices through ServSync later.

Guardrails:

- Payment collection currently happens outside ServSync.
- Do not claim in-app payments are live.
- Manual mark-paid may exist, but that is not payment processing.
- Stripe should come after invoice workflow is tested.

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
Contractor payment collection, deposits, card/ACH handling, receipts, and payment reminders are not live. Existing billing-readiness work under FB-031 is entitlement/planning infrastructure only and does not activate Stripe, checkout, payment collection, billing enforcement, or paywalls.

Current next step:
Revisit after invoice reliability, partial invoicing, pricing, legal/ops, and Stripe rollout plans are approved.

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
Contractors need simple visibility into what needs follow-up. A lightweight foundation now exists in the contractor dashboard through the `Workflow overview` card and conditional `Needs review` strip. It derives attention counts from already-loaded workflow state, including homeowner connection/calendar requests, contractor request follow-up, accepted estimates without linked jobs, draft/overdue/partially-paid invoice records, completed/closed jobs that appear ready for invoice follow-up, and profile setup. The accepted-estimates-needing-jobs dashboard CTA routes contractors to the existing Jobs workspace / Open estimates-invoices view where the established estimate-card `Create Job` / `View Job` controls live. The completed-jobs-ready-to-invoice CTA routes to the existing Closed jobs view and leaves actual invoice creation on job cards/details. The invoice-attention CTA routes to the existing Open estimates/invoices financial view and uses only the existing status-based draft/overdue/partially-paid invoice attention bucket. This is not a full dedicated follow-up queue yet, and it does not add new lifecycle statuses, SQL/RLS/RPC changes, notifications, broad message aggregation, public review display, direct dashboard job/invoice creation, payment behavior, reminder/collection behavior, accounting export, or automation.

Current next step:
Use beta feedback to decide whether the next slice should consolidate the compact dashboard CTA rows, add stale-estimate rules, or refine filtering for existing follow-up surfaces. Keep future work read-only and status-derived where possible. Defer unpaid invoice follow-up beyond existing invoice statuses, broad job-message aggregation, review-request/public-review pipeline work, notification delivery, direct dashboard creation actions, payment/deposit behavior, accounting export, reminder/collection behavior, and any new persisted lifecycle statuses until separately audited and approved.

### FB-028 — Accounting Export Foundation

Status: Later / Future

Priority: Medium

Product area:

- Invoices
- Customers
- Accounting/export

Summary:
QuickBooks/accounting sync is not live. A safer future step is export-ready invoice/customer/payment data and CSV-style export before any full accounting integration.

Current next step:
Revisit after invoice reliability and manual payment status workflows are stable.

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
