# ServSync Product Information Architecture v1

## 1. Purpose

This document defines how ServSync is organized across the homeowner and contractor experiences.

The [Product Vision & Philosophy](ServSync_Product_Vision_and_Philosophy_v1.md) defines why ServSync exists, who it serves, and the principles that should guide product decisions.

The Product Information Architecture defines where capabilities belong, how users should navigate, how major modules relate to each other, and which product surfaces own which responsibilities.

The [Master Plan](ServSync_Master_Plan_v1_0.md) defines implementation state, roadmap sequencing, rollout context, and execution priorities.

This document should guide future product planning and UI design. It is not an implementation plan, a database design, a redesign mockup, or a replacement for module-specific product specifications.

## 2. Platform Mental Model

ServSync is organized around three enduring entities:

- Homeowner
- Contractor
- Home / Property

Work, records, permissions, and relationships connect those entities.

The homeowner brings the need, owns the home record, controls privacy, and participates in decisions.

The contractor brings service capability, manages work, documents outcomes, and maintains the business relationship.

The home/property is the lasting record. It preserves the service history, documents, decisions, rooms, equipment, reminders, and contractor attribution that remain useful after a single transaction ends.

The shared service lifecycle is:

```text
Need -> Discovery or Existing Connection -> Request -> Contractor Planning -> Estimate -> Approval -> Work -> Invoice -> Home History -> Future Maintenance
```

Not every workflow must use every stage.

Examples:

- A direct Job may skip Estimate when the contractor already has enough trusted context.
- A direct Invoice may skip Job where appropriate and explicitly approved.
- An internal contractor Draft is not visible to homeowners.
- Service may begin through an existing connection rather than Discover.
- A homeowner may preserve a record in Home History without creating a new marketplace relationship.
- A contractor may plan work internally before deciding whether the outcome should become an Estimate, Job, or Invoice.

The architecture should make these paths understandable without fragmenting the platform into unrelated creation flows.

## 3. Shared Platform Principles

- Organize around user goals, not database tables or implementation history.
- Each major screen should have one primary purpose.
- Common workflows should receive the shortest path.
- Module ownership should be clear enough that future features have an obvious home.
- Avoid duplicated creation paths when one shared workflow can serve the need.
- Subscription controls access to capabilities; it should not define the information architecture.
- Cross-module data should remain connected rather than copied into disconnected silos.
- User-facing terminology may differ by profile type when homeowners and contractors think about the same object differently.
- Internal workflow states should not leak across roles.
- Desktop and mobile should use the same mental model even when navigation depth or layout differs.
- The home should remain the durable organizing object for homeowner records.
- Contractor work should remain practical for solo and small-team businesses before adding enterprise depth.
- Future modules should extend the platform without forcing every user to see or pay for advanced capabilities.

## 4. Contractor Portal Mental Model

The contractor portal should help the contractor:

- Understand the business.
- Manage customer relationships.
- Plan and complete work.
- Get paid.
- Grow the business.
- Manage the company.

The long-term contractor portal should be organized around five major pillars:

- Business
- Customers
- Work
- Growth
- Company

### Business

Purpose:

Understand business health, key activity, and what needs attention.

Likely capabilities:

- Dashboard
- performance summaries
- business alerts
- upcoming work summary
- pending approvals
- receivables summary
- onboarding or setup prompts
- lightweight attention queues

Detailed operational work belongs in Work, not Dashboard. Business should summarize and route; it should not become a second copy of Jobs, Estimates, Invoices, Service Requests, or Customers.

### Customers

Purpose:

Manage homeowner and property relationships.

Likely capabilities:

- Homeowners
- connected customers
- contractor-created local customers
- customer profiles
- property context
- Service Requests
- relationship history
- communication references
- customer-level actions
- customer/property notes where permitted

Calendar recommendation:

Calendar should initially belong under Work, with contextual links from Customers and Business.

Rationale:

Appointments and visits are operational commitments tied to work execution. Contractors think of them as "what is scheduled" rather than "which customer exists." Customer profiles should show related upcoming visits, but the operational calendar owner should be Work so scheduling, visits, job progress, and daily field activity stay together.

If future customer relationship management becomes much richer, Customers may have its own timeline or relationship activity view, but that should reference scheduled work rather than own the calendar.

