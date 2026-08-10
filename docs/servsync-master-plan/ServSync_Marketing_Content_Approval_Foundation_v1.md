# ServSync Marketing Content + Approval Foundation v1

## Product Boundary

Marketing Foundation Slice 2 adds the first durable queue for ServSync's private internal Marketing workspace. It is part of one shared Marketing Engine domain that may later support separately authorized contractor Business Marketing workspaces without sharing internal records or authority.

This slice supports:

- creating an internal content idea;
- moving an idea into draft;
- editing an idea or draft with optimistic revision checks;
- submitting a non-empty draft for approval;
- approving submitted content;
- returning submitted content to draft with a reason;
- rejecting submitted content with a reason;
- listing and filtering the exact internal queue;
- showing the real `needs_approval` queue on the internal Marketing Overview.

It does not publish, schedule, generate, recommend, email, post, attribute, analyze, enrich, advertise, or expose Marketing to contractors or homeowners.

## Shared Domain

`marketing_workspaces` establishes reusable workspace identity:

- `internal` identifies ServSync's own private Marketing workspace;
- `contractor` is a schema-level future scope only and has no creation, read, mutation, or UI path in this slice;
- contractor workspaces, if later approved, must bind to the canonical contractor identity and receive separate tenant-derived RPCs and authorization.

The migration seeds only deterministic empty workspace `servsync_internal`. It creates no content or activity fixture.

`marketing_content_items` stores provider-neutral content and review state. Slice 2 deliberately excluded publishing state, provider identifiers, schedules, campaign identity, analytics, preparation provenance, and external-delivery details. The separately reviewed Codex-Assisted Marketing Draft Preparation v1 slice may add bounded provider-neutral preparation provenance without changing this approval contract.

`marketing_content_status_events` is append-only transition evidence. It records the exact content revision, prior and resulting status, actor, timestamp, and bounded review reason. There is no revision-history UI in this slice.

## Status Contract

The server accepts only:

```text
idea -> draft
draft -> needs_approval
needs_approval -> approved
needs_approval -> draft
needs_approval -> rejected
```

Returning or rejecting requires a 3-1,000 character reason. Submission requires non-empty content. Approved and rejected records are terminal in v1. Editing is limited to `idea` and `draft`. Every edit or transition requires the current `revision_number`; stale requests fail without overwriting newer state.

## Authorization And Data Access

The internal workspace is available only when `auth.uid()` resolves to a canonical `profiles.role = 'platform_admin'` context through the existing server helper.

The three tables are:

- owned by `postgres`;
- forced-RLS and policy-free;
- unavailable through direct `anon`, `authenticated`, or `service_role` table privileges.

Only these RPCs are browser-callable by `authenticated`:

- `servsync_list_internal_marketing_content`
- `servsync_create_internal_marketing_content`
- `servsync_update_internal_marketing_content`
- `servsync_transition_internal_marketing_content`

Each is `postgres`-owned, `SECURITY DEFINER`, and fixed-path. The server derives the internal workspace and actor; the browser cannot supply either. Contractor and homeowner calls fail closed. No contractor-facing or homeowner-facing Marketing API exists.

## Rollout State

Exact migration `servsync-internal-marketing-content-approval.sql`, SHA-256 `325befc738a373f431b52019c25b5018d31efd3e21c473cdf81a9d1fca721944`, is applied to Sandbox `zpzdkoaubyjtsomccxya`, Demo `bdytwgejqnlblhrnqxkp`, and Production `uqgtheclhxqlnjpfmheq`.

Demo application completed on 2026-08-09 from `20:02:56Z` through `20:02:57Z`; Production followed from `20:06:04Z` through `20:06:05Z` only after Demo passed. Both environments retain one deterministic internal workspace and zero content/status-event rows. Catalog, role denial, platform-admin workflow, idempotency, transition, stale-write, rollback-only cleanup, and business-data preservation checks passed. No environment variables, provider configuration, Marketing fixture, publishing path, or contractor/homeowner exposure was added.

## Future Slices

Separately reviewed work remains required for:

- content preparation or AI generation;
- revision workflow for approved content;
- scheduling and publishing;
- social and email providers;
- campaigns;
- prospecting and outreach;
- acquisition analytics and referral measurement;
- contractor Business Marketing workspaces and tenant authorization.

Codex-assisted external preparation is now a separately documented foundation applied in Sandbox, Demo, and Production; in-app runtime AI generation remains pending.
