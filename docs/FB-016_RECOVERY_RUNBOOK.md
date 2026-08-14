# FB-016 ServSync Recovery Runbook

Status: active and blocked for public-launch recovery readiness.

This is the authoritative ServSync incident-recovery procedure and sanitized drill record. It does not authorize a restore, cutover, provider activation, production mutation, or secret access. Every incident still requires an approved source, recovery point, isolated target, operator, and cutover decision.

## Current Readiness

The 2026-08-13 database drill proved that a Production Supabase physical backup can restore PostgreSQL data, Auth identities/password hashes, and a usable read-only ServSync application into an isolated project. The follow-up Storage drill closed the previously critical object-byte gap:

- A private Cloudflare R2 Standard bucket now receives source-ref-scoped, content-addressed object versions, immutable manifests, a latest-success health pointer, deletion tombstones, and 90 retained daily runs.
- Two read-only Production runs captured all seven buckets and four objects (5,274,400 bytes). The second run reused all four verified object versions and wrote zero duplicate object bytes.
- The latest exact manifest restored all four objects into a new isolated Supabase project. Restored bytes, paths, bucket privacy/settings, and SHA-256 checks passed; two contractor-logo references and one service-request-media reference resolved to recovered objects.
- Public-object access succeeded, anonymous private-object access failed, and server-authorized private-object access succeeded. The isolated project was deleted after validation.
- Production backup inventory omitted visible August 9, 10, and 11 restore points. Supabase ticket `SU-445711` classified this as a resolved provider restore-point visibility incident, not an observed data-protection gap.
- The visible interval remained present when rechecked on 2026-08-13: Production exposed completed restore points for August 6, 7, 8, 12, and 13 only, while Demo and Sandbox exposed a completed daily point for every day from August 6 through 13. Supabase confirmed the affected Production data remained safe and fully recoverable for August 9-11 even though those points may remain hidden in the Dashboard.
- Supabase stated that enabling PITR should expose an affected hidden restore date if a restore from that period becomes necessary and offered to credit the affected-timeframe PITR cost. This is recovery evidence, not authorization for ongoing PITR activation.
- The next natural R2 Cron execution after this audit is 2026-08-14 at 04:17 UTC. The earlier post-deployment run was manual and does not count as autonomous scheduler evidence.
- Auth, Realtime, Edge Functions, secrets, Vercel, and external-provider settings need separate secure reapplication.

Consequently, full ServSync recovery readiness remains `BLOCKED`, but independent database/Auth recovery, Storage-byte backup/restore, and the provider disposition of the August 9-11 visibility incident are completed bounded milestones. The executable configuration and timed-drill checklist is `docs/FB-016_FULL_RECOVERY_DRILL_CHECKLIST.md`. The remaining completion gates are natural scheduler observation and a timed full-application drill; formal Pro daily-backup RPO expectations and automatic hidden-point monitoring remain bounded provider follow-ups.

## Recovery Objectives

Observed evidence, not adopted objectives:

- Database restore duration: 3 minutes 57 seconds from accepted restore request to `ACTIVE_HEALTHY`.
- Database RPO evidence: Supabase confirmed the August 9-11 data remained safe and recoverable, so the approximately 95-hour 56-minute August 8-to-August 12 interval is only the observed Dashboard/API visibility interval. It is not evidence of an equivalent data-loss window. Supabase has not supplied a formal Pro daily physical-backup RPO commitment without PITR.
- Storage RPO evidence: one successful initial backup and one immediate unchanged replay on 2026-08-13. A daily 04:17 UTC schedule and a 36-hour stale-health threshold are configured, but 24-hour Storage RPO performance is not yet proven by elapsed scheduled runs.
- Full application RPO evidence: undefined/unbounded, governed by the weakest critical layer.
- Full application RTO evidence: not established. Database restore time excludes Storage, configuration, deployment, provider recovery, validation, and cutover.

Recommended controlled-beta targets, pending owner adoption and prerequisite work:

- Full application RPO: 24 hours.
- Full application RTO: 4 hours.

Those targets require successful daily scheduler observation, backup-gap monitoring and resolution, secured configuration inventories, and recurring timed full drills. They are not currently achieved.

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

## Storage Backup And Recovery Contract