### Work

Purpose:

Turn customer needs into completed, documented, and billable work.

Likely capabilities:

- Drafts
- Open Jobs
- Job History
- Estimates
- Invoices
- Reports
- work templates later
- scheduling and operational activity where appropriate
- work item scope and closeout
- customer-visible work artifacts when sent or activated

`Work` is the current working module name for the redesigned contractor work area. This document does not require that `Work` become the final sidebar label immediately.

Draft-first Work belongs here. The upcoming Draft-first Work redesign should be specified in a separate Work Module Product Specification that uses this architecture as its boundary map.

Work owns the transformation from internal contractor planning into customer-facing and operational outcomes. It should not own contractor discovery, company settings, subscription administration, or homeowner property master data.

Templates posture:

Templates are an internal, secondary capability within Contractor Work. They should primarily start or prefill a Draft rather than become a competing creation system beside `Start New Draft`. Templates should not become a separate global mobile-navigation destination during the initial Draft-first redesign. Existing Templates may remain available during migration, but they should not dictate the new Work architecture. Template redesign should follow the Draft composer and Work landing experience once those surfaces are stable.

### Growth

Purpose:

Help contractors build new relationships and generate future opportunities.

Likely capabilities:

- Discover presence
- Invites & Referrals
- profile visibility
- reviews/reputation later
- marketing tools later
- leads/opportunities later
- public profile improvements
- relationship-building prompts

Growth should focus on opportunity creation. Once an opportunity becomes a customer relationship, request, estimate, job, or invoice, the operational follow-through should move to Customers and Work.

### Company

Purpose:

Configure the contractor organization.

Likely capabilities:

- Business Profile
- team/users
- roles and permissions
- subscriptions
- integrations
- security
- settings
- billing/account administration when implemented
- company-level templates or defaults where appropriate

Business Profile recommendation:

Business Profile belongs canonically under Company.

Rationale:

The Business pillar is for understanding business activity. Business Profile is company configuration: service areas, trades, profile details, visibility setup, and public/company identity. Business may link to Business Profile through setup prompts or dashboard cards, but Company should own the canonical configuration surface.

## 5. Homeowner Portal Mental Model

The homeowner portal should help the homeowner:

- Understand and care for the home.
- Find and maintain trusted contractor relationships.
- Request and follow service.
- Review decisions and costs.
- Preserve the home's record.
- Stay ahead of maintenance.
- Manage privacy and access.

The long-term homeowner portal should be organized around six major pillars:

- Home
- Contractors
- Service
- Records
- Maintenance
- Account

### Home

Purpose:

Provide the homeowner's current property overview.

Likely capabilities:

- property summary
- rooms
- equipment
- important alerts
- recent activity
- upcoming maintenance
- Home Map / Assets & Systems where supported
- multiple-home selection if applicable later

Home should answer: "What do I need to know about this property right now?"

It should not become a generic dumping ground for every record. Detailed historical artifacts belong in Records, while upcoming care belongs in Maintenance.

### Contractors

Purpose:

Find, connect with, and manage trusted service providers.

Likely capabilities:

- connected contractors
- contractor profiles
- Discover/search
- connection requests
- invite a contractor to ServSync
- preferred contractors
- permission summaries

Relationship between Discover and Contractors:

Discover should be treated as a capability inside the broader Contractors pillar for homeowners. Homeowners are not merely browsing a marketplace; they are finding, evaluating, connecting with, and reusing trusted contractors.

Discover can have a distinct surface or tab when it needs more space, but the homeowner mental model should remain: "Contractors is where I find and manage the people who help care for my home."

### Service

Purpose:

Request service and follow active service activity.

Likely capabilities:

- Service Requests
- appointments/visits
- active Jobs visible to homeowners
- estimate review
- approvals
- invoice review
- service communication where supported
- service status and next steps

Recommendation for homeowner Estimates and Invoices:

Homeowner Estimates and Invoices should not be separate top-level destinations at first. They should appear as contextual records inside Service while active and inside Records once finalized, filed, or historically relevant.

Rationale:

Most homeowners do not wake up thinking "I need the Estimates module." They think "What is happening with my service request?" or "What records belong to my home?" Active estimates and invoices are decisions inside service. Final estimates, invoices, reports, and documents become durable records.

