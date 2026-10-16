# Practice Demo integration — draft approval packet

Prepared October 16, 2026 for issue #587 / draft PR #588. **Local source only: not pushed, deployed, installed or activated.** This revision does not change onboarding PR #586 or AthleticsArc.

## Smallest next hosted approval

Approve installation of **only** `server/practice/demo-draft/20261016171813_practice_demo_review_draft.sql` into existing **ServSync Demo Supabase `bdytwgejqnlblhrnqxkp`**, followed by read-only catalog, permission and existing-object fingerprint checks. Keep the pilot table empty. No pilot activation, customer data, cleanup, session/configuration change, Vercel deployment, merge or new project is part of this proposed step.

SQL SHA-256: `ff2d31be3f530ebeb9c48e98ae3f160722d31d086461796e64a21bc932b9d0b6`.

Future UI hosting, if separately approved, would use existing Vercel **`servsync-demo` / `prj_tB94FLcorqX9sW7EGPd7t32Z4rdS`**, team `team_Ga7ZoNeteThUar4RQbhiEvGf`. No Vercel change is needed for the proposed SQL-only step. Production `uqgtheclhxqlnjpfmheq`, Sandbox `zpzdkoaubyjtsomccxya`, and AthleticsArc are excluded.

## Exact changes and permissions

- New private schema `servsync_practice_demo`, three RLS/FORCE-RLS tables: `pilots` (empty access bindings), `cycles` (synthetic namespace and expiry metadata), `drafts` (bounded safe work payload). No FK to business, Auth, storage or Demo-reset records.
- One public SECURITY INVOKER RPC, `public.servsync_practice_demo(text,jsonb)`, grants EXECUTE only to `authenticated`. Its private fixed-search-path dispatcher independently requires a non-anonymous `auth.uid()` with a current enabled pilot binding. No user-editable metadata authorizes access.
- New NOLOGIN/NOINHERIT/NOBYPASSRLS role `servsync_practice_demo_executor`: pilot SELECT, cycle/Draft SELECT+INSERT+UPDATE, Auth identity helpers and own private helpers. No DELETE, business-table grants, provider operations, file bucket, scheduler, session or Data API setting changes.
- Temporary CREATE on the new schema and SET membership allow function ownership transfer for a non-superuser installer. Both CREATE and SET/INHERIT are removed before commit. PostgreSQL's installer ADMIN membership remains: the installer can administer this role/regrant membership. This is privileged operator authority, not an application capability.
- Explicit ACL revocations run before ownership transfer, including legacy Supabase automatic grants. Anonymous and service-role EXECUTE are removed. This is not a security boundary against a database administrator or a common runtime with broader credentials.
- Allowed commands: `state`, idempotent `start`, revision-checked `save`. Starts use exactly 720 hours. Expired cycles return metadata with a null snapshot and no Drafts; expired Drafts are denied even to the runtime role by RLS. No cleanup or renewal operation exists.
- Snapshot is the fixed existing fictional local fixture, returned only while active; no business/export query or caller-supplied snapshot is accepted. Direct RPC validation rejects private IDs, notes, costs, credential fields and unexpected keys. Free-text fields cannot automatically distinguish real from fictional text: approved pilot use must remain synthetic.
- Draft transport `src/features/practice/demoTransport.ts` is **not mounted or imported by the app/local screen**. It defaults off, pins the exact Demo origin/RPC, rejects privileged keys and non-Demo/anonymous tokens, disables redirects/cookies, and reconstructs a minimal payload. It uses an existing Demo login; it neither grants nor restricts that login's ordinary Demo capabilities. No production token/account handoff is implemented.

## Preconditions and acceptance for the proposed SQL-only step

1. Reconfirm the connected target project independently, exact file hash, absent schema/role/function names, and the operator's actual CREATEROLE, database/schema CREATE and Auth-helper grant authority. Verify the private schema is not in PostgREST's exposed-schema list. If verification requires changing settings or extra grants, stop: those are not included in the proposed approval.
2. Capture existing business object definitions/grants and row-count fingerprints read-only. Use a bounded timeout and the migration's single transaction. Set the explicit `servsync.reviewed_demo_target` acknowledgement only after verifying the target. That GUC is an accidental-target guard, **not cryptographic project identity**.
3. Verify the empty allowlist, exact ACLs, FORCE RLS, fixed search paths, non-BYPASSRLS runtime role, removed temporary CREATE/SET/INHERIT and absence of external dependencies/triggers. Recheck existing-object fingerprints. Run the approved read-only advisors/parity comparison; record new Demo-only object fingerprints explicitly, never hide supported-object drift.
4. On installation failure, the transaction rolls back. Do not improvise corrective hosted grants or settings. Successful installation still leaves every user denied. Record evidence and stop before pilot provisioning or deployment.

## Evidence and limits

- `npm run test:practice`: **37/37** actual disposable local PostgreSQL checks, including the unchanged 24-test foundation and 13 new Demo integration cases. The new migration installs as a **non-superuser CREATEROLE** fixture with legacy Supabase-style ambient grants.
- New cases cover default denial, anonymous/user-metadata spoof rejection, tenant IDs, raw table/role-switch denial, exact synthetic snapshot, forbidden payload keys, quotas, expiry without deletion, revocation, concurrent saves, lost acknowledgements, blank-line resume and matching JavaScript/SQL Unicode limits. Canonical preview totals are verified at **$250.50** for two $125.25 lines.
- HTTP interception confirms only the pinned Demo RPC is requested, private fields are absent, wrong configuration fails before networking, and send/charge/transfer/cleanup operations are unavailable. The database fixture has an unchanged sentinel business table, no Practice triggers or cross-schema FKs, and no runtime DELETE grant. This does **not** execute real hosted notification/reset/provider paths.
- Independent reviewer reproduced two defects (ownership setup and incomplete-line reload), verified their fixes, and independently reran **13/13** tests. No blocking defect remains in this draft's scope.
- Local tests use PostgreSQL 16, simulated Supabase identity helpers/claims and intercepted HTTP. No actual JWT signature/session, PostgREST, hosted PostgreSQL 17, provider/reset interaction or hosted browser acceptance is claimed. No new hosted Preview exists for this revision.
- Ordinary app and Practice type checks and the normal build pass. The normal build excludes the new transport. Full lint passes with the unchanged 76-warning baseline; targeted lint has zero warnings. All 16 backend-parity tooling/ledger tests pass; this is not a live environment parity result. The disposable installer matches commit `243c9d1` exactly.

## Material experience decisions still open

This draft has **one synthetic pilot cycle per approved user** because renewal/deletion is not approved. After expiry it remains inaccessible and physically retained. This is an explicit pilot limitation, not the intended finished Practice experience or a monthly-deletion promise. An owner decision is needed before presenting that limit to contractors, enabling renewal/purge, or copying real business snapshots.

A hosted pilot would also need a separately approved, existing Demo reviewer identity binding and UI entry. The proposed SQL-only step grants neither. Existing Demo JWT authority is broader than Practice; if session-wide restriction is required, an additional reviewed access design is needed. Real-account snapshot import, real Draft transfer, generated-file retention and operational backups remain separate work.

Tutorial impact: **NOT APPLICABLE** to this unmounted source-only draft. Hosted UI implementation/validation must precede its own Help Studio freshness check. PR #586's TUT-002 follow-up remains separate. Marketing may describe only a synthetic Practice prototype in development; no hosted, seamless, same-login or deletion guarantee is supported.
