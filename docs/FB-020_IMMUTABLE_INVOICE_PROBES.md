# FB-020 Immutable Invoice Direct-Mutation Probes

Status: sandbox-only probe coverage for immutable invoice hardening.

These probes document and verify the FB-020 Slice 4 immutable invoice boundary: billing-authorized users should only directly edit invoice records while an invoice is a draft. After the FB-020 Slice 4B SQL patch is applied to a target Supabase project, direct table mutations after customer-facing statuses should be denied.

## What The Probes Check

The probe file is `tests/e2e/fb020-immutable-invoice-probes.spec.ts`.

It verifies:

- direct invoice update attempts after `sent`, `paid`, and `void`,
- direct invoice-line insert/update attempts after `sent`, `paid`, and `void`,
- direct draft invoice update and draft line insert/update/delete still work,
- approved lifecycle RPCs still work for send, homeowner view, mark paid, and void,
- homeowner non-draft invoice/line visibility remains available,
- homeowner draft invoice visibility remains blocked.

## Run Command

Run only against a local, preview, or sandbox app target backed by sandbox Supabase project `zpzdkoaubyjtsomccxya`:

```bash
FB020_IMMUTABLE_INVOICE_PROBES=true \
TEST_APP_URL=http://localhost:5173 \
npx playwright test tests/e2e/fb020-immutable-invoice-probes.spec.ts --project=chromium
```

The probes refuse production Supabase URLs and require the local Supabase CLI link to point at sandbox project `zpzdkoaubyjtsomccxya` before creating or cleaning up exact sandbox records.

## Required Fixtures

Required environment variables:

- `TEST_CONTRACTOR_EMAIL`
- `TEST_CONTRACTOR_PASSWORD`
- `TEST_HOMEOWNER_EMAIL`
- `TEST_HOMEOWNER_PASSWORD`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The contractor fixture must resolve to a billing-authorized contractor owner. The homeowner fixture is used only for sandbox invoice visibility and lifecycle RPC checks.

## Interpretation

Recommended v1 behavior:

- direct table edits are allowed only while invoices are `draft`,
- direct table edits to `sent`, `viewed`, `overdue`, `partially_paid`, `paid`, and `void` invoices should be denied,
- explicit RPCs remain the allowed path for send, homeowner view, mark paid, and void transitions,
- corrections should happen through void-and-reissue rather than editing customer-facing invoice records.

Before the immutable invoice SQL/RLS hardening slice is applied to a target Supabase project, the customer-facing direct-mutation probes may be expected-red. After the Slice 4B SQL patch is applied, any `observed=allowed` result for non-draft invoice or line mutation is a regression.

## Cleanup

The probes create only exact sandbox invoices with Codex/FB-020 labels and clean them by exact invoice IDs. Cleanup also removes linked notifications, invoice backlog rows, and invoice line rows for those exact invoices. The cleanup path fails closed unless the Supabase CLI is linked to the approved sandbox project.
