# ServSync Trust-Layer Backlog Additions

Date captured: 2026-07-03

Purpose: Preserve the newest ServSync differentiator ideas from product brainstorming so they can be folded into `docs/servsync-master-plan/ServSync_Feature_Backlog.md` without being treated as live, implemented, audited, or approved for build.

## Product theme

ServSync should continue to differentiate as the shared trust layer between homeowners and small contractors: clarity before work, documented approvals during work, service memory after work, homeowner-controlled access, and contractor growth from real completed work.

Do not describe this direction as legal mediation, contractor certification, expert inspection, price fairness review, dispute resolution, guaranteed lead generation, paid ranking, or verification unless those capabilities are separately implemented and legally/operationally approved.

## Recommended canonical backlog fold-in

Add as a new future/backlog umbrella item unless the backlog owner chooses to split it into separate FB IDs immediately.

| Proposed ID | Feature / Topic | Product Area | Status | Priority | Current Next Step |
| --- | --- | --- | --- | --- | --- |
| FB-033 | Trust Layer Differentiators | Estimates, jobs, Home History, homeowner permissions, Discover, contractor trust | Backlog | High | Preserve as product direction. Later split into narrow audited slices for estimate clarity, change approvals, completion summaries, controlled shared notes, Emergency Binder export, and completed-job Discover posts. |

## Included backlog ideas

### 1. Estimate Clarity Assistant

Covers: explain estimate, estimate completeness check, homeowner decision support, and plain-English scope confirmation.

Product direction:

- Explain contractor estimates in homeowner-friendly language.
- Help contractors spot commonly missed scope details before sending an estimate.
- Help homeowners compare what is included, excluded, assumed, warrantied, or time-sensitive.
- Create a shared scope summary that both sides can approve.

Guardrails:

- Do not say ServSync decides whether pricing is fair.
- Do not say ServSync determines whether work is required.
- Do not call this legal review, expert opinion, mediation, arbitration, inspection, or dispute resolution.
- Prefer names like `Estimate Clarity`, `Scope Clarity`, `Estimate Review Assistant`, `Shared Scope Summary`, or `Scope Confirmation`.

Possible first slice:

- Rule-based estimate clarity panel on homeowner estimate review and contractor send-review screens.
- No AI dependency required for v1.

### 2. No-Surprise Work Changes

Product direction:

- Contractor can request homeowner approval for scope/cost changes found during a job.
- Change request can include plain-English reason, optional photo, cost delta, and impact note.
- Homeowner can approve, decline, ask a question, or request more detail.
- Approval/decline is saved to the job record with timestamped Activity.

Guardrails:

- Do not auto-create invoices or charges from a change request without explicit later approval.
- Do not bypass existing estimate/job/invoice status safety.
- Do not imply ServSync validates the necessity or correctness of the change.

Possible first slice:

- Job-scoped change approval record with contractor create/send and homeowner approve/decline UI.

### 3. Contractor Trust Card

Product direction:

- Show transparent profile/activity signals instead of paid ranking.
- Possible signals: completed business profile, trade categories, service area, recent project posts, connected homeowner relationships, completed ServSync jobs, clear estimate usage, response consistency, and optional license/insurance fields if separately designed.

Guardrails:

- Do not imply ServSync verifies quality, licensing, insurance, background checks, or legal compliance unless actually verified.
- Do not create fake ratings, fake badges, guaranteed rankings, or pay-to-play Discover placement.
- Favor wording like `Profile signals` or `ServSync activity signals` over `verified contractor`.

Possible first slice:

- Read-only profile completeness and recent-activity indicators on contractor profile/Discover surfaces.

### 4. Service Memory / Reuse Prior Work

Product direction:

- When a contractor starts similar work for a connected homeowner, suggest prior estimate/job records as draft starters.
- Use same homeowner + same job type or other safe matching criteria.
- Show a clear copied-pricing notice and require contractor review before sending.

Guardrails:

- Do not auto-send copied estimates.
- Do not silently reuse old prices.
- Older pricing should carry stronger review warnings as age increases.

Possible first slice:

- Same homeowner + same job type suggestion: `Start from previous estimate`.

### 5. Homeowner Prep Checklist

Product direction:

- Before scheduled work, show a homeowner preparation checklist based on trade/job type.
- Examples: clear HVAC access, clear under-sink cabinet, secure pets, know shutoff/panel location, prepare smart-device login if relevant.

Guardrails:

- Keep checklists helpful, not overwhelming.
- Do not imply completion is required unless contractor explicitly requires it.
- Keep external notification/email/SMS/push delivery out of scope unless separately approved.

Possible first slice:

- Static job-type prep checklist attached to appointment/job detail.

### 6. After-the-Job Assistant

Product direction:

- Help contractor create a polished completion summary after marking a job complete.
- Include work completed, materials installed, photos, warranty note, maintenance recommendation, suggested reminder, homeowner-friendly explanation, and internal contractor notes.

Guardrails:

- Separate homeowner-visible notes from contractor-private notes.
- Do not publish Discover posts automatically.
- Do not create automatic reminders unless accepted/approved by homeowner or contractor per future workflow.

Possible first slice:

- Completion summary builder with explicit homeowner-visible/private note separation.

### 7. Home Profile Completeness / Home Readiness

Product direction:

- Show homeowners whether key home record details are documented: HVAC system, water heater, roof age, panel location, main water shutoff, preferred contractors, emergency contacts, warranties, recent service history, and unresolved issues.

Guardrails:

- Avoid calling this a `Home Health Score` unless product/legal review approves that framing.
- Do not imply ServSync has inspected or judged the condition of the home.
- Safer names: `Home Profile Completeness`, `Home Readiness`, `Home Record Status`, or `Maintenance Profile`.

Possible first slice:

- Home profile completeness checklist based on existing homeowner-entered fields and completed records.

### 8. Homeowner-Controlled Shared Notes / What Changed Since Last Visit

Product direction:

- Contractor returning to a property can see a short `What changed since last visit?` brief only for categories the homeowner has granted to that contractor/property.
- Notes should support categories such as homeowner-private, shared home note, job-specific note, contractor-private, emergency note, and temporary access instruction.

Guardrails:

- Homeowner private notes are never visible to contractors by default.
- Shared notes require explicit homeowner permission and should remain property-scoped and directional.
- Contractor-private notes remain contractor/team-only.
- Do not broaden shared Home History or work-record access without separate permission/category audit.

Possible first slice:

- Permissioned shared home notes category with explicit homeowner grant/revoke and read-only contractor view.

### 9. Emergency Binder + Export

Product direction:

- Homeowner can maintain an Emergency Binder with main water shutoff, electrical panel, gas shutoff notes, HVAC/water heater info, preferred contractors, emergency contacts, access notes, warranty documents, recent service history, photos, and selected notes.
- Homeowner can export selected Emergency Binder data.

Guardrails:

- Homeowner controls what is included in export.
- Sensitive access instructions should be excluded by default unless the homeowner explicitly includes them.
- Export should not imply legal disclosure completeness for real estate, insurance, or warranty purposes.

Possible first slice:

- Export Home Emergency Binder as PDF with selected safe fields only.

### 10. Smart Maintenance Reminders from Real Work

Product direction:

- Tie reminder suggestions to completed jobs, installed equipment, contractor recommendations, warranty dates, seasonal maintenance, or homeowner-created reminders.
- Contractor can suggest a reminder after job completion; homeowner can accept, edit, or decline.

Guardrails:

- Do not claim automatic/recurring reminders or external delivery are live.
- Keep v1 manual/accepted reminders unless automation is separately approved.
- Avoid generic spam-style reminders disconnected from real service records.

Possible first slice:

- `Suggest reminder from completed job` action after job completion.

### 11. Homeowner Decision Folder

Product direction:

- Help homeowners organize estimate decisions: competing estimates, included/excluded items, warranty, timeline, contractor notes, homeowner questions, and approved option.

Guardrails:

- Do not rank contractors or declare best/fair choice.
- Do not compare private contractor data across unrelated contractors without homeowner-provided records and permissions.
- Keep this as homeowner organization, not ServSync advice.

Possible first slice:

- Estimate questions/comments and comparison notes inside homeowner estimate review.

### 12. Completed Job to Discover Post

Product direction:

- After a contractor completes a job, ServSync makes it easy to create a Discover project post from the completed job.
- Suggested post can use selected photos, safe work summary, trade category, city/service area, and privacy-safe description.

Guardrails:

- Default is private/no post.
- Contractor must choose photos and confirm no homeowner identity, address, private notes, access details, or sensitive info is visible.
- Homeowner name/address should never be included unless an explicit future permission flow is approved.

Possible first slice:

- `Create Discover post from completed job` draft action with privacy checklist and no auto-publish.

### 13. Scope Agreement / Shared Scope Record

Product direction:

- Create a plain-English record of what both sides agreed to before work begins.
- Include work included, work excluded, materials, timeline, known assumptions, change approval requirement, homeowner responsibilities, contractor notes, and approval timestamp.

Guardrails:

- Do not position ServSync as a third-party mediator, arbitrator, inspector, legal agreement provider, or dispute resolver.
- ServSync documents the agreement; it does not decide who is right.
- Consider legal/terms review before using language like `agreement`, `approval`, or `scope lock` in production copy.

Possible first slice:

- Estimate approval screen stores/display a plain-English scope summary snapshot.

### 14. Temporary Home Access Handoff

Product direction:

- Homeowner can share job-specific access instructions: gate code, lockbox code, parking, pets, alarm notes, rooms not to enter, best entrance, temporary contact, and expiration.

Guardrails:

- Access instructions are job/appointment-specific and expire after completion unless homeowner explicitly keeps them.
- Sensitive notes should be hidden from general contractor profile/history views.
- No sharing beyond the authorized contractor/job context.

Possible first slice:

- Job-specific access notes with expiration and homeowner edit/revoke controls.

## Suggested split sequence

1. Estimate Clarity Assistant and Scope Summary.
2. No-Surprise Work Changes.
3. After-the-Job Assistant.
4. Smart Reminder from Completed Job.
5. Completed Job to Discover Post.
6. Homeowner-Controlled Shared Notes.
7. Emergency Binder Export.
8. Service Memory / Reuse Prior Work.
9. Temporary Home Access Handoff.
10. Contractor Trust Card.
11. Homeowner Decision Folder.

## Cross-feature guardrails

- Keep homeowners in control of shared notes, access instructions, Emergency Binder export, and private home data.
- Keep contractor-private notes separate from homeowner-visible notes.
- Keep Discover posts privacy-safe and contractor-confirmed before publishing.
- Keep trust signals transparent and activity/profile-based, not fake verification or paid ranking.
- Keep AI/rule-based explanations advisory and organizational, not legal, pricing, inspection, or dispute judgments.
- Do not claim any of these features are live until code, deployed behavior, and implementation reports confirm them.
