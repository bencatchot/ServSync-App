# Business Marketing Profile + Planning Foundation v1

## Status

Marketing Slice 4 is a private, provider-neutral foundation for business-specific Marketing strategy and bounded planning. The exact migration is applied and validated in Sandbox only. Demo and Production rollout require separate authorization. No publishing, scheduling, campaign execution, paid AI, provider integration, contractor Marketing UI, or homeowner Marketing UI is included.

## Architecture

The shared domain now has this explicit order:

`Marketing workspace -> Business Marketing Profile -> Marketing Plan -> Marketing Direction -> Content package -> Human approval`

`marketing_workspaces` remains the tenant anchor. The existing `internal` workspace represents ServSync itself; a future `contractor` workspace continues to bind to exactly one canonical `contractor_profiles.id`. The profile and plan tables use `workspace_id` and do not create another contractor, customer, property, trade, or service-area identity.

ServSync internal Marketing strategy is tenant-specific and must not define contractor Marketing defaults.

## Canonical Data And Marketing Strategy

For a future contractor workspace, canonical business name, business summary, service categories, city/state, ZIP coverage, and service areas should continue to come from the existing contractor profile and service-area models. Marketing-specific storage is reserved for deliberate strategy and overrides:

- selected audience segments;
- selected service/product focus;
- primary and secondary Marketing goals;
- optional geographic emphasis beyond canonical service-area facts;
- tone/style;
- intentionally supplied offers;
- allowed channel categories;
- emphasized and avoided topics;
- bounded owner notes.

The internal workspace has no contractor profile, so its profile stores the reviewed ServSync-specific Marketing context. That profile includes small-contractor, trade-specific, homeowner, product-education, and demonstration priorities only for ServSync.

## Persistence

`marketing_business_profiles` stores one current profile per workspace with optimistic `profile_version` control. `marketing_business_profile_revisions` preserves each exact profile snapshot, including the bootstrap version.

`marketing_plans` stores one bounded planning period, mode (`owner_directed` or `recommended`), source profile version, current draft/accepted status, exact items, and server-derived recent-content context. `marketing_plan_revisions` preserves the initial, edited, and accepted snapshots. Accepted plans cannot be edited in v1.

Revision tables are append-only. All four tables are `postgres`-owned, forced-RLS, policy-free, and unavailable through direct browser or service-role table grants.

## Planning Behavior

Owner-directed planning preserves one supplied direction while requiring the selected audience and topic to come from the active profile. Recommended planning is deterministic and provider-neutral: it considers profile audiences/topics plus the latest 20 workspace content records, then favors less-repeated audience/topic/role combinations. It stores a concise rationale, not hidden reasoning.

The recommendation algorithm never supplies ServSync's profile as a generic contractor fallback. A contractor-shaped profile produces a structurally separate planning context in source and SQL tests.

Plan items are limited to seven and contain only audience, topic, direction, rationale, and one to three known content roles. Existing Marketing claim-safety checks reject obvious prohibited claim classes before persistence. A profile or plan remains strategy, not factual product truth; later Marketing Direction and content preparation must still use the applicable approved Truth Pack.

## Current Authorization

Only an authenticated `platform_admin` can call:

- `servsync_get_internal_marketing_planning`
- `servsync_update_internal_marketing_profile`
- `servsync_create_internal_marketing_plan`
- `servsync_update_internal_marketing_plan`
- `servsync_accept_internal_marketing_plan`

Workspace, actor, recent-content context, and current profile version are derived server-side. Contractor and homeowner calls fail closed. No contractor-facing profile/plan RPC or UI exists in this slice.

## Internal UX

Marketing -> Settings now contains a compact Profile/Plan workspace. A platform administrator can inspect and edit the ServSync profile, request a profile-based recommendation, prepare an owner-directed plan, edit/add/remove draft plan items, and accept a plan. Acceptance creates no Marketing content and has no submit, approve, schedule, or publish effect.

Loading, error, incomplete-profile, stale-write, and accepted-plan states remain explicit. Desktop and `390x844` layouts are covered.

## Rollout Boundary

The final additive migration has SHA-256 `60ec19e374004cf4e87c2794e99095bc7a99823a463a60b60e326433137077c5`. It is applied and transactionally validated in Sandbox `zpzdkoaubyjtsomccxya`, including a narrow post-application correction that serializes concurrent first-use replay for one request UUID. Sandbox retains one internal profile, one initial profile revision, zero plans, zero plan revisions, and unchanged Marketing content/package/event counts. Demo and Production remain pending until a separately authorized migration-first rollout. Until then, those environments retain their existing Marketing content/approval behavior; the unmerged Slice 4 client is not Production runtime.

No environment variable, provider secret, Stripe setting, billing behavior, capability flag, external account, business record, or approved Production Marketing content is changed by this slice.

## Deferred

- contractor Business Marketing activation and authorization;
- contractor canonical-profile/context RPC composition;
- content creation from accepted plans;
- publishing and scheduling;
- social/provider OAuth;
- paid runtime AI;
- campaigns, outreach, analytics, and autonomous execution;
- plan revision after acceptance;
- homeowner Marketing visibility.
