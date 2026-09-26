# Landing page assets

- `home-service.webp` / `home-service-mobile.webp`: original AI-generated editorial brand photograph created with the built-in image generation tool for this landing page on September 25, 2026; a home-service professional approaching a coastal American home. This is illustrative imagery, not a testimonial or real customer/contractor claim. Optimized to 1200px and 700px widths.
- `brand-mark.webp`: optimized 160px derivative of the repository's existing `public/servsync-mark-white.png`; preserves the existing ServSync mark.
- `manrope-variable.ttf`: Manrope variable font from the Google Fonts repository (`ofl/manrope/Manrope[wght].ttf`), self-hosted to avoid third-party font requests.
- `manrope-OFL.txt`: the font's SIL Open Font License.

Do not replace these with Demo or Production account screenshots that expose identities, property addresses, credentials, or internal test fixtures.

## Actual product captures

Captured September 25, 2026 from the repository's actual React application at a local Vite URL. No screen elements were recreated, restyled, composited, or AI-generated. The browser renders ordinary app routes and components, then Playwright captures the viewport or the existing record element.

All displayed names, addresses, dates, amounts, account state, and records are **fictional sample data** defined by `scripts/marketing/capture-landing-product.mjs`. This is UI demonstration evidence, not a real customer, completed transaction, testimonial, backend persistence test, or promise of payment processing.

The isolated browser intercepts every non-local HTTP request and closes WebSockets. Fake sign-in and read-only API responses remain inside that browser. No real credentials are loaded. No Demo/Production accounts, database records, settings, or storage objects are accessed or changed. The PDF is represented by sample document metadata only; no private document is downloaded. Analytics requests are blocked.

| File | Actual screen / crop | Pixels | Approx. size |
| --- | --- | --- | --- |
| `contractor-estimate.webp` | Desktop Work → Estimates, accepted water-heater estimate, next step, payment schedule, and existing controls | 2880 × 2480 | 264 KB |
| `homeowner-history.webp` | Desktop Home History with one property-scoped filed service-report record | 2880 × 1800 | 213 KB |
| `contractor-estimate-detail.webp` | Same app at 390px: literal crop of estimate status, scope, total, and next step | 648 × 692 | 44 KB |
| `homeowner-history-detail.webp` | Same app at 390px: complete single Home History record | 648 × 508 | 40 KB |
| `contractor-estimate-mobile.webp` | Complete native mobile estimate record, including payment schedule and actions | 648 × 2670 | 134 KB |

Use the visible caption **Actual ServSync screen · Sample data** with these images. At viewport widths of 700px and above, both the inline preview and image viewer use the full desktop capture with the app shell. Below 700px, inline previews use the native mobile `-detail` crop; the contractor viewer uses the complete `contractor-estimate-mobile.webp` record, and the homeowner viewer reuses the complete `homeowner-history-detail.webp` record. The mobile record crops omit surrounding navigation. Do not label them live accounts or real project evidence.

To reproduce, start the local app with its usual public Supabase client configuration, then run:

```sh
node scripts/marketing/capture-landing-product.mjs http://127.0.0.1:4178
```

The script requires the repository's Playwright installation and `cwebp` on PATH. It produces 2× browser PNG masters and a request/error audit under `/tmp/servsync-landing-capture`, then compresses the browser pixels directly to WebP at quality 90 with metadata removed. It never draws or reconstructs screenshots. Capture validation: script syntax, ESLint, Prettier format, and diff checks passed; both role routes rendered without JavaScript page errors; the contractor record and the single Home History record were visually inspected at desktop and native mobile widths.
