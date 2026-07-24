# FB-020 Operations And Security Readiness Runbook

Status: controlled private beta baseline met; follow-up runbook for public go-live, paid-subscription, full restore, storage restore, and backup/PITR readiness.

This runbook is part of FB-020: Security, Records Reliability, Backup/Restore, Storage, and Scale Readiness. It documents the process ServSync should follow before broad beta expansion, public launch, or paid contractor subscriptions.

This document is not approval to change production, apply SQL, modify RLS/storage policies, create users, or run production smoke tests. Those remain separate approval gates.

FB-020 has met the controlled private beta baseline for the current beta stage. The baseline is supported by production public smoke coverage, required production authenticated read-only smoke for homeowner and contractor owner accounts, no production mutation during smoke testing, restore drill preflight/operator docs, backup/restore evidence templates, backup/restore artifact `.gitignore` guardrails, a first non-production database-only schema restore drill, schema restore verification matching 66 public tables, 179 public functions, and 66 RLS-enabled public tables, cleanup of the throwaway restore target and local artifacts, and no committed secrets/artifacts. FB-020 is not fully complete: full data/auth restore remains open due to the `auth.users` scope boundary, storage restore remains open, backup/PITR verification remains open, storage-object backup/restore strategy remains unverified, optional production role credentials remain future/not configured, optional stable production smoke record IDs remain future/not configured, public go-live readiness remains a separate gate, and paid-subscription readiness remains a separate gate.

Controlled-operations packet policy is documented in [Controlled Operations Policy And Runbook](CONTROLLED_OPERATIONS_RUNBOOK.md). That runbook covers the local/provider-neutral evidence foundation through Slice 2D-A and the Slice 3 documentation closeout. It does not approve live provider adapters, credentials, SQL, deployment, Supabase, Vercel, Production, Sandbox, Preview, Demo, or customer-data access.

## Operating Principles

- Default to sandbox, preview, or local environments for authenticated and mutating validation.
- Treat production as read-only unless a task explicitly approves production changes.
- Keep SQL, RLS, RPC, storage policy, auth, environment, Vercel, Supabase, user-record, and production-data changes behind explicit approval.
- Keep test credentials in local ignored files or a password manager, never in commits, docs, chat output, screenshots, videos, traces, or logs.
- Keep smoke/test records clearly labeled and scoped to approved environments.
- Record which SQL patches have been applied to sandbox and production before relying on deployed behavior.

## Database Backup Expectations

Before broader beta or public go-live, ServSync should have a documented database backup posture for each Supabase project.

Minimum expectations:

- Confirm the Supabase plan and backup/PITR capability for production.
- Document the expected backup frequency, retention window, and restore target options.
- Identify who is allowed to initiate restores and who must approve them.
- Record the latest successful restore drill date.
- Keep restore testing in a non-production project unless an incident response plan explicitly approves otherwise.

Controlled private beta may proceed on the current baseline because the missing full data/auth restore, storage restore, storage-object backup/restore strategy, and backup/PITR evidence remain tracked as FB-020 follow-ups. Broader beta, public go-live, paid-subscription readiness, or incident-response readiness may require stronger evidence before launch.

Generated backup, restore, export, query-output, storage-export, and local ops artifacts must remain local/private and must never be committed. Slice 1G adds `.gitignore` guardrails for common local dump/export/output names, but `.gitignore` is not a substitute for operator review and does not approve backup, restore, Supabase CLI, storage, production data, or settings work.

## Storage-Object Backup Expectations

Database backups do not automatically back up Supabase Storage objects. Storage buckets need their own backup/export expectation.

Buckets to account for:

- Private: `home-documents`
- Private: `service-request-media`
- Private: `inspection-media`
- Private: `support-attachments`
- Public: `contractor-assets`
- Public: `discover-media`

Minimum expectations:

- Document which buckets are private and which are public.
- Document the object export/backup mechanism for each bucket.
- Include metadata needed to reconnect objects to database records after restore.
- Verify that private files stay private in backup storage.
- Define an orphan-object audit and cleanup process for files without matching app metadata.
- Define recovery expectations for missing or corrupted media/PDF objects.

