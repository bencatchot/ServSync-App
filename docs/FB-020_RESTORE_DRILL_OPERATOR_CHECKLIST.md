# FB-020 Non-Production Restore Drill Operator Checklist

Status: operator checklist only.

This checklist helps an operator prepare for a future approved non-production restore drill. It does not complete a restore drill, verify backup/PITR readiness, verify storage restore readiness, apply SQL, run Supabase CLI commands, change Supabase settings, change storage settings, touch production data, touch storage objects, create users, or deploy.

Actual restore drill execution requires separate explicit approval.

## 1. Purpose

Use this checklist as the final go/no-go aid after reviewing `docs/FB-020_RESTORE_DRILL_PREFLIGHT_PLAN.md` and before any future approved non-production restore drill begins.

The checklist is designed to confirm approvals, environment boundaries, source-data rules, artifact handling, evidence capture, cleanup, signoff, and stop conditions.

## 2. Non-Goals

- No restore drill execution.
- No backup commands.
- No restore commands.
- No SQL application.
- No Supabase CLI commands.
- No Supabase settings changes.
- No storage settings changes.
- No production data access.
- No storage bucket access.
- No user creation.
- No deploy.
- No proof that backup/PITR or storage restore readiness is complete.

## 3. Required Approvals

- [ ] Owner approval recorded.
- [ ] Approved source environment recorded.
- [ ] Approved target throwaway or sandbox environment recorded.
- [ ] Approved backup/export source recorded.
- [ ] Approved data handling rules recorded.
- [ ] Approved evidence capture location recorded.
- [ ] Approved cleanup plan recorded.
- [ ] Approved operator list recorded.
- [ ] Stop criteria reviewed with the operator and approver.

Do not proceed if any approval is missing or ambiguous.

## 4. Required Branch/Repo State

- [ ] Current branch/commit recorded for the drill evidence.
- [ ] Working tree state reviewed before any future drill command.
- [ ] No generated backup, restore, export, query-output, storage-export, or ops artifacts are staged.
- [ ] No `.env*`, credential, screenshot, trace, video, report, dump, restore output, or private ops file is staged.
- [ ] Repository-tracked evidence will be sanitized before any commit.
- [ ] Real filled operational evidence will stay in an approved private location unless intentionally sanitized.

## 5. Target Environment Confirmation

- [ ] Target is an isolated throwaway or approved sandbox environment only.
- [ ] Target is not production.
- [ ] Target is not publicly exposed.
- [ ] Target has no production write access.
- [ ] Target can be cleaned up after the drill.
- [ ] Target ref/name is recorded only if safe for the approved evidence location.
- [ ] Target owner and cleanup deadline are recorded.

Stop if the target cannot be isolated or safely cleaned up.

## 6. Source Backup/Export Confirmation

- [ ] Backup/export source is identified.
- [ ] Backup/export source is approved for this drill.
- [ ] Scope is recorded: database only, storage only, or both.
- [ ] Prefer synthetic, sanitized, or minimal representative data.
- [ ] Real customer data will not be copied unless separately approved and protected.
- [ ] No uncontrolled environments are involved.
- [ ] Backup/export handling will not expose secrets or private data in logs, screenshots, traces, PR comments, or docs.

## 7. Data Sensitivity Confirmation

- [ ] No customer names in repo docs or PR comments.
- [ ] No customer emails in repo docs or PR comments.
- [ ] No customer addresses in repo docs or PR comments.
- [ ] No customer phone numbers in repo docs or PR comments.
- [ ] No message content in repo docs or PR comments.
- [ ] No private media in repo docs or PR comments.
- [ ] No signed URLs in repo docs or PR comments.
- [ ] No sensitive record IDs in repo docs or PR comments.
- [ ] No raw production query output in repo docs or PR comments.
- [ ] No production storage object path lists in repo docs or PR comments.

Evidence should use high-level, sanitized summaries.

## 8. Artifact Handling Confirmation

Slice 1G `.gitignore` guardrails reduce accidental commits for common generated artifacts, but `.gitignore` is not a substitute for operator review.

- [ ] Generated backup artifacts remain local/private.
- [ ] Generated restore artifacts remain local/private.
- [ ] Generated export artifacts remain local/private.
- [ ] Generated query-output artifacts remain local/private.
- [ ] Generated storage-export artifacts remain local/private.
- [ ] Local ops notes remain local/private unless sanitized and approved.
- [ ] No dumps are committed.
- [ ] No restore logs are committed.
- [ ] No signed URL lists are committed.
- [ ] No object path lists are committed.
- [ ] No raw production query output is committed.
- [ ] No backup paths are committed.
- [ ] No private operational notes are committed.

Review staged files manually before every commit after a future drill.

## 9. Database Restore Readiness Checklist

Prepare placeholders before execution:

- [ ] Backup source identified.
- [ ] Restore method approved.
- [ ] Schema verification approach defined.
- [ ] Representative table verification approach defined.
- [ ] RPC/function verification approach defined.
- [ ] RLS verification approach defined.
- [ ] Applied SQL ledger or sequence reference identified, if applicable.
- [ ] Cleanup method defined.
- [ ] Database restore evidence location approved.

Do not run database backup, restore, or SQL commands without separate explicit approval.

