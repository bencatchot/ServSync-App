# ServSync FB-040A Tutorial Readiness Acceptance

Status: Narration/caption source foundation verified in PR #522; environment rollout and narrated TUT-001 replacement still required; nothing approved or published

Date: 2026-08-27

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
- The explicitly approved managed-ingestion step created one Production Help recording request and two private Help media assets. It changed no Production business record, authentication, role, permission, provider, environment setting, or publication state.
- Recording approval and Production publication remain separate owner decisions through the existing Help Studio review flow.
- The owner established voiceover, synchronized captions, and a matching durable transcript as the protected tutorial standard, then approved reuse of the existing Marketing configuration: OpenAI `gpt-4o-mini-tts` with Cedar and the exact disclosure **AI-generated voiceover using OpenAI's Cedar voice.** Bounded narration preparation is authorized; runtime generation, provider/secret changes, schema/storage rollout, approval of the silent package, and publication are not.
- The owner separately approved implementation of the Help narration/caption foundation in PR #522. That authority covers source and migration creation only; applying the migration to Sandbox, Demo, or Production, paid narration generation, recording approval, publication, merge, and manual deployment remain separate decisions.

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
| Job-bound Help package | Pass at source `815b226329f2848c3e7bbc4554081ccf74d8fc6d`: job `e4e6d6dc-7358-44ff-ac8b-f424ece6662e`, 16.04-second 1440×900 MP4, `servsync-human-paced-v1`, Demo provenance, passed technical and sensitive-data validation, MP4 SHA-256 `ea8162c75d276c0c28c5503d5aad9dc5ada7a79fe0f0abe6e1ee2bb5a2b54abf`, and poster SHA-256 `7ae961b0f05721876500fb1f422104f37570fd1825091d5127f23dcba13373b3` |
| Production managed ingestion | Pass: Help Studio independently accepted the exact job/scenario/checksum/dimensions/duration manifest and moved TUT-001 to `Ready for review`; private Help media inventory increased from 6 to 8 assets and no walkthrough was approved or published |
| Narration/caption source foundation | Pass: exact Cedar provenance, checksum-bound WebVTT, role-aware captions/transcript, native playback captions, disclosure, sound-off review, protected publication gate, and legacy-read compatibility are implemented and locally verified; migration not applied to a shared environment |

The first deployed Demo Preview check exposed a transient `403 Contractor context is required` from the Help search before contractor identity hydration. The candidate now waits for that identity before querying and includes a focused policy regression. The replacement exact-head Preview then loaded Service Requests with no console, page, or `4xx`/`5xx` response errors, zero horizontal overflow, and no tutorial control before publication.

## Open acceptance gates

The first credential-less run failed closed before seeding. After explicit owner approval, the existing dedicated-Demo keys were obtained through authenticated Vercel/Supabase management paths, injected only into the recorder process, and never printed or committed. Two subsequent duration checks rejected 12.72- and 13.88-second captures; the approved package preserves a four-second reading hold and passed at 15.52 seconds. Rejected captures were not promoted.

The source-readiness package remains `servsync-contractor-service-request-intake-v1-2026-08-26T21-46-53-792Z` under the private ServSync Demo Recordings library. After explicit approval to create and attach the Production request, Help Studio job `e4e6d6dc-7358-44ff-ac8b-f424ece6662e` produced the exact managed package `contractor-service-request-intake/2026-08-27T12-15-34-530Z` under the private ServSync Help Studio Recordings library. The Production-backed local authoring session used the existing platform-admin account and branch-head UI without changing a deployed environment; the ordinary PR Preview was correctly left on its Sandbox backend.

Before TUT-001 can be published:

1. Apply and verify the exact narration/caption migration in Sandbox, then Demo, then Production, with separate approval at each environment boundary.
2. Create a narrated/captioned TUT-001 replacement from the protected Demo workflow. The current silent job remains unapproved evidence and is not publication-eligible.
3. Review the full replacement at normal speed with audio and captions, verify sound-off comprehension and transcript search, then choose **Approve narration + captions** or **Return for rerecord**.
4. If the replacement is approved, obtain separate explicit owner approval before any Production publication.
5. After publication, verify Owner/Admin/Office contextual retrieval, captions, transcript, and full playback, plus denial for unintended audiences.

## Tutorial Freshness

Tutorial impact: `UPDATED`.

Tutorial evidence: Phase 0.7 verified the Production Help inventory and completed full revision 3 playback. That published Estimate tutorial remains current. TUT-001 is a new unpublished path with no matching published `contractor.service_requests` walkthrough; this slice now supplies its protected source, exact Production job binding, and managed media readiness without making it visible to ordinary users.

Affected tutorial: TUT-001 **How to handle a homeowner service request**.

The existing published **How to create an estimate**, revision 3, is not replaced or changed by this slice. Its visible workflow remains current and it stays available, but a narrated/captioned replacement is required before FB-040A is complete. TUT-001 is new and remains unpublished, so the silent source candidate does not make an incomplete tutorial visible to users.
