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
}): Stripe.V2.Core.AccountCreateParams {
  return {
    contact_email: input.email || undefined,
    display_name: input.businessName,
    dashboard: 'full',
    defaults: {
      currency: 'usd',
      locales: ['en-US'],
      profile: {
        doing_business_as: input.businessName,
        product_description: 'Home maintenance, inspection, and contractor services billed through ServSync.',
      },
      responsibilities: {
        fees_collector: 'stripe',
        losses_collector: 'stripe',
      },
    },
    identity: { country: 'us' },
    configuration: {
      merchant: {
        capabilities: {
          card_payments: { requested: true },
          ach_debit_payments: { requested: true },
        },
      },
    },
    include: ['configuration.merchant', 'defaults', 'identity', 'requirements'],
    metadata: {
      servsync_contractor_id: input.contractorId,
      servsync_environment: 'sandbox',
      servsync_application_fee_cents: String(SERVSYNC_STRIPE_APPLICATION_FEE_CENTS),
    },
  };
}

export function assertCanonicalConnectedAccount(account: Stripe.V2.Core.Account) {
  if (account.object !== 'v2.core.account' || account.livemode) throw new Error('Connected account mode is incompatible.');
  if (!account.applied_configurations.includes('merchant')) throw new Error('Connected account merchant configuration is missing.');
  if (account.defaults?.responsibilities.fees_collector !== 'stripe') throw new Error('Connected account fee responsibility is incompatible.');
  if (account.defaults?.responsibilities.losses_collector !== 'stripe') throw new Error('Connected account loss responsibility is incompatible.');
  if (account.defaults?.responsibilities.requirements_collector !== 'stripe') throw new Error('Connected account requirement collection is incompatible.');
  if (account.dashboard !== 'full') throw new Error('Connected account dashboard responsibility is incompatible.');
}

export type CanonicalStripeAccountStatus =
  | 'setup_incomplete'
  | 'verification_required'
  | 'payments_pending'
  | 'active'
  | 'restricted';

function canonicalCapabilityStatus(capability: { status: string } | undefined) {
  if (!capability) return 'unrequested' as const;
  if (capability.status === 'active' || capability.status === 'pending') return capability.status;
  return 'inactive' as const;
}

export function canonicalStripeAccountStatus(account: Stripe.V2.Core.Account): CanonicalStripeAccountStatus {
  assertCanonicalConnectedAccount(account);
  const capabilities = account.configuration?.merchant?.capabilities;
  const card = canonicalCapabilityStatus(capabilities?.card_payments);
  const ach = canonicalCapabilityStatus(capabilities?.ach_debit_payments);
  if (card === 'active' && ach === 'active') return 'active';
  if (card === 'inactive' || ach === 'inactive') return 'restricted';
  const requirements = account.requirements?.entries ?? [];
  if (requirements.some(entry => entry.minimum_deadline.status === 'past_due')) return 'verification_required';
  if (requirements.some(entry => entry.awaiting_action_from === 'user')) return 'setup_incomplete';
  return 'payments_pending';
}

export function canonicalStripeAccountSnapshot(account: Stripe.V2.Core.Account) {
  assertCanonicalConnectedAccount(account);
  const requirements = account.requirements?.entries ?? [];
  const capabilities = account.configuration?.merchant?.capabilities;
  const card = canonicalCapabilityStatus(capabilities?.card_payments);
  const ach = canonicalCapabilityStatus(capabilities?.ach_debit_payments);
  return {
    stripe_account_id: account.id,
    mode: 'test' as const,
    account_status: canonicalStripeAccountStatus(account),
    charges_enabled: card === 'active' && ach === 'active',
    // Accounts v2 does not expose a payout-enabled boolean. Stripe owns payout setup in the full Dashboard.
    payouts_enabled: false,
    details_submitted: requirements.every(entry => entry.awaiting_action_from !== 'user'),
    card_payments_status: card,
    ach_payments_status: ach,
    requirements_due_count: requirements.length,
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
