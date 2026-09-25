# TUT-002 replacement brief — September 8, 2026

Status: September 25 — UPDATED. The approved Draft-first, Cedar-narrated replacement is published and verified as Production revision 4. Earlier sections below preserve the investigation and proposal history.

## Corrected finding

The published revision 3 of **How to create an estimate** has valid Draft-first written guidance: open Drafts, start a draft, choose Estimate, select the customer/home, add the work, then create the estimate. The earlier conclusion that these steps were obsolete was wrong. The initial native bundle omitted the three current Work build switches and showed the legacy fallback; the same Demo contractor is eligible for the current workflow on hosted Demo.

The 45.12-second legacy silent video demonstrates a different entry path: Service Requests → Create Estimate → Build blank estimate → Save estimate draft. It does not demonstrate the current Drafts instructions or their `contractor.drafts` Help context. Replace the video and narration with the current Draft-first flow; do not rewrite valid steps around the legacy recording. This replaces the earlier service-request-focused proposal in this brief.

September 9 read-only verification used the same approved Demo contractor on hosted Demo and the corrected Android app. Work shows At a Glance and Start New Draft; Work → Drafts also offers Start New Draft. The composer offers an Estimate intended output, customer/property, work/pricing, Save Draft and Create Estimate. No Draft or Estimate was saved or created in this comparison. The corrected iPhone Work dashboard rendered, but composer activation remains limited by CUA pointer errors.

## Proposed replacement copy

Title: How to create an estimate

Summary: Start a contractor Draft, describe the customer work and pricing, then choose Estimate as the next step and create a draft Estimate for review.

Steps:

1. Open Work and select Start New Draft. The Drafts list also provides this action.
2. In Customer & work, select the customer and property, fill What needs doing?, and describe the scope. Expand Private notes only for company-only planning.
3. In Scope & pricing, keep Standard work scope and fill the first work line, which is already open. Use Add work line for additional items. Check each visible Type, quantity, unit, and unit price.
4. In Next step, choose Estimate under What are you preparing? If hourly pricing is needed, select Adjust labor settings, choose the labor model, and enter the rate and hours. Review the total and any missing-price warnings.
5. Select Save Draft to continue planning later. When ready, select Create Estimate in the action bar and review the existing confirmation before confirming creation.
6. Confirm the resulting Estimate and its Draft status before using any separate sending action.

The final creation and saved-state steps must be verified in the approved recording fixture; this read-only pass verified the controls and existing workflow implementation without producing a record.

## Draft narration

Open Work and select Start New Draft. In Customer and work, choose the customer and property. Enter what needs doing and describe the scope. Private notes are optional and stay within your company. In Scope and pricing, fill the first work line, which is already open. Add more lines as needed, checking their type, quantity, unit, and price. Under Next step, choose Estimate. For hourly pricing, open Adjust labor settings and enter the rate and hours. Check the total and any missing prices. Save Draft lets you continue later. When ready, select Create Estimate and review the confirmation. Confirm that the resulting estimate has Draft status. Sending it to the customer is a separate action.

September 25 initial Preview alignment: Start New Draft is now the primary action beside At a Glance, the undecided choice reads Choose later, the private Draft message states that nothing is sent, and return actions read Back to Work. Record the replacement against the reviewed build once available in the governed Demo recording environment; do not splice old footage around these changes. The existing 45.12-second Production revision 3 was previewed again and still follows Service Requests rather than the written Draft-first route.

September 25 follow-up alignment, application commit `5661595`: the completed and tested Preview now orders Customer & work → Scope & pricing → Next step. The action bar remains visible while scrolling, the title label is What needs doing?, item Type is visible, and private notes/labor settings are disclosures. The revised steps and narration above supersede the earlier choice-first proposal. The post-implementation Help Studio check reopened published revision 3, compared its written steps and paused Service Requests entry frame, and retained UPDATE REQUIRED. No new playback, recording request, provider generation, upload, or publication occurred.

September 25 starter-line follow-up, application commit `1f69a8d`: standard Drafts now show one editable line immediately. An untouched starter is not saved and does not trigger price warnings or an unsaved-change prompt. Templates and Price Book selections replace the empty presentation row. After Preview verification, Help Studio searches for Draft and contractor.drafts matched TUT-002; Work items, Add work line, and Scope & pricing returned none. Its published revision 3 was opened paused and compared again; UPDATE REQUIRED remains. No playback or Production Help mutation occurred.

## Recording and acceptance scope

- Owner: Codex prepares the bounded replacement; Ben approves Production Help changes.
- Preserve the existing authorized contractor Owner/Admin/Office audience and `contractor.drafts` placement. Do not widen roles or visibility.
- Use the approved Demo identities and a governed, isolated recording fixture. Revalidate/adapt the `contractor-create-estimate` recorder scenario to the current ordinary Draft-first UI. Do not use recorder presentation mode to force the legacy fallback or reuse its old video as proof of the current route. Do not reset unrelated or unregistered records.
- Follow `narrated_captioned_v1`: Cedar narration, synchronized compact English captions, transcript, disclosure, media checksums, and normal-speed plus sound-off review. Narration must match actual Save Draft/Create Estimate actions and the resulting state.
- No narration has been generated for this revised brief. Provider generation, new Production recording requests, upload and publication remain unapproved. This document grants no such authority.
- Verify the approved replacement through the existing contextual Help placement, and retain the current immutable published revision until replacement is ready.

The protected publication function requires `narrated_captioned_v1` and passed caption/sound-off reviews. A text-only republication of the silent legacy revision does not satisfy the gate. Tutorial impact remains UPDATE REQUIRED because the media and steps demonstrate different flows and the media needs its narration/caption upgrade. Do not report the overall task complete until the approved replacement is published and verified.

September 25 recorder-support follow-up: the approved private Demo extension is installed with exact Draft/output ownership and inbound-dependency rejection. Installation changed no existing data. The ordinary Draft-first recorder is prepared but blocks before fixture writes because the automatically created private Estimate actor-audit row was omitted from the original five-table ownership proposal. [Recorder support evidence and the bounded additional approval](../qa/TUT_002_DEMO_RECORDER_SUPPORT_2026-09-25.md) document the remaining dependency. No new recording, narration, Help record, upload, or publication occurred; UPDATE REQUIRED remains.

September 25 audit amendment and recording: the owner approved the additional exact-key audit cleanup. It is installed and verified without product-data or grant changes. The 62.44-second ordinary Draft-first recording succeeded, and all six temporary records were removed. The owner subsequently approved a dedicated speech-only OpenAI key with a one-day expiration. One Cedar request produced the narration; local synchronization and 14 compact captions are complete, with 4.29 seconds of final quiet review. The retimer now preserves consistent volume across scenes, covered by an actual audio-signal regression. The credential was discarded from the local generation process. The paused local preview is ready for owner sound-on review. Its UUID remains local-only; no Production Help request, upload, publication, or merge occurred. UPDATE REQUIRED remains until the approved narrated replacement is published and verified. See the updated recorder-support evidence.

September 25 publication: the owner approved the finished preview and publication. Help Studio published request `d046ddc2-a1a5-4fd5-ab42-30325fa68f3d` as revision 4 of the existing TUT-002 walkthrough. Full hosted playback and dedicated Owner contextual retrieval verified the exact reviewed video, 14 captions, transcript, and disclosure. Revisions 1–3 and the other tutorials remain unchanged. No new narration request or merge occurred. See [publication evidence](../qa/TUT_002_DEMO_RECORDER_SUPPORT_2026-09-25.md).
