# ServSync Product Roadmap

Last updated: 2026-09-01

Planning base: `origin/main` at `c0a27b92ed977109c59c8960364a08cfe1626c8e`

## Purpose

This is the canonical execution-sequencing document for ServSync. It answers what should happen next, what should wait, and what evidence is required before the product moves to a broader release stage.

The roadmap does not prove that a feature is live and does not authorize implementation, rollout, SQL application, provider activation, production mutation, merge, or deployment. Current feature state and guardrails remain in the [Feature Backlog](ServSync_Feature_Backlog.md). Product purpose and module ownership remain governed by the [Product Vision & Philosophy](ServSync_Product_Vision_and_Philosophy_v1.md) and [Product Information Architecture](ServSync_Product_Information_Architecture_v1.md).

## Product Outcome

ServSync should become an operationally dependable, established-feeling product for solo contractors and very small service businesses without becoming a smaller copy of Jobber, Housecall Pro, ServiceM8, or Workiz.

The near-term promise is:

> A contractor can move customer work from request or Draft through Estimate, Job, Invoice, payment record, and Home History without confusion, duplicate records, or outside spreadsheets for the core workflow.

The long-term advantage is:

> ServSync connects practical contractor operations to a homeowner-controlled, property-centered record that makes every future service interaction more useful.

## Roadmap Decisions

1. Complete one bounded launch-foundation release before inviting real contractor workflow users, including the approved `Work` and `Financials` separation.
2. Do not perform a visual rebrand or broad cosmetic redesign. Preserve the current visual system and improve hierarchy, navigation, copy density, loading behavior, and next-action clarity.
3. Once the launch foundation begins external pilot use, treat primary navigation, object names, lifecycle statuses, and the location of core actions as a stable product contract.
4. Use a controlled pilot before broad public onboarding. Real contractor task completion is the evidence gate, not feature count or internal familiarity.
5. Prioritize the core operational loop before marketplace breadth, advanced team operations, or speculative automation.
6. Protect ServSync's differentiators: one workflow across connected and not-connected Customers, homeowner-controlled property context, Home History, Home Map/Assets & Systems, safe role boundaries, and deliberate Draft-first planning.
7. Add later capabilities inside the established Product Information Architecture. Avoid repeated global-navigation changes as the feature list grows.
8. Treat voiceover, synchronized captions, and a durable transcript as one product-wide tutorial standard. Burned-in scene callouts do not replace captions. Protected tutorials use the already established Marketing narration choice—OpenAI `gpt-4o-mini-tts` with the Cedar voice and the disclosure **AI-generated voiceover using OpenAI's Cedar voice.** Preserve exact model/voice/script provenance and a silent source master. This bounded Help use does not authorize runtime generation, another provider, or automatic publication.

## Planning Inputs Reconciled

This roadmap consolidates the following sources:

- [Master Plan](ServSync_Master_Plan_v1_0.md): product strategy, beta direction, workflow state, and rollout boundaries.
- [Feature Backlog](ServSync_Feature_Backlog.md): active unfinished outcomes, statuses, dependencies, and safety guardrails.
- [Product Vision & Philosophy](ServSync_Product_Vision_and_Philosophy_v1.md): relationship-centered strategy, simplicity, and the home as the permanent record.
- [Product Information Architecture](ServSync_Product_Information_Architecture_v1.md): long-term contractor and homeowner module ownership.
- [Controlled Beta Launch Plan](../BETA_LAUNCH_PLAN.md) and [Private Beta Readiness Checklist](../BETA_READINESS_CHECKLIST.md): cohort, QA, support, pause, and release gates.
- [Public Launch Readiness + Competitive UX Audit](../qa/ServSync_Public_Launch_Readiness_Competitive_UX_Audit_2026-08-14.md): launch readiness, competitive gaps, and verified UX findings.
- [Contractor Workflow Audit](../qa/ServSync_Contractor_Workflow_Audit_2026-08-11.md): contractor workflow findings and operational risks.
- 2026-08-19 signed-in Demo walkthrough of contractor and homeowner desktop/mobile surfaces: the visual system is credible, but request actions, homeowner Properties, financial pages, and mobile cards expose too much information at once.

