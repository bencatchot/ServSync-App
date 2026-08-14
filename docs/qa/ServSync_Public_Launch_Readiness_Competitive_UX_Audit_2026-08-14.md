# ServSync Public Launch Readiness + Competitive UX Audit v1

Date: 2026-08-14

Audited base: `23152e77b3f4ad9498b7c3a85892d9908531f609`

Environment discipline: Production read-only; Sandbox used for tagged lifecycle validation with exact cleanup.

## 1. Executive Verdict

**P1 PRODUCT FIXES COMPLETE; LIMITED PUBLIC BETA STILL GATED.** ServSync's core connected and account-free work lifecycles are real, durable, role-aware, tenant-isolated, and usable on mobile. The closeout branch promotes Jobs to first-class Customer Work, compresses empty/light schedule states, and replaces the large native Draft Customer list with a bounded searchable connected/local selector. It is not ready for a broader public launch: online payments remain inactive outside Sandbox, dispatch/reporting/integration depth remains limited, real contractor/homeowner usability evidence is still required, and the first natural recurring role-smoke schedule has not yet been observed.

### 2026-08-14 P1 Closeout Addendum

- Jobs is the first destination under `Customer Work` on desktop and remains a primary mobile destination; no `Add-ons` group contains Jobs.
- Empty schedule presentation is one compact, actionable state. Light schedules show only populated days plus an empty-day summary. Populated schedules retain every event, week navigation, and the full-calendar action.
- Both current Draft composers use one ARIA Customer combobox. It searches only already-authorized visible Customer name, connection label, and property context; displays at most 40 of 322 test options; keeps the selected Customer recoverable; preserves explicit multi-property selection; and has desktop/mobile, keyboard, no-result, clear, and reopen coverage.
- Authenticated exact-head Sandbox validation used the approved Owner identity to open Jobs, start an unsaved Draft, and select an existing authorized Customer. It created no fixture and persisted no Draft or business record.
- Public-beta confidence improves, but the first natural PR #447 schedule, real contractor/homeowner trials, and candid capability boundaries remain release gates.

## 2. Confidence Scores

| Area | Score | Material uncertainty |
| --- | ---: | --- |
| Functional correctness | 8.4 | Broad lifecycle proof is strong; exception coverage is less complete than the happy paths. |
| Security/data integrity | 9.0 | Role, cross-tenant, direct-record, and private-cost boundaries passed; no P0 found. |
| Reliability/operations | 7.7 | Recovery is proven; only one natural Storage run/drill and no natural role-smoke run yet. |
| Contractor UX | 7.5 | Core work is now prominent and Customer selection scales; unfamiliar-user evidence remains simulated/internal. |
| Contractor visual polish | 7.5 | Consistent, restrained system; hierarchy and internal wording need refinement. |
| Contractor mobile | 7.8 | Jobs, compact schedule, and Customer search remain usable at 390x844; broader real-device evidence remains limited. |
| Homeowner UX | 7.6 | Clear attention and history concepts; dense financial pages and long explanations remain. |
| Homeowner visual polish | 7.7 | Trustworthy and coherent; some screens are card-heavy and text-heavy. |
| Homeowner mobile | 7.3 | Functional with persistent navigation; estimate review is long but understandable. |
| First-time-user intuitiveness | 7.0 | Navigation and first-viewport hierarchy are materially clearer; real cold-user trials remain required. |
| Competitive table stakes | 6.0 | Core CRM/work lifecycle is credible; dispatch, live payments, reporting, integrations, and automation lag. |
| Differentiation strength | 7.2 | Connected plus account-free continuity and homeowner-owned home history are defensible. |
| Limited-public-beta readiness | 7.7 | Product P1s are closed; natural role smoke, real-user trials, and beta-boundary communication remain. |
| Broad-public-launch readiness | 5.4 | Operational breadth, ecosystem, and market proof are not mature enough. |

## 3. P0 Launch Blockers

None reproduced. No cross-tenant access, financial corruption, private-cost leak, destructive duplicate, severe mobile breakage, or inability to complete the canonical lifecycle was found.

## 4. P1 Pre-Launch Fixes

1. **CLOSED - UX/Competitive:** Jobs is first in `Customer Work` and no longer appears under `Add-ons`.
2. **CLOSED - UX/Mobile:** Empty/light schedule states are compact while populated schedules retain every event and week control.
3. **CLOSED - UX/Scale:** Both Draft composers use one searchable, keyboard-safe customer/property chooser with a 40-result rendering bound and 322-option evidence.
4. **Reliability/Test Gap:** Observe and pass the first genuine scheduled recurring role/fixture smoke after PR #447; local/manual evidence cannot substitute.
5. **Positioning/Product:** State plainly that Production online payments, advanced dispatch, broad integrations, and deep reporting are not live. Either gate public beta to users who accept that boundary or complete separately approved launch slices.

