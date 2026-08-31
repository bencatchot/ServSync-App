# ServSync Marketing Publishing Queue + Authorization v1

## Product Boundary

FB-037G-C gives the ServSync internal Marketing workspace and contractor Marketing workspaces one shared queue:

```text
approved Content + approved media + exact destination
-> Needs Review
-> exact Preview
-> Approve
-> Ready
-> Publish Now or Schedule authorization
-> Publishing
-> Published or Needs Attention
```

Approval means the exact package is acceptable for possible publication. It never authorizes provider execution. `Publish Now` and `Schedule` are separate durable user authorizations for one immutable package and destination.

The ServSync internal workspace uses the one-person owner policy: a draft is previewed for approval and may transition directly to approved with immutable approving-user/time evidence. It does not require submission to the same owner. Contractor/team workspaces retain draft submission and reviewer Approve/Return/Reject; reason-gated Return/Reject explains the requirement before those actions become available. After Content approval, media/destination package approval remains a separate `Approve & Ready` decision and still does not publish.

The ordinary queue renders that boundary literally: `Ready - not published`. A Ready card explains that approval is complete and publishing is a separate action. When provider submissions are globally paused, the exact Preview states that the post has not been published and that no Facebook request will be sent. Scheduled, Publishing, Needs Attention, and Published remain derived from durable publication state rather than inferred from Content or package approval.

Owner, Admin, and Office may use their active contractor workspace. Field Technician, Viewer, homeowner, anonymous, inactive, and cross-tenant access are denied. Platform administrators use only the ServSync internal workspace. Every RPC resolves the workspace server-side through the FB-037G-A context resolver.

## Exact Package

`marketing_publication_packages` snapshots:

- workspace;
- Content ID and immutable revision;
- approved media pairing and asset snapshot when required;
- provider connection ID and identity revision;
- destination key and label;
- required disclosures;
- SHA-256 package fingerprint.

The package must be explicitly selected. Preview marks that exact package as reviewed and uses the same public message/media snapshot consumed by the worker. Content, media approval, provider identity, or destination changes retire the old package rather than transferring approval or authorization.

Queue cards use lightweight posters. Full private media is fetched only for explicit preview/playback or provider execution. Published history remains useful after the G-B large-media purge and exposes a provider link only when a real permalink was persisted.

## Authorization And Replay

`Publish Now` and `Schedule` persist the authorizing user, action, timestamp, request ID, timezone, immutable package fingerprint, and exact provider identity. The same authorization request returns the existing publication receipt before evaluating whether new provider submissions are currently stopped. It cannot create a second row, consume another prepared slot, or start another provider request.

Schedule changes create a replacement explicit authorization and cancel the prior schedule. Cancellation is durable. A changed Content revision, media decision, disconnected/reconnected destination, or bumped connection identity invalidates the old package.

The G-B `ready_scheduled_post_limit` remains server-authoritative at five. Previewing, approving, scheduling, or publishing an existing asset does not consume generation quota. Published history and Needs Review packages do not consume prepared/scheduled capacity.

## Provider Operation

Provider operation has four independent layers:

1. deployment capability (`SERVSYNC_FACEBOOK_PUBLIC_POSTS_ENABLED`);
2. global database emergency stop (`marketing_publishing_controls.provider_submissions_enabled`);
3. workspace-owned provider connection;
4. exact user publication authorization.

The environment value is a standing Production deployment capability, not per-post consent. The database control remains platform-admin-only as the independent emergency stop. Contractors never see or operate either infrastructure control. Normal operation keeps both infrastructure layers available while the workspace connection and one exact durable Publish Now/Schedule authorization remain mandatory for every post.

When the database stop is active, no new provider submission can be claimed. A row with a known provider Video ID can still be claimed for read-only reconciliation, and server provider code can perform that reconciliation even when deployment submission capability is disabled. This closes gates safely without stranding a known provider result.

Facebook is the only operational provider adapter. Connected Facebook destinations now use the truthful `ready` state. Instagram and TikTok remain unavailable and no adapter is implied by the provider-neutral queue model.

## Needs Attention And History

