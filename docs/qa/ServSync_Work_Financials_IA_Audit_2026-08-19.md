# ServSync Work / Financials Information Architecture Audit

Date: 2026-08-19

Audited application base: `39bd885f660405b98729a799f2021ba5bd71cca1`

Roadmap relationship: FB-039A; Phase 0 outcome 0.1

## 1. Outcome

**IMPLEMENTATION READY.** The approved contractor `Work` / `Financials` split can be delivered without changing database lifecycle, authorization, RPCs, providers, or homeowner navigation. The implementation must be treated as one coherent product migration rather than a sidebar relabel because the current `Jobs` workspace owns Jobs, Estimates, Invoices, Drafts, tools, attention counts, and dozens of contextual navigation handoffs through one shared state model.

The next bounded assignment is FB-039B: implement the contractor Work / Financials presentation and compatibility migration on one feature branch, validate all contextual handoffs and roles, and expose only the completed end state for review.

## 2. Current Implementation Map

### Top-level navigation

- The contractor portal has one route, `/#/contractor`. Top-level workspace selection is React state persisted in `servsync.contractor.activeTab`; individual Work, Estimate, Job, and Invoice records do not have canonical nested URLs.
- Desktop shows `Jobs` as the first `Customer Work` item, followed by Customers, Service Requests, and Calendar.
- Mobile bottom navigation shows Discover, Jobs, Dashboard, Customers, and More.
- `ContractorTab` contains `inspections` but no `work` or `financials` destination. The internal `inspections` name currently represents the entire visible Jobs workspace.

### Shared Jobs state

- `ContractorJobsView` combines operational views (`new_jobs`, `open_jobs`, `closed_jobs`), shared planning (`overview`, `needs_attention`, `drafts`), Estimate/Invoice views (`new_financial`, `open_financial`, `closed_financial`), and tools (`templates`, `custom_pricing`, `service_agreements`).
- `contractorFinancialRecordKind` switches the same financial views between Estimates and Invoices.
- One persisted Customer filter, `servsync.contractor.jobsCustomerFilter`, is reused across Job, Estimate, and Invoice lists.
- The Work dashboard currently includes Invoice counts and Invoice attention in the same totals as accepted Estimates and completed Jobs.
- The shared Draft composer can intentionally produce an Estimate, Job, or Invoice. That capability should remain; only the canonical destination of its output changes.

### Navigation coupling

Current navigation is implemented by repeated sequences of state setters. Invoice entry points generally select `contractorTab = inspections`, choose `contractorFinancialRecordKind = invoices`, select a shared financial view, clear unrelated composers, set a Customer filter, and sometimes focus a record. Estimate and Job entry points use similar sequences.

These sequences appear in:

- contractor Dashboard workflow stages and attention review;
- Work overview tiles and header tabs;
- onboarding actions;
- Customer and Request contexts;
- saved Draft output navigation;
- Estimate payment schedules and accepted-Estimate actions;
- Job detail, partial billing, and completed-Job actions;
- Invoice lists, status actions, and payment actions;
- notifications; and
- composer close, save, and reopen behavior.

Central destination helpers are required before or during the visible split so those entry points cannot disagree about ownership.

## 3. Approved Ownership Contract

| Capability | Canonical contractor owner | Contextual behavior |
| --- | --- | --- |
| Draft planning | Work | A Draft may produce an Estimate, Job, or Invoice. |
| Estimates | Work | Accepted Estimates may initiate Invoice creation; the created or existing Invoice opens in Financials. |
| Jobs, visits, scheduling context, checklists, reports | Work | Completed Jobs may initiate billing; Invoice management remains in Financials. |
| Templates, Service Plans, Price Book | Work | These support scope and work preparation. |
| Invoice Drafts and Invoices | Financials | Financials owns create/edit/view/send/void and status lists. |
| Deposits, progress billing, payments, receivables | Financials | Existing lifecycle and authority remain unchanged. |
| Exports and financial reporting | Financials | Add later inside the stable destination. |
| Provider/accounting setup | Company -> Integrations | Financials may show provider status and link to setup, but does not own configuration. |
| Customer financial summaries | Customers | Summaries remain contextual; opening an Invoice navigates to Financials. |
| Homeowner Estimates / Invoices | Homeowner Service/Records model | Unchanged by FB-039B. |

