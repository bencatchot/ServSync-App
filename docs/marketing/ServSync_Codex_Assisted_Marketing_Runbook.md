# Codex-Assisted Marketing Draft Runbook

## Scope

Use this runbook only to prepare draft content for ServSync's internal Marketing workspace. It does not authorize approval, publishing, scheduling, outreach, provider configuration, or contractor/homeowner Marketing access.

The active contracts are:

- Truth Pack: `config/marketing/servsync-marketing-truth-pack.v1.json`
- recipes: `config/marketing/servsync-marketing-recipes.v1.json`
- package schema: `config/marketing/codex-marketing-package.schema.json`
- local validator: `scripts/marketing/marketing-package-contract.mjs`
- authenticated operator: `scripts/marketing/ingest-codex-marketing-package.mjs`

## Preparation Procedure

1. Start from current `origin/main` and confirm the target environment is authorized and has the matching migration.
2. Read the complete Truth Pack and recipe set. Treat the Truth Pack as authoritative over generic model knowledge.
3. Choose one recipe, one allowed audience, one current capability/topic, and a bounded item count from 1 through the recipe's available roles, with a maximum of 7.
4. Prepare distinct items that satisfy each selected recipe role. Do not insert status, provider, publishing, analytics, or approval fields.
5. Use one newly generated UUID as `preparation_request_id`. Keep it stable across retries of the same exact package.
6. Validate locally before any network action:

```bash
node scripts/marketing/marketing-package-contract.mjs path/to/package.json
```

7. Review the output as untrusted draft copy. Confirm every product statement against the Truth Pack and reject the complete package if any statement is unsupported or ambiguous.
8. Authenticate with an existing platform-admin account through approved secret configuration. Never place credentials in the package, command history, repository, screenshot, or report.
9. Ingest through the guarded operator. Sandbox example:

```bash
SERVSYNC_MARKETING_TARGET=sandbox \
SERVSYNC_MARKETING_SUPABASE_URL="$SERVSYNC_SANDBOX_SUPABASE_URL" \
SERVSYNC_MARKETING_SUPABASE_ANON_KEY="$SERVSYNC_SANDBOX_ANON_KEY" \
SERVSYNC_MARKETING_ACCESS_TOKEN="$SERVSYNC_MARKETING_ADMIN_ACCESS_TOKEN" \
npm run marketing:ingest-codex-package -- path/to/package.json
```

Password authentication is also supported through the approved secret-only `SERVSYNC_MARKETING_ADMIN_EMAIL` and `SERVSYNC_MARKETING_ADMIN_PASSWORD` variables. Never print them.
10. Verify the receipt reports `status: draft`, the requested count, and only non-secret record identifiers. A replay of the same UUID and exact package must return the same records with `replayed: true`.
11. Open Marketing -> Content and review the `Codex-prepared` drafts. Human workflow actions begin here; Codex must not invoke approval transitions.

## Package Contract

The top-level object has exactly:

- `preparation_request_id`
- `recipe_key`
- `truth_pack_version`
- `brief_summary`
- `items`

Every item has exactly:

- `title`
- `content_type`
- `body`
- `channel_category`
- `intended_audience`
- `content_role`

The local validator and server both reject malformed values, unexpected keys, out-of-range counts, unknown enums, duplicate roles/titles/bodies, secret-like material, and bounded prohibited claims. A failed package creates no durable package or content records.

## Fail-Closed Rules

- Never treat a provider/model response as trusted or ready for approval.
- Never substitute hard-coded sample copy after a preparation failure.
- Never split a failed package into unexplained partial persistence.
- Never change the UUID while retrying an ambiguous result until the existing request is checked.
- Never use a service-role key or direct table write.
- Never target Demo or Production without separate migration and ingestion authorization.
- Stop if the Truth Pack does not establish the requested claim, topic, or capability.

## Maintenance

Update the Truth Pack through a reviewed versioned change whenever a marketable capability or limitation changes. Update recipes through a reviewed versioned change when roles, audiences, types, or channel categories change. Do not rewrite a historical version in place after it has prepared durable records.
