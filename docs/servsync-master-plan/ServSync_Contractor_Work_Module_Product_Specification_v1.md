# ServSync Contractor Work Module Product Specification v1

## 1. Purpose

This document defines the contractor-facing Work module for ServSync.

Work is the contractor lifecycle capability that helps a contractor plan, launch, perform, finish, bill, document, and later review customer work. It sits beneath the Product Vision & Philosophy and Product Information Architecture, and above implementation plans, backlog slices, and code-level decisions.

Document hierarchy:

- Product Vision & Philosophy defines why ServSync exists and the principles it follows.
- Product Information Architecture defines where capabilities belong and how users navigate.
- This Work Module Specification defines the contractor Work experience.
- The Master Plan and Feature Backlog define execution state, sequencing, and implementation priorities.

This document controls:

- Work module product boundaries.
- Contractor-facing Work mental model.
- Work Dashboard behavior.
- Draft-first planning and launch lifecycle.
- Job, Estimate, Invoice, Report, Template, and scheduling relationships inside Work.
- Navigation, mobile, permissions, entitlement, migration, and acceptance rules.

This document does not control:

- Exact React architecture.
- Database table design.
- SQL/RPC/RLS implementation.
- Final engineering sequence.
- Production rollout timing.
- Subscription pricing.
- Enterprise operations features.

Each implementation slice still requires its own audit, approval, validation, and merge gate.

## 2. Work Module Mission

Contractor Work turns customer needs into planned, approved, completed, documented, and billable work.

Primary contractor question:

`What work needs my attention, and what should happen next?`

Work owns:

- Draft lifecycle and launch rules.
- Operational Job lifecycle.
- Estimate creation and management.
- Invoice creation and management.
- Job History.
- Reports and checklists attached to work.
- Scheduling and visits tied to work execution.
- Work item scope.
- Work-level closeout.
- Work templates that help begin or repeat work.

Work references:

- Customers for homeowner/customer identity, property context, relationship history, permissions, and service requests.
- Business for business-health summaries and performance signals.
- Growth for leads, Discover, referrals, and reputation context after they become work opportunities.
- Company for team, roles, permissions, integrations, subscription settings, and business profile configuration.
- Homeowner-facing Service for homeowner-visible request, estimate, job, invoice, and appointment surfaces.
- Homeowner Records for final home history and homeowner-visible completed records.
- Homeowner Maintenance for future maintenance planning that may begin from prior work.

Work does not own:

- Customer master data.
- Homeowner property master data.
- Discover marketplace visibility.
- Company settings.
- Subscription administration.
- Global support or privacy content.

## 3. Contractor Work Mental Model

The Work module begins from contractor intent, not document types.

Contractors usually enter Work with one of two different intentions:

1. Start something new.
2. Continue, manage, finish, or review existing Work.

These intentions should remain distinct. Starting new Work is a deliberate creation action into the lifecycle. The Work destination primarily manages records once they exist.

### Start New Work

Start New Work is the contractor's deliberate creation intention.

Examples:

- Start New Draft.
- Start from a Service Request.
- Start from customer or property context.
- Start from a Template.
- Start similar work from a prior Job.
- Start from Job History.
- Capture new scope after a customer call.

Start New Work should create no side effects until the contractor intentionally chooses an outcome. Trusted context may prefill the Draft, but Start New Draft must initialize clean state unless that context is intentionally supplied.

Draft launch principle:

`A Draft is temporary planning. A workflow begins when the Draft is launched.`

Product rules:

- A Draft is private contractor planning.
- A Draft is not yet an active operational workflow.
- A Draft is not part of the homeowner's permanent record.
- A Draft may be saved and resumed while planning continues.
- A Draft may have an initial intended output.
- The intended output may change before launch.
- Launching creates exactly one initial first-class record.
- The initial launch output may be an Estimate or a Job.
- Direct Invoice launch is deferred until separately approved in a later slice.
- Once launched, the Draft is consumed and no longer remains an active Draft.
- The created record becomes the first active record in the workflow.
- Later records are created from the active workflow, not from the consumed Draft.
- A Job may later produce an Estimate.
- An Estimate may later produce a Job.
- A Job or Estimate may later produce an Invoice.
- The workflow is flexible and is not restricted to one rigid linear sequence.
- User-facing actions may continue to say `Create Estimate`, `Create Job`, and `Create Invoice`.
- `Launch` is an internal product and architecture term for now, not necessarily final UI wording.

Valid workflow examples:

- Draft -> Estimate -> Job -> Invoice.
- Draft -> Job -> Invoice.
- Draft -> Job -> Estimate.
- Draft -> Job -> Estimate -> additional approved work.

Invalid conceptual model:

- One active Draft independently creates multiple permanent outputs forever.

Preferred conceptual model:

- One Draft launches one workflow; the workflow produces later linked records.

### Manage Existing Work

Manage Existing Work is the contractor's continuation, attention, execution, closeout, and review intention. It contains the Plan, Perform, Finish, and Review modes below.

#### Plan Existing Work

Plan Work is where the contractor captures intent before the final outcome is known.

Examples:

- Continue Draft.
- Review future or upcoming work.
- Build an Estimate.
- Review customer, property, request, or prior-work context.

Plan Work should keep side effects low. Starting or saving planning information should not notify a homeowner, create an appointment, activate a Job, create an Estimate, create an Invoice, or expose contractor-only details.

#### Perform Work

Perform Work is where the contractor executes operational work.

Examples:

- Open an active Job.
- Review scope.
- Complete work items, tasks, checklist items, or report findings.
- Add notes and photos where supported.
- Update status.
- Document work performed.

Perform Work should keep the operational next action obvious. Billing may be visible, but it must not dominate the first experience after a Job is opened.

#### Finish Work

Finish Work is where the contractor closes the loop.

Examples:

- Review completed scope.
- Create or finalize an Invoice.
- Finish a required report.
- Complete or close a Job.
- Send appropriate customer-facing records.

Finish Work should separate operational closeout from billing. A Job can be operationally complete before every billing or payment workflow is finished.

#### Review Past Work

Review Past Work is where the contractor finds prior work and starts from known context.

Examples:

- Job History.
- Previous Estimates.
- Previous Invoices.
- Reports.
- Prior customer/property work.
- Start Similar Draft.

Review Past Work should preserve the home and customer relationship context while avoiding accidental duplication of records.

## 4. Global and Module-Level Actions

Actions should be broad only when they are common, safe, and meaningful from many places.

`Start New Draft` is an action, not a destination.

Approved placement hierarchy:

1. Trusted contextual actions.
2. Work header shortcut.
3. Work empty-state primary action.
4. Possible command or quick-action menu later.

Initial redesign should not introduce:

- a separate global Draft navigation item,
- a separate bottom-navigation item,
- an indiscriminate application-wide floating action button,
- equal `Start New Draft` placement on every screen,
- `Start New Draft` as the first Work Dashboard content section.

