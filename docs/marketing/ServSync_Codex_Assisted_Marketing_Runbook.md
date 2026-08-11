# Codex-Assisted Marketing Draft Runbook

## Scope

Use this runbook only to prepare draft content for ServSync's internal Marketing workspace. It does not authorize approval, publishing, scheduling, outreach, provider configuration, or contractor/homeowner Marketing access.

The repository-current contracts are:

- Truth Pack: `config/marketing/servsync-marketing-truth-pack.v3.json`
- recipes: `config/marketing/servsync-marketing-recipes.v3.json`
- package schema: `config/marketing/codex-marketing-package.v3.schema.json`
- local validator: `scripts/marketing/marketing-package-contract.mjs`
- authenticated operator: `scripts/marketing/ingest-codex-marketing-package.mjs`

The immutable v1 and v2 files remain available for exact replay or audit. Do not rewrite a historical contract.

Truth Pack v3 adds canonical contractor audience coverage for carpentry, lawn/landscaping, pressure washing, and handyman businesses without adding new product claims. Its required migration `servsync-marketing-planner-quality-v2.sql`, exact SHA-256 `c05d5e84704d15ccc134970fd71dd297f26e936bbd4091e5a860d40a8ca2800`, is applied in Sandbox, Demo, and Production. Target-environment and Production/Demo command guards still require explicit operational authorization for every package ingestion; schema availability is not content-creation, approval, or publishing authority.

Planner v3 migration `servsync-marketing-planner-coherence-relevance-v3.sql`, exact SHA-256 `c7360421519d5bf494a874aa5ec257a428b204e50d624d0f1139d0a1959ed81b`, is applied in Sandbox, Demo, and Production. It improves deterministic recommendation coherence and relevance only. A recommendation remains a draft plan; it does not create Marketing Direction, content, approvals, schedules, or published work.

Planner v3 operational hardening is source-only: discovery/profile cautions use claim-safe wording without relaxing the server validator, customer-communication overlap recognizes bounded estimate/response/link/connection relationships, and Product demonstrations name one eligible supported interaction selected from the current Profile and recent-content evidence. Do not treat the planner as ready for Plan-to-Direction handoff until a real Production recommendation succeeds after this client correction is deployed.

## Marketing Direction

An accepted Business Marketing Plan may inform a later Marketing Direction, but it does not replace the direction contract and does not create a preparation package. The plan's workspace, source profile version, audience/topic mix, and owner edits are planning context only. Before package preparation, select one exact plan item or another separately authorized owner direction and run the full Truth Pack and package validation below.

ServSync internal plans use the ServSync internal Business Marketing Profile. Never reuse that profile or its recommended audience/topic mix as the default for a contractor Business Marketing workspace.

Every new package must answer one question before copy is prepared:

> What specific story are these pieces supposed to communicate?

The answer is the package's Marketing Direction. It is provider-neutral, inspectable, and bounded to:

- owner-led or system-recommended mode;
- one audience and objective;
- one concise direction statement and central message;
- up to four supporting points;
- explicit corrections for detected unsupported competitor assumptions;
- a short recommendation rationale only when Codex proposed the direction.

The approved `statement` is persisted through the existing immutable preparation-package `brief_summary`. The richer direction object remains part of the validated package artifact used by the operator. Hidden reasoning, chain-of-thought, provider metadata, and secrets are never stored.

### Owner-led direction

When the owner provides a thought, preserve its useful intent, compare it with the Truth Pack, and turn it into one concise direction. If the thought contains an unsupported implication, identify the issue before preparing copy and record the bounded correction in `corrected_assumptions`.

Example request:

> Prepare a ServSync marketing package for small HVAC contractors. Focus on customers being able to interact without immediately creating an account, while connected homeowners get additional ongoing value.

Codex should validate the two current ServSync paths, state any material correction, select a recipe, and prepare the package from the approved direction.

### Recommended direction

When no meaningful direction is supplied, Codex recommends one focused direction and gives a short practical rationale. If the task explicitly authorizes autonomous direction selection, Codex may use that safe recommendation and report it. Otherwise, present the recommendation for owner choice before preparing or ingesting content.

Example request:

> Prepare this week's ServSync marketing content for small HVAC contractors.

An appropriate recommendation may focus on one current contractor problem, one product capability, or the distinction between immediate document-specific customer interactions and the optional connected-homeowner relationship. It must not default to a full feature inventory.

### Direction safety check

Before preparing any item:

1. Compare the owner input, direction statement, central message, and supporting points with the current Truth Pack.
2. Detect unsupported assumptions about competitor account requirements, app downloads, subscriptions, missing features, difficulty, expense, fragmentation, or inferiority.
3. Preserve the useful underlying owner intent while removing the unsupported contrast.
4. Record each detected correction using the exact bounded correction code.
5. Stop if a safe grounded direction cannot be established.

For example, do not develop `Tell contractors they won't have to force customers to download an app anymore.` Instead, correct the unsupported competitor implication and use a direction such as: `Explain that customers can use certain secure ServSync-delivered documents without immediately becoming registered users, while a connected homeowner account supports additional ongoing service experiences.`

