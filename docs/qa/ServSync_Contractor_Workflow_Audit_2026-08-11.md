# ServSync Contractor Workflow Audit

Date: 2026-08-11

Environment: Sandbox `zpzdkoaubyjtsomccxya`

Source baseline: `f2aa415a1ea344228b191be4760b9044d2981833`

## Result

All five required scenarios passed through actual contractor/customer browser paths and persisted Sandbox state. Connected full and partial offline-payment lifecycles passed through Paid. The not-connected Customer lifecycle passed from Customer creation through secure Estimate acceptance, Job completion, secure Invoice recipient access, and durable full payment. A separate local-Customer Draft-first path saved a Draft Invoice and recorded its exact full offline balance directly to Paid without sending or contacting Stripe. The exact Draft Invoice Mark Paid migration is applied in Sandbox, Demo, and Production; Demo and Production validation was read-only apart from the reviewed function replacement.

## Scenario Evidence

| Scenario | Result | Evidence |
| --- | --- | --- |
| A. Connected Customer lifecycle | PASS | Homeowner request, contractor Estimate, authenticated acceptance, Job, completed priced work, sent Invoice, full check payment, reload, immutable one-row payment history, Paid PDF, Home History filing, and reminder all passed. |
| B. Not-connected Customer lifecycle | PASS | Contractor created the Customer/property, launched a Draft-first Estimate, issued a secure exact-snapshot link, guest accepted, contractor created/completed the Job, issued a secure Invoice, recipient loaded it without an account, and contractor recorded full cash payment. Reload, the Jobs Invoice list Paid filter, immutable one-row history, and Paid PDF all passed. |
| C. Partial then full payment | PASS | A $40 external ACH payment persisted as Partially Paid with $85 due; a later $85 cash payment produced Paid with $0 due and exactly two immutable history rows. |
| D. Draft Invoice paid without send | PASS | A local Customer/property launched a $123 saved Draft Invoice from the normal Draft-first path. `Mark Paid` recorded one full check payment without any send or Stripe request, persisted actor/date/reference/note and exact Customer/property lineage, reloaded as Paid with $0 due and one immutable history row, blocked a second payment action, and downloaded the Paid PDF. Exact cleanup restored the Sandbox baseline. |
| E. Correction/exception | PASS | Paid Invoices expose immutable payment history without another Record payment action; reload preserved exact totals and no duplicate payment was posted. |

## Findings

### CWA-001 - BUG - Medium - Local Customer creation races workspace loading

- Reproduction: open a local Customer creation surface before the contractor workspace Draft identity has loaded, enter a name, and click the enabled save action.
- Expected: save remains unavailable until the authoritative workspace identity exists.
- Actual: the click reaches a client guard and reports that Customer creation is unavailable; no RPC is issued.
- Root cause: four Customer creation actions considered only form text/saving state, while the mutation also requires `contractorDraft.id`.
- Correction: all four actions now remain disabled and say `Loading workspace...` until the required identity exists.
- Regression: `contractor-create-customer.spec.ts` waits for the usable action and completes the real RPC path.

### CWA-002 - BUG - High - Secure local delivery link can disappear before capture

- Reproduction: issue a secure local Estimate or Invoice link when clipboard auto-copy is unavailable.
- Expected: the one-time dialog remains visible until the contractor captures the only returned bearer value.
- Actual: the successful mutation immediately refreshed the parent record, which could unmount the panel/dialog and discard the one-time URL.
- Root cause: `onEstimateChanged` / `onInvoiceChanged` ran before the one-time dialog closed.
- Correction: successful issue defers the parent refresh until the contractor closes the dialog. Rotation, revocation, digest-only persistence, and one-time token handling are unchanged.
- Regression: the not-connected lifecycle requires both one-time dialogs to stay visible, reads each URL, closes the Invoice dialog, and continues through recipient access and Paid.

### CWA-003 - UX FRICTION - Low - Paid Invoice route is mislabeled as open-only

