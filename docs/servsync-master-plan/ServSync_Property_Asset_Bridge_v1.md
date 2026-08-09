# ServSync Property Asset Bridge v1

## Status And Boundary

Property Asset Bridge v1 is a hidden backend foundation installed only in ServSync Sandbox. It extends the existing canonical `public.home_assets` identity; it does not create a second customer, property, asset, Draft, Job, or history system. The unchanged Assets & Systems UI now uses a temporary dual-schema adapter: each operation attempts the bridge RPC first and uses the historical direct-table contract only when PostgREST conclusively reports that exact RPC absent. Sandbox therefore uses the bridge path, while Production and Demo remain compatible through the legacy fallback until their rollout is separately authorized.

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

Private validators and trigger helpers are not browser-callable. No RPC grants capability, enables a Trade Pack definition, or creates Draft, Job, document, billing, or history records. The compatibility client calls the four list/create/update/lifecycle RPCs needed by the existing homeowner Assets & Systems UI; revision history remains hidden and unused. RPC results are identity-validated before reaching UI state, and authorization, validation, RLS, network, timeout, malformed-response, and generic server failures never enter fallback.

## Temporary Client Compatibility Boundary

`src/propertyAssetAdapter.ts` contains the only direct `home_assets` access left in the Assets & Systems client. The allowlist requires PostgREST code `PGRST202` plus the matching `public.<requested_rpc>` schema-cache search detail and missing-function message. A successful empty RPC result means the bridge is available. Any other error fails closed, and ambiguous mutation failures are never replayed through the legacy path.

The adapter does not inspect environment names, project references, flags, or private catalogs. Bridge updates and lifecycle changes carry the exact loaded revision; a legacy row without revision is mutated directly only after the read RPC itself proves absent. Concurrent identical in-memory mutations share one promise to prevent duplicate client submissions. The visible fields, labels, loading/empty/error states, owner/shared-admin controls, member/viewer boundary, and absence of revision-history or Trade Pack UI remain unchanged.

## Capability And Billing Separation

Property Asset identity and customer-safe history are provider-neutral shared product data. They do not depend on a Trade Pack capability, Stripe product, Stripe price, subscription state, billing tier, trial, discount, or packaging name. No ordinary contractor has received a Trade Pack capability and no work type has been enabled.

Future Trade Section creation may require an active exact capability. Existing assets and historical records must remain available through their owning property/work authorization during `completion_only`, downgrade, disconnection, or catalog-version changes.

## Rollout And Rollback

Final corrected migration `servsync-property-asset-bridge.sql` SHA-256 `31e787b0d9317a84ed93e94dee3f98af7ffba379f80b06b31a0b7eee76473d8b` was applied only to Sandbox `zpzdkoaubyjtsomccxya` on 2026-08-08 at `21:52:44Z` through `21:52:47Z`, after the zero-row prior bridge was safely rolled back. The correction preserves original active and archived legacy timestamps during schema backfill, binds direct table mutation guards to the actual invoking database role, and blocks non-owner truncation, so preserved `service_role` ACLs cannot forge private RPC context or erase durable history. Production and Demo remain Pending. The compatibility client works before and after that migration, but its legacy fallback must remain until a separately authorized rollout and post-deployment review prove both environments migrated.

The exact rollback is appropriate only before durable bridge data exists. It refuses to proceed when assets or revisions exist and restores the historical `home_assets` ownership, ACL, policy, trigger, and foreign-key contract only from the exact expected bridge state. After durable use begins, corrections must be additive forward migrations; history must not be destroyed to roll back a feature.

Production versus Demo remains `PASS WITH INTENTIONAL DIFFERENCES`. After Durable Trade Section Instances v1, Production versus Sandbox remains `FAIL`: 761 exact approved additions include Project Collaboration, Trade Pack Domain Contracts, Property Asset Bridge, and Durable Trade Section additions, while the same 34 findings remain visible. Twelve are expected shared `home_assets` definition/security differences caused by this Sandbox-only bridge; the prior 22 unrelated Stripe, function, and policy findings remain unresolved.

## Deferred Work

This slice does not implement:

- visible runtime Draft or Job Trade Section controls;
- Production/Demo bridge SQL rollout, post-rollout verification, and eventual removal of the temporary legacy fallback;
- Field Technician assignment-scoped mutation;
- visible Property Asset or HVAC workflows;
- HVAC No Cooling fields or professional content;
- readings, tests, findings, recommendations, conversion, reports, PDFs, reminders, service plans, or equipment passports;
- duplicate-asset correction or merge;
- Production or Demo migration.

Durable Trade Section Instances v1 now provides the hidden Sandbox-only optional asset association while preserving accepted asset revision history. The next action is an independent post-deployment compatibility readiness review followed by a separately authorized Demo-first, Production-second foundation rollout. Visible runtime integration remains pending and is not started by the compatibility client. PR #256 must rebase onto the finalized adapter and preserve it before that unrelated Invoice work can be considered for merge.
