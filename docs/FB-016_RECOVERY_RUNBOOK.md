# FB-016 ServSync Recovery Runbook

Status: active and blocked for public-launch recovery readiness.

This is the authoritative ServSync incident-recovery procedure and sanitized drill record. It does not authorize a restore, cutover, provider activation, production mutation, or secret access. Every incident still requires an approved source, recovery point, isolated target, operator, and cutover decision.

## Current Readiness

The 2026-08-13 drill proved that a Production Supabase physical backup can restore PostgreSQL data, Auth identities/password hashes, and a usable read-only ServSync application into an isolated project. It did not prove full recovery:

- Supabase restored Storage bucket and object metadata, but none of the four object bytes.
- ServSync has no independent, tested Storage-byte backup. A bounded public-object copy from the live source proved mechanics only, not backup recovery.
- Production backup inventory omitted August 9, 10, and 11. The cause remains unresolved, and PITR is disabled.
- Auth, Realtime, Edge Functions, secrets, Vercel, and external-provider settings need separate secure reapplication.

Consequently, full ServSync recovery readiness is `BLOCKED`. Database/Auth recovery is a completed bounded milestone, not proof of full application recovery.

## Recovery Objectives

Observed evidence, not adopted objectives:

- Database restore duration: 3 minutes 57 seconds from accepted restore request to `ACTIVE_HEALTHY`.
- Database RPO evidence: insufficient for 24 hours. The widest observed completed-backup interval was about 95 hours 56 minutes (August 8 to August 12).
- Storage RPO evidence: undefined/unbounded because no independent recoverable object-byte backup exists.
- Full application RPO evidence: undefined/unbounded, governed by the weakest critical layer.
- Full application RTO evidence: not established. Database restore time excludes Storage, configuration, deployment, provider recovery, validation, and cutover.

Recommended controlled-beta targets, pending owner adoption and prerequisite work:

- Full application RPO: 24 hours.
- Full application RTO: 4 hours.

Those targets require daily independently recoverable Storage-byte backups, backup-gap monitoring and resolution, secured configuration inventories, and recurring timed drills. They are not currently achieved.

## Recovery Procedure

1. Declare the incident, assign an incident owner, and record the start time.
2. Freeze or contain writes when continued writes could increase loss or complicate reconciliation.
3. Preserve logs, provider events, deployment identity, database evidence, and the suspected failure timeline.
4. Identify the exact affected environment; never infer it from a URL or project name alone.
5. Determine the candidate recovery point and the business-data loss window.
6. Confirm the backup exists and is complete through the provider inventory. Escalate unexplained gaps before promising an RPO.
7. Provision a clearly named isolated restore project. Confirm its ref differs from Production, Demo, and Sandbox and that no public domain or provider targets it.
8. Validate PostgreSQL schemas, relations, columns, constraints, indexes, functions, ownership, search paths, triggers, RLS, policies, grants, extensions, and important defaults/types against the selected historical point.
9. Validate Auth rows, profile relationships, memberships, and approved password authentication. Never reset a Production password merely to pass a drill.
10. Recover and validate Storage object bytes from the independent Storage backup. Metadata rows are not object recovery. Verify byte counts/checksums and private/public access behavior.
11. Reapply project-level Auth, API, Storage, Realtime, extension, SMTP, and other settings from approved secure configuration.
12. Recreate the Vercel project/environment linkage, browser-public variables, aliases/domains, protection, deployment configuration, and firewall/rate limits from approved secure configuration.
13. Restore Stripe, email, SMS, maps/geocoding, AI, and other provider configuration only after isolation and safety checks. Keep sending and money movement disabled until deliberately approved.
14. Reconfirm database ref, app URL, environment label, provider mode, and public-domain isolation before any authenticated validation.
15. Run the catalog/security validator and check RLS, grants, private tables, RPC ownership/search paths, and tenant boundaries.
16. Run financial integrity checks for totals, paid amounts, balances, statuses, idempotency, and payment ledgers. Distinguish historical source findings from restore corruption.
17. Run authenticated contractor and homeowner smoke across the canonical Customer -> Draft -> Estimate -> Job -> Invoice -> Payment -> Customer History workflow, plus Price Book and representative PDFs/media where records permit.
18. Review transactions and object changes between the recovery point and incident time; prepare an explicit reconciliation plan.
19. Make a documented cutover decision. Do not point public domains or providers at the recovery target without separate approval.
20. Re-enable external providers one at a time, in the correct mode, with endpoint/signature and delivery validation.
21. Monitor authentication, authorization, database, Storage, provider, payment, email, and application health after cutover.
22. Document the incident, loss window, restore evidence, manual steps, reconciliation, residual risks, and runbook corrections.
23. Obtain owner sign-off for recovery completion, provider activation, and deletion or retention of superseded infrastructure.

