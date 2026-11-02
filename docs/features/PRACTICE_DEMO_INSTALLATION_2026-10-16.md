# Practice Demo installation — October 16, 2026

**Installed and verified; Practice remains disabled.** Ben explicitly approved the revised SQL-only installation at commit `4618568d99fa731b571cabaa602bfb5f97431478` and SHA-256 `4394c5ecb28167aee93f7a5cfcc08e3fb135a0e7dd8c45bd0ed02c89e3d833f4`.

Target independently confirmed: ServSync Demo `bdytwgejqnlblhrnqxkp`, host `db.bdytwgejqnlblhrnqxkp.supabase.co`, PostgreSQL 17.6. Applied once through the migration tool, recorded as `20261016180520 / practice_demo_review_draft`. Reviewed SQL bytes were unchanged. Execution context supplied only a transaction-local target acknowledgement and statement/lock timeouts (20s/5s); no persistent settings or corrective SQL.

## Verified read-back

- Pilots **0**, cycles **0**, Drafts **0**. No access binding or user was created.
- Three private tables have RLS and FORCE RLS. Exact new functions, fixed search paths and ownership match the reviewed design. Only the dispatcher is SECURITY DEFINER, owned by the restricted executor.
- Executor has NOLOGIN/NOSUPERUSER/NOINHERIT/NOCREATEROLE/NOCREATEDB/NOBYPASSRLS, no Auth schema USAGE, no private schema CREATE or DELETE grants. Installer SET/INHERIT were removed; its approved ADMIN ability for the new role remains. Hosted PostgreSQL records two membership grantors, both with SET/INHERIT false; this confers no additional managed-role authority.
- Anonymous/service-role RPC and dispatcher EXECUTE are false. Authenticated can execute only the new wrapper/dispatcher, with no direct private-table or identity-helper access. Current pilot binding remains mandatory.
- No new noninternal trigger or cross-schema FK. Existing managed Auth schema/helpers' ACLs, owners and definition hashes match; managed-role memberships are unchanged.
- All **12 existing catalog category fingerprints** match: 162 relations, 2,333 columns, 1,574 constraints, 643 indexes, 189 triggers, 222 policies, 606 functions, 1,483 function-grant entries, 2,721 table-grant entries, 61 column-grant entries, 96 default-ACL entries and one managed Storage relation. The new public wrapper and its grants are excluded by exact identity from this before/after comparison and separately inspected; no broad exception is added.
- All **162 public-table row counts** match before/after (596 rows total). These are counts, not row-content hashes.
- Before/after read-only API profile probes return **406/PGRST106**, listing only `public, graphql_public`; `servsync_practice_demo` remains unexposed.

## Advisors and parity scope

Security advisor finding content is unchanged, excluding only per-run `observed_at` timestamps: 88 RLS-without-policy INFO, nine mutable-search-path WARN, 80 anonymous executable-definer WARN, 348 authenticated executable-definer WARN, one leaked-password-protection WARN. No remediation was attempted. Reference: [search-path lint](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [anonymous definer lint](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated definer lint](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

This establishes Demo before/after catalog parity. The Production-versus-Demo parity runner reads Production and was not run under this Demo-only approval. No cross-environment parity claim is made.

## Limits and remaining gates

No pilot binding, valid hosted user-session acceptance, UI mount, two-device test, notification/reset/provider exercise, real snapshot/import/transfer or cleanup was performed. All users remain denied by the empty allowlist. Existing ordinary Demo JWT capabilities are unchanged. The existing ordinary Preview does not expose Practice.

The approved source already passed 41 local PostgreSQL tests, independent 16-case Demo review and [exact-head CI](https://github.com/bencatchot/ServSync-App/actions/runs/38943560356). Those remain local/modelled evidence, distinct from this hosted catalog verification.

No managed Auth grants, new credentials/projects, production/Sandbox writes, settings changes, merge, code push or deployment. Repository execution documentation is retained locally so recording the result does not trigger Preview deployment. [Issue #587](https://github.com/bencatchot/ServSync-App/issues/587) and [PR #588](https://github.com/bencatchot/ServSync-App/pull/588) carry the execution update.

Tutorial impact: **NOT APPLICABLE**; Practice remains unmounted. Onboarding PR #586/TUT-002 and AthleticsArc are unchanged.