Supabase database backups do not contain Storage object bytes. ServSync therefore uses the private `servsync-production-storage-backup` Cloudflare R2 Standard bucket for a separate encrypted-at-rest, HTTPS-transported, access-controlled, versioned object backup that preserves:

- bucket identity and intended public/private state;
- object bytes and stable object paths;
- checksums, sizes, content types, and backup timestamps;
- enough metadata to reconnect objects to restored application rows;
- deletion/version retention and an auditable restore manifest.

The bucket is not public and the service credential is scoped to Object Read & Write for this bucket only. Production-only sensitive Vercel configuration supplies the R2 endpoint/identity, bucket credential, exact Production Supabase source identity/credential, retention, and Cron bearer secret. Secret values must never enter Git, logs, reports, screenshots, or restore artifacts.

Backup runs are all-or-nothing: a run writes its immutable manifest and advances the latest-success health pointer only after every source object is downloaded, hashed, copied or verified in R2, independently re-downloaded, and hash-verified. Any source identity, R2 identity, bucket-inventory, byte-size, hash, or retention error fails the run. The daily Vercel Cron invokes `/api/storage-backup` at `04:17 UTC`; `/api/storage-backup-health` reports unhealthy after 36 hours without a successful run. Both endpoints require the Cron bearer secret and emit only aggregate evidence.

Restore always targets a separately approved project whose name starts with `servsync-recovery-drill-`. The operator refuses the immutable Production, Demo, and Sandbox refs, validates the manifest envelope and every object hash, requires exact bucket privacy/upload-policy metadata, and re-downloads each restored object for a second SHA-256 comparison. Restore Production data before Storage bytes so application references exist, then validate record-to-bucket/path linkage and public/private access. Never rely on copying from a damaged live source as the recovery procedure.

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

The authoritative executable classification and timing worksheet is `docs/FB-016_FULL_RECOVERY_DRILL_CHECKLIST.md`. During drills, Stripe, outbound email/SMS, public domains, webhooks, and Production Cron remain disabled; authenticated core application and recovered-record validation do not require side-effectful providers.

## Scheduled Backup Observation

Natural scheduler acceptance requires two independent facts:

1. Vercel runtime/Cron evidence identifies a scheduled invocation of `/api/storage-backup` at the configured `04:17 UTC` window. Record only the non-secret invocation identifier and timestamps.
2. The R2 latest-success health and immutable manifest identify the same resulting backup window, exact Production source ref, zero failures, every source object accounted for, and a valid manifest SHA-256.

After obtaining the Vercel invocation identifier, validate the R2 side without exposing object paths:

```bash
npm run ops:storage-backup:observe-scheduled -- \
  --expected-after 2026-08-14T04:17:00.000Z \
  --expected-before 2026-08-14T04:47:00.000Z \
  --vercel-invocation-id <non-secret-vercel-cron-invocation-id>
```

Use the actual natural-run date and a narrowly justified completion window. The command rejects missing scheduler evidence, wrong source identity, out-of-window/manual health, stale/future health, invalid manifest hashes, failures, and incomplete object accounting. It emits aggregate evidence only. It does not independently query Vercel, so the operator must retain the corresponding Vercel Cron/runtime evidence.

## 2026-08-13 Drill Evidence

### Independent Storage Backup And Restore

