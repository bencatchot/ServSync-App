# ServSync Facebook Managed Video Publishing v1

## Scope

This adapter publishes one exact approved ServSync Marketing caption and one exact approved managed MP4 to the connected ServSync Facebook Page. It extends the provider-neutral publication worker; it does not create a parallel scheduler, approval system, retry model, or asset store.

The adapter is source-ready but remains operationally disabled until a separate owner-authorized live-verification task enables both public-post gates for one exact publication. This implementation does not create a publication or make a Meta provider request.

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

## Provider State And Duplicate Safety

Meta documents `id` and `video_id` response fields for Page video creation. ServSync accepts either numeric Video ID, rejects conflicting fields as uncertain, records which field was returned, and persists the resulting ID with an `accepted` provider state before confirmation. The stored provider identifier is explicitly a Video ID, not an assumed Page feed-post ID.

Confirmation is a read-only `GET /{video-id}` for `id`, `created_time`, and `description`:

- matching Video ID, provider creation time, and exact description -> `published` / `confirmed`;
- known Video ID without complete confirmation -> `processing`, then a later 15-minute worker reconciliation of the same ID;
- provider rejection before acceptance -> sanitized failure under existing retry rules;
- timeout, malformed success, or any upload result without a usable Video ID -> terminal `provider_uncertain`, with no blind upload retry;
- known Video ID still unconfirmed after eight bounded checks -> terminal `provider_uncertain`, preserving the ID for operator investigation.

Reconciliation never rereads or reuploads the media. A failed run cannot discard a known provider identifier. This deliberately favors duplicate prevention over automatic recovery from an ambiguous upload response.

## First Live Verification Gate

The first real post remains a separate bounded owner action. Before that action:

1. apply and validate the managed-video migration through the approved Sandbox -> Demo -> Production rollout;
2. reconfirm the exact approved Content revision, approved pairing, asset checksum, Page connection, and Page permissions;
3. confirm database `publishing_enabled=false`, environment `SERVSYNC_FACEBOOK_PUBLIC_POSTS_ENABLED` absent/false, and zero publication rows before authorization;
4. obtain explicit owner authorization for the exact preview snapshot;
5. enable only the reviewed Facebook path and create exactly one replay-safe publication;
6. let the worker make one video POST, persist the returned Video ID, and reconcile the same ID;
7. verify exactly one public Page video with exact caption, video, and disclosure;
8. restore or confirm both public-post gates according to the approved one-post procedure;
9. if the initial provider result is ambiguous, stop for operator reconciliation rather than retrying.

Instagram, TikTok, contractor-owned Marketing connections, analytics, comments, and recurring campaigns remain out of scope.
