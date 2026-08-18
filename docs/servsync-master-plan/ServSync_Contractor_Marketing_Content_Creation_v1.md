# ServSync Contractor Marketing Content Creation v1

## Purpose

FB-037H turns the shared Marketing workspace into a useful draft-creation surface without weakening the existing human publication boundary. ServSync internal Marketing and contractor workspaces use the same Content, media, review, and publishing contracts.

## Shared Create Post

`Marketing -> Content -> Create post` offers three bounded paths:

1. **From a Job** lets an Owner, Admin, or Office user choose one completed/closed Job and one eligible registered JPEG, PNG, WebP, or MP4. The user must acknowledge public-use rights. ServSync copies only the selected bytes into an ephemeral private Marketing derivative; canonical Job media is never changed or purged by Marketing.
2. **Upload media** uses the G-B private reserved-path intake, rights acknowledgement, checksum, MIME/size/duration validation, poster, active-slot limit, and retention lifecycle. The uploaded source no longer depends on the operator's computer after finalization.
3. **Simple post** creates a text-first draft from the user's brief. It requires no media and does not consume the video-generation allowance.

ServSync internal Marketing receives Upload, Simple Post, and a friendly **ServSync product media** selector backed by validated internal managed assets. Job sourcing remains contractor-only because internal Marketing has no contractor Job tenant. The two source choices preserve the same canonical asset, private-media, candidate-pairing, and exact Preview contracts without asking an internal user to fabricate a contractor Job.

## Grounding And Privacy

Runtime copy uses the exact workspace Business Marketing Profile, the owner's brief, and a bounded source snapshot. Job-grounded provider context contains Job lifecycle state plus completed work-item title/customer description only. Customer names, email/phone, home/address, internal notes, prices, payments, invoices, reports, and unrelated attachments are excluded. Browser-supplied workspace, Job, and asset IDs are re-resolved server-side.

The prompt prohibits invented customers, addresses, prices, dates, credentials, ratings, guarantees, metrics, and unsupported work. This is a bounded product safeguard, not a claim of automated legal or perfect fact checking. The user reviews and may edit the ordinary draft before approval.

## Runtime AI Contract

The `marketing-content-draft` Edge Function requires a valid user JWT. It reserves a workspace-scoped request, claims it through a service-only function, and performs one configured OpenAI Responses API call with strict `{title, body}` structured output. The model resolves from `SERVSYNC_MARKETING_TEXT_MODEL`, then `OPENAI_MODEL`, then the current `gpt-4o-mini` alias.

The same client request and fingerprint returns the same completed Content. A conflicting fingerprint fails. Processing, failed, or uncertain requests never produce a blind second provider call. Global/workspace generation stops and the global budget hard stop are checked at reservation and again immediately before claim/provider execution.

Successful drafting records input/output tokens in one append-only `ai_text_generation` usage event. Text generation is outside the four-video-generation allowance; no Sora, image generation, media render, or TTS call occurs. Provider cost remains `unavailable` until a separately governed estimator/reconciliation source can support a truthful value.

## Immutable Review And Publishing

Generated copy creates an ordinary revision-1 `draft` with runtime-AI provenance and no publication authority. Existing Content edit, submit, revise, and approval behavior remains authoritative. If the exact draft has a source asset, Content approval creates only a `candidate` G-C pairing. Media review remains separate.

No Create Post action creates a publication, schedule, provider request, or public post. G-C exact Preview and explicit Publish Now/Schedule remain the only user publication authorization boundary, and platform/deployment provider-submission stops remain independent.

## Tenant And Role Boundary

- Owner/Admin/Office: read and create/edit in their own contractor Marketing workspace.
- Field Technician/Viewer: no Marketing creation authority.
- Platform admin: ServSync internal workspace only; no silent contractor-workspace visibility.
- Service role: purpose-bound claim/complete/fail functions only; no generic direct table access.
- Anon/unrelated authenticated users: no private table or cross-workspace access.

Private source/request tables use forced RLS. Security-definer functions are `postgres`-owned, use explicit safe search paths and volatility, revoke `PUBLIC`, and grant only the reviewed authenticated or service role.

Contractor discovery is separately gated in the application. `VITE_CONTRACTOR_MARKETING_UI_ENABLED=true` is required before Owner/Admin/Office navigation or workspace rendering is exposed; absent/false is the default fail-closed state. This rollout gate does not replace backend role or tenant authority.

## Beta Limits And Media Lifecycle

G-B remains authoritative: three active media slots, four video-generation reservations per rolling 30 days, five prepared/scheduled posts, 75-second MP4 ceiling, 72-hour verified-publication large-media retention, and 30-day abandoned-media expiration. This slice does not add generated video, multi-asset composition, narration, or permanent media storage.

## Rollout Evidence

Migration `servsync-contractor-marketing-content-creation.sql` is 515 lines with SHA-256 `570a10b8373a20df3324c89dd2c27c8ca2209b4a3f780147e403602550dc977a`. Exact bytes and Edge Function source were rolled out Sandbox -> Demo -> Production on 2026-08-18 UTC.

Sandbox proved one real configured text generation plus exact replay: one draft, one usage event, no video-generation consumption, and zero publications. Demo's database and function are installed but provider execution remains fail-closed because no approved Demo OpenAI secret exists. Production has the approved provider configuration and preserved every existing Marketing count and the exact live flagship.

The Production cleanup Cron remains configured for 05:43 UTC. Vercel recorded a natural HTTP 200 execution at `2026-08-18T05:43:24Z`; no manual run was substituted. No Production media was eligible for purge.

## Deferred

- multi-image/video composition and ordering;
- media overlays, cuts, rendering, and async render jobs;
- optional contractor-selected TTS and disclosure;
- permanent or paid media library plans;
- advanced regeneration controls and cost estimation/reconciliation;
- additional publishing providers, analytics, and campaigns;
- selected-contractor beta enrollment and broader real-contractor usability evidence.
