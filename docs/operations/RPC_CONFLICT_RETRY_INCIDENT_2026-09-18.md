# Production RPC conflict retry incident — 2026-09-18

Production recovery is complete. The application compatibility change and regression coverage are prepared for review; no main merge or application deployment was performed in this task. Demo and Sandbox installation remain pending in the rollout ledger.

## Cause and evidence

The Production dashboard reported 8,388,506 Postgres errors in its preceding 24-hour window and approximately 359,400 in the preceding hour. Sampled entries at 2026-09-18 23:21:13 UTC identified `servsync_record_marketing_package_preview(uuid,uuid,text)`, SQLSTATE `40001`, and PostgREST backend PID `4109787`. Its backend start was `2026-09-07 23:16:09.644289+00`; that session start alone does not establish when the loop began.

The RPC deliberately used PostgreSQL's serialization-failure code for a business conflict (fingerprint mismatch or a published/retired package). PostgREST could retry that permanent rejection indefinitely. See [Supabase's explanation and recovery guidance](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b). The original request's package and user were not determined or impersonated.

Repository investigation found 39 historical occurrences across 32 distinct function names. All 32 affected functions were installed in Production. They cover Marketing and Help Studio business conflicts, including stale worker claims.

## Repair

`servsync-rpc-business-conflict-no-retry.sql` is an idempotent forward migration with an explicit list of 32 function signatures. It replaces custom `errcode='40001'` assignments with `PT409` (HTTP 409) in each installed definition. It preserves later forward fixes rather than recreating older definitions from historical SQL. Historical migration files retain their original bytes.

The migration verifies the full canonical function definition, including argument defaults, and all other `pg_proc` metadata. Parsed default-expression source locations are excluded from the raw metadata comparison because PostgreSQL regenerates those positions during `CREATE OR REPLACE`; the canonical definition comparison still checks the defaults themselves. Unexpected error-code usage or metadata changes abort the transaction. Optional functions that are absent are skipped. No business DML, grant, ownership, RLS, provider request, or table change is included.

Apply this migration after all historical Marketing and Help Studio migrations in any future installation. If restoring/reapplying a historical function definition, reapply this forward migration last. Do not restore the `40001` assignments as a rollback; doing so reintroduces the incident.

The publishing adapter recognizes `PT409` and retains compatibility with legacy `40001` responses. Existing rejection text and workflows are unchanged.

## Production recovery and verification

The owner requested the repair after the diagnosis identified both the RPC change and production recovery. The migration was applied to `uqgtheclhxqlnjpfmheq` through the authenticated Supabase CLI. Its SHA-256 and environment status are recorded in `config/backend-environment-rollouts.json`.

- Before/after catalog comparison verified all 32 complete function definitions changed only at the intended error-code assignments. Ownership, execute grants, security-definer settings, search paths, volatility, and other metadata remained unchanged.
- Zero public functions retained the custom `40001` literal after installation.
- The original backend disappeared after installation. A termination query guarded by PID, exact backend start, PostgREST role/application, preview query identity, and successful function repair matched zero rows and terminated no session. No project restart was needed.
- Before/after business counts matched: Content 28, packages 10, publications 7, publication events 27. No production user or business-record mutation was performed.
- Between `23:32:20.839973` and `23:33:38.221132` UTC, transaction rollbacks stayed at `869387215`, while committed transactions increased by 42. No matching preview backend or deadlock was present. This is a bounded post-recovery observation, not an ongoing monitor.

For a future incident, inspect fresh activity and logs first. Never terminate a PID based only on this historical report. After repairing the error code, terminate only a still-looping backend matched by PID **and** backend start, role/application, and exact failing query. The production patch in this task did not require that intervention.

## Validation

- `npm run test:rpc-business-conflicts` with local PostgreSQL binaries available: disposable database loaded all 32 affected functions; verified exact definition/metadata/comment preservation, unchanged business rows, idempotent reapplication, published/retired/fingerprint conflict responses, successful eligible preview, cross-tenant denial, and preservation of an unrelated real serialization error.
- The same test includes a repository guard ensuring historical conflict functions are covered by the forward repair and application tests proving conflict responses are surfaced without client retries.
- 42 focused Marketing adapter, publishing-worker, and Facebook-connection tests passed.
- 16 backend parity/rollout-ledger tests passed.
- Type checking, production build, lint (0 errors; existing 77-warning baseline), and diff whitespace checks passed.

Tutorial impact: NOT APPLICABLE

Tutorial evidence: This changes backend error classification and compatible client error recognition only. No screens, controls, instructions, messages, permissions, or workflow steps change; no Help content was edited.

The changelog and rollout ledger record the incident. Product direction, feature boundaries, roadmap, and marketing claims did not change.
