# ServSync landing page design

Date: September 25, 2026
Branch: `codex/servsync-landing-design`
Base: `origin/main` at `8d60cdf`

## Outcome

Replace the public landing page with a complete responsive marketing experience centered on the homeowner–contractor relationship: **Home service, in sync.** The page uses the existing signup, sign-in, legal, and trust destinations. It does not change authenticated workflows, pricing, permissions, or backend behavior.

## Design and content

- A navy, white, and blue visual system, self-hosted Manrope typography, existing ServSync identity, and original home-service photography.
- A responsive header with separate homeowner/contractor sign-in choices and mobile navigation.
- A four-step, keyboard-operable service journey: Connect, Plan, Complete, Keep.
- Contractor and homeowner tabs that change the copy, actual-app screenshot with fictional sample data, and signup destination together. Screenshots open in an accessible, zoomable viewer.
- Permission-based sharing, repeat-service context, practical contractor tools, concise FAQs, and clear beta calls to action.
- Labeled illustrative journey examples and actual-app screenshots with fictional sample data; no fabricated testimonials, customer counts, guaranteed leads, or exposed account data.
- Free beta/no-card wording follows the current offer. The FAQ explains future paid plans and outside payment handling.
- The original photo is illustrative brand imagery, not a claim about a particular contractor or customer.

Both existing Demo roles were reviewed read-only, including Contractor Work, requests, estimate presentation, homeowner dashboard, Home History, and Discover. No Demo fixtures were created/reset or records changed. The smaller journey illustrations explain the workflow. The audience screenshots capture the actual application interface with browser-local fictional sample data; no existing account identities or internal test records are published.

## Implementation boundary

`src/features/landing/` owns the page and scoped styling. `src/App.tsx` delegates only its existing unauthenticated home route to that component. All other public/authenticated routes retain their existing shell. The App monolith budget is lowered by the number of extracted lines.

All imagery and fonts are served locally. The photo has desktop/mobile WebP sizes; the existing brand mark is optimized to WebP. Manrope is licensed under the SIL Open Font License included with the font.

## Validation

- TypeScript and production build.
- Repository lint with the existing 76-warning baseline, with no new warnings.
- Architecture tests and ratcheting App size check.
- Public browser coverage for both signup destinations, all legal/public routes, journey and audience tabs, keyboard operation, mobile menu, FAQ, sign-in roles, and navigation from the page bottom.
- Responsive visual review at 320, 390, 820, and 1440 pixels; element-boundary checks also cover 768 and 1024 pixels.
- Accessibility, enlarged-text, hosted Preview, and tutorial freshness evidence are recorded below after final verification.

## Documentation impact

- Changelog updated for the landing redesign.
- Master plan reviewed; no update needed. Existing product positioning, workflows, and beta strategy are preserved.
- Backlog reviewed; no update needed. No tracked feature status, priority, guardrail, or next implementation step changes.
- Marketing inventory reviewed; no update needed. This redesign presents supported capabilities and keeps pending Discover rollout, payments, automatic reminders, public reviews, and other roadmap claims out of the page.

## Release boundary

Prepared for Preview review. Merge and production deployment require the owner's separate approval. No SQL, settings, authentication/authorization, user data, or production operations are included.

## Final review evidence

- Draft PR: https://github.com/bencatchot/ServSync-App/pull/580
- Tested implementation: `fb81da9`.
- Immutable Demo Preview: https://servsync-demo-l1zmkxci6-bencatchots-projects.vercel.app
- Branch Demo Preview: https://servsync-demo-git-codex-servsync-la-58a465-bencatchots-projects.vercel.app
- Hosted browser verification: **22/22 passed** (15 landing-page cases plus seven existing public-route checks). The first hosted run overlapped an alias deployment transition and fetched old asset names; the final run targeted the immutable deployment and passed. The image assertion now waits for actual image decoding/loading rather than merely element visibility.
- Accessibility: zero axe violations in the checked desktop/mobile contractor and homeowner states after contrast/semantics fixes. Independent visual/DOM checks verified all four journey states, both audience states, and their controls at 320px and 390px with 200% text enlargement. No clipping or horizontal scroll remained.
- Desktop, tablet, and mobile screenshots reviewed; all font/image assets loaded. Source, keyboard, reduced-motion, and focus behavior reviewed.
- Local type check/build passed. Repository lint passed with the existing 76-warning baseline. All 27 architecture tests passed, and the App.tsx baseline is now 50,287 lines.
- Assets are approximately 2.7KB (mark), 107KB (mobile photo), 275KB (desktop photo), and 165KB (self-hosted variable font). Existing authenticated application bundle-size warnings remain outside this presentation change.

### Tutorial freshness

Tutorial impact: NONE

