# TUT-002 replacement brief — September 8, 2026

Status: Prepared for review; no Production Help record or media changed.

The published revision 3 of **How to create an estimate** shows the service-request-to-estimate workflow. Its written steps incorrectly direct the user to open Drafts, choose Estimate, and select the customer/home. The video instead starts in Service Requests, uses Create Estimate, and carries the customer and home into the estimate. This mismatch predates PR #571. The video is also a legacy silent package, already listed for the FB-040A narration/caption upgrade.

## Replacement copy

Title: How to create an estimate

Summary: Start from a homeowner service request, add the agreed scope and pricing, and save an estimate draft with the customer and home attached.

Steps:

1. Open Service Requests and review the homeowner's request, customer, and home.
2. Select Create Estimate on that request, then choose Build blank estimate.
3. Confirm the customer and home carried over. Add an estimate title, scope of work, and line items with quantities and prices.
4. Review the line items and total, then select Save estimate draft.
5. Confirm the saved estimate shows Draft. Saving keeps it private; sending it to the homeowner is a separate action.

Existing-record note: If the request already has an estimate draft, its action may read Open Estimate. Open the existing draft to continue rather than create a duplicate. The recording should start from a clean, approved request-ready Demo fixture and show the exact Create Estimate label.

## Draft narration for the replacement

Start in Service Requests and review the homeowner's message, customer, and home. Select Create Estimate on the request to keep those details attached. Choose Build blank estimate, then add a clear title and scope of work. Add the work as line items, with quantities and prices. Review the total before selecting Save estimate draft. The saved estimate stays linked to the customer and home. Its Draft status means it has not been sent to the homeowner. Sending the estimate for review is a separate step.

## Recording and acceptance scope

- Owner: Codex prepares the bounded replacement; Ben approves Production Help changes.
- Audience: retain the existing authorized contractor Owner/Admin/Office audience; do not widen roles or visibility.
- Use the existing governed `contractor-create-estimate` recorder scenario and approved Demo identities. Do not reset unrelated or unregistered Demo records.
- Revalidate the existing 45.12-second visual source against the reviewed Demo build, or record a replacement source when that comparison requires it. Do not change the currently published immutable revision while preparing the replacement.
- Apply the current `narrated_captioned_v1` standard: Cedar narration, synchronized compact English cues, transcript, disclosure, media checksums, and normal-speed plus sound-off review. Narration timing must follow the actual recorded actions, especially the Save estimate draft action and final Draft state.
- No narration has been generated for this brief. A provider request, credential/configuration change, new Production recording request, upload, approval, and publication are not authorized by this local document.
- Verify the new published revision through its existing contextual Help placement. Review route-context metadata against the actual estimate entry points without silently expanding Help availability.

The current SQL publication gate (`servsync-help-narration-caption-foundation.sql`, `servsync_transition_help_walkthrough`) rejects new publication of a protected tutorial without `narrated_captioned_v1` and passed caption/sound-off reviews. A text-only republication of this silent legacy revision is therefore not a valid completion path. Keep the existing lesson available until the approved replacement is ready.

## Release relationship

PR #571's application corrections are independently validated. If Ben approves merging before this replacement is published, record the temporary tutorial gap explicitly and keep this follow-up open. Do not mark the overall correction task complete until the required replacement is published and verified, as required by the repository Tutorial Freshness Gate.
