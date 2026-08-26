# ServSync FB-040A Tutorial Readiness Acceptance

Status: Validated Demo recording ready for Help Studio attachment; not published

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
| Live protected Demo recording | Pass at source `1a7b9c4c55a3f894b0d0857762f38443c6268fdb`: 15.52-second H.264 MP4/WebM, 1440×900, human-paced, no browser errors, and no sensitive data |
| Full-speed visual review | Pass: complete 15.52-second playback ended at `1x`; opening Request, original details, customer/home context, and Request-linked Estimate handoff are clear and legible |
| Final Demo checkpoint | Pass: exact `request_ready`; one Request/message and zero Estimate, Job, Invoice, payment, Home History, report-document, or report-notification records |
| Help Studio recorder and FB-040A architecture contracts | Pass, 5/5 |
| Full architecture suite | Pass, 21/21 |
| TypeScript | Pass |
| Production build | Pass |
| ESLint budget | Pass, exact existing 79 warnings |
| App monolith budget | Pass, exact existing 50,824 lines |
| Diff whitespace check | Pass |
| Deployed Demo Preview Service Requests acceptance | Pass at `c713827124accc2914056cabe311f67265fadb3c`: no console/page/HTTP errors, zero horizontal overflow, and zero unpublished Help controls |
| Mobile Demo Preview placement | Pass at `1a7b9c4c55a3f894b0d0857762f38443c6268fdb` and `390x844`: one canonical Request card, visible Service Requests workspace, zero overflow, no browser/HTTP errors, and no unpublished Help control |

The first deployed Demo Preview check exposed a transient `403 Contractor context is required` from the Help search before contractor identity hydration. The candidate now waits for that identity before querying and includes a focused policy regression. The replacement exact-head Preview then loaded Service Requests with no console, page, or `4xx`/`5xx` response errors, zero horizontal overflow, and no tutorial control before publication.

## Open acceptance gates

The first credential-less run failed closed before seeding. After explicit owner approval, the existing dedicated-Demo keys were obtained through authenticated Vercel/Supabase management paths, injected only into the recorder process, and never printed or committed. Two subsequent duration checks rejected 12.72- and 13.88-second captures; the approved package preserves a four-second reading hold and passed at 15.52 seconds. Rejected captures were not promoted.

Validated local package: `servsync-contractor-service-request-intake-v1-2026-08-26T21-46-53-792Z` under the private ServSync Demo Recordings library.

Before TUT-001 can be published:

1. Create the matching Help Studio recording request and attach a job-bound package/poster through the managed ingestion flow.
2. Obtain explicit owner approval before any Production publication.
3. After publication, verify Owner/Admin/Office contextual retrieval and full playback, plus denial for unintended audiences.

## Tutorial Freshness

Tutorial impact: `UPDATED`.

Tutorial evidence: Phase 0.7 verified the Production Help inventory and completed full revision 3 playback. That published Estimate tutorial remains current. TUT-001 is a new unpublished path with no matching published `contractor.service_requests` walkthrough; this slice supplies its protected source readiness only.

Affected tutorial: TUT-001 **How to handle a homeowner service request**.

The existing published **How to create an estimate**, revision 3, is not replaced or changed by this slice. TUT-001 is new and remains unpublished, so the source candidate does not make a stale tutorial visible to users.
