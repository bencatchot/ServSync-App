# ServSync Provider-Neutral Marketing Publishing v1

## Scope

This foundation adds a durable publication decision after Marketing Content approval. It is private to the ServSync internal Marketing workspace and platform administration.

```text
Approved Marketing Content revision
-> explicit owner provider/timing decision
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
- The snapshot retains only public copy and bounded audit lineage. It is immutable after authorization.
- Published and cancelled rows are terminal. Publication events are append-only.
- A replay-safe request UUID protects owner retries. Row claims use `FOR UPDATE SKIP LOCKED`.
- A provider request is marked separately from the worker claim. An uncertain response after request start is not automatically retried because doing so could duplicate a public post.
- Safe retries are bounded to three attempts and only become owner-eligible for conclusive rate-limit or temporary-provider failures before a provider request started.
- Local paths including `file://`, `/Users/`, `/private/tmp/`, and `~/Documents/` are rejected.
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

Read-only repository, environment-name, GitHub-secret-name, and public-web checks found no verified ServSync Facebook Page, Meta Developer app, OAuth redirect, Page authorization, or token infrastructure. Facebook is therefore `setup_required`.

The current Meta Pages API documentation describes Page publishing through `POST /{page-id}/feed` with a Page access token. The setup slice must verify the Page/business relationship and current app review/access for `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`, plus a Page task that permits content creation. The Graph API version must be selected and pinned when the real Meta app is connected, not guessed in this unconnected foundation.

Primary references:

- [Meta Pages API: Posts](https://developers.facebook.com/docs/pages-api/posts/)
- [Meta Pages API: Getting Started](https://developers.facebook.com/docs/pages-api/getting-started/)

The next Facebook slice must use an owner OAuth/authorization flow and an approved encrypted server-side token store. Raw passwords or pasted long-lived tokens are not an acceptable durable design.

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

- Meta OAuth callback and encrypted token lifecycle
- first owner-authorized Facebook post
- media asset upload/storage
- Instagram adapter
- TikTok adapter and provider audit
- analytics, comments, moderation, ads, recurring posts, and campaign optimization
- contractor Marketing provider connections and authorization

None of those capabilities are implied by this foundation.