Potential broad actions:

- Start New Draft.
- Search.
- Notifications.
- Quick customer lookup.

Work-only actions:

- Create Estimate.
- Create Job.
- Create Invoice.
- Complete Job.
- Manage Job status.
- Manage billing.
- Finalize reports.
- Start Similar Draft from prior Work.

`Start New Draft` may be reachable from more than one place, but it should not automatically become a global destination. A contextual Draft action is justified only when:

- the current screen has trusted context,
- prefilled values reduce contractor effort,
- the action creates no side effect,
- mobile presentation remains simple,
- the resulting Draft has a clear source relationship,
- duplicate customer, property, request, Draft, Estimate, Invoice, or Job records are avoided.

Availability depends on:

- Work entitlement,
- user role,
- write permission,
- valid trusted context where context is supplied,
- duplicate-prevention rules.

Mobile rule:

One global Work destination is preferred. Do not overload mobile navigation with separate global Drafts, Jobs, Estimates, Invoices, Reports, and Templates destinations during the initial redesign.

## 5. Current State

Current Production state:

- Production serves the legacy Jobs workflow.
- `VITE_DRAFT_JOB_UI_ENABLED` is absent in Production.
- Draft-first code is merged but gated off in Production.
- Draft backend SQL/RPC foundations remain installed.
- Draft-first Work development should continue in sandbox/preview until the redesigned Work experience is cohesive, validated, and approved.

Current implementation state:

- The current Jobs area mixes operational Jobs, Estimates, Invoices, Reports, Templates, Custom Pricing, Service Agreements, and legacy creation flows.
- Current Draft composer foundations are reusable.
- `Create Job` from Draft exists in code but is gated with the Draft UI.
- `Create Estimate` and `Create Invoice` from Draft are not implemented.
- Continue Draft now refetches canonical persisted Draft records before opening.
- Composer Drafts are excluded from operational lists and request-linked active service visit logic.
- Current operational Job detail is too billing-heavy for the target Job Overview experience.
- Current navigation reflects legacy implementation and subscription-history groupings such as `Add-Ons`.

This specification does not make the Work redesign live.

## 6. Target Work Architecture

Work should initially remain one global navigation destination.

Work Dashboard manages and surfaces existing Work. Creation enters Work through controlled actions.

Primary internal destinations:

- Work Dashboard.
- Drafts.
- Open Jobs.
- Job History.
- Estimates.
- Invoices.

Secondary or internal tools:

- Reports.
- Templates.
- Scheduling.
- Service agreements where appropriate.
- Custom pricing where appropriate.

Destination types:

| Destination | Type | Initial role |
| --- | --- | --- |
| Work Dashboard | Primary landing | Attention, next action, and orientation |
| Drafts | Primary internal destination | Contractor-only planning records |
| Open Jobs | Primary internal destination | Active operational work |
| Job History | Primary internal destination | Completed, closed, cancelled, and archived work |
| Estimates | Primary internal destination | Proposal snapshots and customer approval |
| Invoices | Primary internal destination | Billing snapshots and payment status |
| Reports | Job area plus internal Work access | Checklist/report output tied to Jobs |
| Templates | Secondary tool | Prefill Drafts after Draft and Work landing are stable |
| Scheduling | Dashboard summary plus Work-owned internal view | Operational commitments |
| Service Agreements | Secondary/future Work-adjacent area | Recurring work offering, not core initial redesign |
| Custom Pricing | Company/Work reference tool | Pricing source, not core Work navigation |

The Work module should prioritize attention and next actions, not six equal folders.

Starting a Draft should not require first navigating through the Work Dashboard when a trusted contextual action is available. The Work Dashboard may still retain a secondary header shortcut for convenience.

## 7. Work Dashboard

The Work Dashboard is not a folder menu. It answers:

`What existing work needs my attention, and what should happen next?`

The dashboard should prioritize:

- Drafts needing continuation.
- Active Jobs.
- Upcoming work.
- Waiting on customer.
- Ready-to-invoice work.
- Overdue or action-required records.
- Recent activity.
- Job History access.

When ongoing Work exists, the largest visual priority should be existing Work needing attention, not creation.

### Creation Shortcut

Purpose:
Provide a deliberate shortcut into Start New Draft without making creation the dashboard's primary content.

Inclusion:
Available to authorized Work users when Draft-first Work is enabled, role permissions allow Draft creation, and duplicate-prevention rules are satisfied.

Action:
Open a blank Draft composer. It must not reuse stale state.

Empty state:
If there is no Work yet, Start New Draft may become the primary empty-state action.

Mobile:
Compact Work-header action or future approved Work-scoped control. It should not crowd every Work subview.

Desktop:
Secondary Work-header action when existing Work is present.

Initial Work redesign:
Required.

### Drafts Needing Attention

Purpose:
Surface temporary planning records that may be continued, launched, or discarded.

Inclusion:
Exact contractor composer Drafts only.

Count/status logic:
Sort by `draft_saved_at` or `updated_at`. Include staleness and last-updated labels.

Action:
Continue Draft.

Empty state:
No saved Drafts. Start a Draft when you need to plan work before choosing an outcome.

Mobile:
Show the most actionable Drafts first, with a link to the Drafts destination.

Desktop:
Compact cards or table rows with customer, property, source, last updated, and next action.

Initial Work redesign:
Required.

### Active Jobs

Purpose:
Show operational work that is scheduled, in progress, waiting, or otherwise open.

Inclusion:
Operational Jobs only. Exact composer Drafts are excluded.

Count/status logic:
Use operational lifecycle status and work item state. Billing state may supplement but must not define the section.

Action:
Continue Job.

Empty state:
No active Jobs. Start a Draft or create work from accepted requests/estimates.

Mobile:
Condensed cards with next action and status.

Desktop:
Attention-focused list, not a full history table.

Initial Work redesign:
Required.

### Accepted Estimates Ready For Job Creation

Purpose:
Move approved customer proposals into operational work without duplicates.

Inclusion:
Accepted Estimates without a linked Job.

Count/status logic:
Existing duplicate prevention remains authoritative.

Action:
Create or view the correct Job using protected accepted-estimate-to-job behavior.

Empty state:
No accepted Estimates need a Job.

Mobile:
Show only if action is needed.

Desktop:
Attention card inside the dashboard.

Initial Work redesign:
Required.

### Estimates Waiting On Customer Action

Purpose:
Keep proposals visible without turning the Work Dashboard into an estimate list.

Inclusion:
Sent or customer-review Estimates waiting on homeowner/customer response.

Action:
Open Estimate detail.

Initial Work redesign:
Useful, but can be compact.

### Completed Jobs Ready To Invoice

Purpose:
Help contractors finish billing after operational completion.

