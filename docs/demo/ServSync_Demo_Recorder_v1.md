# ServSync Demo Recorder v1

## Purpose

The Demo Recorder creates reproducible browser recordings for ServSync Marketing, support tutorials, and product demonstrations. It is intentionally a small scenario runner, not a video editor or publishing system.

Recorder v1 includes four canonical scenarios:

`homeowner-service-request`

The clip shows the fictional Demo homeowner creating one service request for Demo Bay Home, then uses a clean hard cut to the fictional contractor's matching Service Requests view.

`contractor-create-estimate`

The clip starts from the registered Demo request, uses the normal contractor UI to create one priced draft Estimate, and stops on the saved draft. It does not send the Estimate or continue into approval, Job, Invoice, or payment activity.

`homeowner-home-history`

The clip starts from one registry-owned completed Job, opens Demo Bay Home, shows its property-scoped Home History entry, and reopens the real private finalized-report PDF. It stops on the report and does not continue into Invoice or payment activity.

`servsync-platform-introduction`

The 71-second flagship clip combines brand-neutral opening graphics with real dedicated-Demo product frames. It truthfully presents contractor-created Discover content, a contractor profile, the homeowner-controlled connection prompt, a separate Service Request, an accepted Estimate, a completed Job, a canonical draft Invoice, Home History, the finalized ServSync report, and the public beta signup screen. The connection prompt is demonstrated without submitting a new connection, and the Invoice is not sent or paid.

## Safety Boundary

The recorder accepts only the durable ServSync Demo application origin and Supabase project `bdytwgejqnlblhrnqxkp`. It refuses Production, the shared Sandbox, and arbitrary Preview origins.

Every recorder navigation adds the exact query `servsync-presentation=recorder-v1`. The application honors it only when the dedicated-Demo public environment/project checks also pass. The query is not persisted and grants no role, capability, data access, or server authority. Ordinary Demo visits omit it and retain the same core workflow presentation as Production.

Credentials stay in process memory. Scenario definitions contain no email addresses, passwords, session tokens, service-role keys, or Vercel bypass values. The recorder uses the service role only through the existing private Demo fixture runner for exact fixture setup, ownership registration, and verification. Browser actions use normal homeowner and contractor password authentication.

Do not record Production or real customer information. Do not paste recorder credentials into commands, logs, reports, screenshots, or videos.

## Scenario Contract

The reviewable scenario definitions live at:

`scripts/demo/recorder/scenarios/homeowner-service-request.mjs`

`scripts/demo/recorder/scenarios/contractor-create-estimate.mjs`

`scripts/demo/recorder/scenarios/homeowner-home-history.mjs`

`scripts/demo/recorder/scenarios/servsync-platform-introduction.mjs`

It defines:

- the private fixture scenario and initial/final checkpoints;
- the exact Demo project and durable application origin;
- fictional identities, property, and request values;
- 1440x900 viewport;
- two scene captions;
- duration bounds;
- final-state expectations;
- output filename prefix.

This is a JavaScript data contract, not a general workflow DSL. Future scenarios should remain explicit and bounded.

## Fixture Lifecycle

Before recording, the harness invokes the existing private runner at `connected_request_ready`. That runner reconciles prior registered scenario runs, preserves the revision-backed canonical property graph, and creates an active fictional connection with no request.

The homeowner then creates the request through the normal `servsync_create_service_request` product RPC. A narrow fixture adoption operation accepts only one exact new request when all of these match the active run:

- homeowner;
- contractor;
- connection;
- home;
- request category, urgency, title, and description;
- creation after the verified setup run;
- no linked Estimate or Job.

The operation registers the request and its exact messages, advances the run to `request_ready`, and runs the ordinary checkpoint verifier. It does not broaden the reset table allowlist or delete by title, user, or timestamp.

One verified final fixture remains after a successful recording: `request_ready` for the homeowner request scenario, `estimate_draft` for the contractor scenario, or `home_history_updated` for the Home History scenario. The next run removes only registry-owned disposable records and the exact registered private report object before rebuilding the known baseline. Unrelated Demo records and Storage objects are never reset.

If the browser fails after submission begins but before ordinary adoption completes, failed-run cleanup attempts the same exact adoption contract. It does not broaden ownership or perform a title-, user-, or timestamp-based delete; a request that cannot satisfy the exact contract remains fail-closed for operator investigation.

