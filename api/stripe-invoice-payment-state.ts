import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { REQUEST_FREE_INVOICE_SESSION_COOKIE } from './request-free-local-invoice-delivery';
import { bearerToken, sameOriginRequest, stripeConnectServerConfig } from '../server/stripeConnect';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SESSION_PATTERN = /^[0-9a-f]{64}$/;

type PaymentState = {
  available: boolean;
  mode?: 'test';
  invoice_id?: string;
  amount_due_cents?: number;
  payment_state?: string;
  payment_method_type?: 'card' | 'us_bank_account' | null;
  application_fee_cents?: 0;
};

type Dependencies = {
  configured: () => boolean;
  authenticatedState: (accessToken: string, invoiceId: string) => Promise<PaymentState>;
  requestFreeState: (sessionDigest: string) => Promise<PaymentState>;
};

function json(body: PaymentState | { reason: string }, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function sessionIdentifier(request: Request) {
  const header = request.headers.get('cookie') ?? '';
  const values = header.split(';').map(value => value.trim()).filter(value => value.startsWith(`${REQUEST_FREE_INVOICE_SESSION_COOKIE}=`));
  if (values.length !== 1) return null;
  const value = values[0].slice(REQUEST_FREE_INVOICE_SESSION_COOKIE.length + 1);
  return SESSION_PATTERN.test(value) ? value : null;
}

function defaultDependencies(): Dependencies {
  const config = stripeConnectServerConfig();
  const service = config ? createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  }) : null;
  return {
    configured: () => Boolean(config && service),
    authenticatedState: async (accessToken, invoiceId) => {
      if (!config) throw new Error('unconfigured');
      const user = createClient(config.supabaseUrl, config.serviceRoleKey, {
        auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
      });
      const { data, error } = await user.rpc('servsync_get_invoice_online_payment_state', { p_invoice_id: invoiceId });
      if (error || !data || typeof data !== 'object') throw new Error('unavailable');
      return data as PaymentState;
    },
    requestFreeState: async sessionDigest => {
      if (!service) throw new Error('unconfigured');
      const { data, error } = await service.rpc('servsync_get_request_free_invoice_online_payment_state', {
        p_session_digest: sessionDigest,
      });
      if (error || !data || typeof data !== 'object') throw new Error('unavailable');
      return data as PaymentState;
    },
  };
}

export function createStripeInvoicePaymentStateHandler(dependencies: Dependencies = defaultDependencies()) {
  return async function handler(request: Request) {
    if (request.method !== 'POST') return json({ reason: 'method_not_allowed' }, 405);
    if (!sameOriginRequest(request)) return json({ reason: 'forbidden' }, 403);
    if (!dependencies.configured()) return json({ available: false });
    let parsed: unknown;
    try { parsed = await request.json(); } catch { return json({ reason: 'invalid_request' }, 400); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json({ reason: 'invalid_request' }, 400);
    const input = parsed as Record<string, unknown>;
    if (Object.keys(input).sort().join(',') !== 'channel,invoice_id') return json({ reason: 'invalid_request' }, 400);
    if (input.channel !== 'authenticated' && input.channel !== 'request_free') return json({ reason: 'invalid_request' }, 400);

    try {
      if (input.channel === 'authenticated') {
        const token = bearerToken(request);
        if (!token || typeof input.invoice_id !== 'string' || !UUID_PATTERN.test(input.invoice_id)) return json({ available: false });
        return json(await dependencies.authenticatedState(token, input.invoice_id));
      }
      const session = sessionIdentifier(request);
      if (!session || input.invoice_id !== null) return json({ available: false });
      return json(await dependencies.requestFreeState(createHash('sha256').update(session).digest('hex')));
    } catch {
      return json({ available: false });
    }
  };
}

const handler = createStripeInvoicePaymentStateHandler();
export default { fetch: handler };