## Release Model

| Stage | Intended users | Change posture | Exit decision |
| --- | --- | --- | --- |
| Launch foundation | Internal and test users only | Structural workflow and navigation changes allowed | Core loop is stable enough for unfamiliar contractors |
| Controlled contractor pilot | 3-5 invited contractors plus friendly homeowners | Core structure frozen; targeted fixes and additive guidance allowed | Contractors complete real work with acceptable support load |
| Operational beta | Narrow owner-operator/small-office cohort | Predictable additive releases; disruptive changes require migration treatment | Table-stakes operational gaps are acceptable for the target cohort |
| Broader launch | Wider self-serve acquisition | Stable product contract and formal release operations | Reliability, onboarding, payments/financial boundaries, support, and honest positioning are ready |

Dates are estimates, not commitments. Evidence gates control movement between stages.

## Roadmap Management Operating Model

The roadmap is a standing product compass, not a restriction against valuable work that appears outside the current phase.

ServSync uses two visible work lanes:

| Lane | Purpose | Operating rule |
| --- | --- | --- |
| Launch Roadmap | Move the current release stage toward its exit gate | Always keep one clearly named next outcome. Do not let this lane become idle because another feature is interesting or useful. |
| Strategic Investment | Continue valuable owner-led work that benefits ServSync or future contractors but is not the current launch-stage blocker | May proceed in parallel when its value is explicit, its scope is bounded, and it does not silently replace the Launch Roadmap priority. |

FB-037 Marketing is an approved Strategic Investment lane. It benefits ServSync's own growth operations and may later benefit contractors, so it may continue while Phase 0 advances. Its provider, publication, tenant, cost, and rollout guardrails remain unchanged. Marketing work does not count as completing a Phase 0 launch-foundation gate unless it directly satisfies a listed Phase 0 acceptance criterion.

Focus rules:

- Keep at least one Launch Roadmap task ready or active while Strategic Investment work continues.
- After any completed task, identify whether it advanced the current roadmap gate, a later roadmap outcome, a strategic investment, or unrelated maintenance.
- Reconcile the Product Roadmap and Feature Backlog whenever status, priority, remaining scope, dependency, guardrail, or next step changes.
- Do not update roadmap status merely because source exists; use precise rollout and validation language.
- Return the next recommended Launch Roadmap assignment after every completed task, even when the completed task was in the Strategic Investment lane.
- Surface an owner decision only when it materially changes product experience, launch scope, protected systems, or sequencing.
- Allow urgent security, privacy, data-integrity, production-reliability, and blocker work to interrupt both lanes; record the interruption and the return point.

### Current roadmap control point