## Storage Restore Verification Plan

This plan prepares a future approval-gated storage restore verification. It does not execute a restore, download storage objects, create backup artifacts, change storage policies, touch production data, or prove public go-live or paid-subscription readiness.

Purpose:

- Verify that the Supabase Storage backup/restore strategy can recover representative storage objects into an approved target without exposing private customer data.
- Confirm that restored objects can be reconnected to app metadata and remain protected by the intended storage access controls.
- Capture enough sanitized evidence for operational readiness without committing raw file contents, signed URLs, private object paths, customer identifiers, or backup details.

Preconditions before any future execution:

- Separate explicit approval for the storage restore verification scope, source, target, operator, and allowed object sample.
- Confirmed source project/ref and restore target, with a non-production restore target preferred.
- Service credentials, access tokens, database URLs, storage credentials, and provider credentials handled outside the repo and outside chat/log output.
- Approved fixture object set, sanitized representative objects, or a privacy-reviewed sample strategy that avoids private customer-identifying paths in repo-tracked evidence.
- Confirmed cleanup plan for restored objects, local artifacts, temporary exports, and any throwaway target.
- No raw secrets, signed URLs, private object contents, private object paths, raw backup paths, or customer-identifying values in docs, reports, PRs, logs, screenshots, traces, or terminal captures.

Storage surfaces to consider:

- Homeowner/contractor uploaded photos or media, if currently used by the app.
- Generated PDFs, final snapshots, legal/trust documents, or filed records, if stored in Supabase Storage.
- Request, job/inspection, support, Discover, and contractor profile media, if applicable.
- Any other buckets currently used by the app at the time the verification is approved.

Evidence to capture, sanitized only:

- Bucket names, if safe to record.
- Object counts, sample counts, or hash/checksum summaries only when privacy-safe and not derived from private identifying paths.
- Source environment label and restore target identifier, redacted if needed.
- Verification method, such as inventory comparison, representative object availability check, checksum/hash comparison, metadata reconnect check, or storage policy/catalog check.
- Operator, date/time, approval reference, pass/fail/blocked result, cleanup confirmation, residual-artifact status, and follow-up actions.

Privacy and artifact rules:

- Do not commit raw object contents, signed URLs, private storage URLs, customer names, addresses, emails, phone numbers, object paths with private identifiers, raw backup paths, or raw production query output.
- Keep generated backup, restore, export, storage-export, checksum, inventory, and local ops artifacts gitignored, local/private, or in an approved private ops location.
- Prefer high-level summaries such as "representative private object restored and access-checked" rather than object-level lists.
- Treat object paths and record IDs as sensitive unless explicitly approved and sanitized.

Verification approach:

- Start with read-only inventory and catalog checks before any restore action.
- Restore only to an isolated non-production target unless an incident response plan explicitly approves otherwise.
- Verify representative object availability and integrity without exposing contents.
- Verify metadata reconnect behavior where applicable, such as matching object metadata to a restored app record or sanitized fixture.
- Verify storage access controls and storage policies where applicable, including private bucket access behavior and public bucket expectations.
- Verify cleanup of temporary restore artifacts, local exports, restored object samples, and throwaway targets.

Failure handling:

- Stop immediately if the source or target is ambiguous, if production is accidentally targeted, or if secrets/private object details may be exposed.
- Redact errors before writing any report.
- Document partial restore risk, affected bucket labels, failed verification step, rollback or cleanup steps, and follow-up owner.
- Do not retry with broader permissions, larger samples, or production targets without separate approval.

Explicit exclusions:

- Not public go-live readiness.
- Not paid-subscription readiness.
- Not full data/auth restore.
- Not backup/PITR verification.
- Not storage restore execution in this docs-only slice.
- Not a deploy.
- Not a production mutation.

## Restore Drill Process

A restore drill should prove that the app can recover records and files into a fresh non-production environment.

Review `docs/FB-020_RESTORE_DRILL_PREFLIGHT_PLAN.md` before any restore drill execution. The preflight plan defines required approvals, isolated target-environment rules, data sensitivity rules, verification preparation, cleanup expectations, and evidence capture guidance. It does not complete a restore drill, verify backup/PITR readiness, verify storage restore readiness, or approve backup, restore, SQL, Supabase CLI, production data, storage access, settings, user, or deploy work.

