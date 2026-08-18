# FB-038 Help Studio Architecture

## Purpose

Help Studio is ServSync's private, platform-admin authoring surface for durable product walkthroughs. A walkthrough can support in-product help, Marketing reuse, or both, while one canonical media asset and immutable revision history remain authoritative.

FB-038A provides the authoring, storage, retrieval, and contextual-playback foundation. It does not add an AI support assistant, paid generation, broad contractor authoring, or public publishing.

FB-038A1 adds a recorder-backed creation path without creating a second media system. Help Studio persists one recording specification and durable job lifecycle; the local Demo Recorder produces a candidate package; Help Studio validates and ingests that package as canonical private Help media; and explicit normal-speed review controls whether an immutable revision may become current.

## Recording Workflow

The ordinary platform-admin flow is:

1. Choose **New recording** and define title, Support/Marketing/Both purpose, feature and route, audience, Demo scenario, approximate duration, narration expectation, starting/final states, actions, and optional talking points.
2. Download the safe recording specification and run `npm run help:record -- /absolute/path/to/spec.json` locally.
3. Attach the resulting validated MP4, poster, and JSON package to the matching request.
4. Play the complete recording at normal speed, then approve it or return it for rerecord.
5. Publish the approved immutable revision for Help. A prior published revision continues to serve until this explicit step.

Jobs move only through `requested -> preparing -> recording -> processing -> ready_for_review -> approved`, with `failed` available before approval or when review returns the candidate. Append-only events preserve the real lifecycle. Ordinary UI shows plain-language status rather than process output.

The attachment boundary requires exact job ID, scenario, `servsync-human-paced-v1` profile, source commit, file names, MP4/poster checksums, dimensions, duration, technical validation, sensitive-data validation, and canonical recorder provenance. The client rejects a mismatched package before upload reservation, and the database independently revalidates those facts against finalized managed assets before the job can become ready for review. Ready video assets cannot omit duration metadata. A package from another job or altered media fails closed.

The shared human-paced defaults are 700 ms nearby, 1100 ms medium, and 1500 ms large cursor travel; 550 ms settle before click; 900 ms post-click hold; 75 ms per typed character; 1300 ms opening hold; at least 3200 ms final hold; and smooth cubic ease-in-out interpolation. Scenario-specific longer reading holds remain allowed.

## Authoring Boundary

- Only an authenticated ServSync `platform_admin` can create or change Help Studio records.
- Every authoring RPC resolves the canonical ServSync internal workspace on the server.
- Browsers cannot select another workspace or directly query the private Help tables.
- Draft edits create a new immutable revision. They do not rewrite the published revision.
- A published walkthrough edited into `needs_review` continues serving its prior published revision until the new revision is explicitly published.
- Published usage includes only walkthroughs that remain available in `published` or `needs_review`; deprecated and archived records remain preserved but count as unpublished.
- Publication requires a ready MP4, ready poster, and passed pacing, sensitive-data, product-truth, and overall validation reviews.
- Unpublish, deprecate, and archive remove the walkthrough from ordinary contextual retrieval. Archived records remain durable history.

## Durable Media

The private `help-walkthroughs` bucket stores canonical Help video and poster assets. Storage objects are never placed in the ephemeral Marketing cleanup lifecycle.

Each finalized asset records:

- authoritative workspace;
- kind and MIME type;
- exact byte count and SHA-256;
- dimensions and video duration;
- source commit/version provenance where known;
- uploader and timestamps.

The browser reserves one server-generated path, uploads only to that path, and finalizes only when Storage size and MIME metadata match the reservation. There is no browser delete policy in v1.

## Playback And Retrieval

Published retrieval is deterministic PostgreSQL text search over title, summary, feature area, keywords, steps, and transcript. Route contexts can raise a walkthrough for a specific screen. No embeddings or paid AI are involved.

The server resolves the acting role from existing ServSync identity and contractor membership:

| Role | Published Help access | Help Studio authoring |
| --- | --- | --- |
| Platform admin | Internal preview and approved contextual content | Yes |
| Contractor Owner | Only walkthroughs whose audience includes Owner | No |
| Contractor Admin | Only walkthroughs whose audience includes Admin | No |
| Office | Only walkthroughs whose audience includes Office | No |
| Field Technician | Only walkthroughs whose audience includes Field Technician | No |
| Viewer | Only walkthroughs whose audience includes Viewer | No |
| Homeowner | Only walkthroughs whose audience includes Homeowner | No |
| Anonymous | None | No |

Contractor context is validated server-side against active ownership or team membership. A Contractor A identity cannot use Contractor B's context. Playback first obtains a role-aware grant, then a purpose-bound service function resolves the exact asset for a short-lived signed URL. Raw Help tables and service media resolution are not granted to ordinary authenticated clients.

## Marketing Reuse

A walkthrough marked `marketing` or `both` becomes eligible through the private `servsync_list_help_marketing_sources()` contract only after its exact published revision and media reviews pass. The internal `Product demo / Help walkthrough` source picker can use that canonical identity. Preparing a Marketing draft verifies and copies the exact bytes into an ordinary temporary Marketing derivative, then records an immutable checksum-matched link to the Help revision. The Help asset remains canonical and durable; the derivative follows existing Marketing cleanup rules. Source selection does not itself create or authorize a publication.

## Support Gaps

The support-gap table records normalized unanswered questions, route context, actor role, frequency, and timestamps without storing conversation transcripts or provider prompts. This is a lightweight prioritization foundation only.

## Security Contract

- All Help domain tables use forced RLS and have no direct `anon`, `authenticated`, or generic `service_role` table privileges.
- Every `SECURITY DEFINER` function is owned by `postgres`, has an explicit fixed `search_path`, and is revoked from `PUBLIC` before narrow grants are applied.
- Mutating functions are `VOLATILE`; read-only lookup functions are `STABLE`; payload normalization is `IMMUTABLE`.
- The only browser Storage policy is exact reserved-path upload for platform admin. Playback does not grant direct bucket reads.
- Service-only media resolution remains unavailable to authenticated browser clients.

## Operational Validation

The rollout order is Sandbox, Demo, then Production using the exact checksummed migration bytes. Each environment must prove catalog shape, forced RLS, function ownership/grants/volatility, cross-tenant denial, preserved Marketing state, and no public provider action before the next environment proceeds.

A representative walkthrough must additionally prove:

- a validated canonical ServSync product recording and poster are uploaded through Help Studio;
- publication serves the exact reviewed revision;
- synonyms and the configured route return the walkthrough deterministically;
- contextual desktop/mobile playback remains usable;
- the existing published Facebook flagship and all Marketing history remain unchanged.

The first operational proof completed on 2026-08-18 after merge `e479026025e5aff56a8e7696f8b848ad51127f56`. Production walkthrough `9f62de0c-a06a-4840-86cb-6bf0362975f5`, revision 1, publishes **How to create an estimate** for Owner/Admin/Office from the validated 23-second, 1440x900 Demo Recorder MP4. The durable video checksum is `441aff3a678595eec7d297e7d6820ce7338950dd66618c8c52911c93a0e1b7df`; the poster checksum is `a807bb7426051b58e59e78258527b6e330aa07e8fba5756ce618076387de06bf`.

Production acceptance proved desktop and 390x844 contextual playback with no console/server errors or horizontal overflow; exact retrieval for `create estimate`, `quote`, `draft pricing`, and `contractor.drafts`; and denial when one contractor owner supplied another contractor's context. The Help source appeared in the internal Marketing product-media picker, but no derivative or Marketing draft was prepared. Publication/event counts remained 2/7, and no paid usage/cost event or provider request occurred.

## Deferred Work

FB-038B may add a broader user Help Center and an Ask ServSync retrieval experience over published Help content. FB-038C may add separately approved support-gap-to-walkthrough assistance or generation. Paid AI, automatic generation, contractor Help authoring, public provider publishing, analytics, and autonomous support responses are not part of FB-038A1.
