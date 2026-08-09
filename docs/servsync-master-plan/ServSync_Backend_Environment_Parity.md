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
- the bounded owner, relation kind, persistence, and RLS enablement/forced state of `storage.objects` needed to interpret its policies safely;
- columns by name, type, default, nullability, identity/generated state, and collation, without treating ordinal position as behavior;
- constraints, validation and deferrability;
- indexes and validity/readiness;
- non-internal triggers;
- `public` and application-owned `storage` policies;
- function overloads, argument names/types/defaults, return type, language, owner, security mode, volatility, strictness, configuration/search path, and canonical PostgreSQL definition, with comments and layout whitespace separated from logical definition changes;
- effective function and table ACLs, explicit column ACLs, grant options, and relevant global/`public` default ACLs.

The tool does not read or compare business rows, auth users, secrets, credentials, bucket contents, private record values, feature flags, entitlements, or environment-variable values. Supabase-managed `auth` and storage implementation internals are outside the schema comparison; ServSync-owned `storage.objects` policies remain included.

The fixed project identities live in `config/backend-environment-parity.json`. Before catalog access, the checker requires each project ref, project name, organization, and healthy state to match. Production, Demo, and Sandbox refs must be unique. The query is hardcoded, contains one `WITH`/`SELECT` statement, and is rejected locally if a mutating SQL keyword or second statement appears.

## Intentional Differences

`config/backend-environment-parity.json` is the only intentional-addition manifest. Each group names exact relation scopes, exact function overloads, and any exact cross-scope objects, then pins the approved category counts, complete object-key SHA-256 fingerprint, and logical catalog SHA-256 fingerprint. A new column, constraint, index, trigger, policy, ACL, column grant, overload, grant option, or changed security property invalidates the group until an explicit reviewed repository update records the new fingerprint.

Rules apply only to objects absent from Production. They never excuse a missing or changed Production-supported object, even when that object later shares a scope or function signature with an approved addition. Unlisted Demo and Sandbox additions fail parity; Sandbox additions are not treated as experiments merely because they exist in Sandbox.

Current Demo exceptions are limited to:

- `public.demo_scenarios`;
- `public.demo_scenario_runs`;
- `public.demo_scenario_records`;
- the six exact trusted `servsync_demo_*` operator overloads;
- the exact fingerprinted supporting columns, constraints, indexes, triggers, and ACLs for those objects.

Project Collaboration is absent from Production and Demo, so it is not part of supported parity. Sandbox's six Project Collaboration tables, nine exact functions, `inspections.project_id` link, and exact 297-object catalog fingerprint are recorded as an approved Sandbox-only experiment. The manifest does not hide missing or changed Production-supported objects.

Results mean:

- `PASS — supported schema parity`: exact supported contract with no additions.
- `PASS WITH INTENTIONAL DIFFERENCES`: supported parity plus reviewed Demo additions.
- `PASS WITH APPROVED SANDBOX EXPERIMENTS`: supported parity plus exact manifest-approved Sandbox additions.
- `PASS WITH DEFINITION-FORMAT DIFFERENCES`: logical parity with only comments or layout whitespace changed in function definitions.
- `FAIL — unexplained Production/<environment> drift`: a supported object is missing/different or Demo has an unreviewed addition.

Default output shows every unexplained and definition-format finding plus a bounded sample of approved additions. `--verbose` prints the complete approved-addition inventory. SQL and PL/pgSQL function comparison is deliberately conservative: it preserves every non-whitespace character and every separator boundary, normalizes only comment content and repeated horizontal or newline-bearing layout separators outside quoted values, and retains newline-versus-horizontal separation. Quoted strings, quoted identifiers, operators, literals, Unicode text, dollar-quoted values, and token adjacency remain exact. A definition with uncertain quote parsing falls back to raw comparison, and non-SQL procedural languages always use raw comparison, so unproven equivalence is logical drift rather than a non-failing format-only result.

## Rollout Ledger

`config/backend-environment-rollouts.json` records each relevant bounded foundation or migration across Sandbox, Production, and Demo using only:

- `Applied`
- `Pending`
- `N/A`
- `Intentionally deferred`

Every state requires a reason. The ledger is operational visibility, not a migration engine and not proof of deployed state or parity by itself. A manually recorded `Applied` state never overrides a failing live comparison. Update it only from verified rollout evidence. After an authorized database rollout, record which environments received it, why any environment was skipped, and whether Production/Demo parity passed.

Source-only work that has no database artifact may be `N/A` across all environments. Source-only PRs do not need live database access merely because this guard exists.

## Current Verified State

Read-only validation after the Trade Pack backend foundation rollout on 2026-08-09 established:

- Production vs Demo: `PASS WITH INTENTIONAL DIFFERENCES`. The supported schema, including Trade Pack Domain Contracts, Property Asset Bridge, Durable Trade Section Instances, and Internal Marketing Content + Approval, matches. Demo adds only its exact fingerprinted 129-object scenario group.
- Production vs Sandbox: `FAIL — unexplained Production/sandbox drift`. The exact 297-object Project Collaboration group remains the only approved Sandbox experiment. Twenty-two missing or conservatively/logically changed Production-supported entries remain unexplained. The raw `notify_on_support_message()` definitions differ, and the conservative comparison cannot prove that difference format-only without removing a meaningful separator boundary, so it remains definition drift for review rather than weakening the classifier.

