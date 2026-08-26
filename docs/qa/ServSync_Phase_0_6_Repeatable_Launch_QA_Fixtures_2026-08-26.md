# ServSync Phase 0.6 Repeatable Launch QA Fixtures Acceptance

Date: 2026-08-26
Starting main commit: `93580012d668f94e25fb0be5abbb8349b24f7183` (merged PR #519)
Branch: `codex/phase-0-6-launch-qa-fixtures`
Tutorial Freshness: `NOT APPLICABLE` — fixture, test, private runner, migration, and operator-documentation changes only; no visible route, label, control, role behavior, or workflow changed.

## Exit decision

**Phase 0.6 remains INCOMPLETE pending its protected Demo closeout.** The source slice and safe Sandbox validation may complete on the feature branch, but the roadmap gate does not pass until the exact dedicated-Demo migration is separately approved/applied and the destructive live all-checkpoint matrix proves repeat, deliberate interruption recovery, and final zero residue.

## Canonical fixture contract

| State | Demo checkpoint | Sandbox automated evidence |
| --- | --- | --- |
| New/reviewable Request | `request_ready`; `contractor_review_ready` | Connected homeowner Request creation and contractor review in both launch paths. |
| Estimate Draft / Sent / Accepted | `estimate_draft`; `estimate_sent`; `estimate_accepted` | Real contractor Draft/send and homeowner accept transitions. |
| Job created / scheduled / in progress / review-ready / completed | `job_created`; `job_scheduled`; `job_in_progress`; `job_review_ready`; `job_completed` | Canonical Job creation, persisted work completion, reload, and completion. |
| Invoice Draft / Sent / Viewed / Partially Paid / Paid | `invoice_draft`; `invoice_sent`; `invoice_viewed`; `invoice_partially_paid`; `invoice_paid` | Draft/send, full payment, and partial-to-final durable payment paths. |
| Finalized Job report in Home History | `home_history_updated` through normal UI finalization and exact recorder adoption | Existing Phase 0.5 Job report/attachment and Home History preservation evidence. |
| Paid Invoice filing / reminder / reload | `invoice_home_history_updated` | Full-payment path files the paid Invoice, creates its linked reminder, reloads, and reopens exact lineage. |

`estimate_viewed` was removed from deferred expectations because it is not an established Estimate status. Invoice `viewed` uses the existing homeowner RPC. Declined, expired, cancelled, overdue, and void remain focused regression states outside this positive-path fixture matrix.

## Safety and recovery model

- Demo extends the existing `water_heater_core_loop` manifest, registry, runner, verifier, reset ordering, and recorder adoption. It adds no second fixture framework or browser control.
- Demo Invoice creation/send/view/payment/filing use the established authenticated product RPCs. Partial plus exact final payment must correspond one-for-one with registered immutable ledger rows, and verifier ledger totals must equal `amount_paid_cents`.
- Exact migration `servsync-demo-mode-invoice-payment-checkpoint-reset.sql`, 152 lines, SHA-256 `d1454de4d86658f59f06b968a2028e1578cd4a986a55ed1e2db30af0dccf4c3b`, is dedicated to Demo `bdytwgejqnlblhrnqxkp`. It is unapplied. Sandbox and Production are `N/A` in the rollout ledger.
- The Demo reset helper remains postgres-owned/service-role-only. A payment row is removable only when registered with one of two exact payment roles and its Invoice is registered to the same run. The named immutable trigger is bypassed only inside the locked transaction for that exact row; foreign lineage, broad deletion, truncation, and browser execution are refused.
- Sandbox writes each exact E2E prefix to ignored `local-ops/phase-0-6/core-loop-runs.json` before mutation. Normal teardown and `npm run qa:fixtures:sandbox:recover` use the same exact dependency cleanup and remove manifest entries only after the zero-residue transaction commits.

## Validation evidence

Source and exact-source Sandbox evidence:

- Demo foundation/checkpoint/job source contracts: 40/40.
- Demo Recorder contracts, including Phase 0.6 source/security checks: 37/37.
- Sandbox desktop canonical command: 2/2 in 1.0 minute. The full lifecycle and the separate partial-to-final offline-payment durability case both passed.
- Sandbox focused mobile canonical command: 1/1 in 33.5 seconds at exactly 390x844. Request, contractor review, Estimate send/accept, Job execution/completion, Invoice send/full payment, paid-Invoice Home History filing, linked reminder, reload, and exact-record reopen all passed.
- Sandbox recovery command: no pending prefixes before or after the two runs. A deliberate orphan-manifest drill then recovered one exact future-safe prefix, passed the transactional zero-residue assertion, and a repeat recovery reported no pending prefixes. Every case removes its durable manifest entry only after cleanup commits.
- Exact local production build against the Sandbox public configuration loaded at `http://127.0.0.1:4173`; the independent browser gut-check reported no browser errors.
- TypeScript, production build, app-size budget, architecture, backend parity unit contracts, runtime parity unit contracts, role-smoke contracts, Phase 0.4 reliability contracts, recovery-validator contracts, controlled-ops security contracts, diff whitespace, and the ratcheted 79-warning lint budget: pass.
- Read-only linked-Sandbox security catalog: 24 passed, 1 opt-in concurrency probe skipped, and 2 failed on the already-missing `home_assets` authenticated grants/manager-only policy. Those catalog mismatches require a protected Sandbox schema correction, are not caused by this source-only fixture slice, and were not changed or bypassed here.
- Tutorial Freshness: `NOT APPLICABLE`.

## PR and Preview evidence

- Draft PR: #520.
- Accepted source/documentation head before this evidence-only append: `4b1c92c94c16f74f4d971e836e5210d77e81587c` (`dfc90f3505ae747e10796ee57a8f6091fac5fd96` implementation plus `4b1c92c94c16f74f4d971e836e5210d77e81587c` documentation).
- Pull Request Quality and all three automatic Vercel deployment checks passed.
- App Preview: `https://serv-sync-app-refresh-git-codex-pha-4401a5-bencatchots-projects.vercel.app`.
- Demo Preview: `https://servsync-demo-mhpv03yh4-bencatchots-projects.vercel.app`.
- Sandbox Preview: `https://servsync-stripe-sandbox-5xny6c5x5-bencatchots-projects.vercel.app`.
- Signed-in browser inspection loaded the ServSync app shell at all three exact deployments with zero console errors. The App Preview also passed a `390x844` viewport check with no horizontal document overflow. No Preview mutation was needed because the canonical lifecycle already passed against the exact accepted source locally with Sandbox configuration and guaranteed cleanup.

## Protected closeout still required

1. Review and explicitly approve applying exact SHA-256 `d1454de4d86658f59f06b968a2028e1578cd4a986a55ed1e2db30af0dccf4c3b` only to Demo `bdytwgejqnlblhrnqxkp`.
2. Apply once after exact target/catalog preflight; verify helper definitions, ownership, grants, reset ordering, and Production-to-Demo intentional-difference parity.
3. Run `npm run demo:qa:matrix -- --execute-demo` with approved Demo identities. Require every supported checkpoint, same-checkpoint replacement, deliberate failed-run reconciliation, final exact reset, and zero residue.
4. Only after that evidence may Phase 0.6 be marked complete and Phase 0.7 become active.
