<!-- Converted from docs/servsync-master-plan/ServSync_Master_Plan_v1_0_Updated.docx. -->
<!-- Keep this Markdown companion synchronized with roadmap/product-direction changes. -->

# ServSync Master Plan

**v1.0 Updated Draft**

Product strategy, roadmap, marketplace positioning, beta plan, and Codex-ready operating reference

| Purpose<br>This document is the master planning reference for ServSync. It captures the product vision, current build understanding, strategic decisions from prior chats, open gaps, and the near-term execution plan. It is intended to live in GitHub as a reference document for the founder, ChatGPT, Codex, and future contributors. |
| --- |

Prepared for Ben Catchot | June 15, 2026

# Version Control and How to Use This Document

| Field | Value |
| --- | --- |
| Document name | ServSync Master Plan v1.0 Updated Draft |
| Recommended GitHub path | docs/strategy/ServSync_Master_Plan_v1_0.docx |
| Recommended editable source path | docs/strategy/servsync-master-plan-v1.md or docs/strategy/servsync-master-plan-v1-notes.md |
| Primary purpose | Single source of truth for ServSync strategy and roadmap decisions |
| Update method | Update this document whenever major product, pricing, roadmap, beta, or messaging decisions change |
| Important guardrail | Do not let Codex make product changes from this document without a separate, narrow implementation prompt and explicit approval |

Recommended workflow: keep this Word document for human reading and review. If Codex needs to reference it, also store a Markdown version or summary in the repository because Codex/code agents usually work best with text-based files. The Word document can still live in GitHub, but a Markdown companion is more agent-friendly.

- Human-readable master file: docs/strategy/ServSync_Master_Plan_v1_0.docx
- AI/code-agent companion file: docs/strategy/servsync-master-plan-v1.md
- Roadmap implementation prompts should live separately under docs/prompts/ or docs/implementation-plans/.
- Never ask Codex to “do the whole master plan.” Ask Codex to audit or implement one clearly bounded section at a time.

# 1. Executive Summary

ServSync is a homeowner-contractor marketplace with contractor software. It is designed to help homeowners find local service contractors, connect with them in a controlled way, communicate clearly, request work, review estimates and invoices, preserve a Home History for their property, and create manual follow-up reminders. On the contractor side, ServSync gives solo and small-team contractors practical software tools for requests, estimates, jobs, invoices, reports, calendar events, customer/home records, and workflow follow-up.

The product should not be positioned as only contractor software or only a lead marketplace. Its strategic difference is the connection between the two: discovery plus the workflow that happens after discovery. The strongest simple platform message remains: Find local contractors. Keep the work organized.

The first commercial focus should stay on solo and small contractors. These users need affordable, practical tools and exposure to local homeowners, but often do not want the complexity or price of major field service management platforms. Homeowners should remain free in the early stages because homeowner adoption creates marketplace value for contractors.

| Current strategic decision<br>The primary button on a contractor profile should be Connect. This is more differentiated than a generic Message or Request Service button because the ServSync connection creates a permission-based working relationship, not just a one-off contact. |
| --- |

| Strategic area | Decision |
| --- | --- |
| Product category | Homeowner-contractor marketplace with contractor software |
| Primary paying customer | Solo and small contractors |
| Homeowner pricing | Free for core homeowner use during early beta and launch |
| Marketplace differentiator | Discover exposure plus connection-based workflow |
| Contractor profile CTA | Connect |
| Connection request | Should include message, optional photos, property context, and permission selection |
| Messaging direction | Homeowner should be able to communicate with a contractor without creating a service request |
| Beta pricing direction | 30-day free trial, likely $20/mo premium after beta, possible $5/mo basic Discover/communication tier |
| Most evolving workflow | Job workflow based on beta user feedback |

# 2. Product Vision

ServSync should become the organized service relationship layer between homeowners and local contractors. The homeowner should not have to chase scattered Facebook comments, text threads, old PDFs, and forgotten invoices. The contractor should not have to jump between manual estimates, messages, spreadsheets, paper notes, and one-off invoices. ServSync should give both sides a shared structure for work.

