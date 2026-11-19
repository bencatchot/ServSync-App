# Invoice PDF design and exact service property

Source/Preview change based on main `9bcc223cf29382069925acd10db00f2ba4ddf372`. Production release requires separate approval. No database or permission changes.

## Behavior

- Letter pages use contractor-first identity, restrained teal, clear invoice state/dates, separate customer and service-property blocks, full line titles/details, aligned financial columns, repeated continuation headers and page numbers. Paid and void states have distinct payment wording; outstanding invoices use a neutral contact-contractor instruction. Existing financial calculations, persisted totals, discounts, backlog and unpriced-line meaning remain unchanged.
- Contractor preview and download resolve only the invoice's exact property within that customer's already-authorized connected or local context. Connected address and overview flags are retained during normalization; an explicit per-property false overrides aggregate permission. Missing, revoked, unmatched or ambiguous context yields no address. No stale invoice snapshot or first/default property fallback is used.
- Homeowner download resolves the invoice's exact owned home, independently of the currently selected property. Nicknames remain separate from available street/unit/city/state/ZIP. There is no inferred billing address: current application callers supply customer identity only to Bill To. The renderer can display an independently supplied billing address; the separate-billing sample tests that capability, not a new billing-address setting.
- The standalone editor offers an optional explicit Service property choice. Linked work keeps its exact source property; no property is silently selected. Existing shared Draft already exposes its property selector. No autosave, send, new payment capability or hard address requirement is introduced.
- Browser preview/download and native handoff share the same generated PDF. The secure local-customer delivery page uses its existing immutable exact-property snapshot and has no PDF action; it is unchanged.

## Evidence and limits

The approved fictional three-page design reference was materialized through Library's supported helper and visually inspected before styling. Seven actual fictional PDFs were generated, text/financial assertions checked, and every rendered page inspected: short, four-page detail, missing address, withheld address, paid, void, and independently supplied billing address. The six remaining samples fit one page each. No real customer PDF or data was used; the cause of any individual customer document has not been established.

Local checks: six focused PDF/address tests (including long-row/backlog pagination and permission/isolation cases), 22 Chromium cases (including the Add Line regression), six WebKit PDF/property cases, and two native PDF lifecycle tests. Desktop/mobile property fixtures use real components with local synthetic state and external HTTPS blocked; these do not prove hosted persistence. Application and Practice types, lint (zero errors, 76 baseline warnings), build, App budget, architecture (27), backend parity tooling (16), runtime parity tooling (6), role-smoke contracts (27), recorder (60), and disposable local Practice tests (50) pass. Existing bundle-size warnings remain.

Reproduce focused PDF tests with `node --import tsx --test tests/invoices/invoice-pdf-design.test.ts` (requires Poppler `pdftotext` and `pdfinfo`). Set `INVOICE_PDF_OUTPUT` to an absolute directory to retain fictional samples. Browser specs: `invoice-property-selection`, `invoice-pdf-preview-download-parity`, `estimate-invoice-pdf-actions`, and `invoice-add-line-consistency`, using a local dev server without backend credentials.

Exact remote head, CI, protected Preview and final tutorial evidence belong in the PR. Hosted authenticated invoice acceptance, physical native-device viewing and published tutorial playback are not established by the local fixtures. All retained Demo records and unrelated work remain untouched.

## Review

Review the fictional PDFs first. In an authorized Preview session, inspect an existing invoice's Preview PDF and Download PDF without sending or changing it. For a new unsaved invoice, inspect the Service property choice and dismiss without saving. Missing or withheld street information must remain absent. Do not assume a property nickname is its mailing address or that a service address is the billing address.

## Defensive selector privacy follow-up

The property selector now uses the same sharing-filtered display helper as invoice PDFs. Explicit per-property false overrides aggregate consent; withheld nicknames/addresses fall back to a neutral Property number. Local-customer labels remain unchanged. Three synthetic architecture regressions cover stale fields, independent permissions, legacy aggregate fallback, revoked/missing consent, PDF parity and selector wiring. Run with `node --test tests/architecture/invoice-property-privacy.test.mjs` on supported Node 22.13+ or 24. No permission values or access rules are changed. Hosted acceptance and tutorial playback remain open; earlier PDF visual checks apply to the renderer, which is unchanged by this follow-up.
