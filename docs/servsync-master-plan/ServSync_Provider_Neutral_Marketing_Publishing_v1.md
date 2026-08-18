# ServSync Provider-Neutral Marketing Publishing v1

## Scope

This foundation adds a durable publication decision after Marketing Content approval. FB-037G-C now gives the ServSync internal workspace and contractor Owner/Admin/Office workspaces one shared exact-package queue while FB-037G-A enforces workspace lineage across Content, pairing, asset, publication, and provider connection. Field Technician/Viewer remain denied, and platform administration remains internal-workspace-only.

```text
Approved Marketing Content revision
-> destination-specific owner visual preview
-> optional exact-revision validated product-demo pairing
-> explicit owner provider/timing decision
-> explicit final public-action confirmation
-> immutable publication snapshot
-> durable scheduled/publishing/published/failed/cancelled lifecycle
-> purpose-bound server worker
-> provider adapter
```

Approval never schedules or publishes. The worker never reads provider credentials from the browser or publication rows. Provider connections and publication history remain scoped to a Marketing workspace so later contractor Marketing can use contractor-owned OAuth grants without inheriting ServSync's accounts.

## Current Provider Priority

1. Facebook
2. Instagram
3. TikTok
4. LinkedIn deferred

This ordering is ServSync internal strategy. It is not a default for future contractor tenants.

## State And Safety

- Shared queue RPCs derive the internal or contractor workspace server-side. Owner/Admin/Office may manage their active contractor workspace; platform administrators resolve only the ServSync internal workspace.
- Provider connection, publication, and event tables are forced-RLS and expose no direct browser or generic service-role table access.
- Worker RPCs are purpose-bound and executable only by the server-side service role.
- Creation requires an exact approved social-content revision and a connected destination with text capability.
- Every action uses an explicitly selected immutable package ID and fingerprint. Preview eligibility uses the same approved Content/media/destination snapshot as worker execution. The Facebook card renders only the snapshot `body`; internal title and lineage remain outside public content.
- Provider previews are advisory rather than pixel-perfect. They do not invent timestamps, engagement, reach, or other provider-generated state.
- Approval records review of the exact package but never publishes. Publish Now or Schedule records a separate exact user authorization with request identity, user, timestamp, destination, timezone, and immutable package fingerprint.
- The snapshot retains only public copy and bounded audit lineage. It is immutable after authorization, and revision/media/provider identity changes retire the old package.
- Published and cancelled rows are terminal. Publication events are append-only.
- A replay-safe request UUID protects user retries. Existing receipts are returned before evaluating whether new provider submissions are stopped. Row claims use `FOR UPDATE SKIP LOCKED`.
- A provider request is marked separately from the worker claim. An uncertain response after request start is not automatically retried because doing so could duplicate a public post.
- Safe retries are bounded to three attempts and only become user-eligible for conclusive rate-limit or temporary-provider failures before a provider request started. Ambiguous provider results remain Needs Attention without retry.
- Local paths including `file://`, `/Users/`, `/private/tmp/`, and `~/Documents/` are rejected.
- Validated Demo-recorder MP4s may enter the private `marketing-assets` bucket only after technical, sensitive-data, and normal-speed pacing review passes. Registration and exact approved-revision pairing are one atomic platform-admin RPC.
- Media assets are immutable and checksum-addressed. Pairing identity is immutable, review history is append-only, and approving text never approves video.
- A text revision with a live media pairing remains provider-publication ineligible unless the selected adapter can send the exact text and exact video together. ServSync will not silently drop the paired video.
- Published history keeps lightweight immutable lineage and shows a public link only when the provider supplied a real permalink. Purged full media never produces a broken player.
- G-C rollout created no public social post.

## Scheduler

Vercel Cron invokes `/api/marketing-publications-worker` every 15 minutes. The route requires `CRON_SECRET`, an exact `SERVSYNC_MARKETING_PUBLISHING_PROJECT_REF`, matching `SUPABASE_URL`, and the server-only service-role credential. Browser close, deployment, and process restart therefore do not discard scheduled state. The worker returns aggregate counts only. It claims only due rows with exact durable user authorization. Approval alone is never claimable.

The environment-specific project reference must be:

- Sandbox: `zpzdkoaubyjtsomccxya`
- Demo: `bdytwgejqnlblhrnqxkp`
- Production: `uqgtheclhxqlnjpfmheq`

The Production Vercel project has the exact Production reference as a Production-only server variable alongside its existing Cron and Supabase server configuration. `SERVSYNC_FACEBOOK_PUBLIC_POSTS_ENABLED` is deployment capability, not per-post approval. `marketing_publishing_controls.provider_submissions_enabled` is the platform-admin emergency stop and defaults false. Workspace connection plus exact Publish Now/Schedule authorization provide the remaining authority. When stopped, new submissions cannot begin, but a known provider ID may continue read-only reconciliation. Demo and Sandbox remain fail-closed for provider operation.

## Provider Readiness

### Facebook

Facebook Connection v1 supplies reviewed workspace-scoped OAuth, Vault, explicit Page selection, readiness, reconnect, and disconnect. Production has a provider-validated ServSync Page connection with required granular Page authority and one completed bounded live verification. Connected destinations now use the truthful `ready` state. Public provider submission remains stopped by the database control and absent environment capability. See [ServSync Facebook Marketing Connection v1](./ServSync_Facebook_Marketing_Connection_v1.md).

