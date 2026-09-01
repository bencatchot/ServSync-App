# ServSync FB-040A TUT-004 Acceptance — 2026-09-01

## Status

Runtime correction ready for review. The first protected durable Demo run against `dded6f958e326bf3b8603bbba2a7341115db3733` failed closed before delivery and promoted no media because the private Invoice-adoption query did not select the two reservation fields its unchanged exactness rule validates. The bounded correction adds those existing fields and a focused regression. TUT-004 is not recorded, narrated, approved, or published.

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
| TUT-004 recorder, adoption, Help packager, and contextual source contracts | 49/49 passed |
| Complete Demo Recorder suite | 48/48 passed |
| Architecture suite | 23/23 passed |
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

## Tutorial freshness

Tutorial impact: `UPDATE REQUIRED`.

Affected tutorial: TUT-004 **How to deliver an invoice and record an outside payment**. The protected workflow is intentionally missing from Production, so no current published revision can be previewed or claimed current. The bounded follow-up is to merge and normally deploy this source to durable Demo, use the existing protected recorder credentials for the exact-head run, create one OpenAI `gpt-4o-mini-tts` Cedar narration package with synchronized top-safe captions and matching durable transcript, preserve the silent source/provenance, complete full `1x` sound-on and sound-off review, and return for explicit owner approval and Production publication. After publication, verify desktop/mobile contextual retrieval and the exact Owner/Admin/Office audience.

## Owner gate

Minimum owner action when ready: approve merge of the bounded Invoice-adoption correction after ordinary review. A provenance-valid protected silent rerun must use the resulting exact merged source and durable Demo deployment. Separate explicit owner decisions remain required for Cedar/OpenAI use, Help approval, and Production publication. No provider request, approval, or publication is authorized by this correction.