Inclusion:
Completed or closed Jobs with invoiceable scope and no appropriate non-void Invoice.

Action:
Open Job Overview or Invoice creation path.

Initial Work redesign:
Required, because this is a core closeout next action.

### Overdue Or Action-Required Invoices

Purpose:
Keep billing follow-up visible without making billing the identity of active work.

Inclusion:
Draft, overdue, partially paid, or otherwise action-required Invoices.

Action:
Open Invoice detail.

Initial Work redesign:
Required as a compact attention section.

### Upcoming Schedule Snapshot

Purpose:
Show upcoming operational commitments.

Inclusion:
Confirmed or proposed work-related appointments, visits, and scheduled Jobs.

Action:
Open schedule detail, Job, or request context.

Initial Work redesign:
Recommended if current Calendar data supports it without new backend work.

### Recent Work Activity

Purpose:
Orient the contractor after returning to Work.

Inclusion:
Recent Draft, Job, Estimate, Invoice, Report, or scheduling activity.

Action:
Open the relevant record.

Initial Work redesign:
Optional for first implementation slice.

### Job History Access

Purpose:
Give a clear path to prior work without cluttering the dashboard.

Action:
Open Job History.

Initial Work redesign:
Required as navigation, not necessarily a large section.

### Templates Access

Purpose:
Keep reusable tools reachable during migration.

Action:
Open Templates as a secondary internal Work tool.

Initial Work redesign:
Optional. If retained, present as a secondary tool, not a primary dashboard peer.

## 8. Drafts

Drafts are contractor-only temporary working records.

A Draft is temporary planning. A workflow begins when the Draft is launched.

Required Draft behavior:

- `Start New Draft` initializes clean state.
- `Continue Draft` loads one canonical persisted Draft.
- Drafts may store an intended output while planning continues.
- Intended output may change before launch.
- Drafts are not homeowner-visible.
- Drafts are not part of the homeowner's permanent record.
- Drafts do not appear in operational Job lists.
- Drafts do not trigger active service visit logic.
- Drafts do not receive operational actions.
- Drafts preserve source context where supported.
- Drafts use last-updated ordering.
- Draft cards show customer, property, source, title, summary, line count or total where appropriate, last updated, and age/staleness.
- Drafts should support search/filter after the list grows.
- Drafts should avoid indefinite clutter through user-facing discard/archive behavior.
- Draft discard/archive should be explicit and safe. Automated cleanup is not required unless separately approved.
- Launched Drafts are consumed and should leave active Draft lists.
- Consumed Drafts should be distinguishable from active Drafts through linked launch outcome state, not left as competing active planning records.
- Where practical, warn that a similar unfinished Draft already exists for the same source request, customer, property, or work context.
- Similar-Draft warnings should guide reuse or continuation. They should not intrusively block creation without evidence.
- When an appropriate linked Draft already exists, the contractor may intentionally choose to continue or reuse it.

Expected Draft lifecycle:

1. Start New Draft or contextual Start New Draft.
2. Continue and edit.
3. Optionally choose or change intended output.
4. Save Draft and return later, or launch the Draft.
5. Launch creates exactly one initial first-class record: Estimate or Job in the first shared-composer launch path.
6. Direct Invoice launch is deferred until separately approved.
7. The created record becomes the first active record in the workflow.
8. Later Estimate, Job, Invoice, or additional-work records are created from the active workflow, not from the consumed Draft.
9. Or discard/archive when no longer useful.

Consumed Draft behavior:

- A Draft launched as a Job should leave Drafts because it is now an operational Job workflow.
- A Draft launched as an Estimate should leave Drafts because the Estimate is now the first active workflow record.
- The consumed Draft should retain immutable source/linkage evidence needed for auditability, duplicate prevention, and later workflow relationship resolution.
- A consumed Draft should not remain editable as an active planning hub after a successful launch.
- Later records should link through the active Estimate or Job workflow, not by repeatedly reusing the consumed Draft as a permanent creation hub.

Mobile behavior:

- Show a short list of most recent/actionable Drafts on the dashboard.
- Keep a dedicated internal Drafts view for deeper search/filter.
- Avoid table-only layouts.

Empty state:

- "No Drafts yet. Start a Draft when you want to plan work before choosing an outcome."

## 9. Draft Composer

The Draft composer is the shared contractor work-entry surface.

The shared composer should support one active Draft planning state with an intended output selector. The intended output helps the UI show the right outcome-specific fields and primary action, but it must not create records or customer-facing visibility until launch.

### Context

Fields:

- customer/homeowner
- local customer/contact
- property/home
- source request or source record
- connection context

Required:

- customer/contact
- property where property-specific work is required

Optional:

- source request/source record

Persistence:
Existing customer/property IDs must be reused. Missing active selector options must not blank saved selections.

Validation:
Outcome-specific validation may require additional context. Save Draft may allow less than Create Job or customer-facing outcomes.

### Work Summary

Fields:

- title
- scope summary
- job/service type if used

Required:
Title and meaningful scope for outcome actions. Save Draft may permit a lighter minimum if the UX clearly labels it incomplete.

Persistence:
Title and scope must round-trip.

### Intended Output

Fields:

- intended output
- available launch actions
- outcome-specific guidance where needed

Initial approved intended output options:

- Estimate
- Job

Deferred:

- Direct Invoice launch is not part of the first shared Draft Composer launch slice.

Rules:

- Intended output may default from trusted context where safe.
- The contractor may change intended output before launch.
- Changing intended output must preserve shared Draft data.
- Changing intended output must not create, send, activate, or expose records.
- Outcome-specific hidden session fields should be preserved while the contractor switches intent during the same editing session where practical.
- The final launch action validates the currently selected output.
- If an alternate launch action is shown, it should switch intent and validate that outcome before launch.

### Scope And Line Items

Fields:

- labor
- materials
- fees
- description
- quantity
- units
- pricing
- labor hours where supported
- room
- location
- line notes
- internal visibility

Persistence:
Supported fields must round-trip. Unsupported fields must not be presented as durable.

Current durable Draft scope fields include:

- line type
- description/title
- quantity
- unit
- unit price
- labor hours
- room
- location
- internal line notes
- sort order
- persisted work item IDs

### Scheduling Intent

Fields:

- proposed date
- proposed time or time window
- scheduling notes

Product rule:
Scheduling intent on a Draft must not automatically create an appointment or visit.

Current status:
Initial scheduling intent is backend-dependent and should not be promised as durable unless a persistence contract exists.

### Supporting Information

Fields:

- internal notes
- customer-facing notes where appropriate
- photos
- attachments
- documents

Current status:
Top-level Draft notes have no durable backend/RPC contract. Draft photos/attachments/documents are not part of the current durable Draft contract.

Product rule:
Do not show unsupported fields as durable. If required, add a separate backend-contract slice before implementation.

### Totals

Fields:

- subtotal
- tax where supported
- discounts where supported
- total

Current status:
Draft scope total can be derived from line items. Tax, discounts, and full customer-facing totals are outcome-dependent and may belong to Estimate or Invoice snapshots.

### Outcome Area

Actions:

- Save Draft
- Create Estimate
- Create Job
- Create Invoice only after a later direct-Invoice launch slice is separately approved

Rules:

- Save Draft is optional.
- Outcome actions persist current composer state before launch.
- Outcome validation happens at the action boundary.
- Failed persistence must not proceed to outcome creation.
- Failed outcome creation must preserve recoverable Draft state.
- Successful launch consumes the Draft and opens the created Estimate or Job workflow record.
- A consumed Draft must not remain available as an active Draft that can repeatedly create unrelated outputs.

Mobile:
Outcome actions must remain reachable without burying the contractor under long forms.

Desktop:
Outcome area should be visually distinct from line-item editing.

## 10. Draft Launch Model

Internal principle:

`A Draft is temporary planning. A workflow begins when the Draft is launched.`

User-facing language may continue to use `Create Estimate`, `Create Job`, and later `Create Invoice`. `Launch` is the product architecture term that defines lifecycle behavior.

### Save Draft

Product behavior:

- Optional pause-and-return action.
- Creates no operational side effects.
- Creates no homeowner visibility.
- Creates no appointment.
- Creates no Estimate.
- Creates no Invoice.
- Does not activate a Job.

### Launch Rules

Product behavior:

- Launching creates exactly one initial first-class record.
- The initial record is the first active record in the workflow.
- The active workflow owns later record creation.
- The consumed Draft is no longer an active Draft.
- Launch must be atomic enough that the system does not create an output while leaving a reusable active Draft behind.
- Duplicate launch must be prevented through backend-enforced state or idempotent launch behavior, not only frontend button disabling.

Approved initial launch outputs:

- Estimate.
- Job.

Deferred launch output:

- Direct Invoice launch requires a later approved slice.

### Create Job

Product behavior:

- Persist current Draft state.
- Launch as an operational Job where approved by existing design.
- Preserve Draft/job UUID.
- Preserve work-item identity.
- Open operational Job Overview.
- Do not create an Estimate or Invoice unless explicitly chosen.
- Consume the active Draft state so it no longer appears as a Draft needing continuation.

Current status:
Create Job exists in code behind the Draft UI gate. The full Work redesign is not live in Production.

### Create Estimate

Product behavior:

- Persist current Draft state.
- Create an immutable proposal snapshot.
- Preserve source Draft/context.
- Continue into Estimate workflow.
- Do not activate a Job unless later chosen or triggered by approval workflow.
- Consume the active Draft state so it no longer appears as a Draft needing continuation.
- Later accepted Estimate -> Job behavior must link to the correct workflow and avoid duplicate Jobs.

Backend-dependent:
Snapshot mapping, durable source context, Draft consumption state, and accepted Estimate -> correct Job behavior must be specified before implementation.

### Later Workflow Records

After launch, later records are created from the active workflow record:

- A Job may later produce an Estimate for additional or revised work.
- An Estimate may later produce a Job after approval.
- A Job or Estimate may later produce an Invoice.
- Additional approved work may attach to the same Job where applicable.
- Later records must use durable workflow linkage and duplicate prevention.

### Create Invoice

Product behavior:

- Direct Draft -> Invoice launch is deferred.
- Invoice creation from a Job or Estimate remains part of the broader billing workflow.
- Invoice creation must not imply payment allocation, final reconciliation, or closeout unless supported.

Backend-dependent:
Invoice snapshot behavior, source context, and billing constraints must be specified before implementation.

This document defines direct Invoice launch as a future capability, not part of the first shared Draft Composer launch slice.

## 11. Open Jobs

Open Jobs include operational records that still need work, scheduling, review, or closeout.

Qualifying states:

- scheduled
- in progress
- draft/active legacy operational states that are not exact composer Drafts
- completed but still needing operational review where currently modeled

Exclusions:

- exact composer Drafts
- closed/cancelled/archived Jobs
- records that are only Estimates or Invoices
- reports that are not operational Jobs

Sorting:

- attention needed first
- scheduled/upcoming next
- recently updated next

Filtering/search:

- customer
- property
- status
- date
- job type
- source request
- ready-to-invoice
- blocked/waiting

Card contents:

- title
- customer
- property
- operational status
- schedule
- crew/assignment where supported
- scope summary
- linked Estimate/Invoice indicators
- next action
- work item progress
- billing readiness only as a secondary signal

Today/Upcoming should initially be dashboard attention sections or filters, not separate global destinations. Dedicated internal views may come later if usage justifies them.

## 12. Operational Job Overview

The target Job detail experience must be operational first.

Default first view:
Overview.

Recommended areas:

- Overview.
- Scope / Work Items.
- Tasks / Checklist / Report.
- Schedule.
- Notes / Photos / Documents.
- Estimates & Approvals.
- Billing.
- Activity / History.

Above-the-fold information:

- customer/property header
- status
- schedule
- crew/assignment where supported
- scope summary
- current next action
- homeowner-visible status summary where applicable
- linked source request, estimate, invoice, or report records

Completion controls:

- complete work items
- finalize/check report requirements where applicable
- mark operational status
- start invoice when appropriate

Reopen behavior:
Future work. Do not expose broad reopening until lifecycle, audit history, billing, and homeowner visibility rules are approved.

Additional work:
Future additional-work Estimates should attach to the same Job where applicable.

Billing:
Partial invoicing belongs inside Billing. It must not appear as the defining first experience after Job creation.

## 13. Job History

Job History is the target historical destination.

Purpose:
Help contractors review completed, closed, cancelled, archived, and reopened work without crowding active Jobs.

Included statuses:

- completed
- closed
- cancelled
- archived where supported
- reopened with clear current/historical state

Sorting:
Most recently closed/completed or updated by default.

Filtering/search:

- customer
- property
- date
- status
- job type
- report/checklist
- invoice state
- source request

Record contents:

- final Estimate links
- final Invoice links
- reports
- Home History links where permitted
- activity summary
- Start Similar Draft action where context can be reused safely

Mobile:
Use compact cards, clear filters, and readable status labels.

Empty state:
No job history yet. Completed Jobs will appear here after work is wrapped up.

## 14. Estimates

An Estimate is a customer-facing proposal snapshot.

Estimate from Draft:

- Persist current Draft state.
- Launch the Draft as an immutable proposal snapshot.
- Preserve source Draft/context.
- Continue into Estimate workflow.
- Do not activate a Job automatically.
- Consume the Draft so the Estimate becomes the first active workflow record.

Estimate from active Job:

- Used for additional work or revised scope when approved.
- Should attach to the same Job where applicable.
- Must not create a duplicate operational Job.
- Shows that a Job may later produce an Estimate when the workflow needs customer approval for revised or additional work.