Owner Visual Publication Preview v1 lists every currently approved Facebook-eligible text item, separates internal metadata from public content, and renders the exact adapter message in a responsive Facebook-style decision card. Paired Text + Product Demo Assets v1 adds a playable exact-revision video candidate, recorder provenance, pacing/validation evidence, and a separate approve/reject/retire decision. Narrated Marketing Asset + Publication Snapshot v1 adds a distinct narrated-derivative contract with silent-master provenance, OpenAI/Cedar/model/script/timing metadata, and an exact public AI-voice disclosure. Preview and worker input reference the same immutable Content revision, approved pairing, asset checksum, and private Storage identity.

The current Production flagship package uses managed asset `2097be01-0be4-4f8e-bef2-2e81adb9c95d` and approved pairing `460c7689-a2c6-4f8c-addd-511b5e8abd23`. It is the owner-approved 71-second `servsync-platform-introduction` Cedar derivative, bound to approved Content `67790a72-b9c4-4796-9fcf-e0d5b9d6149a` revision 9 and approved Direction `2086c2c7-ca77-4957-a15f-619efb3f83ee` revision 2. The exact caption includes the approved AI-voice disclosure. These approvals establish immutable package parity; they do not create publication authority.

Facebook Managed Video Publishing Adapter v1 uses Meta's documented direct multipart Page video contract, `POST /{page-id}/videos`, with the stored Page token, exact MP4 bytes as `source`, and exact public message as `description`. It persists the returned Video ID before read-only confirmation and reconciles only that known ID; an ambiguous upload response is never blindly retried. Required media cannot degrade to a text-only feed post. See [ServSync Facebook Managed Video Publishing v1](./ServSync_Facebook_Managed_Video_Publishing_v1.md).

Primary references:

- [Meta Video API publishing guide](https://developers.facebook.com/docs/video-api/guides/publishing/)
- [Meta Page videos reference](https://developers.facebook.com/docs/graph-api/reference/page/videos/)
- [Meta Video reference](https://developers.facebook.com/docs/graph-api/reference/video/)

The managed-video migration is applied in Sandbox, Demo, and Production. One separately owner-authorized Production verification created one exact flagship publication and one confirmed Facebook Video ID; exact message/disclosure and managed-asset submission provenance passed, then database `publishing_enabled=false` and absent `SERVSYNC_FACEBOOK_PUBLIC_POSTS_ENABLED` were restored. That authorization is exhausted. Future Facebook posts remain disabled until a new exact owner authorization or separately approved publishing policy. Raw passwords or pasted long-lived tokens remain outside the workflow.

### Instagram

No verified ServSync professional account, publishing authorization, or token infrastructure was found. Instagram is `setup_required`; v1 represents its media capability but does not pretend text-only publishing is available.

Meta currently documents two relevant login models. The Facebook Login path uses an Instagram professional account connected to a Page and requires the applicable Instagram/Page permissions, including `instagram_basic` and `instagram_content_publish`. The Instagram Login path uses the newer Instagram business permissions such as `instagram_business_basic` and `instagram_business_content_publish`. Both use media-container creation and publication rather than a plain text-feed contract. The next slice must deliberately choose the supported account/login model after the owner confirms the real account.

Primary references:

- [Instagram API with Facebook Login: Content Publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/content-publishing/)
- [Instagram API with Instagram Login: Content Publishing](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing/)

Future media flow:

```text
validated local recorder asset
-> explicit owner upload
-> portable ServSync-managed Marketing asset
-> provider-accessible media URL/bytes
-> Instagram adapter
```

Operator-local Mac paths must never be stored in Production Marketing records.

### TikTok

No verified ServSync TikTok account, developer app, Content Posting API product, OAuth grant, `video.publish`/`video.upload` scope, or audit approval was found. TikTok is `setup_required`.

TikTok's current Content Posting API requires a registered developer app and user authorization. Direct Post uses `video.publish`, requires creator-info inspection and user control over current privacy/posting options, and supports media rather than text-only publication. Unaudited clients are restricted to private `SELF_ONLY` posting; public direct posting requires provider audit. Upload-for-editing uses `video.upload` and requires the user to finish the post in TikTok. Upload by URL also requires applicable verified URL/domain ownership.

Primary references:

- [TikTok Content Posting API: Get Started](https://developers.tiktok.com/doc/content-posting-api-get-started)
- [TikTok Direct Post API](https://developers.tiktok.com/doc/content-posting-api-reference-direct-post)
- [TikTok Upload Content](https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content)
- [TikTok Developer App Setup](https://developers.tiktok.com/doc/getting-started-create-an-app)

## Deferred Boundaries

- first owner-authorized Facebook post
- first owner-authorized Facebook text-plus-video provider post
- Instagram adapter
- TikTok adapter and provider audit
- analytics, comments, moderation, ads, recurring posts, and campaign optimization
- runtime Content-generation providers and contractor Create from Job / Upload Media / Simple Post entry
- contractor media intake, quota/cost enforcement, retention, and purge are now provided by FB-037G-B; ordinary contractor publication authorization remains deferred to FB-037G-C

Capabilities not explicitly marked as delivered by FB-037G-B/G-C remain deferred and are not implied by this foundation.
