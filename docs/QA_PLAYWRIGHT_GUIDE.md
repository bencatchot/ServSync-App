# ServSync QA and Playwright Guide

Internal guide for running local QA checks and Playwright browser tests before commits, preview reviews, deploys, and private beta testing.

## Operating Model

ServSync uses three different QA modes:

- Local static checks for every implementation branch.
- Authenticated Playwright checks against localhost, Vercel Preview, or another approved sandbox URL.
- Production public smoke checks only, unless dedicated production smoke accounts are approved later.

Authenticated Playwright tests must not run against production `servsync.app`. The test environment helper blocks production hosts for authenticated tests. Production checks should stay public/read-only unless a separate production-smoke-account policy is approved.

## Standard Local QA

Use:

```bash
npm run qa
```

This runs:

- `npm run typecheck`
- `npm run build`

Use this before normal commits and deploys. It does not require Playwright credentials.

## Playwright Configuration

Playwright currently runs one desktop Chromium project:

- viewport: `1440 x 1000`
- workers: `1`
- screenshots/videos/traces retained on failure
- optional Vercel Preview bypass header support through `VERCEL_AUTOMATION_BYPASS_SECRET`

Mobile coverage starts with one read-only smoke spec that uses test-local mobile device emulation. There is intentionally no broad global mobile Playwright project yet because mutating/core-loop tests should not run across every mobile project automatically.

## Required Environment Variables

Set these in your local shell or `.env.test.local` before running Playwright:

- `TEST_APP_URL`
- `TEST_CONTRACTOR_EMAIL`
- `TEST_CONTRACTOR_PASSWORD`
- `TEST_HOMEOWNER_EMAIL`
- `TEST_HOMEOWNER_PASSWORD`
- `VERCEL_AUTOMATION_BYPASS_SECRET` when testing a protected Vercel Preview

Never commit credentials. Do not paste passwords, tokens, bypass secrets, or service keys into chat, GitHub, docs, screenshots, traces, or test logs.

When using `.env.test.local`, load it locally and verify required variable names exist without printing values.

## Safe TEST_APP_URL Values

Use authenticated Playwright tests only against:

- `http://localhost:<port>`
- `http://127.0.0.1:<port>`
- Vercel Preview URLs
- staging/sandbox URLs

Do not use production:

- `https://servsync.app`
- `https://www.servsync.app`

The test helper intentionally refuses production hosts for authenticated Playwright. Production should be checked with public/read-only smoke steps unless production smoke accounts are separately approved.

## Read-Only Smoke Tests

Use:

```bash
npm run qa:e2e:readonly
```

This runs:

- `tests/e2e/contractor-smoke.spec.ts`
- `tests/e2e/homeowner-smoke.spec.ts`

Coverage:

- contractor login
- homeowner login
- dashboard load
- primary navigation
- Support/feedback entry points
- current homeowner-facing Home History wording
- major console error capture

## Production Public Smoke

Use this only for unauthenticated, read-only production checks:

```bash
TEST_APP_URL="https://servsync.app" npm run qa:e2e:production-public-smoke
```

This runs:

- `tests/e2e/production-public-smoke.spec.ts`

Coverage:

- public landing page loads
- homeowner and contractor auth routes render without signing in
- public Terms, Privacy, Acceptable Use, and Trust & Safety routes load
- document navigation succeeds
- page title and public content render
- major console/page errors are captured

This spec must not sign in, require secrets, create users, mutate production records, upload files, apply SQL, change settings, or manually deploy. Authenticated production smoke remains blocked until dedicated production smoke accounts, credential storage, allowed actions, and cleanup/no-cleanup rules are approved.

## Mobile Read-Only Smoke

Use:

```bash
npm run qa:e2e:mobile
```

This runs:

- `tests/e2e/mobile-smoke.spec.ts`

Coverage:

- homeowner mobile login/dashboard load
- homeowner mobile drawer navigation to Service Requests, Estimates / Invoices, Home History, and Calendar
- homeowner Home Reminders visibility through Dashboard/Home History surfaces
- contractor mobile login/dashboard load
- contractor mobile drawer navigation to Homeowners, Service Requests, Jobs, Calendar, and Business Profile
- basic no-obvious-horizontal-overflow checks on the covered mobile screens
- major console error capture

This test is read-only and authenticated. Run it only against localhost, Vercel Preview, or another approved sandbox URL. Do not use a broad mobile project to run mutating tests, full core-loop tests, or production authenticated checks.

## Mutating Sandbox Tests

Use:

```bash
npm run qa:e2e:mutating
```

This runs:

- `tests/e2e/contractor-create-customer.spec.ts`
- `tests/e2e/contractor-create-job.spec.ts`
- `tests/e2e/contractor-create-estimate.spec.ts`
- `tests/e2e/contractor-create-invoice.spec.ts`
- `tests/e2e/contractor-finalize-report.spec.ts`
- `tests/e2e/discover-geocoding-radius.spec.ts`

Coverage:

- contractor creates a clearly named local E2E customer
- contractor creates an E2E service job
- contractor creates an E2E estimate draft
- contractor creates an E2E invoice draft
- contractor creates and finalizes an E2E checklist/report job
- contractor creates Discover content and validates geocoding/radius behavior

