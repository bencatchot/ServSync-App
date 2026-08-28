# ServSync FB-040A Tutorial Readiness Acceptance

Status: Corrected exact-label TUT-001 published and live-verified; reusable source PR #523 merged

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
- The owner completed the corrected package's narration-and-caption approval after product-truth review and then separately published the approved revision through Help Studio.
- The owner established voiceover, synchronized captions, and a matching durable transcript as the protected tutorial standard, then approved reuse of the existing Marketing configuration: OpenAI `gpt-4o-mini-tts` with Cedar and the exact disclosure **AI-generated voiceover using OpenAI's Cedar voice.** Bounded narration preparation is authorized; runtime generation, provider/secret changes, schema/storage rollout, approval of the silent package, and publication are not.
- The owner separately approved implementation and rollout of the Help narration/caption foundation in PR #522, then explicitly approved a temporary, speech-only OpenAI key for each bounded Cedar package. The corrected key made exactly one `gpt-4o-mini-tts` request and was manually revoked after automated revocation did not persist; the active-key list returned to the three pre-existing keys. No provider credential was printed by the packaging process or persisted in ServSync, Vercel, Supabase, the artifact manifest, or the repository. Source merge and manual deployment remain separate decisions.

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
| Production publication | Pass: TUT-001 is published as **How to handle a homeowner service request**, revision 1; Help Studio shows two published walkthroughs, zero unpublished walkthroughs, and 12 private media assets |
| Published package playback | Pass: the published 15.641-second video grant loads, English captions are enabled through a protected `blob:https://servsync.app/...` URL, the exact transcript expands, the Cedar disclosure renders, and all visible instructions retain **Create Estimate** |
| Live contractor Owner context | Pass in approved read-only Production smoke run `33119867072`: the actual `contractor.service_requests` page exposed the contextual tutorial; secure video, protected captions, transcript, exact-label assertion, closeout, remaining contractor navigation, homeowner read-only smoke, and Production public smoke all passed without business-data mutation |
| Published role boundary | Pass: immutable revision 1 includes exactly Owner, Admin, and Office; Field Technician, Viewer, and Homeowner are excluded. The deployed role resolver returns only when the session-derived contractor role appears in that array. A live Owner UI path passed; separate Production Admin/Office credentials are not provisioned, so their equivalent UI replay was not repeated |

The first Sandbox application attempt failed transactionally before DDL because the deployed Supabase projects expose trusted `pgcrypto.digest` through the `extensions` schema. A read-only query confirmed the caption foundation remained absent. The corrected source and local harness use that deployed contract; the exact corrected migration then installed once and the repeat-install guard refused a second application.

The first deployed Demo Preview check exposed a transient `403 Contractor context is required` from the Help search before contractor identity hydration. The candidate now waits for that identity before querying and includes a focused policy regression. The replacement exact-head Preview then loaded Service Requests with no console, page, or `4xx`/`5xx` response errors, zero horizontal overflow, and no tutorial control before publication.

## Open acceptance gates

The first credential-less run failed closed before seeding. After explicit owner approval, the existing dedicated-Demo keys were obtained through authenticated Vercel/Supabase management paths, injected only into the recorder process, and never printed or committed. Two subsequent duration checks rejected 12.72- and 13.88-second captures; the approved package preserves a four-second reading hold and passed at 15.52 seconds. Rejected captures were not promoted.

The source-readiness package remains `servsync-contractor-service-request-intake-v1-2026-08-26T21-46-53-792Z` under the private ServSync Demo Recordings library. After explicit approval to create and attach the Production request, Help Studio job `e4e6d6dc-7358-44ff-ac8b-f424ece6662e` produced the exact managed package `contractor-service-request-intake/2026-08-27T12-15-34-530Z` under the private ServSync Help Studio Recordings library. The Production-backed local authoring session used the existing platform-admin account and branch-head UI without changing a deployed environment; the ordinary PR Preview was correctly left on its Sandbox backend.

## Publication closeout

