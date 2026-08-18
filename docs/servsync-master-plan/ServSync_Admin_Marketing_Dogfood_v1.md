# ServSync Admin Marketing Dogfood v1

## Purpose

FB-037I proves the shared Marketing product in the ServSync internal workspace before selected-contractor beta access. The owner can prepare Simple Post, browser-upload, and existing ServSync product-media drafts through the same immutable Content, media, exact Preview, and Ready-package contracts intended for contractors. Broad contractor discovery remains default-off.

## Shared Product Experience

`Marketing -> Content -> Create post` presents three plain-language choices for the internal workspace:

1. **Simple post** prepares copy from an owner brief without media.
2. **Upload media** moves an acknowledged JPEG, PNG, WebP, or MP4 into private ServSync-managed Marketing Storage before copy is prepared. The resulting draft has no dependency on the operator's local file path.
3. **ServSync product media** selects an existing validated ServSync-owned product demonstration by friendly label. Internal users do not need a synthetic contractor Job or an asset/storage identifier.

Each generated draft remains editable. Content approval creates no publication authority. Source-bound media enters review as a candidate pairing; the owner can approve or remove it before preparing one exact destination package. Preparation opens that package's exact Preview, and a separate approval moves it to Ready. Publish Now and Schedule remain separate user actions and are not exercised by this milestone.

## Runtime AI And Usage

The existing JWT-protected runtime drafting path remains authoritative. It resolves the configured provider/model at runtime, rechecks global and workspace stops before a paid call, and records one append-only `ai_text_generation` event for a completed request. Exact request replay is bounded to the same Content result and does not create a second provider call or usage event.

The ordinary workspace summary shows AI drafts in the rolling 30-day window, active media slots, prepared posts, and recent provider/model/cost status. Ready, scheduled, and publishing exact packages count toward prepared-post capacity. Provider cost remains explicitly unavailable when no supported accounting source supplies an exact or estimated amount. Platform-wide controls and diagnostics sit behind the collapsed `Platform operations` boundary.

## Availability Boundary

The shared backend remains tenant-ready for contractor Owner/Admin/Office users, with Field Technician/Viewer denied. Ordinary contractor navigation and the Marketing workspace are additionally hidden unless the deployment explicitly sets `VITE_CONTRACTOR_MARKETING_UI_ENABLED=true`. The default absent/false state is fail-closed and is the Production state for this milestone. A selected-contractor beta requires a separately governed rollout mechanism and validation; this milestone does not broadly enable Marketing.

## Persistence And Rollout

Two bounded additive migrations support the internal dogfood surface:

- `servsync-admin-marketing-dogfood.sql` is 294 lines at SHA-256 `a1d7fc3958e79f4b48010621eeb6921a17d2bd66903b5955e1a9e6f3c27b814d`. It adds internal managed-product-media creation context and recent AI text usage evidence while preserving canonical asset and immutable pairing lineage.
- `servsync-admin-marketing-prepared-usage-forward-fix.sql` is 72 lines at SHA-256 `b9412772656ca0820c659cc609825c0ebc23619135b7a0f55a32ad0d924a0650`. It corrects prepared-post usage to count Ready/Scheduled/Publishing packages introduced by G-C rather than older publication rows.

Exact bytes were applied Sandbox -> Demo -> Production on 2026-08-18 UTC. Production retained 17 Content items, three assets, six pairings, one published flagship, and four publication events. The flagship Facebook Video ID remains `1616577883220910`; provider submission remains disabled and no provider request occurred.

## Cleanup Scheduler Evidence

Vercel's Production deployment recorded a natural `GET /api/marketing-media-cleanup` at `2026-08-18T05:43:24Z`, matching the configured `43 5 * * *` schedule, with HTTP 200. No manual dispatch or local invocation was substituted. There were no eligible Production objects to purge, so existing protected assets and history remained unchanged.

## Deferred

- selected-contractor beta enrollment and discovery;
- broad contractor rollout;
- advanced media composition or editing;
- image/video/TTS generation;
- provider cost reconciliation beyond supported evidence;
- additional publishing providers, analytics, and campaigns;
- any new live public provider post.
