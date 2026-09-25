# TUT-002 Demo recorder support — September 25, 2026

## Current result

**UPDATED — TUT-002 “How to create an estimate” is published and verified as Production revision 4.** The owner approved the finished narrated preview and its Production publication, then unlocked the existing administrator session. The normal Help Studio replacement flow created request `d046ddc2-a1a5-4fd5-ab42-30325fa68f3d`, attached the exact reviewed package, approved its media reviews, and published revision 4 on walkthrough `9f62de0c-a06a-4840-86cb-6bf0362975f5`.

The 62.44-second, 1440×900 recording demonstrates Work → Start New Draft, the already-open first line, Save Draft, Create Estimate confirmation, and an unsent $1,895 Estimate. One Cedar request supplies narration, with 14 sentence-aligned English captions (maximum 11 words each), a matching transcript/disclosure, consistent speech volume, and a 4.29-second final quiet hold. All six temporary Demo product records were removed.

Full muted local playback and full normal-speed hosted playback completed. The published Help Preview loads the replacement steps, media, and Cedar disclosure. An existing dedicated Production contractor-owner account retrieved exactly one revision-4 result at `contractor.drafts`; its protected caption/transcript hashes match the approved package, and the published video returned HTTP 200 with the exact approved MP4 SHA-256. The initial API check omitted contractor context and was correctly denied; the retry used the signed-in owner's own contractor context.

Read-only before/after snapshots confirm all seven existing immutable revision rows and the other four walkthroughs stayed unchanged. The new immutable audience is exactly Owner/Admin/Office. Pacing, sensitive-data, canonical-output, caption, sound-off, and overall validation states are all passed. No schema, permission, user-profile, production business-record, or environment change, manual deployment, or merge occurred during publication.

## Initial installation and boundaries

The owner approved the bounded Demo-only recorder extension in the local September 25 replacement review. The reviewed SQL was applied once to Demo `bdytwgejqnlblhrnqxkp`. Only `servsync_demo_reset_order(text,text)` and `servsync_demo_reset_registered_run(uuid)` changed. Their existing ownership, grants, security mode, and search paths were preserved. No Production or Sandbox mutation, merge, Help creation, upload, narration generation, or publication occurred.

The local recorder now has a separate ordinary Work → Start New Draft path, with the first line already open, customer/property selection, exact $1,895 pricing, Save Draft, Create Estimate confirmation, and final unsent Estimate verification. It uses isolated `draft_first_estimate` receipts, never resets `water_heater_core_loop`, and does not register shared identities/properties for deletion. This path is **not yet recorded or validated end to end against live writes**: its preflight intentionally stops before fixture creation for the audit dependency below.

## Validation evidence

- 140 isolated browser tests passed for the finished Draft composer, Save/launch confirmation, concurrency, and recovery behavior.
- 16 backend-parity tests passed.
- 89 recorder and Help-package tests passed, including new saved/consumed Draft receipt, identity, scope, total, output, and child ownership checks.
- Disposable PostgreSQL validation passed: exact consumed and saved-only cleanup; extra Draft item/launch/Estimate item rejection; cross-run ownership refusal; wrong scenario, target, role, customer, contractor, output, and snapshot rejection; SET NULL/CASCADE dependency rejection; private browser-role denial; unchanged existing reset priorities; unrelated Estimate preservation; atomic failure; guarded reapplication refusal.
- The actual ordinary Demo interface was opened read-only. Work, Start New Draft, the Sarah Johnson customer option, Demo Bay Home, starter line, and current labels were confirmed. No Save/Create action was taken.
- Before/after live installation: all **161** public-table counts and full-row fingerprints were identical. Catalog comparison found exactly the two expected function-definition changes and no changed grants, tables, policies, triggers, or other functions.
- Intentional Demo infrastructure fingerprint: `sha256:2050211adbdcb2a15331f1f32264a868f06284601f9c036510c7bfd545eeefcf`; object-key fingerprint/counts unchanged.
- Read-only Production/Demo comparison still fails on **32 pre-existing function-definition differences**, the same objects/findings as before this installation. This extension introduced no supported-schema drift. Sandbox was not changed or re-audited.

## Audit amendment — approved and installed

The complete live trigger/catalog review found `estimate_actor_audit`, a private one-row-per-Estimate attribution table. Authenticated Estimate creation automatically inserts this row. Its primary key is `estimate_id`, with an ON DELETE CASCADE foreign key to the Estimate. The approved list covered only Drafts, Draft items, Draft launches, Estimates, and Estimate items. The new inbound-dependency guard correctly rejects this unregistered audit row; a disposable regression reproduces that rejection before any deletion.

The initial proposal missed this dependency. The approved amendment now owns it by exact key. Do not bypass the guard, disable the audit trigger, grant direct audit-table access, or record a fixture whose complete cleanup is unsupported.

**Approval subsequently granted by the owner:** extend and install the same private Demo fixture support for the newly created `estimate_actor_audit` row only. Use its exact `estimate_id` as the registered key, bound to the same run's newly created unsent Estimate and contractor. Validate its creator against the recording contractor identity and refuse sent/foreign attribution or unexpected dependents. Add audit priority 91 and the explicit non-`id` key mapping; preserve service-role-only helper execution and all existing table/role restrictions. Adapt the receipt module, validate rejection/recovery/cleanup in disposable tests, apply only to Demo after guarded preflight, update the intentional fingerprint, and then record the ordinary flow. No shared customer/property deletion, Production/Sandbox changes, provider/environment changes, or merge is included.