Internal Marketing Content + Approval migration `servsync-internal-marketing-content-approval.sql` (SHA-256 `325befc738a373f431b52019c25b5018d31efd3e21c473cdf81a9d1fca721944`) was applied to Sandbox on 2026-08-09 from `19:39:23Z` through `19:39:25Z`, Demo from `20:02:56Z` through `20:02:57Z`, and Production from `20:06:04Z` through `20:06:05Z`. Demo passed before Production was touched. Each environment retains one deterministic internal workspace, zero content rows, and zero status events after rollback-only validation. Three `postgres`-owned forced-RLS/policy-free tables, four authenticated platform-admin RPCs, one non-browser append-only guard, exact ACLs, status transitions, idempotency, optimistic concurrency, and contractor/homeowner denial passed. No provider configuration, environment variable, fake content, or unrelated business data changed. The former 117-object Sandbox exception is retired because this foundation is now supported schema in all three environments.

The two unapproved Sandbox-only `storage.objects` policies are resolved. Exact migration `servsync-sandbox-legacy-storage-policy-containment.sql` (SHA-256 `65d5e708df5228d5bc3c77ca50bc2d44dc99467b04fe8ed57bc3eaa6e73ab090`) removed only `Photos storage: authenticated manage` and `Reports storage: authenticated manage` from Sandbox `zpzdkoaubyjtsomccxya`. Production and Demo never contained either policy and received no SQL. Sandbox `storage.objects` ownership/RLS and table/column ACLs, every remaining storage policy, both public bucket definitions, both existing `photos` objects, the empty `reports` bucket, and Project Collaboration remained unchanged. Authenticated direct reads returned no rows and a tagged insert failed under RLS with no residue. The buckets remain public by deliberate scope boundary, so object retention or migration remains separate from this policy cleanup.

Stripe Connect Online Payments Foundation v1 is now supported schema in Sandbox, Production, and Demo. The exact foundation and `ch_`/`py_` compatibility migrations correspond across all three environments, so the former 178-object Sandbox intentional-addition group and its fingerprints were removed. This does not activate a provider outside Sandbox: Production and Demo contain zero provider rows and retain fail-closed runtime configuration.

With only Project Collaboration's 297 entries approved exactly, Production versus Sandbox still fails on the same 22 unrelated supported-schema findings. Those consist of missing legacy Stripe subscription columns/indexes/functions/grants; two differing service-request-media policies; and differing notification, support, appointment, and field-work function definitions/grants. The former Trade Pack Domain, Property Asset, and Durable Trade Section Sandbox groups were removed after the exact migrations became supported schema in all three environments. Any repair or additional experiment approval requires a separate audit and repository/configuration decision, with SQL authorization where applicable.

The ordered Trade Pack foundation rollout used exact SHA-256 values `419d27426b7d336927642ae6a2a2632db4be564937849c58ad25ef60a923073c`, `31e787b0d9317a84ed93e94dee3f98af7ffba379f80b06b31a0b7eee76473d8b`, and `49c8b82a5b7af622178929a12f1d6519b00c2c95d71f0969efa2c2345824bb75`. Demo-first observation preserved its curated asset and revision through the bridge RPC, and Production retained zero assets/revisions. Both environments remain inert at zero Trade Section instances/revisions, capability grants, and enabled work types. No visible or billable behavior, provider setting, flag, or unrelated business data changed.

The signup-function security difference is resolved. PR #387 merged normally as `20e1b04adafaa5f5919a43b6d9fc9f4ede4cc74d`, and exact migration `servsync-public-signup-role-hardening.sql` (SHA-256 `4fe4f48a57cfeb3a46a07bcfe67f2e716ea9be29e369324da225b244d4be6f7a`) is applied and validated in Sandbox `zpzdkoaubyjtsomccxya`, Production `uqgtheclhxqlnjpfmheq`, and Demo `bdytwgejqnlblhrnqxkp`. It permits only homeowner and contractor public account roles, defaults all other role metadata safely, preserves referral attribution and existing administrators, prevents authenticated profile-role rewrites, and remains final in both blank-install sequences. Exact reviewed function bodies, ownership, security mode, fixed search path, grants, overloads, and auth/profile trigger bindings now correspond across all three environments.

The approved migration changed only its bounded signup functions, trigger, and grants. Captured profile and business counts/fingerprints were preserved, and no environment variables, feature flags, entitlements, memberships, configuration, or unrelated business data changed. The rollout-ledger `Applied` entries record this migration only and do not override the separate Sandbox parity failure.

## Future Database Workflow

For database-affecting work:

1. Add or update the rollout-ledger row when the migration/foundation and intended environment sequence are known.
2. Apply SQL only after separate authorization and with the repository's normal identity, checksum, baseline, and rollback gates.
3. Record `Applied`, `Pending`, `N/A`, or `Intentionally deferred` from verified evidence after each environment operation.
4. After Production or Demo schema changes, run Production-vs-Demo parity explicitly with approved read-only access.
5. Review Sandbox separately; preserve approved experiments while treating missing/changed supported objects as drift until reviewed.
6. Keep live catalog output out of committed artifacts unless a sanitized bounded result is intentionally added as rollout evidence.

Do not make the live parity check a default CI requirement. It would add standing Production credentials and availability coupling to ordinary source PRs without improving source-only validation.
