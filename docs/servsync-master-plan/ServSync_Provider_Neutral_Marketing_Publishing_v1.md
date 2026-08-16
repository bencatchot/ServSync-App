# ServSync Provider-Neutral Marketing Publishing v1

## Scope

This foundation adds a durable publication decision after Marketing Content approval. It is private to the ServSync internal Marketing workspace and platform administration.

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

- Owner RPCs require an authenticated platform administrator and derive the internal workspace server-side.
- Provider connection, publication, and event tables are forced-RLS and expose no direct browser or generic service-role table access.
- Worker RPCs are purpose-bound and executable only by the server-side service role.
- Creation requires an exact approved social-content revision and a connected destination with text capability.
- Preview eligibility uses the same approved social-content boundary as creation. The Facebook card renders only the snapshot `body`; the internal title and lineage remain outside public content.
- Provider previews are advisory rather than pixel-perfect. They do not invent timestamps, engagement, reach, or other provider-generated state.
- The snapshot retains only public copy and bounded audit lineage. It is immutable after authorization.
- Published and cancelled rows are terminal. Publication events are append-only.
- A replay-safe request UUID protects owner retries. Row claims use `FOR UPDATE SKIP LOCKED`.
- A provider request is marked separately from the worker claim. An uncertain response after request start is not automatically retried because doing so could duplicate a public post.
- Safe retries are bounded to three attempts and only become owner-eligible for conclusive rate-limit or temporary-provider failures before a provider request started.
- Local paths including `file://`, `/Users/`, `/private/tmp/`, and `~/Documents/` are rejected.
- Validated Demo-recorder MP4s may enter the private `marketing-assets` bucket only after technical, sensitive-data, and normal-speed pacing review passes. Registration and exact approved-revision pairing are one atomic platform-admin RPC.
- Media assets are immutable and checksum-addressed. Pairing identity is immutable, review history is append-only, and approving text never approves video.
- A text revision with a live media pairing remains provider-publication ineligible until a separately reviewed provider adapter can send the exact text and exact video together. ServSync will not silently drop the paired video.
- No public social post is part of this foundation.

## Scheduler

Vercel Cron invokes `/api/marketing-publications-worker` every 15 minutes. The route requires `CRON_SECRET`, an exact `SERVSYNC_MARKETING_PUBLISHING_PROJECT_REF`, matching `SUPABASE_URL`, and the server-only service-role credential. Browser close, deployment, and process restart therefore do not discard scheduled state. The worker returns aggregate counts only.

The environment-specific project reference must be:

- Sandbox: `zpzdkoaubyjtsomccxya`
- Demo: `bdytwgejqnlblhrnqxkp`
- Production: `uqgtheclhxqlnjpfmheq`

The Production Vercel project has the exact Production reference as a Production-only server variable alongside its existing Cron and Supabase server configuration. Demo and Sandbox do not receive a Marketing worker Cron secret or service-role configuration in this slice, so their worker route remains fail-closed even though the additive database model is installed for parity. Provider setup remains absent in every environment, so no worker has an eligible destination and no outbound social request can occur.

## Provider Readiness

### Facebook

Facebook Connection v1 supplies the reviewed internal OAuth, Vault, Page-selection, readiness, reconnect, and disconnect architecture. Production now has a provider-validated ServSync Page connection with required granular Page authority and readiness `ready_except_live_post_verification`. Public posting remains disabled by the database capability and absent/false environment kill switch. See [ServSync Facebook Marketing Connection v1](./ServSync_Facebook_Marketing_Connection_v1.md).

Owner Visual Publication Preview v1 lists every currently approved Facebook-eligible text item, separates internal metadata from public content, and renders the exact adapter message in a responsive Facebook-style decision card. Paired Text + Product Demo Assets v1 adds a playable exact-revision video candidate, recorder provenance, pacing/validation evidence, and a separate approve/reject/retire decision. Narrated Marketing Asset + Publication Snapshot v1 adds a distinct narrated-derivative contract with silent-master provenance, OpenAI/Cedar/model/script/timing metadata, and an exact public AI-voice disclosure. The owner can review an approved video beside caption copy that is still awaiting separate text approval; the final publication review remains unavailable until the text reaches `approved`. Preview and future worker input reference the same immutable Content revision, approved pairing, asset checksum, and private Storage identity. With public posting disabled, no final action can create or schedule a publication; with paired media, the current Facebook adapter also fails closed before any network request because video publishing has not been implemented or approved.

The first Production narrated package uses managed asset `2097be01-0be4-4f8e-bef2-2e81adb9c95d` and pairing `86e4a795-6c67-4586-bac8-794d6eee7364`. It is the owner-approved 71-second `servsync-platform-introduction` Cedar derivative, bound to Content `67790a72-b9c4-4796-9fcf-e0d5b9d6149a` revision 2 and approved Direction `2086c2c7-ca77-4957-a15f-619efb3f83ee` revision 2. The asset is approved; the exact caption remains `needs_approval`. This record is owner-review evidence, not publication authority.

The current Meta Pages API documentation describes Page publishing through `POST /{page-id}/feed` with a Page access token. The setup slice must verify the Page/business relationship and current app review/access for `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`, plus a Page task that permits content creation. The Graph API version must be selected and pinned when the real Meta app is connected, not guessed in this unconnected foundation.

Primary references:

- [Meta Pages API: Posts](https://developers.facebook.com/docs/pages-api/posts/)
- [Meta Pages API: Getting Started](https://developers.facebook.com/docs/pages-api/getting-started/)

The next Facebook gate is one exact separately authorized public text post after owner visual review. Raw passwords or pasted long-lived tokens remain outside the workflow.

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
- Facebook video publication adapter and first owner-approved text-plus-video provider post
- Instagram adapter
- TikTok adapter and provider audit
- analytics, comments, moderation, ads, recurring posts, and campaign optimization
- contractor Marketing provider connections and authorization

None of those capabilities are implied by this foundation.