Needs Attention provides sanitized, action-oriented failures. Explicit retry is available only for an existing retry-eligible publication whose prior result proves no uncertain provider submission occurred. A separate guarded **Prepare replacement** path is available only when the database proves the provider was never contacted, the failed attempt has no provider ID, no conflicting active or published attempt exists, and the immutable package still matches the current approved Content, media, destination, permissions, and prepared-post allowance. That action preserves the failed publication and audit event, returns only the exact package to Ready, and still requires a new explicit Publish Now or Schedule decision. Ambiguous or provider-started outcomes remain non-retryable and replacement-ineligible.

Published cards retain immutable Content/media/provider lineage, provider ID, timestamps, poster/history metadata, and an actual provider permalink when one exists. The UI never constructs a link from an assumed provider URL pattern.

## Rollout And Safety

Migration `servsync-marketing-publishing-queue-authorization.sql` is 1,303 lines at SHA-256 `06b1dd5dd5cc321b4fb46232addcc1ea1f73a3241ae0d32ef898ac87de154157`.

Independent lifecycle review added the 70-line forward fix `servsync-marketing-scheduled-destination-invalidation.sql` at SHA-256 `eb00966a0db067ae75b32fd5f74458377dda2dd595ccdff95e758f7334018867`. It moves an unsubmitted schedule to Needs Attention when its reviewed connection/Page identity changes, with no automatic retry. Exact bytes are applied in all three environments.

The exact primary migration and forward fix were applied Sandbox -> Demo -> Production on 2026-08-17. Production's existing terminal flagship exposed an expected compatibility boundary: its immutable trigger rejected the one-time additive queue authorization backfill. A 74-line Production rollout compatibility guard at SHA-256 `bfb38b0e1a05d278be3feb4c7057172cb047ac9b131e41cbeb0ac6ac47bb99f6` permitted only that exact null-to-snapshot backfill. It continued denying ordinary terminal mutations, and the main migration immediately restored the final strict terminal guard.

Production retained one publication, four events, exact Content revision 9, pairing, asset, Facebook Video ID `1616577883220910`, and Page `1199023349954773`. The new global provider-submission control is false and the Production deployment environment flag remains absent. This rollout made no provider request and authorizes no public post.

The G-B cleanup Cron remains configured for 05:43 UTC daily. As of this rollout, no qualifying natural successful execution was observable; a later unauthenticated 401 is not acceptance evidence. This is a non-blocking operational follow-up.

The guarded recovery addition is implemented by the 325-line `servsync-marketing-pre-provider-replacement-recovery.sql` at SHA-256 `e31c47cf63505a9f51d11d0317c518365c270cf1434cf571f4a6d80fbae990a3`. Exact bytes are applied in Sandbox, Demo, and Production. The rollout preserved every captured Marketing/package/publication/event/provider-start count; Production's open-beta failure remains failed/Needs Attention and only its derived replacement eligibility became true. The migration did not contact a provider, alter the failed authorization snapshot, invoke recovery, or authorize publication.

## Deferred

- contractor Content creation from Job/upload/simple-post entry;
- runtime AI generation providers;
- Instagram, TikTok, and other provider adapters;
- performance/analytics ingestion;
- campaigns, recurring auto-publish, and provider moderation.

Human authorization remains mandatory. Content generation never authorizes publication.

## Status Recovery Evidence

FB-037J audited the owner-prepared Production post **Connect with Local Contractors Easily** after its visible review flow was complete. Content revision 4 and its exact package were approved and Ready for the ServSync Facebook Page, but no authorization, publication, event, worker attempt, provider request start, provider ID, permalink, or schedule existed. Both provider-submission controls were off. The correct status was `READY / NOT PUBLISHED`; no Meta lookup or provider mutation was appropriate without a trustworthy provider identity.

The one-person workspace's submit-then-self-approve sequence and the observed Return to draft/Reject availability remain a separate approval-flow simplification review. They do not weaken the exact package and publication authorization boundaries.

FB-037K completes that simplification. Internal direct approval is policy-bound and server-enforced; it is not a general contractor bypass. Ready package confirmation identifies the exact title, Facebook Page, and media mode. Active publish-now state refreshes automatically and distinguishes initial Publishing from a known Facebook Video ID still processing. Published rows retain View on Facebook, while uncertain failures remain non-retryable.