If future usage proves homeowners need a financial hub, it can be added as a sub-area or filtered view without forcing the first IA around document types.

### Records

Purpose:

Preserve the lasting history of the home.

Likely capabilities:

- Home History
- completed work
- final estimates
- invoices
- reports
- documents
- warranties
- photos
- contractor attribution
- room/equipment associations

Records should answer: "What happened to this home, who did it, and where is the proof?"

### Maintenance

Purpose:

Help homeowners anticipate and manage future care.

Likely capabilities:

- reminders
- recurring maintenance
- equipment schedules
- contractor recommendations based on existing relationships
- future service planning
- seasonal prompts later

Maintenance should remain grounded in the home record and trusted relationships. It should not become generic advice disconnected from the homeowner's property, equipment, service history, or contractors.

### Account

Purpose:

Manage personal settings, homes, permissions, notifications, and privacy.

Likely capabilities:

- account profile
- homes and property ownership settings
- home access / household permissions
- notification preferences
- privacy and sharing controls
- security
- support/account settings

Account should own personal and permission configuration. It should not own service work, contractor discovery, or durable home records.

## 6. Module Ownership and Boundaries

Each module should have a clear owner question, owned capabilities, referenced information, allowed outbound actions, and excluded responsibilities.

### Contractor Business

Primary question:

`How is my business doing, and what needs attention today?`

Owns:

- business dashboard
- health summaries
- attention queues
- upcoming activity summaries
- receivables summaries
- setup prompts
- high-level metrics

References:

- work counts from Work
- customer activity from Customers
- growth/setup status from Growth and Company
- invoice/payment state from Work

May link to:

- Work queues
- Customer profiles
- Company setup
- Growth/profile visibility

Does not own:

- detailed job management
- customer profile editing
- contractor discovery marketplace
- company configuration
- subscription administration

### Contractor Customers

Primary question:

`Who do I serve, what properties do they have, and what is our relationship history?`

Owns:

- connected homeowner/customer records
- local contractor-created customer records
- customer profiles
- customer/property relationship context
- relationship history views
- request/customer context where customer-centric
- customer-level notes where supported

References:

- active work from Work
- service requests and communication context
- Discover-origin connection context from Growth
- property data shared by homeowners

May link to:

- Start New Draft with prefilled customer/property context where trusted
- Work records for the customer/property
- Service Requests
- connection/permission management

Does not own:

- operational work lifecycle
- invoices as financial workflow owners
- contractor profile marketing
- subscription settings
- homeowner-owned property master data beyond permitted display or proposals

### Contractor Work

Primary question:

`What work needs my attention, and what should happen next?`

Owns:

- Draft lifecycle
- operational Job lifecycle
- Estimate creation and management
- Invoice creation and management
- Job History
- operational reports
- work-level scheduling
- work items and scope closeout
- work templates where they directly support work creation

References:

- customer/property context from Customers
- leads or requests from Growth/Customers
- business summaries displayed on Business
- company defaults from Company

May link to:

- customer profiles
- property context
- company template/settings surfaces
- Growth opportunity source

Does not own:

- contractor discovery marketplace
- company configuration
- homeowner property master data
- subscription administration
- customer acquisition strategy

### Contractor Growth

Primary question:

`How do I build new trusted relationships and future opportunities?`

Owns:

- Discover/profile visibility surfaces
- Invites & Referrals
- reputation/review strategy later
- opportunity/leads surfaces later
- marketing tools later

References:

- Company profile setup
- completed work/reviews when approved
- customer relationship outcomes where permitted

May link to:

- Company Business Profile
- customer relationship records
- Start New Draft only after an opportunity has enough trusted context

Does not own:

- operational job execution
- billing/invoices
- internal company security settings
- homeowner property records

### Contractor Company

Primary question:

`How is my company configured, who can do what, and what capabilities are enabled?`

Owns:

- Business Profile
- users and roles
- permissions
- subscriptions and entitlement settings when implemented
- integrations
- security
- company settings
- organization-level defaults

References:

- subscription state used to unlock capabilities
- setup status displayed on Business
- public profile state used by Growth

May link to:

- Business dashboard setup prompts
- Growth profile visibility
- Work template/default usage

Does not own:

