# Business Marketing Profile + Planning Foundation v1

## Status

Marketing Slice 4 is a private, provider-neutral foundation for business-specific Marketing strategy and bounded planning. The v1 foundation is applied and validated in Sandbox, Demo, and Production. Planner Quality v2 is source-complete and applied only in Sandbox; Demo and Production continue to use planner v1 until a separately authorized rollout. Runtime access remains limited to the ServSync internal platform-administrator workspace. No publishing, scheduling, campaign execution, paid AI, provider integration, contractor Marketing UI, or homeowner Marketing UI is included.

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

### Planner Quality v2

Planner v2 adds a shared, deterministic taxonomy instead of treating capitalization and harmless singular/plural variants as unrelated strategy. Canonical audience identities cover small contractors, HVAC, plumbing, electrical, carpentry, lawn/landscaping, pressure washing, handyman, and homeowners. Canonical topic families cover requests, estimates and approvals, jobs, invoices, customer communication, home history, secure document links, connected-homeowner relationships, and product demonstrations. Matching is deliberately bounded to reviewed aliases; unknown terms remain tenant-specific custom inputs and are not silently coerced into a known identity.

Recommended plans now use the profile's goals, audiences, service focus, emphasized topics, avoided topics, allowed channels, tone, business summary, owner notes, and latest-20 content context. They favor materially distinct audience/topic/role combinations, suppress false novelty across known aliases, and produce five through seven items when the profile contains enough supported combinations. A narrower contractor profile remains narrower: it receives relevant service/topic variation without inheriting ServSync-specific quotas, homeowner priorities, or platform strategy. Rationales describe only the selected goal, audience, topic, and actual recent-content evidence.

The recommendation contract is persisted explicitly. Historical recommended plans without the field parse as planner v1; new recommended plans store `recommendation_contract_version = 2` in the server-owned recent-content context. Owner-directed plans do not claim a recommendation version. Existing records and revisions are unchanged.

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

The final additive migration has SHA-256 `60ec19e374004cf4e87c2794e99095bc7a99823a463a60b60e326433137077c5`. It is applied and transactionally validated in Sandbox `zpzdkoaubyjtsomccxya`, Demo `bdytwgejqnlblhrnqxkp` (`2026-08-10T17:31:33Z` through `17:31:42Z`), and Production `uqgtheclhxqlnjpfmheq` (`2026-08-10T17:33:46Z` through `17:34:02Z`). The final definition serializes concurrent first-use replay for one request UUID. Each environment retains one internal profile, one initial profile revision, and zero plans or plan revisions. Production's two preparation packages, ten content records (three approved and seven draft), sixteen status events, and package/content/event fingerprints remained exact; Demo's zero-content baseline and unrelated business fingerprints also remained exact. Rollback-only workflow and tenant-isolation validation left no residue.

No environment variable, provider secret, Stripe setting, billing behavior, capability flag, external account, business record, or approved Production Marketing content is changed by this slice.

Planner Quality v2 migration `servsync-marketing-planner-quality-v2.sql` has exact SHA-256 `c05d5e84704d15ccc134970fd71dd297f26e936bbd4091e5a860d40a8ca2800`. It was applied only to Sandbox `zpzdkoaubyjtsomccxya` from `2026-08-10T18:55:42.015Z` through `18:55:42.590Z`. Rollback-only planner-v2 creation/replay, historical-v1 compatibility, expanded-audience Truth Pack v3 ingestion, authorization denial, and zero-residue checks passed. Sandbox retained zero plans, plan revisions, preparation packages, content records, and status events after validation. Demo and Production received no SQL or configuration change and require a separate migration-first authorization before this client can merge safely.

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