| Field | Current direction |
| --- | --- |
| Current release stage | Phase 1 — Controlled Contractor Pilot Preflight |
| Primary active outcome | FB-040A Tutorial Readiness — TUT-004 source and protected-media closeout |
| Completed control-point evidence | Phase 0 is complete. PR #521 merged Phase 0.7 at main commit `0bddbb20682bbcac7945150e6f2d70e57e54aed7`, preserving the accepted role-aware Beta Guide, direct Support handoff, contextual Estimate walkthrough, and truthful automation boundaries. TUT-001 and TUT-003 are published under the narration/caption standard; PR #537 merged the permanent TUT-003 Production owner contextual-playback smoke closeout at `48c18d4699a5d3149214f01c6823299b8f5110b6`. TUT-002 remains visually current but still needs its standards upgrade. The controlled-pilot inventory now contains three published walkthroughs and three missing protected workflows. See [Pilot Tutorial Coverage](ServSync_Pilot_Tutorial_Coverage.md). |
| Next recommended assignment | With explicit owner authorization, use the existing protected Demo recorder credentials against merged commit `c0a27b92ed977109c59c8960364a08cfe1626c8e`. Package the validated silent source with one Cedar narration request, synchronized top-safe captions, matching transcript, exact disclosure, and owner review. Credential retrieval, Help approval, and Production publication remain explicit owner gates. |
| Assignment outcome | PR #542 merged normally at `c0a27b92ed977109c59c8960364a08cfe1626c8e`; automatic Production app, durable Demo, and Stripe Sandbox deployments all completed successfully, and each public alias returned HTTP 200. The merged TUT-004 source starts from one registry-owned completed Job, creates and sends the exact lineage-bound Invoice through ordinary UI, opens it as the fictional homeowner, and records a fictional `$400.00` external bank transfer through the canonical offline ledger. The final state is **Partially Paid**, `$400.00` paid, and `$1,765.00` due. The recorder fails on visible secrets, browser errors, `5xx` responses, or any online-payment/provider path, and the contextual entry is at `contractor.financials` for the intended Owner/Admin/Office package. The media is not recorded, narrated, approved, or published; protected credentials were not retrieved. See [Pilot Tutorial Coverage](ServSync_Pilot_Tutorial_Coverage.md). |
| Expected following slice | Finish TUT-004's merged durable Demo package and owner-gated Help review/publication, then TUT-005, TUT-006, and the TUT-002 standards upgrade before the pilot onboarding dry run. |
| Parallel strategic lane | FB-037 Marketing has a source-complete guarded media-retirement control: eligible unpublished managed media can retire through the existing authenticated lifecycle RPC, atomically invalidating Ready/Needs Review packages and releasing quota while preserving audit/publication history. A bounded UI follow-up also surfaces server-eligible unattached uploads in Campaigns only when they have no active pairing or non-retired package dependency, without creating fake Content. No new migration or permission boundary is required. Production verification preserved the originally named **Your work, connected — Free ServSync beta** item as Published with exact history and retirement eligibility false, so it remains intentionally unavailable to the control. Selected-contractor beta work remains separately governed. |
| Roadmap return point | Return to FB-040 controlled-pilot preflight after each bounded feature or strategic-lane interruption; tutorial readiness is the current launch assignment. |

### Completion update protocol

When work is reported complete:

1. Confirm the exact branch/PR/commit and deployed or gated state when relevant.
2. Classify the result against the current roadmap phase and backlog entry.
3. Update the roadmap control point if the next assignment or dependency changed.
4. Update the Feature Backlog when status, remaining scope, priority, guardrail, or next step changed.
5. Keep implementation history in the Changelog rather than expanding roadmap task descriptions into diaries.
6. Return one primary next Codex assignment, plus an optional parallel assignment only when maintaining both lanes is useful.

## Phase 0 — Launch Foundation

Target horizon: 3-4 weeks before real contractor workflow onboarding.

Goal: make the existing product feel simpler and more decisive without expanding its feature footprint.

| Order | Outcome | Backlog relationship | Acceptance evidence |
| --- | --- | --- | --- |
| 0.1 | Implement and freeze the launch information architecture and terminology | FB-039; Product Information Architecture | The contractor `Jobs` workspace becomes `Work`; Estimates remain in Work; Invoices, deposits, payments, receivables, exports, and financial reporting move to `Financials`; provider setup stays in Company -> Integrations. Desktop and mobile use consistent object names, lifecycle labels, canonical destinations, and cross-module lineage. |
| 0.2 | Give every core work state one primary next action | FB-039; FB-003B; FB-010; FB-011A | New Request, Draft Estimate, sent Estimate, accepted Estimate, unscheduled Job, active Job, completed Job, and open Invoice each present one dominant action; secondary actions remain available without equal visual weight. |
| 0.3 | Simplify dense homeowner surfaces | FB-039; FB-030 | Properties uses progressive sections for Overview, Home Map, Access, and Property Settings. Active financial work is concise; historical artifacts remain in Records/Home History. Future-feature explanations do not dominate working screens. |
| 0.4 | Stabilize loading, empty, duplicate, and recovery behavior | FB-016 | Related dashboard identity/count data appears atomically or behind stable skeletons; empty states lead to a useful action; retry/error states are actionable; duplicate Home History, document, Estimate, Job, Invoice, and payment transitions are prevented or safely idempotent. |
| 0.5 | Lock the field-critical mobile path | FB-039; archived FB-011 evidence | At 390x844, today's work, Request response, Estimate review, Job execution, attachments/checklists, Invoice action, and Customer contact/property context are usable without clipping or excessive setup content ahead of the work. |
| 0.6 | Establish repeatable launch QA fixtures | FB-016; FB-034A | Resettable Sandbox/Demo fixtures cover every core lifecycle state; one automated desktop path and one focused mobile path validate the canonical loop without relying on personal accounts. |
| 0.7 | Publish honest beta boundaries and contextual help | FB-038; beta docs | Pilot users can see what is available, what remains manual, and how to get help. Copy does not imply live Production online payments, advanced dispatch, broad integrations, automated reminders, or native/offline capability. |