Estimate list:

- Show status, customer, property, amount, updated date, source context, and next action.
- Support search/filter/sort.

Estimate detail:

- Show proposal snapshot, terms, schedule/payment schedule where supported, customer review state, approval/decline, and linked Work records.

Accepted Estimate behavior:

- Accepted Estimate should create or update the correct Job through protected duplicate-prevention behavior.
- Existing accepted-estimate-to-job duplicate prevention remains critical.

Homeowner permissions:

- Homeowners see only sent/customer-facing Estimates and permitted related context.

Mobile:

- Review and approval actions must be readable and not hidden behind dense document controls.

Backend-dependent areas:

- Draft -> Estimate launch and consumption contract.
- Additional-work Estimate -> same Job contract.
- Revision/snapshot history.
- Offline/bypass approval evidence.

## 15. Invoices and Billing

Invoices are customer-facing billing snapshots.

Supported or target invoice paths:

- Direct Invoice launch from Draft, deferred until separately approved.
- Invoice from Job.
- Simple/full Invoice.
- Deposit Invoice.
- Progress Invoice.
- Partial/item-based Invoice.
- Final Invoice.

Billing rules:

- Invoice options provide contractor flexibility.
- Billing is not the primary identity of active Job work.
- The first shared Draft Composer launch slice should not include direct Invoice launch.
- Invoices should usually be created from the active workflow record after launch, such as a Job or Estimate, unless a later direct-Invoice launch slice approves a safe exception.
- ServSync should not become the accounting system.
- ServSync should not become the payment processor.
- Accounting and payment integrations remain boundaries unless separately approved.

Amount-only versus line-item approaches:

- Line-item billing should preserve work-item source context where supported.
- Amount-only billing may be useful for deposits/progress/final billing, but must not weaken auditability or customer understanding.

Paid-line locking:

- Paid, voided, and customer-facing invoice states need stricter edit rules than draft states.

Voiding:

- Voiding should preserve audit trail and avoid deleting customer-facing billing history.

Reopening:

- Reopening after invoicing/payment is future work and requires explicit lifecycle/audit rules.

Final payment:

- Final payment status is not the same as operational completion.

Homeowner review:

- Homeowner-facing invoice review should show clear amount, scope, due state, payment status where supported, and links to Home History where filed.

Current versus future:

- Existing invoices, partial invoicing foundations, paid/void behavior, and whole-job fallback remain protected.
- Payment collection, invoice allocation rewrites, final reconciliation, payment ledger, and accounting export are future separately approved work.

## 16. Reports, Inspections, and Checklists

ServSync may keep internal `inspections` naming where existing schema requires it. Contractor-facing terminology should use Job, Report, or Checklist where appropriate.

Relationship:

- A Job is the operational record.
- A checklist is a structured work/review method.
- A report is the customer/homeowner-facing output when finalized.
- Templates may seed checklist/report structure.
- Final homeowner-facing reports should remain tied to the relevant Job and property.

Reports should be:

- a Job area when attached to active work,
- accessible from Work where contractors need to find report records,
- canonically owned under the operational Job when the report exists because of that Job.

Reports should not compete with Jobs as an unrelated creation system.

Checklist/report Jobs remain supported during migration.

## 17. Templates

Templates are internal and secondary within Contractor Work.

Template purpose:

- speed repeat work,
- prefill Draft context and scope,
- support repeatable checklist/report structures,
- reduce re-entry.

Template types:

- Draft/work templates.
- Estimate templates.
- Checklist/report templates.
- Service agreement templates where recurring work requires them.

Target behavior:

- Templates primarily start or prefill Drafts.
- Templates must not compete with Start New Draft.
- Template selection should show what will be copied and what must be reviewed.
- Existing Templates may remain available during migration.
- Template redesign follows stabilization of Draft and Work Dashboard.

Mobile:

- Templates should not become a separate global mobile destination during the initial Work redesign.

Initial limitations:

- Do not promise all current template line-item/pricing behavior maps directly into Drafts until tested and approved.
- Do not create a global template-to-invoice path without selected customer/context.

## 18. Scheduling and Calendar

Calendar and operational scheduling belong conceptually to Work.

Draft scheduling intent:

- May capture proposed date, time/window, and notes.
- Must not automatically create appointments or visits.
- Is backend-dependent until durable fields/contracts are approved.

Appointment creation:

- Should be explicit.
- Should make customer/homeowner visibility clear.
- Should not happen from Save Draft alone.

Visit scheduling:

- Belongs with operational Jobs and Work calendar.
- May reference Customers and Service Requests.

Crew assignment:

- Useful for growing contractors, but deeper crew/dispatch behavior is future advanced Work or Company/Team capability.

Status transitions:

- Scheduling can affect next action, but should not silently change billing or closeout states.

Future boundaries:

- Multi-crew dispatching, route optimization, workforce management, and advanced scheduling are later optional capabilities.

## 19. Contextual Start New Draft

Rule:

`Only offer Start New Draft where trusted context helps the contractor begin work faster without creating side effects or duplicate records.`

Contextual Start New Draft is preferred when the contractor's intent and source context are clear. It should prefill only trusted data. The resulting Draft is a separate Work-owned record, source linkage is preserved, customer and property identities are reused, and duplicate operational records are prohibited.

| Surface | Trusted context | Prefill candidates | Source relationship | Initial scope |
| --- | --- | --- | --- | --- |
| Customer profile | customer, local/connected identity, property list | customer, default/selected property | customer source | Initial |
| Property profile | property, owner/customer, prior records | customer, property, property notes where permitted | property source | Initial or early |
| Service Request | request, customer, property, category, message | customer, property, request title/scope/source | service request source | Initial after handoff rules |
| Calendar appointment | customer, property, date/time, visit notes | customer, property, scheduling intent | appointment source | Later unless durable schedule intent exists |
| Prior Job | customer, property, prior scope | Start Similar Draft with selected prior scope | prior Job source | Later |
| Job History | completed work context | Start Similar Draft | historical Job source | Later |
| Accepted lead/opportunity | lead/customer context | customer, property where known, source note | Growth source | Later |
| Message thread | customer/contextual message | customer, property if explicit, summary | message source | Later |
| Template | reusable scope/template | template scope/lines | template source | Later after Draft stability |

Duplicate prevention:

- Reuse existing customer/homeowner identity.
- Reuse existing property identity.
- Preserve source request/source record.
- Do not create duplicate operational Jobs when one is already linked.
- Do not create duplicate customer or property records.
- Do not turn a Service Request into a Draft by mutating the request itself.
- Do not create customer-facing activity until an outcome requires it.

Resulting route:
Open Draft composer with source context visible.

Visibility:
Contractor-only until an outcome creates homeowner-visible state.

