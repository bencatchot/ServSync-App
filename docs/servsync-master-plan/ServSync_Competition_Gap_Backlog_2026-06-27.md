# ServSync Competition Gap Backlog Recommendations

Date: 2026-06-27
Status: Backlog addendum / planning input
Source: Competition gap review against contractor operations platforms and homeowner discovery/lead platforms.

## Purpose

This document preserves the competition-research recommendations discussed on 2026-06-27 so they can be incorporated into the main ServSync feature backlog, Codex audits, and future implementation planning.

This is product direction only. Do not treat any item here as live unless implementation is confirmed by code, deployed app behavior, or a completed implementation report.

## Main strategic finding

ServSync has a differentiated direction around homeowner-connected service history, permission-based contractor relationships, and a trustworthy Discover loop. The largest competitive gaps are still the everyday contractor operations features that make a contractor keep using the product even before marketplace/discovery value matures.

The highest-leverage near-term direction is to strengthen the request-to-appointment-to-job workflow before building heavier marketplace, reporting, accounting, or enterprise dispatch features.

## Recommended backlog additions / updates

| Proposed ID | Feature / Topic | Product Area | Status | Priority | Recommended Next Step |
| --- | --- | --- | --- | --- | --- |
| FB-021 | Scheduling + Appointment Confirmation Foundation | Scheduling, service requests, jobs, homeowner visibility | Needs Audit | High | Codex audit current request/job/appointment display paths and propose a narrow v1: contractor proposes visit windows, homeowner confirms, confirmed appointment displays on both sides, no external calendar sync, no full auto-dispatch. |
| FB-022 | Online Booking / Request-to-Booking Flow | Homeowner service requests, contractor intake, scheduling | Backlog | High | After FB-021 foundation, shape homeowner request -> contractor review -> proposed visit time -> homeowner confirmation workflow. |
| FB-023 | Contractor Payment Collection / Deposits | Invoices, estimates, payments | Later / Future | High | Revisit after invoice workflow is stable; include card/ACH, deposits, partial payments, reminders, receipts, and payment status. Do not claim live until implemented. |
| FB-024 | Price Book / Estimate Item Library Maturity | Estimates, saved charges, trade libraries, contractor pricing | Backlog | High | Continue trade-specific recipe/library work, then audit how contractor-owned pricing, saved line items, optional add-ons, reusable assemblies, and margin reminders should connect to estimates. |
| FB-025 | Job-Centered Communication + Notifications | Messaging, service requests, jobs, invoices | Backlog | High | Start with job/request-tied messaging and event notifications before any broad general chat or contractor-initiated messaging. Preserve homeowner control. |
| FB-026 | Review + Referral Flow | Discover, contractor profiles, completed jobs, trust | Backlog | High | Audit post-completion review request flow, contractor profile review display, homeowner recommendation/referral behavior, and optional Google review handoff. No fake ratings or paid ranking. |
| FB-027 | Contractor Pipeline / Follow-Up Lite | Estimates, requests, reminders, contractor dashboard | Backlog | Medium-High | Design simple follow-up queues for open requests, stale estimates, accepted estimates needing jobs, completed jobs needing invoices, unpaid invoices, and review requests. |
| FB-028 | Accounting Export Foundation | Invoices, customers, accounting | Later / Future | Medium | Start with CSV export and clean invoice/customer data before QuickBooks sync. Do not build full accounting. |
| FB-029 | Recurring Maintenance / Service Plan Lite | Home reminders, contractor recurring work, homeowner relationships | Later / Future | Medium | Shape after reminders, scheduling, invoices, and homeowner history are stronger. Start with manual recurring maintenance opportunities, not complex memberships. |

## Existing backlog items affected

### FB-006 — Contractor Auto-Scheduling

Keep FB-006 as a future, contractor-controlled auto-scheduling concept. Before auto-scheduling, build FB-021 as the safer scheduling foundation.

Recommended clarification:

- Start with appointment proposals and confirmations, not full auto-booking.
- Contractor remains in control of availability.
- No homeowner should be able to force a booking onto a contractor calendar.
- Do not claim external calendar sync until implemented.

### FB-010 — General Homeowner-Contractor Messaging

Keep unrestricted general messaging later. Near-term communication should be tied to specific workflows.

Recommended clarification:

- Service-request thread
- Job thread
- Estimate/invoice event comments or status messages
- Homeowner-initiated communication remains the rule
- Contractor cold messaging remains disallowed

