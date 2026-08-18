# ServSync Owner Marketing Publishing Flow v1

## Product Boundary

FB-037K makes the ServSync internal Marketing workspace operate like a one-person owner business without weakening the team or provider contracts.

```text
Internal owner: Draft -> Preview for approval -> Approve & Ready -> Publish Now or Schedule
Contractor/team: Draft -> Submit for approval -> reviewer Approve, Return, or Reject
```

Direct owner approval changes only Content review policy. It records the approving user and time in immutable history, does not approve substitute media or destinations, and does not publish. An exact Facebook package still requires separate media/destination review before it becomes Ready.

## Approval Policy

The shared Content UI receives an explicit policy rather than inferring authority from scattered role strings:

- `direct_owner` is used only for the canonical ServSync internal workspace;
- `team_review` remains the contractor workspace policy;
- contractor Owner/Admin/Office retain their existing tenant-bound submit/reviewer authority;
- Field Technician, Viewer, homeowner, anonymous, inactive, and cross-tenant users remain denied.

The server transition contract independently enforces the same boundary. A direct `draft -> approved` transition succeeds only for the internal workspace, requires non-empty Content, and writes an approval event. The same transition against a contractor workspace fails closed. Return and Reject retain the existing three-character reason requirement; the UI states that requirement rather than exposing unexplained disabled buttons.

## Publishing Authority

Normal Facebook operation keeps four independent requirements:

1. Production deployment capability: `SERVSYNC_FACEBOOK_PUBLIC_POSTS_ENABLED=true`;
2. platform emergency stop: `marketing_publishing_controls.provider_submissions_enabled=true`;
3. active workspace-owned Facebook Page connection;
4. one exact immutable Publish Now or Schedule authorization.

The first two are infrastructure operation, not per-post consent. The Page connection and exact user action remain mandatory. Package fingerprinting, idempotency receipts, uncertain-response no-retry, required-media no-fallback, and known-provider-ID read-only reconciliation are unchanged.

## Owner Feedback

The final confirmation names the exact post title, Facebook destination and Page, and whether the package contains media. A publish-now authorization displays `Publishing...` before a provider identity is known, `Processing on Facebook` when Meta has accepted a known Video ID, `Published` with the persisted public link after confirmation, or `Needs Attention` with safe retry guidance. Active rows refresh every 15 seconds; owners do not need a manual catalog refresh.

## Rollout And Safety

Migration `servsync-owner-marketing-approval-policy.sql` is 128 lines at SHA-256 `fb2d7e46d11843dcfa1b1648df1dfab107eb75824b561d75dee4cd2370ab09f1`. It replaces only the shared Content transition function, uses fixed-path `SECURITY DEFINER`, explicit grants/revocations, correct volatility, and an internal-workspace policy check.

Exact migration bytes passed Sandbox, Demo, and Production on 2026-08-18. Production retained 21 Content rows, 53 Content events, four assets, eight pairings, three provider connections, five packages, one published flagship, and four publication events. The published Facebook Video ID `1616577883220910` and the Ready **Connect with Local Contractors Easily** package remained exact. Rollout created no publication, schedule, provider attempt, or Facebook request.

The standing environment capability was installed only on the `serv-sync-app-refresh` Production environment; Preview and the separate Demo project remain without it. After a zero-active-publication and exact-Ready-package precheck, the database emergency stop was opened through `servsync_update_marketing_publishing_controls` at `2026-08-18T15:54:32Z`. The immediate postcheck retained one historical publication/four events, zero active publications, zero publications for the Ready target, and the one historical provider-request start belonging to the published flagship.

Broad contractor Marketing discovery remains behind `VITE_CONTRACTOR_MARKETING_UI_ENABLED`. FB-037K does not authorize the Ready target or any future public post.