For `contractor-create-estimate`, setup restores the registered `request_ready` checkpoint. The contractor creates the draft through the real Estimate composer. The private adoption step accepts exactly one new draft only when its contractor, homeowner, home, request, title, scope, total, and single line match the scenario contract and it has no payment schedule, Job, or Invoice. The adopted Estimate and line become ordinary registry-owned records at `estimate_draft`, so the next scenario run can reset them without touching unrelated Demo data.

For `homeowner-home-history`, setup stops at the registry-owned `job_completed` checkpoint. In an offscreen contractor browser context, the recorder opens that exact Job and uses the normal **Finalize Report** product action. The application calls the canonical `generateInspectionPdf` generator, uploads the resulting customer report through the normal private Storage path, and calls `servsync_finalize_field_work`. The private runner then adopts only the exact resulting document, Home History row, notification, and SHA-bound Storage object before homeowner recording begins. Direct seeding of `home_history_updated` is refused so Marketing cannot substitute a fixture-only PDF for the product artifact.

For `servsync-platform-introduction`, setup first registers exactly five contractor-created Discover posts and the fictional contractor profiles needed to display them. The browser opens the real profile and connection prompt but does not submit a connection. Later registered checkpoints supply the already-connected Service Request and accepted Estimate story. The recorder finalizes the exact completed Job through the normal UI, creates one canonical draft Invoice through the existing Job billing RPC, and adopts the exact finalized report lineage. The reset allowlist covers only those registered Discover, Invoice, and report records in dependency-safe order.

If finalization is interrupted after upload but before any durable report lineage exists, recovery inspects only the exact registry-owned Demo Job folder and may remove only UUID-named PDF objects from that folder. Any report path, document row, or Home History row makes cleanup fail closed for operator review. Normal reset deletes only the exact registered object before dependency-safe row cleanup; it never sweeps the bucket.

Fixture data may be fictional, but visible product output must be canonical. Marketing-ready scenarios must use the same Estimate, Invoice, report, Home History artifact, and profile UI produced by the normal supported product workflow. Bespoke PDFs, documents, or UI made only for a recording are prohibited.

## Authentication and Cuts

The recorder authenticates the homeowner in an unrecorded browser context and carries only the in-memory Playwright storage state into the recorded context. Login screens and credentials are not recorded.

During the identity change, the recorder freezes the last homeowner frame, signs out, signs in as the contractor through the normal UI behind that frame, and removes the freeze only after the contractor request card is ready. The output therefore has a simple visual hard cut without an external media pipeline or a long portal-loading transition.

The visible pointer is a reusable DOM overlay driven by Playwright mouse movement. Captions are short, deterministic DOM overlays. The two pacing presets are `marketing` and `tutorial`. Marketing pacing uses cubic ease-in/out pointer travel, 0.7/1.1/1.5-second distance bands, a 550 ms settle before each click, a 900 ms result pause, 75 ms-per-character visible typing, and a 3.2-second neutral-cursor final hold. Scenario-specific reading holds may add time where the result needs it; they must not replace the shared pacing contract.

## Command

Load the existing approved Demo variables, including the private runner values documented in [ServSync Demo Mode Runbook](ServSync_Demo_Mode_Runbook.md), then run from the repository root:

```bash
npm run demo:record -- homeowner-service-request
npm run demo:record -- contractor-create-estimate
npm run demo:record -- homeowner-home-history
npm run demo:record -- servsync-platform-introduction
```

Optional bounded controls:

```bash
npm run demo:record -- homeowner-service-request --pacing=tutorial --headed
npm run demo:record -- homeowner-service-request --output-dir="/absolute/review/path"
```

Help Studio recording requests use the same recorder through one enforced profile:

```bash
npm run help:record -- "/absolute/path/to/help-recording-spec.json"
```

`servsync-human-paced-v1` is shared with Marketing pacing. Its baseline is 700/1100/1500 ms cursor travel, 550 ms settle-before-click, 900 ms post-click hold, 75 ms per typed character, 1300 ms initial hold, at least 3200 ms final hold, and cubic ease-in-out cursor interpolation. A successful Help run preserves the validated WebM and creates a Help-ready MP4, poster, and allowlisted metadata package under `~/Documents/Codex/ServSync Help Studio Recordings/<scenario>/<timestamp>/`. It never uploads by itself; Help Studio separately binds the package to the exact persisted recording request before private managed ingestion.

