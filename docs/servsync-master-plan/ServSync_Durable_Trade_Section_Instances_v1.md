# ServSync Durable Trade Section Instances v1

## Scope

Durable Trade Section Instances v1 is a hidden backend foundation installed in Sandbox, Demo, and Production. It joins the existing Trade Pack catalog to ServSync's canonical contractor, Draft, Estimate, Job, customer/property, and optional Property Asset identities. It creates no visible UI, enables no work type or contractor capability, adds no professional trade content, and exposes no raw section data to homeowners.

The canonical relationship is:

`Trade Pack capability -> exact published definition -> existing Draft/Job -> exact property -> optional Property Asset revision -> durable section -> immutable revisions`

## Durable Identity And Workflow Lineage

`trade_section_instances` stores one durable section UUID. A section begins on either an existing `contractor_work_drafts` record or an existing operational `inspections` Job; it does not create another Work hierarchy. A Draft-founded section retains its Draft UUID after launch and adds the canonical Estimate and/or Job identifiers through narrowly scoped workflow triggers. Those triggers independently require the persisted Estimate or Job to match the section's exact contractor and connected or local property subject, reject later lineage rewrites, and remain idempotent when the same workflow update repeats. Accepted Estimate-to-Job conversion adds the Job link to the same section UUID. The section is not copied during conversion.

The record retains exact contractor, connected or contractor-managed local customer/property lineage. Local-property claim mapping adds the canonical home/homeowner to the same section and appends a claim revision; it preserves the local lineage, section UUID, prior revisions, values, and optional asset identity. Current property authorization controls mutation. Historical contractor-private reads remain bound to the exact owning work record and active contractor membership, not to a broad customer or property feed.

## Definition And Value Contract

Creation resolves one enabled work type, one published immutable definition version, and one active exact contractor capability. The instance stores workflow-family, trade, work-type, capability, definition-version, schema-version, the full independent definition snapshot, and a SHA-256 snapshot fingerprint. Those fields cannot be replaced later.

Structured values are an exact bounded JSON object interpreted only by the saved definition snapshot. Unknown or unsafe keys, missing required fields, wrong scalar types, invalid choices, malformed findings, control characters, excess numeric scale/range, excess text, excess field count, and payloads over 64 KiB fail closed. Explicit `false` and zero remain distinct from absent optional values. The value payload cannot select tenant, actor, visibility, definition, workflow, property, or authorization metadata.

## Property Asset Association

An asset is optional at the generic platform layer. When supplied, the RPC accepts only an active canonical `home_assets` row for the exact section property and stores the accepted asset UUID and revision number. Later asset correction or retirement does not rewrite the section's historical association. Local claim mapping preserves the asset UUID while Property Asset Bridge v1 maps its canonical home independently.

## Lifecycle, Revisions, And Concurrency

Sections use `active`, `completed`, `abandoned`, and `voided` lifecycle states. An active section may receive a validated values update or one terminal transition. Terminal records cannot be reopened or mutated. Hard delete and truncate are denied.

Every create, values update, lifecycle transition, Draft/Estimate/Job linkage, and claim mapping appends one full `trade_section_revisions` snapshot with revision number, actor, source, time, definition, values, lifecycle, work/property lineage, and asset revision. Revision rows are append-only and immutable. Update and lifecycle RPCs require the exact current revision; stale writes fail instead of overwriting concurrent work. Retry-safe creation uses a contractor-scoped idempotency key and returns the original matching instance while rejecting conflicting reuse.

## Capability Modes And Billing Separation

- `active`: Owner, active Admin, and Office may create and continue eligible instances.
- `completion_only`: no new instance; authorized users may continue or finish an active instance that predates the downgrade. Reassignment, definition replacement, reopening, and voiding are unavailable.
- `revoked`: no creation or mutation; authorized exact-work history remains durable.

Capability state is provider-neutral. Section identity and history contain no Stripe product, price, subscription, tier, trial, discount, or payment-provider dependency.

## Authorization And Visibility

The two private tables are postgres-owned, forced-RLS, policy-free relations. Browser roles receive no table or column privileges. The audited `service_role` contract is read-only; executor-bound guards still reject forged-GUC direct insert, update, delete, revision rewrite, and truncate operations if mutation ACLs are temporarily supplied.

