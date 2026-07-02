# ServSync Go-Live Audit

Date: 2026-06-07
Status refreshed: 2026-06-16

This is the working go-live checklist for ServSync. Treat anything marked `Blocker` as something to resolve before public launch, charging live contractor payments, or accepting broad real-customer usage.

Controlled private beta is not the same as public go-live. Private beta may proceed with known manual/future-facing items if the beta checks in `docs/BETA_READINESS_CHECKLIST.md` pass and testers are told what is manual or not yet built.

## Release Stages

| Stage | Meaning | Current guidance |
| --- | --- | --- |
| Sandbox / Preview QA | Authenticated testing against localhost, Vercel Preview, or sandbox Supabase. | Default place for Playwright and mutating workflow tests. |
| Controlled private beta | Small trusted user group with honest beta messaging and active support. | Requires smoke, RLS/privacy, mobile, account, and core-loop checks. |
| Public go-live | Broader real-customer availability and public marketing confidence. | Requires payment, operational, migration, legal/support, and security hardening. |
| Payment readiness | Ability to charge contractors through Stripe or another processor. | Not complete. Keep payment processing future-facing until implemented and tested. |

## Current Status

- App builds successfully in production.
- Active Vercel project is `serv-sync-app-refresh`.
- Production URL is `https://servsync.app`.
- Supabase is connected through browser-safe `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `.env` files are local-only and must not be tracked by Git.
- Unauthenticated production public smoke is now formalized as a read-only Playwright check for the public landing, legal, and trust routes.
- Home History, invoice-to-Home-History filing v1, and homeowner-only manual Home Reminders v1 are shipped.
- SQL provenance cleanup v1 is tracked in main; do not apply old loose SQL files if encountered elsewhere.
- FB-020 template coverage exists for sanitized SQL rollout evidence, restore drill result capture, storage backup/readiness worksheets, and Edge Function/env/secret restore notes.
- FB-020 backup/restore artifact-ignore guardrails exist for common local generated dumps, exports, query-output, storage-export, and restore-drill output folders/files; this does not verify backup/PITR/storage restore readiness.
- FB-020 non-production restore drill preflight planning exists. A first database-only schema restore drill against an isolated throwaway Supabase project completed safely, including public schema restore and sanitized shape verification, but full data restore stopped because public rows referenced `auth.users` and auth-user restore was not approved. Backup/PITR verification, full data restore, and storage restore verification remain go-live gaps until separately approved and completed.
- FB-020 non-production restore drill operator checklist coverage exists for future go/no-go review; this does not complete a restore drill or verify backup/PITR/storage restore readiness.
- Authenticated production read-only smoke now has required dedicated homeowner and contractor owner smoke credentials configured for local operator use without documenting values. The latest run passed preflight and 2/2 read-only sign-in/navigation tests. Optional role credentials and optional stable smoke record IDs remain future/not configured, and mutation smoke remains unapproved.
- Preview/sandbox remains the default for authenticated testing.
- Stripe has a webhook skeleton and SQL prep, but checkout/payment activation is not complete.
- FB-020 now tracks the broader Security, Records Reliability, Backup/Restore, Storage, and Scale Readiness workstream. It is a backlog/readiness program, not proof that security, backup/restore, production RLS/storage verification, or public go-live readiness is complete.

## FB-020 Readiness Workstream

FB-020 is the umbrella follow-up for the completed security/readiness audit. It should be handled through small, separately approved tasks before broader beta, public go-live, or paid contractor subscriptions.

Baseline operating guidance now lives in `docs/FB-020_OPERATIONS_SECURITY_READINESS_RUNBOOK.md`. That runbook covers backup/restore expectations, storage-object backup expectations, restore drills, applied-SQL tracking, fresh environment rebuild expectations, production smoke account policy, retention/export/deletion/cancellation decisions, and the sandbox-only read-only catalog verification command.

Template-only capture formats for applied-SQL ledgers, production SQL rollouts, restore drill results, storage backup/readiness, and Edge Function/env/secret restore notes live in `docs/FB-020_BACKUP_RESTORE_LEDGER_TEMPLATES.md`. They do not mean a restore drill, PITR verification, storage restore, or production backup validation has been completed.

Non-production restore drill preflight planning lives in `docs/FB-020_RESTORE_DRILL_PREFLIGHT_PLAN.md`. It should be reviewed before any future approved drill, but it does not complete the drill or verify backup/PITR/storage restore readiness.

The operator go/no-go checklist lives in `docs/FB-020_RESTORE_DRILL_OPERATOR_CHECKLIST.md`. It supports a future approved drill but does not run the drill or verify backup/PITR/storage restore readiness by itself.

Latest restore drill evidence as of 2026-07-02: an approved database-only drill used sandbox `zpzdkoaubyjtsomccxya` as the source and throwaway target `servsync-restore-drill-2026-07-02` / `nxzermkvfimtxwkoozfh`. Public schema export and restore completed, and sanitized verification confirmed 66 public tables, 179 public functions, and 66 public RLS-enabled tables on the restored target. Public data restore stopped safely because public rows reference `auth.users`, and auth-user restore was outside the approved scope. Storage was not restored, production was not touched, the throwaway target was deleted, and private local dump/restore artifacts were deleted.

FB-020 covers:

- Deployed RLS and storage policy verification.
- SECURITY DEFINER/RPC authorization review.
- Home documents, private media, signed URL, public bucket, and orphaned storage-object safety.
- Backup/restore runbooks, storage-object backup expectations, and restore drills.
- Data retention, deletion, export, and account-cancellation expectations.
- Records durability, misfiling prevention, duplicate prevention, and immutable/auditable record snapshot strategy.
- Dependency security triage and upgrade planning.
- Pagination, query limits, and 1,000-user performance readiness.

Recommended sequencing:

1. Documentation and policy decisions.
2. Test-only security hardening.
3. Dependency security triage/upgrade.
4. SQL/RLS/storage hardening after explicit approval.
5. App pagination and storage-integrity cleanup.
6. Operational backup/restore and deployed-state verification.

## Historical Changes From Original Audit

The original 2026-06-07 audit recorded the following hardening work:

- Hardened `servsync-stripe-prep.sql`.
  - Removed dependency on a missing `public.contractor_subscription_status` type.
  - Validates subscription status as text against the allowed status list.
  - Revoked browser/client access to Stripe sync RPCs.
  - Grants Stripe sync RPC execution to `service_role` only.

- Hardened `supabase/functions/stripe-webhook/index.ts`.
  - Parses Stripe signature headers more safely.
  - Accepts any valid `v1` signature in the header.
  - Adds a 5-minute replay protection window.
  - Uses timing-safe signature comparison.

- Hardened `supabase/functions/send-notification-email/index.ts`.
  - Requires `NOTIFICATION_WEBHOOK_SECRET` when email sending is enabled.
  - Requires database webhooks to send `x-servsync-webhook-secret`.

- Added `servsync-private-media-storage.sql`.
  - Creates a public `discover-media` bucket for contractor showcase posts.
  - Makes `service-request-media` private for homeowner/contractor request attachments.
  - Makes `inspection-media` private for inspection photos.
  - Adds storage policies so only connected parties, authorized contractor users, or admins can sign private media URLs.

- Updated app media previews.
  - Service request attachments use signed URLs.
  - Inspection photos use signed URLs, including older saved Supabase public URLs that can be converted back into storage paths.
  - Discover feed uploads use the public `discover-media` bucket instead of the private service request bucket.

These items remain useful history. Before public go-live, re-check the actual deployed storage policies, Edge Function secrets, and media behavior rather than assuming the historical audit is complete.

## Controlled Beta Readiness

Controlled private beta can be considered separately from public go-live if all of the following are true:

- `docs/BETA_READINESS_CHECKLIST.md` has been reviewed for the intended beta group.
- `npm run typecheck` and `npm run build` pass.
- Read-only Playwright smoke tests pass against sandbox/preview.
- Mutating sandbox tests pass for affected flows.
- A full sandbox/manual core-loop pass succeeds:
  Homeowner Request -> Contractor Estimate -> Homeowner Approval -> Job -> Completion -> Invoice -> Home History -> Reminder.
- RLS/privacy checks confirm users do not see unrelated user data.
- Mobile core screens are usable enough for trusted beta testers.
- Beta users are told payment processing, automatic reminders, push/email/text alerts, recurrence, QuickBooks, native mobile apps, and full calendar sync are not live.
- Production public smoke passes.
- The unauthenticated production public smoke spec passes without sign-in, secrets, production mutation, SQL/settings changes, or manual deploy.
- Authenticated production smoke uses dedicated approved smoke accounts for read-only navigation only. Required homeowner and contractor owner sign-in/navigation passed in the latest authenticated production read-only smoke run; mutation smoke remains unapproved.

## Blockers Before Public Go-Live

### 1. Stripe checkout is not complete

The webhook can sync subscription status after Stripe events happen, but the app does not yet create Stripe Checkout sessions or expose a Stripe Customer Portal.

Required before charging contractors:

- Create Stripe products/prices.
- Add a secure checkout Edge Function.
- Pass `contractor_id` in Checkout metadata.
- Add Customer Portal for card updates/cancellations.
- Test trialing, active, past_due, canceled, unpaid, and paused states.

### 2. Dependency audit issue needs re-check

The original audit reported that `npm audit --audit-level=moderate` found moderate vulnerabilities through Vite/esbuild related to the development server. This should be re-run before public go-live because dependency state may have changed.

Recommended fix path:

- Re-run `npm audit --audit-level=moderate`.
- Schedule a Vite upgrade pass if still needed.
- Test locally and on Vercel after upgrade.
- Do not run `npm audit fix --force` blindly.

### 3. SQL deployment discipline remains important

The project has many SQL files. Recent SQL provenance cleanup added tracked replacements for known drift, but public go-live still needs a documented migration/deployment process.

Recommended fix path:

- Keep active SQL patches tracked and reviewed.
- Keep old/archive SQL out of active deployment paths.
- Use the reviewed blank-schema sequence as the baseline for fresh environments.
- Consider converting active SQL into Supabase migrations before public launch.
- Document which SQL has been applied to sandbox and production using the sanitized SQL ledger and rollout capture templates.

### 4. Production smoke account policy has required read-only coverage but is not complete

Authenticated production read-only smoke is no longer blocked for the required homeowner and contractor owner smoke accounts. The latest local run of `TEST_APP_URL=https://servsync.app npm run qa:e2e:production-auth-readonly-smoke` passed preflight and 2/2 read-only sign-in/navigation tests without production mutation, SQL, settings changes, or manual deploy.

