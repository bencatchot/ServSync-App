# FB-016 Full Recovery Drill Checklist

This checklist turns the ServSync recovery runbook into one timed, fail-closed operator procedure. It contains configuration names and classifications only. Secret values, private R2 object paths, user credentials, and provider tokens must remain in approved secure stores and process-local environments.

## Entry Gates

- [x] A completed Production physical database backup is visible and selected.
- [x] A Production R2 run has executed naturally through the `04:17 UTC` Vercel Cron.
- [x] The Cron invocation is independently visible in Vercel runtime evidence and the corresponding aggregate R2 health record passed independent manifest/health validation.
- [x] The selected R2 manifest is complete, SHA-verified, and no older than the accepted Storage recovery point.
- [x] Temporary recovery-project authority and required provider access are still approved.
- [x] Approved contractor and homeowner smoke identities are available without resetting Production passwords.
- [x] No public domain, live Stripe traffic, email/SMS sending, or Production Cron will point at the recovery target.

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
| Synthetic incident declaration (`T0`) | 2026-08-14 12:02:05.146 | n/a | Recovery points selected; incident clock started. |
| Database recovery point selected | 2026-08-14 06:15:14.081 | 5h46m51.065s before `T0` | Physical backup ID `1370181993`. |
| R2 recovery point selected | 2026-08-14 04:17:40.942 | 7h44m24.204s before `T0` | Natural run `2508eaaf-b124-4498-8660-4ba0cbf4efd0`; manifest `27247251b2acacea2dcd161d01107cab7bd49dc1935733871645961ddd09abfd`. |
| Isolated project provisioning requested | 2026-08-14 12:02:37.241 | 32.095s | `servsync-recovery-drill-full-2026-08-14` / `zizojbqbsikymrdhfebd`. |
| Post-restore `ACTIVE_HEALTHY` | 2026-08-14 12:07:05.772 | 4m28.531s | `RESTORING` was observed first; stable health confirmed at 12:07:20.992. |
| Recovery validator passed | before 2026-08-14 12:09:31.268 | bounded before Auth operation | Catalog `75680d...f1fe`; integrity `b0aab470...e6c14`; exact Production correspondence. |
| Contractor Auth passed and signed out | 2026-08-14 12:09:32.307 | included below | Owner/profile relationship resolved. |
| Homeowner Auth passed and signed out | 2026-08-14 12:09:32.307 | 1.039s final Auth operation | Homeowner profile resolved; no reset. |
| R2-only Storage restore started | 2026-08-14 12:10:23.182 | 50.875s | Natural manifest only; no Production fallback. |
| R2-only Storage restore verified | 2026-08-14 12:10:28.491 | 5.309s | 4 objects / 5,274,400 bytes; all hashes passed. |
| Minimum configuration reconstructed | 2026-08-14 12:11 | under 1m | Process-only recovery Supabase URL/anon; side-effectful providers disabled. |
| Local/protected recovery app ready | 2026-08-14 12:11 | 174ms server startup | Local-only app; recovery ref verified before Auth. |
| Contractor desktop smoke passed | 2026-08-14 12:28 | included in app-smoke window | Core routes, Jobs presentation, and Price Book; no major console/5xx. |
| Homeowner desktop smoke passed | 2026-08-14 12:28 | included in app-smoke window | Core routes and a real Invoice PDF download. |
| Contractor mobile smoke passed | 2026-08-14 12:28 | included in app-smoke window | `390x844`; no horizontal overflow or major console/5xx. |
| Storage-backed record passed | 2026-08-14 12:28 | included in app-smoke window | Recovered canonical profile logo rendered; private object anonymous 400 / server-authorized 200. |
| Recovery complete (`T_recovered`) | 2026-08-14 12:29:08.539 | 27m03.393s from `T0` | No critical integrity failure. |

Calculate and record:

- Database recovery point to `T0`: 5h46m51.065s.
- Storage recovery point to `T0`: 7h44m24.204s.
- Database/Storage timestamp skew: 1h57m33.139s, with the database point newer.
- Evidence-supported database RPO: selected physical point was under 6 hours old; Supabase confirms hidden August 9-11 points remained recoverable, but no formal Pro daily-backup guarantee is documented.
- Evidence-supported Storage RPO: approximately 24-hour operating cadence, proven by one natural scheduled run and guarded by a 36-hour stale threshold.
- Evidence-supported full-system RPO (worst critical subsystem): tested recovery-point age 7h44m24.204s; 24-hour operating target supported, not guaranteed.
- Database restore duration: 4m28.531s to first post-restore healthy; 4m43.751s to stable health.
- Auth validation duration: 1.039s final operation; complete role validation finished 7m27.161s after `T0`.
- Storage restore duration: 5.309s.
- Configuration/deployment/application-correction/smoke duration: approximately 18m40s after Storage restore, including discovery and correction of portable public Storage URL consumption.
- Full application RTO (`T_recovered - T0`): 27m03.393s.
- Comparison with provisional 24-hour RPO / 4-hour RTO goals: both supported by this isolated drill; neither is a contractual SLA.

## Application Smoke

- [x] Contractor login plus Dashboard, Customers, Service Requests, Jobs/Estimate-Invoice presentation, Calendar, and Price Book passed. The approved owner had no accessible customer/profile/Draft record cards, so those record-specific clicks were not manufactured.
- [x] A restored public contractor asset rendered through the canonical ServSync public-profile route against the recovery project.
- [x] Homeowner login, Dashboard, Properties, Contractors, Service Requests, Estimates/Invoices, Home History, and Documents passed; one real Invoice PDF downloaded.
- [x] Homeowner canonical public-profile rendering used a recovered R2-derived Storage object. The approved accounts did not own the restored private service-request media, so private user-scoped rendering was not manufactured.
- [x] Contractor mobile at `390x844` had no critical console/request failure or horizontal overflow.
- [x] No missing required RPC, role-boundary regression, broken object authorization, or unexplained 4xx/5xx remained.

## Cleanup

- [x] Stopped the local recovery application; process-only configuration was discarded.
- [x] No public domain, webhook, Cron, email, SMS, Stripe, or live provider pointed to the target.
- [x] Deleted exact isolated project `zizojbqbsikymrdhfebd`; it is absent from the project inventory.
- [x] Production/Demo/Stripe Sandbox public endpoints returned HTTP 200; no standing environment was mutated.
- [x] Production R2 natural-run backup and latest-success evidence remained intact; daily Cron remains configured.
- [x] No temporary credential file or recovery application process remained; transient R2 credentials were cleared and the provider credential-success page was exited.
- [x] The historical paid-Invoice ledger mismatch was recorded unchanged and was not repaired.

Recovery is complete only when database, Auth, critical Storage, minimum configuration, and authenticated application smoke all pass. Database-only or Storage-only timing is not a full ServSync RTO.
