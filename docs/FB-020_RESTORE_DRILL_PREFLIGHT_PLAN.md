# FB-020 Non-Production Restore Drill Preflight Plan

Status: preflight plan only.

This document prepares ServSync for a future approved non-production restore drill. It does not complete a restore drill, verify backup/PITR readiness, verify storage restore readiness, apply SQL, run Supabase CLI commands, change Supabase settings, change storage settings, touch production data, touch storage objects, create users, or deploy.

Actual restore drill execution requires separate explicit approval.

Use `docs/FB-020_RESTORE_DRILL_OPERATOR_CHECKLIST.md` as the final go/no-go aid before any future approved drill. The operator checklist does not execute the drill and does not replace the separate approval gate.

## 1. Purpose

Define the approvals, environment controls, data rules, verification plan, artifact handling, cleanup, and evidence capture needed before any non-production restore drill begins.

The goal is to make the eventual drill safer and easier to review without running the drill in this slice.

## 2. Scope And Non-Goals

In scope:

- Planning for a future non-production restore drill.
- Identifying approval gates and target-environment rules.
- Defining safe evidence capture and artifact handling.
- Listing verification areas to prepare before execution.

Non-goals:

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

## 3. Required Approvals Before Any Drill

Before any restore drill, record explicit approval for:

- Owner approval for the drill.
- Approved source environment.
- Approved target throwaway or sandbox environment.
- Approved backup/export source.
- Approved data handling rules.
- Approved cleanup plan.
- Approved evidence capture location.
- Approved operator list.
- Approved stop criteria.

Approval must be specific to the drill. General FB-020 roadmap language is not enough.

## 4. Required Target Environment

The target must be an isolated throwaway environment or an approved sandbox environment.

Target requirements:

- No uncontrolled environments.
- No public exposure.
- No production write access.
- No real customer data copied unless specifically approved and protected.
- No production credentials or service role keys stored in repo files, docs, logs, screenshots, traces, or PR comments.
- Clear owner and cleanup deadline before the drill starts.

If the target cannot be isolated, stop before running the drill.

## 5. Source Data Rules

Prefer synthetic, sanitized, or minimal representative data.

Rules:

- Do not copy real customer data to uncontrolled environments.
- Do not export or store customer names, emails, addresses, phone numbers, message content, private media, signed URLs, or sensitive record IDs in repo docs or PR comments.
- Production data requires separate explicit approval and protection before use.
- If real production-derived data is approved, document only sanitized evidence in repo-trackable files.
- Prefer high-level summaries such as "representative invoice records restored" instead of raw query output or record lists.

## 6. Data Sensitivity And Redaction Rules

Do not store:

- Credentials.
- Service role keys.
- Database URLs.
- Access tokens.
- Signed URLs.
- Raw backup paths.
- Customer names, emails, addresses, phone numbers, or message content.
- Raw production query output.
- Sensitive record IDs.
- Production storage object path lists.
- Private operational notes.

Allowed when sanitized:

- Drill date.
- Environment label.
- PR, branch, or commit reference.
- SQL file names, if relevant to the approved drill plan.
- High-level verification status.
- Redacted failure categories.
- Owner/signoff names when appropriate for the operational record.

## 7. Backup Source Eligibility Checklist

Before execution, confirm:

- Source environment is approved.
- Backup/export source is approved.
- Backup/export source is current enough for the drill goal.
- Backup/export source does not require uncontrolled handling of real customer data.
- Backup/export source can be used without exposing secrets in logs, docs, screenshots, traces, or PR comments.
- The drill owner knows whether the drill covers database only, storage only, or both.
- The approved evidence location is ready before the drill starts.

## 8. Database Restore Preflight Checklist

Before execution, prepare checks for:

- Schema/table presence.
- Critical table row-shape sanity without raw data capture.
- Key RPC/function presence.
- SECURITY DEFINER/search path sanity for high-risk RPCs.
- RLS enabled on private tables.
- Browser-callable RPC grants matching expectations.
- Internal-only RPCs remaining unavailable to ordinary clients.
- Applied SQL ledger reference for the restored environment.
- Known intentional gaps or deferred SQL patches.

This checklist prepares future verification. It does not run database restore commands in this slice.

## 9. Storage Restore Preflight Checklist

Before execution, prepare checks for:

- Expected bucket list.
- Public/private bucket classification.
- Storage object policy assumptions.
- Private media access boundaries.
- Public media behavior for public buckets.
- Metadata needed to reconnect objects to app records.
- Orphan-object review approach.
- Signed URL behavior without storing signed URLs.
- Storage restore evidence location outside the repo.

This checklist prepares future verification. It does not access buckets or restore storage objects in this slice.

## 10. Edge Function/Env/Secrets Preflight Checklist

Before execution, prepare a checklist by names only:

- Edge Function names expected for the target environment.
- Required environment variable names.
- Required secret names.
- Deployment/configuration owner.
- Known missing or intentionally disabled functions.
- Verification method that does not print secret values.

Secret values must never be stored in repo files, docs, chat, logs, screenshots, traces, or PR comments.

## 11. Verification Plan

Prepare representative future checks for:

- Schema/table presence.
- Key RPC/function presence.
- RLS policy sanity.
- Expected homeowner access behavior.
- Expected contractor owner/admin/office access behavior.
- Expected field tech/viewer access behavior.
- Unrelated user denial behavior.
- Storage bucket policy assumptions.
- Edge Function deployment/config checklist by secret names only.
- Public app smoke or sandbox smoke as applicable.
- Cleanup confirmation.

Only run these checks during a separately approved drill.

## 12. RLS/Security Verification Plan

Before execution, identify which read-only catalog or sandbox-safe checks should confirm:

- Private tables have RLS enabled.
- High-risk RPC execute grants match expected browser/internal roles.
- Storage policies exist for private media buckets.
- Public buckets contain only intended public assets.
- Homeowner records are not visible to unrelated homeowners.
- Contractor-owned records are not visible to unrelated contractors.
- Team role boundaries still match expected permissions.

Do not use production accounts or production data unless a separate approval explicitly allows it.

## 13. Smoke Test Plan

Before execution, decide which smoke checks apply to the restored target:

- Public app smoke, if the target has an app URL.
- Sandbox homeowner navigation smoke, if approved accounts exist.
- Sandbox contractor navigation smoke, if approved accounts exist.
- Core request -> estimate -> job -> invoice visibility smoke, if the target data supports it.
- Storage/media visibility smoke, if storage restore is in scope.

Do not create users or mutate records unless the future drill approval explicitly allows those actions.

## 14. Artifact Handling Rules

Slice 1G added `.gitignore` guardrails for common local generated backup, restore, export, query-output, storage-export, and ops artifacts.

Rules:

- Generated backup, restore, export, query-output, storage-export, and local ops artifacts must remain local/private.
- `.gitignore` reduces accidental commits but does not replace operator review.
- Do not commit dumps.
- Do not commit restore logs.
- Do not commit signed URL lists.
- Do not commit storage object path lists.
- Do not commit raw production query output.
- Do not commit backup paths.
- Do not commit private operational notes.

Before any commit after a drill, review staged files and changed files manually.

## 15. Cleanup Plan

Before execution, define:

- Target environment cleanup owner.
- Cleanup deadline.
- Exact resources to delete or reset.
- Whether restored database data will be destroyed or retained temporarily.
- Whether restored storage objects will be destroyed or retained temporarily.
- Where approved retained evidence will live.
- Confirmation that no repo-tracked files contain private artifacts.

Cleanup must be recorded before the drill is considered complete.

## 16. Evidence Capture Plan

Use `docs/FB-020_BACKUP_RESTORE_LEDGER_TEMPLATES.md` for sanitized evidence formats.

Evidence should include:

- Approved scope.
- Source and target labels.
- Commit/reference.
- Verification checklist summary.
- Failures or gaps.
- Cleanup confirmation.
- Owner/signoff.

Filled evidence should remain private unless sanitized. Do not paste raw terminal output, raw production query output, secrets, customer data, signed URLs, private object paths, or sensitive record IDs into repo files, PR comments, screenshots, traces, logs, or chat.

## 17. Stop/Rollback Criteria

Stop before or during a future drill if:

- The target is not isolated.
- The source or backup/export source is not approved.
- Required data handling rules are unclear.
- Secrets or credentials would be printed or stored unsafely.
- Production data would be copied without explicit approval.
- Production write access would be needed.
- Storage access would exceed the approved scope.
- Cleanup cannot be completed or verified.
- Evidence cannot be captured safely.

Rollback/mitigation should be defined before the drill begins, including who can approve target cleanup or target destruction.

## 18. Owner/Signoff Checklist

Before the drill:

- [ ] Owner assigned.
- [ ] Approver assigned.
- [ ] Source environment approved.
- [ ] Target environment approved.
- [ ] Data handling rules approved.
- [ ] Cleanup plan approved.
- [ ] Evidence location approved.
- [ ] Stop criteria reviewed.

After the drill, when separately approved and executed:

- [ ] Verification completed.
- [ ] Gaps recorded.
- [ ] Cleanup completed.
- [ ] Evidence sanitized.
- [ ] Owner signed off.
- [ ] Follow-up work identified.

## 19. Open Gaps That Remain Until Actual Drill

This slice leaves the following unverified:

- Actual restore drill execution.
- Backup/PITR capability and restore behavior.
- Storage object restore behavior.
- Edge Function/env/secrets restore behavior.
- End-to-end app behavior in a restored target.
- Cleanup effectiveness after a real drill.
- Whether filled operational evidence can be safely sanitized for repo tracking.

These remain future separately approved FB-020 work.
