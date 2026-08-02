# ServSync Completed Features

Last updated: 2026-08-02

Last reconciled against `origin/main` at `4de490183de88cf0cdb381649b065d2614da6af7` (merged PR #366).

## Purpose

This archive records completed ServSync v1 milestones that no longer belong in the active feature backlog. It is intentionally concise.

For detailed implementation sequence, changed files, validation, SQL rollout gates, and follow-up notes, use [CHANGELOG.md](CHANGELOG.md). For unfinished outcomes and consolidated IDs, use [ServSync_Feature_Backlog.md](ServSync_Feature_Backlog.md).

## Archive Rules

- Archive only completed milestones, not every possible future enhancement attached to them.
- Do not treat an archived milestone as permission to market adjacent future capabilities as live.
- If later work reopens a topic, create or use the focused active backlog entry shown in the crosswalk rather than reusing a retired ID for unrelated scope.
- Keep SQL, rollout, Preview, Sandbox, Production, and cohort status precise.

## Completed Milestones

| ID | Completed milestone | Completion evidence on current main | Remaining active or future work |
| --- | --- | --- | --- |
| FB-001 | Invite a Contractor to ServSync v1 | Backlog/changelog history records the homeowner contractor invite lead workflow as completed/functional; current source and marketing inventory retain contractor invite/claim lead surfaces while excluding automated outreach claims. | Future outreach analytics, duplicate lead grouping, and claim-flow improvements must be separately scoped. |
| FB-002 | Contractor Estimate Defaults & Templates v1 | Estimate templates, saved charges, Price Book foundation, CSV preview/import coverage, legacy estimate quick-pick behavior, PR #361 Price Book management cleanup, PR #362 Draft-first Price Book Picker v1, PR #365 Price Book Organization Foundation v1, and PR #366 Price Book Repeat-Import Reconciliation v1 are merged and documented; both additive Price Book migrations were applied through controlled Sandbox and Production rollouts. | Broader reusable-content maturity remains active under FB-024. Guarded batch rollback remains the next focused slice. |
| FB-003 | Core connection and multi-property permission milestone | Connection request, connected contractor/customer context, per-property permission direction, and controlled-beta permission evidence are represented in source, tests, master-plan sections, and changelog. | Local-customer multi-property claim completed separately under FB-003A; request-free operational document delivery authorization remains active under FB-003B. |
| FB-003A | Local-Customer Multi-Property Claim | Completed 2026-08-01. PR #348 merged at `a20cee5ef184709ca462f6546f54a61e655aa058`, adding explicit selected-property invitation membership, token-free multi-property preview, complete create-or-match mapping, atomic acceptance, legacy single-property compatibility, replay protection, stale invalidation, connected-homeowner null safety, tenant isolation, and token containment. The reviewed SQL was applied to Production with catalog/security validation and public smoke passed 7/7; authenticated Tests A-H passed only in Demo against source `6e5226e869e64bfed3102acfa09779b846cbbb88`, as recorded in [FB-003A Authenticated Demo Validation](../demo/validation/FB-003A_Authenticated_Demo_Validation.md). | Automated/provider delivery remains excluded under FB-003B. Raw expected-replay RPC/JSON detail is separate P3 polish under FB-036. |
| FB-011 | Mobile Workflow Polish controlled-beta baseline | Mobile shell/navigation slices, responsive overflow fixes, mobile smoke coverage, PWA metadata, app-link helper, and mobile checklist documentation are merged and recorded in the changelog. | Native apps remain FB-015; any additional mobile QA should be a new focused follow-up. |
| FB-018 | Estimate Helper v1 | Estimate Helper v1 is merged, preview-smoked, and recorded as a contractor-only suggestion panel that never auto-adds items or exposes rationale to homeowners/PDFs. | Broader reusable content and helper maturity belongs under FB-024 or a new scoped item. |
| FB-019 | Estimate Labor Model / Line-Specific Labor Inputs v1 | SQL/schema foundation, backend conversion preservation, app/UI labor support, PDF/homeowner display, and Build Estimate Draft labor cleanup are merged and production-applied where required. | Future labor-model polish should be handled as regression or focused follow-up work. |
| FB-020 | Controlled-beta operational readiness baseline | Public/authenticated smoke boundaries, backup/restore templates, non-production restore drill planning, artifact guardrails, controlled-operations runbooks, and provider-neutral evidence foundations are merged and documented. | Public-launch restore, storage, retention, recovery, security, and scale readiness remain active under FB-016. |
| FB-021 | Scheduling and Appointment Confirmation foundation v1 | Scheduling SQL/RPC/RLS foundation, read display, contractor 1-3 window proposals, homeowner accept/decline, replacement reschedule/cancel, appointment copy, and durable Activity rows are merged and production-applied where required. | True contractor-controlled online booking remains active under FB-006. |
| FB-026 | Contractor Referral v1 | Contractor-to-contractor referral SQL/RPC foundation, contractor owner/admin/office submit UI, and platform-admin manual tracking UI are merged and documented, with email/reward/public referral paths excluded. | Review moderation and public display remains active under FB-026 in the active backlog. |
| FB-027 | Contractor Pipeline / Follow-Up Lite | Contractor Workflow overview / Needs review summary, navigation-only attention CTAs, accepted-estimate job handoff focus, invoice attention, and related UI cleanup are merged and documented. | Deeper contractor reporting remains active under FB-004. |
| FB-030 | Shared Home / Home Access foundation v1 | Home membership foundation, invite/accept/decline/revoke RPCs, pending email invite UI, shared-home shells, shared reminder shells, disabled delivery function scaffold, DB delivery-enable contract, and boundary tests are merged/applied where required. | Invite-email enablement and additional shared-record surfaces remain active under FB-030. |
| FB-031 | Contractor Beta Billing / Entitlement Readiness v1 | Billing-account/entitlement SQL, admin read-only visibility, contractor entitlement loading, labels, and limited read-only UI support are merged/applied while beta remains free and no Stripe/paywall is live. | Pricing, packaging, checkout, enforcement, and paid subscription rollout remain active/future under FB-017. |
| FB-032 | Service Plans foundation v1 | Service plan SQL/RLS/RPC foundation (with stable internal `service_agreement` identifiers), contractor template/offer UI, homeowner offer review/accept/decline, and read-only active plan display are merged/applied where required. | Recurring visits, renewals, reminders, notifications, recurring billing, and automation remain active/future under FB-029. |
| FB-034 | Demo Mode request-to-job capture milestone | Dedicated demo environment foundation, private runner checkpoints through request-to-job and job lifecycle states, and frontend-only presentation controls are merged and documented. | Extended demo coverage remains future under FB-034A if later prioritized. |

## Consolidated Completion Notes

- FB-002 and FB-024: Estimate Defaults & Templates v1 is complete; Price Book / Reusable Estimate Content Maturity remains active.
- FB-004 and FB-027: Follow-Up Lite is complete; reporting beyond existing attention queues remains active.
- FB-006, FB-021, and FB-022: Appointment Confirmation foundation v1 is complete; true contractor-controlled online booking remains active.
- FB-010 and FB-025: workflow communication foundations exist; broader workflow-scoped communication remains active.
- FB-013 and FB-028: provider-neutral integration foundations exist; accounting export and QuickBooks readiness remains active.
- FB-014 and FB-023: payment schedules and invoice generation foundations exist; actual payment collection remains active.
- FB-016 and FB-020: controlled-beta operational baseline is complete; public-launch operational readiness remains active.
- FB-029 and FB-032: Service Plans foundation v1 is complete; recurring service automation remains future.