## 20. Navigation and State Model

Target navigation:

- One global Work entry.
- Work Dashboard as the default landing for managing existing Work.
- Internal Work destinations for Drafts, Open Jobs, Job History, Estimates, and Invoices.
- Reports, Templates, and Scheduling as secondary or contextual Work areas.
- Start New Draft as an action, not a global destination.
- Authorized contractors may invoke Start New Draft from trusted shortcuts without first viewing the Work Dashboard.

Routes and deep links should support:

- Work Dashboard.
- Draft detail/continue.
- Job Overview.
- Estimate detail.
- Invoice detail.
- Job History filters.
- Source links from Customers and Service Requests.

State rules:

- Start New Draft always begins clean unless trusted context is intentionally supplied.
- Continue Draft always loads one canonical persisted Draft.
- Continue Job always loads one operational Job.
- Creation, continuation, and operational state must not share stale in-memory composer state.
- Browser refresh must not blank resumed Drafts or Jobs.
- Back behavior should return to the meaningful prior Work or Customer context.
- Feature gating must keep production legacy-safe until approved.
- Stale state should clear when moving between Draft, Job, Estimate, and Invoice workflows.

Mobile:

- Keep Work as one mobile destination.
- Use internal tabs, segmented controls, or drill-in views only when they stay readable.
- Do not create global mobile destinations for Drafts, Jobs, Estimates, Invoices, and Templates during initial redesign.
- Do not create a separate global mobile navigation item for Start New Draft.
- Do not create a global Drafts bottom-navigation destination.
- Allow a compact Work-header action.
- Allow trusted contextual actions.
- A Work-scoped floating action button may be evaluated during screen design, but it is not approved by this specification.

Desktop:

- Internal Work navigation may be richer, but it should still reflect the same mental model as mobile.

## 21. Permissions and Entitlements

Draft visibility:

- Drafts are contractor-only.
- Homeowners cannot see Drafts or Draft scope.
- Unrelated contractors cannot see another contractor's Drafts.

Contractor roles:

- Owner/admin/office users can manage Drafts and financial outcomes where current permissions allow.
- Field technicians should focus on operational execution, notes, photos, checklist/work completion, and similar non-financial work unless explicit company permission is approved later.
- Field technician Draft creation and financial outcomes depend on future role permissions. Do not assume access to Estimates or Invoices.
- Viewers remain read-only.
- Viewers should not receive Draft creation actions.

Connected versus local customers:

- Connected customers use permission-aware homeowner/property context.
- Local customers remain contractor-owned until claimed/connected.
- Missing active selector options must not erase saved IDs.

Entitlements:

- Navigation remains coherent even when capabilities are locked.
- Locked capabilities should appear where expected, with clear unavailable or upgrade states.
- Discover-only contractors should not see an enterprise operations control panel.
- Discover-only contractors should not encounter a dead-end Start New Draft flow. The action may be hidden or shown as a clear upgrade state according to later entitlement UX.
- Work subscribers can receive operational Work access.
- Work-enabled contractor roles can receive Start New Draft based on write permission.
- Team and advanced operations capabilities may become optional/tiered later.
- Future packages should not reorganize navigation. Entitlement controls action availability.

Do not define prices or final plan names in this specification.

## 22. Backend and Data Contracts

Product-level contract classification:

| Contract | Classification | Notes |
| --- | --- | --- |
| Draft persistence | Existing/reusable | Backend installed; UI gated in Production |
| Draft work items | Existing/reusable | Uses `job_work_items` as canonical scope foundation |
| Top-level Draft notes | Required blocker if exposed | No durable contract currently; do not promise as durable |
| Intended output | Required for shared launch resume | Needs durable round trip before saved/resumed Drafts depend on selected intent |
| Draft photos/attachments | Later enhancement | Requires storage/RLS/media design |
| Source context | Required blocker for contextual Drafts | Existing service/customer IDs help, but fuller source model may be needed |
| Scheduling intent | Required blocker if initial spec includes durable scheduling fields | Must not create automatic appointments |
| Draft -> Job launch | Existing/reusable, needs shared-composer validation | Current code uses activation RPC behind gate and consumes Draft by activating the same record |
| Draft -> Estimate launch | Required blocker | Needs atomic snapshot/source/consumption contract |
| Draft -> Invoice launch | Deferred blocker | Needs later direct-Invoice launch approval plus snapshot/source/billing contract |
| Draft consumption state | Required blocker for Estimate launch | Must prevent one active Draft from repeatedly launching unrelated outputs |
| Durable workflow linkage | Required blocker for Estimate launch | Must link source Draft, launched Estimate/Job, and later workflow records |
| Additional-work Estimate -> same Job | Required blocker | Must prevent duplicate Jobs |
| Duplicate launch prevention | Required blocker | Must be enforced at backend/RPC boundary, not only by frontend state |
| Duplicate Job prevention | Existing and required | Accepted-estimate-to-job protections remain critical |
| Activity/history | Later enhancement | Needed for mature traceability |
| Job closeout/reopen | Later enhancement | Requires lifecycle/audit/billing rules |
| Draft archive/discard | Required blocker if exposed | Must be safe and contractor-only |
| Homeowner-safe Job summary | Later enhancement | Must preserve permission boundaries |
| Invoice/payment limitations | Existing plus future | Payment collection/accounting remain future |
| Route/deep-link persistence | Required for redesign | Avoid blank or stale state after refresh |

This section is not SQL approval.

## 23. Legacy Migration and Retirement

Classification:

| Current surface | Treatment |
| --- | --- |
| Legacy Jobs label | Adapt after Work parity |
| New Jobs | Deprecate after Start New Draft and Work parity |
| Legacy Create Job | Retain temporarily |
| Create operational job now | Retain as fallback until approved retirement |
| Legacy Estimate creation | Retain until Draft -> Estimate launch is approved and validated |
| Legacy Invoice creation | Retain until Job/Estimate -> Invoice migration and any direct Invoice launch exception are approved |
| `new_financial` state | Rework into internal Work destinations |
| Partial Invoicing default emphasis | De-emphasize into Billing area |
| Current Reports | Reuse under Job/Work report model |
| Current Templates | Reuse/adapt as Draft prefill tools |
| Current header tabs | Adapt into Work internal navigation |
| Add-Ons grouping | Deprecate after navigation/subscription separation |
| Draft feature gate | Retain until cohesive Work redesign is approved |

Migration rules:

- Production remains legacy during sandbox/preview development.
- Do not partially replace Production Jobs again.
- Promote Work only after cohesive end-to-end acceptance.
- Legacy paths remain available until approved parity exists.
- Do not remove old flows merely because the specification exists.

## 24. Mobile Product Requirements

Mobile rules:

- One global Work destination.
- No global Drafts/Jobs/Estimates/Invoices/Templates overload.
- No separate global mobile-navigation item for Start New Draft.
- No global Drafts bottom-navigation destination.
- Clear internal navigation.
- Sticky primary actions only where justified.
- Compact but readable cards.
- Outcome actions remain accessible.
- Safe unsaved-state handling.
- Deep-link support.
- Predictable back behavior.
- No desktop-only mental model.

Mobile Work Dashboard:

- Show highest-priority attention cards first.
- Keep Drafts and active Jobs scannable.
- Allow a compact Work-header action.
- Allow trusted contextual actions outside Work where context is safe.
- Empty Work state may make Start New Draft visually primary.
- When ongoing Work exists, attention and continuation remain visually primary.
- A Work-scoped floating action button may be evaluated during screen design, but it is not approved by this specification.
- Avoid long table layouts.

Mobile Draft composer:

- Use sections that collapse or stack naturally.
- Keep outcome actions reachable.
- Warn clearly on unsaved changes or failed loads.

Mobile Job Overview:

- Operational status and next action first.
- Billing in its own area.
- Report/checklist actions visible when relevant.

## 25. Work Module Acceptance Criteria

Complete redesigned Work module acceptance criteria:

- Work Dashboard is attention and management first.
- Work Dashboard clearly communicates what existing Work needs attention.
- Start New Draft is reachable without becoming a separate global destination.
- Start New Draft is not a dashboard content card when existing Work is present.
- Empty Work state may use Start New Draft as its primary action.
- Contextual creation appears only where trusted context exists.
- Restricted or non-entitled users do not encounter dead-end creation flows.
- Draft accumulation is manageable through visibility, age, and discard/archive behavior.
- Start New Draft always starts clean.
- Continue Draft loads canonical persisted data.
- Draft intended output may change before launch.
- Launching a Draft creates exactly one initial first-class record.
- Launched Drafts are consumed and leave active Draft lists.
- Later workflow records are created from the launched Estimate or Job, not by repeatedly reusing the consumed Draft.
- Drafts remain isolated from operational records.
- Drafts do not appear in homeowner views.
- Drafts do not drive active service visits.
- Create Job opens an operational Job Overview.
- Create Estimate from Draft creates a proposal snapshot only after a durable launch/consumption contract is approved.
- Direct Create Invoice from Draft remains deferred until separately approved.
- Job Overview is operational first.
- Billing is secondary.
- Job History works as the historical destination.
- Service Request handoff preserves identity and linkage.
- No duplicate customer records are created.
- No duplicate property records are created.
- No duplicate operational Job records are created.
- Estimates remain proposal snapshots.
- Invoices remain billing snapshots.
- Reports/checklists remain tied to Work.
- Templates prefill Drafts instead of competing with Draft creation.
- Mobile navigation remains one Work destination and remains manageable.
- Production legacy Jobs remains unaffected during sandbox development.
- No Draft-first Production re-enable occurs until full approval.

## 26. Testing and Sandbox Validation

Required product test coverage:

- Work landing derivations.
- Dashboard counts.
- Routing.
- Start New Draft clean-state initialization.
- Canonical Continue Draft resume.
- Draft isolation.
- Intended-output selection and switching.
- Create Job launch from current Draft state.
- Create Estimate launch from current Draft state once the durable launch foundation is approved.
- Draft consumption after successful launch.
- Duplicate launch prevention.
- Future direct Create Invoice outcome only after separate approval.
- Local customer path.
- Connected customer path.
- Service Request handoff.
- Duplicate prevention.
- Accepted Estimate -> correct Job.
- Billing placement and partial-invoicing regressions.
- Job History.
- Mobile viewport.
- Feature flags.
- Production fallback.
- Reports/checklists.
- Templates prefill.
- Stale Draft behavior.

Sandbox validation scenarios:

1. New local customer Draft -> Save -> Continue -> Create Job.
2. Connected customer Draft -> Save -> Continue -> no homeowner leakage.
3. Service Request -> Start New Draft -> linked Work without duplicate customer/property/request/Job.
4. Draft -> Estimate launch consumes Draft and creates one proposal snapshot when that slice is approved.
5. Accepted Estimate -> correct Job, no duplicate.
6. Job -> Estimate for additional work attaches to the active workflow where applicable.
7. Completed Job -> billing attention without billing dominating Job Overview.
8. Template -> prefilled Draft, no competing direct creation.
9. Mobile Work Dashboard -> Draft -> Job Overview route and back behavior.
10. Feature flag disabled -> legacy Production-safe Jobs behavior.

Do not mutate Production for implementation validation unless a separate production validation prompt approves it.

## 27. Recommended Future Implementation Slices

These slices are planning recommendations only. Each requires its own audit and owner approval.

| Slice | User-visible behavior | Dependencies | Backend impact | Tests | Sandbox acceptance | Exclusions | Rollback risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. Work Dashboard and navigation shell | New Work landing in preview/sandbox | Product spec approval | None expected | landing counts, mobile layout, feature gate | dashboard renders with legacy-safe fallback | no outcome work | Low-medium |
| 2. Drafts list and clean state boundaries | Drafts internal destination and clean Start/Continue boundaries | Slice 1, existing Draft backend | None expected | canonical resume, no stale state | Drafts appear only in Drafts | no new outcomes | Medium |
| 3. Shared Draft composer shell and intended output | Sections align to target composer and support Estimate/Job intent switching | Slice 2 | None expected if persistence is not expanded | supported-field round trip, intent switching | local/connected Drafts restore and shared data survives switching | no launch beyond current safe path | Medium |
| 4. Operational Job Overview | Create/Continue Job opens operational-first overview | Slice 1, existing job data | None or minor | Job Overview, billing secondary | activated Job opens correctly | no billing redesign | Medium |
| 5. Durable Draft launch foundation | Persist launch intent, supported shared fields, consumption state, and workflow linkage | Slice 3 | Likely required | atomic launch, duplicate launch probes | Draft can launch once and source is traceable | no new customer-facing outcome without approval | Medium-high |
| 6. Draft -> Job launch parity | Create Job in redesigned Work flow | Slices 3-5 | Existing RPC may remain usable | create job, stable IDs, consumed Draft | Draft becomes operational Job | no Estimate/Invoice | Medium |
| 7. Draft -> Estimate launch | Create Estimate from current Draft | Durable launch foundation | Likely required | snapshot, approvals, no Job activation, consumed Draft | Estimate created from Draft as first workflow record | no Invoice/payment | Medium-high |
| 8. Accepted Estimate -> same Job/additional work | Additional-work path preserves Job identity | Slice 7 | Likely required | duplicate prevention | accepted estimate updates/links correctly | no broad revisions | High |
| 9. Job/Estimate -> Invoice | Invoice from active workflow record | Billing contract | Likely required | invoice snapshots, paid/void guardrails | invoice created without unintended closeout | no payment ledger | High |
| 10. Direct Draft -> Invoice launch | Direct Invoice launch exception | Separate product approval | Likely required | draft launch, billing rules, duplicate prevention | invoice created only when safe and approved | no payment ledger | High |
| 11. Contextual Start New Draft | Trusted contexts can prefill Drafts | stable Draft routes/source context | Possible | source links, duplicate prevention | request/customer/property starts safe | no indiscriminate buttons | Medium-high |
| 12. Templates prefill | Templates start/prefill Drafts | stable composer | Possible mapping work | template mapping | template starts Draft only | no competing creation | Medium |
| 13. Scheduling/Calendar integration | Work schedule and Draft schedule intent | schedule contract | Possible | appointments, no side effects | schedule context visible | no dispatching | Medium-high |
| 14. Legacy retirement | Remove/de-emphasize old paths after parity | all prior parity | None or cleanup | regression/full workflow | sandbox parity passed | no premature Production switch | High |

