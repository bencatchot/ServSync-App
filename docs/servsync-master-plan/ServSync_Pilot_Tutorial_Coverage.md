# ServSync Pilot Tutorial Coverage

Status date: 2026-08-27

Roadmap slice: FB-040A Tutorial Readiness

## Purpose

The controlled pilot needs a small, stable set of walkthroughs for the workflows a contractor or homeowner must complete to reach value. This is not a goal to record every screen or button. The protected set follows the canonical request-to-record lifecycle, appears where the user needs it, and uses the existing Help Studio review and replacement-revision process.

Production currently contains one published video tutorial: **How to create an estimate**, revision 3. It remains available because its visible workflow is current, but it predates the narration/caption standard and must receive a compliant replacement before FB-040A is complete. The table below records that tutorial and the five missing pilot walkthroughs. A missing tutorial is not represented as available in the product until an approved revision is published.

## Protected pilot set

| ID | Walkthrough | Pilot role | Workflow boundary | Contextual placement | Recorder scenario | Current state |
| --- | --- | --- | --- | --- | --- | --- |
| TUT-001 | How to handle a homeowner service request | Contractor Owner, Admin, Office | Open the incoming request, review the original message/customer/home, and start the Estimate from the Request so lineage stays attached. | `contractor.service_requests` | `contractor-service-request-intake` | Narrated/captioned 17.134-second Cedar replacement is validated and Ready for review in Production job `2d989ced-6afd-4976-9977-2af4b4aede3c`; owner approve/return decision, separate publication approval, and contextual verification remain |
| TUT-002 | How to create an estimate | Contractor Owner, Admin, Office | Build and save a customer Estimate from a ready Request. | `contractor.drafts` | `contractor-create-estimate` | Published in Production, revision 3; visually current, narration/caption upgrade required before FB-040A completion |
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

TUT-002 is visually current and remains protected by Tutorial Freshness checks, but its standards upgrade is part of FB-040A. This order gives the pilot team the contractor's front-office intake path first, then fills the rest of the end-to-end lifecycle without discarding the existing Estimate lesson before its replacement is ready.

## Voiceover, captions, and transcript standard

Every protected pilot tutorial must ship as one synchronized learning package:

- Voiceover explains the purpose, user decision, and result without merely reading every label on screen.
- Timed captions/subtitles match the spoken narration and remain usable with sound off. Burned-in recorder scene callouts are helpful orientation overlays but do not satisfy the caption requirement.
- A durable transcript matches the approved narration and remains searchable through Help.
- The standard tutorial voice is OpenAI `gpt-4o-mini-tts` with the Cedar voice, reusing ServSync's established Marketing narration direction and exact disclosure: **AI-generated voiceover using OpenAI's Cedar voice.** Preserve provider, voice, model/version, script, and disclosure provenance, and show the disclosure during playback.
- Normal-speed review must check the full picture, narration, caption timing/text, transcript, and disclosure together. A silent master may be retained as source evidence, but it cannot satisfy protected-tutorial publication readiness.

The owner approved bounded Cedar narration preparation and the PR #522 source foundation for the protected Help package. The contract stores checksum-bound WebVTT, transcript and provenance on the immutable revision, exposes them through role-aware playback, and blocks future protected publication without caption and sound-off review. Its exact migration is applied and verified in Sandbox, Demo, and Production. The approval does not authorize runtime generation, a different provider/voice, secret or environment changes, approval of an existing recording, or Production publication.

## Publication and verification gates

Every protected walkthrough must meet all of these gates:

- Record only against the dedicated Demo environment with a registry-owned, resettable fixture.
- Use the shared human-paced recorder profile at the canonical desktop viewport; verify the contextual entry on desktop and `390x844` mobile.
- Show fictional data only, scan visible text for credentials or tokens, and fail on browser errors or `5xx` responses.
- End at the declared checkpoint and preserve exact Request, Customer, home, Estimate, Job, Invoice, payment, report, and Home History lineage where the tutorial crosses those records.
- Package synchronized voiceover, timed captions, transcript, and required narration provenance through Help Studio; verify Help playback exposes captions and the transcript remains searchable.
- Review the complete video at `1x` with sound on and captions enabled, then confirm the same tutorial remains understandable with sound off. Return or replace it when the visible app, spoken instructions, captions, or transcript no longer match.
- Production publication requires explicit owner approval. Recorder readiness, a validated Demo package, or a merged contextual placement does not publish media.
- After publication, verify role-aware contextual retrieval, complete playback, current labels/navigation, and denial outside the intended audience.

## Feature-change freshness rule

Any user-facing change touching one of the six workflow boundaries must declare Tutorial Freshness impact and search the matching Help context. A changed path, label, role, ordering, visible outcome, or boundary is `UPDATE REQUIRED` unless the current walkthrough still matches in a full playback comparison. A stale walkthrough remains an open completion item until a replacement revision is reviewed, explicitly published, and verified.

Support and pilot evidence can add a walkthrough only when repeated confusion or abandonment shows that contextual guidance will reduce assistance. New tutorials must not become a substitute for correcting a fundamentally unclear workflow.
