# FB-016 Recurring Authenticated Role Smoke & Fixture Health v1

## Purpose

This daily operational check detects credential, identity, fixture, authorization, application, environment, and Storage-backup drift before unrelated feature work encounters it. It is read-only. It does not replace periodic mutating core-loop tests or recovery drills.

## Schedule And Evidence

GitHub Actions workflow `.github/workflows/fb016-recurring-role-smoke.yml` runs at `05:23 UTC` daily, after the Production Storage backup scheduled for `04:17 UTC`. `workflow_dispatch` exists for mechanical validation and incident diagnosis, but only an event with `GITHUB_EVENT_NAME= schedule` counts as natural scheduler evidence.

Each run retains sanitized JSON for 30 days with the GitHub run/attempt identity, trigger, environment, check names, pass/fail counts, and bounded failure summaries. Do not upload Playwright traces, videos, screenshots, HTML reports, raw network captures, emails, record identifiers, object paths, or tokens. Those artifacts can contain authenticated request headers or private fixture content.

The schedule becomes active only from the default branch. Because GitHub cannot naturally schedule a newly introduced workflow before that workflow is merged, this slice uses a controlled post-merge natural-run acceptance gate: normal independent validation permits source merge, then the first genuine `schedule` event determines operational acceptance. A manual dispatch, local run, repository dispatch, or rerun cannot satisfy that gate.

### First Natural Scheduled Acceptance

The first qualifying natural run passed on 2026-08-15:

- GitHub Actions run: `31867784065`, attempt `1`.
- Trigger: exact `schedule` event; no dispatch, rerun, or local invocation was used.
- Default-branch SHA: `4ce5b579f9fe08825e275754783d9e5fb9454214`, which contains merged workflow commit `23152e77b3f4ad9498b7c3a85892d9908531f609`.
- Timing: started `2026-08-15T05:46:37Z` and completed `2026-08-15T05:47:50Z`.
- Sandbox: all 25 API identity, role, fixture, authorization, cross-tenant, and backup-health checks passed; the exact-head desktop/mobile browser smoke also passed.
- Demo: approved contractor/homeowner read-only navigation passed.
- Production: public and approved contractor Owner/homeowner authenticated read-only smoke passed. No Production mutation probe ran.
- Evidence: the three required jobs completed successfully and retained four sanitized JSON files under the run/attempt-bound artifacts. Independent review found no email, credential marker, token, private key, or private record/object identifier in those files.

This closes the first-natural-run acceptance gate for the bounded v1 milestone. One passing scheduled run proves that the scheduler and current contract operated successfully once; it is not a long-term availability guarantee and does not replace recurring observation, mutating workflow drills, recovery exercises, or formal provider RPO monitoring.

### 2026-08-24 Scheduled Observation

Natural run `32695447873` at default-branch SHA `38dcb2898e4469ae3f2699787fd79886750a866d` exposed two independent conditions:

- Demo and Production authenticated browser checks used the retired `Jobs` navigation label. Sandbox identity, fixture, authorization, and tenant checks passed. The launch-health selectors now follow the canonical `Work` and `Financials` destinations.
- `storage_backup_health` received HTTP 503. The natural 04:17 UTC backup had already returned sanitized `storage_backup_failed / backup_unavailable`; every inspected natural run from August 16 through August 24 failed, after an August 15 success. Production Storage grew from seven to nine application-owned buckets when private `marketing-assets` and `help-walkthroughs` were introduced, but the exact backup scope and fixtures remained at seven. The source credential still reads all nine buckets and required Vercel key metadata is unchanged, confirming a fail-closed source integration omission rather than a provider outage.

The source contract now includes both buckets and tests require the exact nine-bucket inventory while still rejecting an unknown tenth bucket. After merge and automatic deployment, do not manually invoke the backup: wait for the next natural 04:17 UTC run, require HTTP 200, then verify through aggregate read-only health that all nine buckets have zero failures, complete object accounting, a valid manifest SHA, and age no greater than 36 hours. Reverting this source change restores the prior fail-closed seven-bucket behavior without deleting R2 data, but cannot restore healthy backup operation while Production has nine buckets.

## Environment Scope

| Environment | Recurring scope | Mutation |
| --- | --- | --- |
| Sandbox `zpzdkoaubyjtsomccxya` | Full Owner/Admin/Office/Field Technician/Viewer/Homeowner identity and capability matrix, secondary identities, stable fixture presence, cross-tenant denials, desktop role UI, and bounded contractor/homeowner mobile UI. | None. |
| Demo `bdytwgejqnlblhrnqxkp` | Approved scenario Owner and homeowner read-only browser navigation only. Intentional Demo gates are not treated as failures. | None. |
| Production `uqgtheclhxqlnjpfmheq` | Public smoke, approved dedicated contractor Owner/homeowner authentication and read-only navigation, plus protected aggregate R2 backup-health observation. | None. |

The full role operator refuses Production Supabase and `servsync.app`. Production never receives Admin/Office/Field Technician/Viewer credentials or record mutation probes from this workflow.