Narration preparation remains part of the tutorial work; Production Help creation/upload/publication still requires review and separate approval. Local storyboard/narration are already prepared under `.codex/artifacts/tut-002-2026-09-25/`.

## Tutorial impact

**UPDATE REQUIRED — TUT-002, “How to create an estimate,” published revision 3.** The post-implementation Help Studio review from PR #576 found the legacy Service Requests media inconsistent with the finished Work → Draft workflow. This task changes recording/operator support, not the application screens. No repeat playback was needed while working on the recorder. Codex owns the bounded follow-up: add approved audit-row ownership, record on durable Demo, prepare Cedar narration and compact synchronized captions, review the result, then obtain approval for Production Help publication and verify the replacement through Help. The tutorial task remains incomplete until that replacement is published and verified.


## Amendment and recording evidence

- `servsync-demo-draft-first-audit-ownership.sql` changed exactly the three existing reset-order, primary-key mapper, and reset-run definitions. Catalog ACLs, product tables, and audit triggers were unchanged; the audit table remains inaccessible directly to service_role/anon/authenticated.
- Disposable tests cover successful six-record cleanup, missing audit registration, wrong creator/editor/contractor/owner, historical or sent attribution, ordinary foreign/run/dependency rejection, saved-only recovery, and no broadened table grants. All passed. Existing recorder/Help tests and parity tests passed (105 tests total).
- All 161 public-table counts and full-row fingerprints matched across SQL installation. Across recording, only the two registry tables `demo_scenarios` and `demo_scenario_runs` changed; all product tables and `demo_scenario_records` returned to their previous fingerprints.
- Successful recording run: `d73ce5fd-b944-4682-bb1c-fdda2d0dcee8`; shared source run: `3a2dd171-785f-4d79-955f-6cefc394d831` (never reset). Cleanup returned exactly one deletion each for Draft launch, Draft item, Draft, Estimate actor audit, Estimate line item, and Estimate. The earlier pre-save attempt also reset without product writes.
- Recording source commit: `5c9ac21d0fe5555b90c337efa8d3a9d387a61384`. Canonical durable media: `~/Documents/Codex/ServSync Demo Recordings/contractor-create-estimate/servsync-contractor-create-estimate-v2-2026-09-25T20-12-21-290Z.{mp4,webm,json}`.
- Local review: `~/.codex/artifacts/tut-002-2026-09-25/preview.html` (self-contained video/captions) and `visual-review-captions.vtt`. A browser check confirmed 62.44 seconds, exactly one caption track with 15 cues, and paused playback. The MP4 contact sheet confirms the ordinary UI through the final Estimate Draft screen.
- Updated intentional Demo catalog fingerprint: `sha256:7e5b2f5a1dc968516f9cbdec6a2ad847dc339b28341a3dc61b4b7cea05aae189`. The pre-existing 32 supported-function definition differences are unchanged.

## Narrated local preview — September 25

- Final package: `~/Documents/Codex/ServSync Help Studio Recordings/contractor-create-estimate/2026-09-25T20-31-29-648Z/`, stem `servsync-help-contractor-create-estimate-2026-09-25T20-31-29-648Z-cedar-scene-synced` (MP4, MP3, poster, VTT, manifest).
- One provider generation; synchronization and local speech transcription made no further OpenAI requests. Source narration is 37.8 seconds within the 62.44-second video. No speech rate modification, overlapping segments, or shortened final result hold.
- Captions preserve the exact approved script and follow measured sentence pauses. Their checksum and 14 timings are recorded in the final manifest. AI voice disclosure appears in the preview.
- A full browser playback completed at 62.44 seconds, muted, without media errors; the final unsent Estimate and caption rendering were visually checked. Playback was then reset and left paused for owner sound-on review.
- The local preview remains `~/.codex/artifacts/tut-002-2026-09-25/preview.html`. It does not autoplay. Local `final-package.json`, `final-captions.vtt`, and `local-speech-transcript.json` identify the current review artifacts.
- All 14 Help tests passed, including an actual audio signal test that checks early/middle/late loudness and silent gaps. Earlier 105 recorder/Help/parity checks and all hosted PR checks passed before the bounded audio fix; final CI is recorded on PR #577.

## Publication evidence

- Published walkthrough: `9f62de0c-a06a-4840-86cb-6bf0362975f5`, revision **4**; request `d046ddc2-a1a5-4fd5-ab42-30325fa68f3d` is Approved.
- Video asset `7339ba44-fee9-4879-97e5-9e096d6e21eb`; poster asset `f3629c85-eb04-484a-9934-8f371bce3045`.
- Captions SHA-256: `f4f5d85f015cd627a93ccf5b515492b3650c3dd220a6846b21ea2bf294f9bb5a`; narration-script SHA-256: `0d8305033c67c505b5f694be0e2550c448bc39272c7a9da373ed0f141ebb1f5b`.
- Local publication package: `~/.codex/artifacts/tut-002-2026-09-25/publication/d046ddc2-a1a5-4fd5-ab42-30325fa68f3d/`. Rebinding used the downloaded persisted request, retained exact approved media bytes, and made no new provider request.
- Read-only receipts: `/tmp/tut002-help-publication-before.json`, `/tmp/tut002-help-publication-after.json`, `/tmp/tut002-help-published-detail.json`, and `/tmp/tut002-owner-published-verification.json`.
- Source/volume fix checks and all PR checks passed at `b500167`; publication is an approved Help content operation independent of merging this recorder-support branch.

The TUT-002 replacement task is complete. PR #577 remains unmerged; no merge approval is included in the publication approval.