- R2 account: BJC Ventures account ID `3078d46a3ad90fa7e8ead3e53cf09691`.
- Private destination: `servsync-production-storage-backup`, Standard storage, no public access, no custom domain, and no `r2.dev` exposure.
- Credential: account API token `ServSync Production Storage Backup`, Object Read & Write, restricted to the one bucket, revocable, with no account/bucket administration. No value is retained in this document.
- Runtime configuration: Vercel Production project `serv-sync-app-refresh` / `prj_UfNB5L1kMcDP9p0fLd4Dc60bpDPP`, which owns `servsync.app`. All ten backup/Cron variables are sensitive and Production-only. The unrelated legacy `serv-sync-app` project retains none of them.
- First Production run: `66167ebe-d2d1-49d0-971f-23c888b44af8`, completed `2026-08-13T21:07:18.912Z`, manifest SHA-256 `c872f9afdf335c3524c30e7ce094118a9018cee3ccf30554e30529066eb7ef91`; 7 buckets, 4 objects, 5,274,400 source/R2 bytes, 4 new versions, 0 failures.
- Unchanged replay: `37284738-0c90-43bf-9093-283006c1b658`, completed `2026-08-13T21:07:29.451Z`, manifest SHA-256 `f24f9ffba725a42c3b1ba0cd81890cd248f665a1b59f438430f996808848402d`; 4 verified unchanged versions, 0 new object bytes, 0 failures.
- Exact inventory: `contractor-assets` 2 / 144,409 bytes; `discover-media` 0; `email-assets` 1 / 1,059,521 bytes; `home-documents` 0; `inspection-media` 0; `service-request-media` 1 / 4,070,470 bytes; `support-attachments` 0.
- Isolated target: `servsync-recovery-drill-storage-2026-08-13` / `qafqvjpoalgcqzmskgxd`, restored from the same `2026-08-13T06:15:58.460Z` Production physical backup. It reached `ACTIVE_HEALTHY` in 4m26s.
- The latest R2 manifest restored 4 objects / 5,274,400 bytes. Every R2 source and restored target byte sequence passed SHA-256 verification. The recovery catalog and integrity fingerprints remained `c5ec9df19bdb0ba610a95b37b6294465d36d1c0bc2ce9f76818ca421a73caf01` and `b0aab4708c530251d3535604a57b4bce07a9ccf589314f05e7cceec61d8e6c14`.
- Application linkage found two contractor-profile logo references and the one service-request-media record at their recovered bucket/path. Public access returned 200 with the expected hash; anonymous private access failed; server-authorized private access returned 200 with the expected hash.
- Approved contractor-owner and homeowner smoke identities authenticated normally and signed out. Neither account owned the recovered private service-request media, so user-scoped rendering of that specific object was not available without changing data or credentials; the canonical service-record linkage and private Storage authorization path were validated instead.
- The target had no public alias, Vercel project, Edge Functions, provider configuration, or external delivery. It was deleted after evidence capture, ending temporary compute/disk exposure.
- A synthetic real-R2 matrix separately passed initial, unchanged, add, update, delete/tombstone, current/prior-manifest restore, corruption rejection, missing-object rejection, 90-run retention, and residue cleanup.
- Successful restore output reports restored, tombstone-skipped, and failed object counts; restore remains fail-fast and reports no successful completion when integrity validation fails.

Official provider references reviewed 2026-08-13:

- [Cloudflare R2 data security](https://developers.cloudflare.com/r2/reference/data-security/)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Cloudflare R2 storage classes](https://developers.cloudflare.com/r2/buckets/storage-classes/)
- [Supabase Restore to a new project](https://supabase.com/docs/guides/platform/clone-project)
- [Supabase database backups](https://supabase.com/docs/guides/platform/backups)

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

### Backup Restore-Point Visibility Incident

The Management API exposed completed physical backups on August 6, 7, 8, 12, and 13, with no visible August 9, 10, or 11 entries. WAL-G was enabled and PITR was disabled. A same-day recheck still exposed no failed/in-progress metadata and confirmed Demo/Sandbox daily continuity for August 6-13.

Supabase ticket `SU-445711` confirmed that an issue caused daily physical backups to appear missing for some projects and that Supabase resolved that issue. Supabase stated that ServSync Production data for August 9-11 is safe and fully recoverable, although affected restore points may not be visible in the Dashboard. If restoration from one of those hidden dates becomes necessary, Supabase stated that enabling PITR should expose the point and that it will credit PITR cost for the affected timeframe. The approximately 95-hour 56-minute visible interval triggered the support case but is not an established database data-loss exposure.

Two questions remain open: the formal durability/RPO expectation for Pro daily physical backups without PITR, and whether Supabase supports automatic monitoring for missing or hidden physical-backup restore points. These limit a provider-guarantee claim but do not reopen the resolved August 9-11 recoverability finding.

PITR remains a separate owner cost/operations decision. It is not required merely to complete this drill, and the provider's affected-timeframe credit offer does not authorize ongoing activation. PITR should be reconsidered only if later technical evidence shows that the adopted recovery objective cannot be met without it. It still does not back up Storage object bytes, so independent R2 backup remains required.

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
