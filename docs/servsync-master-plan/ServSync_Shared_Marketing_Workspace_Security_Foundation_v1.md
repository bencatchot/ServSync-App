# ServSync Shared Marketing Workspace Security Foundation v1

## Scope

FB-037G-A makes the existing ServSync internal Marketing workspace the first tenant of one shared Marketing domain. Future contractor Marketing uses the same workspace, Content, media, pairing, provider, and publication tables rather than a parallel contractor data model.

This foundation adds identity, access resolution, and same-workspace lineage only. It does not expose contractor Marketing UI or add media intake, generation, quotas, costs, retention, a publishing queue, scheduling, or standing publication authority.

## Workspace Identity

`marketing_workspaces` remains the authoritative root:

- `internal` with key `servsync_internal` identifies ServSync's platform workspace and has no contractor.
- `contractor` identifies one canonical contractor-owned workspace and must reference one active `contractor_profiles` row.
- A partial unique index permits exactly one internal workspace and at most one workspace per contractor.
- Contractor workspace keys are deterministic from the canonical contractor UUID. The browser never supplies a trusted workspace ID.

The public resolver accepts either internal context (`contractor_id = null`) or one canonical contractor UUID. It derives the workspace server-side and then checks the authenticated actor before returning bounded identity and capability data.

## Role Authority

| Actor | Read | Create/edit | Approve | Provider connection | Publish capability foundation |
| --- | --- | --- | --- | --- | --- |
| Platform admin, ServSync internal workspace | Yes | Yes | Yes | Yes | Yes |
| Contractor Owner | Own workspace | Own workspace | Own workspace | Own workspace | Own workspace |
| Contractor Admin | Own workspace | Own workspace | Own workspace | Own workspace | Own workspace |
| Contractor Office | Own workspace | Own workspace | Own workspace | Own workspace | Own workspace |
| Contractor Field Technician | No | No | No | No | No |
| Contractor Viewer | No | No | No | No | No |
| Homeowner / anonymous / unrelated contractor | No | No | No | No | No |

The publish capability is server-side authority groundwork, not a released Publish Now or Schedule experience. Existing provider readiness, lifecycle checks, exact-approval checks, worker authorization, and normally disabled public-post gates remain independently authoritative.

Platform administration is deliberately limited to the ServSync internal workspace. This foundation does not silently grant platform admins broad contractor Marketing inspection. A future support-access policy requires a separate product and security decision.

## Data Isolation

Every existing Marketing table remains forced-RLS and unavailable through direct `anon`, `authenticated`, or generic `service_role` table privileges. Browser access is through narrowly granted, `postgres`-owned `SECURITY DEFINER` functions with fixed `search_path` and internal role/workspace checks.

Composite `(workspace_id, id)` identities and validated composite foreign keys require workspace agreement across:

- Business Marketing Profile and revisions;
- Plans, Directions, and preparation packages;
- Content and status events;
- media assets, pairings, and pairing events;
- provider connections, Vault-reference rows, and OAuth sessions;
- publications and publication events.

This means a publication cannot combine Contractor A Content with Contractor B media, pairing, or provider connection even if every individual UUID exists. Existing execution-time provider checks remain in place as an additional defense.

## Server Contracts

Authenticated callers receive only these shared public entry points:

- `servsync_get_marketing_workspace_access`
- `servsync_ensure_contractor_marketing_workspace`
- `servsync_list_marketing_content`
- `servsync_create_marketing_content`
- `servsync_update_marketing_content`
- `servsync_transition_marketing_content`

Read resolvers are `STABLE`. Workspace creation and Content mutation functions are `VOLATILE`. Private helper functions have no effective execution grant for `PUBLIC`, `anon`, `authenticated`, or `service_role`.

Existing platform-only planning, Direction, media-review, connection, and publication diagnostics remain explicit internal operations until later shared contracts are separately implemented. The internal Content UI now uses the shared resolver path, proving the first workspace is not on a parallel Content access model.

## Rollout And Preservation

Exact migration `servsync-shared-marketing-workspace-security-foundation.sql`, SHA-256 `fb7e626d4a44015df4172687d122e1822c696867dc81f4b5f4a80548c42d1e96`, is applied to Sandbox, Demo, and Production.

Sandbox and Demo passed rollback-only two-contractor Owner/Admin/Office/Field Technician/Viewer isolation fixtures with no durable fixture residue. Production retained one internal workspace, 17 Content rows, 41 Content events, three assets, six pairings, three provider connections, one publication, and four publication events. The existing flagship retained Content revision 9, pairing and asset identity, exact source checksum, published status, and Facebook Video ID `1616577883220910`.

Database publishing remained disabled and `SERVSYNC_FACEBOOK_PUBLIC_POSTS_ENABLED` remained absent. No provider request occurred.

## Decomposition

FB-037G-B is completed in [Marketing Media, Cost, and Ephemeral Lifecycle v1](./ServSync_Marketing_Media_Cost_Ephemeral_Lifecycle_v1.md):

- Job media intake and Marketing-only uploads;
- image support;
- active-media and monthly-generation quotas;
- generation cost metering, enforcement, and circuit breakers;
- retention, purge, purge workers, and lightweight post-purge history.

FB-037G-C remains responsible for:

- contractor queue UI and exact preview-card selection;
- Needs Review, Ready, Published, and Needs Attention presentation;
- Publish Now and Schedule authorization UX;
- ordinary contractor provider connection and publication history UX;
- replay-receipt and post-verification readiness presentation polish where still applicable.

FB-037G-C is not implemented by either foundation.
