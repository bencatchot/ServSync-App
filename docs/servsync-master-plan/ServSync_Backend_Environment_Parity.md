# ServSync Backend Environment Parity

## Operating Rule

Production defines the supported ServSync backend schema. Demo should normally carry the same supported schema generation. Demo may add only reviewed, documented scenario infrastructure. Sandbox may contain approved experimental foundations, but those additions and any drift in Production-supported objects must remain visible.

This rule applies to backend schema and access contracts. It does not require environments to share business data, auth users, credentials, Vercel variables, feature flags, Presentation mode, rollout settings, entitlements, provider safeguards, or other operational configuration.

## Commands

The parity checker is an explicit controlled operator command. It is not a credentialed CI job.

```bash
# Production vs Demo and Sandbox
SUPABASE_ACCESS_TOKEN=... npm run backend:parity:check

# Supported peer only
SUPABASE_ACCESS_TOKEN=... npm run backend:parity:check -- --demo-only

# Experimental peer only
SUPABASE_ACCESS_TOKEN=... npm run backend:parity:check -- --sandbox-only

# Show every intentional/experimental child object
SUPABASE_ACCESS_TOKEN=... npm run backend:parity:check -- --verbose

# Local comparer and manifest tests; no live credentials
npm run backend:parity:test

# Repository rollout ledger; no live credentials
npm run backend:rollout:status
```

Load `SUPABASE_ACCESS_TOKEN` only from an approved secret store. Do not paste it into a command history, report, PR, screenshot, or committed file. The checker never prints it.

## Comparison Contract

The committed read-only query captures logical application catalog state for:

- `public` relations, ownership, persistence, and RLS enablement/forced state;
- columns by name, type, default, nullability, identity/generated state, and collation, without treating ordinal position as behavior;
- constraints, validation and deferrability;
- indexes and validity/readiness;
- non-internal triggers;
- `public` and application-owned `storage` policies;
- function overloads, argument names/types/defaults, return type, language, owner, security mode, volatility, strictness, configuration/search path, and canonical PostgreSQL definition;
- effective function and table ACLs, explicit column ACLs, grant options, and relevant global/`public` default ACLs.

The tool does not read or compare business rows, auth users, secrets, credentials, bucket contents, private record values, feature flags, entitlements, or environment-variable values. Supabase-managed `auth` and storage implementation internals are outside the schema comparison; ServSync-owned `storage.objects` policies remain included.

The fixed project identities live in `config/backend-environment-parity.json`. Before catalog access, the checker requires each project ref, project name, organization, and healthy state to match. Production, Demo, and Sandbox refs must be unique. The query is hardcoded, contains one `WITH`/`SELECT` statement, and is rejected locally if a mutating SQL keyword or second statement appears.

## Intentional Differences

`config/backend-environment-parity.json` is the only allowlist. A rule identifies an exact relation family, exact function overload, or exact category/object difference and carries a reviewable reason.

Current Demo exceptions are limited to:

- `public.demo_scenarios`;
- `public.demo_scenario_runs`;
- `public.demo_scenario_records`;
- the six exact trusted `servsync_demo_*` operator overloads;
- supporting columns, constraints, indexes, triggers, and ACLs scoped to those exact objects.

Project Collaboration is absent from Production and Demo, so it is not part of supported parity. Sandbox's six Project Collaboration tables, nine exact functions, and `inspections.project_id` link are recorded as an approved Sandbox-only experiment. The allowlist does not hide missing or changed Production-supported objects.

Results mean:

- `PASS — supported schema parity`: exact supported contract with no additions.
- `PASS WITH INTENTIONAL DIFFERENCES`: supported parity plus reviewed Demo additions.
- `PASS WITH SANDBOX-ONLY/EXPERIMENTAL DIFFERENCES`: supported parity plus visible Sandbox experiments.
- `FAIL — unexplained Production/<environment> drift`: a supported object is missing/different or Demo has an unreviewed addition.

Default output shows every unexplained finding and a bounded sample of intentional additions. `--verbose` prints the complete intentional/experimental inventory.

## Rollout Ledger

`config/backend-environment-rollouts.json` records each relevant bounded foundation or migration across Sandbox, Production, and Demo using only:

- `Applied`
- `Pending`
- `N/A`
- `Intentionally deferred`

Every state requires a reason. The ledger is operational visibility, not a migration engine and not proof of deployed state by itself. Update it only from verified rollout evidence. After an authorized database rollout, record which environments received it, why any environment was skipped, and whether Production/Demo parity passed.

Source-only work that has no database artifact may be `N/A` across all environments. Source-only PRs do not need live database access merely because this guard exists.

## Current Verified State

Read-only validation on 2026-08-06 established:

- Production vs Demo: `PASS WITH INTENTIONAL DIFFERENCES`. All 90 Production relations, 1,264 columns, 724 constraints, 403 indexes, 100 triggers, 218 policies, 287 functions, 968 function grants, 2,073 table grants, 80 column grants, and 96 expanded default-ACL grants match. Demo adds only 3 reviewed scenario relations, 6 reviewed operator functions, and their 120 supporting catalog entries.
- Production vs Sandbox: `FAIL — unexplained Production/sandbox drift`. The 297 approved Project Collaboration catalog additions are intentional, two additional Sandbox-only `storage.objects` policies remain visible as unclassified experiments, and 23 findings remain unexplained.

The current Sandbox drift consists of missing Stripe columns/indexes; two differing service-request-media policies; differing notification, signup, support, appointment, and field-work function definitions; missing field-work/Stripe functions; and the corresponding missing function grants. This guard does not authorize reconciliation. Any Sandbox repair requires a separate audit and SQL authorization.

No SQL, schema, grants, data, users, settings, environment variables, feature flags, entitlements, or deployments changed while establishing this result.

## Future Database Workflow

For database-affecting work:

1. Add or update the rollout-ledger row when the migration/foundation and intended environment sequence are known.
2. Apply SQL only after separate authorization and with the repository's normal identity, checksum, baseline, and rollback gates.
3. Record `Applied`, `Pending`, `N/A`, or `Intentionally deferred` from verified evidence after each environment operation.
4. After Production or Demo schema changes, run Production-vs-Demo parity explicitly with approved read-only access.
5. Review Sandbox separately; preserve approved experiments while treating missing/changed supported objects as drift until reviewed.
6. Keep live catalog output out of committed artifacts unless a sanitized bounded result is intentionally added as rollout evidence.

Do not make the live parity check a default CI requirement. It would add standing Production credentials and availability coupling to ordinary source PRs without improving source-only validation.
