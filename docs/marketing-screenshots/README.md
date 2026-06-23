# ServSync Marketing Screenshots

This folder documents the non-production-only tooling for preparing fake demo data and capturing marketing screenshots.

The tooling is designed for preview, staging, sandbox, or localhost environments only. It must never run against `servsync.app`, `www.servsync.app`, production Supabase, real users, real customers, or real homeowner/contractor records.

## Demo Accounts

Create the demo auth users manually in the sandbox or preview environment before running setup or screenshot capture. This tooling does not create Supabase auth users.

Required account variables:

```bash
MARKETING_DEMO_HOMEOWNER_EMAIL=emily.smith.demo@example.com
MARKETING_DEMO_HOMEOWNER_PASSWORD=...
MARKETING_DEMO_CONTRACTOR_EMAIL=michael.turner.demo@example.com
MARKETING_DEMO_CONTRACTOR_PASSWORD=...
```

Demo emails must use `example.com` addresses.

## Demo Data Setup

The setup script defaults to dry-run mode and requires an explicit confirmation variable even for dry runs:

```bash
SERVSYNC_ALLOW_DEMO_DATA_SETUP=true \
TEST_APP_URL=https://your-preview-url.vercel.app \
npm run demo:data:setup
```

To apply data to approved non-production demo accounts:

```bash
SERVSYNC_ALLOW_DEMO_DATA_SETUP=true \
TEST_APP_URL=https://your-preview-url.vercel.app \
npm run demo:data:setup -- --apply
```

The script signs in with the manually created demo users and prepares fake demo records through the normal browser-safe Supabase client and existing app/RPC paths where practical. It does not use service-role access, create auth users, apply SQL, upload files/media, or change Supabase/Vercel settings.

Current setup coverage:

- Homeowner profile.
- Home/property profile.
- Contractor business profile.
- Contractor service areas when available.
- Contractor local customer and local home.
- Contractor estimate and invoice records for the local demo customer.
- Homeowner service request only when an active demo homeowner-contractor connection already exists.

Skipped by design:

- Auth user creation.
- Real email/SMS/push delivery.
- Payment records.
- File/media uploads.
- Discover marketplace claims.
- Production data.

## Screenshot Capture

Use the dedicated Playwright config:

```bash
TEST_APP_URL=https://your-preview-url.vercel.app \
npm run screenshots:marketing
```

Screenshots are written to `marketing-screenshots/`, which is ignored by git.

Configured viewport projects:

- Desktop: `1440x1000`
- Tablet: `834x1112`
- Mobile: `390x844`
- Social crop: `1200x630`

Captured areas include public landing/auth screens plus contractor and homeowner dashboard/workspace screens when the corresponding demo credentials and tabs are available.

## Safety Checks

The tooling blocks:

- Production app hosts: `servsync.app`, `www.servsync.app`
- The known production Supabase project ref
- Missing `TEST_APP_URL`
- Missing demo setup confirmation for data setup
- Non-`example.com` demo account emails

Run the built-in guard self-check with:

```bash
npm run demo:data:setup -- --check-production-blocks
```
