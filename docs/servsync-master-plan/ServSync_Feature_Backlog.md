# ServSync Feature Backlog

Last updated: 2026-07-01

Last reconciled through PR #145 / merge commit `4ef3be8`.

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
| FB-002 | Contractor Estimate Defaults & Templates | Contractor tools, estimates, saved charges, templates, Custom Pricing | Completed / Functional; Needs Testing | High | Validate Custom Pricing CSV import preview/sandbox behavior; estimate/invoice quick-pick integration remains future. |
| FB-003 | Contextual Connection Request Flow with Multi-Property Permission Access | Connections, permissions, property sharing | Completed / Functional | High | Follow-up testing of permission enforcement and contractor visibility. |
| FB-004 | Contractor Reports | Reports, operations, contractor visibility | Backlog | Medium | Hold until estimate/job/invoice statuses are reliable. |
| FB-005 | Awards / Contractor Recognition Badges | Contractor profile, recognition, marketplace trust | Later / Future | Low | Revisit after real platform activity exists. |
| FB-006 | Contractor Auto-Scheduling | Scheduling, appointments, calendar | Later / Future | Medium | Refine after calendar/appointment workflow stabilizes. |
| FB-007 | Trade-Specific Estimate / Pre-Visit Checklists | Estimates, inspections, homeowner intake, templates | Backlog | High | Review the Estimate Draft Library path-flow foundation v1 after PR validation; broader trade libraries and homeowner pre-visit checklist work remain future. |
| FB-008 | Discover Engagement Filter / Recently Active Contractors | Discover, contractor visibility | Later / Future | Low | Revisit after Discover has real contractor activity. |
| FB-009 | Discover Feed Strategy | Discover, marketplace, contractor content | Backlog | Medium | Future audit after core beta workflow confidence improves. |
| FB-010 | General Homeowner-Contractor Messaging | Messaging, connections, service requests | Later / Future | Medium | Revisit after contextual connection flow is tested. |
| FB-011 | Mobile Workflow Polish | Mobile/responsive UX, field workflow | Started / Partial | High | First frontend-only polish pass improves mobile stacking, action hierarchy, spacing, and scanability across request cards, scheduling controls, estimate/Price Book areas, job/work-item cards, invoice cards, Activity timeline, Home Access cards, and entitlement labels. Continue mobile QA with real beta fixtures; native apps, backend changes, lifecycle changes, notifications, payments, and calendar sync remain out of scope. |
| FB-011A | Backlog-Aware Partial Invoicing | Jobs, work items, invoices, backlog closeout | Job Summary Badges In Progress | High | Phase 1 adds SQL/type/test foundation for durable job work items, invoice line linkage, backlog snapshots, and a guarded partial-invoice RPC. Phase 2A wires durable work items into contractor job detail when rows exist, creates draft invoices from selected completed/priced items, and displays backlog snapshots separately on contractor/homeowner invoice views and PDFs. Phase 2B-1 seeds durable work items from accepted estimate lines. Phase 2B-2 syncs simple service `Work Items` tasks into durable source-backed work items. Phase 2C-1 adds contractor-created manual work items with safe unbilled-only edit/remove rules. The guardrail slice keeps whole-job invoicing available for legacy/no-work-item jobs while steering work-item-backed jobs to item-based invoicing and adding SQL protection against bypassing durable work-item billing safety. The current frontend-only UX slice adds derived contractor job badges/counts for ready-to-invoice, price-required, backlog-open, partially invoiced, fully invoiced, and no-billable-item states without adding new persisted job statuses. Broad legacy backfill, general inspection finding conversion, homeowner-facing job summaries, and broader closeout UI remain future approval-gated slices. |
| FB-012 | Push Notifications | Notifications, mobile, workflow events | Later / Future | Medium | Do not claim live unless confirmed; revisit after stable core workflows. |
| FB-013 | QuickBooks / Accounting Integration | Accounting, invoices, integrations | Later / Future | Medium | Research later after invoice/payment workflow stabilizes. |
| FB-014 | Payments / Stripe | Payments, invoices | Later / Future | Medium | Keep payments/Stripe future-facing despite FB-031 billing-readiness work; revisit only after invoice reliability, pricing, legal/ops, and Stripe rollout plans are approved. |
| FB-015 | Native Mobile Apps | iOS/Android, field workflow | Later / Future | Medium | Validate responsive web first; evaluate Capacitor vs React Native/Expo later. |
| FB-016 | PDF / Storage Strategy Audit | Storage, PDFs, media, records | Backlog | Medium | Future technical audit. |
| FB-017 | Pricing Levels / Feature Tier Direction | Pricing, packaging, plan strategy | Brainstorming | High | Use FB-031 entitlement readiness as planning input, but do not imply billing, paywalls, checkout, or Stripe are active. |
| FB-018 | Estimate Helper v1 | Contractor tools, estimates, scope/revenue suggestion support | Completed / Functional | High | Passed implementation validation, Vercel preview smoke, and user preview review; ready for merge after final PR checks. |
| FB-019 | Estimate Labor Model / Line-Specific Labor Inputs | Contractor tools, estimates, invoices, pricing UX | Completed / Functional | High | v1 is complete: schema foundation and RPC/conversion preservation are merged and applied to sandbox/production; app/UI labor support and Build Estimate Draft labor cleanup are merged and passing preview. |
| FB-020 | Security, Records Reliability, Backup/Restore, and Scale Readiness | Security, RLS, storage, records, operations, performance | Major Progress / Backlog | High | Continue as an umbrella readiness program. Public smoke, security catalog, credential readiness, backup/restore templates, artifact guardrails, and restore-drill planning have advanced; production smoke credentials/records and an executed restore drill remain open. |
| FB-021 | Scheduling + Appointment Confirmation Foundation | Scheduling, service requests, jobs, homeowner visibility | v1 Closeout Complete / Follow-up Backlog | High | v1 now covers the SQL/RPC/RLS foundation, read display, contractor 1-3 window proposals, homeowner accept/decline, confirmed appointment visibility, contractor replacement reschedule, contractor appointment cancel, and compact appointment-state helper copy. Future follow-ups should focus on durable Activity rows for rescheduled/canceled appointments, richer safe history UI, and a full sandbox-mutating probe run with approved sandbox env, while keeping calendar sync, dispatch/routing, GPS, email/SMS/push reminders, notification delivery, and homeowner-forced booking out of scope. |
| FB-022 | Online Booking / Request-to-Booking Flow | Homeowner service requests, contractor intake, scheduling | Backlog | High | Treat true online/self-booking as later. Use FB-021 as the safer contractor-controlled appointment proposal foundation before any booking workflow. |
| FB-023 | Contractor Payment Collection / Deposits | Invoices, estimates, payments | Later / Future | High | Revisit after invoice reliability, partial invoicing, pricing, legal/ops, and Stripe plans are approved. Do not claim card/ACH, deposits, receipts, reminders, or payment status automation as live. |
| FB-024 | Price Book / Estimate Item Library Maturity | Estimates, saved charges, trade libraries, contractor pricing | Started / Partial | High | Price Book quick-pick exists with clearer estimate-line copy and privacy regression coverage. Future maturity includes default quantity, taxable/category handling, assemblies/job bundles, margin reminders, invoice quick-pick wiring, and role-access decisions for internal pricing metadata. |
| FB-025 | Job-Centered Communication + Notifications | Messaging, service requests, jobs, invoices, Activity | Started / Partial | High | Workflow message foundations, job message UI, derived/durable Activity timeline writers/readers, and first in-app job-message indicators using existing thread read markers are merged. Future work includes broader unread strategy, request-message migration, broader estimate/invoice communication, optional attachments, and notification delivery planning. |
| FB-026 | Review + Referral Flow | Discover, contractor profiles, completed jobs, trust | Started / Partial | High | Existing ServSync review capture is hardened around completed-work eligibility, private party visibility, external-review separation, review table/function grant posture, pending moderation SQL/RPC foundation, and an internal platform-admin moderation UI. Public ServSync review averages, counts, kudos, and snippets remain paused during beta; admin approval records moderation status only and does not publish reviews publicly yet. Future work includes approved-only public display/public-rating policy, recommendation/referral product decisions, and optional Google review handoff. No fake ratings, paid ranking, or premature badges. |
| FB-027 | Contractor Pipeline / Follow-Up Lite | Estimates, requests, reminders, contractor dashboard | Started / Partial | Medium-High | Contractor dashboard now has a lightweight `Workflow overview` / `Needs review` summary derived from existing loaded request, appointment, accepted-estimate, invoice, and profile setup state, plus a compact accepted-estimates-needing-jobs CTA that routes to existing estimate-card `Create Job` / `View Job` controls. Future slices should separately consider completed jobs needing invoices, stale estimates, unpaid invoice nuance, and review-related follow-up only after moderation/public-display policy matures. |
| FB-028 | Accounting Export Foundation | Invoices, customers, accounting | Later / Future | Medium | Start with export-ready invoice/customer/payment data and CSV-style export before QuickBooks sync. Do not build or market full accounting sync. |
| FB-029 | Recurring Maintenance / Service Plan Lite | Home reminders, contractor recurring work, homeowner relationships | Later / Future | Medium | Shape after reminders, scheduling, invoices, and Home History are stronger. Start with manual recurring opportunities, not complex memberships or automated reminder delivery. |
| FB-030 | Shared Home / Home Access | Homeowner access, shared homes, invites, reminders, permissions | Started / Guarded Partial | High | Home membership foundations, shared-home shells, shared reminder shells, invite UI, disabled email function deployment, and DB delivery-enable contract are merged/applied. Production invite email delivery remains disabled; shared record access expands only one approved surface at a time. |
| FB-031 | Contractor Beta Billing-Readiness / Entitlement Readiness | Contractor billing readiness, entitlements, admin visibility, future subscription prep | Started / Readiness Only | High | DB billing accounts, entitlement RPCs, admin read-only visibility, contractor entitlement loading, labels, and limited read-only UI support are merged/applied. Beta contractors remain free; no Stripe, checkout, payment collection, paywalls, billing enforcement, or editable billing controls are live. |

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