## 5. P2/P3 Polish

- P2 Visual: Remove duplicated legal links and redundant sign-in labeling.
- P2 UX: Replace `11 current flags`, `Beta access`, and similar implementation language with customer-facing setup/status language or hide it outside administration.
- P2 Performance: Split the 2.18 MB minified / 491.63 kB gzip main application chunk; measured field impact is not yet proven.
- P2 Homeowner UX: Shorten the explanatory block above Estimates/Invoices and progressively disclose property-scope migration guidance.
- P3 Visual: Reduce repeated nested cards and borders on dense financial/profile screens.

## 6. Contractor Journey Findings

**Reticle A:** The account-free Estimate approval -> Job -> Invoice -> offline Paid -> PDF/history path and direct Draft Invoice -> Paid path both passed. The connected request -> Estimate -> homeowner acceptance -> Job -> Invoice -> partial/final payment -> Home History/reminder suite passed 2/2. Draft lines, Price Book snapshots, payment state, reload persistence, and cleanup behaved correctly.

**Reticle B (closeout):** Navigation alone now presents Jobs as the first Customer Work destination. Empty/light schedules no longer spend the first viewport on seven empty rows. From Jobs, Start New Draft opens a searchable Customer selector that narrows hundreds of connected/local records by visible name and property context before the normal property handoff. The flow remains more explanation-heavy than a mature guided onboarding and still needs real cold-contractor evidence.

## 7. Homeowner Journey Findings

The low-activity homeowner dashboard clearly explains property context, request creation, records, contractor connection, and next steps. Estimates show amount, status, contractor, property, PDF, line items, Price Required semantics, acceptance, and decline. Home History and documents support a useful homeowner-retained record. Weaknesses are density, long instructional passages, and limited practical value before a contractor connection exists.

## 8. Mobile Findings

Contractor and homeowner pages at 390x844 had `scrollWidth === clientWidth`. Bottom navigation, estimate review, Jobs controls, and read surfaces remained usable. The closeout removes the seven-row empty schedule that previously pushed contractor work roughly 1,366 px down and keeps Customer search/property handoff usable at 390x844. Homeowner financial density and other long-card scrolling remain. No severe tap-target or clipping defect was observed.

## 9. Role / Security / Isolation Findings

Sandbox role UI passed 8/8 for Owner, Admin, Office, Field Technician, Viewer, Homeowner, and contractor/homeowner mobile. The API operator passed 24/24 after its custom-denial classifier was corrected. Owner/Admin/Office retain billing; Field Technician retains operational Job authority without billing/private cost; Viewer is read-only. Contractor A/B, Homeowner A/B, exact Customer, Invoice, Price Book, home, and membership probes remained isolated. Production was not mutated.

## 10. Failure-Recovery Findings

Double-action and idempotency boundaries are represented in established workflow tests. Tagged lifecycle fixtures were cleaned to zero. Recovery evidence on current main supports a provisional 24-hour RPO / 4-hour RTO operating target from one natural Storage run and a 27m03.393s full recovery drill, not an SLA. Expected local Vercel Analytics 404s previously caused false failures; the audit correction ignores only that exact loopback resource. Stale/expired secure-link and interrupted-edit evidence is present in focused suites, but it was not all manually replayed in this audit.

## 11. Visual Polish Findings

ServSync has a consistent navy/blue system, readable typography, predictable cards, and restrained status colors. It feels more professional than experimental. Repeated weaknesses are card density, long explanatory copy, weak first-viewport prioritization, internal operational terminology, and core actions placed at the same weight as secondary setup tools.

## 12. Jobber Workflow Comparison

**Official vendor documentation:** Jobber integrates quotes with products/services, customer online approval/change requests, job conversion, scheduling, invoices, PDFs, a broad Client Hub, granular permissions, online booking, payments, and more than 20 reports. Its workflow is more established and direct for daily dispatch/billing. ServSync has stronger explicit homeowner property/history ownership and supports both connected and account-free customers without abandoning the same contractor workflow. ServSync is behind on schedule/dispatch depth, payments, automation, reporting, integrations, onboarding maturity, and market proof.

## 13. Housecall Pro Workflow Comparison

