# FB-020 Backup, Restore, And SQL Ledger Templates

Status: template-only, safe for repo tracking when blank or sanitized.

These templates support FB-020 backup/restore readiness, applied-SQL evidence, and storage-readiness planning. They are not proof that a restore drill has been completed, not a live operational ledger, and not approval to apply SQL, run backups, run restores, change Supabase or storage settings, touch production data, create users, or deploy.

Real filled operational ledgers should live in a private approved ops location unless they are intentionally sanitized for repo tracking.

## Purpose

Use these templates to capture sanitized readiness evidence for:

- Applied SQL by environment.
- Approval-gated production SQL rollouts.
- Non-production restore drill results.
- Storage-object backup/readiness planning.
- Edge Function and environment/secret restore readiness.

Prefer PR numbers, commit hashes, sanitized summaries, and high-level verification results. Do not paste raw terminal output if it includes sensitive data.

## Sensitivity Rules

Generated backup, restore, export, query-output, storage-export, and local ops artifacts must remain local/private and must never be committed. Slice 1G `.gitignore` patterns reduce accidental commits, but they are not a substitute for operator review. Do not store credentials, service role keys, database URLs, access tokens, signed URLs, raw backup paths, customer names/emails/addresses/phone numbers, message content, raw production query output, sensitive record IDs, or production storage object path lists in repo files, docs, logs, screenshots, traces, or PR comments.

Do not store:

- Credentials.
- Service role keys.
- Database URLs.
- Access tokens.
- Customer names, emails, addresses, phone numbers, or message content.
- Raw backup file paths.
- Signed URLs or private storage URLs.
- Raw production query output.
- Secret values.
- Private storage object paths.
- Production storage object path lists.
- Sensitive record IDs, unless explicitly approved and sanitized.

Allowed when sanitized:

- SQL file names.
- Git branches.
- Commit hashes.
- PR or task references.
- High-level catalog results, such as "RLS enabled" or "grant removed".
- Environment labels, such as sandbox, production, or throwaway.
- Supabase project refs only when intentionally approved for the operational record.

## Applied SQL Ledger Template

Copy this entry for each SQL patch application. Keep it sanitized.

```text
Entry date/time:
Environment: sandbox / production / throwaway
Supabase project ref, if safe to record:
Linked ref before:
Linked ref after:
SQL file applied:
Git branch:
Commit reviewed:
PR/reference:
Reason/change summary:
Applied by:
Approval reference:

Pre-apply checks:
- Branch/commit confirmed:
- Working tree clean:
- Target ref confirmed:
- Vercel/check status, if relevant:
- Pre-apply catalog summary:
- Protected-scope confirmation:

Apply command shape, without secrets:
- Example: SUPABASE_TELEMETRY_DISABLED=1 supabase db query --linked --file <approved-sql-file>

Post-apply verification:
- Catalog checks:
- App/smoke checks:
- Final linked ref:

Rollback/mitigation notes:

Production data touched: yes/no
Settings changed: yes/no
Storage changed: yes/no
Deploy performed: yes/no
Final status:
Warnings/blockers:
```

## Production SQL Rollout Capture Template

Use this only after production SQL application is separately approved.

```text
Rollout date/time:
Approved scope:
Expected production Supabase ref:
Starting linked ref:
Branch:
Commit:
Vercel/check status before apply:
SQL file:
Reviewed commit/hash reference:
Approval reference:

Pre-apply catalog captures:
- Functions:
- Tables/policies:
- Grants:
- Storage, if applicable:

Exact approved command shape, without secrets:

Post-apply verification:
- Function confirmation:
- Table confirmation:
- Policy confirmation:
- Storage confirmation, if applicable:
- Grant confirmation, if applicable:
- No unrelated schema changes observed:

Production data mutation confirmation:
- Created records:
- Updated records:
- Deleted records:
- Mutating probes run:

Deploy/settings/storage change confirmation:
- Manual deploy performed:
- Supabase settings changed:
- Storage settings changed:
- Vercel settings changed:

Final linked ref:
Smoke result:
Warnings/blockers:
Operator/signoff:
```

## Non-Production Restore Drill Result Template

Use this only for an approved sandbox or throwaway restore drill. Do not run restore drills against production unless an incident response plan explicitly approves it.

Before completing this result template, review `docs/FB-020_RESTORE_DRILL_PREFLIGHT_PLAN.md` and confirm the drill had separate explicit approval. The preflight plan is planning-only and does not itself prove backup/PITR readiness, storage restore readiness, SQL application, Supabase settings changes, production data access, or storage access.

Also review `docs/FB-020_RESTORE_DRILL_OPERATOR_CHECKLIST.md` before completing this result template. The checklist is an operator aid only; it does not execute a restore drill or verify backup/PITR/storage restore readiness.

```text
Drill date:
Owner:
Approver:
Source environment:
Target throwaway/sandbox environment:
Scope: database only / storage only / both
Backup source type:
Restore method:
Repo commit:
SQL sequence/ledger reference:

Representative verification checks:
- Tables checked:
- Functions/RPCs checked:
- Buckets checked:
- RLS checks:
- Storage policy checks:
- Smoke checks:
- Workflow checks:

Edge Function/env/secrets notes by name only:
- Function names:
- Required env/secret names:
- Deployment or restore gaps:

Data sensitivity notes:
- Customer data handling:
- Backup artifact handling:
- Private file handling:

Failures/gaps:
Cleanup steps:
Cleanup confirmation:
Owner/signoff:
Next drill due date:
```

