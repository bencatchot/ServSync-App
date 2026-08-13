# FB-016 Full Recovery Drill Checklist

This checklist turns the ServSync recovery runbook into one timed, fail-closed operator procedure. It contains configuration names and classifications only. Secret values, private R2 object paths, user credentials, and provider tokens must remain in approved secure stores and process-local environments.

## Entry Gates

- [ ] A completed Production physical database backup is visible and selected.
- [ ] A Production R2 run has executed naturally through the `04:17 UTC` Vercel Cron.
- [ ] The Cron invocation is independently visible in Vercel runtime evidence and the corresponding aggregate R2 health record passes `npm run ops:storage-backup:observe-scheduled`.
- [ ] The selected R2 manifest is complete, SHA-verified, and no older than the accepted Storage recovery point.
- [ ] Temporary recovery-project authority and required provider access are still approved.
- [ ] Approved contractor and homeowner smoke identities are available without resetting Production passwords.
- [ ] No public domain, live Stripe traffic, email/SMS sending, or Production Cron will point at the recovery target.

Stop if any entry gate is false. A manual Storage backup invocation cannot satisfy the scheduler gate.

## Configuration Inventory

| System | Configuration to recover or verify | Classification | Drill treatment |
| --- | --- | --- | --- |
| Supabase | New isolated project ref, name, region, database release, and health | Manually provisioned | Name must start `servsync-recovery-drill-`; reject Production, Demo, and Sandbox refs. |
| Supabase | PostgreSQL schemas/data, database roles, Auth rows/password hashes, and root key | Restored by physical backup | Validate with the read-only recovery validator; do not alter restored history. |
| Supabase | Auth site URL, allowed redirect URLs, provider enablement, templates, MFA, rate limits, SMTP mode | Manually reconfigured from secure existing configuration | Configure only local/Preview recovery origins; keep outbound SMTP disabled unless separately required. |
| Supabase | Browser and server API keys | Regenerated/retrieved from the isolated project | Use only in process-local or protected temporary deployment configuration. |
| Supabase | Realtime settings and limits | Manually compared/reconfigured | Apply only settings required by application smoke. |
| Supabase | Extensions and project/database settings outside the physical restore | Manually compared/reconfigured | Record differences; do not broaden extensions during a drill. |
| Supabase | Seven Storage bucket definitions and access policy | Metadata may restore; must be validated | Recreate only when missing, using the exact manifest contract. |
| Supabase | Storage object bytes | Restored independently from Cloudflare R2 | Production fallback reads are prohibited. Verify count, bytes, content type, path identity, and SHA-256. |
| Supabase | Edge Function deployments | Recoverable from reviewed repository source | Deploy only functions required for the smoke; otherwise record as deferred. |
| Supabase | Edge Function secret names and values | Manually reconfigured from approved secure sources | Never export values into evidence. Keep side-effectful functions/providers disabled. |
| Vercel | Project identity and Git/deployment source | Manually provisioned or local-only | Prefer local or protected Preview. Never move `servsync.app` or another public alias. |
| Vercel | `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` | Retrieved from isolated Supabase | Required for browser application smoke; process-local/protected only. |
| Vercel | Server Supabase URL/service credential when a tested route requires it | Retrieved from isolated Supabase | Add only to the isolated deployment and remove during cleanup. |
| Vercel | Feature/environment flags required for core app behavior | Recoverable from reviewed non-secret configuration and secure provider inventory | Use the minimum recovery-safe values; confirm an unmistakable recovery identity. |
| Vercel | Production/Preview env inventory, aliases/domains, Firewall/rate limits, protection, Cron, deployment settings | Manually reconstructed for a real incident | Inventory during the drill; do not attach Production aliases or enable Production Cron. |
| Cloudflare R2 | Account, private backup bucket, endpoint, and scoped credential names | Existing independent recovery source | Read selected manifest/objects only. Do not rotate credentials or expose private keys/paths. |
| Stripe | Provider mode, credential variable names, webhook, connected-account boundary, and application-fee policy | Manually reconstructed from secure configuration | Keep disabled. No webhook, checkout, live key, or money movement belongs in this drill. |
| Email | Provider and sender configuration names | Manually reconstructed from secure configuration | Optional for initial recovery; keep sending disabled. |
| SMS | Provider configuration names, if active | Manually reconstructed from secure configuration | Optional for initial recovery; keep sending disabled. |
| Maps/geocoding | Current browser/server configuration names, if required | Recoverable from existing configuration | Enable only when core smoke requires it; avoid new credentials. |
| AI | Current provider/model configuration names, if required | Recoverable from existing secure configuration | Optional for initial recovery; no generation is required for core recovery acceptance. |

