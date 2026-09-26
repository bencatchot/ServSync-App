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
- Contractor and homeowner tabs that change the copy, labeled product illustration, and signup destination together.
- Permission-based sharing, repeat-service context, practical contractor tools, concise FAQs, and clear beta calls to action.
- Explicit illustrative examples rather than fabricated testimonials, customer counts, guaranteed leads, or screenshots exposing account data.
- Free beta/no-card wording follows the current offer. The FAQ explains future paid plans and outside payment handling.
- The original photo is illustrative brand imagery, not a claim about a particular contractor or customer.

Both existing Demo roles were reviewed read-only, including Contractor Work, requests, estimate presentation, homeowner dashboard, Home History, and Discover. No Demo fixtures were created/reset or records changed. Product illustrations simplify supported concepts rather than claim to reproduce the exact application interface.

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
