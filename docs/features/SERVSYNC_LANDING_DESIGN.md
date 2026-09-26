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
