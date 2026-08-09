# ServSync Trade Pack Domain Contracts v1

## Status And Boundary

Trade Pack Domain Contracts v1 is a hidden, default-deny backend foundation. It defines reusable system workflow identifiers, immutable work-type versions, strict structured-content contracts, and contractor-scoped capabilities. It does not expose a Trade Pack UI or create specialized Draft or Job content.

ServSync keeps one operational lifecycle:

`Draft -> Estimate or Job -> Approval/Authorization -> Job Completion -> Invoice/Payment -> Property History`

A future trade-aware Draft or Job may contain multiple ordered specialized sections. A trade is contextual classification, not a navigation destination, composer, Job lifecycle, Estimate type, or Invoice type.

## Domain Model

| Concept | Contract |
| --- | --- |
| Workflow family | Stable system identifier for a reusable operational shape, such as `service_call`. It does not create a record or grant access. |
| Trade | Stable classification such as `hvac`. Core contractors may still describe generic work with any trade; the identifier itself is not an entitlement. |
| Capability | Exact provider-neutral key such as `trade.hvac.workflow.no_cooling`. Missing, malformed, unknown, cross-tenant, or ungranted capabilities fail closed. |
| Work type | Stable identity binding a trade, workflow family, and required capability. It may be enabled only after its content and product boundary are approved. |
| Work-type version | Immutable published or retired definition with an explicit schema version. Future instances will preserve the selected version and their own snapshot. |
| Contractor grant | Exact tenant/capability state: `active`, `completion_only`, or `revoked`. No grant exists by default. |

The foundation contains one disabled skeletal `hvac.no_cooling_service_call` work type. Its published version contains empty readings, tests, findings, and recommendations. It is contract-validation data only and carries no HVAC diagnostic logic, safety instruction, repair conclusion, or customer-facing guidance.

## Structured Definition Contract

Definition JSON is accepted only when it has the exact version-one shape:

- one section descriptor;
- bounded arrays for readings, tests, findings, and recommendations;
- unique lowercase stable field keys;
- bounded labels and descriptions;
- explicit typed values and choice options where applicable;
- explicit customer visibility on every section and field.

Unknown keys, unsupported value types, duplicate field or option keys, malformed identifiers, invalid visibility values, unbounded arrays, and incompatible choice definitions are rejected by a database constraint.

The visibility vocabulary is intentionally small:

- `contractor_private`
- `customer_safe_summary`
- `customer_safe_evidence`
- `customer_safe_recommendation`

`contractor_private` is the safe default. A future customer projection must deliberately select approved customer-safe content. Raw readings, technical notes, and diagnostic reasoning do not become customer-visible merely because they share a work section.

## Versioning And Historical Compatibility

Published and retired version rows are immutable. Work-type identity, trade, workflow family, and required capability are also immutable. Later revisions must publish a new positive version number.

Future Draft and Job section instances must retain:

- work-type identity;
- selected version number;
- an immutable definition snapshot;
- instance tenant and record lineage.

The catalog version protects repeatable interpretation; the instance snapshot protects historical records from later catalog availability or deployment changes. Cryptographic definition fingerprints are deliberately deferred because immutable version rows plus future instance snapshots provide the required v1 compatibility boundary without introducing a second integrity mechanism.

## Capability And Billing Separation

Trade capabilities are independent of Stripe products, Stripe prices, subscription prices, billing tiers, trials, discounts, and packaging names. None of those identifiers exist in the Trade Pack schema.

The server resolver returns two independent decisions:

- `can_create_new`: true only for an `active` exact grant;
- `can_continue_existing`: true for `active` or `completion_only`.

Removing a pack should move the tenant to `completion_only` while specialized Drafts or Jobs remain active. That prevents new specialized sections while allowing existing instantiated work to finish against its selected version. Completed records, reports, PDFs, exports, and property history must be authorized through their owning records and must never depend on a current paid capability.

`revoked` denies both specialized creation and continuation. It is reserved for security or administrative invalidation, not the normal product downgrade path.

## Security Contract

All six foundation tables are owned by `postgres`, use forced RLS, have no browser policies, and grant no direct table or column privileges to `PUBLIC`, `anon`, `authenticated`, or `service_role`.

Only three read-only `SECURITY DEFINER` RPCs are browser-callable, and only by `authenticated`:

- resolve one exact contractor capability;
- list enabled work types available for new work;
- retrieve one enabled immutable version for active or completion-only use.

Each RPC uses a fixed `search_path`, derives the caller through `auth.uid()`, and requires the existing ServSync contractor-access helper for the exact tenant. The RPCs do not mutate grants, enable definitions, create workflow records, or make role-specific commercial decisions.

Owner, active Admin, Office, Field Technician, and Viewer members may read their contractor's capability state because future UI needs a consistent fail-closed availability decision. This does not grant those roles specialized mutation authority. Runtime Draft/Job operations will separately apply existing role, assignment, commercial-action, subject, and tenant rules.

## Durable Instance Rules

Durable Trade Section Instances v1 preserves these boundaries in the hidden backend foundation now shared by Sandbox, Demo, and Production:

- sections are ordered children of the existing Draft or Job;
- multiple trades may coexist in one Draft, Estimate, Job, and Invoice;
- Property Asset Bridge v1 extends the canonical `home_assets` identity with generic customer-safe fields, local-property claim continuity, append-only revisions, exact-revision concurrency, and property-derived authorization;
- Assets & Systems uses an RPC-first compatibility adapter; all three environments now resolve the bridge RPC, while the exact missing-routine-only legacy fallback remains a temporary compatibility guard;
- a section may reference an exact asset UUID and accepted revision without making the asset capability-dependent;
- property assets and history remain independent of Trade Pack entitlement and billing;
- Field Technician access remains deferred until the canonical Work model provides an assignment-scoped boundary; contractor-wide access is not substituted;
- Price Book items remain pricing sources copied into canonical work/Estimate lines;
- templates and checklists remain reusable inputs rather than competing workflow systems;
- customer-facing summaries are explicit projections;
- entitlement loss never deletes instantiated or historical data.

## Deferred Work

The following remain outside the combined hidden foundations:

- visible HVAC UI;
- No Cooling professional content;
- recommendation conversion;
- reports, PDFs, or history projection;
- Stripe product/price mapping or Trade Pack billing;
- visible runtime activation or contractor capability rollout.

Property Asset Bridge v1 and Durable Trade Section Instances v1 remain separate hidden foundations. On 2026-08-09 the exact reviewed chain was observed in Demo, then applied independently to Production. Demo preserved its curated asset and initial revision; Production remained at zero assets and revisions. Both environments retained zero Trade Section instances, revisions, capability grants, and enabled work types. The compatibility client does not activate visible Trade Pack behavior, and the legacy fallback remains until a later bounded removal is justified.

Current parity evidence remains explicit: Production versus Demo is `PASS WITH INTENTIONAL DIFFERENCES`; Production versus Sandbox is `FAIL` with only Project Collaboration's 297 additions approved and the same 22 unrelated supported-schema findings visible. The three Trade Pack foundation exception groups were retired after exact three-environment correspondence was verified.