### Phase 0 non-goals

- Visual rebrand, new design system, or wholesale component rewrite.
- Native mobile application.
- Advanced dispatch, route optimization, fleet, inventory, payroll, or commissions.
- Broad marketplace growth or ranking.
- Large new feature work unrelated to completing or understanding the core loop.

### Phase 0 exit gate

Do not invite pilot contractors until all of these are true:

- An unfamiliar contractor can complete Request/Draft -> Estimate -> approval -> Job -> Invoice -> payment record -> Home History without developer assistance.
- The same critical workflow is usable on a phone.
- Navigation, terminology, lifecycle statuses, and primary action placement are frozen for the pilot.
- No known duplicate financial or Home History transition remains.
- Test fixtures and recovery steps are repeatable.
- Beta limitations and support paths are visible and accurate.

## Phase 1 — Controlled Contractor Pilot

Target horizon: 2-4 weeks after Phase 0.

Goal: prove that real contractors can adopt the existing product before expanding the feature surface.

| Order | Outcome | Backlog relationship | Acceptance evidence |
| --- | --- | --- | --- |
| 1.0 | Protect the minimum pilot tutorial set | FB-040; FB-038 | Six protected workflow definitions; each tutorial has a Demo-safe recorder path, synchronized voiceover and captions, a durable transcript, contextual destination, explicit publication gate, freshness ownership, sound-off usability, and full normal-speed playback acceptance. |
| 1.1 | Recruit a narrow pilot cohort | FB-040; beta docs | 3-5 solo contractors or very small teams with friendly homeowner participants; initial trade mix is recorded. |
| 1.2 | Run task-based onboarding | FB-040; FB-038 | Each contractor adds or imports a Customer, creates or receives work, estimates, schedules or records the visit, completes work, invoices, and closes the record. Time-to-first-completed-loop and assistance required are recorded. |
| 1.3 | Operate a rapid but controlled feedback loop | FB-040; Beta Feedback Triage | Blockers receive immediate attention; repeated confusion receives targeted UX correction; feature requests are logged without automatically changing the roadmap. |
| 1.4 | Measure product stability and adoption | FB-004; FB-040 | Track completed loops, abandoned stages, time in stage, support contacts, error/retry events, mobile usage, and repeated confusion themes without exposing private customer content. |
| 1.5 | Decide the operational-beta boundary | FB-014; FB-006; FB-013; FB-017 | Owner decides whether the next cohort can operate without Production online payments, richer scheduling, and accounting export, or which bounded capability must ship first. |

### Change policy after the pilot starts

- Do not rename or relocate a core destination merely because a new feature is added.
- Prefer additive capability inside the established Business, Customers, Work, Growth, Company, Home, Contractors, Service, Records, Maintenance, and Account architecture.
- Use feature flags or small cohorts for material additions.
- Preserve existing URLs and provide a short transition path when a destination must move.
- Release meaningful interface changes on a predictable cadence and explain only changes that affect daily work.
- Do not maintain two complete interfaces indefinitely; transitional compatibility should be bounded and removable.

### Phase 1 exit gate

- At least three pilot contractors complete the canonical loop with real or realistic work.
- No unresolved privacy, record-integrity, payment-state, or core-loop blocker exists.
- Repeated confusion is below the agreed threshold and is not concentrated on navigation or next-action selection.
- Support load is sustainable for the next cohort.
- The owner has made an explicit online-payment and scheduling boundary decision for operational beta.

## Phase 2 — Operational Beta Table Stakes

