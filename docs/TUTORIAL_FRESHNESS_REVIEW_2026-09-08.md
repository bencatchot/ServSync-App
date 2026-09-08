# PR #571 tutorial freshness review — September 8, 2026

Help Studio access was restored after the Mac was unlocked. The existing Production administrator session displayed five published walkthroughs and zero unpublished walkthroughs. All five published videos were opened in Preview, played to their reported end at normal speed, and their sampled workflow scenes, written steps, and available transcripts were compared with the current Demo and PR #571's changes. No Production content was saved or published.

## Search evidence

The Studio search was exercised with `estimate`, `invoice`, `Calendar`, `navigation`, `Home Access`, `PDF`, `contractor.financials`, `contractor.drafts`, `request`, `Work`, `Marketing`, `free`, `beta`, `Jobs`, `Notifications`, and `scheduling`.

- Estimate matched TUT-001, TUT-002, and TUT-003.
- Invoice and contractor.financials matched TUT-004.
- Contractor.drafts matched TUT-002.
- Request matched TUT-001 and TUT-005; Work matched TUT-002, TUT-003, and TUT-005.
- The other listed terms returned no published walkthrough matches. Recording-request entries are a separate, unfiltered section and were not counted as published search results.

## Playback comparison

| Tutorial | Published revision / duration | Result |
| --- | --- | --- |
| TUT-001: How to handle a homeowner service request | 1 / 15.640666 seconds | Reaches the request-linked Start your estimate choices. Create Estimate wording, customer/home context, and no-save outcome remain accurate. Desktop presentation is preserved by the PR. |
| TUT-002: How to create an estimate | 3 / 45.12 seconds | Video starts from Service Requests, opens Create Estimate, builds the estimate, and ends at a saved Draft with a $1,895 total. Its written steps instead say to open Drafts and choose Estimate/customer/home. This is a confirmed pre-existing written-guidance mismatch. The legacy video has no transcript/narration metadata. It needs the already-planned narrated/captioned replacement with corrected steps. |
| TUT-003: How to complete work and save the service record | 1 / 57.32 seconds | Accepted Estimate → Job → completion notes/work → completed visit/Job → Finalize Report → Filed to Documents remains accurate. The PR does not alter the shown operational lifecycle. |
| TUT-004: How to deliver an invoice and record an outside payment | 1 / 57.96 seconds | Completed Job → Invoice → send → homeowner review → outside payment → Partially Paid, $400 paid and $1,765 due remains accurate. The shown Open count is for a sent/partially paid invoice. No use of the old PDF popup preview was observed in the demonstrated flow, and PDF action labels remain present. |
| TUT-005: How to connect and request service | 1 / 119.2 seconds | Connection request and acceptance, home/issue/contractor/review steps, and final submitted request Waiting on contractor remain accurate. The PR's Home Access stale-response guard does not change this workflow or its sharing assumptions. |

The Demo comparison used the approved fictional contractor account at 1440×900. Its current Service Requests screen shows the linked existing estimate as Open Estimate; opening it retains Sarah Johnson, Demo Bay Home, the scope/line items, and the saved draft total. The same desktop Work/estimate structure appears in the recordings. The draft was not edited or saved, and the workspace was returned to Work overview. The temporary viewport override was reset.

Production TUT-002 Edit was opened read-only to inspect its exact steps, audience, source version, and missing narration fields, then canceled. Its editor heading previews the next revision number; no revision 4 was created. Existing Owner/Admin/Office audience and contractor.drafts context remain unchanged.

## Decision and bounded follow-up

Tutorial impact: UPDATE REQUIRED
Tutorial evidence: Completed the 16-term Help Studio search and Preview playback comparison of all five published walkthroughs. Only TUT-002 has a confirmed written-guidance mismatch: its steps say Drafts while its video and the supported linked workflow begin in Service Requests. This mismatch and its missing narration standard predate PR #571; the other four walkthroughs remain applicable.
Affected tutorials: TUT-002 How to create an estimate, published revision 3.
Tutorial follow-up: Codex owns the corrected steps, narration draft, and bounded replacement in `tutorials/TUT-002_REPLACEMENT_BRIEF_2026-09-08.md`. Preserve published revision 3 until an approved narrated/captioned replacement passes review, is published with Ben's explicit approval, and is verified through contextual Help. If Ben approves PR #571's merge before replacement, explicitly retain this temporary tutorial gap as open; do not declare the overall correction task complete.

The current protected-tutorial publication function requires narrated_captioned_v1 plus passed caption/sound-off reviews. A text-only republication of the silent legacy lesson would not satisfy that gate. No weakening of this rule is proposed.

Screenshots, the exact search result list, and read-only metadata evidence are retained locally under `ServSync Audits/2026-09-08`. Application tests and hosted Preview results from application commit d29a57f remain unchanged; this follow-up changes documentation only.