After application and immutable Preview validation, authenticated published-Help searches were performed with both existing Demo roles for `landing`, `signup`, `sign in`, and `platform introduction`, and for route contexts `home` and `public.home`. All twelve searches returned no matching published walkthroughs. The protected pilot tutorial inventory covers authenticated request, Draft, work, invoice, connection, and record workflows; none of those screens or instructions changes here. There was no affected matching video to play or replace. No Help media or publication state changed.

## Required task report

- ACTION: Built and verified the complete landing redesign; committed and pushed the review branch and opened draft PR #580.
- FILES MODIFIED: Landing component/style, App landing delegation, landing assets/license/provenance, focused browser tests, architecture line budget, design report, and changelog (13 files total).
- MASTER PLAN UPDATED: no.
- CHANGELOG UPDATED: yes.
- BACKLOG IMPACT: Backlog reviewed; no update needed.
- BACKLOG FILE UPDATED: NOT NEEDED.
- REASON: Marketing design and presentation only; existing product scope and promises are preserved.
- TESTS RUN: TypeScript, build, lint baseline, 27 architecture tests, 22 hosted browser tests, independent accessibility/reflow review, image loading, diff and changed-line secret scans.
- RISKS: Existing application bundle warning and lint baseline; Vercel Preview may require the owner's existing Vercel access. Production release is not included.
- NEXT STEP: Owner reviews the preview and separately approves any merge/release.

## September 25 copy revision

The owner requested more natural language and specifically rejected “Good homes. Good people.” The page now uses plain descriptions of tasks and features, retaining “Home service, in sync.” as the main brand line. Examples include “Manage your jobs and customers,” “Keep track of work done on your home,” and “Create a homeowner account.” Repeated story, next-chapter, good-work, and better-connections slogans were removed. FAQ answers use conversational language while retaining existing sharing, free-beta, and payment limits.

Local validation: production build passed. The 22 existing landing/public browser checks passed across the initial run and two corrected assertion reruns; the initial failures were text-content whitespace assumptions around the new multiline heading, not layout or behavior defects. Screenshots at 320, 390, 820, and 1440px show the revised text without horizontal overflow; no page errors were reported. Existing enlarged-text, audience, navigation, signup, FAQ, and legal-route checks passed. Final implementation `10555cc` passed all **22/22 hosted browser checks** on immutable Demo Preview https://servsync-demo-2uzyjnb76-bencatchots-projects.vercel.app. Its CI quality check and all three Preview builds passed. After that verification, both Demo roles repeated the twelve affected published-Help searches; no matching landing/signup walkthroughs were found, so tutorial impact remains NONE. No Help content or publication state changed.

Copy-revision task report:

- ACTION: Rewrote public landing copy in a more natural, specific voice.
- FILES MODIFIED: LandingPage.tsx, existing landing browser assertions, this report, and changelog.
- MASTER PLAN UPDATED: no.
- CHANGELOG UPDATED: yes.
- BACKLOG IMPACT: Backlog reviewed; no update needed.
- BACKLOG FILE UPDATED: NOT NEEDED.
- REASON: Editorial refinement only; product scope, pricing, permissions, and workflows are unchanged.
- TESTS RUN: Production build, 22/22 hosted browser checks, passing CI lint/architecture/types/build, desktop/tablet/phone visual review, enlarged-text checks, diff checks, and post-validation tutorial searches.
- RISKS: Existing application bundle warning; no new functional risks identified.
- NEXT STEP: Review the revised Preview; merge remains separately gated.

## September 25 actual-product screenshot revision

The owner approved replacing the two larger invented app panels with authentic ServSync screenshots. The contractor view shows an estimate; the homeowner view shows Home History and a saved service record. The hero photograph and explanatory four-step journey remain. Desktop frames show the full app shell; phone frames show native mobile record crops. Both identify the screen and sample-data status and open the corresponding full capture in a native modal dialog with zoom, Escape/Close dismissal, background scroll locking, and focus restoration. The viewer’s image area supports keyboard scrolling when zoomed.

Screens are captured from the actual application rendered with isolated fictional browser responses. Shared data, user records, credentials, and settings are not changed. Capture provenance and regeneration details are maintained in `public/landing/README.md`.

Documentation impact: marketing inventory updated only to describe the screenshot demonstration boundary. Master plan unchanged. Backlog reviewed; no update needed. Changelog and asset provenance updated. Local validation: type checking and production build passed; lint passed with the existing 76-warning baseline. The initial 25 browser cases and the five final desktop/mobile viewer checks passed. Independent review verified actual screen content, responsive image selection, keyboard scrolling, focus containment/restoration, Escape, scroll locking, and no page errors or horizontal overflow at desktop, 390px, and 320px. Five optimized WebP captures total approximately 695KB; desktop and mobile variants load selectively, and full mobile estimate content loads only when the viewer is opened. Hosted validation and final tutorial freshness evidence follows below.
