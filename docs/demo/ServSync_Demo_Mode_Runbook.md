# ServSync Demo Mode Runbook

This runbook describes the hidden Demo Mode Slice 1 foundation for a dedicated ServSync demo environment. It is for internal operators preparing screenshots, screen recordings, onboarding videos, App Store previews, and sales demonstrations.

Demo Mode is not a public feature, not production data, and not a reset button inside the application. Slice 1 seeds one connected water-heater scenario into a dedicated demo Supabase project so the existing ServSync UI can show real records, permissions, and lifecycle behavior after logging in as the demo homeowner and contractor.

## Scope

Slice 1 includes:

- Private demo registry SQL: `demo_scenarios`, `demo_scenario_runs`, and `demo_scenario_records`.
- Private seed/reset/verify runner: `scripts/demo/seed-demo-scenario.mjs`.
- Dedicated demo auth identities, provisioned by the runner through the Supabase Admin API.
- One fictional homeowner, one fictional contractor company, one fictional property, an active connection, a water-heater service request, an accepted estimate, and a job created from that accepted estimate.
- Current-looking dates generated from a reset-time anchor.

Slice 1 excludes:

- Production SQL application.
- Shared sandbox use.
- User-facing Demo Mode UI.
- Role switching, impersonation, or browser-side privileged reset tools.
- Job progress, job completion, invoice creation/sending, Home History filing, reminders, messages beyond required workflow records, media, documents, storage uploads, presentation mode, screenshots, or screen recording automation.
- Email, SMS, push, payment, webhook, accounting sync, AI, geocoding, or external calendar activity.

## Dedicated Environment Requirement

The runner must target a dedicated demo Supabase project and a dedicated demo Vercel environment. It refuses the known ServSync production and shared sandbox refs by default.

Known forbidden refs:

- Production: `uqgtheclhxqlnjpfmheq`
- Shared sandbox: `zpzdkoaubyjtsomccxya`

Do not run the seed/reset/verify commands against production or the shared sandbox. Do not place a service-role key in frontend code or browser-accessible environment variables.

## Required Environment Variables

Values are intentionally omitted from this runbook.

- `DEMO_MODE_ENABLED`
- `DEMO_SUPABASE_URL`
- `DEMO_SUPABASE_PROJECT_REF`
- `DEMO_SUPABASE_ANON_KEY`
- `DEMO_SUPABASE_SERVICE_ROLE_KEY`
- `DEMO_HOMEOWNER_EMAIL`
- `DEMO_HOMEOWNER_PASSWORD`
- `DEMO_CONTRACTOR_EMAIL`
- `DEMO_CONTRACTOR_PASSWORD`
- `DEMO_RESET_ACKNOWLEDGE` for reset only
- `DEMO_ANCHOR_TIMESTAMP` optional

The runner also refuses to proceed if these external-effect flags are set to `true` in the process environment:

- `EMAIL_ENABLED`
- `STRIPE_ENABLED`
- `SMS_ENABLED`
- `PUSH_NOTIFICATIONS_ENABLED`
- `WEBHOOK_DELIVERY_ENABLED`
- `QUICKBOOKS_ENABLED`
- `ACCOUNTING_SYNC_ENABLED`
- `AI_ENABLED`
- `GEOCODING_ENABLED`

No email, SMS, push, payment, webhook, AI, geocoding, storage upload, or deployment action is part of Slice 1.

## One-Time SQL Preparation

Apply `servsync-demo-mode-foundation.sql` only to the dedicated demo Supabase project after separate approval. Do not apply it to production or the shared sandbox.

The SQL creates private registry tables and internal helper functions. RLS is enabled on all registry tables, browser roles do not receive table access, and privileged helper functions are not executable by `public`, `anon`, or `authenticated`.

## Commands

Run commands only from the repository root after loading the dedicated demo environment.