Target horizon: months 2-4, ordered by pilot evidence.

Goal: close only the competitive gaps that materially block the initial contractor segment.

| Default order | Outcome | Backlog relationship | Why / dependency |
| --- | --- | --- | --- |
| 2.1 | Production online payment decision and bounded rollout | FB-014 | Highest all-in-one workflow gap. Requires owner launch approval, provider/financial operations readiness, refund/dispute/support policy, receipts, and staged rollout. Offline payment recording remains supported. |
| 2.2 | Workflow-scoped communication and delivery confidence | FB-010; FB-012; FB-003B | Add unread consistency, Estimate/Invoice communication, delivery logs, and selected email/SMS reminders before push. Requires consent, preference, failure, retry, and audit policy. |
| 2.3 | Practical scheduling upgrade | FB-006 | Start with day/week views, technician assignment where relevant, conflict awareness, and rescheduling clarity. Contractor-controlled online booking follows stable availability rules; advanced dispatch/routing does not. |
| 2.4 | Accounting-ready export | FB-013 | Start with reliable Customers/Invoices/payments/tax exports. Use pilot evidence before QuickBooks OAuth/sync. External provider IDs remain outside core Estimate schedule records. |
| 2.5 | Operational reporting | FB-004; FB-024 | Add only reports that help owner/operators act: Estimate aging/conversion, Jobs by state, receivables, collected revenue, and lightweight job profitability when cost data is reliable. |
| 2.6 | Pricing and packaging | FB-017 | Define plans from proven value and cost-to-serve. Navigation remains capability-based; entitlements do not reorganize the product. |
| 2.7 | Onboarding and migration maturity | FB-038; FB-024; FB-040 | Guided setup, Customer import, Price Book import, contextual walkthroughs, and recoverable first-run tasks reduce switching risk. |

Phase 2 sequencing may change based on pilot evidence. It should not become a commitment to implement every row before expanding the beta.

## Phase 3 — Differentiate and Retain

Target horizon: months 4-9 after the operational beta is dependable.

Goal: deepen the homeowner/property relationship that competitors do not naturally own.

| Outcome | Backlog relationship | Direction |
| --- | --- | --- |
| Property-centered service timeline | FB-007; FB-030 | Make completed work, reports, invoices, warranties, assets, documents, and follow-up needs understandable as one property story without duplicating records. |
| Home Map / Assets & Systems to Work bridge | FB-007 | Let authorized property context improve planning, execution, reporting, and future service while preserving homeowner control. |
| Home Access and shared-record expansion | FB-030 | Expand one record surface at a time with clear permission summaries and guarded invitation delivery. |
| Recurring relationship automation | FB-029; FB-010; FB-014 | Add selected recurring visits, reminders, renewals, or recurring billing only after scheduling, communication, and payment foundations are dependable. |
| Trusted review and reputation layer | FB-026; FB-005 | Tie ServSync reviews to eligible completed work, add moderation, and prohibit fake ratings and paid ranking. |
| Useful Discover and contractor growth | FB-009; FB-008; FB-037 | Build feed/search value only when there is enough trustworthy contractor activity. Keep operational work in Customers and Work after a relationship forms. |
| Broader contextual Help | FB-038 | Expand role-aware retrieval and walkthrough coverage using observed support gaps; paid generation remains separately approved. |

## Long-Term Options — Evidence Required

These capabilities are not part of the near-term launch commitment. Start them only when adoption, target-segment, and operational evidence justify the complexity.

