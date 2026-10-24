# Guided first estimate — bounded TUT-002 follow-up

Issue #585 / draft PR #586. Tutorial impact: **UPDATE REQUIRED**.

## Evidence from October 15, 2026

Application verification finished first on feature commit `877a74c8d649cfb732483de38eb3367da249bb52`: the approved Demo Preview passed desktop and 390px mobile practice → clean real Draft → unsaved customer PDF preview with all business writes denied.

Authenticated Demo Help search returned HTTP 200 and zero results for `onboarding`, `estimate`, `first estimate`, `contractor.dashboard` and `contractor.drafts`. This describes the Demo catalog only; it does not mean Production has no matching tutorial.

PR #577 records TUT-002 **How to create an estimate**, Production revision 4, walkthrough `9f62de0c-a06a-4840-86cb-6bf0362975f5`. Its preserved publication package was reviewed locally after the Preview check. The video and captions match their package hashes: MP4 `a32b5033b7c9c33c4cea08f531df5b6fe3f993d484ee0f5e35e1de333add3c00`; VTT `f4f5d85f015cd627a93ccf5b515492b3650c3dd220a6846b21ea2bf294f9bb5a`. Full muted browser playback completed at 62.44 seconds, with 14 caption cues and no media error. This is local playback of the publication package, not a fresh Production Help retrieval.

The existing guidance starts at Work → Start New Draft, selects customer/property, describes scope and pricing, saves the Draft, then creates an unsent Estimate. It omits guided setup, isolated practice, the new **Preview customer estimate** control, and optional setup after preview. Its deliberate Save/Create/Send distinction remains useful.

## Proposed recording and guidance

Reuse PR #577's existing Demo Recorder and Help Studio process; do not duplicate its SQL, reset helpers or paid narration. Prepare one bounded replacement/addendum, preserving the existing tutorial and immutable revisions until an approved replacement is verified.

| Scene | Demonstration | Suggested short guidance |
| --- | --- | --- |
| Entry | Dashboard guide and customer-visible business details | “Start with a sample or your own estimate. Review the business name customers will see. Optional branding can wait.” |
| Practice | General-service sample, visible SAMPLE label | “Practice uses fictional details and example prices. It cannot send or save a customer record.” |
| Scope and pricing | Real shared editor, two sample lines, $195 total | “Describe the work, then review quantities and prices. These rates are examples.” |
| Preview | Preview customer estimate and PDF | “Check the customer view before continuing. Private Draft notes stay out of the document. Review final tax and terms on the created Estimate.” |
| Resume | Refresh same tab; skip/reopen guide | “Practice edits survive refresh in this tab. Guide choices stay in this browser.” |
| Real work | Start a real estimate; show blank customer/title | “Your real Draft starts fresh. Preview before choosing a customer. Add or select a customer before Save Draft; resume from Work, then Drafts.” |
| Next steps | Optional prices/customers; existing Save/Create confirmation | “Add prices or customers when useful. Creating an Estimate and sending it are separate actions.” |

Do not suggest cross-device guide progress, real-work autosave, a completion-time guarantee, or that preview sends a document. Audience and real-work permissions remain Owner/Admin/Office as supported by existing capabilities; do not broaden them to make a recording work.

## Remaining gate

Codex owns the recording/update follow-up attached to #585/#586. Post-confirmation fresh-account and hosted save/resume acceptance are recorded separately from untested public signup/email confirmation. Record against the final application and review the resulting media before requesting protected publication approval. A local silent review recording/package is now prepared; no upload, paid narration, Help revision or Production publication was performed. Fresh Production contextual retrieval/playback and approved replacement publication/verification remain open. Do not mark the overall onboarding task complete while this gate is open.

## Prepared review package

The final local review is `~/Documents/Codex/2026-10-15/task-3/tut002-guided-setup-review/preview.html`, with adjacent MP4, VTT, narration script, generated sample PDF, images and provenance manifest. It is 68.92 seconds at 1440×900, with 15 caption cues and no audio/provider request. Recorded from application commit `fc4d2d7` using the real Demo backend and the actual isolated sample editor; all business mutations were denied and zero were attempted. The MP4 checksum is `9cb7b1850ba8c6d816751c0add76efa16ff07259208b24794d83250525f92d1b`.

