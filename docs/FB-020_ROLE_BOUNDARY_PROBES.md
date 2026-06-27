# FB-020 Role-Boundary Money-Action Probes

Status: sandbox-only probe coverage for contractor team role boundaries.

These probes began as FB-020 Slice 3A exposure probes and were tightened in Slice 3B to assert the approved v1 contractor billing boundary after the sandbox SQL fix is applied.

## What The Probes Check

The probe file is `tests/e2e/fb020-role-boundary-money-probes.spec.ts`.

It verifies whether configured sandbox contractor team roles can:

- create draft invoices,
- send invoices,
- void invoices,
- mark invoices paid,
- create partial invoices,
- create or update price-bearing manual work items,
- perform viewer write/money actions,
- perform cross-contractor money actions,
- perform disabled-team-member money actions when a disabled fixture exists.

## Run Command

Run only against local, preview, or sandbox app targets backed by the sandbox Supabase project `zpzdkoaubyjtsomccxya`:

```bash
FB020_ROLE_BOUNDARY_PROBES=true \
TEST_APP_URL=http://localhost:5173 \
npx playwright test tests/e2e/fb020-role-boundary-money-probes.spec.ts --project=chromium
```

The probes refuse production Supabase URLs and use the repo's existing mutating-test sandbox guard.

## Required Fixtures

Required environment variables:

- `TEST_CONTRACTOR_EMAIL`
- `TEST_CONTRACTOR_PASSWORD`
- `TEST_HOMEOWNER_EMAIL`
- `TEST_HOMEOWNER_PASSWORD`
- `TEST_CONTRACTOR_B_EMAIL`
- `TEST_CONTRACTOR_B_PASSWORD`
- `TEST_CONTRACTOR_FIELD_TECH_EMAIL`
- `TEST_CONTRACTOR_FIELD_TECH_PASSWORD`
- `TEST_CONTRACTOR_VIEWER_EMAIL`
- `TEST_CONTRACTOR_VIEWER_PASSWORD`

Optional environment variables:

- `TEST_CONTRACTOR_ADMIN_EMAIL`
- `TEST_CONTRACTOR_ADMIN_PASSWORD`
- `TEST_CONTRACTOR_OFFICE_EMAIL`
- `TEST_CONTRACTOR_OFFICE_PASSWORD`
- `TEST_CONTRACTOR_DISABLED_EMAIL`
- `TEST_CONTRACTOR_DISABLED_PASSWORD`

Fixture expectations:

- The owner, field tech, viewer, optional admin, optional office, and optional disabled team member should all resolve to the same sandbox contractor profile.
- `contractorB` should resolve to a different sandbox contractor profile for cross-contractor denial probes.
- The disabled fixture, if configured, should have an inactive/disabled team membership for the owner contractor account.

## Interpretation

Recommended v1 behavior:

- `owner`, `admin`, and `office` may perform contractor billing actions.
- `field_tech` may perform job execution actions but should not perform invoice, paid/void/send, pricing, or customer financial term actions.
- `viewer` should be read-only.

After the FB-020 Slice 3B SQL patch, any `observed=allowed` result for a `field_tech`, `viewer`, disabled team member, or cross-contractor money action is a test failure. Owner, admin, and office fixtures should retain representative billing access.

Before the Slice 3B SQL patch is applied to a target Supabase project, these probes are expected to fail if that project still allows `field_tech` money actions.

## Cleanup

The probes create only exact sandbox records with Codex/FB-020 labels and clean them by exact IDs. Cleanup uses a sandbox-link check before issuing exact-ID cleanup SQL for non-draft invoices or related rows that normal authenticated RLS cannot delete.