## 10. Storage Restore Readiness Checklist

Prepare placeholders before execution:

- [ ] Storage is in scope: yes/no.
- [ ] Approved bucket list recorded, if storage is in scope.
- [ ] Public/private bucket classification recorded.
- [ ] Object metadata handling approach defined.
- [ ] Private media handling approach defined.
- [ ] Signed URL behavior verified by plan only, without storing signed URLs.
- [ ] Storage cleanup method defined.
- [ ] Storage verification method defined.
- [ ] Storage restore evidence location approved.

Do not access storage buckets or restore storage objects without separate explicit approval.

## 11. Edge Function/Env/Secrets Readiness Checklist

Use names only. Never record secret values.

- [ ] Edge Function names listed, if applicable.
- [ ] Required environment variable names listed.
- [ ] Required secret names listed.
- [ ] Function deployment/config verification approach defined.
- [ ] Known disabled or intentionally missing functions documented.
- [ ] No secret values in repo files.
- [ ] No secret values in docs.
- [ ] No secret values in logs.
- [ ] No secret values in screenshots, traces, videos, or PR comments.

## 12. Verification Checklist

Prepare future verification steps for:

- [ ] Schema/table presence.
- [ ] Representative table sanity without raw sensitive data capture.
- [ ] Key RPC/function presence.
- [ ] SECURITY DEFINER/search path sanity for high-risk RPCs.
- [ ] RLS enabled on private tables.
- [ ] Expected role access behavior.
- [ ] Storage bucket policy assumptions, if storage is in scope.
- [ ] Edge Function deployment/config checklist by names only.
- [ ] Cleanup confirmation.

Only run verification during a separately approved drill.

## 13. RLS/Security Checklist

Prepare future checks for:

- [ ] Homeowner access limited to eligible homeowner records.
- [ ] Contractor access limited to eligible contractor-owned records.
- [ ] Field tech/viewer behavior follows expected permissions.
- [ ] Unrelated users cannot read private records.
- [ ] Browser-callable RPC grants match expected authenticated roles.
- [ ] Internal-only RPCs remain unavailable to ordinary clients.
- [ ] Private storage policies remain private, if storage is in scope.
- [ ] Public buckets contain only intended public assets, if storage is in scope.

## 14. Smoke Checklist

Choose only checks approved for the restored target:

- [ ] Public app smoke, if the target has an app URL.
- [ ] Sandbox homeowner navigation smoke, if approved accounts exist.
- [ ] Sandbox contractor navigation smoke, if approved accounts exist.
- [ ] Core request -> estimate -> job -> invoice visibility smoke, if target data supports it.
- [ ] Storage/media visibility smoke, if storage restore is in scope.
- [ ] No user creation unless separately approved.
- [ ] No record mutation unless separately approved.

## 15. Evidence Capture Checklist

Use `docs/FB-020_BACKUP_RESTORE_LEDGER_TEMPLATES.md` for sanitized evidence formats.

- [ ] Approved scope recorded.
- [ ] Source and target labels recorded.
- [ ] Commit/reference recorded.
- [ ] Verification checklist summary recorded.
- [ ] Failures or gaps recorded.
- [ ] Cleanup confirmation recorded.
- [ ] Owner/signoff recorded.
- [ ] Filled evidence remains private unless intentionally sanitized.
- [ ] No raw terminal output with sensitive data is committed.
- [ ] No secrets, customer data, signed URLs, private object paths, raw production query output, or sensitive record IDs are committed.

## 16. Stop Conditions

Stop before or during a future drill if:

- [ ] Any required approval is missing.
- [ ] Target environment is not isolated.
- [ ] Target environment is production.
- [ ] Target has production write access.
- [ ] Source data handling rules are unclear.
- [ ] Real customer data would be copied without separate approval.
- [ ] Secrets or credentials would be printed or stored unsafely.
- [ ] Storage access would exceed approved scope.
- [ ] Backup/export artifacts cannot be kept local/private.
- [ ] Cleanup cannot be completed or verified.
- [ ] Evidence cannot be captured safely.

## 17. Cleanup Checklist

- [ ] Cleanup owner assigned.
- [ ] Cleanup deadline recorded.
- [ ] Database cleanup method recorded, if database restore is in scope.
- [ ] Storage cleanup method recorded, if storage restore is in scope.
- [ ] Restored target data destroyed or retained only as approved.
- [ ] Generated artifacts deleted or retained only in approved private location.
- [ ] Repo checked for accidental private artifacts.
- [ ] Cleanup confirmation recorded in private or sanitized evidence.

## 18. Final Go/No-Go Signoff

Do not begin a future restore drill until this section is complete.

```text
Drill owner:
Approver:
Source environment:
Target environment:
Scope:
Evidence location:
Cleanup owner:
Cleanup deadline:
Known risks:
Go/no-go decision:
Approval reference:
```

## 19. Post-Drill Follow-Up Placeholders

Use only after a future drill is separately approved and executed.

```text
Drill completed: yes/no
Backup/PITR verified: yes/no
Storage restore verified: yes/no
Critical gaps:
Follow-up owners:
Cleanup completed:
Evidence sanitized:
Next recommended drill:
```

Until a future drill is executed, these placeholders remain unverified.
