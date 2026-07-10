# ServSync Project Collaboration Specification v1

**Status:** Product direction / canonical planning reference  
**Implementation status:** Not implemented unless separately confirmed by code, SQL, tests, deployment evidence, or an approved implementation report  
**Last updated:** 2026-07-10

## Purpose

This document defines the product operating model for future ServSync multi-contractor project collaboration. It is the canonical reference for project roles, authority, succession, financial privacy, shared coordination, assignment workflow, project cost summaries, pause/close behavior, and related company-permission boundaries.

This specification does not authorize implementation by itself. Every implementation must use a separate, narrow audit or implementation prompt and must preserve the guardrails in this document.

## 1. Core product model

A ServSync project is an organized group of jobs, records, participants, assignments, and shared coordination tools.

A project does not replace the existing job workflow. A normal job may later become part of a project, and users should not be forced to choose between creating a job or a project before the work naturally requires project coordination.

Core rules:

- A project may be created by a homeowner or contractor.
- A project is intended for multi-party coordination. A single-contractor job may later expand into a project.
- Existing jobs, estimates, invoices, and related records may be attached to a project after project creation, including after the underlying work is complete, while the project remains open.
- A job may belong to no more than one project.
- A property may have multiple active projects.
- The same contractor may participate in multiple projects.
- The creator manages the ServSync project workspace. This does not establish legal general-contractor status outside ServSync.
- Public product language should use **Project Lead**, not General Contractor.

## 2. Project roles and authority

### 2.1 Historical creator

The profile that creates the project is permanently recorded in project history as the original creator.

### 2.2 Project Lead

The active Project Lead holds the highest ServSync project authority.

The original creator begins as Project Lead. A successor may later become Project Lead for authority purposes while the historical record continues to identify the original creator and all prior Project Leads.

The Project Lead may:

- Manage project settings and shared coordination surfaces.
- Invite or remove participants.
- Appoint or remove Project Controllers and Project Managers.
- Pause or resume the project.
- Pause or resume an individual participant's project participation.
- Publish assignments from approved financial scope.
- Control shared Project Board and calendar visibility.
- Review assignment completion and finalize assignments.
- Close the project.

Only the active Project Lead may close the project.

### 2.3 Project Controllers

A project may have multiple Project Controllers.

Controllers may perform any project-management action granted by their role and company-level permissions, except closing the project. Project-level authority may never exceed the user's company-level permission ceiling.

### 2.4 Project Managers

Project Managers receive granular permissions assigned by the Project Lead or authorized controller. Permissions should remain separate rather than bundled into one unrestricted manager role.

### 2.5 Property owner

A connected property owner does not automatically control a contractor-created ServSync project.

The property owner may generally receive access to shared project information, including the Project Board, shared calendar, published assignments, shared files, participant visibility selected by the Project Lead, and nonfinancial project status.

The property owner does not automatically receive:

- Project Lead authority.
- Controller or manager authority.
- Subcontractor estimates or invoices.
- Subcontractor pricing.
- Private messages between other parties.
- Internal contractor notes or business records.

A property owner may be the creator and Project Lead of a homeowner-managed project.

## 3. Commercial structure

Every project has one creator-led commercial structure.

### 3.1 Contractor-created project

The contractor creator operates as the Project Lead inside ServSync.

Typical relationship:

- The property owner has a customer agreement with the creator's company.
- Subcontractors have separate agreements with the creator's company.
- Subcontractor estimates and invoices are sent to the creator's company.
- The creator creates separate homeowner-facing estimates and invoices.
- Subcontractors do not see the creator's homeowner pricing, markup, budget, invoice status, or homeowner-facing financial documents.

### 3.2 Homeowner-created project

The homeowner creator acts as Project Lead inside ServSync.

The homeowner may:

- Invite contractors with paid ServSync subscriptions without purchasing a project subscription.
- Purchase a homeowner Project Subscription when using unpaid contractor participants.
- Receive contractor estimates and invoices directly.
- Create an internal Project Cost Summary from multiple contractor invoices.

