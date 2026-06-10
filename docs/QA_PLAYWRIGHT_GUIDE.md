# ServSync QA and Playwright Guide

Internal guide for running local QA checks and Playwright browser tests before commits, deploys, and private beta testing.

## Standard local QA

Use:

```bash
npm run qa
```

This runs:

- `npm run typecheck`
- `npm run build`

Use this before normal commits and deploys. It does not require Playwright credentials.

## Playwright smoke tests

Use:

```bash
npm run qa:e2e:readonly
```

This runs the read-only smoke tests for contractor and homeowner accounts. These tests check login, dashboard loading, major navigation, and feedback/support entry points.

These tests require the Playwright environment variables listed below.

## Playwright mutating tests

Use:

```bash
npm run qa:e2e:mutating
```

These tests create E2E test data in the target app environment. Current mutating coverage includes:

- contractor creates a local E2E customer
- contractor creates an E2E service job
- contractor creates an E2E estimate draft

The mutating tests do not delete records. Junk E2E data is expected in sandbox/staging. Test-created records should use clear names such as `E2E Test Customer`.

## Full Playwright suite

Use:

```bash
npm run qa:e2e
```

This runs:

- `npm run typecheck`
- `npm run build`
- all Playwright tests

Use this when preparing a broader deploy or validating a beta-critical flow. It requires the Playwright environment variables listed below.

## Required Environment Variables

Set these in your terminal before running Playwright tests:

- `TEST_APP_URL`
- `TEST_CONTRACTOR_EMAIL`
- `TEST_CONTRACTOR_PASSWORD`
- `TEST_HOMEOWNER_EMAIL`
- `TEST_HOMEOWNER_PASSWORD`

Never commit credentials. Use fake test accounts. Set credentials in the terminal only, and do not paste passwords into chat, GitHub, docs, screenshots, or test logs.

## Example Commands

Read-only smoke tests:

```bash
TEST_APP_URL="https://servsync.app" \
TEST_CONTRACTOR_EMAIL="contractor-test@example.com" \
TEST_CONTRACTOR_PASSWORD="placeholder-password" \
TEST_HOMEOWNER_EMAIL="homeowner-test@example.com" \
TEST_HOMEOWNER_PASSWORD="placeholder-password" \
npm run qa:e2e:readonly
```

Mutating tests:

```bash
TEST_APP_URL="https://servsync.app" \
TEST_CONTRACTOR_EMAIL="contractor-test@example.com" \
TEST_CONTRACTOR_PASSWORD="placeholder-password" \
TEST_HOMEOWNER_EMAIL="homeowner-test@example.com" \
TEST_HOMEOWNER_PASSWORD="placeholder-password" \
npm run qa:e2e:mutating
```

Full suite:

```bash
TEST_APP_URL="https://servsync.app" \
TEST_CONTRACTOR_EMAIL="contractor-test@example.com" \
TEST_CONTRACTOR_PASSWORD="placeholder-password" \
TEST_HOMEOWNER_EMAIL="homeowner-test@example.com" \
TEST_HOMEOWNER_PASSWORD="placeholder-password" \
npm run qa:e2e
```

Use placeholder values only in docs. Real values belong in your local terminal environment.

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

Fix the root cause before rerunning the test. Do not weaken tests into generic waits unless the UI really has no better signal.

## Current Covered Flows

- contractor smoke navigation
- homeowner smoke navigation
- contractor creates local E2E customer
- contractor creates E2E service job
- contractor creates E2E estimate draft

## Current Not Covered Yet

- invoice creation
- report finalization
- homeowner viewing contractor-created estimate/report/invoice
- invite/claim flow
- document upload
- mobile viewport tests
- payment flows

## Safety Notes

Mutating tests are allowed in sandbox/pre-production while ServSync has no real production data. Do not run mutating tests against real production data later without explicit approval.

E2E data should stay clearly labeled with names like `E2E Test Customer`, `E2E Test Job`, and `E2E Test Estimate`.