TUT-001 publication and live Owner-path verification are complete. The immutable published audience is exactly Owner/Admin/Office, with Field Technician, Viewer, and Homeowner excluded through the same deployed session-derived role resolver. Separate Admin/Office Production credentials are not provisioned, so exact deployed policy correspondence—not additional live sign-ins—is the evidence basis for those two equivalent allowed roles.

The reusable narration-packaging source and permanent Production smoke regression merged normally through PR #523 at main commit `6091ea58c4eb22ee6eb39dd9e050de1d68f19190`. That merge did not change the already published media. TUT-003 is the next separately bounded tutorial slice.

## TUT-003 runtime gate

PR #524 merged normally at main commit `7328548e36881d74e02192b37e45332a12db33f4`, and the durable Demo Production deployment reached Ready. The first post-merge protected run authenticated, seeded only the registered fixture, created the exact Job through the UI, recorded all five **Approved Scope** findings as **Fixed On Site**, and completed the visit and Job. Exact adoption then failed closed because all five Estimate-derived durable billable work items remained `open`; no artifact was promoted.

The bounded correction synchronizes only the exact Job's `unbilled`, Estimate-derived work items, maps duplicate titles deterministically, preserves existing completion provenance, and leaves drafted/invoiced, unrelated-Job, and simple-task rows untouched. The next acceptance gate is normal review/merge and durable Demo deployment of that correction, followed by a complete protected TUT-003 rerun through finalized report and Home History.

Tutorial impact for this correction: `NONE`.

Tutorial evidence: Production Help Studio searches for `complete work`, `approved estimate`, and `contractor.work` returned no walkthrough. Preview of the related published **How to create an estimate**, revision 3, confirmed that its three steps end at Estimate creation and do not cover accepted-Estimate Job completion.

Affected tutorials: None. TUT-003 remains unpublished.

### Second protected rerun

PR #525 merged normally at main commit `e9123800ca6b3018e7d48f35b0ad1a09557262b6`; ServSync Production, durable Demo, and Stripe Sandbox automatic deployments all completed successfully. The owner-requested durable Demo rerun used the previously approved dedicated credentials only in the child process and touched only the exact registered fixture.

The work-item correction behaved as designed for four **Approved Scope** findings. The fifth checkbox change overlapped the preceding autosave: the guarded save refused concurrency, but the autosave callback still recorded that skipped attempt as persisted. The fifth finding remained **Monitor**, its durable Estimate-derived item remained `open`, and **Complete Job** opened the intentional incomplete-work confirmation. The recorder failed closed while waiting for completion feedback. Exact run `cb53b40d-95fb-4bfe-8b11-f4585b1281cc` remains at `job_scheduled` with one scheduled visit, four completed work items, one open work item, no finalized report, and no promoted artifact.

The bounded correction returns explicit non-success for a skipped guarded save and retries the current field-work state instead of marking it persisted. Focused autosave/work-item, Demo-recorder, architecture, typecheck, exact App-size, and diff-hygiene gates pass locally. Normal review/merge and durable Demo deployment remain required before the next protected rerun.

Tutorial impact for the autosave correction: `NONE`.

Tutorial evidence: Production Help Studio searches for `job progress`, `work items`, `contractor.work`, and `complete job` returned no walkthrough.

Affected tutorials: None. TUT-003 remains unpublished.

### Third protected rerun

PR #526 merged normally at main commit `fce2c7ea1413421fb851d0aead117cc402e793f2`. GitHub/Vercel recorded the exact durable Demo Production deployment successful at `2026-08-28T14:26:23Z`, and the durable alias returned HTTP 200 before recording began.

The protected workflow reset and seeded only its registered fixture, authenticated through the dedicated Demo recorder account, created the exact Job through the UI, and failed closed while waiting for Job-completion feedback. Exact run `6e31ee0d-1347-4d76-8ee1-ffcc49d94945` remained at `job_scheduled`: four findings and durable work items were complete, while **Supply and install new 40-gallon water heater** remained **Monitor** and its item remained `open`. No artifact was promoted.