## Storage Backup/Readiness Worksheet

Use one row per bucket. Backup/export and restore methods must be approved later before execution.

| Bucket | Public/private | Business purpose | Data sensitivity | Backup/export owner | Backup/export method to approve later | Restore method to approve later | Metadata needed to reconnect objects | Signed URL behavior | Orphan-object cleanup plan | Compression/egress notes | Final/legal PDF snapshot notes | Restore verification approach | Known gaps |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `home-documents` | Private | Homeowner documents and files | High | TBD | TBD | TBD | Home/property/document metadata | Private signed URL only | TBD | TBD | Store only needed final snapshots | Catalog plus app read check in non-prod | TBD |
| `service-request-media` | Private | Service request attachments/media | High | TBD | TBD | TBD | Request/media owner metadata | Private signed URL only | TBD | TBD | Avoid duplicate draft media | Catalog plus request media check in non-prod | TBD |
| `inspection-media` | Private | Job/inspection photos and media | High | TBD | TBD | TBD | Inspection/job/media metadata | Private signed URL only | TBD | TBD | Compress/resize where practical | Catalog plus job media check in non-prod | TBD |
| `support-attachments` | Private | Support inquiry attachments | High | TBD | TBD | TBD | Inquiry/participant metadata | Private signed URL only | TBD | TBD | Keep support attachment retention explicit | Catalog plus support attachment check in non-prod | TBD |
| `contractor-assets` | Public | Contractor logos/profile assets | Medium | TBD | TBD | TBD | Contractor/profile asset metadata | Public object access | TBD | Monitor egress | Public assets only | Catalog plus public asset check in non-prod | TBD |
| `discover-media` | Public | Discover/public contractor media | Medium | TBD | TBD | TBD | Post/media metadata | Public object access | TBD | Compress/resize and monitor egress | Public showcase media only | Catalog plus Discover media check in non-prod | TBD |

## Storage Restore Verification Evidence Template

Use this only after a future storage restore verification has separate approval. This template is not approval to download storage objects, run restores, create backup artifacts, change storage policies, touch production data, print secrets, or expose private customer data.

Do not include real secrets, signed URLs, private object contents, raw backup paths, customer names, customer addresses, customer emails, customer phone numbers, raw production query output, private object paths, or object paths containing private identifiers.

```text
Verification title:
Date/time:
Operator:
Approval reference:
Source project/ref, redacted if needed:
Restore target project/ref:
Environment boundaries confirmed:
- Production targeted: yes/no
- Non-production restore target used: yes/no
- Storage/provider settings changed: yes/no

Buckets reviewed:
- Bucket:
  Public/private:
  Business purpose:
  Sample included: yes/no
  Notes:

Object sample strategy:
- Approved fixture objects / sanitized representative objects / count-only inventory / other:
- Sample size summary:
- Private object path exposure avoided: yes/no
- Customer-identifying path/value exposure avoided: yes/no

Object count/hash/checksum approach, if used:
- Count method:
- Hash/checksum method:
- Raw hashes safe to record here: yes/no
- Privacy review completed: yes/no

Restore action summary:
- Restore method:
- Restore target:
- Objects restored:
- Metadata reconnect method:
- Partial restore risk:

Access-control verification summary:
- Private bucket behavior:
- Public bucket behavior:
- Storage policy/catalog checks:
- App-level access check, if approved:
- Unauthorized access check, if approved:

Cleanup:
- Temporary local artifacts created:
- Temporary local artifacts deleted:
- Restored objects cleaned up:
- Throwaway target cleaned up:
- Residual artifacts/targets:
- Follow-up cleanup needed:

Result: pass/fail/blocked
Follow-up actions:

Secret/artifact confirmation:
- Secrets printed or stored in repo: no
- Signed URLs stored in repo: no
- Private object contents stored in repo: no
- Raw customer-identifying object paths stored in repo: no
- Backup/restore artifacts stored in repo: no

Public/customer-data exposure confirmation:
- Public data exposure observed:
- Customer/private data exposure observed:
- Mitigation/follow-up:

Operator/signoff:
Approver/signoff:
```

## Edge Function/Env/Secrets Restore Checklist

Secret names may be documented. Secret values must never be stored in repo docs.

| Function name | Required env/secret names only | Deployment status | Verification method | Restore gap | Owner/signoff |
| --- | --- | --- | --- | --- | --- |
| TBD | TBD | TBD | TBD | TBD | TBD |

## Cleanup/Signoff Section

```text
Artifacts created:
Artifacts deleted:
Artifacts retained and approved location:
Backup/restore outputs stored outside repo:
Secrets or credential values stored in repo: no
Customer data stored in repo: no
Production data mutated: yes/no
Production settings changed: yes/no
Storage settings changed: yes/no
Users created: yes/no
Owner:
Approver:
Final signoff:
```

## Open Gaps / Next Drill Notes

```text
Open gaps:
- 

Next recommended drill:
- Scope:
- Target environment:
- Required approval:
- Expected verification:

Follow-up owners:
- 
```