Before public go-live:

- Store credentials outside the repo.
- Use `npm run qa:production-smoke:check` to check only whether approved production smoke variable names are present locally; this command must not print values, sign in, validate credentials, or contact Supabase.
- Define allowed smoke actions.
- Keep default authenticated production smoke read-only unless a separate prompt approves mutation.
- Decide whether optional role smoke credentials and optional stable smoke record IDs are needed.
- Require exact-ID or approved-prefix scoped cleanup for any approved production smoke records.
- Keep smoke records clearly labeled and separated from real customer records.
- Do not use founder/personal accounts as automated test credentials.
- Do not print or paste ignored/local credential files in reports, PRs, screenshots, traces, logs, or chat; rotate smoke or load-test credentials if a local terminal/session may have exposed them.

## High-Priority Before Public Go-Live

### RLS verification

Run live Supabase or app-level tests for:

- Homeowner cannot read another homeowner profile/home/documents.
- Homeowner cannot read another homeowner invoices, Home History, reminders, service requests, reports, or private files.
- Contractor cannot read homeowner contact/home details unless permissioned.
- Contractor cannot read unrelated contractor records.
- Contractor team member can access only their contractor account.
- Disabled team member loses access.
- Admin can see platform-level records but does not unnecessarily expose private homeowner files.