## Safe Validator

Run only against an isolated project named with the `servsync-recovery-drill-` prefix:

```bash
SUPABASE_ACCESS_TOKEN="$(security find-generic-password -s 'Supabase CLI' -w)" \
  npm run ops:recovery:validate -- --project-ref <isolated-recovery-ref>
```

The validator rejects the immutable Production, Demo, and Sandbox refs, verifies exact target identity and `ACTIVE_HEALTHY`, runs read-only catalog and integrity queries, and emits sanitized counts/fingerprints. It cannot prove object bytes, application behavior, external configuration, or a complete recovery by itself.

## Storage Recovery Contract

Supabase database backups do not contain Storage object bytes. The recovery process therefore requires a separate encrypted, access-controlled, versioned object backup that preserves:

- bucket identity and intended public/private state;
- object bytes and stable object paths;
- checksums, sizes, content types, and backup timestamps;
- enough metadata to reconnect objects to restored application rows;
- deletion/version retention and an auditable restore manifest.

Restore to an isolated project first. Compare manifests, restore representative bytes, verify checksums and access controls, then restore the bounded required set. Never rely on copying from a damaged live source as the only recovery procedure.

The current Storage-dependent classes include contractor/discovery/email assets, service-request media, inspection media, home documents, support attachments, and any generated or filed document/media stored in those buckets. An incident inventory must use the then-current bucket catalog.

## External Configuration Checklist

Physical restore did not recreate the complete operating environment. Maintain non-secret inventories and secure secret sources for:

- Supabase Auth settings, site/redirect URLs, templates, MFA and rate limits;
- API keys and project keys, regenerated or retrieved through approved provider controls;
- Edge Function source/deployments and secret names;
- Realtime limits/settings and extension settings;
- Storage settings and independently backed-up bytes;
- Vercel project identity, environment variables, domains/aliases, protection, deployment settings, firewall and rate limits;
- Stripe mode, API credential, webhook endpoint/signing secret, connected-account scope, and application-fee policy;
- email, SMS, geocoding/maps, AI, and any other external providers.

Secret values belong only in the approved password manager/provider configuration. Do not put them in this runbook, Git, chat, screenshots, test artifacts, or terminal captures.

## 2026-08-13 Drill Evidence

### Provisioning

- Source: Production `uqgtheclhxqlnjpfmheq` (read-only throughout).
- Backup: physical backup `2026-08-13T06:15:58.460Z`.
- Recovery target: `servsync-recovery-drill-2026-08-13` / `osinlworhgdbeopibpkw`, `us-east-1`.
- PostgreSQL: 17 / provider release `17.6.1.155`.
- Storage allocation: 3 GB GP3, 3,000 IOPS, 125 MiB/s.
- Restore accepted: `2026-08-13T19:12:51Z`.
- `ACTIVE_HEALTHY`: `2026-08-13T19:16:48Z`.
- Measured database restore: 3 minutes 57 seconds.
- Provider quote displayed for the temporary target: source Nano; additional monthly compute, disk, and total all `$0`. The target was still treated as charge-authorized and deleted promptly.

### Database, Auth, And Application