- daily operational work queues
- customer relationship history
- homeowner service records
- marketplace browsing

### Homeowner Home

Primary question:

`What is the current state of my home?`

Owns:

- property overview
- room/equipment summaries
- Home Map / Assets & Systems where supported
- recent property activity summary
- current home context selection

References:

- latest service activity from Service
- records from Records
- upcoming maintenance from Maintenance
- connected contractor context from Contractors

May link to:

- request service for the selected home
- view Records for the selected home
- manage Maintenance for the selected home
- manage home access/account permissions

Does not own:

- contractor discovery as a marketplace surface
- service workflow decisions
- historical document library depth
- personal account settings

### Homeowner Contractors

Primary question:

`Who can help me care for this home, and what can they access?`

Owns:

- connected contractors
- Discover/search/profile browsing
- connection requests
- contractor invites
- preferred contractors
- contractor relationship permissions summary

References:

- service history with each contractor
- home/property sharing permissions
- active requests involving the contractor

May link to:

- start a service request with a connected contractor
- view contractor profile
- manage connection permissions
- invite a contractor

Does not own:

- active service workflow tracking
- final home records
- reminders/maintenance schedules
- contractor company settings

### Homeowner Service

Primary question:

`What service do I need, what is active, and what decision is next?`

Owns:

- Service Requests
- active service status
- homeowner-visible appointment/visit context
- estimate review in active workflows
- approval decisions
- invoice review in active workflows
- service communication where supported

References:

- home context from Home
- contractors from Contractors
- final artifacts that later file to Records

May link to:

- contractor profile
- active estimate/invoice decision
- Home Records after completion
- Maintenance follow-up after service

Does not own:

- full document/archive management
- contractor discovery browsing outside a service context
- account/privacy settings
- internal contractor Drafts

### Homeowner Records

Primary question:

`What has happened to this home, and where are the documents?`

Owns:

- Home History
- completed work records
- final estimates/invoices/reports
- documents
- warranties
- photos
- contractor attribution
- room/equipment associations

References:

- contractors involved in records
- service workflow outcomes
- maintenance/reminder follow-ups

May link to:

- create a reminder from a record
- contact or request service from a related contractor
- view related room/equipment context

Does not own:

- active service decision flow
- contractor discovery feed
- personal account settings
- contractor operational work details not shared with homeowner

### Homeowner Maintenance

Primary question:

`What care should I plan next?`

Owns:

- reminders
- maintenance plans/checklists later
- recurring maintenance later
- equipment schedules later
- future service planning

References:

- equipment from Home
- completed work from Records
- trusted contractors from Contractors

May link to:

- Start service request
- contact a connected contractor
- view records that explain the maintenance need

Does not own:

- completed record archive
- contractor marketplace browsing
- service approval/invoice decisions
- account permissions

### Homeowner Account

Primary question:

`Who am I, what homes can I manage, and what information is shared?`

Owns:

- personal profile settings
- home ownership/access settings
- household/home access roles
- notification preferences
- privacy and sharing controls
- account security
- support/account preferences

References:

- homes the user owns or can access
- connection permissions from Contractors
- notification-producing workflows

May link to:

- Home access management
- contractor permission review
- support/trust/privacy information

Does not own:

- service requests
- records archive
- contractor discovery
- operational work

## 7. Sidebar and Navigation Architecture

Sidebar organization should reflect business function, not implementation boundaries, database tables, or subscription packages.

Important decisions:

- The current `Add-Ons` grouping should be considered transitional.
- Subscription packages must not define sidebar headings.
- Locked capabilities may show an upgrade state, but they should remain in the module where the capability naturally belongs.
- Avoid excessive mobile navigation depth.
- Do not place every Work sub-area directly in the global sidebar unless usage justifies it.
- Major sidebar entries should stay stable even as submodules mature.
- In-section tabs, filters, and contextual actions should carry second-level complexity.

Example long-term contractor sidebar structure:

```text
BUSINESS
- Dashboard

CUSTOMERS
- Homeowners
- Service Requests

WORK
- Work
- Calendar

GROWTH
- Discover
- Invites & Referrals

COMPANY
- Business Profile
- Settings

HELP
- Trust & Safety
- Privacy & Data
- Support
```

