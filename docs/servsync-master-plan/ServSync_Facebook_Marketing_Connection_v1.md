# ServSync Facebook Marketing Connection v1

## Scope

This slice connects the ServSync internal Marketing workspace to one explicitly selected ServSync-owned Facebook Page. It stops before any public post.

```text
platform-admin Connect Facebook
-> Meta owner consent
-> server-side authorization-code exchange
-> eligible Page discovery
-> explicit Page selection
-> Vault-backed Page token
-> non-posting readiness validation
-> READY EXCEPT LIVE POST VERIFICATION
```

The provider-neutral publication lifecycle remains authoritative. Approval does not connect a provider, and connection does not create, schedule, or publish content.

## Current Meta Contract

The implementation was reviewed against current official Meta documentation on 2026-08-15 and pins Graph API `v26.0`.

Requested permissions:

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`

An eligible Page must also report the `CREATE_CONTENT` Page task. ServSync uses `/me`, `/me/permissions`, and `/me/accounts` for identity, granted-permission, and Page discovery checks. Page readiness is revalidated against the selected Page identity and task set.

Meta App Review, Advanced Access, and Business verification requirements depend on the final app/business configuration and who will authorize the app. Their current ServSync status is unverified. They must be resolved in Meta before the real owner connection can be treated as available outside any permitted app-role testing boundary.

Official references:

- [Meta Pages API: Getting Started](https://developers.facebook.com/docs/pages-api/getting-started/)
- [Meta Pages API: Posts](https://developers.facebook.com/docs/pages-api/posts/)
- [Meta manual Facebook Login flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/)
- [Meta permissions reference](https://developers.facebook.com/docs/permissions#pages_manage_posts)
- [Meta Graph API versions](https://developers.facebook.com/docs/graph-api/changelog/versions/)

## Production Configuration

Exact callback URL:

```text
https://servsync.app/api/marketing-facebook-oauth-callback
```

Required Production-only server variables:

```text
SERVSYNC_META_APP_ID
SERVSYNC_META_APP_SECRET
SERVSYNC_META_GRAPH_API_VERSION=v26.0
SERVSYNC_META_OAUTH_REDIRECT_URI=https://servsync.app/api/marketing-facebook-oauth-callback
```

The server also requires the existing exact Production publishing identity and server credential:

```text
SERVSYNC_MARKETING_PUBLISHING_PROJECT_REF=uqgtheclhxqlnjpfmheq
SUPABASE_URL=https://uqgtheclhxqlnjpfmheq.supabase.co
SUPABASE_SERVICE_ROLE_KEY
```

`SERVSYNC_META_APP_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are server-only. They must not use a browser-visible prefix or appear in source, database rows, logs, documentation values, or chat.

`SERVSYNC_FACEBOOK_PUBLIC_POSTS_ENABLED` must remain absent or false for this slice. Even if it were enabled later, the database connection capability remains a second independent posting gate until a separately authorized live-post task changes it.

Demo and Sandbox do not receive real Meta credentials or authorize the real ServSync Page.

## OAuth Security

- Only an authenticated platform admin can begin the internal connection.
- The server generates 32 random bytes and returns only the opaque state to Meta. The database stores only its SHA-256 digest.
- State is bound to the internal workspace, connection, initiating platform admin, exact callback, and Meta App ID.
- State expires after 10 minutes and is consumed once. State and authorization-code replay are rejected.
- Starting a replacement authorization expires unfinished sessions and deletes any transient user token from Vault.
- The callback exchanges the code server-side. App secrets and provider tokens do not enter browser responses.
- Provider errors are reduced to bounded categories; raw provider payloads and descriptions are not logged.
- A different platform admin cannot take over another admin's pending Page-selection session.

## Token Storage

Supabase Vault is installed in Sandbox, Demo, and Production. It encrypts secret values at rest while ServSync public-schema rows retain only Vault UUID references.

The owner user token is transient and exists only while the owner chooses a Page. Successful Page selection stores the selected Page token in Vault and deletes the transient user token. Forced-RLS, policy-free reference/session tables have zero direct grants to `anon`, `authenticated`, or generic `service_role`; purpose-built service RPCs are the only token read/write boundary.

Normal Marketing, publication, event, and content metadata never contain a token or token fragment.

## Page Selection And Readiness

ServSync never auto-selects a Page. The browser receives only Page ID, Page name, bounded tasks, and eligibility. The initiating owner must choose an eligible Page returned by Meta.

After selection, the server rediscovers the owner's Pages, retrieves the selected Page token server-side, and validates the exact Page ID, display name, and `CREATE_CONTENT` task. The stored readiness is:

```text
ready_except_live_post_verification
```

That is the strongest truthful non-posting result. It does not claim that a public post has succeeded.

Tracked lifecycle metadata includes connected owner/time, token expiry when supplied, last validation, and disconnect/reconnect state. No fake refresh exists. An invalid or insufficient token during recheck is deleted from Vault and changes readiness to `reconnect_required`.

## Disconnect

Disconnect immediately disables the local connection, clears destination/capability metadata, deletes transient and Page token material from Vault, and leaves publishing disabled. Historical publication rows and events are preserved.

Meta-wide permission revocation is not automated in v1 because ServSync deliberately does not retain the owner user token after Page selection. An owner can separately remove the ServSync business integration in Meta if provider-side revocation is desired. A later task may add a reviewed revocation flow without weakening local deletion.

## Rollout Evidence

Migration `servsync-facebook-marketing-connection.sql`, SHA-256 `e003558a720fd5dc2a3cd2ef0179a6227af834258307599cf28f5070179af908`, was applied Sandbox -> Demo -> Production on 2026-08-15.

- Sandbox: real Vault-backed connection lifecycle passed inside a rollback-only transaction, then returned to zero OAuth sessions, token references, publications, and events.
- Demo: zero OAuth sessions, token references, Marketing content/packages/events, and publications remained unchanged.
- Production: 16 content records, 3 preparation packages, 34 content status events, and zero publications/events were preserved exactly.
- All environments retain three provider rows. Facebook remains `setup_required`, `publishing_enabled=false`, with no selected Page and no live token.
- Both new private tables use forced RLS and expose zero direct browser or generic service-role grants.

No Meta app credential, owner consent, Page selection, public post, or external provider traffic occurred during rollout.

## Owner Connection Checklist

1. Confirm or create the ServSync-owned Facebook Page and the Meta Business relationship that administers it.
2. Create or confirm a Meta Developer Business app owned by the appropriate ServSync/owner business account.
3. Add Facebook Login and configure the exact callback URL above. Do not add wildcard or Preview callbacks.
4. Confirm current access for `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`, including any required App Review, Advanced Access, and Business verification.
5. Install the four `SERVSYNC_META_*` values in the Production Vercel project through secure environment management. Never paste the App Secret into chat.
6. Leave `SERVSYNC_FACEBOOK_PUBLIC_POSTS_ENABLED` absent/false.
7. Deploy the exact merged main build.
8. Sign in to Production as platform admin, open Internal Marketing Publishing/provider readiness, and choose **Connect Facebook**.
9. Complete Meta login/consent directly with Meta. Do not share the password or access token.
10. Return to ServSync and explicitly choose the ServSync-owned Page.
11. Confirm the UI reports `Ready except live post verification`, the correct Page name, and a recent validation time.

The next task is one separately authorized, exact approved-copy Facebook text publication with owner confirmation and post-result reconciliation. It must not begin until this checklist is complete.
