# Practice within existing Demo resources — read-only assessment

Owner constraint: **no additional Supabase or Vercel projects**. This supersedes the earlier separate-project recommendation. PR #588 remains a local prototype; this document proposes shared-environment work for later review, not permission to deploy it.

## Recommendation

Use the existing `servsync-demo` Vercel project for an owner-only Practice entry and its PR Preview for review, backed by a private Practice schema in the existing ServSync Demo database. Keep Practice identities, content, receipts and cleanup separate from staff Demo fixture records. Begin with synthetic business data. Same-login snapshots and real live Draft transfer are subsequent integration gates, not something hosting the prototype automatically provides.

A Vercel Preview is a deployment environment of a project, not a separate database. Its URL does not prove data isolation. Reusing the ordinary app's arbitrary Preview is less clear than the dedicated Demo project because the app has branch-specific backend settings and production domains. Do not change those settings for this work.

This is conditional feasibility, not a claim that the current Demo architecture already provides a safe customer Practice service. Sharing a database and Vercel project also shares operational limits, privileged administration and some failure/security scope. Separate schemas cannot protect against database administrators or a sufficiently privileged common runtime. If that compromise is unacceptable for real contractor snapshots, retain a synthetic owner-review experience within the no-new-project constraint rather than claiming stronger isolation.

## Observed evidence — 2026-10-16

Read-only connected-tool checks established:

- Vercel `servsync-demo` is project `prj_tB94FLcorqX9sW7EGPd7t32Z4rdS` in `bencatchots-projects`. It has the durable `servsync-demo.vercel.app` domain and ready PR Preview deployments. Vercel authentication protection is configured as `all_except_custom_domains`; this is not contractor authorization.
- Its `VITE_SERVSYNC_DEMO_PROJECT_REF` names `bdytwgejqnlblhrnqxkp`. The same `VITE_SUPABASE_URL` variable targets both production and preview; the URL itself is classified sensitive and was not returned decrypted. Repository runbook and prior Demo validation identify that ref as the backend. Hosted acceptance must independently verify the selected deployment's actual requests before writes.
- The Demo project environment listing returned seven client-facing configuration entries and no server/provider secret entries. This does not prove that all integrations are disabled: Edge Function settings and any inherited/provider configuration were not decrypted.
- `serv-sync-app-refresh` is a different existing project, serving `servsync.app`; it has default Preview backend variables plus branch-specific overrides. Its Preview should not be assumed disposable. The `servsync-stripe-sandbox` project name returned not-found in this connector's selected team, although PR checks and repository documentation reference it; its current ownership/access is unresolved and it is not required for this recommendation.
- Supabase ServSync Demo is active/healthy in `us-east-1`, PostgreSQL 17.6.1.141, in the existing Prevention Pros Pro organization. Database size was 33,803,411 bytes (about 32.2 MiB). This is measured database size, not a verified compute/IOPS/load capacity forecast. Allocated compute size, current team spend and unused usage allowances were not exposed by the checked metadata.
- Demo has 162 public tables, all with RLS enabled; no Practice schema exists. `service_role` bypasses RLS. No `pg_cron`, `pg_net` or `http` extension was installed, and no `cron.job` table exists. No DB-native scheduled reset was found through these checks. External CI/manual runs and Vercel schedules remain distinct.
- Deployed reset/register/start/finish functions are service-role executable, denied to `anon` and `authenticated`. The deployed reset allowlist accepts only explicit `public` table names and registered row IDs; it rejects other schemas. The Draft-first reset includes lineage and inbound-FK checks. These facts were checked from actual function definitions and execution grants, not solely the repository.
- Notification triggers are deployed on connections, messages, appointments, quotes, estimates, support messages and invoices. These are real workflow behaviors, not disabled by a visual Demo label.
- The `marketing-content-draft` Edge Function is active with JWT verification. No function invocation occurred.
- SQL role settings did not disclose the current PostgREST exposed-schema list. It remains an explicit deployment configuration check; do not treat a null setting as proof that a schema is private.

Repository checks, independently reviewed:

