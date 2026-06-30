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
- FB-030 Household / Shared Homeowner Access was added after the reconciliation as a new homeowner collaboration backlog item.

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
| FB-030 | Household / Shared Homeowner Access | Homeowner accounts, homes, permissions, family/household collaboration | Needs Audit | High | Audit how to support multiple users under one homeowner household/home account, with owner/admin/member/viewer-style roles, invite/accept/revoke flows, property-level access, approval authority, and clear audit trails. |

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

### FB-030 — Household / Shared Homeowner Access

Purpose:

Allow one home/household to be managed by more than one homeowner-side user, such as a spouse/partner, adult child, property co-owner, property manager, or trusted household member.

Initial direction:

- Treat this as shared access to a homeowner household or property workspace, not as multiple people sharing one login.
- Each person should have their own authenticated user account.
- A primary homeowner/owner should be able to invite, approve, revoke, and manage household access.
- Access should be property-aware because a homeowner may have multiple homes and may not want every invited person to access every property.
- Contractor connections and property-sharing permissions must remain explicit and auditable.

Possible homeowner-side roles:

- Owner: full household/property control, can invite/remove members, manage homes, manage contractor connections, approve estimates, view/pay invoices when payments exist, and manage sharing.
- Admin/Co-owner: broad management rights but possibly cannot remove the primary owner.
- Member: can view shared property history, requests, estimates, jobs, invoices, messages, and reminders; approval/payment authority must be explicitly decided.
- Viewer: read-only access to selected homes and records.

Key decisions needed before implementation:

- Whether household membership is account-level, home-level, or both.
- Whether invited members can create service requests.
- Whether invited members can approve estimates, appointments, invoices, and contractor permissions.
- Whether invited members can invite/remove other members.
- Whether contractor-facing messages show the individual sender or the household name.
- Whether contractors see household member names, roles, or only the primary homeowner unless a member messages them.
- How removal/revocation affects existing message history, approvals, estimates, invoices, and Home History.
- How to prevent access leakage across unrelated homes, contractors, and household members.

Guardrails:

- Do not allow shared passwords or multiple people using one login as the intended design.
- Do not silently give a newly invited member access to every home unless the owner explicitly chooses that scope.
- Do not let a viewer approve estimates, invoices, payments, contractor sharing, or account-level changes.
- Do not let a contractor add household members.
- Do not let one household member remove the primary owner without a later explicit account-transfer design.
- Keep audit trails for invitations, accepts, revokes, approval actions, and permission changes.

Recommended audit prompt:

```text
You are working in the ServSync repo.

TASK
Audit the current homeowner profile, homes/properties, connection permissions, service requests, estimates, jobs, invoices, reminders, messages, and RLS paths to plan FB-030: Household / Shared Homeowner Access.

DO NOT CHANGE CODE.
DO NOT APPLY SQL.
DO NOT CREATE OR MODIFY FILES.
DO NOT DEPLOY.

GOAL
Return an audit and implementation plan for supporting multiple authenticated users under one homeowner household/property workspace, without shared passwords and without leaking property or contractor data across unrelated users.

AUDIT AREAS
1. Current homeowner user/profile model.
2. Current homes/property ownership model.
3. Current connection_shared_properties and homeowner-contractor permission model.
4. Current service request, estimate, job, invoice, reminder, document, media, and message visibility rules.
5. Current homeowner approval actions for estimates, appointments, invoices, contractor sharing, and property suggestions.
6. Existing RLS helpers that assume one homeowner user owns one profile/home.
7. Existing notification/message sender display assumptions.
8. Existing tests that would need expansion for shared homeowner access.

PLANNED DIRECTION
- Each household member has their own auth user.
- Primary owner can invite/revoke household members.
- Access should be property-scoped where practical.
- Roles should likely include owner, admin/co-owner, member, and viewer.
- Permission to approve estimates, approve appointment times, approve invoices/payments, manage contractor sharing, and invite/remove members must be explicit.
- Contractors should not be able to add household members.

RETURN
1. Current-state summary.
2. Recommended data model.
3. Recommended role/permission model.
4. Recommended homeowner UI flow.
5. Contractor visibility/messaging considerations.
6. RLS/security risks.
7. Migration/RPC needs.
8. Test plan.
9. Recommended implementation slices, smallest safe slice first.
10. Clear out-of-scope items.
```

## Highest-priority next work after reconciliation

### 1. Update the official feature backlog table

The official `ServSync_Feature_Backlog.md` table still needs a follow-up cleanup so FB-021 through FB-030 are represented directly in the main inventory and old statuses for FB-020/FB-011/FB-024/FB-025 are no longer misleading.

### 2. Finish FB-021 Scheduling v1

Recommended next scheduling slice:

- Contractor can reschedule a confirmed appointment by proposing replacement windows.
- Contractor can cancel a confirmed appointment with a clear reason/status.
- Homeowner sees confirmed appointment plus replacement proposal state when applicable.
- Activity timeline shows the safe appointment status updates already supported by durable events where available.
- Keep email/SMS/push reminders, Google/Outlook sync, dispatch/routing, GPS, and homeowner-forced booking out of scope.

### 3. Audit FB-030 Household / Shared Homeowner Access

Recommended next household-access step:

- Audit existing homeowner/profile/home ownership assumptions.
- Decide account-level vs home-level membership model.
- Decide roles and approval authority.
- Design invite/accept/revoke flow.
- Identify RLS helpers and tests that assume a single homeowner user owns the home.
- Keep this audit-only before any SQL or UI implementation.

### 4. Continue FB-024 Price Book maturity

Recommended next Price Book slice:

- Support default quantity behavior if already modeled.
- Preserve/copy category and safe metadata where appropriate.
- Decide taxable handling intentionally.
- Plan assemblies/job bundles separately from simple line-item quick-pick.
- Keep contractor internal notes/private pricing metadata hidden from homeowners.
- Decide whether field tech/viewer roles can see pricing and internal metadata.

### 5. Continue FB-025 communication/Activity work

Recommended next communication slice:

- Add scoped unread badges or unread indicators for job message threads and/or workflow updates.
- Keep unread scope narrow and RLS-safe.
- Defer email/SMS/push delivery until notification preferences, templates, and delivery rules are clear.
- Do not add broad chat or contractor cold-message entry points.

### 6. Keep these behind the above

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
3. FB-030 — Household / Shared Homeowner Access audit.
4. FB-011 — Dedicated mobile workflow polish audit around the core beta loop.
5. FB-024 — Price Book / Estimate Item Library maturity beyond quick-pick.
6. FB-025 — Communication unread/status indicators and notification planning.
7. FB-026 — Review + Referral Flow.
8. FB-023 — Payment Collection / Deposits after invoice stability.
9. FB-027 — Contractor Pipeline / Follow-Up Lite.