**Official vendor documentation:** Housecall Pro centers scheduling/dispatch, estimates, jobs, invoices/payments, online booking, Price Book, Customer Portal, granular employee permissions, QuickBooks, and up to 40 built-in reports. It is deeper for operating crews and revenue workflows. ServSync is simpler and less commercially layered, with a clearer homeowner-retained home record, but remains behind on dispatch, reporting, payments, integrations, marketing/review tooling, and service-business automation.

## 14. User Sentiment Research

**Repeated user sentiment:** G2 summaries praise both competitors for ease of use and consolidating scheduling, invoicing, and communication; both also receive mobile limitation/glitch complaints. **Repeated but mixed public discussion:** pricing/add-on cost, cancellation/support frustration, feature differences between web and mobile, and integration gaps appear repeatedly. **Single anecdotes:** extreme data-loss, billing, or support allegations in Reddit threads are not treated as established facts. ServSync has insufficient independent user sentiment or track-record evidence.

## 15. Neutral Competitive Matrix

| Workflow/category | Classification | Neutral assessment |
| --- | --- | --- |
| Customer records and core Estimate/Job/Invoice chain | Competitive Parity | Durable and complete, but slower to discover. |
| Account-free plus connected Customer continuity | ServSync Advantage | One contractor workflow supports both relationship states. |
| Home/property history owned by homeowner | ServSync Advantage | More durable than a transaction-only client portal concept. |
| Quote/Estimate approval and PDFs | Competitive Parity | Core behavior is credible. |
| Scheduling and dispatch | ServSync Disadvantage | Calendar exists; mature dispatch operations do not. |
| Online payments | ServSync Disadvantage | Production and Demo remain intentionally disabled. |
| Price Book core | Competitive Parity | Safe import/export, reconciliation, cost privacy, and Draft staging are strong. |
| Price Book depth/job costing | ServSync Disadvantage | No assemblies, inventory, provider catalogs, or full job-costing system. |
| Roles/security | ServSync Advantage | Current fail-closed server and aligned UI model is unusually explicit. |
| Reporting/analytics | ServSync Disadvantage | Attention queues are useful but not a reporting suite. |
| Integrations/ecosystem | ServSync Disadvantage | Competitors have mature marketplaces/APIs and accounting connections. |
| Homeowner/client portal | Intentional Difference | ServSync is a continuing home record, not only a contractor-branded portal. |
| Mobile web | Competitive Parity | Useful responsive workflow, but no native app/offline proof. |
| Reliability track record | ServSync Disadvantage | Strong internal evidence, minimal market tenure. |
| Simplicity | Insufficient Evidence | ServSync is less feature-dense, but first-run hierarchy currently wastes that advantage. |

Count: 3 Advantages; 4 Parity; 6 Disadvantages; 1 Intentional Difference; 1 Insufficient Evidence. Counts are descriptive, not a product-quality score.

## 16. ServSync Marketing Chart - Why ServSync

| Claim | Truthful ServSync position | Jobber | Housecall Pro | Confidence |
| --- | --- | --- | --- | --- |
| Customer continuity | Start with a local customer, add secure recipient interactions, and connect later without replacing the contractor workflow. | Mature Client Hub | Mature Customer Portal | High |
| Home record | Give homeowners a persistent property-centered history, records, documents, and reminders. | Client work history | Customer work/payment portal | High |
| Safety and authority | Explicit tenant, role, lifecycle, private-cost, and recipient boundaries. | Mature permissions | Mature permissions | High |
| Draft-first planning | Plan once, then deliberately produce an Estimate, Job, or draft Invoice. | Direct quote/job/invoice model | Direct estimate/job model | Medium |
| Price Book integrity | CSV/XLSX parity, repeat-import reconciliation, audit, rollback, private cost, and safe Draft snapshots. | Mature products/services | Mature Price Book/pricing forms | High |
| Complexity | Fewer commercial modules and less upsell pressure today. | Broader ecosystem | Broader operating suite | Medium; simplicity is not yet fully realized in navigation. |

Do not market ServSync as better at dispatch, payments, reporting, integrations, AI automation, or proven scale today.

## 17. Competitor Attack Chart - Why Not ServSync