Calendar appears under Work in this recommended structure because it is operational. Customer and Business surfaces may show upcoming work summaries and link to Calendar.

Example long-term homeowner sidebar or mobile navigation structure:

```text
HOME
- Home

CONTRACTORS
- Contractors
- Discover

SERVICE
- Service Requests

RECORDS
- Home History
- Documents

MAINTENANCE
- Reminders

ACCOUNT
- Account
- Privacy & Access
- Support
```

On mobile, these may collapse into fewer primary destinations, but the mental model should remain consistent. For example, Home, Contractors, Service, Records, and Account may be enough for bottom navigation, with Maintenance nested under Home or Records until usage justifies a persistent mobile item.

### Current-to-target navigation map

This table maps current navigation and product-area labels to the long-term information architecture. It is a planning bridge only; it does not rename current application navigation or require an immediate UI migration.

| Current section or destination | Current location/group | Target module | Recommended treatment | Timing | Rationale |
| --- | --- | --- | --- | --- | --- |
| Workspace | Current grouping for Dashboard and Business Profile | Split conceptually into Contractor Business and Contractor Company | Treat as transitional grouping rather than a permanent module | Migrate after broader navigation redesign | Dashboard is business-health context; Business Profile is company configuration. |
| Homeowner Work | Current grouping for Homeowners, Service Requests, and Calendar | Contractor Customers plus Contractor Work | Rename and redistribute after the Work redesign | After Work redesign is approved | Customer relationship intake belongs in Customers; operational scheduling and work lifecycle belong in Work. |
| Growth | Current functional grouping | Contractor Growth | Retain as a functional grouping | Near-term and target | Discover and Invites & Referrals already align with growth and relationship generation. |
| Add-Ons | Current transitional grouping inherited from subscription thinking | No long-term IA owner | Deprecate and replace with business-function navigation | Retire after Work and subscription navigation are separated | Subscription packaging should not define navigation. Capabilities should move to their natural module owner. |
| Help | Current utility/support grouping | Help / support utility | Retain and refine without affecting core IA | Near-term | Trust, privacy, data, and support content should stay available without competing with product modules. |
| Dashboard | Workspace | Contractor Business | Retain | Near-term | Dashboard should summarize business health and next actions. |
| Business Profile | Workspace | Contractor Company | Relocate later; allow contextual links from Business and Growth | Later navigation redesign | Business Profile is company/profile configuration, not business-health reporting. |
| Homeowners | Homeowner Work | Contractor Customers | Retain; rename only if future terminology requires it | Near-term | Homeowners/customer records are relationship and property-context management. |
| Service Requests | Homeowner Work | Contractor Customers while intake is active; Contractor Work after work begins | Retain; hand off linked Work records when planning starts | Near-term, with Work handoff refined during redesign | Requests are intake and unmet-need context until a Draft, Estimate, Job, or Invoice is created from them. |
| Calendar | Homeowner Work | Contractor Work | Relocate later; customer and request screens may still reference appointments | Later navigation redesign | Calendar is operational scheduling, while customer/request surfaces should show related appointment context. |
| Discover | Growth | Contractor Growth | Retain | Near-term | Discover is profile visibility and relationship generation. |
| Invites & Referrals | Growth | Contractor Growth | Retain | Near-term | Invites and referrals support contractor acquisition and network growth. |
| Jobs | Current Jobs workspace | Contractor Work | Evolve into the broader Work module | After Work redesign is approved | Current Jobs is the implementation-era container for estimates, invoices, jobs/reports, templates, and Draft-first work. |
| Trust & Safety | Help | Help / support-account utility | Retain | Near-term | Global trust guidance belongs in Help; user-specific access choices belong in Account/Company settings. |
| Privacy & Data | Help | Help / support-account utility | Retain | Near-term | Educational privacy/data content belongs in Help; user-specific privacy controls belong in Account or Company. |
| Support | Help | Help / support utility | Retain | Near-term | Support should remain a global help destination with contextual links from relevant modules. |

## 8. Subscription and Access Architecture

Subscription and entitlement state should control access to capabilities, not the structure of the product.

Rules:

