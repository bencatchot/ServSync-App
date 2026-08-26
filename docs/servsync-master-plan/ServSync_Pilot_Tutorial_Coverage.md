# ServSync Pilot Tutorial Coverage

Status date: 2026-08-26

Roadmap slice: FB-040A Tutorial Readiness

## Purpose

The controlled pilot needs a small, stable set of walkthroughs for the workflows a contractor or homeowner must complete to reach value. This is not a goal to record every screen or button. The protected set follows the canonical request-to-record lifecycle, appears where the user needs it, and uses the existing Help Studio review and replacement-revision process.

Production currently contains one published video tutorial: **How to create an estimate**, revision 3. The table below records that tutorial and the five missing pilot walkthroughs. A missing tutorial is not represented as available in the product until an approved revision is published.

## Protected pilot set

| ID | Walkthrough | Pilot role | Workflow boundary | Contextual placement | Recorder scenario | Current state |
| --- | --- | --- | --- | --- | --- | --- |
| TUT-001 | How to handle a homeowner service request | Contractor Owner, Admin, Office | Open the incoming request, review the original message/customer/home, and start the Estimate from the Request so lineage stays attached. | `contractor.service_requests` | `contractor-service-request-intake` | Recorder and contextual source candidate; not published |
| TUT-002 | How to create an estimate | Contractor Owner, Admin, Office | Build and save a customer Estimate from a ready Request. | `contractor.drafts` | `contractor-create-estimate` | Published in Production, revision 3 |
| TUT-003 | How to complete work and save the service record | Contractor Owner, Admin, Office, Field Technician | Move an accepted Estimate into a Job, record the visit, complete the work, and finalize the report. | `contractor.work` | `contractor-complete-work` | Planned; not published |
| TUT-004 | How to deliver an invoice and record an outside payment | Contractor Owner, Admin, Office | Create/deliver the Invoice, explain that payment collection is outside ServSync, and record a payment received elsewhere. | `contractor.financials` | `contractor-invoice-outside-payment` | Planned; not published |
| TUT-005 | How to connect and request service | Homeowner | Connect with a contractor, choose the home, and submit a request with useful work details. | `homeowner.service` | `homeowner-connect-service-request` | Planned; not published |
| TUT-006 | How to review work and keep Home History | Homeowner | Review an Estimate and Invoice, then find the completed report and durable record in Home History. | `homeowner.records` | `homeowner-review-home-history` | Planned; not published |

## Recording order

1. TUT-001 — contractor Request intake and context-preserving Estimate handoff.
2. TUT-003 — accepted Estimate through Job completion and finalized report.
3. TUT-004 — Invoice delivery and truthful outside-payment recording.
4. TUT-005 — homeowner connection and service Request submission.
5. TUT-006 — homeowner Estimate/Invoice review and Home History retrieval.

TUT-002 is already current and remains protected by Tutorial Freshness checks. This order gives the pilot team the contractor's front-office intake path first, then fills the rest of the end-to-end lifecycle without duplicating the existing Estimate lesson.

## Publication and verification gates

Every protected walkthrough must meet all of these gates:

- Record only against the dedicated Demo environment with a registry-owned, resettable fixture.
- Use the shared human-paced recorder profile at the canonical desktop viewport; verify the contextual entry on desktop and `390x844` mobile.
- Show fictional data only, scan visible text for credentials or tokens, and fail on browser errors or `5xx` responses.
- End at the declared checkpoint and preserve exact Request, Customer, home, Estimate, Job, Invoice, payment, report, and Home History lineage where the tutorial crosses those records.
- Package through Help Studio, review the complete video at `1x`, and return or replace it when the visible app no longer matches.
- Production publication requires explicit owner approval. Recorder readiness, a validated Demo package, or a merged contextual placement does not publish media.
- After publication, verify role-aware contextual retrieval, complete playback, current labels/navigation, and denial outside the intended audience.

## Feature-change freshness rule

Any user-facing change touching one of the six workflow boundaries must declare Tutorial Freshness impact and search the matching Help context. A changed path, label, role, ordering, visible outcome, or boundary is `UPDATE REQUIRED` unless the current walkthrough still matches in a full playback comparison. A stale walkthrough remains an open completion item until a replacement revision is reviewed, explicitly published, and verified.

Support and pilot evidence can add a walkthrough only when repeated confusion or abandonment shows that contextual guidance will reduce assistance. New tutorials must not become a substitute for correcting a fundamentally unclear workflow.
