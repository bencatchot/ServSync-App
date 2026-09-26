# Discover first-use value — implementation and launch gates

Date: September 25, 2026. Branch: `codex/discover-market-ready-v1`, based on main `20782d94`.

## Outcome and release status

This first implementation makes Discover useful to a homeowner choosing a contractor and a small contractor sharing an existing referral. PR #578 merged as `8d60cdf6f41fee0a30153d6985dd40d30f5fa615`; automatic app deployments passed. The shortlist migration is now installed in all three environments. This is not a completed marketplace launch, website builder, or Jobber replacement.

Homeowners find active, publicly listed participating contractors, including businesses with no posts. Discovery uses the existing authenticated directory and shares the city/full-ZIP and category matcher with the existing contractor finder. Results are explicitly alphabetical. A ZIP must be complete; city matching is explicit, without silent geographic expansion. Existing post-radius browsing remains separate. Unclaimed informational listings sit behind a secondary disclosure and retain their previous environment limits.

Public profiles retain their exact slug during in-page homeowner sign-in/create-account. Authentication never submits a connection. Email-confirmation users are told to return to that page and sign in; new cross-device email-return behavior is not introduced. A homeowner with no property can enter property setup and follow a return link to the same contractor. An active connection can open the existing authorized service-request composer. The route supplies only a contractor ID; the homeowner workspace verifies an active connection and does not submit any request automatically.

Profiles show up to six recent deliberately public posts, independent website links, and clearly contractor-provided credentials/external review links. Paused ServSync reviews remain unpublished. These updates are not classified as completed work or claimed as proof of workmanship. Contractor Discover exposes profile preview, copy link and actionable setup. Public uploads have local previews and a permission/privacy acknowledgment. No private job data is copied to public content.

Feed/saved-feed/profile failures offer retries instead of masquerading as no results. Failed deletion preserves the post; successful deletion closes its detail. Post cards show dates, and Saved Posts explicitly filter across all areas rather than implying the radius filter applies. New load-generation guards prevent stale responses from replacing a newer search.

## Private shortlist contract

`servsync-homeowner-saved-contractors.sql` creates only `public.homeowner_saved_contractors` and its policies/grants. Primary key: homeowner user ID plus contractor ID. Both references cascade on deletion. Authenticated homeowners may read/delete only their own rows and insert only their own bookmarks for active publicly listed contractors. Anonymous users, contractors and other homeowners cannot read or modify these rows. Update is not granted. Insert ignores duplicate pairs; the client reloads authoritative state after every change.

Saved IDs remain removable if a contractor hides their public profile. The UI does not expose unavailable business details. A bookmark creates no connection, notification, service request, analytics event or property permission. It is independent of Save Post.

The owner separately approved Sandbox application and disposable acceptance on September 25. The owner subsequently approved Demo and Production installation; all three environments are **Applied** in `config/backend-environment-rollouts.json`. A missing table or failed request shows an unavailable/retry state and disables writes. It never fabricates successful saves in local storage. Existing schema/auth/storage/permission objects are not changed.

## Validation and remaining acceptance