Status: Completed / Functional; Needs Testing

Priority: High

Product area:

- Contractor tools
- Estimate workflow
- Estimate templates
- Saved estimate charges

Summary:
Contractors can save recurring estimate charges and estimate templates so they do not have to rebuild common estimates from scratch.

Current next step:
Validate the Custom Pricing / Pricing Library CSV import path after preview/sandbox review. Estimate/invoice quick-pick integration remains a separate future slice.

Key decisions:

- The current feature was recommended by Codex/ChatGPT but has not been personally/manual tested by the user yet.
- Saved charges should not auto-load into every estimate.
- Contractors should choose saved charges from a quick-pick list.
- Labor should support flat labor charges and hourly rate × estimated hours.
- Contractors should be able to create multiple estimate templates.
- Templates can be organized by service type or common job type.
- Copied line items must remain editable/removable per estimate.
- Homeowners only see final estimate line items, not internal templates.
- Contractors should be able to save an estimate they create as a reusable template.
- Custom Pricing / Pricing Library v1 should remain a private contractor-owned price-book foundation; CSV import may add new private items, but separate approval is still required before wiring those items into estimates, invoices, XLSX/PDF imports, AI cleanup, or automation.

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

Status: Completed / Functional

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

- Multi-property homeowner connection request
- Per-property permission enforcement
- Copy-permissions UI behavior
- Contractor visibility with one shared property vs multiple properties
- Contractor cannot see unshared properties
- Contractor cannot see unshared permission categories
- Open Jobs/Estimates/Invoices routes to existing records
- Homeowner History uses existing completed/closed records

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
- v1 starts with one HVAC replacement proof bundle only.
- The library is price-free and does not replace contractor review.
- Existing Build Estimate Draft fallback behavior must remain in place whenever no matching bundle exists.
- This does not complete full trade-specific estimate/pre-visit checklist coverage.

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

