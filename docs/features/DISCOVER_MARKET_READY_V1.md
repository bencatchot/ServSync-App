# Discover first-use value — implementation and launch gates

Date: September 25, 2026. Branch: `codex/discover-market-ready-v1`, based on main `20782d94`.

## Outcome and release status

This first implementation makes Discover useful to a homeowner choosing a contractor and a small contractor sharing an existing referral. Source preparation is approved. It is not a completed marketplace launch, production deployment, website builder, or Jobber replacement.

Homeowners find active, publicly listed participating contractors, including businesses with no posts. Discovery uses the existing authenticated directory and shares the city/full-ZIP and category matcher with the existing contractor finder. Results are explicitly alphabetical. A ZIP must be complete; city matching is explicit, without silent geographic expansion. Existing post-radius browsing remains separate. Unclaimed informational listings sit behind a secondary disclosure and retain their previous environment limits.

Public profiles retain their exact slug during in-page homeowner sign-in/create-account. Authentication never submits a connection. Email-confirmation users are told to return to that page and sign in; new cross-device email-return behavior is not introduced. A homeowner with no property can enter property setup and follow a return link to the same contractor. An active connection can open the existing authorized service-request composer. The route supplies only a contractor ID; the homeowner workspace verifies an active connection and does not submit any request automatically.

Profiles show up to six recent deliberately public posts, independent website links, and clearly contractor-provided credentials/external review links. Paused ServSync reviews remain unpublished. These updates are not classified as completed work or claimed as proof of workmanship. Contractor Discover exposes profile preview, copy link and actionable setup. Public uploads have local previews and a permission/privacy acknowledgment. No private job data is copied to public content.

Feed/saved-feed/profile failures offer retries instead of masquerading as no results. Failed deletion preserves the post; successful deletion closes its detail. Post cards show dates, and Saved Posts explicitly filter across all areas rather than implying the radius filter applies. New load-generation guards prevent stale responses from replacing a newer search.

## Private shortlist contract

`servsync-homeowner-saved-contractors.sql` creates only `public.homeowner_saved_contractors` and its policies/grants. Primary key: homeowner user ID plus contractor ID. Both references cascade on deletion. Authenticated homeowners may read/delete only their own rows and insert only their own bookmarks for active publicly listed contractors. Anonymous users, contractors and other homeowners cannot read or modify these rows. Update is not granted. Insert ignores duplicate pairs; the client reloads authoritative state after every change.

Saved IDs remain removable if a contractor hides their public profile. The UI does not expose unavailable business details. A bookmark creates no connection, notification, service request, analytics event or property permission. It is independent of Save Post.

The owner approved migration **preparation**, not application. Production, Sandbox and Demo are all **Pending** in `config/backend-environment-rollouts.json`. A missing table or failed request shows an unavailable/retry state and disables writes. It never fabricates successful saves in local storage. Existing schema/auth/storage/permission objects are not changed.

## Validation and remaining acceptance