- Disposable local PostgreSQL: owner isolation, anonymous/contractor denial, spoofed owner rejection, hidden/suspended eligibility, duplicate insertion, prohibited ownership update, hidden-profile removal, no side-effect triggers, migration rerun.
- Browser fixture suite: desktop/mobile directory, no-post contractor discovery, saves/removal, missing migration, explicit area matching, anonymous profile sign-in continuation, website without summary, public posts, active/pending/failed relationship states, feed/save errors, failed deletion/retry, profile sharing/setup and publication acknowledgment.
- Full routed app journey uses intercepted HTTP responses, not live users. This validates integration wiring without mutating shared records.
- Local validation: 17/17 focused browser tests passed, including the complete routed sign-in/service-composer journey at desktop and 390px widths. 27/27 architecture tests passed. Type check and production build passed. Lint passed with zero errors and the warning baseline reduced from 77 to 76. App.tsx shrank from 50,719 to 50,608 lines; its budget was ratcheted down. Mobile screenshots were inspected, with no horizontal overflow. A real router-remount defect found by the full journey test was fixed by consuming profile intent with history replacement rather than a new hash navigation.
- Sandbox shortlist installation and live acceptance are complete. Production/Demo installation subsequently completed with explicit owner approval; controlled-pilot acceptance remains open. The database capability is installed; this does not establish marketplace readiness.
- Hosted Preview at source `96484ec`: [Demo Preview](https://servsync-demo-kbdusrc79-bencatchots-projects.vercel.app) reached READY; the compiled app passed both full routed desktop/mobile journeys with intercepted backend responses using the existing Demo protection credential. No shared user records changed. The two routed tests also passed against the exact `aa1c86a` deployment at https://servsync-demo-c0zxnkkzf-bencatchots-projects.vercel.app. This proves deployed frontend wiring, not live shortlist installation.
- Tutorial impact: **NONE**. September 25 authenticated Help Studio review followed implementation and Preview validation. Five published walkthroughs were listed. Searches for Discover, contractor profile, homeowner.discover, saved contractors and connection returned no published matches; service request returned TUT-005 and TUT-001. Both revision-1 published videos were played from start to end at normal speed, with visible steps/transcripts and sampled frames inspected. TUT-005 (119 seconds) retains Service Requests → contractor selection → home-scoped connection/acceptance → explicit request submission. TUT-001 (catalog 16 seconds, player 15 seconds) retains incoming Request → Create Estimate → Start your estimate without saving. The new Discover/profile entry is additive and preserves those existing paths, labels, permissions and outcomes. No Help metadata/media was changed or published. This closes this PR's freshness gate, not unrelated tutorial work.

## Sandbox acceptance — September 25

The owner approved this rollout explicitly. Supabase project inventory verified **ServSync Sandbox**, `zpzdkoaubyjtsomccxya`; the exact prepared migration SHA-256 `aa2203badabc68ab3013fc312192fc0a7af6fb3711473028465ca33f9a9749d7` was applied once. All 168 pre-existing public/Auth-user-identity/Storage relation fingerprints matched immediately afterward. The table has RLS, three policies, and no application side-effect triggers.

The operator-only runtime harness passed 20 checks using two disposable homeowner accounts and one contractor account. Real authenticated API checks covered persistent owner reads/saves/removal, duplicate saves, other-owner read/delete isolation, spoofed owner and ownership-update denial, anonymous/contractor denial, hidden-profile removal, hidden/paused eligibility, and recovery. A 390px full local application connected to live Sandbox passed directory visibility, save, reload persistence, saved-list removal, no horizontal overflow and zero uncaught browser errors. No shortlist responses were mocked. API sessions were signed out and exact fixture accounts deleted through Auth; all 169 post-install relation fingerprints matched the starting baseline, including an empty shortlist.

The first acceptance run used invalid fixture status `suspended`; Sandbox correctly rejected it. The harness now uses the actual supported `paused` status. The first browser startup snapshot occurred before content loaded; waiting for load corrected the harness. Neither required app or migration changes; both failed runs cleaned up exactly.

Reusable checks: `node scripts/validation/validate-homeowner-saved-contractors-sandbox-runtime.mjs --execute-sandbox --browser`. First-install SQL additionally requires `--apply-migration` and refuses an existing table. These are operator-only commands requiring the corresponding approval. Auth credentials are ephemeral and not printed or committed.

Limits: browser acceptance used local app source with live Sandbox, not a newly configured hosted Sandbox Preview. The broader new-account/property/connection/request journey retains its earlier fixture-based evidence; this rollout does not claim new live end-to-end coverage of that whole lifecycle. No Production/Demo SQL, shared environment settings, merge, publication or advertising occurred. Tutorial impact remains **NONE**: only validation tooling and rollout evidence changed after the completed review.

## Bounded rollout and pilot

1. App merge and migration installation in Sandbox, Demo and Production are complete. Sandbox disposable shortlist acceptance passed; continue the full live pilot journey before advertising.
2. Sandbox owner isolation and persistence are proven with two homeowners and a contractor. Before pilot release, verify the complete real sign-in/connection/property-setup/service-request journey on phones. Tutorial freshness for this source is complete; repeat affected checks if subsequent app revisions change guidance.
3. Pilot contractor-shared profiles first. Each contractor completes services, area, description and optional public work; manually confirms consent for content and shares their own link. No automated outreach or posting is authorized here.
4. Before local homeowner advertising: at least three participating contractors in each promoted service/area; four of five cold phone users complete the intended next step without assistance; all blockers fixed; an agreed response expectation with at least 80% of pilot inquiries receiving a useful response within one business day. These are proposed pilot gates, not measured conversion claims or industry benchmarks.
5. Name content reporting/removal/support ownership and the response operator. Public reporting/moderation tools, outcome funnel instrumentation, and anonymous matching-directory access require separate bounded implementation. Existing aggregate post views/saves are not qualified leads.
6. Pause an affected campaign if eligible supply disappears or inquiries repeatedly go unanswered. Do not advertise availability, verification, lead guarantees, SEO performance or Jobber synchronization.

## Backlog impact and follow-ups

FB-009 moves from feed-strategy backlog to active implementation with rollout/pilot gates. FB-026 review moderation/public display remains gated; no reviews are newly published. Dedicated indexable public URLs/social metadata, task aliases/advanced area matching, controlled moderation/reporting and funnel measurement remain follow-ups. Operational estimate/invoice follow-up and job-closeout opportunities require their own audits; they are not bundled into Discover or silently marked complete. The master plan and marketing inventory distinguish this review branch from live behavior. No paid advertising is launched.

## Task report

ACTION: Merged/deployed PR #578, completed Sandbox runtime acceptance, and applied the approved migration to Demo and Production; marketplace pilot gates remain open.
FILES MODIFIED: Discover modules and App integration, additive shortlist migration/rollout ledger, focused SQL/browser tests and validation ratchets, Sandbox runtime/browser harnesses, and the product documentation listed in the changelog.
MASTER PLAN UPDATED: yes.
CHANGELOG UPDATED: yes.
BACKLOG IMPACT: FB-009 active implementation; rollout/pilot follow-ups recorded; FB-026 review-publication boundary retained.
BACKLOG FILE UPDATED: YES.
REASON: Give contractors a usable referral destination and homeowners a clear selection/relationship path.
TESTS RUN: 20 live Sandbox runtime/browser checks and exact cleanup; local SQL privacy tests; 17 local browser cases; two hosted compiled-app fixture journeys; 27 architecture tests; 16 backend-parity/ledger tests; type check, build, lint, harness syntax and diff checks.
RISKS: Full live pilot journey remains pending; Sandbox shortlist acceptance and tutorial freshness are complete.
NEXT STEP: Complete the full live pilot journey and supply/response checks before advertising. The app merge and all three migrations are complete; no advertising or external outreach was performed.

## Demo and Production installation — September 25

The owner explicitly approved both pending migrations after PR #578 merged. Applied unchanged migration SHA-256 `aa2203badabc68ab3013fc312192fc0a7af6fb3711473028465ca33f9a9749d7` to Demo `bdytwgejqnlblhrnqxkp` first (01:51:22 UTC September 26), then Production `uqgtheclhxqlnjpfmheq` (01:51:36 UTC). Supabase project inventory verified each name/ref and healthy status before execution; each target table was absent beforehand.

All 165 pre-existing Demo and 162 Production relation fingerprints matched after installation, covering public tables, Auth users/identities, and Storage objects/buckets. The new table was empty. Exact columns/defaults, primary/foreign keys, grants, three policies, owner, RLS and zero application triggers matched the accepted Sandbox catalog. Read-only role probes passed; real REST API checks recognized the table and denied anonymous reads with `42501`. Demo required its existing publishable key because legacy keys are disabled; no settings or keys were changed. No production test accounts, user-record mutations, notifications, connection requests or storage writes were performed. Runtime mutation evidence remains the Sandbox acceptance above.

Saved contractors now has its required backend in all environments. No frontend edit or manual deployment was needed. Tutorial impact remains NONE; the existing post-implementation playback evidence applies. Full live onboarding/connection/request pilot acceptance and marketplace readiness remain separate work.