Status: Backlog

Priority: High

Purpose:
Improve mobile usability for field use and homeowner convenience.

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

Status: Major Progress / Backlog

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

- Current confidence is medium for many app security foundations, low for backup/restore readiness, low for deletion/retention/export readiness, medium-low for 1,000-user performance readiness, and low for public go-live readiness.
- Existing foundations include browser-safe Supabase client usage, RLS foundation, private home document bucket design, private media storage policies, signed URL display paths, RLS/storage tests, sign-out local storage cleanup, and duplicate prevention for invoice-to-Home-History filing.
- Gaps include deployed-state verification, SECURITY DEFINER/RPC authorization audit, backup/restore runbooks, storage-object backup strategy, dependency audit vulnerabilities, public-media guardrails, orphan/broken storage-object handling, unpaginated growing lists, and immutable/auditable record snapshots.

Progress through PR #145:

- Public production smoke and smoke-readiness docs exist.
- Security catalog coverage and selected RPC grant hardening have expanded.
- Production smoke credential readiness checks exist, but approved production smoke credentials/records remain a separate operational gate.
- Backup/restore ledger templates, backup artifact gitignore guardrails, restore-drill preflight planning, and a non-production restore drill operator checklist exist.
- Authenticated production smoke remains read-only and gated on approved safe credentials/records.

Recommended future implementation sequence:

1. Documentation/policy decisions.
2. Test-only security hardening.
3. Dependency security triage/upgrade.
4. SQL/RLS/storage hardening after explicit approval.
5. App pagination and storage-integrity cleanup.
6. Operational backup/restore and deployed-state verification.