The default working output directory is `demo-recordings/`, which is ignored by Git. WebM remains the native source/master. After the WebM passes scenario, playback, duration, final-state, browser-error, and sensitive-data validation, the recorder uses the locally installed Homebrew `ffmpeg`/`ffprobe` tools to create and verify an H.264/yuv420p MP4 with the same dimensions and duration. The package begins with `pacing_review: pending`; technical validation alone does not make it a Marketing asset.

The approved package is then promoted to the durable owner library:

`~/Documents/Codex/ServSync Demo Recordings/<scenario>/`

Each timestamped package contains:

- `.webm`: canonical Playwright source/master;
- `.mp4`: broadly compatible distribution copy for marketing, tutorials, Canva, social platforms, and web upload;
- `.json`: allowlisted provenance with scenario, recording version, timestamp, source Git commit, Demo environment, viewport, duration, filenames, validation status, and sensitive-data result.

Promotion fails closed. Conversion and media validation happen in a staging directory, and no durable package is copied into the scenario directory until every artifact passes. If MP4 conversion fails, the validated working WebM/metadata remain available for diagnosis, but the run does not report a complete durable package. Timestamped filenames are never overwritten.

Open the owner library in Finder with:

```bash
open "$HOME/Documents/Codex/ServSync Demo Recordings"
```

Use MP4 for distribution and WebM as the original source.

After watching the complete MP4 at normal speed and confirming all eight pacing criteria, record the explicit local Marketing review:

```bash
npm run demo:approve-marketing -- "/absolute/path/to/recording.json" --confirm=human-paced-1x-review-passed
```

The command rechecks package paths, hashes, codec, dimensions, duration, Demo provenance, technical validation, and the sensitive-data result before atomically recording the pacing decision. It never uploads media or approves Marketing Content.

## Validation

A run is successful only after:

- setup reaches the exact initial checkpoint;
- both identities authenticate;
- the request is created through the UI;
- exact fixture adoption reaches `request_ready`;
- the contractor card shows the expected request, homeowner, and Demo home;
- visible text contains no configured email/password or token-like marker;
- no page error, console error, or HTTP 5xx is observed;
- the WebM exists and is non-empty;
- Chromium decodes it and reports a duration inside the scenario bounds.
- `ffprobe` confirms the source dimensions and duration;
- `ffmpeg` creates an H.264/yuv420p MP4 without resizing;
- `ffprobe` confirms the MP4 dimensions and duration still match the source;
- WebM, MP4, and allowlisted metadata promote together into the scenario's durable owner-library directory.
- a separate normal-speed review confirms followable cursor motion, visible click intent, understandable UI changes, natural speed/motion, readable text, sufficient reading holds, and an obvious final result before `marketing_candidate_status` may become `passed`.

The contractor Estimate scenario additionally requires exact adoption at `estimate_draft`, one matching draft Estimate and line, zero payment-schedule/Job/Invoice descendants, and a final saved card showing the fictional customer, property, scope, and total.

The Home History scenario additionally requires exact `home_history_updated` verification, matching `home_id` on the generated document and maintenance row, one expected notification, a private PDF whose SHA matches registry evidence, canonical report text extracted from the downloaded PDF, property-scoped homeowner visibility, a real download, and an 18-32 second final WebM.

The flagship scenario additionally requires exactly five registered contractor-created Discover posts, the real profile and connection prompt without a new connection submission, one canonical draft Invoice, exact canonical report lineage, all scene captures free of page/console/HTTP errors, and a 65-80 second final WebM. Its approved storyboard and narration boundary are recorded in [ServSync Flagship Introduction Video v2](ServSync_Flagship_Intro_Video_v2.md).

Failed runs remove their staging video. A failed run must not be described as a successful artifact.

## Deliberate Limits

Recorder v1 does not provide video publishing, subtitles, a browser-side role switcher, a generic editing timeline, Production capture, or external-provider actions. The flagship's Cedar narration is a separate local owner-review derivative; the recorder continues to preserve a silent source/master and does not upload or publish audio.

Any future scenario requires its own reviewed fixture and final-state contract.
