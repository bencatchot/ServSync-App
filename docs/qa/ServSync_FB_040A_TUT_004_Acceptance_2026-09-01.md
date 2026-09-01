# ServSync FB-040A TUT-004 Acceptance — 2026-09-01

## Status

Provider-traffic correction merged and deployed. PR #547 merged normally at `ab542a5c08bebfb226d5d5fc5934372a16d2695d`; automatic Production app, durable Demo, and Stripe Sandbox deployments succeeded, all three canonical aliases returned HTTP 200, and the durable Demo deployment record is bound to that exact commit. The corrected guard allows only the inert first-party bundle and exact internal read-only payment-history RPC while continuing to reject Stripe, checkout, payment-intent, and online-payment action traffic. TUT-004 is not recorded, narrated, approved, or published.

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

## Tutorial freshness

Tutorial impact: `UPDATE REQUIRED`.

Affected tutorial: TUT-004 **How to deliver an invoice and record an outside payment**. The protected workflow is intentionally missing from Production, so no current published revision can be previewed or claimed current. The bounded follow-up is one separately authorized silent rerun against exact durable Demo commit `ab542a5c08bebfb226d5d5fc5934372a16d2695d` using the repaired local Demo bundle. Only after the silent source passes should the owner separately authorize OpenAI `gpt-4o-mini-tts` Cedar narration with synchronized top-safe captions and matching durable transcript, followed by full `1x` sound-on/sound-off review and separate Help approval/publication. After publication, verify desktop/mobile contextual retrieval and the exact Owner/Admin/Office audience.

## Owner gate

Minimum owner action when ready: authorize one protected TUT-004 silent rerun against exact durable Demo commit `ab542a5c08bebfb226d5d5fc5934372a16d2695d` using the repaired local Demo recorder bundle. Separate explicit owner decisions remain required for Cedar/OpenAI use, Help approval, and Production publication.