- Disposable local PostgreSQL: owner isolation, anonymous/contractor denial, spoofed owner rejection, hidden/suspended eligibility, duplicate insertion, prohibited ownership update, hidden-profile removal, no side-effect triggers, migration rerun.
- Browser fixture suite: desktop/mobile directory, no-post contractor discovery, saves/removal, missing migration, explicit area matching, anonymous profile sign-in continuation, website without summary, public posts, active/pending/failed relationship states, feed/save errors, failed deletion/retry, profile sharing/setup and publication acknowledgment.
- Full routed app journey uses intercepted HTTP responses, not live users. This validates integration wiring without mutating shared records.
- Local validation: 17/17 focused browser tests passed, including the complete routed sign-in/service-composer journey at desktop and 390px widths. 27/27 architecture tests passed. Type check and production build passed. Lint passed with zero errors and the warning baseline reduced from 77 to 76. App.tsx shrank from 50,719 to 50,608 lines; its budget was ratcheted down. Mobile screenshots were inspected, with no horizontal overflow. A real router-remount defect found by the full journey test was fixed by consuming profile intent with history replacement rather than a new hash navigation.
- Shared-environment shortlist installation, authenticated live acceptance, and release approval remain separate gates. Browser fixtures plus local PostgreSQL are not a claim of a completed live rollout.
- Hosted Preview at source `96484ec`: [Demo Preview](https://servsync-demo-kbdusrc79-bencatchots-projects.vercel.app) reached READY; the compiled app passed both full routed desktop/mobile journeys with intercepted backend responses using the existing Demo protection credential. No shared user records changed. This proves deployed frontend wiring, not live shortlist installation.
- Tutorial review is blocked by the current Safari ServSync admin sign-in screen. The owner has been asked to restore the session. Do not treat the earlier September 9 review as current evidence. Search Discover, contractor profile, saved contractors, connection, service request and route contexts, then play matching published walkthroughs; previously relevant TUT-005 and TUT-001 require current inspection. This task is not release-complete while that gate is unresolved.

## Bounded rollout and pilot

1. Review source/Preview. Separately approve applying the exact migration to Sandbox and running disposable homeowner/contractor acceptance with cleanup. Do not change Production or Demo settings to make a Preview pass.
2. Prove isolation and persistence with two homeowner identities and a contractor, including hidden profiles and retry behavior. Verify the real sign-in/connection/property-setup/service-request journey on phones. Finish tutorial freshness before release.
3. Pilot contractor-shared profiles first. Each contractor completes services, area, description and optional public work; manually confirms consent for content and shares their own link. No automated outreach or posting is authorized here.
4. Before local homeowner advertising: at least three participating contractors in each promoted service/area; four of five cold phone users complete the intended next step without assistance; all blockers fixed; an agreed response expectation with at least 80% of pilot inquiries receiving a useful response within one business day. These are proposed pilot gates, not measured conversion claims or industry benchmarks.
5. Name content reporting/removal/support ownership and the response operator. Public reporting/moderation tools, outcome funnel instrumentation, and anonymous matching-directory access require separate bounded implementation. Existing aggregate post views/saves are not qualified leads.
6. Pause an affected campaign if eligible supply disappears or inquiries repeatedly go unanswered. Do not advertise availability, verification, lead guarantees, SEO performance or Jobber synchronization.

## Backlog impact and follow-ups

FB-009 moves from feed-strategy backlog to active implementation with rollout/pilot gates. FB-026 review moderation/public display remains gated; no reviews are newly published. Dedicated indexable public URLs/social metadata, task aliases/advanced area matching, controlled moderation/reporting and funnel measurement remain follow-ups. Operational estimate/invoice follow-up and job-closeout opportunities require their own audits; they are not bundled into Discover or silently marked complete. The master plan and marketing inventory distinguish this review branch from live behavior. No paid advertising is launched.

## Task report

ACTION: Implemented and prepared a review branch; release remains gated.
FILES MODIFIED: Discover modules and App integration, additive shortlist migration/rollout ledger, focused SQL/browser tests and validation ratchets, and the product documentation listed in the changelog.
MASTER PLAN UPDATED: yes.
CHANGELOG UPDATED: yes.
BACKLOG IMPACT: FB-009 active implementation; rollout/pilot follow-ups recorded; FB-026 review-publication boundary retained.
BACKLOG FILE UPDATED: YES.
REASON: Give contractors a usable referral destination and homeowners a clear selection/relationship path.
TESTS RUN: Local SQL privacy tests; 17 local browser cases; two hosted compiled-app fixture journeys; 27 architecture tests; type check, build, lint and diff checks.
RISKS: Shared shortlist migration and live acceptance are not performed; Help Studio freshness review awaits an authenticated admin session.
NEXT STEP: Complete current Help Studio search/playback, review the draft PR, then separately approve a bounded Sandbox migration/acceptance rollout. No merge, Production deployment, shared SQL application, advertising or external outreach was performed.