The vision is deliberately practical. ServSync should not sound like an inflated startup promise. It should sound like a useful product built by someone who understands field service work. The platform should make small contractors look more professional and make homeowners feel more organized and in control.

- For homeowners: find local contractors, connect, request service, communicate, review estimates/invoices, and keep home records.
- For contractors: get discovered, receive contextual connection/service requests, estimate work, manage jobs, invoice customers, and retain long-term relationships.
- For the platform: create a local service network where connection, work history, and practical tools reinforce each other over time.

# 3. Plain-Language Product Definition

ServSync connects homeowners with local service contractors and keeps requests, estimates, jobs, invoices, communication, and home service history organized in one place.

Simpler platform wording should be preferred when describing ServSync publicly. Avoid overcomplicated language like “integrated homeowner-contractor workflow ecosystem” unless writing internal strategy. Public copy should be direct and credible.

| Audience | Plain-language message |
| --- | --- |
| Homeowner | Find local contractors, request work clearly, and keep your home service history organized. |
| Contractor | Get discovered by local homeowners and manage the work professionally from first request to final invoice. |
| Platform | Find local contractors. Keep the work organized. |
| Investor/partner | A marketplace and workflow platform connecting local homeowners and small contractors through permission-based relationships and service records. |

# 4. Target Audience

ServSync should serve all small contractors broadly, but the first design and pricing decisions should favor solo operators and very small teams. The user is likely someone who gets work through referrals, Facebook, word of mouth, repeat customers, and local visibility, but lacks a clean system for the work after the lead appears.

| Segment | Priority | Notes |
| --- | --- | --- |
| Solo contractors | Highest | Best early target; simpler onboarding, lower price sensitivity threshold, clear need for professionalism. |
| 2-person contractors | High | Still close to the solo workflow; pricing should not punish first growth step. |
| 3-5 person teams | Medium later | May need team roles, scheduling, dispatch, and stronger admin controls. |
| 10+ tech companies | Low for early stage | Likely already compare against larger FSM products; avoid building for them too early. |
| Homeowners | Strategically high | Free users create marketplace demand and long-term home records. |

# 5. Strategic Positioning

ServSync should not try to look like a smaller ServiceTitan or a generic Angi alternative. The positioning should sit between contractor software and homeowner discovery. Most contractor software assumes the contractor already has the customer. Most lead sites help the homeowner find a name and then disappear. ServSync should connect discovery to the actual work lifecycle.

- Not just a lead site: ServSync supports what happens after a homeowner finds a contractor.
- Not just contractor software: ServSync gives contractors homeowner-facing exposure and connection opportunities.
- Not just records storage: service history becomes useful because it is connected to requests, jobs, contractors, invoices, and reminders.
- Not enterprise software: early product should remain simple, affordable, and practical for small contractors.

# 6. Core MVP Loop

The product should be judged against the core loop: Homeowner Request -> Contractor Estimate -> Homeowner Approval -> Job -> Completion -> Invoice -> Home History -> Reminder. Recent v1 cleanup work has made this loop more visible and easier to follow for both homeowners and contractors. The remaining work is deeper workflow hardening, automation, end-to-end coverage, and beta readiness rather than basic loop discovery.

| Step | Current understanding | Priority |
| --- | --- | --- |
| Homeowner Request | Homeowners can create requests tied to homes/properties. Direct connected-contractor flow exists. Recent UI copy clarifies what happens after a request is sent and after an estimate is accepted. | Harden end-to-end coverage and beta QA. |
| Contractor Estimate | Estimate creation, line items, templates, notes, terms, sending, and PDF download exist. Recent contractor cleanup makes Create/Open Estimate and accepted-estimate next steps clearer. | Keep estimate path clear from invoice path and expand test coverage. |
| Homeowner Approval | Accept/decline status and RPCs exist. Homeowner accepted-estimate copy now explains that the contractor's next step is to create, schedule, or complete the job/work. | Validate the full approval-to-job handoff in beta. |
| Job | Jobs are backed by inspections table; simple service jobs and checklist/report jobs exist. Contractor-facing terminology has been partially cleaned up, while internal schema names may still use inspection terminology. | Continue reducing user-facing inspection language where it confuses service work. |
| Completion | Finalization/report filing exists. Recent contractor cleanup keeps invoice creation behind report finalization for checklist/report jobs. | Add broader regression coverage for closeout paths. |
| Invoice | First-class invoices exist. Homeowner invoices can be filed to Home History through a durable invoice relationship without duplicate PDF storage. | Keep invoice actions focused and test invoice-to-history filing. |
| Home History | Home History is the homeowner-facing destination for completed work, filed reports, invoices/receipts, notes, warranty context, and service records. It uses existing maintenance-log/database structures internally. | Avoid overbuilding a new timeline until beta feedback proves the need. |
| Reminder | Homeowner-only manual Home Reminders v1 is shipped. It supports in-app reminders tied to homes/Home History context without email, text, push, recurrence, scheduler, or calendar sync automation. | Keep automation future-facing until manual reminders are validated. |

