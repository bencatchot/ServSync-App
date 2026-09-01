# ServSync FB-040A TUT-004 Acceptance — 2026-09-01

## Status

Validated silent source promoted. The single authorized run against exact durable Demo commit `ab542a5c08bebfb226d5d5fc5934372a16d2695d` passed the corrected provider guard, exact workflow/checkpoint verification, media promotion, full `1x` sound-off review, contextual placement checks, guarded reset, and zero-residue audit. TUT-004 is recorded but not narrated, approved, or published.

## Scope accepted

- Scenario: `contractor-invoice-outside-payment` at 1440×900 using `servsync-human-paced-v1`.
- Context and audience: `contractor.financials`, intended for Contractor Owner, Admin, and Office.
- Start: one registry-owned fictional completed Job with exact Customer, Home, Request, Estimate, and Job lineage.
- Product path: create the Invoice from completed items, send it, open it as the fictional homeowner, then record a fictional `$400.00` external bank transfer through **Record payment**.
- Product truth: the recording must visibly show that ServSync records money received elsewhere and does not process a payment or contact a payment provider.
- End: exact `invoice_partially_paid` checkpoint showing **Partially Paid**, `$400.00` paid, and `$1,765.00` due.

## Safety and provenance

The target guard accepts only the protected durable Demo project. The scenario uses ordinary product UI for Invoice creation, delivery, homeowner viewing, and offline-payment recording; private runner commands only adopt the exact new rows into the reset registry. The recorder fails on visible credentials or token-like text, browser console/page errors, any `5xx` response, any online-payment/provider request, checkpoint drift, duration drift, or lineage mismatch. Cleanup remains exact-row and dependency ordered. No Production record, payment provider, environment, secret, schema, or permission was changed.

## Validation evidence

| Check | Result |
| --- | --- |
| Focused recorder and TUT-004 source contracts | 35/35 passed |
| Complete Demo Recorder suite | 50/50 passed |
| Architecture suite | 25/25 passed |
| Help Studio contextual/browser and Invoice payment presentation at desktop/mobile sizes | 19/19 passed |
| TypeScript | Passed |
| ESLint warning budget | Passed: 0 errors, existing 79-warning baseline |
| Production build | Passed |
| App architecture budget | Passed at 50,824 lines |
| Script syntax and diff whitespace | Passed |

### Protected runtime evidence

- The repaired credential bundle resolved exactly two Demo-owned recorder identities with the intended homeowner and contractor-owner metadata, preserved their existing profile/tenant ownership, and passed both rotated password logins. The ignored local bundle is owner-readable only and contains no OpenAI key.
- Exact durable Demo commit `dded6f958e326bf3b8603bbba2a7341115db3733` and its successful `servsync-demo` deployment were confirmed before the run.
- The live UI-created draft contained five Invoice lines and five completed Job work items, all drafted and reserved to that Invoice, with zero premature payment events, `$2,165.00` total, and `$0.00` paid.
- The adoption helper had omitted `reserved_invoice_id` and `invoiced_invoice_id` from `fetchJobWorkItems`, so those required values were always unavailable to the validator. The corrected query preserved every validation rule; the complete Demo Recorder suite passed 49/49, architecture passed 25/25, and TypeScript passed.
- The exact failed Invoice was adopted only to regain registry ownership, then guarded reset removed 27 disposable registered rows. Zero registered disposable records remain. No source media, payment-provider traffic, or external effect was produced.
- PR #546 merged at `067fe3f947d2e37a7aa720fbf9053e3b9fac0791`; its durable Demo deployment was successful and exact before the second protected run.
- The one authorized second run completed ordinary UI Invoice creation and delivery, opened the delivered Invoice as the fictional homeowner, recorded the `$400.00` external bank transfer through the canonical offline ledger, and verified exact Customer/Home/Request/Estimate/Job/Invoice/payment lineage with `$2,165.00` total, `$400.00` paid, and `$1,765.00` due.
- Media validation rejected `/assets/InvoiceOnlinePaymentButton-*.js` and `/rest/v1/rpc/servsync_list_invoice_online_payments`. Both are first-party, non-mutating application reads: the first is an inert bundled asset and the second loads Invoice payment history. No Stripe hostname, checkout route, payment-intent route, online-payment action, `5xx`, browser error, or visible secret was reported.
- No WebM, MP4, metadata, checksum, duration, or dimensions were promoted or claimed. Guarded reset removed 28 disposable registered rows; a direct registry audit found zero registered disposable records across 253 historical seed runs.
- PR #547 merged the reviewed correction at `ab542a5c08bebfb226d5d5fc5934372a16d2695d`. GitHub/Vercel bound successful automatic Production app, durable Demo, and Stripe Sandbox deployments to that exact commit; `servsync.app`, `servsync-demo.vercel.app`, and `servsync-stripe-sandbox.vercel.app` each returned HTTP 200. No manual deployment, promotion, retry, credential, environment, data, or configuration change occurred.
- The one authorized protected rerun promoted `servsync-contractor-invoice-outside-payment-v1-2026-09-01T16-39-10-688Z`: a 57.96-second 1440×900 silent VP8 WebM plus H.264/yuv420p MP4. WebM SHA-256 is `162db5af977de3b61eb6351bfe202b60f67c4fb80813faf3e26f1c633c72d409`; MP4 SHA-256 is `f4fb4950f46a92b1622ad9dc9f312db163f1699f106a5dc4ea886b231d2df6d7`. Both probes and metadata checks passed and source provenance names exact commit `ab542a5c08bebfb226d5d5fc5934372a16d2695d`.
- Exact runtime verification preserved Customer/Home/Request/Estimate/Job/Invoice/offline-payment lineage, Invoice delivery and fictional homeowner view, `$2,165.00` total, `$400.00` paid outside ServSync, `$1,765.00` due, and **Partially Paid**. No visible secret, browser error, `5xx`, Stripe host, checkout, payment intent, online-payment action, or other provider/external side effect was detected.
- Complete `1x` sound-off playback reached 57.96/57.96 seconds. Frame and contact-sheet review confirmed truthful cursor/click alignment, persistent entered values, the visible outside-payment/no-provider disclosure, and the exact final balance. Desktop durable Demo Financials entry passed with zero overflow/errors/provider actions; exact-source desktop/mobile contextual and Invoice presentation passed 19/19, including 390×844 with zero overflow.
- Guarded reset removed 28 disposable registered rows and retained only the intentional revision-backed reusable property graph. Direct registry audit across 254 historical seed runs found zero registered disposable records.

## Tutorial freshness

Tutorial impact: `UPDATE REQUIRED`.

Affected tutorial: TUT-004 **How to deliver an invoice and record an outside payment**. The protected workflow is intentionally missing from Production, so no current published revision can be previewed or claimed current. The bounded follow-up is one separately authorized OpenAI `gpt-4o-mini-tts` Cedar narration request for the exact validated silent source, followed by synchronized top-safe captions, matching durable transcript, exact AI disclosure, complete `1x` sound-on/sound-off review, and separate Help approval/publication. After publication, verify desktop/mobile contextual retrieval and the exact Owner/Admin/Office audience.

## Owner gate

Minimum owner action when ready: authorize process-only retrieval and use of `OPENAI_API_KEY` for one TUT-004 `gpt-4o-mini-tts` Cedar narration request bound to validated silent MP4 SHA-256 `f4fb4950f46a92b1622ad9dc9f312db163f1699f106a5dc4ea886b231d2df6d7`. Help approval and Production publication remain later, separate gates.