- Catalog fingerprint at the historical point: `c5ec9df19bdb0ba610a95b37b6294465d36d1c0bc2ce9f76818ca421a73caf01`.
- Catalog shape: 127 relations, 1 managed relation, 1,770 columns, 1,143 constraints, 539 indexes, 149 triggers, 211 policies, and 433 functions.
- The difference from current Production was exactly the later Admin/Office Normal Estimate Authority v1 rollout. This is expected historical state, not restore damage.
- Integrity fingerprint: `b0aab4708c530251d3535604a57b4bce07a9ccf589314f05e7cceec61d8e6c14`.
- Restored: 18 Auth users, 18 profiles, 7 contractor profiles, 3 team memberships, 5 homeowner profiles, 3 local contacts, 12 local homes, 6 connected homes, 8 Drafts/28 items, 22 Estimates/39 lines, 9 Jobs/9 work items, 12 Invoices/33 lines, 4 Home History rows, 4 reminders, and 2 Price Book items.
- Nineteen explicit Auth/profile/work/financial/Price Book/asset/trade relationship checks returned zero orphan violations.
- Existing approved contractor-owner and homeowner credentials both completed normal password authentication against the recovery target, resolved to the expected ServSync relationships, loaded profiles, and signed out. No password was reset or exposed.
- A local Vite app pointed only to the recovery project. Contractor desktop routes and homeowner desktop routes loaded without failed requests, console errors, or horizontal overflow. A bounded contractor mobile smoke exited successfully. The approved contractor smoke account had no record cards, so record-specific PDF/payment UI was not practically exercised.

### Financial Integrity

- Negative totals, negative paid amounts, overpayments, paid balances, invalid partial balances, nonpositive payments, and duplicate idempotency evidence: zero.
- Invoice statuses: 7 draft, 4 viewed, 1 paid.
- One paid Invoice has no corresponding offline/online payment-ledger row. The same aggregate mismatch exists in current Production and is therefore a historical source-data issue, not restore corruption. No repair was performed.

### Storage

- Seven buckets and four `storage.objects` metadata rows restored.
- All four recovery-target byte requests failed; the corresponding Production objects were readable under their existing access behavior.
- One smallest non-sensitive public contractor asset was copied through a mode-600 temporary file to prove restore mechanics. Source and target returned 200, and 63,609 bytes matched by SHA-256 and byte comparison. The local file was overwritten/deleted and the target was deleted with the recovery project.
- This test does not prove backup recovery. No independent object backup existed, and no private object was copied. Storage recovery remains blocked.

### External Configuration

- Auth and Realtime configuration differed from Production and require deliberate reapplication.
- Storage settings matched at the inspected configuration level, but object bytes were absent.
- Production had eight Edge Functions and configured secret names; the recovery target had none. No values were read or copied.
- No Vercel project, public alias, Edge Function secret, Stripe, email, SMS, maps, or AI provider was attached to the target.
- Application validation used local process-only browser-public recovery configuration. No Production/Demo/Sandbox configuration changed.

### Backup Inventory Gap

The Management API exposed completed physical backups on August 6, 7, 8, 12, and 13, with no August 9, 10, or 11 entries. WAL-G was enabled and PITR was disabled. Provider status history did not explain the gap. The cause remains unresolved and requires a Supabase support case with the Production project ref and missing dates. Until explained and monitored, ServSync must not claim a 24-hour database RPO.

Official provider references reviewed 2026-08-13:

- [Supabase Backups](https://supabase.com/docs/guides/platform/backups)
- [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project)
- [Dashboard restore migration](https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore)
- [Backup and restore migration](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)

### Cleanup

- The local recovery application process was stopped.
- The exact recovery project `osinlworhgdbeopibpkw` was deleted after evidence capture, and the Management API returned 404 for the deleted ref.
- Production, Demo, and Sandbox Supabase projects remained `ACTIVE_HEALTHY`; Production and Demo public aliases returned HTTP 200.
- No public domain, Edge Function, secret, webhook, live provider, or external delivery configuration was attached to the recovery target.
- Deletion ended the temporary project's compute/disk exposure. No local object-byte artifact remains.

## Stop Conditions

Stop recovery/cutover if environment identity is ambiguous; expected backup points are absent; relationship or financial findings cannot be classified; Auth cannot be verified; critical object bytes are unavailable; security/catalog checks differ unexpectedly; live providers or public domains point to an isolated target; or secrets/private data may be exposed.