```bash
npm run demo:seed
npm run demo:verify
DEMO_RESET_ACKNOWLEDGE=reset-water_heater_core_loop npm run demo:reset
```

The command output reports safe identifiers and record counts. It must not print passwords, tokens, access keys, or full sensitive environment values.

## Scenario Contents

Scenario key:

- `water_heater_core_loop`

Fictional homeowner:

- Sarah Johnson
- `example.test` email address
- Reserved `555-01xx` phone number
- Fictional South Alabama property

Fictional contractor:

- Gulf Coast Home Services
- Fictional contractor owner
- `example.test` email address
- Reserved `555-01xx` phone number
- Plumbing / water-heater service categories where supported

Scenario records:

- Populated homeowner profile.
- Populated contractor profile/company.
- One property with a garage utility area and water-heater asset.
- Active homeowner-contractor connection with only the permissions needed for this workflow.
- Service request: `Replace leaking water heater`.
- Estimate with realistic fictional line items, notes, terms, and structured payment schedule rows.
- Homeowner acceptance through the existing estimate response RPC.
- Job creation through the existing accepted-estimate-to-job RPC.

All names, addresses, prices, and notes are fictional and presentation-safe. Demo pricing is not market guidance.

## Date Anchor Behavior

The runner uses a reset-time anchor timestamp. Relative dates are regenerated from the anchor so the demo remains current-looking:

- Profile/property records predate the scenario.
- Connection predates the request.
- Request appears about one day before the anchor.
- Estimate appears after the request.
- Estimate acceptance appears after the estimate is sent.
- Job creation appears after acceptance.

Use `DEMO_ANCHOR_TIMESTAMP` only when a recording needs a deterministic timestamp. Otherwise the runner uses the current time.

## Reset Safety

Reset is registry-based. The runner may delete only rows registered in `demo_scenario_records` for a specific run and only from the SQL allowlist of supported Slice 1 tables.

Reset does not:

- Truncate tables.
- Delete auth users.
- Delete demo public profiles or contractor company identity rows during ordinary scenario reset.
- Disable RLS.
- Delete records by user ID as a fallback.
- Touch unregistered records.
- Clean broad production or sandbox data.

If registry ownership is incomplete, stop and audit rather than adding an unsafe cleanup shortcut.

## Login and Recording Guidance

Use separate browser profiles or separate browsers for the homeowner and contractor identities. Do not use impersonation or frontend identity replacement.

Recommended recording order:

1. Log in as the demo homeowner to show the property and service request.
2. Log in as the demo contractor to show the connected request and accepted-estimate job handoff.
3. Return to the homeowner only where the seeded workflow already supports real homeowner visibility.

Slice 1 does not include presentation-safe mode, automatic screenshot capture, or public demo links.

## Troubleshooting

If seed fails:

- Confirm the dedicated demo SQL foundation was applied.
- Confirm `DEMO_MODE_ENABLED=true`.
- Confirm `DEMO_SUPABASE_URL` and `DEMO_SUPABASE_PROJECT_REF` point to the same dedicated demo project.
- Confirm the target is not production and not the shared sandbox.
- Confirm demo passwords are present but not printed.
- Confirm external-effect flags are not `true`.

If reset fails:

- Confirm `DEMO_RESET_ACKNOWLEDGE=reset-water_heater_core_loop`.
- Confirm the previous seed created a succeeded run.
- Do not perform broad manual deletes. Audit the registry rows first.

If repeated seed shows duplicates:

- Run `npm run demo:verify`.
- Confirm reset did not fail.
- Confirm all newly created rows were registered.
- Do not delete records by user ID as a shortcut.
- Remember that auth identities, public profiles, homeowner profile details, and contractor company identity rows are intentionally reconciled and preserved rather than reset/deleted.

## Adding Future Scenarios

Future scenarios should add a new stable scenario key, register every resettable record, use fictional `example.test` identities, avoid real customer data, and keep external delivery disabled unless a separately approved provider-test plan exists.