- Do not create sidebar groups named after plans or packages.
- Do not move a capability into a different module just because it is paid.
- A locked capability should appear where the user expects it, with a clear upgrade or unavailable state.
- Free/basic users should still understand what the product does without seeing an enterprise control panel.
- Advanced contractor capabilities should be modular and optional.
- Homeowner core navigation should not be distorted by contractor subscription logic.
- Permission restrictions and subscription restrictions should be visually distinct.

Examples:

- If advanced analytics becomes paid, it belongs in Business.
- If advanced scheduling/dispatch becomes paid, it belongs in Work.
- If public profile visibility tiers are added, they belong in Growth.
- If billing/subscription management is added, it belongs in Company.

## 9. Cross-Profile Workflows

ServSync should preserve one connected lifecycle while giving homeowners and contractors different experiences.

### Connection lifecycle

Homeowner view:

- Find contractor.
- Review profile.
- Request connection.
- Choose property and sharing context.
- Manage trusted contractor relationship.

Contractor view:

- Receive connection context.
- Understand homeowner/property permission.
- Accept/manage relationship.
- Use the relationship in future work.

Owned by:

- Homeowner Contractors
- Contractor Customers
- Contractor Growth for profile/discovery visibility

### Service request lifecycle

Homeowner view:

- Describe need.
- Choose home/property.
- Choose connected contractor or route through discovery/relationship path.
- Track status and next decision.

Contractor view:

- Review request context.
- Plan response.
- Convert trusted context into Draft, Estimate, Job, or other approved workflow.

Owned by:

- Homeowner Service
- Contractor Customers for request relationship context
- Contractor Work when the request becomes planned work

Handoff rules:

A Service Request and a Draft are distinct records. The Service Request remains the customer-intake and source-context record. A Draft, Estimate, Job, or Invoice created from a Service Request becomes a separate Work-owned record, and the source Service Request should remain linked to that resulting Work record. The handoff must reuse the existing homeowner/customer and property identity, must not create duplicate homeowner/customer records, must not create duplicate property records, and must not create a duplicate operational Job when one is already linked. Customers may show summaries or links to related Work, but Contractor Work owns the lifecycle after handoff. Homeowner-facing visibility must remain role-appropriate and permission-aware.

### Draft-first contractor planning

Homeowner view:

- No visibility into internal contractor Drafts.

Contractor view:

- Start New Draft from Work or from contextual surfaces with trusted data.
- Save Draft as optional pause-and-return.
- Choose an outcome from the current composer state when implemented.

Owned by:

- Contractor Work

References:

- customer/property context from Contractor Customers
- opportunity/request context from Growth or Customers

Guardrail:

Drafts must not create homeowner visibility, estimates, jobs, invoices, appointments, notifications, or billing activity until the contractor chooses an explicit outcome.

### Estimate lifecycle

Homeowner view:

- Review customer-facing proposal in the active service context.
- Approve or decline.
- Later find final proposal context in Records where appropriate.

Contractor view:

- Create/manage/send estimate from Work.
- Track approval status and next work action.

Owned by:

- Contractor Work
- Homeowner Service while active
- Homeowner Records after completion/filing where appropriate

### Job/work lifecycle

Homeowner view:

- See homeowner-visible active service status and final records.

Contractor view:

- Execute operational job, manage scope, document work, schedule visits, close out work, and prepare billing.

Owned by:

- Contractor Work
- Homeowner Service for active shared status
- Homeowner Records for durable outcomes

### Invoice lifecycle

Homeowner view:

- Review active invoice in Service.
- Find filed/final invoice records in Records.

Contractor view:

- Draft, send, void, mark paid, or manage invoice states where permissions allow.

Owned by:

- Contractor Work
- Homeowner Service while active
- Homeowner Records after filing/history

### Home History and maintenance lifecycle

Homeowner view:

- Preserve completed service context.
- Create reminders and plan future care.

Contractor view:

- Reference permitted history when connected and authorized.
- Use prior work context to start future Drafts where appropriate.

Owned by:

- Homeowner Records
- Homeowner Maintenance
- Contractor Customers and Work only where permissions and workflow context allow

## 10. Draft-First Work Placement

Draft-first Work belongs in Contractor Work.

The Work module should become the contractor's operational center for:

- Drafts
- Estimates
- Jobs
- Invoices
- Reports
- scheduling and visits
- work templates
- operational history