## 4. Role and Device Contract

| Role | Work | Financials desktop | Financials mobile | Authority |
| --- | --- | --- | --- | --- |
| Owner | Full operational and supported planning actions | Visible | Under More | Existing server-resolved billing capability |
| Admin | Full operational and supported planning actions | Visible | Under More | Existing server-resolved billing capability |
| Office | Full operational and supported planning actions | Visible | Under More | Existing server-resolved billing capability |
| Field Technician | Operational Work | No primary destination | No primary destination | No financial authoring; linked Invoice context may remain readable where already permitted |
| Viewer | Read-only Work | No primary destination | No primary destination | No Job or financial mutation |

Presentation must continue to derive financial capability from the existing server-resolved capability model. FB-039B must not introduce role-name authorization or change backend access.

## 5. Target Navigation and Surface Model

### Desktop

- Rename the visible `Jobs` destination to `Work` and retain its prominence in Customer Work.
- Add a top-level `Financials` destination for billing-authorized users.
- Work contains Overview, Drafts, Estimates, Jobs & Reports, and Tools. Calendar remains operationally associated with Work even if it stays a separate sidebar shortcut during this slice.
- Financials initially contains an overview, Invoice Drafts/open Invoices, paid/closed Invoices, and the existing Invoice composer/detail/payment actions. Do not add placeholder exports, reports, or provider features merely to fill the new destination.

### Mobile

- Rename the bottom-navigation `Jobs` item to `Work`.
- Keep Financials under More for Owner/Admin/Office so field navigation remains focused and the five-item bottom bar does not churn.
- Do not change Discover, Dashboard, Customers, or homeowner mobile navigation in this slice.

### Dashboard and attention

- Work attention owns accepted Estimates needing Jobs and completed Jobs ready for invoicing.
- Financials attention owns overdue, viewed, sent, partially paid, and other actionable Invoice states.
- The Business Dashboard may summarize both, but its Estimate/Job actions route to Work and its Invoice actions route to Financials.
- Work may show the handoff state `Ready to invoice`; it must not become a second Invoice list.

## 6. Compatibility and State Migration

There are no existing record-level deep links to redirect. Compatibility therefore has three responsibilities:

1. Preserve `/#/contractor` and authentication/invite query behavior.
2. Read legacy local-storage state once and map it deterministically:
   - legacy `inspections` plus Job, Draft, Estimate, or tool state -> Work;
   - legacy `inspections` plus Invoice financial state -> Financials for billing-authorized users;
   - unsupported or ambiguous legacy state -> the relevant overview, never a blank screen.
3. Preserve focused record, Customer filter, editability, and lineage when a contextual action crosses from Work to Financials.

Use separate Work and Financials view state after migration. Do not continue using one `new_financial/open_financial/closed_financial` union as the permanent owner of both Estimates and Invoices. A short-lived internal alias for `inspections` is acceptable only as bounded compatibility and must not remain a second visible destination.

## 7. Required Contextual Handoffs

| Source | Record/action | Canonical result |
| --- | --- | --- |
| Dashboard | Estimates or Jobs summary | Work with the intended list/filter |
| Dashboard | Invoice summary or Invoice attention | Financials with the intended status/filter |
| Notification | Estimate | Work, focused Estimate or appropriate Estimate list |
| Notification | Invoice | Financials, focused Invoice or appropriate Invoice list |
| Customer | Open Estimate | Work with Customer context preserved |
| Customer | Open Invoice | Financials with Customer context preserved |
| Accepted Estimate | Create/open Invoice | Financials focused on the created or existing Invoice |
| Estimate payment schedule | Create/open deposit or progress Invoice | Financials focused on the created or existing Invoice |
| Completed Job | Create/open Invoice | Financials focused on the created or existing Invoice |
| Partial billing | Create Invoice | Financials focused on the created progress Invoice |
| Shared Draft | Launch Estimate or Job | Work focused on the output |
| Shared Draft | Launch Invoice | Financials focused on the output |
| Invoice editor close | Linked Job exists | Return to the linked Job in Work |
| Invoice editor close | No linked Job | Return to the relevant Financials Invoice list |

