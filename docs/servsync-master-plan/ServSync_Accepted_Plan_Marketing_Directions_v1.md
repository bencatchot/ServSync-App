# Accepted Plan Marketing Directions v1

## Product Boundary

Marketing Slice 5 makes Marketing Direction a durable, reviewable record between an accepted Marketing Plan and content preparation:

```text
Business Marketing Profile
-> accepted Marketing Plan
-> Marketing Directions
-> approved-Direction content packages
-> existing human content approval
```

A Direction defines one specific story strategy for one exact accepted Plan item. Approval may authorize the separately reviewed Slice 6 preparation path, but approval itself still creates no content and never submits, approves, schedules, publishes, contacts prospects, or changes analytics.

## Durable Model

`marketing_directions` stores one logical Direction per accepted Plan item. Each record retains the internal workspace, preparation request fingerprint, exact source Plan identity and revision, item index and immutable item snapshot, audience, topic, content role, objective, direction statement, central message, supporting points, cautions, bounded assumption corrections, rationale, Truth Pack version, capability grounding, preparation source, status, actor, and timestamps.

`marketing_direction_revisions` stores the initial snapshot and every draft edit or approval snapshot. Revision history is append-only. Directions and revisions cannot be hard-deleted. Approved Directions are immutable.

The current state contract is deliberately small:

```text
draft -> approved
```

Drafts can be edited with optimistic revision checks. Approval requires the exact current revision and revalidates the source Plan's accepted status, revision, workspace, and item snapshot. Approval creates only a Direction revision.

## Preparation Contract

The server accepts one all-or-nothing Direction package covering every item in the exact accepted Plan, in Plan order. A stable request UUID and canonical request fingerprint make retries idempotent; a conflicting replay or second package for the same Plan fails closed. A draft or stale Plan, wrong workspace, malformed item, unsupported audience/capability, unsafe public claim, or mode/provenance mismatch creates no Directions.

The only enabled preparation source is `codex_assisted`. Recommended Plans require recommended Directions with no invented owner input. Owner-directed Plans require owner-led Directions and the exact owner direction already stored on the accepted Plan. The table shape can support a later reviewed provider-neutral source, but runtime AI and provider execution are not enabled by this slice.

The versioned artifact contract is `config/marketing/codex-marketing-directions.v1.schema.json`. The operator validates the complete artifact before authentication, uses an ordinary authenticated platform-administrator session and the browser-public anon key, verifies the current accepted Plan, invokes one guarded RPC, then verifies all durable records remain drafts. It does not use `service_role` or accept workspace, actor, status, content, publishing, or provider identity from the browser.

## Authorization

Current runtime access is limited to the canonical internal `platform_admin` context. Contractors, homeowners, anonymous callers, inactive/missing identities, and other workspace IDs fail closed.

Both tables are `postgres`-owned, forced-RLS, policy-free, and have no direct browser or `service_role` table privileges. The only authenticated RPCs are:

- `servsync_get_internal_marketing_directions`
- `servsync_prepare_internal_marketing_directions`
- `servsync_update_internal_marketing_direction`
- `servsync_approve_internal_marketing_direction`

Each RPC is `postgres`-owned, `SECURITY DEFINER`, fixed-path, and server-authoritative. A future contractor Business Marketing workspace requires separately reviewed tenant-derived RPCs and UI; this internal RPC family must not be reused as a contractor authorization shortcut.

## Internal UX

Marketing -> Settings now includes `Profile`, `Plan`, and `Directions`. The Directions view shows the current accepted Plan's ordered items, draft/approved progress, source intent, owner input or recorded corrections when present, audience/topic/role, editable bounded strategy fields, Truth Pack, capability grounding, provenance, and revision number.

Unsaved edits must be saved before approval. Loading, no-accepted-Plan, no-prepared-Directions, private error, stale mutation, draft, and approved read-only states are explicit. The view is covered at desktop and `390x844` mobile sizes.

## Rollout Boundary

Migration `servsync-accepted-plan-marketing-directions.sql` has SHA-256 `165208592583b97cbd7abe95fb3ef95ff8adff93141ea5a4038cedd1f45cae93`.

The exact migration is applied and validated in Sandbox, Demo (`2026-08-11T03:58:19Z` through `04:03:11Z`), and Production (`04:05:19Z` through `04:05:29Z`). Demo passed before Production was touched. Both targets matched the reviewed ownership, forced-RLS, policy-free, direct-table-denial, fixed-path RPC, and authenticated-only grant contract. Rollback-only six-item preparation, exact snapshots, atomicity, replay/conflict handling, draft revision, stale-write rejection, terminal approval, malformed/stale/draft/cross-workspace denial, role denial, and zero downstream content changes passed with no residue.

The owner subsequently prepared, refined, and approved all six first-class Directions for accepted Plan `4e390d96-03f0-4342-9a13-3e8119383024`. Their approval authorizes development of those exact stories, not publication. Slice 6 adds a Sandbox-only, prospective approved-Direction-to-draft package foundation; Demo/Production rollout and the first real six-draft preparation remain separate gates.

## Deferred

- Demo/Production rollout of approved-Direction content preparation;
- separately authorized creation of the first real six-draft package;
- runtime AI or provider-backed preparation;
- automatic submission or approval;
- scheduling, publishing, social/email integrations, campaigns, outreach, and analytics;
- contractor Business Marketing profile, Plan, Direction, content, and authorization UI;
- homeowner Marketing access;
- approved-Direction revision or supersession workflow.
