# ServSync Stripe Connect Online Payments Foundation v1

## Status

This foundation is limited to Stripe test mode and ServSync Sandbox project `zpzdkoaubyjtsomccxya`. Production and Demo online payment creation remain disabled. Nothing in this foundation authorizes live connected accounts, live Checkout Sessions, real money movement, application fees, payouts, refunds, or disputes administration.

## Current Stripe Model

ServSync uses Stripe's current controller-property connected-account configuration rather than the legacy `Standard`, `Express`, or `Custom` `type` field:

- `controller.fees.payer = account`
- `controller.losses.payments = stripe`
- `controller.requirement_collection = stripe`
- `controller.stripe_dashboard.type = full`
- requested capabilities: `card_payments` and `us_bank_account_ach_payments`

ServSync creates Checkout Sessions in the connected-account context as direct charges. The charge and balance transaction live on the contractor's connected account. ServSync does not use destination charges, transfers, `on_behalf_of`, or an application fee. The v1 application fee is fixed at `$0` in server parameters and database constraints.

This contract is based on Stripe's current documentation for [Accounts v2 configuration](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration), [direct charges](https://docs.stripe.com/connect/direct-charges), [direct-charge fee behavior](https://docs.stripe.com/connect/direct-charges-fee-payer-behavior), [hosted onboarding](https://docs.stripe.com/connect/hosted-onboarding), and [ACH Direct Debit](https://docs.stripe.com/payments/ach-direct-debit). Any future change to fee payer, loss responsibility, dashboard responsibility, or charge type requires a new security and commercial review.

## Financial Authority

ServSync Invoices remain authoritative. Checkout creation derives the exact outstanding Invoice balance, contractor, connected account, currency, customer binding, and delivery channel from persisted ServSync state. The browser cannot choose an amount or connected account.

Online attempts reconcile into the same `invoices.amount_paid_cents` and Invoice status used by the append-only offline-payment ledger. Card or ACH settlement produces the same Invoice, Deposit, and Estimate billing result as the same amount recorded offline. Offline payments remain available when no online payment is open or processing. Deposit status continues to have no effect on Job creation authority.

## Provider Lifecycle

Stripe-hosted Checkout collects card or bank details. ServSync never receives raw card, CVV, bank-account, or bank-login data.

- Card and completed ACH events are posted only from a signed Stripe Connect webhook.
- ACH initiation remains `Processing`; a redirect never marks an Invoice paid.
- Signed failures and cancellations release the online attempt without posting money.
- Refund and dispute events can reduce previously posted online amounts so a later provider reversal does not leave an Invoice falsely paid.
- Event IDs are idempotent. Provider timestamps and explicit lifecycle precedence prevent older or equal-time lower-authority events from regressing settled state.

Provider event payloads are not stored. Private rows retain only bounded Stripe identifiers, safe status, amounts, timestamps, and idempotency references needed for reconciliation.

## Access And Configuration

Only an active contractor Owner can initiate or continue hosted connected-account onboarding. Admin and Office retain their existing Invoice authority but cannot change payout-provider ownership. Field Technician and Viewer gain no payment configuration or mutation authority.

The server requires all of the following before any Stripe API call:

- `SERVSYNC_STRIPE_CONNECT_TEST_ENABLED=true`
- `SERVSYNC_STRIPE_CONNECT_MODE=test`
- `SERVSYNC_STRIPE_CONNECT_PROJECT_REF=zpzdkoaubyjtsomccxya`
- Sandbox `SUPABASE_URL`
- a server-only `sk_test_` Stripe key
- the server-only Supabase service-role credential
- a signed Connect webhook secret for webhook handling

The project-ref and Supabase-host checks are immutable. A Production or Demo URL, a live key, a missing firewall rate-limit rule, or absent provider configuration fails closed. Browser bundles contain none of these secrets. Production cannot be activated by a client feature flag.

## Sandbox Webhook Operations

Stripe TEST Connect events use the dedicated Vercel project `servsync-stripe-sandbox` and the durable endpoint `https://servsync-stripe-sandbox.vercel.app/api/stripe-connect-webhook`. The deployment tracks reviewed `main` source and is configured only for Sandbox Supabase project `zpzdkoaubyjtsomccxya`; it is not a Production or Demo payment deployment.

Stripe destination `we_1U3HrQLOR9Oxz0Uz26pT9N15` is named `ServSync Sandbox Connect`, receives events from connected accounts, and listens only for the payment/account events handled by the current reconciliation boundary: `account.updated`; Checkout completion, asynchronous result, and expiration events; PaymentIntent processing, success, failure, and cancellation events; and charge success, failure, refund, and dispute lifecycle events. Destination-specific signing material and all provider/database credentials remain server-only Vercel configuration.

The previous destination used a protected PR Preview alias ending in `codex-str-1383fb` and returned Vercel authentication responses before the webhook handler ran. That preview alias is not an operational webhook target and is absent from the active Stripe destination list. Future webhook destinations must use a durable environment-specific server project or alias, must retain the exact Sandbox identity gates above, and must never point TEST events at Production or Demo.

## Rollout And Future Gate

The repository foundation is `servsync-stripe-connect-online-payments-foundation.sql` (SHA-256 `41a6a6fcd69fa8a171d3a9477efc5513def40c3a3d3d3a05169f74f504b2a374`). Sandbox, Production, and Demo also have `servsync-stripe-connect-provider-payment-id-compatibility.sql` (SHA-256 `f03eb5b754132501629fc6594b78fd8c6708085f646187026489d3dd20f064df`), which accepts Stripe's current `py_` ACH payment record identifiers alongside canonical `ch_` charge identifiers while rejecting other prefixes and refusing to normalize an unvalidated or drifted prior constraint.

Provider-backed Sandbox TEST acceptance is complete. One ServSync-created controller-property account reached Active with card and ACH capabilities, Stripe as fee and loss collector, Stripe requirement collection, and the full Stripe Dashboard. Hosted direct-charge card success/failure, ACH Processing-to-Paid and Processing-to-Failed, signed webhook delivery, invalid-signature denial, duplicate-event idempotency, mixed offline/online accounting, and full test refund reversal reconciled into the existing Invoice ledger. The connected-account Dashboard showed the card charge, its Stripe processing fee, and net proceeds on that account; application fee, destination, transfer data, and `on_behalf_of` were absent. Disposable ServSync records are removed after acceptance; Stripe may retain clearly labeled TEST provider objects and events.

The provider-neutral schema is applied in Sandbox, Production, and Demo. Production and Demo have zero Stripe account mappings, payment attempts, or provider-event rows, and no Stripe configuration was added; immutable server gates keep onboarding, Checkout, and webhook reconciliation fail closed there. Production Pay Online remains disabled. Live activation requires a later owner decision covering live credentials, real contractor onboarding, operational webhooks, support, receipts, refunds, disputes, chargebacks, and launch monitoring.
