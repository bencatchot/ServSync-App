# ServSync Phase 0.7 Honest Beta Boundaries Acceptance

Date: 2026-08-26

Status: implementation and acceptance complete; owner review and explicit merge approval pending

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
- The exact PR application Preview did not accept the Production smoke identity, so it was not treated as evidence of Production Auth parity. After explicit owner approval, only the exact dedicated Production contractor smoke account password was reset to its existing stored value. No new secret was created or displayed.

## Production tutorial freshness evidence

Production Help Studio and isolated authenticated smoke completed the current tutorial-freshness gate:

- Production Help Studio contains one published walkthrough: **How to create an estimate**, revision 3, 45.12 seconds.
- Searches for `estimate`, `Work`, `draft`, `quote`, and `pricing` resolve that walkthrough. Searches for the new `beta`, `help`, `Financials`, `invoice`, `payment`, `calendar`, `dispatch`, `Discover`, and `reminder` surfaces return no additional published tutorial match.
- Full revision 3 playback completed at normal `1x` speed from `0` through `45.12` seconds. Its visible sequence remains Work -> Drafts -> Estimate, customer/home selection, agreed work and pricing, review, and estimate creation.
- The approved dedicated Production contractor Owner smoke account passed the focused read-only Playwright flow 1/1: sign in, Dashboard, Customers, Service Requests, Work, Drafts, contextual **How to create an estimate** playback dialog/media resolution, Financials, and Calendar. Major console and page-error capture remained clean.
- No Production business record, Help record, media, publication state, role, permission, or environment setting changed. The only approved Auth change was restoring the dedicated smoke account to its already stored password.

Tutorial impact is `NONE`: Phase 0.7 adds a new guide and boundary copy without changing the published walkthrough path, labels, control order, role assumptions, or outcome.

## Roadmap handoff

Phase 0.7 implementation and acceptance are complete. PR #521 remains a draft until normal owner review and explicit merge approval. After merge, the next roadmap assignment is Phase 1 / FB-040 controlled pilot preflight, not another broad feature slice.
