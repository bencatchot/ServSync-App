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
- Home History, invoice-to-Home-History filing v1, and homeowner-only manual Home Reminders v1 are shipped.
- SQL provenance cleanup v1 is tracked in main; do not apply old loose SQL files if encountered elsewhere.
- Authenticated production smoke is intentionally skipped unless dedicated production smoke accounts are approved.
- Preview/sandbox remains the default for authenticated testing.
- Stripe has a webhook skeleton and SQL prep, but checkout/payment activation is not complete.

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
- Authenticated production smoke is skipped or uses dedicated approved production smoke accounts only.

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
- Document which SQL has been applied to sandbox and production.

### 4. Production smoke account policy is not complete

Authenticated production smoke currently remains intentionally skipped unless dedicated production smoke accounts are created.

Before public go-live:

- Decide whether production smoke accounts will exist.
- Store credentials outside the repo.
- Define allowed smoke actions.
- Keep smoke records clearly labeled and separated from real customer records.
- Do not use founder/personal accounts as automated test credentials.

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

Field work draft state is stored in `localStorage`. This is useful for avoiding lost work, but it may contain customer/job/report notes on the local device.

Recommended fix:

- Clear sensitive local draft state on sign-out.
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
5. Add sign-out cleanup for sensitive local draft storage.
6. Confirm Edge Function secrets are scoped correctly.
7. Re-check legal/support/billing/storage-retention language.
8. Add storage usage reporting for homeowner documents and contractor media.

## References

- Stripe pricing: https://stripe.com/us/pricing
- Supabase pricing: https://supabase.com/pricing
- Supabase storage pricing: https://supabase.com/docs/guides/storage/pricing
- Supabase MAU usage: https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users
- Vercel pricing: https://vercel.com/pricing