### Local browser storage

Field work draft state is stored in `localStorage` while the contractor is working. This is useful for avoiding lost work, but it may contain customer/job/report notes on the local device.

Current status:

- Sensitive field-work draft state is cleared on sign-out.
- Lightweight search/selected-customer context keys are also cleared on sign-out.
- Harmless setup, walkthrough, active-tab, and view preferences are preserved.

Future improvement:

- Consider a visible "clear local drafts" control.
- Avoid using shared/public devices for contractor work.

### Edge Function secrets

Confirm these are only in Supabase Edge Function secrets, not Vercel:

- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NOTIFICATION_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `OPENAI_API_KEY` or AI provider keys

Vercel should only have browser-safe variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Legal and support basics

Before public launch:

- Privacy Policy
- Terms of Use
- Data deletion process
- Support email
- Contractor billing terms
- File/document retention language
- Disclaimer that estimates/AI suggestions must be reviewed by contractor

The app currently has legal/trust/support surfaces, but public go-live should include a fresh content and link review.

## Private Media Storage

### Private service-request media

`service-request-media` was prepared to be private. The app requests signed URLs for previews instead of using public links.

Before public launch:

- Re-verify `servsync-private-media-storage.sql` or its tracked successor has been applied in the correct Supabase project.
- Test upload/view from homeowner account.
- Test upload/view from contractor owner account.
- Test upload/view from contractor team member account where applicable.
- Confirm a different homeowner cannot view the signed URL.

