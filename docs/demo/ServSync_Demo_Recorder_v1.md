# ServSync Demo Recorder v1

## Purpose

The Demo Recorder creates reproducible browser recordings for ServSync Marketing, support tutorials, and product demonstrations. It is intentionally a small scenario runner, not a video editor or publishing system.

Recorder v1 includes three canonical scenarios:

`homeowner-service-request`

The clip shows the fictional Demo homeowner creating one service request for Demo Bay Home, then uses a clean hard cut to the fictional contractor's matching Service Requests view.

`contractor-create-estimate`

The clip starts from the registered Demo request, uses the normal contractor UI to create one priced draft Estimate, and stops on the saved draft. It does not send the Estimate or continue into approval, Job, Invoice, or payment activity.

`homeowner-home-history`

The clip starts from one registry-owned completed Job, opens Demo Bay Home, shows its property-scoped Home History entry, and reopens the real private finalized-report PDF. It stops on the report and does not continue into Invoice or payment activity.

## Safety Boundary

The recorder accepts only the durable ServSync Demo application origin and Supabase project `bdytwgejqnlblhrnqxkp`. It refuses Production, the shared Sandbox, and arbitrary Preview origins.

Credentials stay in process memory. Scenario definitions contain no email addresses, passwords, session tokens, service-role keys, or Vercel bypass values. The recorder uses the service role only through the existing private Demo fixture runner for exact fixture setup, ownership registration, and verification. Browser actions use normal homeowner and contractor password authentication.

Do not record Production or real customer information. Do not paste recorder credentials into commands, logs, reports, screenshots, or videos.

## Scenario Contract

The reviewable scenario definitions live at:

`scripts/demo/recorder/scenarios/homeowner-service-request.mjs`

`scripts/demo/recorder/scenarios/contractor-create-estimate.mjs`

`scripts/demo/recorder/scenarios/homeowner-home-history.mjs`

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

For `homeowner-home-history`, setup restores `home_history_updated` by uploading one generated fictional PDF through the authenticated contractor Storage path and calling the supported finalization RPC. The verifier requires one exact report document, Home History row, notification, and SHA-bound private Storage object with the canonical Demo home lineage. Browser recording is homeowner-only and read-only. Reset deletes that exact registered object before dependency-safe row cleanup; it never sweeps the bucket.

## Authentication and Cuts

The recorder authenticates the homeowner in an unrecorded browser context and carries only the in-memory Playwright storage state into the recorded context. Login screens and credentials are not recorded.

During the identity change, the recorder freezes the last homeowner frame, signs out, signs in as the contractor through the normal UI behind that frame, and removes the freeze only after the contractor request card is ready. The output therefore has a simple visual hard cut without an external media pipeline or a long portal-loading transition.

The visible pointer is a reusable DOM overlay driven by Playwright mouse movement. Captions are short, deterministic DOM overlays. The two pacing presets are `marketing` and `tutorial`.

## Command

Load the existing approved Demo variables, including the private runner values documented in [ServSync Demo Mode Runbook](ServSync_Demo_Mode_Runbook.md), then run from the repository root:

```bash
npm run demo:record -- homeowner-service-request
npm run demo:record -- contractor-create-estimate
npm run demo:record -- homeowner-home-history
```

Optional bounded controls:

```bash
npm run demo:record -- homeowner-service-request --pacing=tutorial --headed
npm run demo:record -- homeowner-service-request --output-dir="/absolute/review/path"
```

The default working output directory is `demo-recordings/`, which is ignored by Git. WebM remains the native source/master. After the WebM passes scenario, playback, duration, final-state, browser-error, and sensitive-data validation, the recorder uses the locally installed Homebrew `ffmpeg`/`ffprobe` tools to create and verify an H.264/yuv420p MP4 with the same dimensions and duration.

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

The contractor Estimate scenario additionally requires exact adoption at `estimate_draft`, one matching draft Estimate and line, zero payment-schedule/Job/Invoice descendants, and a final saved card showing the fictional customer, property, scope, and total.

The Home History scenario additionally requires exact `home_history_updated` verification, matching `home_id` on the generated document and maintenance row, one expected notification, a private PDF whose SHA matches registry evidence, property-scoped homeowner visibility, a real download, and a 12-18 second final WebM.

Failed runs remove their staging video. A failed run must not be described as a successful artifact.

## Deliberate Limits

Recorder v1 does not provide video publishing, subtitles, transitions beyond a hard cut, audio, a browser-side role switcher, a generic editing timeline, Production capture, external-provider actions, or scenarios beyond the three listed above.

Likely future scenarios include Estimate-to-Job, manual payment, and contractor discovery. Each requires its own reviewed fixture and final-state contract.