- Reproduction: pay a sent local-customer Invoice in full, reload, and look for a closed/paid destination from Jobs.
- Expected: the overview clearly identifies where closed/paid records live.
- Actual: the tile is described as `Open invoice records`, but selecting it opens the all-status list where the Paid filter successfully reaches the Invoice, history, and PDF. The Customer financial summary also does not surface this paid Invoice.
- Root cause: overview wording/count semantics do not describe the broader list they open.
- Correction in review: the Jobs Invoice tile now counts all Invoice records and states the open/Paid split instead of describing an all-status destination as open-only. The Invoice list adds direct All/Open/Paid groups while preserving every detailed status filter. Customer profiles use canonical Invoice records, show open/Paid counts beside Estimates, reopen exact financial records, and retain a Customer-profile return path.
- Validation status: typecheck and focused source/UI contract coverage pass. Exact Sandbox browser validation remains required before this finding can move to Fixed; the approved local Sandbox Owner/Admin/Office credentials were stale when the correction was prepared, so no fixture or environment mutation occurred.
- Regression: the connected and not-connected lifecycle coverage now includes Customer-profile financial discovery and exact Paid-Invoice navigation, but its new assertions must pass against Sandbox before merge.

### CWA-004 - TEST GAP - Medium - Core lifecycle stopped before payment

- Reproduction: run the historical full-core-loop spec.
- Expected: beta-critical billing coverage proves payment, reload, balance, history, Paid PDF, and mixed partial/full settlement.
- Actual: coverage stopped after Invoice send and jumped to Home History.
- Correction: the connected lifecycle now covers full check payment and a separate external-ACH partial plus cash final payment, including reload and immutable history assertions.

### CWA-005 - TEST GAP - High - No real not-connected lifecycle coverage

- Reproduction: inspect the prior browser suite.
- Expected: one integrated path proves contractor-created Customer identity, request-free Estimate acceptance, Job handoff, request-free Invoice delivery, and offline payment against persisted Sandbox state.
- Actual: components and gateways had focused coverage, but no browser journey connected them.
- Correction: `contractor-local-customer-lifecycle.spec.ts` exercises the real handlers, recipient UI, canonical mutations, browser reopen, payment history, Paid PDF, and exact cleanup.

### CWA-006 - FIXED - Draft Invoice can be paid in full without send

- Correction: eligible saved Draft Invoices expose `Mark Paid`; the amount is locked to the server-authoritative full remaining balance, and the existing offline-payment RPC atomically records one immutable payment and finalizes the Invoice as Paid.
- Validation: actual Sandbox UI coverage proved Customer/property lineage, full-balance enforcement, actor/date/method/reference/note persistence, reload durability, one-row history, zero balance, Paid PDF download, no send/provider request, and no second payment action. The exact migration is applied in Sandbox, Demo, and Production with preserved target data fingerprints.

### CWA-007 - INCONSISTENCY - Low - QA guide understated existing coverage

- Actual: the guide listed the full core loop as both covered and a recommended future addition, and said Estimate acceptance/payment were not covered.
- Correction: the guide now distinguishes connected, not-connected, offline payment, provider-payment, mobile, and closed-record gaps accurately.

### CWA-008 - TEST GAP - Low - Paid PDF Preview/download parity is not compared in the lifecycle

- Reproduction: complete either lifecycle through Paid and inspect the automated document assertions.
- Expected: the browser journey compares the interactive Preview presentation with the downloaded Paid PDF content.
- Actual: both connected and not-connected journeys prove a successful Paid PDF download, and focused PDF coverage protects the shared generator, but the lifecycle does not compare Preview and Download artifacts directly.
- Status: unresolved. Add bounded browser document-content comparison when a stable Preview assertion contract is available; do not infer parity merely from a successful download.

## Cleanup And Boundaries

Every completed lifecycle records exact fixture identities and removes only those records after execution. The audit also removed exact interrupted-run records carrying the audit's `E2E Core Loop`, `E2E Partial Payment`, and `E2E Test Customer` timestamp prefixes, then verified zero matching residue. Scenario D returned Sandbox to 84 Invoices, zero offline payments, and zero invoice-paid events. The reviewed function migration was applied without environment, Stripe, authentication, or ad hoc business-data changes; Demo retained zero Invoices and Production retained its exact 12-Invoice financial fingerprint.

## PR #417 Boundary

PR #417 owns the completed Draft Invoice full offline-payment correction and migration rollout. It preserves the #419 Customer-readiness and secure-delivery fixes, existing sent/viewed/overdue/partially-paid behavior, CWA-003 as a bounded low-severity discoverability follow-up, and CWA-008 as a bounded PDF Preview/download comparison gap.