## 28. Open Product Decisions

| Question | Recommendation | Rationale | Blocks | Deferrable |
| --- | --- | --- | --- | --- |
| Should the final sidebar label be `Work` or another term? | Keep `Work` as working label through specification and preview. | IA already treats Work as the working module name. | Final navigation copy only. | Yes |
| What is the first Work Dashboard priority order? | Drafts needing continuation, Active Jobs, accepted Estimates needing Jobs, completed Jobs ready to invoice, overdue/action-required items, upcoming work, recent activity, Job History access. | Prioritizes existing Work needing attention. Start New Draft is a controlled action, not the first dashboard content section when ongoing Work exists. | Work Dashboard implementation. | No for dashboard slice |
| Should Draft discard/archive ship in the first Work implementation? | Include explicit discard/archive in spec, but implement only if safe backend/UI path is approved. | Drafts should not become permanent clutter. | Draft list maturity. | Yes |
| Should Templates appear in the first Work Dashboard? | Keep as secondary access only, not a primary card. | Templates are useful but secondary until Drafts stabilize. | Dashboard density. | Yes |
| Should Calendar move during the first Work redesign? | Reference schedule on dashboard first; relocate Calendar later if needed. | Reduces navigation churn while preserving IA direction. | Full sidebar migration. | Yes |
| What exact storage model should represent a consumed Draft after Estimate launch? | Preserve immutable launch reference and remove the Draft from active Draft lists. | The product decision is settled, but the backend representation still needs implementation audit. | Draft -> Estimate launch foundation. | No for Estimate launch |
| Should mobile Start New Draft use a header action, action menu, or Work-scoped floating action? | Defer to screen-design audit. | The specification approves the hybrid architecture, not the final visual control. | Screen design, not product specification. | Yes |
| What is the exact visual treatment of the Work header Start New Draft action? | Defer to screen-design audit. | It must remain secondary when existing Work needs attention, but the exact placement and styling require layout design. | Screen design. | Yes |
| Should similar-Draft warnings be informational, confirmatory, or source-linked only? | Defer until Draft list and contextual start behavior are designed. | Warnings should reduce duplicate clutter without becoming intrusive. | Draft guardrail implementation. | Yes |
| When should Production Draft-first UI be re-enabled? | Only after cohesive Work redesign validation and explicit production gate. | Avoids another partial replacement. | Production rollout. | No for rollout |

Settled decisions not reopened:

- Work is the current working module name.
- Production stays legacy until Work is complete.
- Draft-first model.
- Save Draft optional.
- Job Overview operational first.
- Billing secondary.
- Job History terminology.
- Templates internal and secondary.
- One mobile Work destination.
- Service Requests as intake records.
- Draft contractor-only visibility.
- Draft launch principle: a Draft is temporary planning, and a workflow begins when the Draft is launched.
- One Draft launches exactly one initial first-class workflow record.
- Launched Drafts are consumed and should not remain active Draft hubs.
- Direct Draft -> Invoice launch is deferred until separately approved.

## 29. Explicit Exclusions

This specification does not authorize:

- application implementation.
- SQL changes.
- Production Draft UI enablement.
- sidebar migration.
- dispatching.
- inventory.
- payroll.
- full accounting.
- payment processing.
- final subscription pricing.
- enterprise feature implementation.
- legacy removal.
- production deployment.
- Supabase changes.
- Vercel changes.
- environment variable changes.
- sandbox or production data mutation.

## 30. Final Product Decision Summary

Approved product behavior:

- Contractor Work owns Drafts, Jobs, Estimates, Invoices, Reports, scheduling relationships, Job History, and Work templates.
- Draft is the neutral contractor-only starting point for most Work workflows.
- Save Draft is optional.
- Contractors should be able to choose an intended output from current Draft state.
- Intended output may change before launch.
- Launching creates exactly one initial first-class workflow record.
- Launching consumes the Draft so it no longer remains an active Draft.
- Later records are created from the launched Estimate or Job workflow, not from a permanent active Draft hub.
- Direct Invoice launch is deferred until separately approved.
- Starting new work and managing existing Work are distinct contractor intentions.
- Work is primarily the management, continuation, attention, and history destination.
- Start New Draft is a controlled creation action, not a separate global destination.
- Work may expose a secondary Start New Draft shortcut.
- Empty Work states may promote Start New Draft as the primary action.
- Contextual Start New Draft is preferred where trusted context exists.
- No separate global Draft destination is introduced.
- Start New Draft starts clean.
- Continue Draft loads one canonical persisted Draft.
- Continue Job loads one operational Job.
- Create Job must open a true operational Job Overview.
- Drafts must not leak into operational lists, homeowner views, active-visit logic, or operational actions.
- Billing is secondary to operational work.
- Job History is the preferred historical destination.
- Templates are internal, secondary, and Draft-prefill oriented.
- Work remains one global navigation destination, especially on mobile.
- Production remains legacy until the redesigned Work experience is cohesive, validated, and approved.

Deferred decisions:

- final user-facing module label,
- exact first Work Dashboard layout,
- exact mobile Start New Draft control,
- exact Work header action visual treatment,
- similar-Draft warning behavior,
- Draft archive/discard implementation,
- Calendar relocation timing,
- template migration timing,
- final user-facing wording for launch actions,
- backend representation of consumed Drafts.

Backend-dependent items:

- top-level Draft notes,
- Draft photos/attachments,
- richer source context,
- scheduling intent,
- Draft -> Estimate launch,
- direct Draft -> Invoice launch,
- additional-work Estimate -> same Job,
- Draft archive/discard,
- closeout/reopen,
- homeowner-safe Job summaries.

Migration rules:

- keep legacy Production Jobs untouched during sandbox/preview development,
- do not partially replace Production Jobs again,
- keep old paths until parity is approved,
- audit every implementation slice separately.

Next approved planning step:

Audit the first Work Dashboard and navigation-shell implementation slice before creating code.
