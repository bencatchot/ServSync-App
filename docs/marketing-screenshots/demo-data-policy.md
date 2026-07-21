# Demo Data Policy

ServSync marketing screenshots must use fake, non-production data only.

## Required Rules

- Do not use real homeowner, contractor, customer, address, phone, invoice, estimate, document, message, or media data.
- Do not run demo setup or screenshot capture against production.
- Do not create Supabase auth users automatically without a separate approval.
- Do not use service-role keys without a separate approval.
- Do not apply SQL or change Supabase, Vercel, auth, RLS, storage, permission, or environment settings.
- Do not commit screenshot output, auth state, session artifacts, credentials, or local env files.
- Do not imply contractor verification, guaranteed leads, automated matching, payment processing, public marketplace scale, or any feature that is not implemented.

## Visible Data Style

Visible screenshot data should look natural and fictional. Avoid labels such as `E2E`, `test`, random IDs, debug labels, placeholder text, or real customer-looking private data copied from outside ServSync.

Approved style examples:

- Homeowner: Emily Smith and John Smith.
- Contractor: Michael Turner.
- Business: Harborview Plumbing Co.
- Home: Smith Residence.
- Region: Fairhope, Daphne, Spanish Fort, Mobile Bay.
- Emails: `example.com` demo addresses.
- Phone numbers: safe fictional `555-0100` style numbers.

## Repeatability

Demo setup should be idempotent where practical:

- Reuse stable demo emails.
- Query for existing demo records before creating new records.
- Update matching records instead of creating duplicates.
- Match by owner/user plus natural titles or email addresses.
- Keep any reset/delete behavior behind a separate explicit approval.

## Screenshot Review

Before using screenshots publicly, review each image for:

- Real or private data leakage.
- Test/debug wording.
- Unimplemented feature claims.
- Incorrect marketplace, verification, payment, email, text, push, or automation claims.
- Broken layouts on desktop, tablet, mobile, and social crops.