# 7. Current Build Audit Summary

The repository audit shows ServSync has progressed far beyond a simple prototype. It contains request, estimate, job, invoice, connection, permission, Discover, calendar, notification, document, report, reminder, and admin concepts. The recent PR #1-#11 sequence improved the core-loop path, Home History, manual reminders, SQL provenance, smoke-test expectations, calendar event details, and user-facing terminology. The risk is now less about finding the loop and more about beta readiness, end-to-end reliability, mobile density, and avoiding overpromising unbuilt automation.

| Area | Status | Beta concern |
| --- | --- | --- |
| Requests | Working and clearer after homeowner/contractor core-loop copy updates | Needs full request-to-invoice E2E coverage. |
| Estimates | Working with clearer accepted-estimate handoff | Continue avoiding overlap with invoice actions. |
| Invoices | Working, including invoice-to-Home-History filing v1 | Payment processing and contractor-side filing remain deferred. |
| Jobs | Working but inspection-backed internally | Continue user-facing terminology cleanup without renaming schema casually. |
| Home History | Homeowner-facing v1 is shipped on top of existing maintenance-log structures | Do not build a separate timeline table until beta feedback justifies it. |
| Reminders | Homeowner-only manual reminders v1 is shipped | No push/email/text alerts, recurrence, scheduler, or calendar sync yet. |
| Connections | Working | Needs contextual connection request messaging/media. |
| Permissions | Working for limited categories | Do not overclaim sharing categories. |
| Mobile | Responsive but dense | Needs core-loop mobile QA before broad beta. |

# 8. Homeowner Experience

The homeowner experience should feel lightweight. Most homeowners will likely have one property, so the app should not constantly force a multi-property mental model. Multi-property support should exist, but the default user experience should be simple for a single-property homeowner.

- Homeowner can create an account and add basic home/property info.
- Homeowner can browse Discover and contractor profiles.
- Homeowner can request a connection with a contractor and include a message/photos.
- Homeowner can grant permission to share implemented categories: contact info, home overview, address, preferred vendors, photos.
- Homeowner can submit service requests, review estimates, approve/decline, view invoices, file eligible invoices to Home History, create manual reminders, and access home service history.
- Homeowner should be able to communicate with a contractor without starting a service request.

# 9. Contractor Experience

The contractor experience should be practical, not bloated. The contractor should quickly understand: how do I get seen, receive better-context requests, communicate, estimate, perform the job, invoice, and keep the customer relationship organized?

- Contractor creates a profile with business details, service area, trade type, and future Discover content.
- Contractor can be found by homeowners in Discover/search/feed experiences.
- Contractor receives contextual connection requests with homeowner message, optional photos, and permission choices.
- Contractor can communicate without forcing every conversation into a service request.
- Contractor can convert serious needs into requests, estimates, jobs, invoices, and service records.
- Contractor should see clear next actions instead of hunting across tabs. Recent cleanup work made request-to-estimate, accepted-estimate-to-job, completed-job-to-invoice, and service/checklist terminology clearer without changing stored status values or internal database names.

# 10. Discover Marketplace Strategy

Discover is the platform-wide differentiator because it gives contractors exposure and gives homeowners an organized alternative to scattered local recommendation threads. It should not become another generic contractor search page. It should feel like an organized local contractor feed and profile network.

