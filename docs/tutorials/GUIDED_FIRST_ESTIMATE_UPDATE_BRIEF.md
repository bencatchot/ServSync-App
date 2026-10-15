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
| Real work | Start a real estimate; show blank customer/title | “Your real Draft starts fresh. Save Draft before leaving; resume from Work, then Drafts.” |
| Next steps | Optional prices/customers; existing Save/Create confirmation | “Add prices or customers when useful. Creating an Estimate and sending it are separate actions.” |

Do not suggest cross-device guide progress, real-work autosave, a completion-time guarantee, or that preview sends a document. Audience and real-work permissions remain Owner/Admin/Office as supported by existing capabilities; do not broaden them to make a recording work.

## Remaining gate

Codex owns the recording/update follow-up attached to #585/#586. Finish fresh-account and hosted save/resume acceptance, record against the final application, and review the resulting media before requesting protected publication approval. No media generation, upload, paid narration, Help revision or Production publication was performed in this task. Fresh Production contextual retrieval/playback and approved replacement publication/verification remain open. Do not mark the overall onboarding task complete while this gate is open.
