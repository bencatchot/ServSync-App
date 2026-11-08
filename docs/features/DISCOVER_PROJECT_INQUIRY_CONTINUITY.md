# Public project inquiry continuity

Date: November 8, 2026. Branch: `codex/discover-project-inquiry-continuity`, based on `4d74239`.

## Scope and behavior

This is an additive entry into the existing connection and service-request flows. Current main already has public posts/profiles, contractor discovery, contextual connection requests, per-property consent, and ongoing service workflow. Open PRs were reviewed; none implements this specific continuation. No replacement messaging or request system is introduced.

A homeowner selects **Ask about similar work** on a public profile update or a Discover post/detail. The profile retains the exact post ID alongside the contractor slug through in-page sign-in/sign-up, refresh, and the existing property-setup return link. The continuation panel shows the title and exact same-app post link; it receives focus after selection. An explicit connection send appends the reference to the existing request message. An active connection opens the existing authorized service composer and appends it to the description only when sent. The original fields and privacy selections remain independently editable. All three existing service-request send surfaces display/removably retain the reference; changing contractor clears it without changing typed text. Cancellation clears the continuation. Pending relationships are explained, never resent or silently edited.

Only identifiers travel in the URL. No homeowner message, property permission, private job record, media URL, or address is stored there. The existing public profile and Discover feed projections validate slug/contractor/post ownership on restoration and immediately before sending. Exact lookup is independent of the six most recent profile cards. Missing, hidden, deleted, malformed, mismatched, edited-title/date, and failed-lookup references block submission until removed or selected again. Async restoration ignores superseded/unmounted results; duplicate connection sends are guarded in flight.

## Trust and limits

The reference is **homeowner-supplied text**, not server-attested project provenance or proof of completed work. A custom client can already author arbitrary message text. Public lookup and send are separate operations; a post can become unavailable after validation or after sending. The historical message retains only its title and public identifiers, and does not grant access to a subsequently hidden/deleted post. No schema, RPC, authorization, storage, or policy change is needed.

Existing signup confirmation behavior is preserved: confirm the email, return to the same profile URL and sign in. No cross-device automatic email-return behavior or server-side draft persistence is added. The app does not automatically send, accept a connection, or grant property/media access. Service requests still require an active connection and the existing authorized property selection.

The public profile page and unchanged button styling are extracted from App.tsx. Distinct modal/evidence keys repair an inherited duplicate-key cancellation defect. The old Discover fixture's landing headline is aligned with current main.

## Verification and release gate

- Unit coverage exercises exact public projection filters, malformed/spoofed/hidden/deleted results, repeated composition, preserved 500-character original message, and contractor/title changes.
- Routed browser coverage uses synthetic fixtures and intercepts backend traffic: desktop/mobile sign-in/sign-up mode refresh, property return, explicit connection/service sends, pending relationships, removal, cancellation, and send-time revalidation. It does not mutate hosted records or prove live persistence.
- Independent source review found two issues (alternate composer visibility and focus), both repaired; re-review found no remaining blocker and independently passed all 10 domain tests.
- Types, build, 27 architecture tests, and lint (0 errors, 76 existing warnings) pass. Existing bundle-size/Browserslist warnings remain.
- Browser validation passed 30 Chromium cases (13 inquiry, 15 Discover, 2 profile journey) and 13 WebKit inquiry cases. All 15 hosted Preview cases (13 inquiry plus 2 profile journey) passed at application commit `d0e49dc9a1f7914ca383f5a1c59d69a00cb4cc55`.
- The protected Demo Preview `https://servsync-demo-b44vpb8ef-bencatchots-projects.vercel.app` is READY at that application commit. An unauthenticated request redirects to Vercel SSO. Existing protection and environment settings were preserved. The draft PR records final head/check evidence, including any documentation-only follow-up.

Production availability requires a separately approved merge/release. No hosted migration, access/configuration change, live user mutation, connection acceptance, or external outreach was performed.

## Tutorial freshness

Tutorial impact: NONE

After application and protected Preview validation, a read-only search of the live published Help Studio catalog covered Discover, homeowner.discover, public post, similar work, property setup, connection, contractor profile, request service and service request, plus the homeowner.service and contractor.service_requests contexts. No project-specific walkthrough matched. Connection/profile terms matched TUT-005; service terms matched TUT-005 and TUT-001.

Both matching published revision-1 videos were previewed locally through their ends in QuickTime on November 8, 2026. The local files match the live published asset SHA-256 values exactly:

- TUT-005, **How to connect and request service**, 119.200 seconds, asset `b965c416-462f-43f8-a561-6cb4295b5ef2`, SHA-256 `41d6f6cdd3f0e563475e884a4d486f245e6504d1ea62e48373c0a2fafdc3e160`.
- TUT-001, **How to handle a homeowner service request**, 15.641 seconds, asset `a6c774b2-8758-47e5-ba80-f94a507c112e`, SHA-256 `5fddd844389082f79e0ba9d003a4e6ea0e1b79738b4bc7194c68f390a21924d8`.

The existing request entry, explicit property/contact consent, acceptance requirement, review/send steps and contractor intake guidance remain accurate. The optional project entry does not invalidate the demonstrated paths. No replacement, recording, narration or Help publication is required for this increment. This review does not resolve unrelated existing tutorial work.
