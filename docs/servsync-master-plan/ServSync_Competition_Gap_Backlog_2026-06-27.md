# ServSync Competition Gap Backlog Recommendations

Date created: 2026-06-27
Last reconciled: 2026-06-29
Status: Backlog addendum / status reconciliation
Source: Competition gap review against contractor operations platforms and homeowner discovery/lead platforms, reconciled against merged ServSync PRs through PR #125.

## Purpose

This document preserves and updates the competition-research recommendations discussed on 2026-06-27 so they can be incorporated into the main ServSync feature backlog, Codex audits, and future implementation planning.

This is product direction and status reconciliation only. Do not treat any item here as live unless implementation is confirmed by code, deployed app behavior, or a completed implementation report.

## Main strategic finding

ServSync has a differentiated direction around homeowner-connected service history, permission-based contractor relationships, and a trustworthy Discover loop. The largest competitive gaps remain the everyday contractor operations features that make a contractor keep using the product even before marketplace/discovery value matures.

Since the original 2026-06-27 gap review, several of the recommended gaps have moved from planning into implementation slices:

- FB-021 Scheduling + Appointment Confirmation Foundation has completed backend foundation, read-only display, and first action UI slices.
- FB-024 Price Book / Estimate Item Library Maturity has completed a first Price Book quick-pick slice.
- FB-025 Job-Centered Communication + Notifications has completed job message thread, Activity timeline, durable event writer, and durable Activity reader slices.
- FB-020 readiness work has advanced through multiple public/authenticated smoke, security-catalog, backup/restore documentation, and restore-drill planning slices.

## Current competition-gap status

| Proposed ID | Feature / Topic | Product Area | Current Status | Priority | Current Next Step |
| --- | --- | --- | --- | --- | --- |
| FB-021 | Scheduling + Appointment Confirmation Foundation | Scheduling, service requests, jobs, homeowner visibility | Partially completed / v1 core slices merged | High | Finish contractor reschedule/cancel controls, replacement proposal UX, event-history UX if needed, and production smoke/preview validation. Keep Google/Outlook sync, reminders, dispatch/routing, and homeowner-forced booking out of scope. |
| FB-022 | Online Booking / Request-to-Booking Flow | Homeowner service requests, contractor intake, scheduling | Partially covered by FB-021; not separately complete | High | Treat true online booking/self-scheduling as a later extension after FB-021 reschedule/cancel and contractor-controlled availability are stable. |
| FB-023 | Contractor Payment Collection / Deposits | Invoices, estimates, payments | Not started / Later-Future | High | Revisit after invoice reliability, partial invoicing, and paid/unpaid status flows are stable. Include card/ACH, deposits, partial payments, reminders, receipts, and payment status. Do not claim live until implemented. |
| FB-024 | Price Book / Estimate Item Library Maturity | Estimates, saved charges, trade libraries, contractor pricing | Started; Slice 1 Price Book quick-pick merged | High | Continue with default quantity, category/taxable behavior, assemblies/job bundles, margin/profit reminders, invoice quick-pick wiring, and role-access decisions for price/internal metadata. |
| FB-025 | Job-Centered Communication + Notifications | Messaging, service requests, jobs, invoices, Activity | Started; several core slices merged | High | Continue with unread badges, request-message migration/bridge strategy, broader request/estimate/invoice communication, optional attachments, and notification delivery planning. No broad chat or contractor cold outreach. |
| FB-026 | Review + Referral Flow | Discover, contractor profiles, completed jobs, trust | Not started | High | Audit post-completion contractor review request flow, contractor profile review display, homeowner recommendation/referral behavior, and optional Google review handoff. No fake ratings, paid ranking, or premature badges. |
| FB-027 | Contractor Pipeline / Follow-Up Lite | Estimates, requests, reminders, contractor dashboard | Not started as its own feature | Medium-High | Design simple follow-up queues for open requests, stale estimates, accepted estimates needing jobs, completed jobs needing invoices, unpaid invoices, and review requests. Activity timeline work can inform this but does not replace it. |
| FB-028 | Accounting Export Foundation | Invoices, customers, accounting | Not started / Later-Future | Medium | Start with CSV/export-ready invoice/customer/payment data before QuickBooks sync. Do not build full accounting. |
| FB-029 | Recurring Maintenance / Service Plan Lite | Home reminders, contractor recurring work, homeowner relationships | Not started / Later-Future | Medium | Shape after reminders, scheduling, invoices, and Home History are stronger. Start with manual recurring maintenance opportunities, not complex memberships. |

## Existing backlog items affected

### FB-006 — Contractor Auto-Scheduling

Keep FB-006 as a future, contractor-controlled auto-scheduling concept. FB-021 now provides the safer scheduling foundation path.

Current clarification:

- Start with appointment proposals and confirmations, not full auto-booking.
- Contractor remains in control of availability.
- No homeowner should be able to force a booking onto a contractor calendar.
- Do not claim external calendar sync until implemented.
- Contractor reschedule/cancel controls remain a practical next scheduling slice.