| Ethical argument against ServSync | Jobber strength | Housecall Pro strength | Strength |
| --- | --- | --- | --- |
| New product with little market proof | Large installed base and training ecosystem | Established home-service platform | Strong |
| Switching puts core operations on a less-proven system | Migration/support and mature workflows | Mature onboarding and operations | Strong |
| Dispatch/scheduling depth is limited | Mature schedule and field app | Mature dispatch/calendar | Strong |
| Payments are not live in Production | Integrated payment options | Integrated invoices/payments | Strong |
| Reporting is shallow | 20+ built-in reports | Up to 40 reports | Strong |
| Integration ecosystem is small | App Marketplace and GraphQL API | Integrations and public API on higher plans | Strong |
| No native mobile app/offline confidence | Established mobile app | Established mobile app | Moderate |
| Simpler product may omit needed automation | Online booking, reminders, AI/add-ons | Marketing, reviews, booking, communications | Moderate |
| ServSync homeowner record may be more than some contractors need | Familiar Client Hub | Familiar Customer Portal | Moderate |

## 18. Top 5 Reasons to Switch to ServSync

1. **Connected and account-free continuity (High):** useful to small contractors who cannot force every customer into an account.
2. **Homeowner-retained property/history model (High):** useful to relationship-oriented contractors who want a better long-term customer experience.
3. **Explicit, safe role and private-cost boundaries (High):** useful to small teams delegating field and office work.
4. **Strong portable Price Book foundation (High):** useful to spreadsheet-based contractors who need safe reconciliation and rollback.
5. **Deliberate Draft-first planning (Medium):** useful where staff prepare work before choosing Estimate, Job, or Invoice output.

## 19. Top 5 Reasons Not to Switch to ServSync

1. **Maturity and switching risk (Critical):** benefits both competitors; cannot be solved before launch, only reduced with narrow beta, migration support, evidence, and trust.
2. **Dispatch/scheduling depth (High):** benefits both; launch-relevant for multi-crew contractors.
3. **No live Production payments (High):** benefits both; solve before marketing an all-in-one financial workflow.
4. **Reporting/integrations/accounting depth (High):** benefits both; solve selectively after direct customer evidence.
5. **Native/offline mobile and support ecosystem (Medium-High):** benefits both; accept initially for owner-operators if positioned honestly.

## 20. Table Stakes vs Differentiation

**Met:** Customers/properties, Estimates, approval, Jobs, Invoices, offline payment state, PDFs, Price Book, roles, mobile web, customer read portal, history.

**Not yet met for broad launch:** mature dispatch, live payments, accounting integrations, strong reporting, migration/onboarding at scale, established support/training, native/offline field workflow.

**Genuine differentiation:** relationship-state continuity, homeowner-retained property history, explicit Draft planning, security/role rigor.

**Not strong enough yet:** generic simplicity, Discover marketplace value, automation/AI, growth/marketing capabilities.

## 21. Competitive Weaknesses Worth Fixing Before Launch

Fix the contractor first viewport, core-work navigation, searchable customer selection, natural role-smoke acceptance, and launch-boundary communication. Decide whether the initial public cohort can operate without online payments and mature dispatch; do not leave that implicit.

## 22. Competitive Weaknesses We Should Accept for Now

Do not chase broad app marketplaces, forty-report suites, advanced marketing automation, inventory, or enterprise dispatch before real beta evidence. Accept limited ecosystem depth for a tightly defined owner-operator/small-office cohort.

## 23. Genuine ServSync Differentiators Worth Protecting

Protect one Customer workflow across connected/not-connected states, optional homeowner account connection, homeowner-controlled property data, durable Home History, customer-safe snapshots, and strict role/private-cost separation. Do not collapse these into a conventional transaction-only client portal.

## 24. Unsupported Assumptions

- That fewer features automatically feels simpler; current hierarchy disproves this in places.
- That contractors will understand `Draft` or discover Jobs without guided first-run tasks.
- That a persistent homeowner record alone will drive homeowner adoption.
- That offline payments are sufficient for an open beta without segment-specific validation.
- That internal test/recovery strength transfers directly to public trust.
- That contractors will switch without migration assistance, accounting integration, or dispatch parity.

## 25. Changes Made During Audit

| Finding | Correction | Files | Validation |
| --- | --- | --- | --- |
| Role smoke rejected the established Price Book custom denial as provider failure. | Accept only exact `P0001` plus exact established message for that probe; retain `42501` elsewhere. | `scripts/operational-smoke/run-role-fixture-health.ts` | Live Sandbox 24/24. |
| Core loop waited for a retired direct Estimate PATCH. | Wait for `servsync_send_estimate` POST RPC. | `tests/e2e/full-core-loop.spec.ts` | 2/2 lifecycle tests. |
| Expected local Vercel Analytics 404 failed lifecycle tests. | Ignore only the exact loopback Analytics resource miss. | `tests/e2e/helpers/console.ts` | Account-free lifecycle 2/2 and connected lifecycle 2/2. |
| Audit evidence required durable preservation. | Added this report and changelog entry. | `docs/qa/...`, `CHANGELOG.md` | Markdown/diff/sensitive scan. |