- `servsync-demo-mode-foundation.sql`, `servsync-demo-recorder-flagship-fixture-registry.sql`: registered-row reset and public-table allowlists. Practice must stay outside the reset registry.
- `scripts/demo/seed-demo-scenario.mjs`: fixed synthetic identities/company are reconciled/upserted on seed; the runner forbids external-operation flags and credentials in its own environment. These runner checks do not sandbox every other API route.
- `api/send-local-estimate-email.ts`, `api/send-finalized-report-email.ts`: provider paths depend on available configuration, with no general Practice exclusion.
- `server/stripeConnect.ts`: explicit Sandbox project and Stripe test-key guard; this is not a general Practice guard.
- `server/marketingPublishingWorker.ts`: Demo is an allowed project. `vercel.json` declares marketing-publication, media-cleanup and storage-backup schedules. Declaration does not prove each worker has the configuration to run successfully.
- `server/storageBackup.ts`: backup inventory includes buckets. Practice storage must not be silently swept into a different backup/retention policy.

## Concrete changes needed before hosted review

1. Write a new reviewed migration explicitly scoped to the existing Demo project and a private Practice schema. Keep the current disposable installation guard intact; do not remove its `auth`/database-name protections to make it install on Supabase. Adapt the transport and actor binding rather than shipping the local postgres/Unix-socket harness.
2. Define dedicated least-privilege server and recovery capabilities. Revoke implicit public/anon/authenticated/service-role access to Practice where appropriate; establish a non-login owner and explicit grants/default privileges. Audit security-definer functions and avoid using the shared broad service key as the Practice identity. Ordinary users must be unable to access expired rows even through alternate APIs.
3. Add a restricted Practice API/entry within the existing Vercel project. Build only the intended Practice client surface and use Practice-only sessions. Exclude provider endpoints and public lifecycle writes. Shared project-level secrets are a residual common-runtime risk; a UI route prefix or a restricted database credential alone does not contain arbitrary server-code execution. Document that boundary and prove normal/request-level denial.
4. Keep Practice rows independent of resettable Demo auth/profile/customer/home rows: no cascading FKs or reused fixture IDs. Use an opaque validated owner/business binding. Test actual reset/seed SQL against disposable replicas containing Practice fixtures and prove it cannot mutate them.
5. Initially generate PDFs in the browser. If retained files are later required, use a private scoped bucket with explicit policies, limits and separate backup/cleanup rules. Never reuse a public Demo bucket or source object pointer.
6. Implement same-login handoff through the live origin: a short-lived one-use authorization exchange, exact destination, current ownership checks, revocation, session expiry and CSRF/origin checks. Do not copy live browser tokens or seed real users into Demo fixtures. Build the allowlisted business/Price Book/template exporter; preserve required customer-facing fields and saved Practice Draft values on refresh.
7. Keep real transfer approval in the live authenticated app. Revalidate customer/property assignment, pricing/tax and permissions; create one unsent Draft plus immutable operation identity atomically. The local destination proves a contract, not the real importer. Shared Demo must never hold a production write credential.
8. Approve retention operations separately: expiry RLS, bounded recovery, scheduled cleanup, finite metadata pruning, permanent destination provenance and backup/restore treatment. No purge or scheduler is enabled by this assessment.

## Cost and capacity

Reusing these projects adds **no new project baseline fee**. It can still add database disk/compute load, egress, builds, function execution and backup usage. No current invoice or unused Vercel allowance was verified, so a $0 incremental bill is not promised. Do not change organization-wide spending controls in a way that could interrupt other projects.

Use a small owner-only pilot and measure storage/query/runtime usage with existing tools before broader access. The current configured content ceilings alone are roughly 91 MiB per cycle before indexes/WAL/backups (50 Draft payloads + 20 transfer payloads + 1 snapshot + 20 MiB files). The UI currently does not retain generated PDFs server-side. Actual typical usage should be substantially smaller but has not been measured. Expiry access enforcement alone does not reclaim disk; cleanup and backup policy matter.

Official cost references: https://supabase.com/pricing ; https://supabase.com/docs/guides/platform/cost-control ; https://vercel.com/docs/plans/pro-plan . Supabase spend caps do not cover compute and are not a per-project arbitrary-dollar budget. No purchase, plan upgrade or new resource was performed.

## Status

No shared migration, deployed authentication/policy change, credential, production copy, provisioning, provider action or purge was performed. Existing Demo reuse is the recommended next design target under Ben's constraint. Hosting, persistent access changes and real-account/live-import acceptance remain pending explicit review and approval. No further sidebar investigation is required.