A bounded same-fixture check then addressed that missing checkbox by its exact accessible label, waited for Save to be enabled, and saved through the deployed UI. The finding and its exact durable work item both became complete. This proves the merged application correction is operating and isolates the remaining failure to the recorder's live positional checkbox iteration across intervening re-renders. The bounded recorder correction snapshots stable work titles, targets each exact labeled checkbox, verifies every click, refuses Save if any item is unchecked, and waits for Save availability. Normal review/merge is required before the next provenance-valid protected rerun.

Tutorial impact for the recorder correction: `NOT APPLICABLE`.

Tutorial evidence: TUT-003 remains unpublished, and the correction changes protected recording automation only; it does not change a user-visible route, label, control, workflow order, role boundary, or outcome.

Affected tutorials: None.

### Fourth protected rerun

PR #527 merged normally at main commit `4de13e96f054f6b1700f87b5c9dc262169752e38`. All three automatic deployments completed successfully, and durable Demo returned HTTP 200 before the recorder started.

Exact protected run `ae5d8b1e-e971-46ee-8ee5-c17a2850fa9d` reset and seeded only the registered fixture, authenticated, created the exact Job, and then failed closed at PR #527's new checked-state guard. The first approved item reached **Fixed On Site**/`completed`; the remaining four stayed **Monitor**/`open`, the visit and Job stayed `scheduled`, and no artifact was promoted.

Stable-title lookup identified the correct second checkbox, but the final raw coordinate activation occurred after the human-paced settling delay. An intervening React update can replace or move the checkbox after its bounding box is captured, causing that coordinate click to miss. The bounded correction preserves human cursor interpolation and settling, then activates the re-resolved live locator through Playwright's actionability checks. A focused source contract prevents returning to `page.mouse.click` in the shared human-paced helper.

Tutorial impact for the actionable-click correction: `NOT APPLICABLE`.

Tutorial evidence: The change affects protected recorder activation and planning evidence only. TUT-003 remains unpublished, and no app route, label, control, workflow, role boundary, outcome, or published tutorial changes.

Affected tutorials: None.

### Fifth protected rerun

PR #528 merged normally at main commit `719c02d550bef8ef5178831fef8d285f759dfbfc`. Production, durable Demo, and Stripe Sandbox automatic deployments completed successfully, and durable Demo returned HTTP 200 before the recorder started.

Exact protected run `2336a05e-b89f-4df4-90d8-bfeab2c7d75c` reset and seeded only the registered fixture, authenticated, created the exact Job, completed all five approved work items, completed the visit and Job, and finalized the report through the normal product UI. Exact post-run verification passed at `home_history_updated`: the Job is `completed`, all five durable work items are `completed`, and exactly one report document, one Home History row, one notification, and the registered private report lineage exist.

The recorder still promoted no artifact because the final aggregate text assertion required the transient **Report finalized** action feedback after the slower private report-adoption step. The recorder had already waited for that exact test-id when UI finalization succeeded. The bounded correction verifies its expected title at that moment, then treats the held final scene as persistent evidence: exact Job title, homeowner, saved completion note, and **Filed to Documents**. Any future failure names the missing persistent value instead of returning a generic final-scene error.

Tutorial impact for the final-scene proof correction: `NOT APPLICABLE`.

Tutorial evidence: The change affects protected recorder validation and planning evidence only. TUT-003 remains unpublished, and no app route, label, control, workflow, role boundary, outcome, or published tutorial changes.

Affected tutorials: None.

## Tutorial Freshness

Tutorial impact: `UPDATED`.

Tutorial evidence: The first narrated/captioned TUT-001 package failed owner product-truth review because the voice said “Start estimate” while the visible control says **Create Estimate**. The corrected package is now published as revision 1 with the screen, recorder callout, voice, captions, transcript, and Service Requests contextual entry aligned on the exact label. Live Production Owner retrieval/playback passed, and the immutable audience is exactly Owner/Admin/Office with unintended roles excluded.

Affected tutorial: TUT-001 **How to handle a homeowner service request**.

The existing published **How to create an estimate**, revision 3, is not replaced or changed by this slice. Its visible workflow remains current and it stays available, but a narrated/captioned replacement is required before FB-040A is complete. TUT-001 has since completed its corrected narration/caption review, explicit publication, and live contextual verification as Production revision 1; the preserved silent source candidate remains non-public evidence.
