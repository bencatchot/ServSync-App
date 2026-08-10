# ServSync Codex-Assisted Marketing Draft Preparation v1

## Product Boundary

This slice gives ServSync's private internal Marketing workspace a controlled way to receive coordinated draft packages prepared by Codex. Codex uses a versioned product Truth Pack and a provider-neutral recipe, emits one bounded JSON package, and an authenticated platform administrator submits that package through one server-authoritative RPC.

Every accepted item begins as `draft`. The existing human workflow remains authoritative:

```text
Codex prepares package -> server validates and atomically ingests drafts
draft -> needs_approval -> approved
```

Codex cannot submit, approve, return, reject, schedule, publish, contact prospects, or alter analytics. The application contains no generation button, provider call, canned-copy fallback, publishing path, or contractor/homeowner Marketing access.

## Truth And Recipe Contracts

`config/marketing/servsync-marketing-truth-pack.v1.json` is the bounded source used for claims in this workflow. It records:

- current marketable capabilities and their limits;
- canonical ServSync terminology;
- unavailable or restricted capabilities;
- prohibited unsupported claim classes, phrases, and numeric patterns;
- the repository evidence used to maintain the pack.

`config/marketing/servsync-marketing-recipes.v1.json` defines three coordinated package recipes: contractor acquisition, homeowner awareness, and feature promotion. Recipes constrain audience, role, content type, and channel category without containing publish-provider identifiers or behavior.

Changing a current capability, product term, claim boundary, recipe role, audience, or allowed output contract requires a reviewed version change. Historical preparation records retain the exact Truth Pack version and recipe key they used.

## Durable Model

`marketing_content_preparation_packages` stores immutable package provenance: internal workspace, stable client request UUID, source, recipe, Truth Pack version, brief, item count, request fingerprint, actor, and preparation time.

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

The migration is Sandbox-only for this slice. Demo and Production retain the Slice 2 schema and cannot ingest or display preparation provenance until a separately authorized migration-first rollout occurs. This branch does not alter provider credentials, OpenAI configuration, Vercel variables, publishing configuration, or any Production/Demo data.

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
