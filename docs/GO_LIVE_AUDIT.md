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

## Blockers Before Go-Live

### 1. Public service-request media

`service-request-media` is currently public so the app can use `getPublicUrl()`.
That is convenient, but not ideal for sensitive homeowner photos or contractor
attachments. Anyone with a file URL could view the file.

Recommended fix:
- Make the bucket private.
- Replace public URLs with signed URLs.
- Keep metadata access controlled through `service_request_media` RLS.

### 2. Public inspection media with broad storage policies

`inspection-media` is public and currently lets any authenticated user upload or
delete objects in that bucket. The metadata/inspection records are protected, but
the raw storage bucket needs tighter ownership rules.

Recommended fix:
- Make the bucket private.
- Store files under a contractor-owned folder path.
- Restrict upload/delete to that contractor or authorized team member.
- Use signed URLs in reports and app previews.

### 3. Stripe checkout is not complete

The webhook can sync subscription status after Stripe events happen, but the app
does not yet create Stripe Checkout sessions or expose a Stripe Customer Portal.

Required before charging contractors:
- Create Stripe products/prices.
- Add a secure checkout Edge Function.
- Pass `contractor_id` in Checkout metadata.
- Add Customer Portal for card updates/cancellations.
- Test trialing, active, past_due, canceled, unpaid, and paused states.

### 4. Dependency audit issue

`npm audit --audit-level=moderate` reports 2 moderate vulnerabilities through
Vite/esbuild. The issue is related to the development server. The audit suggests
a forced major upgrade, which may be breaking.

Recommended fix:
- Schedule a Vite upgrade pass.
- Test locally and on Vercel after upgrade.
- Do not run `npm audit fix --force` blindly.

### 5. SQL deployment is still manual

The project has many SQL files. Manually pasting SQL into Supabase is workable
for development, but risky before go-live because it is hard to know which SQL
has been applied.

Recommended fix:
- Convert the active SQL files into Supabase migrations.
- Keep old/archive SQL out of the active migration path.
- Use one documented migration order for production.

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

1. Make `service-request-media` private and migrate app previews to signed URLs.
2. Make `inspection-media` private and restrict ownership policies.
3. Add Stripe Checkout and Customer Portal Edge Functions.
4. Convert active SQL into Supabase migrations.
5. Upgrade Vite safely and rerun `npm audit`.
6. Add sign-out cleanup for sensitive local draft storage.

## References

- Stripe pricing: https://stripe.com/us/pricing
- Supabase pricing: https://supabase.com/pricing
- Supabase storage pricing: https://supabase.com/docs/guides/storage/pricing
- Supabase MAU usage: https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users
- Vercel pricing: https://vercel.com/pricing
