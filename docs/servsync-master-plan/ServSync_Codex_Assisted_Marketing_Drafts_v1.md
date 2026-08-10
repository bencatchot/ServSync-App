# ServSync Codex-Assisted Marketing Draft Preparation v1

## Product Boundary

This slice gives ServSync's private internal Marketing workspace a controlled way to receive coordinated draft packages prepared by Codex. Codex uses a versioned product Truth Pack and a provider-neutral recipe, emits one bounded JSON package, and an authenticated platform administrator submits that package through one server-authoritative RPC.

Every accepted item begins as `draft`. The existing human workflow remains authoritative:

```text
Codex prepares package -> server validates and atomically ingests drafts
draft -> needs_approval -> approved
```

Codex cannot submit, approve, return, reject, schedule, publish, contact prospects, or alter analytics. The application contains no generation button, provider call, canned-copy fallback, publishing path, or contractor/homeowner Marketing access.

## Truth, Direction, And Recipe Contracts

The immutable v1 contracts remain available for historical Package #1 replay and audit. New preparation uses `config/marketing/servsync-marketing-truth-pack.v2.json`, which records:

- current marketable capabilities and their limits;
- canonical ServSync terminology;
- unavailable or restricted capabilities;
- prohibited unsupported claim classes, phrases, and numeric patterns;
- the repository evidence used to maintain the pack;
- the accurate distinction between document-scoped interaction without a registered account and an optional connected-homeowner relationship;
- an explicit rule against manufacturing competitor account, app-download, subscription, capability, difficulty, expense, fragmentation, or superiority claims;
- plain-language copy guidance that starts from one customer/contractor problem rather than a feature inventory.

`config/marketing/servsync-marketing-recipes.v2.json` defines the same three provider-neutral package recipes while giving every role a distinct purpose within one focused Marketing Direction. Recipes constrain audience, role, content type, channel category, and differentiation guidance without containing publish-provider identifiers or behavior.

Every v2 package contains an owner-led or recommended Marketing Direction with one audience, objective, statement, central message, bounded supporting points, explicit corrected assumptions, and a recommendation rationale only when Codex proposed the direction. The local contract detects bounded unsupported competitor assumptions in owner input, requires an explicit correction, and rejects those contrasts from the direction or prepared copy. It does not store hidden reasoning.

Changing a current capability, product term, claim boundary, recipe role, audience, or allowed output contract requires a reviewed version change. Historical preparation records retain the exact Truth Pack version and recipe key they used.

## Durable Model

`marketing_content_preparation_packages` stores immutable package provenance: internal workspace, stable client request UUID, source, recipe, Truth Pack version, direction statement in the existing `brief_summary`, item count, request fingerprint, actor, and preparation time. This reuses the deployed provider-neutral table shape without adding a table or column; the separately documented RPC compatibility migration is still required before v2 ingestion. Package #1 and its five records remain unchanged.

The existing `marketing_content_items` table receives nullable preparation provenance. Manual records remain `manual` with no package metadata. Prepared records require a package identity, sequence, audience, and content role. Existing content status and optimistic revision behavior is unchanged.

The ingestion RPC:

- derives the internal workspace and actor from the authenticated platform-admin session;
- accepts one to seven exact-shape items;
- validates lengths, enums, duplicate titles/bodies, and bounded prohibited claims;
- rejects status, provider, publishing, or other unknown fields;
- writes one package, all draft items, and their initial status events in one transaction;
- uses the preparation request UUID plus request fingerprint for idempotent replay;
- rejects a conflicting replay without adding records.

## Security

The preparation table is `postgres`-owned, forced-RLS, policy-free, immutable, and unavailable through direct browser or service-role table privileges. Existing Marketing tables remain private. The only new browser-callable boundary is `servsync_ingest_internal_marketing_package`, granted to `authenticated` but internally restricted to the canonical `platform_admin` role.

The ingestion operator uses an ordinary authenticated platform-admin session and the public anon key. It does not use or accept a Supabase service-role key. Demo and Production targets require separate explicit command guards and authorization. Secrets, raw provider metadata, hidden reasoning, and generated debug payloads are not persisted.

## Environment Boundary

The exact migration is applied in Sandbox, Demo, and Production. Demo received SHA-256 `e062367a4e060820dbdf0cbe73f4d961d9d3e3891717abd46d058b3945e51ce2` at `2026-08-10T00:50:55Z`; Production received the same artifact at `2026-08-10T00:53:21Z`. Catalog, authorization, atomic ingestion, replay, validation, immutable provenance, and existing approval-workflow checks passed in rollback-only transactions. The rollout baseline retained one internal workspace and zero preparation packages, content rows, or status events in each environment. A later authorized operational run created the first Production package and five drafts; Slice 3A does not modify those historical records. No provider credentials, OpenAI configuration, Vercel variables, publishing configuration, or unrelated business data changed.

## Deferred Work

Still separate and unavailable:

- runtime AI generation inside ServSync;
- autonomous submission or approval;
- approved-content revision policy;
- scheduling and publishing;
- social/email provider integrations;
- campaigns, prospecting, outreach, and analytics;
- contractor Business Marketing workspaces;
- provider-specific content or delivery records.

Marketing Direction Slice 3A uses one additive compatibility migration because the deployed ingestion RPC intentionally pinned Truth Pack v1. Exact SHA-256 `c6417504384a78f7ed41da83b214702a36e71749ea4fae8ed26f99d66bf29cda` is applied and validated in Sandbox, Demo, and Production after the controlled Demo-first/Production-second rollout on 2026-08-10. It permits historical v1 replay plus v2 ingestion, applies the new competitor-framing guard only to v2 direction/copy, and retains the same platform-admin-only RPC, tables, transaction, roles, and grants. Production Package #1 retained exact package/content/event fingerprints, Truth Pack v1 identity, five drafts, and its five initial draft events. No runtime generation UI or new authorization surface is included.