Mutating tests call `requireApprovedSandboxForMutation()`. They should run only against localhost, preview, staging, or another approved sandbox URL. They do not delete records. Clearly named E2E data is expected in sandbox.

## Heavier Integration Tests

Some tests are intentionally not part of `npm run qa:e2e:mutating` because they are broader, slower, or need more stable sandbox data.

Current heavier integration coverage:

- `tests/e2e/invoice-notification.spec.ts`
  - contractor creates a claim invite
  - homeowner accepts the invite
  - contractor creates and sends an invoice
  - homeowner receives the invoice notification
  - verifies contractor does not receive the homeowner notification
- `tests/e2e/standalone-calendar-event.spec.ts`
  - contractor creates, opens, edits, and deletes a standalone calendar event

Run these deliberately when validating notification/calendar behavior:

```bash
npx playwright test tests/e2e/invoice-notification.spec.ts
npx playwright test tests/e2e/standalone-calendar-event.spec.ts
```

## Full Playwright Suite

Use:

```bash
npm run qa:e2e
```

This runs:

- `npm run typecheck`
- `npm run build`
- all Playwright tests in `tests/e2e`

Use this for broader beta-critical validation after sandbox data and credentials are ready. Do not run it against production.

## Example Commands

Local or preview read-only smoke:

```bash
set -a
source .env.test.local
set +a
TEST_APP_URL="https://your-vercel-preview-url.vercel.app" npm run qa:e2e:readonly
```

Local or preview mutating suite:

```bash
set -a
source .env.test.local
set +a
TEST_APP_URL="https://your-vercel-preview-url.vercel.app" npm run qa:e2e:mutating
```

Single focused test:

```bash
set -a
source .env.test.local
set +a
TEST_APP_URL="http://localhost:5173" npx playwright test tests/e2e/homeowner-smoke.spec.ts
```

Use placeholder values only in docs. Real values belong in local environment files or a password manager, never in commits or reports.

## Current Covered Flows

- contractor smoke navigation
- homeowner smoke navigation
- mobile read-only homeowner/contractor navigation smoke
- support/feedback entry-point smoke checks
- contractor creates local E2E customer
- contractor creates E2E service job
- contractor creates E2E estimate draft
- contractor creates E2E invoice draft
- contractor finalizes E2E checklist/report job
- contractor Discover geocoding/radius coverage
- contractor standalone calendar event create/edit/delete, when run directly
- connected-homeowner invoice notification flow, when run directly
- unauthenticated production public route smoke through `tests/e2e/production-public-smoke.spec.ts`
- full homeowner request -> contractor estimate -> homeowner approval -> job -> invoice -> Home History -> reminder flow, when run directly
- RLS/cross-user access-boundary checks, when run directly

## Current Not Covered Yet

- homeowner estimate accept/decline E2E path
- Home Reminder create/complete/dismiss E2E path
- RLS/cross-user browser-level negative tests beyond direct Supabase client checks
- mobile full workflow automation
- production smoke accounts
- payment/Stripe flows
- QuickBooks or external accounting integrations

## Recommended Next Test Additions

1. Add a sandbox-only full core-loop E2E test:
   Homeowner Request -> Contractor Estimate -> Homeowner Approval -> Job -> Completion -> Invoice -> Home History -> Reminder.

2. Add a focused invoice-to-Home-History E2E test:
   file eligible invoice once, confirm no duplicate after repeat action, verify Home History entry.

3. Add a Home Reminders E2E test:
   create manual reminder, complete it, dismiss another, and confirm contractor UI does not expose homeowner reminder management.

4. Add RLS/cross-user checks:
   use secondary homeowner/contractor accounts to confirm unrelated records are not visible.

5. Expand mobile QA carefully:
   keep the first automated layer read-only, then add targeted mobile workflow checks only after manual beta QA identifies the riskiest screens.

## Sandbox Test Data Rules

- Use clearly labeled records such as `E2E Test Customer`, `E2E Test Job`, `E2E Test Estimate`, and `PR Preview Test`.
- Prefer app UI and existing workflows over direct SQL.
- Use direct sandbox SQL only after separate approval.
- Do not create fake/demo production data.
- Do not run mutating tests against real beta user data.

## When A Test Fails

Start with the terminal error. Then open the Playwright report:

```bash
npm run test:e2e:report
```

Inspect the screenshot, video, and trace for the failing test. Decide whether the failure is:

- an app bug
- a stale deployment
- a brittle selector
- a missing environment variable
- a test data issue
- a sandbox schema/data mismatch

Fix the root cause before rerunning the test. Do not weaken tests into generic waits unless the UI really has no better signal.

## Safety Notes

- Authenticated testing belongs in sandbox/preview.
- Production smoke is public/read-only until production smoke accounts are approved.
- Public production smoke must stay unauthenticated and non-mutating.
- Test credentials stay in environment variables or a password manager.
- Screenshots, videos, traces, and Playwright reports must not be committed.
- E2E-created sandbox records are allowed to remain if clearly labeled.