Five postgres-owned `SECURITY DEFINER` RPCs with fixed trusted search paths are granted only to `authenticated`. Four use `pg_catalog, public`; creation additionally includes Supabase's trusted `extensions` schema for `pgcrypto.digest`:

- list exact-work sections;
- create an eligible section;
- update values with optimistic concurrency;
- set a terminal lifecycle state;
- list one section's revisions.

Owner, active Admin, and Office may mutate under exact contractor/work/property/capability rules. Viewer is exact-work read-only. List results must match both the supplied Draft or Job UUID and the contractor derived from that persisted Work record; revision results also match the instance's derived contractor. Inactive members, arbitrary Work IDs, malformed workflow lineage, and cross-contractor callers fail closed. Field Technician access is deferred because the current canonical Work model does not expose a sufficiently narrow assignment-scoped authority for this data; contractor-wide read or mutation is not substituted. Homeowners receive no section or revision RPC, and generic content is never inferred to be customer-visible. Future customer-safe projection requires a separate server-authoritative allowlist.

## Rollout And Recovery

Migration `servsync-durable-trade-section-instances.sql` requires the canonical Durable Draft/Job, local-claim, Trade Pack Domain Contracts, and Property Asset Bridge foundations. It rejects missing/incompatible prerequisites, partial targets, and repeat application before creating runtime rows. The guarded rollback removes only this slice and refuses once any section or revision history exists. After durable use begins, corrections must be additive migrations.

The first zero-history Sandbox application exposed Supabase's trusted `extensions.digest` location during rollback-only execution; later reviews improved origin-Draft idempotent retries, persisted Estimate/Job contractor/property validation, rewrite denial, and derived-contractor list predicates. Every prior version still had zero durable rows and was removed through the guarded rollback without residue. Final migration SHA-256 `49c8b82a5b7af622178929a12f1d6519b00c2c95d71f0969efa2c2345824bb75` was applied to Sandbox `zpzdkoaubyjtsomccxya` on 2026-08-08 from `23:07:24.773Z` through `23:07:25.506Z`, to Demo `bdytwgejqnlblhrnqxkp` on 2026-08-09 with the statement accepted at `11:25:23.320Z`, and to Production `uqgtheclhxqlnjpfmheq` from `13:56:43.234Z` through `13:56:43.853Z`.

All three environments now share the exact foundation. Demo and Production each retained zero section instances, zero section revisions, zero capability grants, and zero enabled work types; Sandbox remains equally inert. Production versus Demo remains `PASS WITH INTENTIONAL DIFFERENCES` with the exact Demo scenario group. Production versus Sandbox remains the expected `FAIL` with only Project Collaboration's 297 approved additions and the same 22 unrelated supported-schema findings. The former durable-section Sandbox exception group was retired after exact catalog/security correspondence was verified.

## Runtime Slice 1A

Runtime Slice 1A adds a hidden Job-detail client integration behind exact source gate `VITE_DURABLE_TRADE_SECTIONS_UI_ENABLED === 'true'`. The gate defaults off and is not configured in Sandbox, Demo, Production, Preview, or local repository configuration. Gate-off, Field Technician, inactive, homeowner, closed, completed, and finalized contexts do not mount the panel or issue Trade Section RPCs.

The client uses only available-work-type discovery, exact-Job instance listing, idempotent Job creation, and expected-revision value updates. Owner, active Admin, and Office receive mutation controls; Viewer receives exact-Job read-only presentation. Schema-v1 `readings` and `tests` support number, text, boolean, and choice fields. Findings, recommendations, lifecycle actions, revision-history UI, Draft/Estimate/property-only entry points, and Property Asset selection are not included. Unsupported or malformed definitions and responses fail closed. Stale updates preserve unsaved local input until explicit reload, and an ambiguous mutation is never automatically retried.

This source integration is not runtime activation. No work type or capability is enabled, no professional content exists, and the gate remains unset. A later Slice 1B requires separate approval for a neutral Sandbox-only definition/capability fixture, authenticated browser proof, cleanup, and any exposure decision.

## Deferred Work

The foundation and hidden Slice 1A do not implement visible Trade Pack or Property Asset controls, professional HVAC content, Field Technician assignment access, homeowner/customer projections, reports, PDFs, findings/recommendation conversion, equipment passports, reminders, service plans, or activated runtime access. Those remain later bounded product slices.