### FB-010 — General Homeowner-Contractor Messaging

The broad general-messaging idea should remain later. Near-term communication has correctly shifted toward workflow-tied communication.

Current clarification:

- Job-centered workflow message thread slices have started FB-025.
- Activity timeline/event slices have started FB-025.
- Service-request, estimate, and invoice communication still need deliberate scope.
- Homeowner-initiated communication remains the rule.
- Contractor cold messaging remains disallowed.
- Broad chat remains out of scope.

### FB-011 — Mobile Workflow Polish

Mobile polish remains high priority and is still not closed as a dedicated workstream. Recent implementation slices ran mobile smoke tests, but mobile workflow polish should still be audited and tested across contractor field use.

Areas still needing attention:

- Scheduling actions on mobile.
- Estimate creation and Price Book quick-pick on mobile.
- Job notes, message threads, Activity, checklist/work completion, and photo workflows on mobile.
- Invoice send/view/pay-status flows on mobile.
- Homeowner approvals and appointment responses on mobile.

### FB-013 — QuickBooks / Accounting Integration

Keep QuickBooks later. The nearer-term competitive gap is export-ready invoice/customer/payment data and clean records, not full accounting sync.

### FB-014 — Payments / Stripe

Keep payments later, but mark it as strategically high once invoice workflow and partial invoicing are stable. Contractor payment collection will matter for paid-plan value, but it should not come before request/job/invoice reliability.

### FB-020 — Security, Records Reliability, Backup/Restore, and Scale Readiness

FB-020 has advanced substantially, but should not be marked complete until the broader readiness gate is closed.

Recent progress includes:

- Public production smoke/readiness documentation.
- Security catalog expansion and RPC grant hardening.
- Production smoke credential readiness check.
- Backup/restore ledger templates.
- Backup artifact ignore guardrails.
- Restore drill preflight plan and operator checklist.
- Read-only authenticated production smoke scaffold.

Still open:

- Dedicated production smoke credentials and stable smoke records must be configured before authenticated production smoke can pass.
- Non-production restore drill still needs separate approval and execution.
- Any production SQL/storage/settings changes remain separate approval gates.
- Backup/restore and storage readiness should not be claimed complete until proven by an executed drill and evidence.

## Highest-priority next work after reconciliation

### 1. Update the official feature backlog table

The official `ServSync_Feature_Backlog.md` table still needs a follow-up cleanup so FB-021 through FB-029 are represented directly in the main inventory and old statuses for FB-020/FB-011/FB-024/FB-025 are no longer misleading.

### 2. Finish FB-021 Scheduling v1

Recommended next scheduling slice:

- Contractor can reschedule a confirmed appointment by proposing replacement windows.
- Contractor can cancel a confirmed appointment with a clear reason/status.
- Homeowner sees confirmed appointment plus replacement proposal state when applicable.
- Activity timeline shows the safe appointment status updates already supported by durable events where available.
- Keep email/SMS/push reminders, Google/Outlook sync, dispatch/routing, GPS, and homeowner-forced booking out of scope.

### 3. Continue FB-024 Price Book maturity

Recommended next Price Book slice:

- Support default quantity behavior if already modeled.
- Preserve/copy category and safe metadata where appropriate.
- Decide taxable handling intentionally.
- Plan assemblies/job bundles separately from simple line-item quick-pick.
- Keep contractor internal notes/private pricing metadata hidden from homeowners.
- Decide whether field tech/viewer roles can see pricing and internal metadata.

### 4. Continue FB-025 communication/Activity work

Recommended next communication slice:

- Add scoped unread badges or unread indicators for job message threads and/or workflow updates.
- Keep unread scope narrow and RLS-safe.
- Defer email/SMS/push delivery until notification preferences, templates, and delivery rules are clear.
- Do not add broad chat or contractor cold-message entry points.

### 5. Keep these behind the above

- FB-026 Review + Referral Flow.
- FB-023 Payments / Deposits.
- FB-027 Contractor Pipeline / Follow-Up Lite.
- FB-028 Accounting Export Foundation.
- FB-029 Recurring Maintenance / Service Plan Lite.

## Features intentionally not recommended as immediate next work

These are useful but should not be the next build unless strategy changes:

- Full ServiceTitan-style dispatch/routing.
- Payroll, commission, or timesheets.
- Call center / phone tracking.
- Heavy marketing automation.
- Full accounting sync.
- Warehouse inventory.
- Paid Discover rankings or pay-to-play marketplace placement.
- Native mobile apps before mobile web workflow is validated.

## Current recommended focus order

1. Official backlog table/status cleanup.
2. FB-021 — Scheduling reschedule/cancel completion slice.
3. FB-011 — Dedicated mobile workflow polish audit around the core beta loop.
4. FB-024 — Price Book / Estimate Item Library maturity beyond quick-pick.
5. FB-025 — Communication unread/status indicators and notification planning.
6. FB-026 — Review + Referral Flow.
7. FB-023 — Payment Collection / Deposits after invoice stability.
8. FB-027 — Contractor Pipeline / Follow-Up Lite.
