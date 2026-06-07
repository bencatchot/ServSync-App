# ServSync Go-Live Audit

Date: 2026-06-07

This is the working go-live checklist for ServSync. Treat anything marked
`Blocker` as something to resolve before accepting real customer data or live
contractor payments.

## Current Status

- App builds successfully in production.
- Supabase is connected through `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `.env` is present locally but is not tracked by Git.
- Homeowner documents use a private `home-documents` storage bucket with signed URLs.
- Stripe has a webhook skeleton and SQL prep, but checkout/payment activation is not complete.

## Changes Made During This Audit

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
  - Service request attachments now use signed URLs.
  - Inspection photos now use signed URLs, including older saved Supabase public URLs that can be converted back into storage paths.
  - Discover feed uploads now use the public `discover-media` bucket instead of the private service request bucket.

## Blockers Before Go-Live

### 1. Stripe checkout is not complete

The webhook can sync subscription status after Stripe events happen, but the app
does not yet create Stripe Checkout sessions or expose a Stripe Customer Portal.

Required before charging contractors:
- Create Stripe products/prices.
- Add a secure checkout Edge Function.
- Pass `contractor_id` in Checkout metadata.
- Add Customer Portal for card updates/cancellations.
- Test trialing, active, past_due, canceled, unpaid, and paused states.

### 2. Dependency audit issue

`npm audit --audit-level=moderate` reports 2 moderate vulnerabilities through
Vite/esbuild. The issue is related to the development server. The audit suggests
a forced major upgrade, which may be breaking.

Recommended fix:
- Schedule a Vite upgrade pass.
- Test locally and on Vercel after upgrade.
- Do not run `npm audit fix --force` blindly.

### 3. SQL deployment is still manual

The project has many SQL files. Manually pasting SQL into Supabase is workable
for development, but risky before go-live because it is hard to know which SQL
has been applied.

Recommended fix:
- Convert the active SQL files into Supabase migrations.
- Keep old/archive SQL out of the active migration path.
- Use one documented migration order for production.

## Recently Reduced Risks

### Private service-request media

`service-request-media` is now prepared to be private. The app requests signed
URLs for previews instead of using public links.

Before launch:
- Run `servsync-private-media-storage.sql` in the correct Supabase project.
- Test upload/view from the homeowner account.
- Test upload/view from the contractor owner account.
- Test upload/view from a contractor team member account.
- Confirm a different homeowner cannot view the signed URL.

### Private inspection media

`inspection-media` is now prepared to be private with contractor-owned paths and
signed preview URLs.

Remaining improvement:
- Add a dedicated inspection media metadata table later. The current policy can
  authorize homeowner reads for finalized inspections, but a metadata table will
  be cleaner for audits and future document retention rules.

## High-Priority Before Go-Live

### RLS verification

Run live Supabase tests for:
- Homeowner cannot read another homeowner profile/home/documents.
- Contractor cannot read homeowner contact/home details unless permissioned.
- Contractor team member can access only their contractor account.
- Disabled team member loses access.
- Admin can see platform-level records but does not unnecessarily expose private homeowner files.

### Local browser storage

Field work draft state is stored in `localStorage`. This is useful for avoiding
lost work, but it may contain customer/inspection notes on the local device.

Recommended fix:
- Clear sensitive local draft state on sign-out.
- Consider a visible "clear local drafts" control.
- Avoid using shared/public devices for contractor work.

### Edge function secrets

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

Before launch:
- Privacy Policy
- Terms of Use
- Data deletion process
- Support email
- Contractor billing terms
- File/document retention language
- Disclaimer that estimates/AI suggestions must be reviewed by contractor

## Stripe Activation Plan

1. Create Stripe account and complete business verification.
2. Create contractor subscription products/prices in test mode.
3. Add a Supabase Edge Function for creating Checkout sessions.
4. Add a Supabase Edge Function or route for Stripe Customer Portal sessions.
5. Run `servsync-stripe-prep.sql` in Supabase.
6. Deploy `stripe-webhook`.
7. Set Edge Function secrets:
   - `STRIPE_ENABLED=true`
   - `STRIPE_WEBHOOK_SECRET=whsec_...`
   - `SUPABASE_SERVICE_ROLE_KEY=...`
8. Add Stripe webhook endpoint:
   - `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
9. Subscribe a test contractor.
10. Confirm Supabase `contractor_profiles.subscription_status` updates.
11. Test failed payment/cancellation.
12. Switch to live Stripe products/keys after test mode passes.

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

1. Run and verify `servsync-private-media-storage.sql` in Supabase.
2. Add Stripe Checkout and Customer Portal Edge Functions.
3. Convert active SQL into Supabase migrations.
4. Upgrade Vite safely and rerun `npm audit`.
5. Add sign-out cleanup for sensitive local draft storage.
6. Add storage usage reporting for homeowner documents and contractor media.

## References

- Stripe pricing: https://stripe.com/us/pricing
- Supabase pricing: https://supabase.com/pricing
- Supabase storage pricing: https://supabase.com/docs/guides/storage/pricing
- Supabase MAU usage: https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users
- Vercel pricing: https://vercel.com/pricing