The homeowner Project Subscription is a future paid add-on. Current directional pricing should align with the minimum contractor subscription level, likely around $20 per month, but final pricing remains governed by the pricing specification and future billing implementation.

## 4. Company permissions

Access to company-owned project records belongs to the company, not permanently to an individual employee.

- Only current company users with the appropriate company-level permissions may view company project records.
- Project permissions must respect company-level permission ceilings.
- Financial access should be a specific permission, such as **View project subcontractor financials**.
- Field technicians and lower-permission roles should not receive subcontractor financial access by default.
- When a company creates custom roles, financial and project-control permissions must be explicitly configured.
- When a company administrator revokes a user's company profile access, the user loses access to that company's project records.
- If a company closes its ServSync account, its records remain preserved but inaccessible until the company account is restored or records are legally transferred through a separately defined process.

## 5. Financial privacy model

Project membership does not create financial-document access.

Financial privacy follows the contractual relationship and explicit permissions.

### 5.1 Financial record access

A full estimate or invoice may include:

- Pricing.
- Line-item amounts.
- Totals.
- Payment terms.
- Payment status.
- Attachments.
- Private financial history.

Automatic access is limited to:

- The contractor company that created the record.
- The recipient company or profile to which the record was sent.
- Explicitly authorized viewers.

### 5.2 Coordination access

Coordination access may expose approved line-item descriptions, quantities, assignment wording, responsible party, schedule, and workflow status without exposing pricing or the existence of the underlying estimate or invoice.

Unrelated project participants should not be told that an estimate or invoice exists. Approved financial scope is converted into independent Project Board assignments.

### 5.3 Contractor-created project financials

- Subcontractor estimates and invoices are sent only to the creator's company.
- Authorized users in the creator's company may receive full access according to company-level permissions.
- Controllers and managers outside the creator's company do not receive financial access unless the submitting contractor grants it.
- Access grants may cover all current and future financial records that contractor adds to the project.
- The contractor may revoke outside access at any time.
- Revocation removes future viewing but preserves an audit record that access previously existed.
- Download/export permission is separate from in-app viewing permission.
- Only the creating contractor may edit its estimate or invoice.

### 5.4 Property-owner takeover financial boundary

If the original creator and all eligible profiles from the creator's company are no longer associated with the project, only the connected property owner may claim Project Lead authority.

The property owner does not inherit subcontractor financial documents or private messages.

Each subcontractor retains its original financial records and may create a new estimate or invoice for the property owner by copying a previous record into a new editable record.

Rules for resubmission:

- The new record is clearly flagged to the subcontractor as created from a previous estimate or invoice.
- Line items, quantities, terms, scope, and pricing are copied by default but remain fully editable.
- The property owner does not see the original recipient, original pricing history, or private record history.
- The new record remains separate from the original creator-company record.
- The subcontractor may choose to link the new private financial record to existing project assignments.
- The original creator's company receives no notification that replacement financials were created.
- If the original creator's company later returns, the homeowner-facing replacement records remain separate and visible only to the homeowner and subcontractor.

Once a subcontractor submits an estimate or invoice to the original creator's company, that recipient company retains access to the submitted record. The subcontractor may not later revoke the recipient company's access to a record addressed to it.

## 6. Project Board and communication

The Project Board is the shared coordination area for project work.

It is designed for operational updates such as:

- Wiring finished and ready for drywall.
- Materials delayed.
- Assignment ready for review.
- Schedule change requested.
- Access issue at the property.

The Project Lead controls whether shared Project Board messaging and shared calendar visibility are enabled.

The Project Lead may:

- Disable public Project Board communication.
- Disable shared calendar visibility.
- Restrict selected participants from the public board or calendar.
- Control whether subcontractor identities and trades are visible to the property owner.
- Publish information to all active participants.

When publishing content to all participants, ServSync should show an explicit confirmation such as:

> This will be visible to the property owner and all active project participants.

When public messaging is disabled or a participant is restricted, the participant may still send restricted project updates to the Project Lead where permitted.

Project membership does not create a normal ServSync connection between the property owner and subcontractors.

Within a contractor-created project:

- The creator may be the only contractor connected to the property owner for that project relationship.
- A subcontractor may already have an unrelated ServSync connection with the property owner, but that connection does not grant direct project financial or private-message access.
- Subcontractor estimates, invoices, and private project messages remain routed through the Project Lead.
- The property owner and subcontractors may communicate through the shared Project Board about scheduling and work status when the Project Lead enables that feature.
- Direct private communication requires an independently valid ServSync connection and must not bypass project financial rules.

A shared contact-information area may later allow each participant to publish selected contact fields to selected project audiences. Contact sharing should remain permission-controlled.

## 7. Assignments derived from approved scope

Approved subcontractor estimate line items may be converted into Project Board assignments.

Publication workflow:

- All approved line items are selected by default.
- The Project Lead may deselect items before publication.
- Pricing remains private.
- The Project Lead reviews the exact wording before publication.
- The Project Lead may edit assignment wording without modifying the source estimate.
- Assignment wording should preserve the responsible subcontractor and project-assignment grouping by default.
- If the Project Lead marks an edit as substantial, the subcontractor must acknowledge it.
- A substantially edited assignment remains in Planning until acknowledged, unless the Project Lead explicitly moves it forward and notifies the subcontractor.
- Revised financial documents update only the private financial relationship and do not automatically alter public assignment wording or scope.

## 8. Assignment statuses and authority

Assignment statuses:

- **Planning**
- **In Progress**
- **Review**
- **Complete**

Authority flow:

1. The Project Lead publishes the assignment in Planning.
2. The subcontractor acknowledges the assignment.
3. The Project Lead moves the assignment to In Progress.
4. The subcontractor performs the work and moves it to Review.
5. The Project Lead reviews the work and moves it to Complete.

Additional rules:

- A subcontractor may privately request that the Project Lead move an acknowledged assignment from Planning to In Progress.
- The request is visible only to the Project Lead.
- The Project Lead may move an assignment to In Progress before acknowledgment, but the subcontractor must still acknowledge it and is notified.
- The Project Lead may return an assignment from Review to In Progress without a public rejection notice.
- The subcontractor receives a private reason when provided and may respond privately on the assignment.
- The public status remains In Progress when completion is returned for more work.
- The Project Lead may move assignments backward from Complete or other statuses.
- A reason may be recorded but is not required.
- Status and change history remain preserved in the audit trail.
- The Project Lead decides whether an edit is substantial through an explicit control.

## 9. Project and participant pause

### 9.1 Project pause

A project may be paused and later resumed.

Pausing freezes active project coordination but does not control real-world work outside ServSync.

While paused:

- The project becomes read-only for shared coordination.
- New Project Board posts are blocked.
- Shared project calendar changes are blocked.
- New project invitations and new record attachment may be blocked pending implementation design.
- Existing records remain viewable according to permissions.
- Existing jobs, invoices, payments, and other independent workflows may continue unless separately restricted.

Only the Project Lead or appropriately authorized controllers/managers may pause or resume the project.

### 9.2 Participant pause

A participant may be paused only within the specific project. Their ServSync profile, company access, and unrelated jobs/projects remain active.

A paused participant:

- Remains in project history.
- Retains access to their own records and previously authorized shared history.
- Cannot create new Project Board posts.
- Cannot modify shared project schedules.
- Cannot upload new project-shared files.
- Cannot create new shared project activity.
- May later be unpaused and reauthorized.

Pausing a participant does not automatically change the status of their jobs or assignments. The Project Lead should receive warnings about active work before pausing the participant.

## 10. Project closure

Project closure is manual and does not require all items to be complete.

Before closure, ServSync should warn the Project Lead about open items, including active jobs, assignments, pending reviews, unpaid invoices, or unresolved actions. The warning does not block closure.

