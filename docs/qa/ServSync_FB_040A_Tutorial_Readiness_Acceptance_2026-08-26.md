# ServSync FB-040A Tutorial Readiness Acceptance

Status: Corrected exact-label TUT-001 package owner-approved; Production publication not authorized or completed

Date: 2026-08-27

Branch: `codex/fb-040a-tut-001-narrated-replacement`

Base: merged PR #522 main commit `cae7b0bf061e3eee25532f648754b1e23d98ed13`

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
- The explicitly approved corrected flow returned the mismatched job for rerecord, created one additional Production Help recording request, made one bounded OpenAI Cedar speech request, and attached one corrected narrated MP4 plus poster and immutable WebVTT/transcript metadata. It changed no Production business record, authentication, role, permission, environment setting, walkthrough approval, or publication state.
- The owner completed the corrected package's narration-and-caption approval after product-truth review. Production publication remains a separate owner decision through the existing Help Studio flow.
- The owner established voiceover, synchronized captions, and a matching durable transcript as the protected tutorial standard, then approved reuse of the existing Marketing configuration: OpenAI `gpt-4o-mini-tts` with Cedar and the exact disclosure **AI-generated voiceover using OpenAI's Cedar voice.** Bounded narration preparation is authorized; runtime generation, provider/secret changes, schema/storage rollout, approval of the silent package, and publication are not.
- The owner separately approved implementation and rollout of the Help narration/caption foundation in PR #522, then explicitly approved a temporary, speech-only OpenAI key for each bounded Cedar package. The corrected key made exactly one `gpt-4o-mini-tts` request and was manually revoked after automated revocation did not persist; the active-key list returned to the three pre-existing keys. No provider credential was printed by the packaging process or persisted in ServSync, Vercel, Supabase, the artifact manifest, or the repository. Production publication, merge, and manual deployment remain separate decisions.

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
| Narration/caption Sandbox foundation | Pass: exact 621-line SHA-256 `11e3f5efa5c71c9781880d030ec32ed0e13a4a24840997db166d12b284d5e496` applied once to Sandbox at PR head `8b7022e1d7bd705c65363d3ba89f533bf1452320`; nine columns, six constraints, eight secured functions, grants, role denial, repeat refusal, and zero-data preservation verified |
| Narration/caption Demo foundation | Pass: the same exact migration applied once to Demo at PR head `f716b40f136d48a19028d4ba1978c821122fde33`; catalog/security matched Sandbox and exact Help, Marketing, Demo Recorder, and Storage counts/fingerprints matched preflight |
| Narration/caption Production foundation | Pass: the same exact migration applied once to Production at PR head `09151d77c3b98871d5b192d12f599be4e4f283a0`; three existing revisions remained legacy-compatible, published Estimate revision 3 retrieved through a real contractor owner, silent TUT-001 remained unapproved, and every captured Help/Marketing/Storage/business/Auth count and fingerprint matched preflight |
| Production-to-Demo parity | Help aligned: all 26 staged Help differences cleared. One separate pre-existing `demo-scenario-infrastructure-v1` catalog fingerprint mismatch retains exact expected object counts and key fingerprint and was not touched by this migration |
| Replacement protected Demo recording | Pass at source `cae7b0bf061e3eee25532f648754b1e23d98ed13`: 17.12-second 1440×900 H.264 silent master, `servsync-human-paced-v1`, current Service Requests/Work navigation, passed technical and sensitive-data validation |
| Replacement final Demo checkpoint | Pass at exact `request_ready`: one Request/message, one connection/home/room/asset, and zero Estimate, Job, Invoice, payment, Home History, report-document, or report-notification records; zero unresolved or zero-record recorder runs |
| Cedar narration package | Pass: one OpenAI `gpt-4o-mini-tts` request with Cedar produced 14.712 seconds of narration from script SHA-256 `ecf436142c9e8f9552d00a19e0b909a8a845c8b1ac46c763936874a53005117d`; narration begins at 0.75 seconds and leaves a 1.658-second final review hold |
| Narrated package provenance | Pass: 17.134-second H.264/AAC MP4 SHA-256 `0f3978f37335896b980958d04c93c489ae85a2e15f2f51f5ff5136f8fb54511b`, poster SHA-256 `34ab3c07464d80de02e5df6fea97563cb9afb58e54a0dfff1736028d0bdd49ef`, WebVTT SHA-256 `c97bb5191e8df6273150bfda84eea966edf8546669bce3285a147937b26e5097`, and immutable silent-source SHA-256 `51c902a15d727a7af591298b56948712d7d0852ce038337124b8b9480b960bd2` |
| Narrated Production managed ingestion | Pass: Help Studio job `2d989ced-6afd-4976-9977-2af4b4aede3c` independently accepted the exact job/scenario/files/checksums/dimensions/duration/provenance and moved to `Ready for review`; private Help media inventory increased from 8 to 10; the old silent job remains evidence only |
| Narrated Help technical review | Pass: complete playback ended at `1x`, visible English captions matched the three-sentence transcript, the exact Cedar disclosure rendered, and browser error logs remained empty |
| Narrated Help product-truth review | **Fail:** the visible control says **Create Estimate**, while the narration said “Start estimate.” The final recorder callout used the same generic wording. The owner identified the mismatch; job `2d989ced-6afd-4976-9977-2af4b4aede3c` remains unapproved and must be returned for rerecord |
| Corrected protected Demo recording | Pass at source `2cff9f6d5c7323d8332544309f5683ff9e331357`: 15.641-second 1440×900 H.264 silent master, exact **Create Estimate** final recorder callout, human-paced profile, passed technical and sensitive-data validation |
| Corrected final Demo checkpoint | Pass at exact `request_ready`: one Request/message, one connection/home/room/asset, and zero Estimate, Job, Invoice, payment, Home History, report-document, or report-notification records; zero unresolved or zero-record recorder runs |
| Corrected Cedar package | Pass: one OpenAI `gpt-4o-mini-tts` request with Cedar produced 12.864 seconds of narration; narration begins at 0.75 seconds and leaves a 1.986-second final quiet hold. The script, WebVTT, transcript, screen control, and recorder callout all use **Create Estimate** and contain no “Start estimate” instruction |
| Corrected narrated provenance | Pass: 15.641-second H.264/AAC MP4 SHA-256 `5fddd844389082f79e0ba9d003a4e6ea0e1b79738b4bc7194c68f390a21924d8`, poster SHA-256 `7446c856c2f40e98e2aaf02167196a942b90039ca0e74ef20a9715d47f769922`, WebVTT SHA-256 `4ec79cf2d6b3e4a106622d5b4ac42f2af966e49c0b75c4f1d8b5e984b4e3902e`, metadata SHA-256 `a3d04330a0f36a2004b13549936da82cf67796b42866e495afce975e6bf1c038`, and immutable silent-source SHA-256 `1fd50e89a7a51c964491fb1cf6522f6a3e2291ad7d05352dff24a322b1f9af69` |
| Corrected Production managed ingestion | Pass: Help Studio job `58cdc275-86bb-4925-b60f-5ff3e2b70d51` accepted the narrated MP4/poster/WebVTT/metadata package and moved to `Ready for review`; private Help media increased from 10 to 12 assets; neither candidate was approved or published |
| Corrected Help technical review | Pass: full playback completed at `1x`; English captions were enabled and visibly synchronized; transcript and Cedar disclosure rendered; screen, callout, captions, transcript, and narration use the exact **Create Estimate** label. A caption-visible replay confirmed the workflow remains understandable without relying on narration |
| Corrected owner product-truth decision | **Approved:** the owner approved narration and captions for job `58cdc275-86bb-4925-b60f-5ff3e2b70d51`; Help Studio now exposes `Publish for Help`. No publication occurred |