### Private inspection/report media

`inspection-media` was prepared to be private with contractor-owned paths and signed preview URLs.

Remaining improvement:

- Add a dedicated inspection media metadata table later if audits/document retention rules need it. The current policy can authorize homeowner reads for finalized inspections, but a metadata table may be cleaner for future governance.

## Stripe Activation Plan

1. Create Stripe account and complete business verification.
2. Create contractor subscription products/prices in test mode.
3. Add a Supabase Edge Function for creating Checkout sessions.
4. Add a Supabase Edge Function or route for Stripe Customer Portal sessions.
5. Run the reviewed Stripe prep SQL in the appropriate Supabase project.
6. Deploy `stripe-webhook`.
7. Set the required Edge Function secrets in Supabase without storing secret values in GitHub or Vercel docs.
8. Add Stripe webhook endpoint:
   - `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
9. Subscribe a test contractor in Stripe test mode.
10. Confirm Supabase `contractor_profiles.subscription_status` updates.
11. Test failed payment/cancellation.
12. Switch to live Stripe products/keys only after test mode passes.

Do not treat Stripe as beta-ready until Checkout, Customer Portal, webhook sync, billing copy, and support expectations are all implemented and tested.

## Cost Watch List

### Expected monthly platform costs

- Vercel Pro: likely needed for commercial use and team/project growth.
- Supabase Pro: likely needed for production database, auth, backups, and storage.
- Stripe: per-transaction processing fees.
- Email provider: notification and onboarding emails.
- AI provider: field note, estimate, and future OCR/document extraction features.

### Homeowner document storage

Current bucket:

- `home-documents`
- Private
- 50 MB per file limit
- Signed URLs

Cost drivers:

- Number of homeowners.
- Average documents per homeowner.
- Average file size.
- How often files are downloaded/viewed.
- Whether photos/PDFs are compressed before upload.

Simple planning math:

- 1,000 homeowners x 100 MB each = about 100 GB.
- 10,000 homeowners x 100 MB each = about 1 TB.
- Storage cost is usually manageable; repeated downloads/egress can become the larger cost.

Recommended guardrails:

- Keep file size limits.
- Compress images before upload when possible.
- Store PDFs efficiently.
- Add storage usage reporting by homeowner/contractor.
- Add a storage backup plan because database backups do not automatically back up storage objects.

## Recommended Next Work Order

For controlled beta:

1. Refresh and follow `docs/BETA_READINESS_CHECKLIST.md`.
2. Stabilize sandbox QA accounts and reusable sandbox data.
3. Run a full sandbox core-loop manual pass.
4. Add the first full core-loop Playwright test.
5. Add RLS/cross-user verification coverage.
6. Add mobile QA coverage or a formal mobile manual checklist.
7. Decide whether production smoke accounts are needed before beta invites.

For public go-live:

1. Complete Stripe Checkout and Customer Portal if charging contractors.
2. Re-run dependency audit and plan safe Vite/dependency upgrades if needed.
3. Continue SQL deployment discipline, ideally through migrations.
4. Re-verify private media storage and signed URL access boundaries.
5. Consider a visible "clear local drafts" control for users on shared devices.
6. Confirm Edge Function secrets are scoped correctly.
7. Re-check legal/support/billing/storage-retention language.
8. Add storage usage reporting for homeowner documents and contractor media.

## References

- Stripe pricing: https://stripe.com/us/pricing
- Supabase pricing: https://supabase.com/pricing
- Supabase storage pricing: https://supabase.com/docs/guides/storage/pricing
- Supabase MAU usage: https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users
- Vercel pricing: https://vercel.com/pricing
