# ServSync Load Testing

ServSync load testing is split into safe public anonymous checks and future sandbox-only authenticated checks. This tooling is intentionally guarded so it cannot accidentally create users, mutate production data, upload files, or run authenticated production traffic.

## Tool Choice

Use k6 for protocol-level load testing. k6 can simulate hundreds or thousands of HTTP virtual users without launching hundreds or thousands of browsers. Playwright remains the right tool for UI smoke tests, authenticated workflow checks, and visual/browser behavior, but it should not be the primary 1,000-user load driver.

Protocol-level virtual users are not the same as real browser users. The public k6 script requests the public app shell and approved public routes at the HTTP level. It does not execute React, run client-side routing, sign in, click buttons, or upload files.

## Approved Scenarios In This Slice

Approved now:

- Anonymous public route checks only.
- No login.
- No writes.
- No uploads.
- No service requests, estimates, invoices, jobs, documents, notifications, Stripe, email, or other external side effects.

Not approved yet:

- Authenticated production load tests.
- Sandbox credential seeding.
- Mutating workflow load tests.
- Service-role usage.
- Production fake users or fake records.
- 500 or 1,000 VU runs without separate manual approval.

## Required Environment Variables

All k6 scripts require an explicit allow flag:

```bash
LOAD_TEST_ALLOW=true
```

Public anonymous tests require:

```bash
LOAD_TEST_TARGET_ENV=production-public
LOAD_TEST_BASE_URL=https://servsync.app
```

Future sandbox authenticated tests require:

```bash
LOAD_TEST_TARGET_ENV=sandbox-auth
LOAD_TEST_BASE_URL=<sandbox-or-preview-url>
LOAD_TEST_SUPABASE_URL=https://zpzdkoaubyjtsomccxya.supabase.co
```

Authenticated scenarios block:

- `https://servsync.app`
- `https://www.servsync.app`
- production Supabase ref `uqgtheclhxqlnjpfmheq`

Authenticated scenarios currently allow only sandbox Supabase ref `zpzdkoaubyjtsomccxya`.

## Public Anonymous Commands

Tiny local/smoke-style run:

```bash
LOAD_TEST_ALLOW=true \
LOAD_TEST_TARGET_ENV=production-public \
LOAD_TEST_BASE_URL=https://servsync.app \
npm run load:public
```

25 VU public route run:

```bash
LOAD_TEST_ALLOW=true \
LOAD_TEST_TARGET_ENV=production-public \
LOAD_TEST_BASE_URL=https://servsync.app \
LOAD_TEST_STAGE_PROFILE=25 \
npm run load:public
```

100 VU public route run:

```bash
LOAD_TEST_ALLOW=true \
LOAD_TEST_TARGET_ENV=production-public \
LOAD_TEST_BASE_URL=https://servsync.app \
LOAD_TEST_STAGE_PROFILE=100 \
npm run load:public
```

250 VU public route run:

```bash
LOAD_TEST_ALLOW=true \
LOAD_TEST_TARGET_ENV=production-public \
LOAD_TEST_BASE_URL=https://servsync.app \
LOAD_TEST_STAGE_PROFILE=250 \
npm run load:public
```

500 and 1,000 VU runs require separate manual approval:

```bash
LOAD_TEST_ALLOW=true \
LOAD_TEST_TARGET_ENV=production-public \
LOAD_TEST_BASE_URL=https://servsync.app \
LOAD_TEST_STAGE_PROFILE=500 \
LOAD_TEST_HIGH_VU_APPROVED=true \
npm run load:public
```

```bash
LOAD_TEST_ALLOW=true \
LOAD_TEST_TARGET_ENV=production-public \
LOAD_TEST_BASE_URL=https://servsync.app \
LOAD_TEST_STAGE_PROFILE=1000 \
LOAD_TEST_HIGH_VU_APPROVED=true \
npm run load:public
```

## Public Routes

The initial public route allowlist is:

- `/`
- `/#/home`
- `/#/terms`
- `/#/privacy`
- `/#/acceptable-use`
- `/#/trust-safety`

Hash routes are client-side routes, so protocol-level k6 requests still exercise the public app shell served by Vercel. Use Playwright separately when the goal is to verify rendered client-side route content.

Public contractor profile routes are intentionally deferred until a specific profile slug is approved as safe, public, and stable.

## Future Sandbox Authenticated Testing

The placeholder script `npm run load:sandbox:auth-read` exists only to preserve the guard shape. It does not log in or run authenticated load yet.

Future authenticated read-heavy testing should use:

- a sandbox-only credential pool,
- deterministic sandbox fixtures,
- no service-role credentials in committed files,
- no production hosts,
- no production Supabase ref,
- read-heavy scenarios before any write scenarios,
- explicit cleanup/reset strategy before any mutating load tests.

Seed scripts are not implemented in this slice. If added later, they must require a separate approval and hard guards such as `SERVSYNC_ALLOW_LOAD_SEED=true`, sandbox project verification, and deterministic cleanup.

## Avoiding External Side Effects

Before any future authenticated or mutating sandbox load run, confirm:

- email delivery is disabled or sandbox-only,
- notification webhooks are disabled or sandbox-only,
- Stripe/payment paths are not hit,
- geocoding/provider calls are avoided unless explicitly approved,
- file uploads and storage writes are excluded unless explicitly approved,
- no production users or records are used.

## Metrics To Watch

Vercel:

- request volume,
- 4xx/5xx rate,
- static asset/cache behavior,
- response time,
- bandwidth,
- deployment/runtime errors.

Supabase:

- API request rate,
- PostgREST latency/error rate,
- database CPU,
- connection pool usage,
- slow queries,
- RPC latency/error rate,
- Auth request rate/errors,
- Storage request rate and signed URL latency if storage is in scope.

## Validation

Run the static load-test safety check:

```bash
npm run load:check
```

Then run normal app validation before opening or merging load-test tooling changes:

```bash
npm run typecheck
npm run build
TEST_APP_URL=http://localhost:5173 npx playwright test --list
```