Closing a project:

- Ends active Project Board collaboration.
- Ends shared project calendar synchronization.
- Freezes project assignments, shared notes, and shared files.
- Preserves jobs, estimates, invoices, messages, files, participant history, role history, audit history, and Project Cost Summary records.
- Keeps the project available as a historical reference according to each participant's permissions.
- Prevents new records from being attached until the project is reopened.

A closed project may be reopened by the active Project Lead through a separately approved workflow.

## 11. Project Lead continuity and succession

### 11.1 Activity requirement

The active Project Lead must log in to ServSync at least once every 30 days to retain unquestioned Project Lead status.

Any ServSync login counts, but retaining authority during a challenge requires an explicit **Maintain Project Lead** action.

The 30-day rule does not automatically transfer authority. It only makes the Project Lead eligible for replacement.

### 11.2 Notifications

- At 30 days without login, the Project Lead is notified that their status is eligible for challenge.
- Additional reminders are sent every five days while eligible.
- The highest eligible successor receives the **Assume Project Lead role** action when their turn begins.
- When a successor initiates takeover, the current Project Lead receives a five-day notice.
- The current Project Lead must log in and select **Maintain Project Lead** to stop the takeover.
- A successful maintain action restarts the 30-day clock.
- ServSync should suggest naming a successor after a maintain action but must not require it.
- When takeover completes, every active project participant is notified.

### 11.3 Planned successor

The Project Lead may optionally nominate a successor. ServSync should strongly encourage this during project setup and after inactivity recovery, but it is not required.

Only the highest eligible successor is offered takeover at a time.

### 11.4 Creator-company continuity

If the creator belongs to a company, document-control continuity should remain with that company whenever possible.

When the creator becomes inactive or unavailable:

- Other eligible profiles in the creator's company are notified, even if they were not previously project participants.
- ServSync does not automatically rank or appoint company users.
- Company personnel decide whether and who will accept Project Lead authority.
- Company-level permissions determine eligibility.

The original creator's participation is paused and their Project Lead authority is removed only after a completed takeover. A new Project Lead may later unpause and reauthorize the former creator at their discretion.

### 11.5 External succession

If no eligible profile from the original creator's company accepts or remains available, the succession process may continue through previously appointed successors and other eligible authorized project participants.

Only one eligible successor is offered the takeover action at a time. If that person does not act during the defined window, the opportunity moves to the next successor.

After all named or authorized successors have been offered the opportunity, eligible paid project participants may be offered takeover.

If no paid eligible participant exists, an eligible contractor may claim Project Lead authority by subscribing. If multiple eligible unpaid contractors are offered the opportunity, the first eligible participant to complete the claim and payment receives authority.

### 11.6 Property-owner-only final recovery

Current product direction supersedes broader contractor succession when the original creator and every eligible profile from the creator's company are no longer associated with the project:

- Only the connected property owner may claim Project Lead authority.
- The project remains paused and read-only until the property owner accepts the Project Lead role and activates a paid homeowner Project Subscription.
- If the property owner declines to subscribe, the project remains paused and read-only indefinitely.
- Participants retain access to their own records and authorized shared history.
- If no connected property owner exists, the project remains paused and read-only and requires a future separately defined support/recovery process.

Because this final-recovery rule protects financial privacy, it should take precedence over any earlier generic succession fallback that would expose the original creator's company records to unrelated contractors.

## 12. Project Cost Summary

A homeowner may maintain one living **Project Cost Summary** tied to the selected property history.

This is an internal property-history record, not an estimate or invoice issued by participating contractors.

Rules:

