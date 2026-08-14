# FB-016 Recurring Authenticated Role Smoke & Fixture Health v1

## Purpose

This daily operational check detects credential, identity, fixture, authorization, application, environment, and Storage-backup drift before unrelated feature work encounters it. It is read-only. It does not replace periodic mutating core-loop tests or recovery drills.

## Schedule And Evidence

GitHub Actions workflow `.github/workflows/fb016-recurring-role-smoke.yml` runs at `05:23 UTC` daily, after the Production Storage backup scheduled for `04:17 UTC`. `workflow_dispatch` exists for mechanical validation and incident diagnosis, but only an event with `GITHUB_EVENT_NAME= schedule` counts as natural scheduler evidence.

Each run retains sanitized JSON for 30 days with the GitHub run/attempt identity, trigger, environment, check names, pass/fail counts, and bounded failure summaries. Do not upload Playwright traces, videos, screenshots, HTML reports, raw network captures, emails, record identifiers, object paths, or tokens. Those artifacts can contain authenticated request headers or private fixture content.

The schedule becomes active only from the default branch. A manual dispatch from a PR validates mechanics but cannot satisfy the first-natural-run merge gate for this slice.

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
- `PROVIDER/EXTERNAL FAILURE`: Supabase, Vercel, GitHub, or another required provider is unavailable.

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

Local/API/manual-dispatch success validates the implementation but is not natural schedule acceptance.
