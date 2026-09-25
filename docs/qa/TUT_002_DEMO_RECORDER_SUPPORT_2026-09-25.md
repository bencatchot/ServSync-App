# TUT-002 Demo recorder support — September 25, 2026

## Result and boundaries

The owner approved the bounded Demo-only recorder extension in the local September 25 replacement review. The reviewed SQL was applied once to Demo `bdytwgejqnlblhrnqxkp`. Only `servsync_demo_reset_order(text,text)` and `servsync_demo_reset_registered_run(uuid)` changed. Their existing ownership, grants, security mode, and search paths were preserved. No Production or Sandbox mutation, merge, Help creation, upload, narration generation, or publication occurred.

The local recorder now has a separate ordinary Work → Start New Draft path, with the first line already open, customer/property selection, exact $1,895 pricing, Save Draft, Create Estimate confirmation, and final unsent Estimate verification. It uses isolated `draft_first_estimate` receipts, never resets `water_heater_core_loop`, and does not register shared identities/properties for deletion. This path is **not yet recorded or validated end to end against live writes**: its preflight intentionally stops before fixture creation for the audit dependency below.

## Validation evidence

- 140 isolated browser tests passed for the finished Draft composer, Save/launch confirmation, concurrency, and recovery behavior.
- 89 recorder and Help-package tests passed, including new saved/consumed Draft receipt, identity, scope, total, output, and child ownership checks.
- Disposable PostgreSQL validation passed: exact consumed and saved-only cleanup; extra Draft item/launch/Estimate item rejection; cross-run ownership refusal; wrong scenario, target, role, customer, contractor, output, and snapshot rejection; SET NULL/CASCADE dependency rejection; private browser-role denial; unchanged existing reset priorities; unrelated Estimate preservation; atomic failure; guarded reapplication refusal.
- The actual ordinary Demo interface was opened read-only. Work, Start New Draft, the Sarah Johnson customer option, Demo Bay Home, starter line, and current labels were confirmed. No Save/Create action was taken.
- Before/after live installation: all **161** public-table counts and full-row fingerprints were identical. Catalog comparison found exactly the two expected function-definition changes and no changed grants, tables, policies, triggers, or other functions.
- Intentional Demo infrastructure fingerprint: `sha256:2050211adbdcb2a15331f1f32264a868f06284601f9c036510c7bfd545eeefcf`; object-key fingerprint/counts unchanged.
- Read-only Production/Demo comparison still fails on **32 pre-existing function-definition differences**, the same objects/findings as before this installation. This extension introduced no supported-schema drift. Sandbox was not changed or re-audited.

## Additional dependency and smallest remaining decision

The complete live trigger/catalog review found `estimate_actor_audit`, a private one-row-per-Estimate attribution table. Authenticated Estimate creation automatically inserts this row. Its primary key is `estimate_id`, with an ON DELETE CASCADE foreign key to the Estimate. The approved list covered only Drafts, Draft items, Draft launches, Estimates, and Estimate items. The new inbound-dependency guard correctly rejects this unregistered audit row; a disposable regression reproduces that rejection before any deletion.

The initial proposal missed this dependency. Do not bypass the guard, disable the audit trigger, grant direct audit-table access, or record a fixture whose complete cleanup is unsupported.

**Proposed additional approval:** extend and install the same private Demo fixture support for the newly created `estimate_actor_audit` row only. Use its exact `estimate_id` as the registered key, bound to the same run's newly created unsent Estimate and contractor. Validate its creator against the recording contractor identity and refuse sent/foreign attribution or unexpected dependents. Add audit priority 91 and the explicit non-`id` key mapping; preserve service-role-only helper execution and all existing table/role restrictions. Adapt the receipt module, validate rejection/recovery/cleanup in disposable tests, apply only to Demo after guarded preflight, update the intentional fingerprint, and then record the ordinary flow. No shared customer/property deletion, Production/Sandbox changes, provider/environment changes, or merge is included.

Narration preparation remains part of the tutorial work; Production Help creation/upload/publication still requires review and separate approval. Local storyboard/narration are already prepared under `.codex/artifacts/tut-002-2026-09-25/`.

## Tutorial impact

**UPDATE REQUIRED — TUT-002, “How to create an estimate,” published revision 3.** The post-implementation Help Studio review from PR #576 found the legacy Service Requests media inconsistent with the finished Work → Draft workflow. This task changes recording/operator support, not the application screens. No repeat playback was needed while working on the recorder. Codex owns the bounded follow-up: add approved audit-row ownership, record on durable Demo, prepare Cedar narration and compact synchronized captions, review the result, then obtain approval for Production Help publication and verify the replacement through Help. The tutorial task remains incomplete until that replacement is published and verified.