### FB-011 — Mobile Workflow Polish

Mobile polish remains high priority and should be considered part of every near-term contractor workflow slice, especially scheduling, estimates, job notes, checklist work, photo upload, invoice sending, and homeowner approvals.

### FB-013 — QuickBooks / Accounting Integration

Keep QuickBooks later. The nearer-term competitive gap is export-ready invoice/customer/payment data and clean records, not full accounting sync.

### FB-014 — Payments / Stripe

Keep payments later, but mark it as strategically high once invoice workflow is stable. Contractor payment collection will matter for paid-plan value, but it should not come before request/job/invoice reliability.

## Highest-priority next feature add

FB-021 — Scheduling + Appointment Confirmation Foundation.

Why this should come next:

1. It strengthens the core beta loop immediately.
2. It turns homeowner requests into scheduled work instead of leaving a gap between request and estimate/job.
3. It gives both homeowner and contractor a concrete reason to return to ServSync.
4. It supports future reminders, notifications, mobile workflow, and eventual payments.
5. It avoids overbuilding auto-dispatch, routing, or external calendar sync too early.

Recommended v1 scope:

- Contractor can propose one or more visit windows from a service request or job.
- Homeowner can accept one proposed window.
- Confirmed appointment is visible on the homeowner request/job view.
- Confirmed appointment is visible on the contractor request/job view.
- Contractor can reschedule or cancel with a clear status trail.
- Appointment state is simple: proposed, confirmed, rescheduled, canceled, completed/no-show later if needed.
- No external Google/Outlook calendar sync in v1.
- No automatic dispatch/routing in v1.
- No homeowner-forced booking in v1.

Recommended Codex audit prompt:

```text
You are working in the ServSync repo.

TASK
Audit the current service request, job, appointment/time display, notification, and homeowner/contractor visibility paths to plan FB-021: Scheduling + Appointment Confirmation Foundation.

DO NOT CHANGE CODE.
DO NOT APPLY SQL.
DO NOT CREATE OR MODIFY FILES.
DO NOT DEPLOY.

GOAL
Return an audit and implementation plan for a narrow v1 scheduling foundation:
- Contractor can propose one or more visit windows from a service request or job.
- Homeowner can accept one proposed window.
- Confirmed appointment is visible to both homeowner and contractor.
- Contractor can reschedule or cancel with clear statuses.
- No full auto-scheduling.
- No external Google/Outlook calendar sync.
- No homeowner-forced bookings.
- No enterprise dispatch/routing.

AUDIT AREAS
1. Current service request data model and UI.
2. Current job/inspection data model and UI.
3. Existing appointment/time helper functions, including servsync_appointment_display_time if present.
4. Existing homeowner visibility rules/RLS around requests/jobs.
5. Existing contractor role permissions for creating/updating request/job-related records.
6. Existing notification/event infrastructure that could support appointment status changes later.
7. Current mobile usability risks for scheduling actions.

RETURN
1. Current-state summary.
2. Recommended v1 data model approach.
3. Recommended UI flow for contractor.
4. Recommended UI flow for homeowner.
5. RLS/security considerations.
6. Migration/RPC needs, if any.
7. Test plan.
8. Risks and out-of-scope items.
9. Recommended implementation slices, smallest safe slice first.

IMPORTANT GUARDRAILS
- Preserve homeowner control.
- Preserve contractor control of scheduling.
- Do not expose private appointment data across unrelated users.
- Do not claim external calendar sync, auto-dispatch, or payment features.
- Keep the workflow simple enough for small contractors.
```

## Features intentionally not recommended as immediate next work

These are useful but should not be the next build unless strategy changes:

- Full ServiceTitan-style dispatch/routing
- Payroll, commission, or timesheets
- Call center / phone tracking
- Heavy marketing automation
- Full accounting sync
- Warehouse inventory
- Paid Discover rankings or pay-to-play marketplace placement
- Native mobile apps before mobile web workflow is validated

## Recommended next focus order

1. FB-021 — Scheduling + Appointment Confirmation Foundation
2. FB-011 — Mobile Workflow Polish around the core beta loop
3. FB-024 — Price Book / Estimate Item Library Maturity
4. FB-025 — Job-Centered Communication + Notifications
5. FB-026 — Review + Referral Flow
6. FB-023 — Payment Collection / Deposits after invoice stability
7. FB-027 — Contractor Pipeline / Follow-Up Lite
