# ServSync Facebook Managed Video Publishing v1

## Scope

This adapter publishes one exact approved ServSync Marketing caption and one exact approved managed MP4 to the connected ServSync Facebook Page. It extends the provider-neutral publication worker; it does not create a parallel scheduler, approval system, retry model, or asset store.

The adapter is deployed and the first bounded live verification is complete. Normal operation remains disabled behind both public-post gates; that one-post authorization is exhausted and grants no future publication authority.

## Current Meta Contract

Meta Graph API `v26.0` documents direct Page video creation through `POST /{page-id}/videos`. For ServSync's bounded managed MP4, the request uses:

- host: `graph-video.facebook.com`;
- Page access token in the `Authorization` header;
- multipart `source` containing the exact validated MP4 bytes;
- `description` containing the exact immutable public message, including the required AI-voice disclosure;
- `published=true`;
- a server-derived app-secret proof.

The current Meta publishing guide also recommends resumable upload handles for broader upload workflows. That path begins with a User access token. ServSync intentionally destroys the transient owner User token after Page selection and stores only the durable Page token in Vault. Direct multipart Page upload is therefore the narrower documented contract for the current approximately 5 MB flagship asset and avoids expanding token retention.

Required Page authority remains:

- `pages_show_list`;
- `pages_read_engagement`;
- `pages_manage_posts`;
- the `CREATE_CONTENT` Page task.

Primary references:

- [Meta Video API publishing guide](https://developers.facebook.com/docs/video-api/guides/publishing/)
- [Meta Page videos reference](https://developers.facebook.com/docs/graph-api/reference/page/videos/)
- [Meta Video reference](https://developers.facebook.com/docs/graph-api/reference/video/)

## Exact Media Boundary

Before marking any provider request as started, the worker:

1. reauthorizes the publication through a purpose-bound service-role RPC;
2. verifies the publication's immutable Content revision, approved media pairing, asset validation state, private Storage identity, MIME type, size, SHA-256, and required narration disclosure;
3. downloads the exact object from private `marketing-assets` Storage;
4. verifies downloaded byte count and SHA-256 against the immutable snapshot;
5. builds one multipart video request with the exact public message.

The provider adapter accepts MP4 only and enforces ServSync's existing 100 MB managed-asset ceiling. The raw video is not persisted again. Browser code never receives provider credentials or private Storage bytes. Required media can never fall back to a text-only feed post.

The eligible managed-video set includes recorder-validated silent masters, narrated derivatives with their required disclosure, and an ordinary Marketing MP4 upload only after the uploader acknowledges the media-rights statement and an owner approves its exact Content/media pairing. The worker rechecks that the uploaded asset still has its original consumed Marketing intake, rights acknowledgement, immutable Storage identity, size, and checksum. Job media derivatives and unfinished Marketing compositions remain ineligible; approval does not silently broaden their publishing authority.

## Provider State And Duplicate Safety

Meta documents `id` and `video_id` response fields for Page video creation. ServSync accepts either numeric Video ID, rejects conflicting fields as uncertain, records which field was returned, and persists the resulting ID with an `accepted` provider state before confirmation. The stored provider identifier is explicitly a Video ID, not an assumed Page feed-post ID.

Confirmation is a read-only `GET /{video-id}` for `id`, `created_time`, and `description`:

- matching Video ID, provider creation time, and exact description -> `published` / `confirmed`;
- known Video ID without complete confirmation -> `processing`, then a later 15-minute worker reconciliation of the same ID;
- provider rejection before acceptance -> sanitized failure under existing retry rules;
- timeout, malformed success, or any upload result without a usable Video ID -> terminal `provider_uncertain`, with no blind upload retry;
- known Video ID still unconfirmed after eight bounded checks -> terminal `provider_uncertain`, preserving the ID for operator investigation.

Reconciliation never rereads or reuploads the media. A failed run cannot discard a known provider identifier. This deliberately favors duplicate prevention over automatic recovery from an ambiguous upload response.

## First Live Verification Evidence

On 2026-08-17 UTC, the exact migration at SHA-256 `bc5303a1cb6b5fce9bb58d507d843e6faa4b9ac70dc6792fb0fc6c1b2482bec6` passed Sandbox -> Demo -> Production rollout. The subsequent separately owner-authorized Production action used:

- Content `67790a72-b9c4-4796-9fcf-e0d5b9d6149a`, revision 9;
- pairing `460c7689-a2c6-4f8c-addd-511b5e8abd23`;
- asset `2097be01-0be4-4f8e-bef2-2e81adb9c95d` at SHA-256 `bc33dbfa9ce55944b4385841047b6a5980f49f77f5de09020649709f17c0c3a1`;
- ServSync Page `1199023349954773`;
- publication `5b19fd6a-4d8a-4cc1-8017-3e2fda131d35` and client request `a2e716a3-9bf0-4ece-aeec-6c1e20443505`.

One natural Production worker claim made one video upload and persisted Facebook Video ID `1616577883220910`. Immediate read-only confirmation matched the Video ID, provider creation time, and exact approved description including the Cedar disclosure. A later read-only status query reported upload, processing, and publishing complete, `video_status=ready`, `publish_status=published`, and permalink `/reel/1616577883220910/`; Meta's delivered H.264/AAC rendition decoded for 71 seconds. Final ServSync state is one publication, four events, attempt count one, one provider-request start, one provider ID, zero schedules, and zero unrelated publications.

Database `publishing_enabled` was restored false and Production `SERVSYNC_FACEBOOK_PUBLIC_POSTS_ENABLED` was restored absent before documentation work. A post-shutdown claim returned no work. Same-request replay after shutdown remains duplicate-safe but currently returns the closed-gate error before conflict reconciliation rather than the existing receipt. The visually defaulted first preview also requires an explicit content-card selection before confirmation. The connection row retains `ready_except_live_post_verification` because the current status enum has no post-verification `ready` value. These are bounded follow-ups; none authorizes another provider request.

The canonical public identifier is `https://www.facebook.com/reel/1616577883220910/`. Meta's API confirms the object is published, ready, and embeddable, but an unauthenticated Facebook browser shell did not render the reel during closeout; operator visual inspection may require Facebook login.

## Future Publication Gate

Every later post requires a new exact owner authorization or separately approved publishing policy. Before any such action, reconfirm immutable Content/media identity, duplicate state, Page authority, both gates off, and provider readiness. Enable only the reviewed provider for the shortest possible window, stop on any ambiguous response without retry, and restore both gates off before documentation or investigation.

Instagram, TikTok, contractor-owned Marketing connections, analytics, comments, and recurring campaigns remain out of scope.