Use `docs/FB-020_RESTORE_DRILL_OPERATOR_CHECKLIST.md` as the final operator go/no-go checklist before any separately approved restore drill. The checklist is not approval to run backup, restore, SQL, Supabase CLI, storage, production data, settings, user, or deploy work.

Drill checklist:

- Confirm the source backup/export and target project.
- Restore database schema and data into a non-production project.
- Restore or rehydrate representative storage objects.
- Apply the approved SQL sequence or migration set needed for current app behavior.
- Verify core tables, RLS, high-risk RPCs, and storage buckets with read-only catalog checks.
- Run homeowner smoke, contractor smoke, full core loop, RLS/privacy, storage/media, and any affected workflow tests.
- Confirm no production settings, secrets, users, or customer data are altered during the drill.
- Record the date, source, target, commit, SQL ledger version, storage restore result, tests run, and gaps found.

FB-020 Slice 1F adds blank/sanitized templates for restore drill results, applied-SQL ledger entries, production SQL rollout captures, storage backup/readiness worksheets, and Edge Function/env/secret restore notes in `docs/FB-020_BACKUP_RESTORE_LEDGER_TEMPLATES.md`. These templates do not complete a restore drill and are not approval to run backups, restores, SQL, Supabase CLI commands, storage access, production checks, settings changes, or deploys.

Latest restore drill evidence as of 2026-07-02: a controlled database-only drill restored the sandbox public schema into isolated throwaway target `servsync-restore-drill-2026-07-02` / `nxzermkvfimtxwkoozfh`, then verified 66 public tables, 179 public functions, and 66 public RLS-enabled tables. Public data restore stopped safely because public rows reference `auth.users`, and auth-user restore was not explicitly approved. Storage restore was not in scope. Production was not touched. The throwaway target was deleted, the local link was restored to sandbox `zpzdkoaubyjtsomccxya`, and private local dump/restore artifacts were deleted.

Future drill decision options:

- Approve a future full database restore including required auth schema/user rows into a throwaway target.
- Create a sanitized matching auth fixture/export for restore drills.
- Accept schema-only restore as the first drill milestone and defer full data restore.

## Applied-SQL Ledger And Deployed-State Tracking

ServSync currently uses reviewed SQL patch files. Before broader launch, each applied SQL patch should be tracked by environment.

The ledger should include:

- SQL file name.
- Git commit SHA reviewed.
- Sandbox applied date and operator.
- Sandbox verification summary.
- Production approval reference.
- Production applied date and operator.
- Production verification summary.
- Rollback or mitigation notes, if any.

Catalog checks should verify deployed state instead of assuming that repository SQL matches Supabase.

Use `docs/FB-020_BACKUP_RESTORE_LEDGER_TEMPLATES.md` as the sanitized capture format for future applied-SQL evidence. Real operational ledgers should stay in an approved private ops location unless intentionally sanitized for repo tracking.

## Durable Draft Cohort Rollout

Current source and deployed-state inventory:

- `servsync-durable-draft-launch-foundation.sql`, SHA-256 `ac9e600ece3075e2d171da5571aab2b26e7a1f6f234239b02194fa7be3d2354f`, is the corrected canonical foundation. It is installed and verified in Production; Production durable Draft tables are empty and no authenticated Production durable workflow has run.
- `servsync-durable-draft-launch-permission-parity-correction.sql`, SHA-256 `b4a98f33acd99083bea4497268393f6277ef330cdcb31bdc5d253adb94b14c7f`, is the historical Sandbox-only correction. Do not apply it to Production after the corrected canonical foundation.
- `servsync-durable-draft-cohort-entitlement.sql`, SHA-256 `51d1921d1d19cb79a95c4c81976b78a09d00968d7020140598362e8b72cf453b`, is installed and validated in Sandbox. It remains unapplied to Production.
- No contractor is enrolled by the cohort-gating source PR. `durable_draft_beta_enabled` defaults to `false` for every existing and future billing-account row.