| Discover principle | Direction |
| --- | --- |
| Primary value | Exposure for small contractors and a better starting point for homeowners. |
| Homeowner need | Find relevant local contractors with enough context to take the next step. |
| Contractor need | Be visible without relying only on paid ads or word-of-mouth chaos. |
| Main CTA | Connect. |
| Secondary CTAs | Request service, view profile, save contractor, ask question/message. |
| Content strategy | Contractor posts/feed, practical updates, service examples, maintenance tips, before/after content later when real. |

The Discover tab should not show a generic property selector at the top for single-property homeowners. It should focus on contractor exposure and recent contractor content. Contractor search belongs primarily in a contractor search/profile context, while Discover should feel more feed-like.

# 11. Connection System and New Connection Request Flow

A ServSync connection is not just a message. It is an app-level relationship between homeowner and contractor. It enables permission-based sharing and makes future requests, estimates, jobs, invoices, and home records easier to manage. This is one of the strongest differentiators in the product.

| New decision to add to roadmap<br>When a homeowner clicks Connect on a contractor profile, they should be shown a request connection screen where they can enter a message, optionally upload photos, select the relevant property, and choose what information they want to share. The contractor should receive context instead of a blind connection request. |
| --- |

| Connection request field | Purpose |
| --- | --- |
| Home/property | Shows which home the context relates to. |
| Message box | Lets homeowner ask a question or explain why they want to connect. |
| Optional photos | Allows visual context without forcing a service request. |
| Permission selection | Lets homeowner control what the contractor can see. |
| Request Connection button | Sends contextual request to contractor. |

- The request should not automatically become a service request unless the homeowner chooses that path.
- The contractor should be able to accept, decline, or respond/ask for more information depending on workflow design.
- After connection, homeowner and contractor should have a general communication thread in addition to request-specific messaging.

# 12. General Messaging Without Service Request

Currently, communication is mostly tied to service requests or support contexts. A homeowner may want to ask a contractor a question without formally requesting service. This is a real use case and should be added to the roadmap as connection-level communication.

| Messaging type | Description | Priority |
| --- | --- | --- |
| Connection request message | Message/photos included before connection is accepted. | High beta differentiator. |
| Connection-level thread | General homeowner-contractor conversation after connection. | High after connection request flow. |
| Request-specific messaging | Messages tied to a service request/job context. | Already exists, keep. |
| Support messaging | User-to-ServSync support or admin context. | Already exists separately. |

Guardrail: messaging should not become chaotic. The UI should make clear whether a message is general, attached to a connection request, or attached to a specific service request/job.

# 13. Permissions and Shared Information

Permission-based sharing should remain honest and limited to what is implemented. Current implemented categories are contact info, home overview, address, preferred vendors, and photos. Marketing and onboarding should not imply that estimates, invoices, reports, requests, notes, or full job history are automatically shared through permissions unless those become explicit categories later.

| Implemented category | Public explanation |
| --- | --- |
| Contact info | Basic contact details used so the contractor can communicate. |
| Home overview | High-level home/property information useful for service context. |
| Address | Service location information. |
| Preferred vendors | Known vendor contacts saved by the homeowner. |
| Photos | Homeowner-provided photos relevant to the property or issue. |

- Future permission categories could include documents, service history, reports, estimates, invoices, or notes, but these should not be marketed as current unless implemented.
- Connection permissions should be clear before, during, and after the connection request.
- Homeowners should be able to understand and revoke/modify access where supported.

# 14. Pricing Strategy

The pricing strategy should support contractor adoption while preserving room to grow. Early pricing should not pretend the product is as mature as major competitors, but it should not be free forever for contractors. Homeowners should stay free for core use because homeowner growth creates contractor value.