| Capability | Existing backlog | Start condition |
| --- | --- | --- |
| Advanced dispatch, GPS, routing, and crew coordination | Future Work/Company scope | Multiple active crews repeatedly demonstrate a scheduling/assignment problem that practical scheduling cannot solve. |
| Native/offline mobile application | FB-015 | Mobile web, auth redirects, deep links, camera/files/PDFs, and field workflow are stable; offline need is proven. |
| Project collaboration and multi-contractor coordination | FB-033 | Ordinary service workflow is stable and an approved cohort needs cross-contractor coordination with explicit authorization. |
| Advanced inventory, purchasing, payroll, and commissions | Product Information Architecture future map | A defined larger-team segment demonstrates recurring demand; preserve optional module boundaries. |
| Advanced Price Book assemblies, catalogs, and deep job costing | FB-024 | Contractors provide concrete workflow evidence beyond current Price Book and basic profitability needs. |
| Broad marketplace ranking and awards | FB-005; FB-008; FB-009; FB-026 | Sufficient real activity, review eligibility, moderation policy, and anti-manipulation rules exist. |
| Autonomous or cross-product AI | Future contextual capability | A bounded workflow has measurable value, human review, privacy/cost controls, and a non-AI fallback. |

## Competitive Benchmark Policy

Use competitors as workflow benchmarks, not as a feature checklist:

- Jobber: lifecycle clarity, client communication, and operational simplicity.
- Housecall Pro: payments, scheduling/dispatch, field operations, and revenue workflow breadth.
- ServiceM8: owner-operator/mobile execution and contractor-controlled online booking.
- Workiz: dispatch-heavy operations and customer status communication.
- ServiceTitan: an upper-market boundary reference, not the near-term product target.

ServSync should accept short-term disadvantages in enterprise dispatch, inventory, payroll, large reporting suites, integration-marketplace breadth, and native/offline capability. It should not accept a confusing core loop, unreliable records, unclear financial status, or an interface whose common tasks feel more complex than those competitors.

## Success Measures

### Launch foundation

- Core-loop completion rate in controlled testing.
- Median assistance required per first loop.
- Wrong-turn or backtrack count at each lifecycle handoff.
- Mobile completion of field-critical tasks.
- Duplicate/retry/error incidence.

### Controlled pilot

- Time to first Customer and first completed work loop.
- Weekly active contractors completing meaningful workflow actions.
- Estimate-to-approval and completed-Job-to-Invoice conversion.
- Support contacts per contractor and repeated confusion themes.
- Contractor retention intent after completing real work.
- Homeowner ability to understand current status and find final records.

### Operational beta and later

- Payment collection and reconciliation success, if enabled.
- Delivery success/failure and response time for workflow communication.
- Schedule conflict/reschedule frequency.
- Accounting export correction rate.
- Repeat-customer and recurring-service activity.
- Home History and property-context reuse in later work.

Metrics should describe product health, not create fake public proof. Private customer content must not be collected merely to improve analytics.

## Deferred or Rejected Near-Term Work

- No broad visual redesign or brand refresh.
- No attempt to match every Jobber or Housecall Pro feature.
- No enterprise-first dispatch, fleet, inventory, payroll, or commission program.
- No native application merely for marketplace parity.
- No broad Discover ranking before trustworthy supply and moderation exist.
- No automated reminder, payment, publishing, or AI claim beyond its verified rollout state.
- No navigation organized by subscription tier.

## Owner Decisions Required at Defined Gates

| Gate | Decision |
| --- | --- |
| During Phase 0 implementation | Validate the approved Work/Financials labels and subnavigation with cold-user tasks; preserve the ownership decision unless evidence exposes a material usability problem. |
| Before pilot invitation | Confirm pilot cohort, trades, support channel, data/reset policy, and beta limitation copy. |
| Before operational-beta expansion | Decide whether Production online payments are required for the next cohort and whether practical scheduling depth is sufficient. |
| Before charging contractors | Approve plans, trial, limits, billing enforcement, cancellation/refund policy, and support promise. |
| Before any provider or public rollout | Approve the exact provider, cohort, operational policy, environment changes, and production action required by repository rules. |

## Maintenance Rules

- Update this roadmap when stage sequence, launch gates, target cohort, or product-priority decisions materially change.
- Keep feature-level state, rollout precision, and detailed next steps in the Feature Backlog.
- Keep completed milestones in ServSync Completed Features and implementation/rollout history in the Changelog.
- Keep product purpose and enduring principles in Product Vision & Philosophy.
- Keep module ownership and navigation rules in Product Information Architecture.
- Do not copy long implementation diaries into this roadmap.
- Every roadmap task still requires a narrow implementation outcome and applicable protected-change approval.