## 8. FB-039B Implementation Sequence

Implement these as internal checkpoints on one coherent feature branch. Do not expose an intermediate product state with duplicate Invoice ownership.

1. **Destination and migration foundation**
   - Introduce explicit Work and Financials destinations and separate view models.
   - Add centralized navigation/focus helpers for Work, Estimates, Jobs, Financials, and Invoices.
   - Add deterministic legacy local-storage migration and safe fallbacks.
2. **Visible ownership split**
   - Rename the visible desktop/mobile Jobs destination to Work.
   - Move Invoice overview/list/composer/detail/payment presentation to Financials.
   - Keep Drafts, Estimates, Jobs, Reports, Templates, Service Plans, and Price Book in Work.
   - Apply the capability-based desktop/mobile role contract.
3. **Handoff and hierarchy closeout**
   - Convert every Dashboard, notification, Customer, Request, Draft, Estimate, and Job handoff to the central helpers.
   - Separate Work and Financials attention counts.
   - Replace stale `Back to Jobs` and combined `Estimate/Invoice` wording only where ownership changed.
   - Preserve Customer context and record lineage across every cross-module action.

## 9. Acceptance Evidence

FB-039B is not complete until all of the following pass:

- Desktop Owner/Admin/Office see Work and Financials; mobile shows Work in the bottom bar and Financials under More.
- Field Technician and Viewer retain their exact Work behavior and receive no new financial authoring path.
- Legacy saved Jobs/Estimate/Invoice states open a valid canonical destination after reload.
- Dashboard, notification, Customer, Request, Draft, Estimate, Job, and Invoice entry points land in the correct module.
- Estimate -> Job stays within Work; Estimate/Job -> Invoice crosses to Financials and retains lineage.
- Direct Invoice Draft creation and saved Invoice reopening occur in Financials.
- Closing a linked Invoice returns to its Job; closing an unlinked Invoice returns to Financials.
- Homeowner Estimates / Invoices navigation and behavior remain unchanged.
- Desktop and 390x844 layouts have no clipping or duplicate visible ownership.
- Existing role, lifecycle, PDF, partial-invoice, payment, Draft-output, production read-only, and recurring role-smoke contracts are updated and pass.
- TypeScript, lint/architecture ratchets, Production build, secret review, protected-scope review, and `git diff --check` pass.

## 10. Non-goals and Protected Boundaries

- No SQL, schema, RLS, RPC, auth, role, or permission changes.
- No payment-provider activation, configuration, live-money movement, or new accounting integration.
- No Invoice lifecycle or Estimate/Job lineage rewrite.
- No homeowner information-architecture change.
- No visual rebrand or broad component rewrite.
- No advanced reporting, exports, receivables automation, dispatch, or new Marketing scope.
- No merge, Production deployment, or Production data mutation without separate authorization.

## 11. Material Risks

- Repeated state-setting code is the primary regression risk; central helpers and source-level coverage are required.
- The 50,000-line App shell increases review surface. Extract only coherent destination/presentation boundaries needed for this outcome; do not turn FB-039B into a general decomposition project.
- Old browser state can otherwise strand users in an invalid combined financial view.
- Keeping an Invoice tile or Invoice attention list inside Work after adding Financials would create duplicate ownership and defeat the simplification goal.
- Hiding Financials by role must not be mistaken for authorization; server checks remain authoritative.