The runtime exposure decision is default-deny. All of the following must be true: `VITE_SHARED_DRAFT_COMPOSER_LAUNCH_ENABLED=true`, `VITE_DRAFT_JOB_UI_ENABLED=true`, `VITE_CONTRACTOR_WORK_UI_ENABLED=true`, Demo Presentation off, a valid contractor context, and a server-resolved exact-tenant entitlement. Missing, partial, false, malformed, stale, or failed state renders legacy Jobs. The three global gates remain the emergency kill switch and remain absent/off in Production until separately approved. The cohort entitlement controls presentation only; existing Draft persistence, Estimate, Job, RLS, and RPC authority remains authoritative.

The source uses a one-minute in-memory entitlement TTL. It refreshes on contractor/session changes and when a stale window regains focus or visibility. Equivalent simultaneous refreshes for the same client, contractor, session, and request generation are coalesced into one RPC, while stale responses remain generation-guarded. It does not poll and does not persist entitlement in browser storage. Removal is observed on contractor/session change, a stale focus/visibility refresh, or forced reload; a continuously active uninterrupted tab has no guaranteed autonomous refresh maximum and remains an external-beta rollout limitation.

Required approval sequence:

1. Review and approve the exact cohort SQL hash and target environment.
2. Apply the cohort SQL to Sandbox only under a separate SQL-application authorization.
3. Run the controlled Sandbox matrix before any Production cohort SQL application.
4. Approve one contractor by exact contractor UUID; never select a tenant by email, name, or fuzzy lookup.
5. Record the approval reference, exact UUID, operator, timestamp, before/after value, readback result, and rollback owner in the private operational ledger.
6. Enable all three global gates only in the separately approved validation environment.
7. Apply the cohort SQL to Production only after a separate Production SQL authorization and read-only preflight.
8. Enroll a Production tenant only with explicit owner approval and exact-UUID readback verification.
9. Keep a tested `false` removal path and all three global gates available as independent rollback controls.

An approved administrator performs enrollment as a one-row update scoped to the exact contractor UUID, verifies exactly one affected row, and reads back the same exact UUID plus boolean. Removal repeats the same operation with `false`. Do not use email selection, wildcard predicates, a bulk update, or a cohort-management UI. The platform-admin-only billing update policy remains the enrollment authority; the browser entitlement RPC grants no table mutation.

Sandbox validation matrix after separate approval:

- entitled owner, Job-only member, and viewer;
- non-entitled owner, Job-only member, and viewer;
- connected and unconnected homeowner;
- platform admin without ordinary contractor owner/team context;
- all global gates off, all three on, a partial-gate combination, and Demo Presentation;
- neutral loading, RPC error, tenant/session switch, focus/visibility refresh, and direct durable-target restoration;
- capability separation for Draft persistence, Estimate launch, and Job launch;
- legacy Jobs fallback with zero durable controls for every non-entitled or unresolved state.

Completed Sandbox validation: the staged matrix passed with one temporary exact-UUID target enrollment, all non-target billing rows false, role/capability separation intact, one private Draft and one unsent Estimate, homeowner and comparison-tenant isolation, stale session/context rejection, direct-entry normalization, and zero Production requests. Exact runtime fixtures were cleaned, the target entitlement was restored false, all billing rows ended false, the three branch-scoped gates were removed, and the final gates-off Preview returned to legacy Jobs. This evidence does not authorize Production SQL, Production enrollment, Production gates, Production smoke, or external beta.

Do not treat source merge, cohort SQL application, tenant enrollment, global-gate enablement, or Preview validation as interchangeable approvals. Structured privacy-safe telemetry remains required before external beta. Telemetry must not contain private Draft notes, item descriptions, pricing, customer contact data, property details, service-request content, credentials, or raw identifiers beyond an explicitly reviewed minimum.

## Fresh Environment Rebuild Expectations

A fresh environment rebuild should be possible from repository files plus documented secrets/settings.

Minimum rebuild checklist:

- Start from a clean Supabase project.
- Apply the approved active SQL sequence only.
- Configure required buckets and policies through approved SQL/settings.
- Deploy required Edge Functions with secrets managed outside the repo.
- Configure Vercel with only browser-safe public variables.
- Seed or create approved sandbox/test accounts outside Git.
- Run catalog checks, smoke tests, RLS/privacy tests, and storage/media tests.
- Document any manual step that is not yet encoded in SQL, script, or runbook.

