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
- Final browser totals, protected Preview/head/check evidence and the post-validation Help Studio freshness result are recorded on the draft PR. Until those gates are recorded, this document is implementation evidence only.

Production availability requires a separately approved merge/release. No hosted migration, access/configuration change, live user mutation, connection acceptance, or external outreach was performed.
