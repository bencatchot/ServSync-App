# ServSync Load Testing

ServSync load testing is split into safe public anonymous checks and future sandbox-only authenticated checks. This tooling is intentionally guarded so it cannot accidentally create users, mutate production data, upload files, or run authenticated production traffic.

## Tool Choice

Use k6 for protocol-level load testing. k6 can simulate hundreds or thousands of HTTP virtual users without launching hundreds or thousands of browsers. Playwright remains the right tool for UI smoke tests, authenticated workflow checks, and visual/browser behavior, but it should not be the primary 1,000-user load driver.

Protocol-level virtual users are not the same as real browser users. The public k6 script requests the public app shell and approved public routes at the HTTP level. It does not execute React, run client-side routing, sign in, click buttons, or upload files.

## Approved Scenarios In This Slice

Approved now:

- Anonymous public route checks only.
- Sandbox-only authenticated read-load checks with approved local credentials.
- No writes.
- No uploads.
- No service request, estimate, invoice, job, document, notification, Stripe, email, or other external side-effect creation or mutation.

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

Sandbox authenticated read-only tests require:

```bash
LOAD_TEST_TARGET_ENV=sandbox-auth
LOAD_TEST_BASE_URL=<sandbox-or-preview-url>
LOAD_TEST_SUPABASE_URL=https://zpzdkoaubyjtsomccxya.supabase.co
LOAD_TEST_SUPABASE_ANON_KEY=<sandbox anon key>
LOAD_TEST_AUTH_READ_ONLY=true
LOAD_TEST_AUTH_PROFILE=homeowner|contractor|mixed
LOAD_TEST_CREDENTIALS_FILE=tests/load/.local/sandbox-auth-credentials.json
```

Authenticated scenarios block:

- `https://servsync.app`
- `https://www.servsync.app`
- production Supabase ref `uqgtheclhxqlnjpfmheq`

Authenticated scenarios currently allow only sandbox Supabase ref `zpzdkoaubyjtsomccxya`.

The sandbox credentials file must be local-only and must never be committed. A placeholder example lives at:

```text
tests/load/.local/sandbox-auth-credentials.example.json
```

Real credentials must use:

```text
tests/load/.local/sandbox-auth-credentials.json
```

Format:

```json
{
  "homeowners": [
    {
      "email": "homeowner-load-001@example.test",
      "password": "replace-me"
    }
  ],
  "contractors": [
    {
      "email": "contractor-load-001@example.test",
      "password": "replace-me"
    }
  ]
}
```

Use approved sandbox accounts only. Do not use production users, real beta users, service-role keys, or credentials from committed files.

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

## Sandbox Authenticated Read-Only Testing

The script `npm run load:sandbox:auth-read` runs direct Supabase REST/RPC read-only checks against the sandbox project only. It signs in each approved sandbox credential once during k6 `setup()`, keeps access tokens in memory for that run, and reuses those tokens inside the virtual-user loop. It does not write token files, seed records, create users, upload files, or mutate app state.

Tiny sandbox read-only smoke:

```bash
LOAD_TEST_ALLOW=true \
LOAD_TEST_TARGET_ENV=sandbox-auth \
LOAD_TEST_AUTH_READ_ONLY=true \
LOAD_TEST_AUTH_PROFILE=mixed \
LOAD_TEST_BASE_URL=<sandbox-or-preview-url> \
LOAD_TEST_SUPABASE_URL=https://zpzdkoaubyjtsomccxya.supabase.co \
LOAD_TEST_SUPABASE_ANON_KEY=<sandbox anon key> \
LOAD_TEST_CREDENTIALS_FILE=tests/load/.local/sandbox-auth-credentials.json \
npm run load:sandbox:auth-read
```

Recommended ramp order after a clean tiny run:

1. `tiny`
2. `5`
3. `10`
4. `25`
5. Pause and review Supabase metrics before any higher stage.

The existing `500` and `1000` profiles still require separate manual approval and `LOAD_TEST_HIGH_VU_APPROVED=true`.

`LOAD_TEST_AUTH_PROFILE` controls which account type each iteration reads:

- `homeowner`: read only the homeowner bundle.
- `contractor`: read only the contractor bundle.
- `mixed`: alternate homeowner and contractor bundles by iteration. This is the default.

The v1 sandbox read bundles intentionally use a narrow core endpoint set.

Homeowner v1 includes:

- `homeowner_profiles`
- `homes`
- `servsync_get_homeowner_connections`
- `servsync_homeowner_service_requests`
- `estimates`
- `invoices`
- `home_reminders`

Contractor v1 includes:

- `contractor_profiles`
- `servsync_current_contractor_profile`
- `servsync_contractor_connected_homeowners`
- `servsync_contractor_service_requests`
- `inspections`
- `estimates`
- `invoices`
- `estimate_templates`
- `contractor_saved_estimate_charges`

The v1 sandbox read bundles intentionally skip:

- auth signup,
- writes or status changes,
- notifications,
- support inquiries,
- documents,
- Home History / maintenance-log reads,
- public contractor directory scans,
- homeowner invite leads,
- contractor invites,
- pending connection requests,
- contractor team reads,
- contractor service areas,
- inspection templates,
- contractor visit/calendar events,
- contractor local contacts,
- notification read marking,
- service request/estimate/job/invoice creation,
- document uploads, signed URL/download stress, and storage writes,
- email, Stripe, geocoding, AI, notification webhooks, and Edge Function side effects,
- line-item nested payload stress beyond top-level estimate/invoice reads.

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