## Preparation Procedure

1. Start from current `origin/main` and confirm the target environment is authorized and has the matching migration.
2. Read the complete current Truth Pack and recipe set. Treat the Truth Pack as authoritative over generic model knowledge.
3. Establish and validate one owner-led or recommended Marketing Direction using the procedure above.
4. Choose one recipe allowed for the direction audience and a bounded item count from 1 through the recipe's available roles, with a maximum of 7.
5. Prepare distinct items that express the same direction through each role's `directionPurpose`. Do not insert status, provider, publishing, analytics, or approval fields.
6. Use one newly generated UUID as `preparation_request_id`. Keep it stable across retries of the same exact package.
7. Validate locally before any network action:

```bash
node scripts/marketing/marketing-package-contract.mjs path/to/package.json
```

8. Review the output as untrusted draft copy. Confirm every product statement against the Truth Pack, confirm the roles are meaningfully differentiated, and reject the complete package if any statement is unsupported or ambiguous.
9. Authenticate with an existing platform-admin account through approved secret configuration. Never place credentials in the package, command history, repository, screenshot, or report.
10. Ingest through the guarded operator. Sandbox example:

```bash
SERVSYNC_MARKETING_TARGET=sandbox \
SERVSYNC_MARKETING_SUPABASE_URL="$SERVSYNC_SANDBOX_SUPABASE_URL" \
SERVSYNC_MARKETING_SUPABASE_ANON_KEY="$SERVSYNC_SANDBOX_ANON_KEY" \
SERVSYNC_MARKETING_ACCESS_TOKEN="$SERVSYNC_MARKETING_ADMIN_ACCESS_TOKEN" \
npm run marketing:ingest-codex-package -- path/to/package.json
```

Password authentication is also supported through the approved secret-only `SERVSYNC_MARKETING_ADMIN_EMAIL` and `SERVSYNC_MARKETING_ADMIN_PASSWORD` variables. Never print them.
11. Verify the receipt reports `status: draft`, the requested count, and only non-secret record identifiers. A replay of the same UUID and exact package must return the same records with `replayed: true`.
12. Open Marketing -> Content and review the `Codex-prepared` drafts. Human workflow actions begin here; Codex must not invoke approval transitions.

## Package Contract

The current v3 top-level object has exactly:

- `preparation_request_id`
- `recipe_key`
- `truth_pack_version`
- `marketing_direction`
- `items`

`marketing_direction` has exactly:

- `mode`
- `owner_input`
- `audience`
- `objective`
- `statement`
- `central_message`
- `supporting_points`
- `corrected_assumptions`
- `recommendation_rationale`

Every item has exactly:

- `title`
- `content_type`
- `body`
- `channel_category`
- `intended_audience`
- `content_role`

The local validator rejects malformed directions, uncorrected competitor assumptions, unsupported public contrasts, audience conflicts, malformed values, unexpected keys, out-of-range counts, unknown enums, duplicate roles/titles/bodies, secret-like material, and bounded prohibited claims. The existing server boundary then revalidates the persisted direction statement and content. A failed package creates no durable package or content records.

Historical v1 packages retain `brief_summary` and remain locally replay-valid against the immutable v1 Truth Pack and recipes. Historical v2 packages remain replay-valid with their exact Marketing Direction. New packages may use v3 only in environments whose catalog still matches the exact planner-quality migration; environment rollout alone does not authorize ingestion.

Planner Coherence + Relevance v3 is a planning-only contract and is currently Sandbox-only. It improves which audiences, topics, and roles are recommended but does not create a Marketing Direction or content package. A user must still inspect and deliberately accept or revise the plan, establish the bounded Marketing Direction, validate against the applicable Truth Pack and recipe, and separately authorize ingestion. Demo and Production remain on planner v2 until the additive v3 RPC receives a separately approved migration-first rollout.

## Fail-Closed Rules

- Never treat a provider/model response as trusted or ready for approval.
- Never prepare copy before one Marketing Direction passes the Truth Pack safety check.
- Never use competitor behavior as the problem statement without current verified evidence and deliberate approval.
- Never substitute hard-coded sample copy after a preparation failure.
- Never split a failed package into unexplained partial persistence.
- Never change the UUID while retrying an ambiguous result until the existing request is checked.
- Never use a service-role key or direct table write.
- Never target Demo or Production without separate migration and ingestion authorization.
- Stop if the Truth Pack does not establish the requested claim, topic, or capability.

## Maintenance

Update the Truth Pack through a reviewed versioned change whenever a marketable capability, limitation, guest/connected relationship, or competitive-framing rule changes. Update recipes through a reviewed versioned change when roles, audiences, types, channel categories, or differentiation guidance changes. Do not rewrite a historical version in place after it has prepared durable records.

## Future Prepare Content UX

A later, separately reviewed in-app experience may offer an optional `What do you want to promote?` thought field plus `Suggest a direction`. Owner input should be refined and checked while preserving intent. Blank input should return one recommendation, a short rationale, and use/edit/another-suggestion choices. This should remain a guided preparation step, not a general-purpose chatbot, and it must not add approval or publishing authority.