The Draft-first redesign should not be treated as a global navigation redesign by itself. It should first be specified as a Work Module Product Specification that answers:

- What is the Work landing page?
- What belongs in Drafts?
- What belongs in Active Work?
- How do Estimates, Jobs, Invoices, and Reports relate inside Work?
- What are the supported Draft outcomes?
- What is the legacy fallback until direct operational job creation can be retired?
- Which contextual surfaces may offer Start New Draft?
- Which surfaces should not offer Draft actions?
- How do mobile Work surfaces avoid becoming too deep or dense?

Current production state:

- Production serves the legacy Jobs workflow because all three Draft/Work gates are absent/off.
- The corrected canonical durable Draft backend is installed and verified; Production durable Draft tables remain empty and no authenticated Production durable workflow has run.
- Create Estimate and Create Job from durable Draft exist in gated code, including canonical consumption and guarded same-session output navigation. Direct Draft-to-Invoice remains unimplemented.
- Default-deny contractor cohort gating is implemented in draft PR #322. In Sandbox, the cohort SQL is installed and the staged role/runtime matrix passed: one test contractor was temporarily enrolled and restored to false, all entitlement rows are currently false, runtime-created Draft/Estimate records were cleaned, temporary branch variables were removed, and the final Preview is gates-off. In Production, the cohort column and RPC remain absent, no contractor is enrolled, the Draft/Work gates remain off, and no authenticated durable Draft runtime validation has occurred. PR mark-ready/merge, Production SQL, enrollment, gates, and smoke remain separately unauthorized. An uninterrupted active tab has no guaranteed autonomous entitlement-revocation maximum, so supervised rollback requires reload and broader-beta revocation semantics remain a separate decision.

## 11. Expansion Rules

Future capabilities should be placed according to ownership, not novelty.

Rules:

- If the feature helps a contractor understand business health, place it in Business.
- If it manages customer/property relationships, place it in Customers.
- If it turns scope into estimates/jobs/invoices/reports, place it in Work.
- If it helps win new relationships, place it in Growth.
- If it configures the organization, place it in Company.
- If it helps a homeowner understand the current property, place it in Home.
- If it helps a homeowner find/manage contractors, place it in Contractors.
- If it helps a homeowner request/follow active service, place it in Service.
- If it preserves completed history, place it in Records.
- If it plans future care, place it in Maintenance.
- If it manages personal settings, homes, permissions, notifications, or privacy, place it in Account.

Before adding a new sidebar item, ask:

- Is this a new major user goal or a sub-area of an existing module?
- Does the user need it often enough for global navigation?
- Would placing it in global navigation duplicate an existing path?
- Is this actually a subscription tier, setting, or implementation detail?
- Can this be introduced as an in-section tab, filter, card, or contextual action first?

Before adding a new creation action, ask:

- Can this workflow begin from a Draft?
- Is there trusted context available to prefill it?
- Would this action create side effects before the user chooses an outcome?
- Is this action role-appropriate?
- Will it duplicate another creation path?

### Future capability ownership map

This table is directional and non-binding planning guidance. It does not add these capabilities to the current roadmap, does not expand the initial Draft-first Work redesign, and does not approve final pricing or packaging. Later module specifications may refine ownership.

