# ServSync Marketing Media, Cost, and Ephemeral Lifecycle v1

## Scope

FB-037G-B extends the shared FB-037G-A Marketing workspace with tenant-scoped media intake, configurable free-beta entitlements, append-only usage/cost evidence, generation circuit breakers, and exact-object ephemeral cleanup. It does not add the contractor publishing queue, Publish Now, Schedule, ordinary provider connection UX, or standing publication authority.

## Authority

Every RPC reuses the canonical shared Marketing workspace resolver. Contractor Owner, Admin, and Office roles may read and manage their own active workspace. Field Technician and Viewer roles have no Marketing mutation authority. Platform admins operate the ServSync internal workspace and separate platform cost controls; they do not silently gain contractor Content or media access.

All new tables use forced RLS with no direct browser or generic service-role table grants. Purpose-bound `SECURITY DEFINER` functions are `postgres`-owned, use fixed `search_path` values, have explicit execute revocations, and grant only the authenticated or service-role entry points required by the operation.

## Free-Beta Entitlements

The canonical `free_beta` plan starts with:

- 3 active large-media slots;
- 4 meaningful generation reservations per rolling 30 days;
- 5 prepared/scheduled publication slots;
- 75 seconds maximum generated video duration;
- 72 hours of large-media retention after verified provider publication;
- 30 days before abandoned media becomes eligible for cleanup.

Plan defaults, workspace plan selection, and validated workspace overrides are separate. No paid plan or price is defined. The prepared/scheduled check currently counts existing `scheduled` and `publishing` publication states; FB-037G-C will reuse the server check when it introduces the ordinary Ready queue.

## Media Intake

Marketing-only JPEG, PNG, WebP, and MP4 media enters a private, workspace-scoped `marketing-assets` path reserved server-side. The browser supplies dimensions, duration, SHA-256, and a deterministic small JPEG poster; finalization verifies the exact Storage path, MIME type, and byte size before registering the asset. Videos are limited to 75 seconds in this beta path.

Job media uses an exact string value already registered in the same contractor Job snapshot and the private `inspection-media` object metadata. The contractor must explicitly acknowledge `marketing_media_rights_v1`: they have the right to use the media publicly and have reviewed it for customer or private information. This is a human rights/privacy boundary, not an automated privacy claim. Canonical Job media remains under Job retention; only a later Marketing-managed derivative may be purged.

Simple text-only Marketing Content remains valid. ServSync Demo Recorder assets remain a distinct internal source and are protected by default.

## Usage and Cost Evidence

Append-only workspace events support AI text, TTS, media composition, Storage writes/purges, and provider publication evidence. They can record provider/model/voice, request identity, tokens, duration, asset counts, bytes, purpose, Content/Publication lineage, and outcome without storing credentials.

Cost status is `known`, `estimated`, `pending`, or `unavailable`. Known and estimated values use integer micro-USD units. Later cost reconciliation appends evidence rather than rewriting history. Generation entitlement consumption and actual provider cost are deliberately separate and replay-safe by workspace/request/category identity.

Platform controls support generation enablement, an optional monthly budget, an 80% warning threshold, and a 100% hard stop. No dollar budget is hard-coded. The hard stop blocks only new paid generation; existing Content/media review, manual copy editing, future publication of existing media, reconciliation, and history remain available.

## Ephemeral Lifecycle

Large managed media follows:

`uploaded -> preparing/generating -> needs_review -> ready -> scheduled/publishing/provider_processing -> retention -> purging -> purged`

Abandoned media enters its own 30-day path. Multi-destination publication rows keep shared media in scheduled, publishing, provider-processing, or uncertain states until no destination still depends on it. Verified publication starts the 72-hour retention clock.

The daily cleanup worker claims at most five total items across finalized assets and abandoned pre-finalization uploads. A database guard blocks new publication dependencies after an asset claim. The worker deletes only exact reserved bucket/path values, then completes the matching asset or intake claim token after Storage-absence and dependency checks. Failure returns the item to a bounded retry state. Replays do not duplicate purge history. Finalized-media cleanup retains the small poster and lightweight asset/publication metadata; pre-finalization cleanup removes both reserved upload objects. A canonical Job source is never deleted. Every pre-G-B ServSync asset is backfilled `protected` and cannot enter cleanup through age inference.

The guarded retirement correction keeps `servsync_abandon_marketing_media` as the only authenticated browser mutation. For a non-permanent asset still in `uploaded`, `needs_review`, or `ready`, with no scheduled, publishing, provider-processing, published, or Needs Attention dependency, one transaction retires any referencing Needs Review/Ready package, rejects candidate/approved content-media pairings with append-only pairing evidence, records the retired package IDs/count in the append-only lifecycle event, marks the asset `abandoned`, and releases active-media/prepared quota. Replay after success is idempotent. The UI derives eligibility from the catalog and requires an exact named confirmation; protected/permanent, published, scheduled, publishing/provider-processing, purging/purged/abandoned, text-only, and concurrent-state changes remain unavailable or fail closed. This correction is source-complete and accepted across Sandbox, Demo, and Production. Production rollout verification performed no retirement and preserved the Published commercial with derived eligibility false.

## Rollout

The exact additive migrations were applied Sandbox -> Demo -> Production on 2026-08-17:

- `servsync-marketing-beta-entitlements-cost-metering.sql` at SHA-256 `6cfc343136d9abd819a240c3369d4ebd1668272ffaaa36dbc5b287acc774cf26`;
- `servsync-marketing-media-intake-ephemeral-lifecycle.sql` at SHA-256 `77dadb6e04ef24272369a238357d6716270de6a6e4a01e247329a0ad95bac0e2`;
- `servsync-marketing-abandoned-upload-cleanup.sql` at SHA-256 `e5a67dc3c124f189870055e29354143169d89a71dd42ee9ee05427f9049f1dad`;
- `servsync-marketing-storage-policy-helper-execute.sql` at SHA-256 `aa1bed743b1301f9a80cf2cc2f71a27795d963b613bdcbf82e1ddcd0d81c0eee`.

The last migration is a review-driven forward fix: authenticated Storage policies require execute authority on their two purpose-bound authorization predicates. It grants only those predicate calls to `authenticated`; `anon` and generic `service_role` remain denied, and no table or provider authority is added. The validation harness exercises a real authenticated reserved-path Storage insert so this browser path cannot regress behind RPC-only coverage.

Sandbox passed rollback-only cross-tenant and Field Technician/Viewer denial checks with zero residue. Demo retained zero Marketing records and its recorder boundary. Production preserved 17 Content rows, three assets, six pairings, three provider connections, one publication, and four publication events. All three existing assets are protected; the live flagship remains published with Facebook Video ID `1616577883220910`. Database publishing stayed false, the Production public-post environment gate remained absent, and no provider request occurred.

## Deferred to FB-037G-C

- contractor Needs Review / Ready / Published / Needs Attention queue;
- exact preview-card selection;
- Publish Now and Schedule authorization;
- ordinary contractor provider connection and publication history UX;
- replay-receipt and readiness-label presentation polish.

No future public post is authorized by this foundation.