| Plan concept | Early price idea | Included value | Notes |
| --- | --- | --- | --- |
| Free homeowner | Free | Home profile, service requests, connections, estimates/invoices, history basics. | Potential storage limits later. |
| Contractor Basic | ~$5/mo | Discover presence, profile, simple communication/connection features. | Useful to get contractors on the platform early. |
| Contractor Premium | ~$20/mo after 30-day free trial | Full contractor workflow: requests, estimates, jobs, invoices, calendar, records, tools. | Initial beta/early launch target. |
| Additional users | First two at $20/mo each; additional users ~$10/mo later | Multi-user team access. | Likely later; may change if team tools become stronger. |
| Future storage add-on | TBD | Expanded document/photo/PDF storage. | Free accounts minimal storage; paid accounts larger storage. |

The document should explicitly state that pricing will likely change as ServSync proves reliability, gains capability, and supports more complex contractor workflows. Near-term price increases are not planned, but long-term pricing should reflect proven value.

- Keep contractor pricing cheaper than major competition early on.
- Avoid enterprise-tier assumptions until the product truly supports teams of 3-5+ with admin, permissions, dispatch, and reporting depth.
- Consider keeping Basic low-cost to seed Discover supply, but avoid giving away expensive storage or advanced tools for free.

# 15. Beta Strategy

ServSync should be positioned as beta because the job workflow and communication patterns will evolve based on actual user feedback. Beta should not mean unreliable; it should mean early access to a useful product that is still being refined with honest feedback.

| Beta principle | Execution |
| --- | --- |
| Small initial group | Start with 2-3 friendly beta users before inviting a broader group. |
| Honest positioning | No fake users, fake metrics, fake testimonials, or exaggerated claims. |
| Focus on core loop | Do not chase new features until request -> estimate -> job -> invoice -> history is reliable. |
| Feedback emphasis | Ask contractors where the job workflow feels wrong or too slow. |
| Marketplace learning | Measure whether Discover/connection creates real contractor interest. |

Current beta-readiness notes:

- Authenticated production smoke is intentionally skipped unless dedicated production smoke accounts are created.
- Preview/sandbox should remain the default place for authenticated testing.
- Full end-to-end coverage for the core loop remains future work.
- Mobile visual QA remains important because contractor and homeowner cards can become dense.
- Local Vercel CLI account/project mismatch is a non-blocking tooling cleanup item.

# 16. Roadmap Priorities

The roadmap should stay disciplined. The app already has many features. Recent cleanup work made the core loop clearer and shipped v1 Home History, invoice-to-Home-History filing, homeowner manual reminders, SQL provenance cleanup, calendar event details, and terminology improvements. The next work should harden beta readiness, improve test coverage, and add marketplace/connection differentiators in small audited branches.

| Priority | Workstream | Why it matters |
| --- | --- | --- |
| 1 | Beta readiness and release checklist | Confirms the cleaned-up core loop is dependable enough for friendly beta users. |
| 2 | Full E2E core-loop coverage | Protects request -> estimate -> approval -> job -> invoice -> Home History -> reminder behavior. |
| 3 | Mobile core-loop QA | Contractors will use this in the field, and recent cards/actions need real viewport review. |
| 4 | Production smoke account plan | Enables safe authenticated production smoke without using personal or fragile accounts. |
| 5 | Connection request message/photos/property/permissions | This strengthens the main differentiator. |
| 6 | General connection-level messaging | Allows questions without forcing service requests. |
| 7 | Discover feed strategy audit | Keeps marketplace work grounded in real contractor posts/photos and homeowner discovery needs. |
| 8 | Dashboard and notification accuracy | Builds trust and reduces confusion. Notification automation remains future-facing. |
| 9 | Beta onboarding and feedback capture | Turns early users into product direction. |
| 10 | Payments/Stripe, QuickBooks, push/email/text automation, native mobile apps, and full calendar sync later | Important, but after the core loop and beta operations are reliable. |

SQL provenance note: tracked replacements for estimate-to-job support and home-specific inspection templates are now in main. If old loose SQL files such as `servsync-estimate-to-job.sql` or `servsync-home-specific-templates.sql` are encountered outside the repo, do not apply them directly; use the reviewed tracked SQL patches instead.

# 17. Codex Operating Rules

Codex should be used for repository audit, implementation planning, code changes, tests, and PRs. It should not be handed this master plan with permission to change the app broadly. Every implementation task should be narrow, approved, and reviewed.