Guardrails:

- Do not treat this backlog item as implementation approval.
- Do not claim security, backup/restore, compliance, public go-live, or production RLS/storage verification is complete until proven by code, SQL/config, deployed-state checks, tests, and completed implementation reports.
- Keep controlled private beta, broader beta, public go-live, and paid subscription readiness as separate gates.

Current next step:
Use FB-020 as the umbrella readiness workstream before broader beta/public go-live. Next operational readiness work should focus on approved production smoke credentials/records and a non-production restore drill before claiming broader readiness complete.

### FB-021 — Scheduling + Appointment Confirmation Foundation

Status: v1 Closeout Complete / Follow-up Backlog

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
Optional follow-ups are durable Activity events for rescheduled/canceled appointments, richer safe appointment event/history UI, and a full sandbox-mutating probe run with approved sandbox env. Do not treat this as full online booking, public availability, automated reminders, external calendar sync, or dispatch.

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
FB-025 now has a workflow-scoped SQL/RLS foundation, job-centered message thread UI, derived Activity timeline display, durable event writers for selected lifecycle RPCs, durable Activity reader merge, and first in-app job-message indicators backed by existing `workflow_messages` and `workflow_thread_reads` read-marker behavior. This does not mean broad chat, Activity unread indicators, or external delivery is live.

Current guardrails:

- Keep communication tied to eligible workflow contexts.
- Preserve homeowner control.
- Do not add contractor cold outreach.
- Do not claim email/SMS/push notification delivery is live.
- Keep current job-message indicators visual/in-app only; do not expand them into notifications, Activity unread, or permission changes without a separate approved slice.

Current next step:
Plan broader unread strategy only after beta feedback on job-message indicators, then consider request-message bridge strategy and broader estimate/invoice communication.

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
Review the internal admin moderation workflow, then separately decide whether to add an approved-only public display slice. Defer homeowner recommendations/referrals, Google review handoff, badges/awards, contractor disputes/responses, and any Discover ranking changes to later approved slices.

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
Contractors need simple visibility into what needs follow-up. A lightweight foundation now exists in the contractor dashboard through the `Workflow overview` card and conditional `Needs review` strip. It derives attention counts from already-loaded workflow state, including homeowner connection/calendar requests, contractor request follow-up, accepted estimates without linked jobs, draft/overdue/partially-paid invoice records, and profile setup. The accepted-estimates-needing-jobs dashboard CTA routes contractors to the existing Jobs workspace / Open estimates-invoices view where the established estimate-card `Create Job` / `View Job` controls live. This is not a full dedicated follow-up queue yet, and it does not add new lifecycle statuses, SQL/RLS/RPC changes, notifications, broad message aggregation, public review display, direct dashboard job creation, or automation.

Current next step:
Use beta feedback to decide whether the next slice should add another regression-hardened derived category. Keep future work read-only and status-derived where possible. Defer stale-estimate rules, completed-jobs-needing-invoices nuance, unpaid invoice follow-up beyond existing invoice statuses, broad job-message aggregation, review-request/public-review pipeline work, notification delivery, direct dashboard creation actions, and any new persisted lifecycle statuses until separately audited and approved.

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
FB-030 adds the controlled foundation for shared homeowner/home access. Completed slices include home membership tables/RPCs, pending email invite foundations, homeowner Home Access UI, read-only shared-home shells, address-aware shared-home shells, read-only shared reminder shells, a Home Access invite email function scaffold, disabled sandbox/production deployments, disabled UI send wiring, and a DB runtime setting contract for future invite email enablement.

Current guardrails:

- Production Home Access invite email delivery remains disabled unless a later approved enablement says otherwise.
- Shared homes stay out of owner selectors.
- Shared record access expands one approved surface at a time.
- Service requests, estimates, invoices, jobs, documents, messages, storage, and broader Home History are not broadly shared by default.
- No email/SMS/push delivery should be claimed live from disabled infrastructure.

Current next step:
Choose the next shared-record surface deliberately, or plan controlled production invite-email enablement separately with explicit provider/secrets/send approval.

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

## Current next recommended focus

1. FB-020 operational readiness: approved production smoke credentials/records and a non-production restore drill.
2. FB-024 Price Book maturity, one narrow slice at a time.
3. FB-025 unread indicators or scoped communication/Activity follow-up, including a possible later audit for appointment rescheduled/canceled Activity rows.
4. FB-026 review/referral flow audit after core request-to-job confidence improves.
5. FB-021 optional follow-up only if beta feedback needs richer appointment event/history UI or a full sandbox-mutating probe closeout.

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
