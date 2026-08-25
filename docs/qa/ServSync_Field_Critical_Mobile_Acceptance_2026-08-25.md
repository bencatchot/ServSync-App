# ServSync Field-Critical Mobile Acceptance — 2026-08-25

## Scope And Starting Point

Phase 0.5 starts from a clean re-read of `origin/main` at exact normal merge commit `15cd71c93487a0d0611bc2726fc5ed2804feb2b3`, which includes merged PR #518 and closes the stale Phase 0.4 evidence control point.

Branch: `codex/phase-0-5-mobile-acceptance`

Draft PR: [#519](https://github.com/bencatchot/ServSync-App/pull/519)

Status: **IN PROGRESS — exact-head Preview acceptance remains required.** Source or local rendering alone does not complete Phase 0.5.

The accepted product boundary is unchanged: Work owns Drafts, Estimates, Jobs, reports, checklists, findings, and work attachments; Financials owns Invoices and payment state; Customers owns contact/property context; homeowners retain Properties, Home History, and Documents; existing role and shared-home privacy rules remain authoritative.

## Audited Mobile Path

The bounded audit covers the established phone path at `390x844`:

1. Contractor Dashboard -> Today's Work -> scheduled Request, Job, appointment, or calendar action.
2. New Request -> review/reply -> existing Estimate or service-visit action.
3. Estimate -> review/edit where authorized -> send -> homeowner connected or secure guest review/response -> accepted state.
4. Accepted Estimate -> Job -> established checklist/finding/notes/photo/report actions -> completion.
5. Work record -> Customer and property context -> contact return path.
6. Completed Job -> Financials -> Invoice -> send/current payment state.
7. Homeowner Estimate/Invoice handoff -> notification/records -> Home History/Documents result.
8. Owner/Admin/Office financial authority, Field Technician operational authority without billing, Viewer read-only behavior, and homeowner/shared-home boundaries.

## Launch Blockers Found And Fixed

| Finding | Mobile impact | Bounded correction |
| --- | --- | --- |
| Preview inspection found Sign in and public account-entry actions at only 36-38 px tall. | The contractor's first phone interaction missed the accepted touch target even though it was visible and unclipped. | Raised the existing entry actions and adjacent Trust & Safety return target to a 44 px minimum without changing routes or hierarchy. |
| Contractor Dashboard led with a full-week schedule instead of the immediate field task. | An unfamiliar contractor had to scan the week before finding the next scheduled action. | Added Today's Work before the weekly schedule, with the earliest item as the single dominant action and later items secondary. |
| Initial business-profile setup rendered globally above active contractor destinations. | Setup explanation could appear ahead of Request, Work, Customer, Financials, or Job work. | Scoped the prompt to Dashboard only; existing setup remains available without blocking active tasks. |
| Homeowner Estimate action groups retained compact desktop-width buttons. | Review/approve/decline, file, and return-to-history actions could be harder to scan and tap in dense cards. | Reused the established full-width-on-mobile action hierarchy while preserving desktop wrapping and primary/secondary weight. |
| The Job checklist layout-save prompt was centered but not viewport bounded. | A long prompt or software keyboard could make lower actions unreachable. | Added accessible dialog semantics, `100dvh` bounds, independent vertical scrolling, overscroll containment, and phone-width actions. |
| The resettable full lifecycle regression was desktop-fixed. | The established path could regress on phones without exercising real transitions. | Added an explicit field-mobile mode at exact `390x844` with overflow, clipping, primary-action, touch-height, and reload checks at lifecycle checkpoints. |

## Automated Evidence

- `npm run typecheck`: passed.
- Focused Phase 0.5 rendered/source coverage: 6/6 passed at exact `390x844`.
- Applicable secure guest Estimate and Invoice delivery coverage: combined focused run passed 55/55, including desktop and exact `390x844` responsive rendering, response state, reload, error/empty handling, dialog focus, and no horizontal overflow.
- One separately Sandbox-configured Pay online case failed in the first broad local run because the clean worktree intentionally had no Sandbox payment flag/configuration; it passed no Phase 0.5 code path and was excluded from the applicable rerun rather than manufacturing environment access.
- Exact-source authenticated workflow [run 32890866808](https://github.com/bencatchot/ServSync-App/actions/runs/32890866808) passed Sandbox fixture/authorization health, Owner/Admin/Office/Field Technician/Viewer browser coverage, contractor and homeowner bounded mobile navigation, Demo read-only navigation, Production public/authenticated read-only navigation, and published Help playback.
- The resettable full-core-loop mobile mode was invoked once in the credential-safe workflow. It stopped before the first mutation because that runner had no local Supabase CLI link and therefore could not guarantee exact cleanup. The harness now checks the linked Sandbox cleanup path before mutation and the responsive shared navigation helper supports mobile drawers. No lifecycle fixture record was created by the failed preflight.

## Role, Privacy, And Durability Preservation

- No capability, role string, authorization handler, schema, RLS, RPC, Storage policy, auth, or provider code changed.
- Existing capability-derived boundaries remain: Owner/Admin/Office billing; Owner/Admin/Office/Field Technician Job operations; Viewer read-only; homeowner and cross-tenant denial from contractor operations.
- Homeowner Home History/Documents ownership and shared-home redaction/private-record boundaries are unchanged.
- Phase 0.4 durable operation keys, replay reconciliation, canonical result reuse, duplicate prevention, and finalized-record lineage are untouched.

## Browser And Preview Evidence

| Target | Viewport | Result |
| --- | --- | --- |
| Local Vite exact source | `390x844` | App initialized without error overlay or console errors; the missing-Supabase setup state rendered as expected in the clean worktree. |
| Rendered Today's Work harness | `390x844` | One dominant next action, secondary later work, empty return path, touch height, and zero horizontal overflow passed. |
| Secure guest Estimate/Invoice fixtures | Desktop + `390x844` | Responsive render, response/reload/error states, focus containment, and zero horizontal overflow passed. |
| Demo Preview from runtime/test head `8d94d62b10962b66c19cab843e2786eb38b33a2f` | `390x844` | [Immutable Preview](https://servsync-demo-31gd4qhhv-bencatchots-projects.vercel.app): exact viewport, zero horizontal overflow, zero clipped controls, and 44 px Sign in/account-entry/Trust & Safety targets passed. |
| Same exact-head Demo Preview | `1440x1000` | Zero horizontal overflow and zero clipped visible controls passed. |
| Exact-source Sandbox role workflow | Desktop + bounded mobile navigation | All five contractor roles, homeowner navigation, API identity, fixture, authorization, and backup health passed. |
| Exact-source resettable lifecycle | `390x844` | **BLOCKED BEFORE MUTATION:** the available runner had no linked Sandbox cleanup path. Required before Phase 0.5 completion. |

## Tutorial Freshness

`NONE`. The Help inventory search covered Request, Estimate, Work/Job, Invoice/Financials, Customer/property, Home History, Drafts, billing, records, and property synonyms. The only published match is **How to create an estimate**, revision 3. Production Owner playback in exact-source workflow run 32890866808 opened the actual contextual result, dialog, and signed video source. Its established Work -> Drafts estimate-creation path, visible labels, control order, Owner/Admin/Office role assumption, and outcome are unchanged by the Dashboard priority, homeowner response-layout, Job-dialog, and touch-target corrections. No Help content was changed or published.

## Remaining Non-Blocking Items And Exit Decision

- Real-device Safari/Chrome and installed-PWA observation remains a later QA layer; this slice does not claim native, offline, camera, or app-store behavior.
- The exact-source five-role/read-only matrix, public Preview phone/desktop checks, and Tutorial Freshness pass are complete.
- Phase 0.5 still requires one approved execution of the resettable full lifecycle at `390x844` from the exact PR runtime source with a verified local Sandbox CLI link so cleanup is guaranteed. That run must cover Request -> Estimate -> Job -> Invoice -> payment -> Home History reload without overflow, clipping, or hidden primary actions.

Current exit decision: **DO NOT EXIT PHASE 0.5 YET.**

## Protected Actions Not Taken

- No merge to `main`.
- No manual deployment or Production promotion.
- No SQL application or shared/Production data mutation.
- No schema, RLS, RPC, Storage, authentication, authorization, environment, provider, secret, or infrastructure change.
