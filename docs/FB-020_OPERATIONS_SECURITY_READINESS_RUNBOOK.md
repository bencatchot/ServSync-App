# FB-020 Operations And Security Readiness Runbook

Status: baseline runbook for controlled beta and public go-live readiness.

This runbook is part of FB-020: Security, Records Reliability, Backup/Restore, Storage, and Scale Readiness. It documents the process ServSync should follow before broad beta expansion, public launch, or paid contractor subscriptions.

This document is not approval to change production, apply SQL, modify RLS/storage policies, create users, or run production smoke tests. Those remain separate approval gates.

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

Controlled beta may proceed with a lighter process only if the beta risk is accepted and the missing restore evidence is tracked as an FB-020 follow-up.

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

## Restore Drill Process

A restore drill should prove that the app can recover records and files into a fresh non-production environment.

Drill checklist:

- Confirm the source backup/export and target project.
- Restore database schema and data into a non-production project.
- Restore or rehydrate representative storage objects.
- Apply the approved SQL sequence or migration set needed for current app behavior.
- Verify core tables, RLS, high-risk RPCs, and storage buckets with read-only catalog checks.
- Run homeowner smoke, contractor smoke, full core loop, RLS/privacy, storage/media, and any affected workflow tests.
- Confirm no production settings, secrets, users, or customer data are altered during the drill.
- Record the date, source, target, commit, SQL ledger version, storage restore result, tests run, and gaps found.

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

Authenticated production smoke is skipped unless production smoke accounts are separately approved.

Before using production smoke accounts:

- Create dedicated smoke accounts only after explicit approval.
- Store credentials outside the repo and outside chat output.
- Do not use founder, personal, or real customer accounts for automated smoke.
- Define allowed actions before use.
- Use clear smoke/test prefixes for any created records.
- Prefer read-only smoke where possible.
- Clean up any approved production smoke records and report cleanup counts.
- Never create users, modify production records, or run mutating production smoke without explicit approval.

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
- Applied-SQL ledger template.
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

