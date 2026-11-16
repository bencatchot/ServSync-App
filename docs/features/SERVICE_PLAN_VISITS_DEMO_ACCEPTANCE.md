# Service Plan visits — Demo acceptance checkpoint

## Scope and installation

PR [#596](https://github.com/bencatchot/ServSync-App/pull/596), implementation head `4f38a99d242d80daa40e9ce79aea916379d7beea`. Owner approved the reviewed Demo migration and bounded fictional Jobs/Calendar test. Production and PR595 are unchanged. This checkpoint records partial acceptance, not release readiness.

Applied `supabase/migrations/20261113223048_service_plan_visits.sql` once to verified ServSync Demo `bdytwgejqnlblhrnqxkp` on 2026-11-13. SHA-256: `3bcba1c91d9427d70a9e19a18932f44ab619771b5030525c03c29aba6818a7de`. Connector returned success; read-only checks confirmed the table and projection RPC. No subsequent migration or security-setting change was made.

[Protected implementation Preview](https://servsync-demo-hcjhiw1vi-bencatchots-projects.vercel.app/#/contractor). Deployment `dpl_42VjfivJVvptNKgryVALqoVVySQQ` was READY at the implementation head. [Implementation CI](https://github.com/bencatchot/ServSync-App/actions/runs/43522176658) passed. Later documentation commits do not change the tested application implementation.

## Passed hosted checks

At 2026-11-13 23:00:01 UTC, existing fictional Marcus and Sarah identities were used through transaction-local authenticated role/claims and existing application database RPCs. No credentials were read, accounts created, or permissions changed. This verifies real persisted database behavior; it does not verify login, browser actions or the HTTP API transport.

- Created and accepted one clearly fictional zero-price, two-visit plan through the existing offer/response RPCs. Those functions and triggers were inspected for side effects first.
- Repeated explicit visit setup left exactly two slots.
- Created one Draft Job and scope item, then activated it through existing RPCs.
- Linked the first visit and repeated the identical update. It remained version 2 with only one change-history row.
- Scheduled one private Job Calendar event through `servsync_schedule_visit_event`; read-back confirmed the same linked Job was scheduled. Both visit-progress sharing flags and Calendar sharing remain false.
- Read-only baseline comparison after the expired follow-up confirmed all **100 pre-existing rows across 21 observed tables** had identical fingerprints, none missing. The only additions were the eight rows below. No new requests, messages, notifications, durable authoring operations, or observed email-attempt rows appeared. Existing connection/property sharing, retained showcase and earlier seven pending cleanup records were preserved.

## Retained records — no cleanup authorization

Run label: `FICTIONAL DEMO PR596-20261113-A`. All eight records remain intact. Do not recreate the run or delete these or earlier fixtures without separate cleanup approval.

| Table / record | Exact ID |
| --- | --- |
| `service_agreement_offers` | `518521ed-4aa4-4380-a38b-56dd031ca66f` |
| `service_agreements` | `246a59df-3160-4be9-9f88-2820283b98b5` |
| `service_plan_visits`, ordinal 1 | `d8a18108-6a58-4cad-81d0-70e381a11fcf` |
| `service_plan_visits`, ordinal 2 | `958819c9-0955-49a3-aaca-cfbce9562071` |
| `inspections` / Job | `5fc98a4b-4ae2-4b15-8017-1acbbe6a8303` |
| `job_work_items` | `c13416db-e001-42c1-b690-8b18236b4856` |
| `contractor_visit_events` | `d4626f2c-377f-4d16-845a-33680b2d7a09` |
| `service_plan_visit_changes` | `1` (for ordinal-1 visit above) |

Ordinal 1 is due 2026-11-14, linked, private, version 2. Ordinal 2 has no due date or Job, is private, version 1. Job `job_status` is `scheduled` (its existing report `status` remains `draft`); Calendar event is scheduled for 2026-11-15 23:00:01.741598 UTC, sharing false. Neither visit is completed.

## Blocked / untested

The subsequent exact-record lifecycle SQL was submitted to the connector but its two-minute confirmation expired. The connector returned `status: expired`; a fresh read confirmed unchanged setup state. **That lifecycle batch did not execute; no uncertain write remains and it was not retried.** It contains duplicate-link/stale-version rejection, reschedule/cancel/complete/reopen, explicit completed-link correction, homeowner shared projection and field-technician denial checks. Do not count prepared SQL as test evidence. Any resumed run must inspect these retained records and obtain the required fresh connector confirmation; never rerun setup or the migration.

Authenticated browser acceptance and tutorial playback are also incomplete. Task-specific in-app browser tabs reached the exact protected Preview contractor sign-in and `https://servsync.app/#/admin` admin sign-in. Neither provided an authenticated application session. No credentials were entered or sought through the previously denied route; no authentication/protection settings were altered. The prior broad Safari-selection denial was not retried. An authorized, signed-in task-specific Demo contractor/homeowner session and Help Studio admin session are needed for those checks.

Report generation/storage and full browser-to-backend lifecycle remain untested. Existing local SQL and component tests cover broader behavior but are not substitutes for hosted acceptance. Tutorial impact remains **UPDATE REQUIRED** pending playback comparison of “How to complete work and save the service record” revision 1 and “How to create an estimate” revision 4, plus visit-guidance coverage. Actual replacement need has not been established; complete comparison and any required publication before claiming readiness.

## Local evidence and next boundary

Operator-local evidence: `/tmp/servsync-pr596-demo-baseline.json`, `/tmp/servsync-pr596-demo-checkpoint.json`, `/tmp/servsync-pr596-demo-setup.sql`, `/tmp/servsync-pr596-demo-lifecycle.sql`. These are local supporting artifacts, not durable repository prerequisites or instructions to replay writes. The retained identity manifest above is the durable handoff.

The current follow-up is documentation and read-only verification only. Production migration/release, retained-record cleanup, credential access and security changes remain unauthorized.
