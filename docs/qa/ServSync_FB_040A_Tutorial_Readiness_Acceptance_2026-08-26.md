# ServSync FB-040A Tutorial Readiness Acceptance

Status: Source candidate ready for draft-PR Preview; Demo recording package not yet produced

Date: 2026-08-26

Branch: `codex/fb-040a-tutorial-readiness`

Base: merged PR #521 main commit `0bddbb20682bbcac7945150e6f2d70e57e54aed7`

## Accepted source scope

- Six-workflow protected pilot tutorial matrix, including the current published Estimate revision and five missing tutorials.
- First new scenario: contractor reviews a ready homeowner Service Request, reads the original request/customer/home context, and starts the Estimate from the Request.
- Dedicated contextual Help lookup on `contractor.service_requests`; no visible button appears until an approved matching walkthrough is published.
- Contractor contextual Help waits for the loaded contractor identity before calling the protected search RPC, avoiding a transient denied request during sign-in hydration.
- Help Studio safe-scenario allowlist and focused recorder, contextual-placement, coverage, and freshness contracts.
- Roadmap, Feature Backlog, Master Plan, planning index, and changelog handoff from completed Phase 0 to FB-040A.

## Safety and authority

- The recorder targets only dedicated Demo project `bdytwgejqnlblhrnqxkp` and durable Demo origin `https://servsync-demo.vercel.app`.
- The path begins and ends at `request_ready`. After the registry-owned fixture seed, it reads and navigates only; it does not save or adopt an Estimate.
- No SQL, schema, RLS, RPC, role, permission, provider, environment setting, Production data, Help record, media, or publication state is changed.
- Production publication requires explicit owner approval through the existing Help Studio review flow.

## Verification

| Check | Result |
| --- | --- |
| Demo recorder contracts | Pass, 40/40 |
| Help Studio recorder and FB-040A architecture contracts | Pass, 5/5 |
| Full architecture suite | Pass, 21/21 |
| TypeScript | Pass |
| Production build | Pass |
| ESLint budget | Pass, exact existing 79 warnings |
| App monolith budget | Pass, exact existing 50,824 lines |
| Diff whitespace check | Pass |

The deployed Demo Preview loaded Service Requests with zero horizontal overflow and no unpublished tutorial control. That check exposed a transient `403 Contractor context is required` from the Help search before contractor identity hydration; the candidate now waits for that identity before querying and includes a focused policy regression.

## Open acceptance gates

The first live Demo recorder attempt failed closed before seeding because this worktree did not have `DEMO_SUPABASE_ANON_KEY` or `DEMO_SUPABASE_SERVICE_ROLE_KEY`. No Demo or Production data was changed and no recording artifact was promoted.

Before TUT-001 can be published:

1. Supply the existing dedicated-Demo recorder credentials through the approved local secret path.
2. Run `contractor-service-request-intake` with the shared human-paced profile and verify duration, browser-error, sensitive-text, checkpoint, and durable-package results.
3. Review the complete MP4 at `1x` for current labels, request details, legibility, pacing, and accurate Request-to-Estimate lineage.
4. Verify the draft-PR Preview placement at desktop and `390x844`; before publication, confirm the lookup is quietly absent when no matching published tutorial exists.
5. Create/attach the Help Studio revision and obtain explicit owner approval before any Production publication.
6. After publication, verify Owner/Admin/Office contextual retrieval and full playback, plus denial for unintended audiences.

## Tutorial Freshness

Tutorial impact: `UPDATED`.

Tutorial evidence: Phase 0.7 verified the Production Help inventory and completed full revision 3 playback. That published Estimate tutorial remains current. TUT-001 is a new unpublished path with no matching published `contractor.service_requests` walkthrough; this slice supplies its protected source readiness only.

Affected tutorial: TUT-001 **How to handle a homeowner service request**.

The existing published **How to create an estimate**, revision 3, is not replaced or changed by this slice. TUT-001 is new and remains unpublished, so the source candidate does not make a stale tutorial visible to users.