## Stable Fixture Contract

The registry is relationship-based rather than a repository list of private IDs:

- each logical credential resolves to one distinct Auth user and the expected ServSync profile class;
- Owner/Admin/Office/Field Technician/Viewer resolve to the same primary Sandbox contractor;
- non-owner roles have the exact expected active team membership;
- the secondary contractor resolves to a different owner tenant;
- primary and secondary homeowners each retain a homeowner profile and at least one home;
- the primary contractor retains at least one controlled local-customer summary, Job, Invoice, and active Price Book item;
- the secondary contractor cannot read the primary contractor's exact Customer management detail, Invoice, or Price Book item;
- primary/secondary contractor team membership and homeowner home reads remain mutually invisible.

Mutable names, customer contents, counts, financial values, and private IDs are not report contracts. Missing or malformed fixtures fail as `FIXTURE FAILURE`; the scheduled check never recreates or edits them.

## Role Contract

The operator authenticates through Supabase password Auth with session persistence and token refresh disabled, then signs out every client. It consumes the same server helpers used by the app:

- `current_user_can_manage_contractor_customers`
- `current_user_can_manage_contractor_billing`
- `current_user_can_write_contractor_jobs`
- `servsync_list_price_book_internal_costs`

Expected Sandbox capability matrix:

| Role | Customer management | Billing/private cost | Job write |
| --- | --- | --- | --- |
| Owner | yes | yes | yes |
| Admin | yes | yes | yes |
| Office | yes | yes | yes |
| Field Technician | no | no | yes |
| Viewer | no | no | no |

The browser smoke verifies representative readable surfaces and the Field Technician/Viewer financial and Viewer mutation presentation boundaries. Server RLS/RPC authorization remains authoritative.

## Backup Health

The role smoke reads `https://servsync.app/api/storage-backup-health` with a dedicated revocable `SERVSYNC_STORAGE_BACKUP_HEALTH_TOKEN`. This token may read aggregate health only; `/api/storage-backup` continues to accept only `CRON_SECRET`, so the role smoke cannot run a backup.

Health passes only when the source is Production, the latest-success timestamp is no more than 36 hours old, the manifest SHA-256 is valid, failures are zero, and every source object was backed up. The check does not expose object paths and does not replace independent manifest/recovery validation.

Supabase physical-backup inventory is not automated with a long-lived Management API token in v1. Ticket `SU-445711` remains the evidence for the resolved August 9-11 visibility incident. Formal Pro daily-backup RPO wording and automatic hidden-point monitoring remain open provider follow-ups.

## Failure Categories

- `ENVIRONMENT FAILURE`: target/ref/URL/trigger mismatch.
- `CREDENTIAL FAILURE`: required variable absent or authentication rejected.
- `IDENTITY FAILURE`: profile, tenant, membership, role, or active state differs.
- `FIXTURE FAILURE`: required stable record relationship is missing or malformed.
- `AUTHORIZATION FAILURE`: capability or cross-tenant visibility differs.
- `APPLICATION FAILURE`: exact-head build, browser navigation, or runtime surface fails.
- `BACKUP HEALTH FAILURE`: latest-success identity, age, manifest, or completeness fails.
- `PROVIDER/EXTERNAL FAILURE`: the health endpoint cannot return its documented health payload, or Supabase, Vercel, GitHub, or another required provider is unavailable. A valid documented `unhealthy` backup payload remains `BACKUP HEALTH FAILURE`, even when its HTTP status is 5xx.

## Repair Policy

Do not auto-repair. Review the failure category and GitHub run, then use the normal approved environment procedure:

1. Credential: verify the secret name, account status, and approved password-manager source; rotate deliberately if required.
2. Identity: verify Auth user, `profiles`, contractor ownership/team membership, or homeowner profile. Do not change a role merely to pass smoke.
3. Fixture: inspect the exact approved Sandbox fixture and its tenant/status. Recreate only through separately approved non-Production fixture work.
4. Authorization: treat unexpected access as a security incident; compare canonical RPC/RLS behavior before touching UI or data.
5. Application: reproduce against the exact commit and target without broadening to mutation.
6. Backup: inspect the 04:17 UTC Vercel Cron and R2 latest-success/manifest evidence. Never substitute a manual run for natural scheduler evidence.

After a restore, verify all logical identities, expected roles/memberships, homeowner profiles/homes, tenant separation, and aggregate fixture presence before declaring authenticated validation ready. Credential values remain in approved secret stores only; they do not belong in Git, docs, chat, logs, screenshots, traces, or recovery artifacts.

## Local Operator Commands

After loading approved local secret values without printing them:

```bash
npm run test:role-smoke-contract
npm run ops:role-smoke:api
npm run qa:e2e:role-smoke
```

Local/API/manual-dispatch success validates the implementation but is not natural schedule acceptance. Natural-run acceptance is recorded above; future manual runs still do not count as recurring scheduled evidence.