No runtime source, SQL, RLS, RPC, grants, environment variables, Production data, provider configuration, or payment behavior changed.

## 26. Remaining Owner Decisions

1. Define the first public-beta contractor cohort: owner-operators/small offices that can accept offline payments and light scheduling, or wait for broader table stakes.
2. Decide whether online payments are a public-beta gate or an explicitly excluded beta capability.
3. Observe the first genuine PR #447 `schedule` run and complete real cold-contractor and homeowner task testing.
4. Choose migration/support promises for contractors leaving another system. Do not promise unsupported white-glove migration.

## 27. Launch Recommendation

Do not open a broad public launch. The Jobs/dashboard/customer-selection P1s are closed. Prepare a limited public beta only after: (1) observing the first natural recurring role smoke, (2) publishing a candid capability boundary for payments, dispatch, reporting, integrations, and support, and (3) confirming no new P0/P1 through real cold-user trials. Recruit 5-8 owner-operators or two-to-five-person HVAC/plumbing/electrical businesses plus 5-8 homeowners. Give them outcome tasks without naming UI controls: add a customer, quote work, respond, complete it, invoice it, find it later, and repeat on mobile. Observe time to first correct action, backtracks, help requests, abandoned tasks, task completion, confidence, and whether they can explain status. Do not ask "Was this easy?" or explain Draft/Home History before the task.

## Evidence Sources

- **Observed directly:** exact-main ServSync desktop/mobile browser review; Sandbox lifecycle, role, and tenant validation; Production read-only application access.
- **Official vendor documentation:** [Jobber Quote Basics](https://help.getjobber.com/hc/en-us/articles/115009378727-Quote-Basics), [Jobber Client Hub](https://help.getjobber.com/hc/en-us/articles/1500011237822-What-Do-Your-Clients-See-in-Client-Hub), [Jobber permissions](https://help.getjobber.com/hc/en-us/articles/115009568687-User-Permissions), [Jobber reports](https://help.getjobber.com/hc/en-us/articles/115009784848-Reports-Basics), [Jobber App Marketplace](https://help.getjobber.com/hc/en-us/articles/360062128653-App-Marketplace), [Housecall Pro navigation](https://help.housecallpro.com/en/articles/6934643-navigating-housecall-pro), [Housecall Pro scheduling](https://help.housecallpro.com/en/articles/6758788-scheduling-jobs-and-estimates), [Housecall Pro Customer Portal](https://help.housecallpro.com/en/articles/8448657-using-the-customer-portal), [Housecall Pro permissions](https://help.housecallpro.com/en/articles/1073431-employee-roles-permissions-explained), [Housecall Pro reports](https://help.housecallpro.com/en/articles/7336458-managing-reports), and [Housecall Pro integrations](https://www.housecallpro.com/integrations/).
- **Repeated user sentiment:** [Jobber G2 reviews](https://www.g2.com/products/jobber/reviews) and [Housecall Pro G2 reviews](https://www.g2.com/products/housecall-pro/reviews).
- **Single anecdotes, not market conclusions:** public Reddit discussions about [Jobber](https://www.reddit.com/r/sweatystartup/comments/1bfw00i/not_happy_with_jobber_beware/) and [Housecall Pro](https://www.reddit.com/r/Contractor/comments/1fmrr7o/is_anyone_using_housecall_pro_is_it_worth_it/).

## Final Comparison Summary

**If ServSync were marketing against Jobber and Housecall Pro today:** Choose ServSync when you want a simpler, relationship-centered workflow that supports local customers now, optional homeowner connection later, and a durable home record without weakening role or financial boundaries.

**If Jobber were marketing against ServSync today:** Choose the proven platform with faster onboarding, mature scheduling, payments, reports, integrations, training, and lower switching risk.

**If Housecall Pro were marketing against ServSync today:** Choose the deeper home-service operating suite for dispatch, online booking, payments, Price Book depth, reporting, marketing, and crew operations.

**Neutral auditor conclusion:** Jobber has the strongest overall proposition today for most small established contractors; Housecall Pro is strongest for feature-dense dispatch/revenue operations; ServSync's clearest opportunity is owner-operated and small service businesses that value low-friction customer continuity and a genuinely useful homeowner property record, provided the first-run UX and launch boundaries are corrected.
