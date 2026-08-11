# Approved Direction Content Preparation v1

## Product Boundary

Marketing Slice 6 connects the approved strategy layer to the existing durable Content queue:

```text
Business Marketing Profile
-> accepted Marketing Plan
-> approved Marketing Directions
-> draft Marketing content
-> existing human content approval
-> future scheduling and publishing
```

An approved Direction authorizes preparation of that exact story. It does not authorize submission, approval, scheduling, publishing, provider activity, outreach, or analytics changes.

## Plan-Level Contract

The v1 path creates one primary draft per approved Direction. It requires one current approved Direction for every item in one exact accepted Plan, preserves Plan order, and uses the Plan item's approved role as the content treatment. The current six-item Plan therefore maps to one package containing exactly six drafts, not six five-piece packages.

The provider-neutral artifact is `config/marketing/codex-approved-direction-package.v1.schema.json`. It carries one fresh preparation request UUID, exact Plan identity/revision, Truth Pack v3, contract key `approved_direction_plan_v1`, and one copy item with exact Direction identity/revision for every Plan item. The local validator loads the current accepted Plan and Directions, enforces canonical role/type/channel/audience shape, rejects malformed or unsafe copy, rejects exact recent-content duplication, and contains no status, approval, schedule, publish, or provider fields.

## Durable Lineage

New preparation packages record:

- strategic source `approved_direction`;
- generator source `codex_assisted`;
- exact accepted Plan UUID and revision;
- Truth Pack and preparation contract identity;
- immutable request fingerprint and preparation actor/time.

Every new content item records the exact Plan UUID/revision/item index, approved Direction UUID/revision, preparation sequence, audience, and preserved content role. Historical Packages #1 and #2 retain null first-class lineage and are not backfilled or rewritten.

One primary approved-Direction package is allowed for an accepted Plan revision in v1. Exact replay of the same request returns the same package and content identities. A conflicting replay, second primary package, stale or draft Direction, wrong workspace, role substitution, malformed item, duplicate, or unsafe claim fails atomically with no partial package.

## Authorization And UX

The new ingestion RPC is platform-admin only, postgres-owned, `SECURITY DEFINER`, fixed-path, and executable only by `authenticated`. The browser receives no direct package/content table privileges; `service_role` is not an authorization shortcut. Workspace, Plan, Direction approval, revisions, actor, Truth Pack, strategic source, generator source, role, and initial `draft` status are re-derived or verified server-side.

Marketing -> Content shows a concise lineage statement such as `From the approved Invoices Direction`, plus the Plan item and Direction revision. Existing edit, submit, return, reject, and approve behavior remains unchanged. There is no fake runtime generation button.

## Copy And Recent-Content Boundary

Codex preparation must read the approved Directions, accepted Plan/Profile, Truth Pack v3, recipe-role definitions, and recent Content before writing copy. The approved Direction is primary authority; recent content is repetition context. The validator rejects exact recent title/body reuse and bounded prohibited claims. It also rejects the public-copy terms `workflow`, `customer-facing`, `eligible`, and `work context` for this path so operator output remains plain rather than product-documentation prose. Semantic quality and grounding still require human editorial review.

## Rollout

Migration `servsync-approved-direction-content-preparation.sql` has SHA-256 `884ef1f93871a293291c3133c64754553c03aa88a518b3ca9a14887505873331`.

The exact migration is applied and rollback-only validated in Sandbox `zpzdkoaubyjtsomccxya` on 2026-08-11. Sandbox retains zero preparation packages, content rows, status events, Directions, and lineage rows. Demo and Production remain pending and must receive the exact migration before the client changes can merge. No real six-draft Production package was created during implementation.

## Deferred

- Demo-first and Production-second schema rollout and merge;
- separately authorized first real six-draft Production preparation;
- alternate or additional treatments of one Direction;
- runtime AI or paid provider generation;
- automated submission, approval, scheduling, publishing, outreach, campaigns, or analytics;
- contractor or homeowner Marketing runtime;
- social OAuth/providers and billing changes.