## Production Smoke Account Policy

Authenticated production smoke is read-only only and must use dedicated approved production smoke accounts. Required homeowner and contractor owner read-only smoke is configured for local operator use and has passed; optional role-specific and record-specific smoke remains future/not configured.

Before using production smoke accounts:

- Create dedicated smoke accounts only after explicit approval.
- Store credentials outside the repo and outside chat output.
- Do not use founder, personal, or real customer accounts for automated smoke.
- Document environment variable names only; never document, commit, print, screenshot, or paste credential values.
- Define allowed actions before use.
- Default authenticated production smoke to read-only navigation.
- Require separate explicit approval before any production smoke action creates, sends, approves, invoices, deletes, edits, or otherwise mutates records.
- Use clear smoke/test prefixes for any created records.
- Prefer read-only smoke where possible.
- Clean up any approved production smoke records only through exact-ID or approved-prefix scoped cleanup, and report cleanup counts.
- Never create users, modify production records, or run mutating production smoke without explicit approval.

Suggested environment variable names may be documented for local operator setup, for example `PROD_SMOKE_HOMEOWNER_EMAIL`, `PROD_SMOKE_HOMEOWNER_PASSWORD`, `PROD_SMOKE_CONTRACTOR_OWNER_EMAIL`, and `PROD_SMOKE_CONTRACTOR_OWNER_PASSWORD`. Values belong only in local ignored files or an approved password manager.

Production smoke credential readiness can be checked locally without printing secrets:

```bash
npm run qa:production-smoke:check
```

The readiness check loads only `process.env`, `.env`, `.env.local`, and `.env.test.local`; reports variable names as `present` or `missing`; and does not sign in, call Supabase Auth, call the Supabase database, contact production, or validate credentials. It is a presence-only check. Passing the check does not approve authenticated production smoke.

The dedicated authenticated production smoke scaffold is read-only and requires the production URL plus approved smoke credentials before browser actions:

```bash
TEST_APP_URL=https://servsync.app npm run qa:e2e:production-auth-readonly-smoke
```

This command first runs the no-secret preflight with `--auth-readonly --strict`, then runs only `tests/e2e/production-auth-readonly-smoke.spec.ts`. It must not be used until dedicated production smoke accounts and allowed read-only actions are separately approved.

Latest readiness evidence as of 2026-07-02: the required homeowner and contractor owner production smoke credential names were present locally without printing values, preflight passed, and `TEST_APP_URL=https://servsync.app npm run qa:e2e:production-auth-readonly-smoke` passed 2/2 read-only sign-in/navigation tests. Optional role credentials and optional stable smoke record IDs remain missing/not configured. This does not approve mutation smoke, production data changes, SQL, settings changes, user creation, or manual deploys.

Required production smoke credential names:

- `PROD_SMOKE_HOMEOWNER_EMAIL`
- `PROD_SMOKE_HOMEOWNER_PASSWORD`
- `PROD_SMOKE_CONTRACTOR_OWNER_EMAIL`
- `PROD_SMOKE_CONTRACTOR_OWNER_PASSWORD`

Optional role-specific credential names:

- `PROD_SMOKE_CONTRACTOR_FIELD_TECH_EMAIL`
- `PROD_SMOKE_CONTRACTOR_FIELD_TECH_PASSWORD`
- `PROD_SMOKE_CONTRACTOR_VIEWER_EMAIL`
- `PROD_SMOKE_CONTRACTOR_VIEWER_PASSWORD`

Optional stable smoke record ID names:

- `PROD_SMOKE_CONNECTION_ID`
- `PROD_SMOKE_HOME_ID`
- `PROD_SMOKE_SHARED_PROPERTY_ID`
- `PROD_SMOKE_LOCAL_CONTACT_ID`
- `PROD_SMOKE_LOCAL_HOME_ID`
- `PROD_SMOKE_PROPERTY_PROPOSAL_ID`
- `PROD_SMOKE_SERVICE_REQUEST_ID`
- `PROD_SMOKE_INSPECTION_ID`
- `PROD_SMOKE_ESTIMATE_ID`
- `PROD_SMOKE_INVOICE_ID`

