# ServSync Contractor Workflow Audit

Date: 2026-08-11

Environment: Sandbox `zpzdkoaubyjtsomccxya`

Source baseline: `f2aa415a1ea344228b191be4760b9044d2981833`

## Result

All five required scenarios were attempted through actual contractor/customer browser paths and persisted Sandbox state. Connected full and partial offline-payment lifecycles passed through Paid. The not-connected Customer lifecycle passed from Customer creation through secure Estimate acceptance, Job completion, secure Invoice recipient access, and durable full payment. Draft Invoice Mark Paid remains unavailable on current main because draft PR #417 and its reviewed migration are not applied. No Production or Demo mutation occurred.

## Scenario Evidence

| Scenario | Result | Evidence |
| --- | --- | --- |
| A. Connected Customer lifecycle | PASS | Homeowner request, contractor Estimate, authenticated acceptance, Job, completed priced work, sent Invoice, full check payment, reload, immutable one-row payment history, Paid PDF, Home History filing, and reminder all passed. |
| B. Not-connected Customer lifecycle | PASS | Contractor created the Customer/property, launched a Draft-first Estimate, issued a secure exact-snapshot link, guest accepted, contractor created/completed the Job, issued a secure Invoice, recipient loaded it without an account, and contractor recorded full cash payment. Reload, the Jobs Invoice list Paid filter, immutable one-row history, and Paid PDF all passed. |
| C. Partial then full payment | PASS | A $40 external ACH payment persisted as Partially Paid with $85 due; a later $85 cash payment produced Paid with $0 due and exactly two immutable history rows. |
| D. Draft Invoice paid without send | BLOCKED | Current main offers no draft-payment action. Draft PR #417 implements the separately reviewed behavior but is conflicting and its migration remains unapplied in Sandbox, Demo, and Production. No overlapping change was made here. |
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
- Status: unresolved and recorded under FB-035. Correcting the overview information architecture is broader than a selector/copy patch in this audit.
- Regression: both connected and not-connected lifecycle tests reopen Paid through the current real route, preventing the functionality from being mistaken for absent.

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

### CWA-006 - MISSING CAPABILITY - High - Draft Invoice cannot be paid on current main

- Reproduction: create a draft Invoice and inspect its actions before send.
- Expected for the separately approved #417 scope: Record payment can settle the exact draft balance while preserving ledger/audit rules.
- Actual: current main requires Invoice send before manual payment.
- Ownership: draft PR #417. Its head is conflicting with current main and its migration is unapplied. This audit neither duplicates nor applies that work.

### CWA-007 - INCONSISTENCY - Low - QA guide understated existing coverage

- Actual: the guide listed the full core loop as both covered and a recommended future addition, and said Estimate acceptance/payment were not covered.
- Correction: the guide now distinguishes connected, not-connected, offline payment, provider-payment, mobile, and closed-record gaps accurately.

### CWA-008 - TEST GAP - Low - Paid PDF Preview/download parity is not compared in the lifecycle

- Reproduction: complete either lifecycle through Paid and inspect the automated document assertions.
- Expected: the browser journey compares the interactive Preview presentation with the downloaded Paid PDF content.
- Actual: both connected and not-connected journeys prove a successful Paid PDF download, and focused PDF coverage protects the shared generator, but the lifecycle does not compare Preview and Download artifacts directly.
- Status: unresolved. Add bounded browser document-content comparison when a stable Preview assertion contract is available; do not infer parity merely from a successful download.

## Cleanup And Boundaries

Every completed lifecycle records exact fixture identities and removes only those records after execution. The audit also removed exact interrupted-run records carrying the audit's `E2E Core Loop`, `E2E Partial Payment`, and `E2E Test Customer` timestamp prefixes, then verified zero matching residue. No migration, RLS, RPC, environment configuration, Stripe setting, Production record, or Demo record changed.

## PR #417 Boundary

PR #417 remains a separate draft for draft-Invoice full offline payment. It must resolve its current-main conflict and complete the reviewed migration rollout before Scenario D can pass. This audit reuses only the already-live sent-Invoice payment model and does not alter draft payment semantics.