- Codex must audit first when the task could affect multiple areas.
- Codex must not change code without explicit approval.
- Codex must report files changed, checks run, and risk level.
- No production deployment or merge to main without explicit approval.
- For authenticated Playwright testing, Codex should load .env.test.local, verify required env names exist without printing values, and use the branch-specific TEST_APP_URL.
- Codex prompts should be stored separately from this master plan when they are implementation-specific.

# 18. GitHub Storage Plan

The master plan should be stored in GitHub so it stays near the code and can be referenced during product work. Since Word documents are not ideal for code agents, use both a Word copy and a Markdown companion when possible.

| File | Recommended path | Purpose |
| --- | --- | --- |
| ServSync_Master_Plan_v1_0.docx | docs/strategy/ServSync_Master_Plan_v1_0.docx | Human-readable formatted plan. |
| servsync-master-plan-v1.md | docs/strategy/servsync-master-plan-v1.md | AI/Codex-readable text version. |
| roadmap.md | docs/strategy/roadmap.md | Short task roadmap for active work. |
| beta-test-plan.md | docs/beta/beta-test-plan.md | Manual beta testing checklist. |
| codex-prompts/ | docs/prompts/ | Approved implementation/audit prompts. |

| Manual GitHub upload guidance<br>Create a docs/strategy folder in the repository. Upload the .docx there. Later, if a Markdown version is created, upload it beside the Word document. Do not overwrite without changing the version name or commit message so history stays clear. |
| --- |

# 19. Open Questions and Gaps to Fill

These items need more founder input or beta learning before they can be finalized.

| Question | Current answer | Action |
| --- | --- | --- |
| Who is the single sharpest first contractor persona? | Not finalized; all small contractors, solo-first. | Revisit after beta interviews. |
| Which trade gets the best first templates/tools? | Broad small contractors, with HVAC/plumbing/electrical/handyman/pest/maintenance in scope. | Decide after seeing early user interest. |
| How does Basic vs Premium differ exactly? | $5 Basic Discover/communication, $20 Premium full tools is the current thought. | Define exact feature gates before Stripe. |
| What homeowner features can be monetized? | Storage limits/add-ons possible later. | Do not monetize too early if it slows homeowner growth. |
| How deep should team tools go? | Per-user pricing later; enterprise/team workflow later. | Do not build enterprise product too early. |
| Should general messaging be before or after connection? | Connection request message before; general thread after connection. | Confirm in design phase. |
| Should contractor call tracking be prioritized? | No-priority backlog for calls made/received outside the app. | Revisit only after beta proves a strong workflow need. |

# 20. Immediate Next Steps

1. Treat PRs #1-#11 as the current shipped cleanup baseline for the core MVP loop.
2. Run a focused beta-readiness/release-checklist audit before starting another major feature.
3. Decide whether to create dedicated production smoke accounts; until then, keep authenticated smoke testing in preview/sandbox.
4. Audit the current connection/profile flow before implementing contextual connection requests.
5. Do not ask Codex to implement the new connection request flow until the desired UI and data model are defined.
6. After approval, create a narrow Codex prompt for a planning audit: contractor profile CTA, connection request modal/page, message/photos/property/permissions fields, and general messaging implications.
7. Keep QuickBooks, payments/Stripe, push/email/text automation, native mobile apps, full calendar sync, and contractor call tracking future-facing until the beta loop is stable.

# Appendix A: Draft Codex Audit Prompt for Connection Flow

Use this prompt only when ready to ask Codex for an audit. It is not an implementation approval prompt.

Audit the current ServSync contractor profile, Discover, connection request, permissions, and messaging flow. Do not modify files. Report where the app currently supports: contractor profile CTA, connection request creation, homeowner message/context, photo upload, property/home context, permission selection, contractor accept/decline, and any general homeowner-contractor messaging outside service requests. Identify minimal frontend, backend, schema, RLS, and notification changes needed to support a contextual connection request: homeowner clicks Connect, enters a message, optionally uploads photos, selects property, selects sharing permissions, and sends a request to the contractor. Also identify whether general connection-level messaging should be built in the same PR or separate PR. Return a risk-rated implementation plan in small PRs. Do not implement.