Treat stable smoke record IDs as sensitive operational config. Do not put credential values or real record IDs in docs, repo files, chat, reports, logs, screenshots, videos, traces, or Playwright artifacts. Ignored/local credential files must not be printed or pasted into reports or PRs. If a local terminal session, report, or screen recording may have exposed smoke or load-test credentials, rotate those credentials before relying on them again.

## Production Public Smoke Policy

Unauthenticated production public smoke is allowed as a read-only beta-readiness signal when the task explicitly scopes it that way.

Allowed public smoke checks:

- Load `https://servsync.app`.
- Check stable public, auth, legal, and trust routes.
- Confirm HTTP/navigation success, rendered public content, browser title, and console/page errors.
- Run `TEST_APP_URL=https://servsync.app npm run qa:e2e:production-public-smoke`.

Forbidden during public smoke:

- Sign in.
- Create users.
- Create, edit, send, approve, delete, invoice, upload, or otherwise mutate production records or files.
- Apply SQL, change Supabase settings, change storage settings, modify Vercel settings, or deploy manually.
- Use personal, founder, beta-user, sandbox, or non-smoke credentials.

## Retention, Export, Deletion, And Cancellation Decisions

These items require policy decisions before broad implementation.

Policy decisions needed:

- Account cancellation flow for homeowners.
- Account cancellation flow for contractors.
- Subscription cancellation language and payment-provider handoff.
- Homeowner data export scope and format.
- Contractor data export scope and format.
- Home document/file retention after deletion or cancellation.
- Service request media retention.
- Inspection/report media retention.
- Invoice, estimate, report, and Home History retention.
- Legal hold or dispute retention expectations.
- Deletion SLA and support workflow.
- Whether soft-delete, hard-delete, or anonymization applies by record type.

Implementation should wait until these decisions are approved.

## Approval Gates

The following require explicit approval before work begins:

- SQL/schema changes.
- RLS, RPC, trigger, policy, or grant changes.
- Storage bucket or storage policy changes.
- Supabase settings or secrets changes.
- Vercel settings or environment-variable changes.
- Edge Function behavior, secret, or deployment changes.
- Production data access beyond approved read-only status checks.
- User creation, deletion, or record modification.
- Production smoke accounts or mutating production smoke.
- Manual production deploys.

Docs-only and sandbox-gated read-only catalog checks may proceed when explicitly scoped as docs/test-only work.

## Policy-Only Vs Implementation-Ready

Policy-only for now:

- Retention/export/deletion/cancellation decisions.
- Production smoke account policy details.
- Backup frequency, restore ownership, and restore drill cadence.
- Immutable record retention and dispute handling rules.

Implementation-ready after approval:

- Sandbox-only read-only catalog verification checks.
- Documentation pointers from beta/go-live docs.
- Applied-SQL ledger, production SQL rollout, restore drill, and storage backup/readiness templates.
- Test-only additions that do not mutate app records.

Requires later SQL/Supabase/storage approval:

- RLS/grant hardening.
- RPC permission changes.
- Storage policy changes.
- Storage object backup automation.
- Orphan-object cleanup automation.
- Immutable/auditable record schema changes.

## Read-Only Catalog Verification

Run the sandbox catalog check when the Supabase CLI is authenticated and linked to the sandbox project `zpzdkoaubyjtsomccxya`:

```bash
TEST_APP_URL=http://localhost:5173 npx playwright test tests/e2e/security-catalog.spec.ts --project=chromium
```

The check is read-only. It verifies selected deployed-state expectations for:

- RLS on core private tables.
- Selected high-risk RPCs using `SECURITY DEFINER`.
- Selected high-risk RPCs using `search_path=public`.
- No `PUBLIC` or `anon` execute access on selected high-risk RPCs.
- Expected authenticated execute access on selected high-risk RPCs.
- Core storage bucket existence and public/private flags.

The check fails closed if the local Supabase CLI link is not the approved sandbox project.