- It has no recipient and no approval obligation.
- It may be downloaded as a PDF.
- The PDF must state that it is a homeowner-created project summary and not an estimate or invoice issued by participating contractors.
- Final invoiced amounts from linked contractor invoices populate automatically.
- All final invoices may be included regardless of payment status.
- Revised, voided, partially paid, or replaced invoice changes require Project Lead approval before altering the active summary.
- Voided amounts remain in audit history but are removed from the active total after approval.
- All eligible line items are included by default.
- Each line item belongs to only one project-assignment section and must not be duplicated.
- Sections are based on project assignments.
- The homeowner may create additional assignment categories for permit fees, purchased materials, design fees, offline contractor costs, and other manual expenses.
- Manual expenses may include receipts, PDFs, or photos and must be labeled as homeowner-entered.
- The homeowner may edit summary descriptions, quantities, and amounts without modifying source invoices.
- Original imported values and subsequent edits remain available in audit history.
- Contractor identity and line-item grouping are preserved by default.
- The homeowner may separate the summary into sections such as electrical, plumbing, or other assignment groups.
- The homeowner combined-summary workflow does not include contractor-style markup functionality.

## 13. Audit and record retention

Projects are durable historical records.

The system should preserve:

- Original creator.
- Every prior and current Project Lead.
- Controllers and managers.
- Participant status changes.
- Company associations.
- Permission grants and revocations.
- Financial access history.
- Assignment publication and wording history.
- Assignment status transitions.
- Pause, resume, leave, removal, takeover, and closure events.
- Project Board posts and visibility.
- Shared calendar history.
- Project Cost Summary source and edit history.

Participants who leave or are removed do not erase their prior contributions.

Each company retains records addressed to or created by that company. Access remains limited to current authorized company users.

## 14. Product-language guardrails

- Use **Project Lead** for the highest project role.
- Do not imply that ServSync appoints a legal general contractor.
- Do not imply that ServSync controls physical work, licensing, permits, safety, workmanship, scheduling performance, or contractual obligations outside the app.
- Project authority governs ServSync records, permissions, assignments, shared communication, and coordination tools.
- Financial documents must remain private according to contractual relationships and explicit access rules.
- Public project visibility must never silently expose prices, markup, payment status, private messages, or contractor internal data.

## 15. Unresolved implementation questions

The following remain intentionally unresolved and require separate focused planning before implementation:

- Exact database entities and RLS model.
- Exact project, participant, invitation, assignment, and status enums.
- How existing jobs, estimates, and invoices are attached to an open project.
- How a normal job is promoted into a project without forcing an early user choice.
- Exact Project Board audience controls and contact-directory fields.
- Exact shared-calendar behavior and external-calendar integration boundaries.
- Exact inactivity notification timing after the initial 30-day threshold.
- Exact successor ordering before final property-owner recovery.
- Paid subscription enforcement, grace periods, and billing provider behavior.
- Support process when no connected property owner exists.
- Project reopening rules.
- Message retention and export rules.
- File storage, size, visibility, and retention rules.
- Change-order workflow.
- How approved estimate lines map to assignments when quantities or scope change.
- Whether project pause blocks new record attachment, invitations, or private financial workflows.
- Legal terms, disclosures, consent language, and recovery evidence requirements.

## 16. Recommended roadmap treatment

Treat this specification as a product foundation, not as one implementation task.

Recommended future epic:

**Multi-Contractor Project Collaboration**

Recommended audit-first slices:

1. Project entity, status, property link, creator history, and participant foundation.
2. Project Lead, controller, manager, and company-permission model.
3. Project pause, participant pause, close, reopen, and audit history.
4. Project Board and public/restricted communication model.
5. Project assignments derived from approved estimate line items.
6. Assignment acknowledgment, status, review, and completion workflow.
7. Financial-document privacy and recipient-based access boundaries.
8. Contractor-created Project Lead financial workflow.
9. Homeowner-created project subscription and direct-contractor financial workflow.
10. Project Lead inactivity, takeover notices, and succession.
11. Property-owner recovery and financial resubmission.
12. Project Cost Summary and Home History export.
13. Shared calendar and later external-calendar integration.

No slice should be implemented until its data access, RLS, company-permission, audit, and regression-test boundaries are separately approved.
