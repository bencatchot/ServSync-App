import Stripe from 'stripe';

export const SERVSYNC_STRIPE_SANDBOX_PROJECT_REF = 'zpzdkoaubyjtsomccxya';
export const SERVSYNC_STRIPE_APPLICATION_FEE_CENTS = 0;
export const SERVSYNC_STRIPE_PAYMENT_METHODS = ['card', 'us_bank_account'] as const;

export type StripeConnectServerConfig = {
  secretKey: string;
  webhookSecret: string;
  supabaseUrl: string;
  serviceRoleKey: string;
  projectRef: string;
};

function projectRefFromUrl(value: string) {
  try {
    const hostname = new URL(value).hostname;
    const suffix = '.supabase.co';
    return hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : '';
  } catch {
    return '';
  }
}

export function stripeConnectServerConfig(
  environment: NodeJS.ProcessEnv = process.env,
  options: { webhook?: boolean } = {},
): StripeConnectServerConfig | null {
  const enabled = environment.SERVSYNC_STRIPE_CONNECT_TEST_ENABLED?.trim() === 'true';
  const mode = environment.SERVSYNC_STRIPE_CONNECT_MODE?.trim();
  const projectRef = environment.SERVSYNC_STRIPE_CONNECT_PROJECT_REF?.trim() ?? '';
  const secretKey = environment.STRIPE_SECRET_KEY?.trim() ?? '';
  const webhookSecret = environment.STRIPE_CONNECT_WEBHOOK_SECRET?.trim() ?? '';
  const supabaseUrl = environment.SUPABASE_URL?.trim() ?? '';
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';

  if (!enabled || mode !== 'test') return null;
  if (projectRef !== SERVSYNC_STRIPE_SANDBOX_PROJECT_REF) return null;
  if (projectRefFromUrl(supabaseUrl) !== SERVSYNC_STRIPE_SANDBOX_PROJECT_REF) return null;
  if (!secretKey.startsWith('sk_test_') || secretKey.length < 20) return null;
  if (!serviceRoleKey) return null;
  if (options.webhook && (!webhookSecret.startsWith('whsec_') || webhookSecret.length < 16)) return null;

  return { secretKey, webhookSecret, supabaseUrl, serviceRoleKey, projectRef };
}

export function createStripeClient(secretKey: string) {
  return new Stripe(secretKey, {
    maxNetworkRetries: 2,
    telemetry: false,
  });
}

export function canonicalConnectedAccountCreateParams(input: {
  contractorId: string;
  businessName: string;
  email: string;
}): Stripe.AccountCreateParams {
  return {
    country: 'US',
    default_currency: 'usd',
    email: input.email || undefined,
    business_profile: {
      name: input.businessName,
      product_description: 'Home maintenance, inspection, and contractor services billed through ServSync.',
    },
    capabilities: {
      card_payments: { requested: true },
      us_bank_account_ach_payments: { requested: true },
    },
    controller: {
      fees: { payer: 'account' },
      losses: { payments: 'stripe' },
      requirement_collection: 'stripe',
      stripe_dashboard: { type: 'full' },
    },
    metadata: {
      servsync_contractor_id: input.contractorId,
      servsync_environment: 'sandbox',
      servsync_application_fee_cents: String(SERVSYNC_STRIPE_APPLICATION_FEE_CENTS),
    },
  };
}

export function assertCanonicalConnectedAccount(account: Stripe.Account) {
  if (account.controller?.fees?.payer !== 'account') throw new Error('Connected account fee responsibility is incompatible.');
  if (account.controller?.losses?.payments !== 'stripe') throw new Error('Connected account loss responsibility is incompatible.');
  if (account.controller?.requirement_collection !== 'stripe') throw new Error('Connected account requirement collection is incompatible.');
  if (account.controller?.stripe_dashboard?.type !== 'full') throw new Error('Connected account dashboard responsibility is incompatible.');
}

export type CanonicalStripeAccountStatus =
  | 'setup_incomplete'
  | 'verification_required'
  | 'payments_pending'
  | 'active'
  | 'restricted';

export function canonicalStripeAccountStatus(account: Stripe.Account): CanonicalStripeAccountStatus {
  assertCanonicalConnectedAccount(account);
  const card = account.capabilities?.card_payments ?? 'inactive';
  const ach = account.capabilities?.us_bank_account_ach_payments ?? 'inactive';
  if (account.charges_enabled && card === 'active' && ach === 'active') return 'active';
  if (account.requirements?.disabled_reason) return 'restricted';
  if ((account.requirements?.past_due?.length ?? 0) > 0) return 'verification_required';
  if (!account.details_submitted || (account.requirements?.currently_due?.length ?? 0) > 0) return 'setup_incomplete';
  return 'payments_pending';
}

export function canonicalStripeAccountSnapshot(account: Stripe.Account) {
  assertCanonicalConnectedAccount(account);
  return {
    stripe_account_id: account.id,
    mode: 'test' as const,
    account_status: canonicalStripeAccountStatus(account),
    charges_enabled: account.charges_enabled,
    payouts_enabled: account.payouts_enabled,
    details_submitted: account.details_submitted,
    card_payments_status: account.capabilities?.card_payments ?? 'inactive',
    ach_payments_status: account.capabilities?.us_bank_account_ach_payments ?? 'inactive',
    requirements_due_count:
      (account.requirements?.currently_due?.length ?? 0)
      + (account.requirements?.past_due?.length ?? 0)
      + (account.requirements?.pending_verification?.length ?? 0),
    fees_collector: 'stripe' as const,
    losses_collector: 'stripe' as const,
    dashboard_type: 'full' as const,
  };
}

export function sameOriginRequest(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function bearerToken(request: Request) {
  const match = /^Bearer\s+([^\s]+)$/i.exec(request.headers.get('authorization')?.trim() ?? '');
  return match?.[1] ?? null;
}

export function publicOrigin(request: Request) {
  return new URL(request.url).origin;
}
