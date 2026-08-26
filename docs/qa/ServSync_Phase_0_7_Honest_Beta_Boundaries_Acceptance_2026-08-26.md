# ServSync Phase 0.7 Honest Beta Boundaries Acceptance

Date: 2026-08-26

Status: implementation and source validation complete; authenticated exact-head acceptance pending

Branch: `codex/phase-0-7-beta-boundaries`

Starting main commit: `7470d4e12a7695d93e98269343a834c26555d81d`

## Outcome

The Phase 0.7 candidate gives each pilot role one stable **Help -> Beta Guide** destination. The guide distinguishes capability that is available in the controlled beta, intentionally manual, or unavailable. It also provides a direct Support handoff and, for contractors, reuses the existing published contextual **How to create an estimate** walkthrough instead of creating another help-media system.

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

## Exact-head acceptance still required

Before Phase 0.7 can be called complete:

1. Verify contractor Owner and homeowner views on the exact Preview head at desktop and `390x844`.
2. Open the Beta Guide from desktop and mobile Help navigation for both roles.
3. Confirm all three capability groups are readable without clipping or horizontal overflow.
4. Confirm Support handoffs open the correct role-aware feedback flow and do not request unnecessary private details.
5. Confirm contractor contextual Estimate Help resolves and opens the current published walkthrough.
6. Search Help Studio using `beta`, `help`, `estimate`, `Work`, `Financials`, `invoice`, `payment`, `calendar`, `dispatch`, `Discover`, `reminder`, and relevant synonyms; compare every published match with the exact Preview behavior.
7. Record tutorial freshness as `NONE`, `UPDATE REQUIRED`, or `UPDATED` only after that search and playback comparison.
8. Confirm no new browser/page/`5xx` errors and no unintended role navigation exposure.

## Roadmap handoff

Phase 0.7 remains the active final Launch Foundation gate until the exact-head checks above pass and the PR receives normal owner review and explicit merge approval. The next roadmap assignment is Phase 1 / FB-040 controlled pilot preflight, not another broad feature slice.