| Capability | Likely canonical owner | Referenced modules | Capability type | Likely entitlement posture | Initial-scope status | Rationale |
| --- | --- | --- | --- | --- | --- | --- |
| Dispatching | Contractor Work | Company/team, Customers, Calendar/scheduling | Advanced internal Work capability | Optional/advanced | Excluded | Dispatching is operational coordination for larger teams and unnecessary for many solo contractors. |
| Crew management | Contractor Company | Work, scheduling, roles/permissions | Company administration | Optional/team-based | Excluded | Crew setup belongs with users, roles, and company permissions, while daily assignments may appear in Work. |
| Time tracking | Contractor Work | Company/team, accounting/payroll integrations | Internal Work capability | Optional | Excluded | Time entries are operational work records and may later feed payroll/accounting integrations. |
| Inventory | Provisional Contractor Company or future advanced Operations module | Work, estimating, purchase orders | Advanced operational capability | Optional/advanced | Excluded | Inventory may justify its own advanced module later and should not burden small contractors early. |
| Purchase orders | Contractor Work for job-linked purchasing | Company, inventory, accounting integrations | Internal Work capability initially | Optional/advanced | Excluded | Job-linked purchasing supports work fulfillment; broader procurement may later become advanced operations. |
| Expenses | Contractor Business | Work for job-linked expenses, accounting integrations | Business-financial capability | Optional | Excluded | Expenses support business understanding, but ServSync should not become a full accounting system. |
| Service agreements | Contractor Work | Customers, homeowner Maintenance, billing | Recurring Work capability | Optional | Excluded | Agreements are recurring service commitments that should connect relationship context, future maintenance, and billing without becoming a separate core nav model. |
| AI assistant | Cross-module contextual capability | Whichever module contains the active workflow | Contextual tool, not necessarily a global module | Potentially tiered or usage-controlled | Excluded from this IA implementation | AI should assist inside workflows rather than create another navigation destination. |
| Accounting integrations | Contractor Company | Contractor Business and Work billing | Integration | Optional | Excluded | Provider setup belongs in Company; business summaries and billing actions may reference integration status. |
| Payment integrations | Contractor Company for configuration | Work, Invoices, homeowner payment surfaces | Integration | Optional | Excluded | Payment setup belongs in Company, invoice/payment actions belong in Work, and ServSync does not become the payment processor. |
| Reviews | Contractor Growth | Completed Work, Connections, contractor profile | Growth/reputation capability | Likely broadly available; packaging undecided | Excluded | Reviews support trust and reputation but should remain tied to eligible completed service context. |
| Lead management | Contractor Growth | Customers and Work after qualification/acceptance | Growth pipeline capability | Optional | Excluded | Leads are growth opportunities until they become customer relationships or planned Work. |
| Multiple-property homeowner support | Homeowner Home | Account, Records, Service, Maintenance, Contractors | Homeowner property-management capability | Homeowner packaging undecided | Future | Each property should keep its own records and relationships while Account owns access/ownership settings. |

## 12. Terminology Rules

User-facing terminology should match the user's mental model.

Contractor terminology:

- Use `Work` for the broad operational domain.
- Use `Drafts` for neutral internal planning records.
- Use `Jobs` only after work is operational.
- Use `Estimates` for customer-facing proposals.
- Use `Invoices` for customer-facing billing records.
- Use `Customers` for homeowner/local customer relationships.
- Avoid exposing `inspection` language when the contractor is doing ordinary service work.

Homeowner terminology:

- Use `Home` for current property overview.
- Use `Contractors` for trusted providers, Discover, and relationship management.
- Use `Service` for active requests, visits, decisions, estimates, and invoices.
- Use `Records` for completed history, documents, reports, invoices, and warranties.
- Use `Maintenance` for reminders and future care.
- Use `Account` for personal settings, home access, privacy, and notifications.

Different profiles may see different labels for the same underlying object when that improves clarity. For example, a contractor may manage a Job while a homeowner sees active service.

## 13. Current-State Guardrails

This document defines direction. It does not ship behavior.

Current guardrails:

- Do not imply Production has the Draft-first Work redesign.
- Do not imply Production exposes Create Estimate or Create Job from Draft while the gates and tenant entitlement remain off; direct Draft-to-Invoice is not implemented.
- Do not imply the legacy Jobs workflow has been removed.
- Do not imply subscription plans are live enforcement unless separately verified.
- Do not imply advanced dispatch, routing, native mobile apps, payment collection, accounting sync, or automated reminders are live.
- Do not move or rename application navigation based solely on this document.
- Do not add SQL, RLS, RPC, storage, environment, production, or permission changes without separate approval.

## 14. Relationship to Future Specifications

This Product Information Architecture should be used to frame future module specifications.

Recommended next module specifications:

- Contractor Work Module Product Specification
- Homeowner Service Module Product Specification
- Homeowner Records and Maintenance Product Specification
- Contractor Customers Module Product Specification
- Contractor Growth Module Product Specification

Each module specification should define:

- module goal
- primary user question
- navigation structure
- owned workflows
- referenced data
- role/permission boundaries
- mobile behavior
- empty/loading/error states
- metrics for beta validation
- out-of-scope items

Module specifications should not contradict the Product Vision & Philosophy or this Information Architecture without an explicit product decision.