## Timed Drill Record

All timestamps use UTC. Record provider-generated identifiers only when they are non-secret.

| Milestone | Timestamp | Duration from prior milestone | Evidence/result |
| --- | --- | --- | --- |
| Synthetic incident declaration (`T0`) |  |  |  |
| Database recovery point selected |  |  | Backup ID and completed timestamp |
| R2 recovery point selected |  |  | Run ID, completed timestamp, manifest SHA only |
| Isolated project provisioning requested |  |  | Project name/ref |
| Database `ACTIVE_HEALTHY` |  |  | Restore duration |
| Recovery validator passed |  |  | Catalog/integrity fingerprints |
| Contractor Auth passed and signed out |  |  | Role/profile relationship only |
| Homeowner Auth passed and signed out |  |  | Profile relationship only |
| R2-only Storage restore started |  |  |  |
| R2-only Storage restore verified |  |  | Object count, bytes, SHA result, duration |
| Minimum configuration reconstructed |  |  | Enabled/disabled inventory |
| Local/protected recovery app ready |  |  | Recovery target identity verified |
| Contractor desktop smoke passed |  |  | Routes/requests/console result |
| Homeowner desktop smoke passed |  |  | Routes/requests/console result |
| Contractor mobile smoke passed |  |  | `390x844`, overflow/result |
| Storage-backed record passed |  |  | Public/private authorization result |
| Recovery complete (`T_recovered`) |  |  | No critical integrity failure |

Calculate and record:

- Database recovery point to `T0`: ____
- Storage recovery point to `T0`: ____
- Database/Storage timestamp skew: ____
- Evidence-supported database RPO: ____
- Evidence-supported Storage RPO: ____
- Evidence-supported full-system RPO (worst critical subsystem): ____
- Database restore duration: ____
- Auth validation duration: ____
- Storage restore duration: ____
- Configuration/deployment duration: ____
- Full application RTO (`T_recovered - T0`): ____
- Comparison with provisional 24-hour RPO / 4-hour RTO goals: ____

## Application Smoke

- [ ] Contractor login, Dashboard, Customers, Customer profile, Drafts, Estimates, Jobs, Invoices, payment/history presentation, Price Book.
- [ ] Contractor can access one recovered Storage-backed document/media record under its established authorization.
- [ ] Homeowner login, Dashboard, Estimates/Invoices, Home History.
- [ ] Homeowner can access one recovered Storage-backed record when a suitable authorized record exists.
- [ ] Contractor mobile smoke at approximately `390x844` has no critical console/request failure or horizontal overflow.
- [ ] No missing required RPC, role-boundary regression, broken object authorization, or unexplained 4xx/5xx remains.

## Cleanup

- [ ] Stop local/Preview recovery application and delete protected temporary environment configuration.
- [ ] Confirm no public domain, webhook, Cron, email, SMS, or live provider points to the target.
- [ ] Delete the exact isolated recovery project and verify the provider no longer returns it.
- [ ] Confirm Production, Demo, and Sandbox remain `ACTIVE_HEALTHY` and public app endpoints remain healthy.
- [ ] Confirm the Production R2 backup and latest-success health remain intact.
- [ ] Confirm no local database, Storage-byte, credential, screenshot, or log artifact remains.
- [ ] Record residual findings without repairing historical Production data during the drill.

Recovery is complete only when database, Auth, critical Storage, minimum configuration, and authenticated application smoke all pass. Database-only or Storage-only timing is not a full ServSync RTO.
