# Contractor experience refinement — September 25, 2026

Status: application revisions validated locally and on hosted Demo Preview; ready for review in draft PR #576. Overall completion remains open for the TUT-002 replacement. No merge or Production Help change is authorized by this report.

## Scope and outcome

This is the first implementation slice from the customer-experience research: contractor Dashboard → Work → Draft entry. It makes existing work easier to scan and begin without changing which actions are authorized or what they persist.

- Dashboard shows the Today card only when the selected schedule contains today's items. Workflow overview moves ahead of the weekly schedule; all weekly navigation, populated events, and calendar access remain available. Removing duplicate empty-day/week presentation makes existing review actions easier to find. The redundant introductory paragraph is removed.
- Work retains its main screen title and drops the nested duplicate heading/card. Start New Draft becomes the primary action alongside At a Glance. Templates, Service Plans, and Price Book keep their existing role gates and callbacks in quieter supporting rows.
- Needs Attention uses amber only when the loaded Work count is positive. Zero reads No work items need attention; loading and error states retain their distinct labels and hidden counts. This statement does not claim that Financials or Service Requests are clear.
- The Draft composer keeps its outer title and removes the repeated internal masthead. It explicitly states that nothing is sent from this private Draft. What are you preparing? and Choose later replace internal terminology; a two-column mobile choice grid reduces vertical scrolling. Empty template guidance is omitted while populated template access remains. Composer and recovery return buttons consistently say Back to Work.

No new automatic saves, document sends, customer communications, invoice/payment actions, role changes, permissions, API behavior, migrations, provider calls, or analytics collection were introduced. Homeowner review and document redesign remain future slices.

## Validation

- Work/Draft overview, mappings, workspace, launch, and post-launch recovery suites: 301 cases passed across the initial run (293) and eight corrected reruns. Two older Financials source assertions were aligned with the already-shipped summary filter handler; return-button expectations and recovery labels now consistently use Work.
- Four existing schedule component checks pass: desktop/mobile empty states, light schedules, and populated schedules with all events and week navigation retained.
- Two authenticated read-only Demo cases pass at 1440×900 and 390×844 using the new frontend and the existing public Demo connection. They check Dashboard ordering, zero-attention presentation, the visible primary action, one Work heading, private Draft entry, selection changes preserving typed content, horizontal fit, and return with the existing unsaved-change confirmation. No Draft or business record was saved, launched, sent, or deleted.
- The same two authenticated desktop/mobile cases also passed on the hosted Demo Preview for application commit `b5d7e15`. The test blocks credential requests to any backend other than the approved Demo project. GitHub quality checks and all three normal Vercel Preview builds passed.
- Screenshots inspected for desktop/mobile Work and Draft presentation. Type checking and production build pass. ESLint has zero errors and the unchanged 77-warning baseline. All 27 architecture tests pass; App.tsx is reduced from 50,721 to 50,719 lines and the baseline is lowered.
- Existing large application-chunk and Browserslist freshness warnings remain. No measured performance-improvement claim is made. Actual contractor preference/adoption testing remains future work.

## Draft creation follow-up after hands-on Demo review

Application commit: `5661595`. The user approved a second refinement after trying the first Preview.

- One page now has three ordered sections: Customer & work, Scope & pricing, and Next step. The work title reads What needs doing?; output selection follows the planning fields.
- A compact action bar keeps the total and existing Save/Create actions visible while scrolling. Missing-price warnings remain visible. The narrowly scoped web-only overflow rule in `src/index.css` enables sticky positioning only while the Draft editor is mounted; native layout rules are excluded.
- Draft line items use two columns on mobile and four supporting columns on wider screens. Type is visible beside quantity, unit, and unit price; optional per-line details remain available. Other Estimate/Invoice and legacy Draft editors do not opt into this layout.
- Private notes and Estimate labor settings can be expanded as needed. Existing notes/configured rates are exposed on initial load; a populated collapsed notes summary says Notes added. Estimate selection includes an Adjust labor settings shortcut. Closing settings does not clear values; missing labor-rate warnings are not hidden inside the disclosure.
- Empty, successfully loaded Price Books no longer add a card. Loading/error states and populated authorized books remain available.
- Choose later uses Work items and Draft total instead of implying a Job. Switching from standard work to a checklist and back restores the standard outcome, including null. Checklist selection is remembered for the mounted editing session and restored only if still eligible for the current customer/property. This is local UI memory, not a new persisted field or cross-session promise.
- Save, launch confirmation, privacy, role gates, idempotency, and lifecycle contracts are unchanged. No record was saved or created in authenticated Demo verification.

