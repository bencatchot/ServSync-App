# ServSync Durable Trade Section Instances v1

## Scope

Durable Trade Section Instances v1 is a hidden Sandbox-only backend foundation. It joins the existing Trade Pack catalog to ServSync's canonical contractor, Draft, Estimate, Job, customer/property, and optional Property Asset identities. It creates no visible UI, enables no work type or contractor capability, adds no professional trade content, and exposes no raw section data to homeowners.

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

Sandbox is the only authorized database target for this slice. The first zero-history application exposed Supabase's trusted `extensions.digest` location during rollback-only execution; a later code review improved origin-Draft idempotent retries after workflow linkage. Independent merge-readiness review then found that the lineage triggers needed to validate persisted Estimate/Job contractor and property identity themselves and that list queries needed an explicit derived-contractor predicate. Every prior version still had zero durable rows and was removed through the guarded rollback without residue. Final migration SHA-256 `49c8b82a5b7af622178929a12f1d6519b00c2c95d71f0969efa2c2345824bb75` was applied to Sandbox `zpzdkoaubyjtsomccxya` on 2026-08-08 from `23:07:24.773Z` through `23:07:25.506Z`. Live rollback-only role/capability/runtime and forged-service-role validation then returned Sandbox to zero ordinary capability grants, zero enabled work types, disabled No Cooling, and zero section/revision rows.

Production and Demo remain Pending and their schemas and client data paths are unchanged. The application contains no calls to the five new RPCs, so the hidden foundation is inert after source merge. Production versus Demo remains `PASS WITH INTENTIONAL DIFFERENCES` with 129 exact additions. Production versus Sandbox remains the expected `FAIL` with 761 exact approved additions and the same 34 visible findings: 12 shared `home_assets` bridge differences plus 22 unrelated existing findings. The new section group is pinned by exact two-relation, fifteen-function, and three external-trigger selectors plus exact count/key/catalog fingerprints; it does not approve changed Production-supported objects.

## Deferred Work

This slice does not implement visible Trade Pack or Property Asset controls, professional HVAC content, Field Technician assignment access, homeowner/customer projections, reports, PDFs, readings UI, findings/recommendation conversion, equipment passports, reminders, service plans, Production/Demo SQL, or a client cutover. The controlling master plan should choose the next bounded slice after independent merge-readiness review; no later slice is started here.
