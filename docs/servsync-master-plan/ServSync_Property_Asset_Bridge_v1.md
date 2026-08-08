# ServSync Property Asset Bridge v1

## Status And Boundary

Property Asset Bridge v1 is a hidden backend foundation installed only in ServSync Sandbox. It extends the existing canonical `public.home_assets` identity; it does not create a second customer, property, asset, Draft, Job, or history system.

The bridge establishes this future-safe relationship:

`Customer -> Property -> Property Asset -> future Draft/Job association -> historical work record`

No Property Asset or HVAC UI, runtime Trade Section, Draft/Job asset link, professional HVAC content, report, PDF, reminder, equipment passport, or Trade Pack capability is enabled by this slice.

## Canonical Asset Contract

One asset row may belong to either an existing connected property (`home_id`) or a contractor-managed Not connected property (`local_home_id`). The database requires exactly one current property anchor before claim and preserves the same asset UUID when a local property is claimed and mapped to its canonical home.

The generic v1 fields are deliberately narrow:

- strict `asset_kind`: `hvac`, `plumbing`, `electrical`, `appliance`, `roof`, `exterior`, `garage`, `safety`, or `other`;
- customer-safe category, type, name, location, manufacturer, model, serial identifier, installation date, approximate age, warranty date, and description;
- `active` or `retired` lifecycle state;
- origin, creating actor, source contractor, timestamps, and monotonic revision number.

Unknown asset kinds, malformed identifiers, blank required values, unsupported lifecycle states, conflicting property anchors, and oversized text fail closed. Trade-specific readings, diagnostic reasoning, pricing, internal observations, arbitrary metadata, and private contractor notes are not part of the shared bridge contract.

## Local Claim Continuity

Assets created for `contractor_local_homes` retain their UUID and revision history when an approved claim maps that local property to a canonical `homes` row. The claim trigger adds the canonical `home_id`, preserves `local_home_id` as lineage, and records a `claim_mapped` revision. It does not duplicate or merge assets.

After claim, access is derived from the canonical property relationship. The retained local identifier is historical lineage, not continuing contractor authority. Suspected duplicate assets remain separate until a future explicit, auditable correction workflow exists.

## Lifecycle, Revisions, And Concurrency

`public.home_asset_revisions` stores an append-only full customer-safe snapshot for every create, update, retire/reactivate, and claim-map mutation. Each revision records the asset revision number, property lineage, changed actor, source contractor where applicable, provenance, mutation kind, and time.

Mutation RPCs require the caller's exact expected revision and increment it by one. A stale revision fails rather than silently overwriting another actor's update. Database triggers reject direct asset inserts outside the controlled mutation context and reject direct revision insert/update/delete, including trusted-role direct writes that bypass the asset trigger.

Assets with history cannot be hard-deleted because asset and revision foreign keys use restrictive deletion behavior. Retirement preserves the asset and its history. Revision history persists through contractor disconnection or Trade Pack downgrade and remains readable only to callers who still satisfy the current property authorization.

## Authorization And Visibility

Server-side RPC authorization is authoritative:

| Caller | Read | Mutate |
| --- | --- | --- |
| Homeowner owner/admin | Customer-safe fields and homeowner-private notes | Create, update, retire/reactivate |
| Homeowner member/viewer | Customer-safe fields; private notes redacted | No |
| Connected contractor Owner/Admin/Office | Customer-safe fields for an active connection and exact shared property | Create, update, retire/reactivate |
| Connected contractor Field Technician/Viewer | Customer-safe read for an active shared-property relationship | No |
| Local contractor Owner/Admin/Office | Customer-safe fields for the contractor's active local customer/property | Create, update, retire/reactivate |
| Local contractor Field Technician | Customer-safe read under the existing local-customer model | No |
| Local contractor Viewer | No, pending an assignment-scoped runtime Job boundary | No |

Inactive members, inactive contractors, archived local customers/properties, disconnected relationships, cross-tenant callers, cross-property IDs, and arbitrary identifier substitutions fail closed. Multiple contractors may read the same canonical asset only through their own active relationship to that exact property. Revision projections redact another contractor's identity, and contractor mutation cannot replace homeowner-private `notes`.

## Database Security

The canonical asset and revision tables are `postgres`-owned with forced RLS and no browser policies. `PUBLIC`, `anon`, and `authenticated` have no table or column privileges. The audited Supabase `service_role` table ACL posture remains present, while trigger guards preserve controlled mutation and revision immutability.

Only five fixed-path, `SECURITY DEFINER` RPCs are granted to `authenticated`:

- list assets for one authorized property;
- create one asset;
- update one asset at an expected revision;
- retire or reactivate one asset at an expected revision;
- list authorized revision history.

Private validators and trigger helpers are not browser-callable. No RPC grants capability, enables a Trade Pack definition, or creates Draft, Job, document, billing, or history records.

## Capability And Billing Separation

Property Asset identity and customer-safe history are provider-neutral shared product data. They do not depend on a Trade Pack capability, Stripe product, Stripe price, subscription state, billing tier, trial, discount, or packaging name. No ordinary contractor has received a Trade Pack capability and no work type has been enabled.

Future Trade Section creation may require an active exact capability. Existing assets and historical records must remain available through their owning property/work authorization during `completion_only`, downgrade, disconnection, or catalog-version changes.

## Rollout And Rollback

Migration `servsync-property-asset-bridge.sql` SHA-256 `a4879abe9ce84bf82ce19c365be1f5b1793dd5d420130c7ec5fa2e9200f82696` was applied only to Sandbox `zpzdkoaubyjtsomccxya` on 2026-08-08 at `21:09:50Z` through `21:09:52Z`. Production and Demo remain Pending.

The exact rollback is appropriate only before durable bridge data exists. It refuses to proceed when assets or revisions exist and restores the historical `home_assets` ownership, ACL, policy, trigger, and foreign-key contract only from the exact expected bridge state. After durable use begins, corrections must be additive forward migrations; history must not be destroyed to roll back a feature.

Production versus Demo remains `PASS WITH INTENTIONAL DIFFERENCES`. Production versus Sandbox remains `FAIL`: 593 exact approved additions include Project Collaboration, Trade Pack Domain Contracts, and Property Asset Bridge additions, while 34 findings remain visible. Twelve of those findings are expected shared `home_assets` definition/security differences caused by this Sandbox-only bridge; the prior unrelated Stripe, function, and policy drift remains unresolved.

## Deferred Work

This slice does not implement:

- runtime Draft or Job Trade Section instances;
- asset association on a live Draft or Job;
- Field Technician assignment-scoped mutation;
- visible Property Asset or HVAC workflows;
- HVAC No Cooling fields or professional content;
- readings, tests, findings, recommendations, conversion, reports, PDFs, reminders, service plans, or equipment passports;
- duplicate-asset correction or merge;
- Production or Demo migration.

The next bounded implementation slice is `Durable Trade Section Instances v1`.