Validation: 226 focused regression cases were verified (225 passed in the combined run; the remaining asynchronous output-handoff assertion was corrected to await completion and all three output variants passed on rerun). The three new desktop/mobile/state-preservation cases also passed after final spacing changes. Type checking, production build, lint (zero errors, unchanged 77 warnings), and 27 architecture tests pass. Authenticated Demo desktop/mobile checks passed locally and again on the hosted Demo Preview for `5661595` (2/2 in each run), including the sticky action bar and an unsaved priced item. GitHub quality checks and the three normal Preview deployments passed.

## Tutorial freshness

Tutorial impact: UPDATE REQUIRED

Production Help Studio was searched by Dashboard, contractor.work, Work, Draft, Start New Draft, Estimate, Templates, and Schedule. Dashboard, Start New Draft, Templates, and Schedule returned no matching published item; contractor.work matched TUT-003; Draft matched TUT-002; broader Work/Estimate terms also matched TUT-001 and TUT-005. Each matching published item was opened in Preview and its written steps and visible entry path compared with this slice.

- TUT-002 **How to create an estimate**, published revision 3: UPDATE REQUIRED. Its 45.12-second silent video starts in Service Requests and uses Create Estimate/Build blank estimate, while its steps describe Draft-first creation. That pre-existing mismatch remains, and the replacement must also show the revised Work entry and What are you preparing? label.
- TUT-003 **How to complete work and save the service record**, revision 1: existing accepted-Estimate, Job, completion, and filing steps remain applicable; those actions are unchanged. The 57.32-second preview played to completion at 1×.
- TUT-001 **How to handle a homeowner service request**, revision 1: the Request → Create Estimate route and its choices are unchanged by this slice.
- TUT-005 **How to connect and request service**, revision 1: homeowner connection and request steps are unchanged by this contractor-only slice.

Post-implementation follow-up for `5661595`: only after application/Preview validation, Help Studio was searched for Draft, contractor.drafts, What needs doing, Scope, Inspection, Estimate, Price Book, Private notes, Next step, and Invoice. Draft/contractor.drafts matched TUT-002; Estimate also matched TUT-001 and TUT-003; Invoice matched TUT-004. Other listed terms returned no matches. All four matching published revisions were opened in Preview and their written paths compared; TUT-002's paused entry frame still shows Service Requests. No recordings were played again. TUT-004's completed-work → Invoice → offline-payment route is unchanged. The updated TUT-002 replacement brief now follows the final three-section order and the action bar; replacement recording/publication remains open.

Affected tutorials: TUT-002 How to create an estimate, revision 3.

Tutorial follow-up: Codex prepares the governed Draft-first narrated/captioned replacement using the updated [replacement brief](../tutorials/TUT-002_REPLACEMENT_BRIEF_2026-09-08.md); Ben approves Production Help publication. Preserve revision 3 until its immutable replacement is published and verified. If the app merges first to make a current Demo recording available, the merge decision must acknowledge the temporary tutorial gap under the [workflow gate](../CODEX_WORKFLOW_TEMPLATE.md#tutorial-freshness-gate).

## Review links

- [Draft PR #576](https://github.com/bencatchot/ServSync-App/pull/576)
- [Demo Preview](https://servsync-demo-git-codex-refine-cont-50328d-bencatchots-projects.vercel.app)

## Documentation and handoff

Changelog and the existing tutorial replacement brief are updated. Product vision, roadmap direction, marketing claims, and backend rollout state do not change. No main merge, manual Production deployment, SQL, environment configuration change, or Production Help mutation was performed.

Return to controlled-pilot preflight after this slice: the roadmap identifies TUT-006 homeowner records and the TUT-002 standards upgrade as remaining tutorial-readiness work. This presentation pass does not close those gates.
