# Capture existing fictional Demo records

`npm run demo:capture-existing` records real browser navigation and scrolling through an existing request and confirmed appointment. It does not run the fixture recorder, seed/reset data, submit a request, propose a visit, or accept an appointment.

## Requirements and use

Use the repository's installed Playwright Chromium plus `ffmpeg` and `ffprobe` on PATH. The command does not install tools or request OS screen-recording permissions. Only the browser viewport is recorded; no desktop, other apps, notifications, or microphone are captured.

```sh
npm run demo:capture-existing -- \
  --role=homeowner \
  --request-id=EXISTING_FICTIONAL_REQUEST_UUID \
  --appointment-id=EXISTING_CONFIRMED_APPOINTMENT_UUID \
  --fictional-demo-confirmed \
  --output-dir=demo-recordings/capture-only \
  --login-timeout-seconds=900
```

Sign in directly to the matching Demo account in the new Google Chrome for Testing window. Do not send credentials to an agent. Sign-in is unrecorded. When the dashboard appears, the recorder closes that window and continues in fresh ephemeral contexts using only the session kept in memory. It closes its browser when finished. Existing Safari tabs, zoom, sessions, and other applications are untouched.

The role can also be `contractor`, but only the homeowner route has been verified against live Demo. The selected request must be returned by the role's normal request query, contain a fictional/Demo-test marker, and have the exact confirmed appointment. Confirm that all visible account content is fictional before using this mode. It does not anonymize a real account.

## Scope and safeguards

- Exact app origin: `https://servsync-demo.vercel.app`; exact isolated Demo API project: `bdytwgejqnlblhrnqxkp`.
- No `.env`, Safari profile, credential file, service key, fixture runner, or saved storage state is loaded. Password/token sign-in traffic is allowed only during the unrecorded handoff; auth refresh is blocked during capture.
- Data writes, arbitrary RPCs, external origins/navigation, file URLs, service workers, downloads, WebSockets, and provider traffic are blocked. Reviewed query RPC POSTs are converted to PostgREST GET requests, which use read-only transactions. This is a client capture guard; it changes no server permissions.
- A server 401/403 stops the run at an access checkpoint. No automatic retry or alternate access route is attempted. A failed run deletes its candidate recording. Login timeout is bounded (30–1800 seconds).
- Read-only preflight verifies the target before filming. After filming, the exact request response hash must still match. The recorder creates a silent H.264 MP4 and verifies duration, full decode, and changing frames before retaining a candidate.

The output directory contains a unique `.capture-*` folder with `capture.mp4`, `confirmation.png`, and a sanitized `manifest.json`. The manifest includes target IDs, media hash/metadata, unchanged-request evidence, and guard counters. Tokens, passwords, raw network bodies, and sessions are not logged or saved. Retained media is for review; this command does not upload, approve, schedule, or publish it.

## Evidence and limitations

The October 18, 2026 live homeowner run captured the existing fictional “AC runs, but the house is not cooling” request and confirmed appointment. It produced 23.4 seconds, 1440×1000 at 25fps, 1,865,258 bytes, no audio, a successful complete decode, and 12 changing pairs among 94 sampled frames. SHA-256: `458565f9ad4aa556b6aaa4b55d4ae54321f279910fe8caadf16d26e397154137`. The request hash was unchanged; no server access denial occurred. Some optional property/help/invitation queries and analytics/realtime traffic were deliberately blocked; the selected request still rendered correctly. These guards should not be broadened merely to eliminate optional request errors.

The earlier native Screenshot attempt failed when the tool kernel exited with signal 9 after approximately 70 minutes. It returned no permission denial or recording confirmation. The underlying tool failure is unresolved; it does not establish that macOS recording permission was missing. This implementation records the app's browser viewport using the existing project recorder dependency.

Full decode, frame-change analysis, and the separate confirmation screenshot verify technical capture. Continuous playback review has not been performed. The earlier browser `file://` playback denial remains in force; do not work around it through another browser, relay, or protocol. This clip is a read-only revisit, not a replay of request submission or appointment acceptance. Future unattended runs still need separately authorized authentication; this command intentionally retains no session.

## Tests

```sh
npm run test:demo-recorder
npm run test:demo-capture:browser
```

The browser integration test uses explicitly synthetic HTML and intercepts all traffic locally. It verifies real browser motion, GET conversion, and blocked writes without contacting live services. Its generated video is test evidence, not a ServSync product demonstration.
