# Business Marketing Profile + Planning Foundation v1

## Status

Marketing Slice 4 is a private, provider-neutral foundation for business-specific Marketing strategy and bounded planning. The v1 foundation, Planner Quality v2 compatibility migration, and Planner Coherence + Relevance v3 migration are applied and validated in Sandbox, Demo, and Production. Runtime access remains limited to the ServSync internal platform-administrator workspace. No publishing, scheduling, campaign execution, paid AI, provider integration, contractor Marketing UI, or homeowner Marketing UI is included.

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

### Planner Coherence + Relevance v3

Planner v3 ranks tenant relevance and topic specificity before variety. It rejects generic filler topics, requires explicit profile support before selecting a trade-specific audience, distinguishes exact recent coverage from related coverage, and chooses a content role for its semantic fit before considering channel preference. A feature-announcement role is unavailable unless the Profile supplies an actual announcement or launch context.

The plan is selected in a deliberate order: primary-goal fit, bounded secondary-goal support, tenant-profile evidence, topic specificity, recent exact/related coverage, then limited audience/topic/theme repetition control. Diversity balances strong tenant-relevant recommendations; it does not require maximizing unique audiences, trades, topics, roles, or channels. A coherent plan may therefore repeat a well-supported audience or role when that is more useful than introducing a weak new one.

Each rationale now states why the topic and audience fit the Profile, whether recent content is exact, related, or new, and what the selected role contributes. Scores and internal ranking metadata are not persisted or displayed. Planner v3 remains deterministic assistance rather than product truth; Marketing Direction, Truth Pack validation, human review, approval, scheduling, and publishing boundaries are unchanged.

Planner v3 operational hardening keeps the same persisted version and RPC contract. Discovery/profile cautionary language avoids prohibited affirmative claim tokens while preserving the same truth boundary. Customer communication treats only the reviewed request, estimate/response, secure-link, and connected-homeowner families as related. A Product demonstrations recommendation dynamically chooses one named eligible interaction from current Profile priorities and recent-content evidence; if none exists, the generic demonstration candidate is excluded. These are source-only corrections and do not rewrite historical plans or weaken server validation.

Recommended v3 plans use the additive `servsync_create_internal_marketing_plan_v3` RPC and persist `recommendation_contract_version = 3`. The existing `servsync_create_internal_marketing_plan` RPC remains unchanged for owner-directed plans and historical planner v1/v2 compatibility. Historical plan rows and revisions are not rewritten.

## Current Authorization

Only an authenticated `platform_admin` can call:

- `servsync_get_internal_marketing_planning`
- `servsync_update_internal_marketing_profile`
- `servsync_create_internal_marketing_plan`
- `servsync_update_internal_marketing_plan`
- `servsync_accept_internal_marketing_plan`

Sandbox, Demo, and Production expose `servsync_create_internal_marketing_plan_v3` to authenticated platform administrators only. It derives the workspace, actor, current profile, and recent-content context server-side and retains the same replay, tenant, mode, and version checks as the established planning boundary.

Workspace, actor, recent-content context, and current profile version are derived server-side. Contractor and homeowner calls fail closed. No contractor-facing profile/plan RPC or UI exists in this slice.

## Internal UX

Marketing -> Settings contains a compact Profile/Plan/Directions workspace. A platform administrator can inspect and edit the ServSync profile, request a profile-based recommendation, prepare an owner-directed plan, edit/add/remove draft plan items, and accept a plan. In environments with the separately reviewed Slice 5 migration, the same workspace can load, refine, and approve exact accepted-Plan Directions. Acceptance and Direction approval create no Marketing content and have no submit, schedule, or publish effect.

Loading, error, incomplete-profile, stale-write, and accepted-plan states remain explicit. Desktop and `390x844` layouts are covered.

## Rollout Boundary

The final additive migration has SHA-256 `60ec19e374004cf4e87c2794e99095bc7a99823a463a60b60e326433137077c5`. It is applied and transactionally validated in Sandbox `zpzdkoaubyjtsomccxya`, Demo `bdytwgejqnlblhrnqxkp` (`2026-08-10T17:31:33Z` through `17:31:42Z`), and Production `uqgtheclhxqlnjpfmheq` (`2026-08-10T17:33:46Z` through `17:34:02Z`). The final definition serializes concurrent first-use replay for one request UUID. Each environment retains one internal profile, one initial profile revision, and zero plans or plan revisions. Production's two preparation packages, ten content records (three approved and seven draft), sixteen status events, and package/content/event fingerprints remained exact; Demo's zero-content baseline and unrelated business fingerprints also remained exact. Rollback-only workflow and tenant-isolation validation left no residue.

No environment variable, provider secret, Stripe setting, billing behavior, capability flag, external account, business record, or approved Production Marketing content is changed by this slice.

Planner Quality v2 migration `servsync-marketing-planner-quality-v2.sql` has exact SHA-256 `c05d5e84704d15ccc134970fd71dd297f26e936bbd4091e5a860d40a8ca2800`. It was applied to Sandbox `zpzdkoaubyjtsomccxya` from `2026-08-10T18:55:42.015Z` through `18:55:42.590Z`, Demo `bdytwgejqnlblhrnqxkp` from `21:07:08.739Z` through `21:07:09.034Z`, and Production `uqgtheclhxqlnjpfmheq` from `21:09:14.501Z` through `21:09:14.871Z`. Demo passed before Production was touched. Rollback-only planner-v2 creation/replay, omitted-version v1 compatibility, conflicting and unsupported version rejection, expanded-audience Truth Pack v3 ingestion, authorization denial, and zero-residue checks passed in both target environments. Demo retained zero plans, plan revisions, preparation packages, content records, and status events. Production retained its exact historical planner-v1 plan and revision, two packages, ten content records, and sixteen status events with unchanged Marketing and unrelated-business fingerprints. No environment configuration or provider state changed.

Planner Coherence + Relevance v3 migration `servsync-marketing-planner-coherence-relevance-v3.sql` has exact SHA-256 `c7360421519d5bf494a874aa5ec257a428b204e50d624d0f1139d0a1959ed81b`. It was applied to Sandbox `zpzdkoaubyjtsomccxya` from `2026-08-10T21:44:21.151Z` through `21:44:21.574Z`, Demo `bdytwgejqnlblhrnqxkp` from `22:07:54Z` through `22:08:02Z`, and Production `uqgtheclhxqlnjpfmheq` from `22:11:21Z` through `22:11:30Z`. Demo passed before Production was touched. Catalog/security and rollback-only planner-v3 creation, exact replay, conflicting replay rejection, version/mode enforcement, historical v1/v2 preservation, and contractor/homeowner/anonymous denial passed with zero residue. Demo retained its zero-plan/content baseline. Production retained exact historical planner-v1 and planner-v2 plans and revisions, two packages, ten content records, sixteen status events, and unchanged Marketing and unrelated-business fingerprints. No provider, environment variable, content, approval, publishing, scheduling, Stripe, billing, or unrelated business state changed.

## Deferred

- contractor Business Marketing activation and authorization;
- contractor canonical-profile/context RPC composition;
- Demo/Production rollout of the durable Marketing Direction foundation;
- content creation from approved Directions;
- publishing and scheduling;
- social/provider OAuth;
- paid runtime AI;
- campaigns, outreach, analytics, and autonomous execution;
- plan revision after acceptance;
- homeowner Marketing visibility.
