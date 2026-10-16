# Practice Demo integration — revised approval packet

Prepared October 16, 2026 for [issue #587](https://github.com/bencatchot/ServSync-App/issues/587) / [draft PR #588](https://github.com/bencatchot/ServSync-App/pull/588). **Approved exact bytes were installed in Demo on October 16, 2026; Practice remains inactive with an empty pilot allowlist.** See [execution evidence and limits](PRACTICE_DEMO_INSTALLATION_2026-10-16.md). The scope and preconditions below are retained as the approval record. Ordinary automatic non-Practice Preview builds remain permitted; no manual deployment is authorized. Onboarding PR #586 and AthleticsArc are unchanged.

## Why the previously approved installation stopped

The prior SQL at commit `4bcc96192bb1c19e42533aef3fd837241b13891a`, SHA-256 `ff2d31be3f530ebeb9c48e98ae3f160722d31d086461796e64a21bc932b9d0b6`, was approved for a Demo-only installation with an empty allowlist. Read-only preflight found that the existing `postgres` installer cannot grant privileges on managed Auth objects. **No migration was attempted, no objects were partially created, and no rollback occurred.** The local fixture had incorrectly given the installer grant options; that defect is corrected here. [Blocked-install evidence](https://github.com/bencatchot/ServSync-App/issues/587#issuecomment-6221339591).

Observed Demo permission model:

- Installer `postgres`: non-superuser, CREATEROLE/CREATEDB/INHERIT/BYPASSRLS, database/public CREATE. It already has Auth schema USAGE and helper EXECUTE, but no corresponding grant options.
- `auth` owner: `supabase_admin`. No PUBLIC schema USAGE. `auth.uid()` and `auth.jwt()` owner: `supabase_auth_admin`; both have PUBLIC EXECUTE. The installer cannot SET or inherit either managed owner.
- Thus explicit helper EXECUTE grants would be redundant, but removing them alone would not solve schema access. The new executor still cannot resolve functions in `auth`.
- Revised SQL does not grant or change anything on existing Auth objects, alter managed-role attributes/membership, switch to a managed owner, or use another credential. The existing local disposable installer remains byte-identical to commit `243c9d1`.

## Supported identity boundary

A new argument-free, private `request_actor()` helper is SECURITY INVOKER, STABLE, with `search_path=pg_catalog`. It reads only PostgREST's transaction-local `request.jwt.claims`, validates exact Demo issuer, `role=authenticated`, JSON boolean `is_anonymous=false`, and UUID `sub`. Missing, empty, malformed, mistyped or mismatched claims deny access. Legacy individual claim settings, headers, RPC arguments and user-editable metadata cannot supply identity. The dispatcher and all ownership predicates use the same helper.

**PostgREST validates the JWT signature and time claims before setting this request context.** SQL does not independently verify a JWT signature, and the browser's decoded-claim checks are only destination/mistake guards. The observed managed `auth.uid()`/`auth.jwt()` definitions also read request GUCs; calling them would not add signature verification. Direct SQL credentials/database administrators can set GUCs and remain outside this API trust boundary. Do not expose generic SQL or settings setters. Existing Demo JWT authority outside Practice is unchanged; this is not a restricted replacement login. Current pilot access is rechecked in the database, so stale claims cannot override revoked pilot access.

Primary references checked against current docs/changelog:

- [Supabase API security](https://supabase.com/docs/guides/api/securing-your-api) and [database roles](https://supabase.com/docs/guides/database/postgres/roles).
- [PostgREST JWT authentication](https://docs.postgrest.org/en/stable/references/auth.html) and [transaction-local request claims](https://docs.postgrest.org/en/stable/references/transactions.html#request-headers-cookies-and-jwt-claims).
- [API auto-exposure change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically): explicit revokes remain necessary for existing legacy defaults. [PostgreSQL minor release changes](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes) do not require any extension/operator change for this draft.

## Smallest next hosted approval

Approve installation of **only** `server/practice/demo-draft/20261016171813_practice_demo_review_draft.sql` into existing **ServSync Demo Supabase `bdytwgejqnlblhrnqxkp`**, followed by bounded read-only catalog, permission and existing-object fingerprint/advisor/parity checks. **Keep the pilot table empty.** No pilot activation, customer data, cleanup, session/configuration change, Vercel deployment, merge or new project is included. The earlier approval does not authorize these revised bytes, and no installation retry has occurred.

Revised SQL SHA-256: `4394c5ecb28167aee93f7a5cfcc08e3fb135a0e7dd8c45bd0ed02c89e3d833f4`.

Future UI hosting, if separately approved, would reuse Vercel `servsync-demo` / `prj_tB94FLcorqX9sW7EGPd7t32Z4rdS`, team `team_Ga7ZoNeteThUar4RQbhiEvGf`. No Vercel change is needed for this proposed SQL-only step. Production `uqgtheclhxqlnjpfmheq`, Sandbox `zpzdkoaubyjtsomccxya`, and AthleticsArc are excluded.

## Exact new objects and permissions

- Private schema `servsync_practice_demo`; three RLS/FORCE-RLS tables: `pilots` (empty access bindings), `cycles` (synthetic namespace and expiry), `drafts` (bounded allowlisted payload). No Auth/business/storage/reset foreign keys.
- Six private functions: `request_actor()`, `synthetic_snapshot()`, `valid_number(jsonb,boolean,boolean)`, `utf16_length(text)`, `validate_payload(jsonb)`, `dispatch(text,jsonb)`. Only `dispatch` is SECURITY DEFINER, owned by a new NOLOGIN/NOINHERIT/NOBYPASSRLS executor with a fixed search path. No function runs as an elevated installer for identity lookup.
- One public SECURITY INVOKER wrapper `public.servsync_practice_demo(text,jsonb)`, executable only by `authenticated`. Authenticated users can call the dispatcher but cannot execute other private helpers, read/write private tables, switch to the executor, or provision pilot access. Empty allowlist denies all user operations.
- Executor: SELECT pilots; SELECT/INSERT/UPDATE cycles/Drafts; own private helper EXECUTE. No Auth schema USAGE, business grants, DELETE, provider hooks, bucket, scheduler, session or API-setting change. PUBLIC helper EXECUTE inherited from Supabase still exists but is unusable without Auth schema USAGE; the draft does not depend on it.
- Installer temporarily gets SET membership in the new executor, and executor temporarily gets CREATE on the new schema to transfer dispatcher ownership. CREATE and installer SET/INHERIT are removed before commit. PostgreSQL's installer ADMIN membership for this new role remains; the installer already has CREATEROLE. No managed-role authority is added. Existing business/Auth definitions, policies and grants are unchanged; hosted fingerprint verification is still required after an approved installation.
- Explicit new-object revokes remove legacy automatic grants before commit. Name collisions abort rather than replace existing objects. No global default privileges change.
- Commands remain `state`, idempotent `start`, revision-checked `save`, with 50 Drafts, 100 lines and bounded text/numbers. Snapshot is fixed fictional data; no caller-supplied snapshot, identity, private IDs/costs/notes or unexpected payload fields. Free text cannot distinguish real from fictional content, so any later approved pilot must use synthetic data only.
- One 720-hour cycle per pilot. Expiry hides payloads/snapshot, denies further writes and does not delete retained rows. No renewal, import, send, charge, transfer or cleanup command exists.
- The existing Demo transport remains unmounted/default-off, pinned to exact Demo origin/RPC, no redirects/cookies, minimal reconstructed payload. No new credential, session bridge or production handoff.

## Preconditions and acceptance for a separately approved installation

1. Independently reverify target, exact hash, absent schema/role/wrapper, and installer CREATEROLE/database/public CREATE. Confirm managed Auth ACL/owner/membership baseline and the private schema's exclusion from PostgREST. **No Auth grant option is required.** Stop if any extra authority, credential, setting or corrective SQL is needed.
2. Capture existing business definitions/grants and bounded row-count fingerprints read-only. Apply exact bytes once, with timeout and the script's single transaction. Set `servsync.reviewed_demo_target` only after independent target verification; it is a mistake guard, not cryptographic project identity.
3. Verify empty pilots, exact owners/ACLs/FORCE RLS/search paths, runtime non-BYPASSRLS/NOLOGIN, absent Auth schema USAGE, removed temporary CREATE/SET/INHERIT, no triggers/cross-schema dependencies, unchanged managed Auth/role and business fingerprints. Run read-only advisors/parity; explicitly record intended new Demo-only objects without concealing drift.
4. Failure must roll back the transaction. Do not improvise grants, role switching or fixes. Successful installation still leaves all users denied. Stop before pilot provisioning/deployment. Post-commit removal needs separately reviewed rollback of new objects/role membership; no automatic down migration or DROP CASCADE is approved.

## Verification evidence and limits

- **41/41 combined Practice checks pass, including 16/16 Demo integration checks on real disposable PostgreSQL 16**, using a non-superuser CREATEROLE/BYPASSRLS installer with actual managed-schema/function ownership and no grant options or managed-owner membership. Before/after assertions preserve Auth definitions/ACLs/owners and managed-role memberships/attributes. Runtime stays NOBYPASSRLS and cannot access Auth schema even though PUBLIC helper EXECUTE is inherited.
- New regressions cover missing/empty/malformed claims, strict claim types, wrong issuer/role, anonymous/null/string-false denial, header/legacy/user-metadata/argument spoofing, pooled-session clearing and runtime tenant filtering. Existing tests retain quotas, concurrent CAS, lost-ack retry, revocation, expiry without deletion, blank-line/Unicode resume and exact $250.50 preview totals.
- HTTP interception proves the transport uses only the pinned RPC and strips private fields. A business-write tripwire remains unchanged; no Practice trigger, cross-schema FK or DELETE grant exists. Local claims are injected by tests: these tests do not validate real JWT signatures, Supabase Auth sessions or real notification/reset/provider paths.
- Hosted **read-only** probes used the existing Demo public browser key against a nonexistent table with `limit=0`: schema profile `servsync_practice_demo` returned **406/PGRST106**, listing only `public, graphql_public`; an unsigned synthetic JWT returned **401/PGRST301**. This confirms observed schema exclusion and rejection of that forged token, not valid-account or Practice acceptance. No key value is stored in this packet. A root OpenAPI probe was denied because that endpoint requires a secret key; no secret key was sought or used.
- Managed helper definitions were inspected read-only and confirmed request-GUC reads. No schema/role/RPC existed at the blocked-install checkpoint. Existing security-advisor warnings are baseline findings, not introduced changes or remediated findings.
- An independent reviewer inspected the revised SQL and fixture, independently reran all **16/16** Demo checks, and found no blocking issue within this local scope. Practice type checks, targeted zero-warning lint, 16 backend-parity tooling/ledger tests and diff checks pass. Exact-head CI results are recorded in the PR/issue after publication. No hosted installation, valid-session acceptance, PostgreSQL 17 migration execution, full live business fingerprint/parity comparison or hosted Practice browser test is claimed. Ordinary Preview builds do not expose Practice.

## Remaining experience and rollout decisions

This draft permits one synthetic cycle per separately approved pilot, physically retained after access expiry. Renewal/purge and backup handling remain explicit decisions. Hosted UI, a Demo reviewer identity binding, same-login real setup snapshots, real Draft import/reconciliation, cleanup and cross-device acceptance remain separate reviewed work. No new projects are proposed.

Tutorial impact: **NOT APPLICABLE** to this unmounted source-only revision. Hosted UI implementation and validation must precede Help Studio freshness review. PR #586's TUT-002 follow-up remains separate. Marketing may describe only a synthetic Practice prototype in development; no hosted, seamless, same-login or deletion guarantee is supported.
