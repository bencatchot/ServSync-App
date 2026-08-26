# ServSync Phase 0.7 Honest Beta Boundaries Acceptance

Date: 2026-08-26

Status: implementation and authenticated Demo acceptance complete; current Production Help playback pending

Branch: `codex/phase-0-7-beta-boundaries`

Starting main commit: `7470d4e12a7695d93e98269343a834c26555d81d`

Draft PR: #521

## Outcome

The Phase 0.7 candidate gives each pilot role one stable **Help -> Beta Guide** destination. The guide distinguishes capability that is available in the controlled beta, intentionally manual, or unavailable. It also provides a direct Support handoff and, for contractors, reuses the existing published contextual **How to create an estimate** walkthrough instead of creating another help-media system.

Preview review also confirmed that the dashboard feedback card can sit below other content. The guide therefore resets both the desktop workspace scroller and the mobile page scroller when it opens, and resets the same scrollers after its Support handoff, so the destination begins at its title instead of inheriting a prior screen position.

The highest-risk workflow surfaces also carry concise local boundaries:

- Contractor Financials and homeowner Invoices state that payment collection happens outside ServSync during the controlled beta.
- Homeowner and contractor Calendar state that external calendar sync and automation are unavailable; the contractor surface also excludes route optimization and advanced dispatch.
- Discover states that beta coverage, ranking, response, and lead volume are not guaranteed.
- The role-aware guide explicitly excludes accounting sync, automatic email/text/push reminders, native iOS/Android apps, full calendar sync/advanced dispatch, broad marketplace lead generation, and in-app payment collection.

## Authority and scope

This is a presentation and help-navigation slice. It does not add or change:

- SQL, schema, RLS, RPC, authentication, roles, or permissions;
- online payment collection or provider configuration;
- notification delivery, scheduling automation, routing, or dispatch;
- native/offline behavior, environment settings, deployments, or Production data.

## Automated evidence

| Check | Result |
| --- | --- |
| Phase 0.7 source contracts | Pass, 4/4 |
| Complete architecture suite | Pass, 19/19 |
| Work/Financials navigation contracts | Pass, 11/11 |
| TypeScript | Pass |
| ESLint warning budget | Pass, exactly 79 inherited warnings and zero errors |
| Production build | Pass |
| App monolith budget | Pass, exact existing 50,824-line baseline |
| Diff whitespace check | Pass |

## Authenticated exact-head Preview evidence

Commit `829d9ccedd6baf28635f4f5dddbb889683c8e41f` passed GitHub quality and all three Vercel Preview deployments. Authenticated acceptance used only the approved Demo contractor and homeowner accounts and did not create, edit, send, or submit any record.

- Contractor desktop and `390x844`: the Beta Guide opened at the title with no horizontal overflow; mobile More exposed the same destination; Support opened at the top with `Question`, `Beta help`, and contractor Beta Guide context prefilled; Financials, Calendar, and Discover displayed their local boundaries.
- Homeowner desktop and `390x844`: the Beta Guide opened at the title with no horizontal overflow; mobile More exposed the same destination; Support opened at the top with `Question`, `Beta help`, and homeowner Beta Guide context prefilled; Estimates / Invoices, Calendar, and Discover displayed their local boundaries.
- The dashboard feedback-card path and the guide-to-Support path both reset the workspace/page scroller to zero. No Support message was sent.
- The exact Production-backed Preview loaded successfully, but the approved contractor smoke credentials were rejected as invalid. No alternate credential, password reset, account change, Production record, or Help publication was attempted.

## Acceptance still required

Before Phase 0.7 can be called complete:

1. Restore or supply the approved Production contractor smoke-account access without creating or mutating an account in this slice.
2. Confirm contractor contextual Estimate Help resolves and opens the current published **How to create an estimate** walkthrough, revision 3.
3. Reconfirm the Help Studio inventory search for `beta`, `help`, `estimate`, `Work`, `Financials`, `invoice`, `payment`, `calendar`, `dispatch`, `Discover`, `reminder`, and relevant synonyms; compare every published match with the exact Preview behavior.
4. Finalize tutorial freshness as `NONE`, `UPDATE REQUIRED`, or `UPDATED` only after that current playback comparison.

## Roadmap handoff

Phase 0.7 remains the active final Launch Foundation gate until current Production Help playback passes and the PR receives normal owner review and explicit merge approval. The next roadmap assignment is Phase 1 / FB-040 controlled pilot preflight, not another broad feature slice.
