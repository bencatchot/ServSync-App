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

## Production Dogfood Evidence

The owner completed all three paths through the authenticated Production UI on 2026-08-18. Each path used one `openai` / `gpt-4o-mini` request, produced one completed `ai_text_generation` usage event, was revised through the ordinary immutable Content editor, and reached one exact Ready package without Publish Now or Schedule.

| Path | Final Content | Media | Exact Ready package | Runtime evidence |
| --- | --- | --- | --- | --- |
| Simple post | `7409fa55-b3da-4f6f-9972-e3a71f47c9a7`, revision 4, **Start with one clear service request** | None | `35e6a203-9ce9-434d-9acf-7f5906cdf995` | 470 input / 127 output tokens; cost unavailable |
| Upload media | `4e6fa3f4-7256-4432-9fe2-5a84abbcc117`, revision 4, **A clearer start for home service** | Asset `55062c04-3ff5-4ec0-8cc6-444447797c5d`; pairing `94294206-5e9e-4455-9aa1-70c6a53ef55c` | `8904355d-0088-4bab-bada-050238ece73f` | 487 input / 119 output tokens; cost unavailable |
| ServSync product media | `f2b93522-09f3-4976-b269-7b18c3ef240d`, revision 4, **Return to a finalized home service report** | Canonical asset `6968a17c-0e0f-4b5a-bf8f-8a1c33885b06`; pairing `9b6df7bb-6bc8-4b46-9bc8-70efdc0bf99b` | `a91a6d24-9f3a-49ed-a749-316860ec6c33` | 487 input / 117 output tokens; cost unavailable |

The upload path stored a rights-acknowledged 1200x2423 PNG as a private 426,520-byte managed asset with validation passed and no durable dependency on its local source path. Ready-package protection correctly leaves `purge_after` unset. The product-media path selected the friendly **Homeowner Home History - 29 sec video** option and previewed the canonical 29.24-second, 1440x900 managed MP4 without exposing an asset ID or Storage path in the creation flow.

All three first-generation drafts needed substantive copy correction. The recurring issues were promotional wording, broad ease/organization claims, and language less precise than the supported ServSync interaction. The owner corrected every draft entirely in ServSync; no Codex-written copy was inserted outside the product lifecycle. This is a bounded prompt/content-quality finding rather than a workflow blocker. The final approved revisions remained plainspoken and source-grounded.

After dogfood, the ordinary quota display reported three AI drafts, one of three active media slots, and three of five prepared packages. The database contained exactly three completed generation requests and three matching usage events. Cost remained `unavailable`; no dollar amount is claimed.

The upload-media run also exposed a real shared-product defect: Content could hand off to Campaigns before the current media catalog loaded, making an approved candidate pairing look text-only until manual Refresh. PR #481 changed the handoff to load publishing state before selection and added a stale-catalog browser regression. Production verification after deployment showed the candidate media and `Approve media` action immediately, with no manual refresh.

Desktop dogfood covered the complete authenticated Production flow. Shared browser tests cover source choice, upload, generation, editing, media review, quota state, exact Preview, approval, Ready, and horizontal-overflow behavior at 1440x900 and 390x844. The authenticated Production browser surface was desktop-only, so the mobile result is exact-head automated evidence rather than a separate real-device owner session.

## Availability Boundary

The shared backend remains tenant-ready for contractor Owner/Admin/Office users, with Field Technician/Viewer denied. Ordinary contractor navigation and the Marketing workspace are additionally hidden unless the deployment explicitly sets `VITE_CONTRACTOR_MARKETING_UI_ENABLED=true`. The default absent/false state is fail-closed and is the Production state for this milestone. A selected-contractor beta requires a separately governed rollout mechanism and validation; this milestone does not broadly enable Marketing.

## Persistence And Rollout

Two bounded additive migrations support the internal dogfood surface:

- `servsync-admin-marketing-dogfood.sql` is 294 lines at SHA-256 `a1d7fc3958e79f4b48010621eeb6921a17d2bd66903b5955e1a9e6f3c27b814d`. It adds internal managed-product-media creation context and recent AI text usage evidence while preserving canonical asset and immutable pairing lineage.
- `servsync-admin-marketing-prepared-usage-forward-fix.sql` is 72 lines at SHA-256 `b9412772656ca0820c659cc609825c0ebc23619135b7a0f55a32ad0d924a0650`. It corrects prepared-post usage to count Ready/Scheduled/Publishing packages introduced by G-C rather than older publication rows.

Exact bytes were applied Sandbox -> Demo -> Production on 2026-08-18 UTC. Before dogfood, Production retained 17 Content items, three assets, six pairings, one published flagship, and four publication events. After the three owner flows, only the expected authoring state changed: 20 Content items, four assets, eight pairings, three Ready packages, one existing publication, and the same four publication events. The flagship Facebook Video ID remains `1616577883220910`; provider submission remains disabled and no provider request occurred.

## Cleanup Scheduler Evidence

Vercel's Production deployment recorded a natural `GET /api/marketing-media-cleanup` at `2026-08-18T05:43:24Z`, matching the configured `43 5 * * *` schedule, with HTTP 200. No manual dispatch or local invocation was substituted. There were no eligible Production objects to purge, so existing protected assets and history remained unchanged.

## Owner Workflow

To repeat the proved flow in Production:

1. Open `Internal Marketing -> Content -> Create post`.
2. Choose **Simple post**, **Upload media**, or **ServSync product media**.
3. Enter the brief, acknowledge public-use rights when uploading, and prepare the draft.
4. Edit, submit, and approve the copy through the ordinary Content lifecycle.
5. Select **Preview for Facebook**, review or approve the candidate media where present, and prepare the exact Preview.
6. Approve the exact package to move it to Ready.

Stop before **Publish Now** or **Schedule** unless a separate public-action authorization applies.

## Deferred

- selected-contractor beta enrollment and discovery;
- broad contractor rollout;
- advanced media composition or editing;
- image/video/TTS generation;
- provider cost reconciliation beyond supported evidence;
- additional publishing providers, analytics, and campaigns;
- any new live public provider post.