Visual review caught a real unsaved-PDF date defect; the narrow correction and its generated-PDF/saved-document regression checks passed before the final recording. It now displays “Preview generated” with a valid date. The corrected application's new hosted Preview passed desktop/mobile read-only tests after destination-specific approval, including PDF date assertions. The 68.92-second local recording passed complete playback with 15 loaded/visible captions and no media error. Recording provenance and hosted validation remain separately identified.

This is a reviewable addendum candidate, not a replacement revision ready for publication. It intentionally lacks a persisted Help job ID and ingestible package claim. After owner review, any final narration, Help job/package binding, upload, approval or publication must follow the existing protected process; retain current TUT-002 revision 4 meanwhile. The detailed test decisions are in `docs/qa/GUIDED_ONBOARDING_REMAINING_ACCEPTANCE.md`.

## October 24 refreshed review

After application commit `d4781a261e5cf7e777c59470b3ae30d1b99917e0` passed local checks and actual desktop Safari Preview validation, authenticated Demo Help searches for onboarding, first estimate, estimate, Save Draft and Preview customer estimate returned zero matches across dashboard/Draft contexts. The preserved published TUT-002 package again passed its hash check and complete 62.44-second local playback. Its existing customer-first Save/Create/Send guidance is still useful; guided setup and customer preview remain absent. This is not fresh Production contextual playback.

The October 24 local review supersedes the earlier candidate above: `~/Documents/Codex/2026-10-15/task-3/tut002-guided-setup-review-20261024/preview.html`. It records the verified application against real Demo using the existing recorder and existing synthetic recording fixture, with all business mutations forbidden. The final scene now explicitly says to add or select a customer before Save Draft. It is silent, 69.48 seconds at 1440×900; MP4 SHA-256 `9d8b4bdbc822c42c339dc713cfec6d4da479548bb1b764a409d908bfa7a2d9f8`. Zero business-mutation attempts occurred. Authentication is excluded from recorded media. Complete playback ended at 69.48 seconds with 15 loaded captions in showing mode and no media error; the current real-Draft caption was visually reviewed. MP4, VTT and PDF hashes match the manifest.

The local package remains a review candidate, not an ingestible or published Help revision. The next protected scope is the existing Help job/package binding, upload, approval and replacement/addendum publication for TUT-002, followed by retrieval/playback verification. No paid narration is proposed. Preserve revision 4 until the approved replacement is verified. Public signup/email confirmation and physical-device checks remain separate acceptance limits.

## Approved draft preparation — October 24

Ben approved the exact 137-word narration and preparation of the replacement draft, without paid narration, uploads or publication. The local request payload preserves the current Owner/Admin/Office audience, existing Drafts Help context and published revision 4. Its field shape passed the existing immutable server normalizer through a read-only query. No active replacement recording request was found; a normal platform-admin Help Studio session is required to save the approved draft and export its actual job identity. Do not impersonate an administrator, use a contractor-admin credential, fabricate a job ID or bypass existing policies.

`scripts/help/prepare-guided-onboarding-source.mjs` now validates the actual read-only review source, exact approved script hash, recorder fingerprint, source/media hashes, complete browser playback and converted WebM geometry/duration. It produces validated durable source metadata for the existing Help packager. It makes no app/backend requests and does not call the stateful scenario. Its `--bind <actual-exported-spec.json> <validated-source.json>` path requires the real exported job identity and exact approved script, then invokes only the existing `--validated-demo-metadata` packaging route. Job creation, media upload, narration and publication are not part of this adapter. The existing generic package and narration validators remain unchanged. The unbound draft is correctly rejected by the narration gate.

The next access need is normal platform-admin Help Studio sign-in, not renewed Practice access or another test record. After real job binding, the packaged source must pass the existing silent-source checks before any separately approved narration. Do not run the default estimate recorder, whose reset/create behavior remains outside this task.

Current provider information was checked in official documentation on October 24: the existing contract uses OpenAI `gpt-4o-mini-tts`, Cedar; text input costs $0.60 per million tokens and audio output $12 per million tokens. Total cost is usage-dependent; 500 input tokens plus 2,000 output audio tokens would be $0.0243 as an arithmetic example, not a quote or guaranteed cap. No account credits or enforceable per-request budget were verified. The model is deprecated with shutdown scheduled for January 6, 2027; no migration or provider/configuration change was made. Sources: [model pricing](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts), [retirement schedule](https://developers.openai.com/api/docs/deprecations). Request an explicit bounded narration decision only after source/job readiness; no provider request has occurred.