The first Sandbox application attempt failed transactionally before DDL because the deployed Supabase projects expose trusted `pgcrypto.digest` through the `extensions` schema. A read-only query confirmed the caption foundation remained absent. The corrected source and local harness use that deployed contract; the exact corrected migration then installed once and the repeat-install guard refused a second application.

The first deployed Demo Preview check exposed a transient `403 Contractor context is required` from the Help search before contractor identity hydration. The candidate now waits for that identity before querying and includes a focused policy regression. The replacement exact-head Preview then loaded Service Requests with no console, page, or `4xx`/`5xx` response errors, zero horizontal overflow, and no tutorial control before publication.

## Open acceptance gates

The first credential-less run failed closed before seeding. After explicit owner approval, the existing dedicated-Demo keys were obtained through authenticated Vercel/Supabase management paths, injected only into the recorder process, and never printed or committed. Two subsequent duration checks rejected 12.72- and 13.88-second captures; the approved package preserves a four-second reading hold and passed at 15.52 seconds. Rejected captures were not promoted.

The source-readiness package remains `servsync-contractor-service-request-intake-v1-2026-08-26T21-46-53-792Z` under the private ServSync Demo Recordings library. After explicit approval to create and attach the Production request, Help Studio job `e4e6d6dc-7358-44ff-ac8b-f424ece6662e` produced the exact managed package `contractor-service-request-intake/2026-08-27T12-15-34-530Z` under the private ServSync Help Studio Recordings library. The Production-backed local authoring session used the existing platform-admin account and branch-head UI without changing a deployed environment; the ordinary PR Preview was correctly left on its Sandbox backend.

Before TUT-001 can be published:

1. Obtain separate explicit owner approval for Production publication of approved job `58cdc275-86bb-4925-b60f-5ff3e2b70d51`.
2. After publication, verify Owner/Admin/Office contextual retrieval, captions, transcript, full playback, and denial for unintended audiences.
3. Merge the reusable narration-packaging source only after ordinary PR review; merge does not publish the media.

## Tutorial Freshness

Tutorial impact: `UPDATE REQUIRED`.

Tutorial evidence: The first narrated/captioned TUT-001 package failed owner product-truth review because the voice said “Start estimate” while the visible control says **Create Estimate**. The owner approved corrected job `58cdc275-86bb-4925-b60f-5ff3e2b70d51`, whose screen, recorder callout, voice, captions, and transcript use the exact label. It remains unpublished, so `contractor.service_requests` still has no ordinary-user walkthrough. The next gate is separate Production publication approval followed by post-publication role-aware verification.

Affected tutorial: TUT-001 **How to handle a homeowner service request**.

The existing published **How to create an estimate**, revision 3, is not replaced or changed by this slice. Its visible workflow remains current and it stays available, but a narrated/captioned replacement is required before FB-040A is complete. TUT-001 is new and remains unpublished, so the silent source candidate does not make an incomplete tutorial visible to users.
