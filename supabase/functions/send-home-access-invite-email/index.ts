// ServSync - send-home-access-invite-email edge function scaffold.
//
// This function is intentionally disabled by default. It validates an
// authenticated browser request, asks the database for a sanitized delivery
// payload, and only calls an email provider when explicitly enabled via
// HOME_ACCESS_INVITE_EMAIL_ENABLED=true.

type EnvReader = (name: string) => string | undefined;
type Fetcher = typeof fetch;
type DeliveryStatus = 'sent' | 'failed' | 'disabled';
type DenoLike = {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

export type PreparedHomeAccessInviteDelivery = {
  delivery_enabled?: boolean;
  route_hint?: string;
  invite_id?: string;
  home_id?: string;
  invited_email?: string;
  role?: string;
  home_display_label?: string;
  city?: string | null;
  state?: string | null;
  inviter_display_label?: string | null;
  expires_at?: string;
  delivery_status?: string;
  delivery_attempt_count?: number;
};

type HandlerDeps = {
  env?: EnvReader;
  fetch?: Fetcher;
};

const ALLOWED_ORIGINS = new Set([
  'https://servsync.app',
  'https://www.servsync.app',
  'https://serv-sync-app-refresh.vercel.app',
  'https://serv-sync-app.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function envFromDeno(name: string) {
  const denoRuntime = (globalThis as typeof globalThis & { Deno?: DenoLike }).Deno;
  return denoRuntime?.env.get(name);
}

export function corsHeadersFor(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://servsync.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function cleanString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeEnvFlag(value: string | undefined) {
  return value?.trim().toLowerCase() === 'true';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeProviderErrorCode(status: number) {
  if (status === 401 || status === 403) return 'provider_auth_failed';
  if (status === 429) return 'provider_rate_limited';
  if (status >= 500) return 'provider_unavailable';
  return 'provider_error';
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeAppUrl(value: string | undefined) {
  const candidate = cleanString(value, 'https://servsync.app');
  if (!candidate.startsWith('https://') && !candidate.startsWith('http://localhost')) {
    return 'https://servsync.app';
  }
  return candidate.replace(/\/+$/, '');
}

function formatLocation(city?: string | null, state?: string | null) {
  return [cleanString(city), cleanString(state)].filter(Boolean).join(', ');
}

function parseProviderId(value: unknown) {
  return isRecord(value) && typeof value.id === 'string' ? value.id.slice(0, 200) : '';
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function rpcJson(
  fetcher: Fetcher,
  supabaseUrl: string,
  key: string,
  authorization: string,
  rpcName: string,
  body: Record<string, unknown>,
) {
  const res = await fetcher(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: authorization,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await safeJson(res);
  if (!res.ok) {
    return { ok: false as const, status: res.status, payload };
  }
  return { ok: true as const, status: res.status, payload };
}

async function recordDeliveryResult(
  fetcher: Fetcher,
  env: EnvReader,
  inviteId: string,
  deliveryStatus: DeliveryStatus,
  providerMessageId: string | null,
  errorCode: string | null,
) {
  const supabaseUrl = cleanString(env('SUPABASE_URL'));
  const serviceRoleKey = cleanString(env('SUPABASE_SERVICE_ROLE_KEY'));
  if (!supabaseUrl || !serviceRoleKey) return;

  await rpcJson(
    fetcher,
    supabaseUrl,
    serviceRoleKey,
    `Bearer ${serviceRoleKey}`,
    'servsync_record_home_access_invite_delivery_result',
    {
      p_invite_id: inviteId,
      p_delivery_status: deliveryStatus,
      p_provider_message_id: providerMessageId,
      p_error_code: errorCode,
    },
  );
}

export function buildHomeAccessInviteEmail(prepared: PreparedHomeAccessInviteDelivery, appUrlInput = 'https://servsync.app') {
  const appUrl = normalizeAppUrl(appUrlInput);
  const inviter = cleanString(prepared.inviter_display_label, 'A homeowner');
  const homeLabel = cleanString(prepared.home_display_label, 'a shared home');
  const role = cleanString(prepared.role, 'member');
  const location = formatLocation(prepared.city, prepared.state);
  const locationLine = location ? `Location: ${location}` : 'Location: shown in ServSync after sign-in';
  const signInUrl = `${appUrl}/homeowner`;

  const text = `ServSync Home Access invitation

${inviter} invited you to access ${homeLabel} as a ${role}.
${locationLine}

Sign in or create a homeowner account with the invited email address to review the invitation:
${signInUrl}

If you were not expecting this invitation, you can ignore this email.

Privacy Policy: ${appUrl}/privacy
Terms of Use: ${appUrl}/terms
Trust & Safety: ${appUrl}/trust`;

  const html = `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f7f9fc;color:#223d67;padding:32px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e1e3e7;border-radius:14px;padding:32px;">
    <p style="font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#0078ff;margin:0 0 8px;">ServSync</p>
    <h1 style="font-size:21px;font-weight:700;color:#02132d;margin:0 0 12px;">ServSync Home Access invitation</h1>
    <p style="font-size:15px;line-height:1.55;color:#223d67;margin:0 0 12px;">${escapeHtml(inviter)} invited you to access <strong>${escapeHtml(homeLabel)}</strong> as a ${escapeHtml(role)}.</p>
    <p style="font-size:15px;line-height:1.55;color:#223d67;margin:0 0 24px;">${escapeHtml(locationLine)}</p>
    <p style="font-size:15px;line-height:1.55;color:#223d67;margin:0 0 24px;">Sign in or create a homeowner account with the invited email address to review the invitation.</p>
    <a href="${escapeHtml(signInUrl)}" style="display:inline-block;background:#0078ff;color:#fff;font-size:14px;font-weight:600;padding:10px 20px;border-radius:10px;text-decoration:none;">Open ServSync</a>
    <hr style="border:none;border-top:1px solid #e1e3e7;margin:24px 0;" />
    <p style="font-size:12px;line-height:1.45;color:#64748b;margin:0;">If you were not expecting this invitation, you can ignore this email.</p>
    <p style="font-size:12px;color:#94a3b8;margin-top:20px"><a href="${escapeHtml(appUrl)}/privacy" style="color:#64748b">Privacy Policy</a> &middot; <a href="${escapeHtml(appUrl)}/terms" style="color:#64748b">Terms of Use</a> &middot; <a href="${escapeHtml(appUrl)}/trust" style="color:#64748b">Trust &amp; Safety</a></p>
  </div>
</body>
</html>`;

  return {
    subject: 'ServSync Home Access invitation',
    text,
    html,
  };
}

export async function handleHomeAccessInviteEmailRequest(req: Request, deps: HandlerDeps = {}) {
  const headers = corsHeadersFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405, headers);

  const env = deps.env ?? envFromDeno;
  const fetcher = deps.fetch ?? fetch;
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ ok: false, error: 'not_authenticated' }, 401, headers);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_request' }, 400, headers);
  }

  const inviteId = isRecord(body) && typeof body.invite_id === 'string' ? body.invite_id.trim() : '';
  if (!UUID_RE.test(inviteId)) {
    return jsonResponse({ ok: false, error: 'invalid_invite' }, 400, headers);
  }

  const supabaseUrl = cleanString(env('SUPABASE_URL'));
  const anonKey = cleanString(env('SUPABASE_ANON_KEY'));
  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ ok: false, error: 'temporarily_unavailable' }, 503, headers);
  }

  const preparedResult = await rpcJson(
    fetcher,
    supabaseUrl,
    anonKey,
    authHeader,
    'servsync_prepare_home_access_invite_delivery',
    { p_invite_id: inviteId },
  );

  if (!preparedResult.ok || !isRecord(preparedResult.payload)) {
    return jsonResponse({ ok: false, error: 'unable_to_prepare_delivery' }, preparedResult.status >= 500 ? 503 : 400, headers);
  }

  const prepared = preparedResult.payload as PreparedHomeAccessInviteDelivery;
  const deliveryEnabled = normalizeEnvFlag(env('HOME_ACCESS_INVITE_EMAIL_ENABLED')) && prepared.delivery_enabled === true;
  if (!deliveryEnabled) {
    return jsonResponse({ ok: true, delivery_enabled: false }, 200, headers);
  }

  if (!cleanString(env('SUPABASE_SERVICE_ROLE_KEY'))) {
    return jsonResponse({ ok: false, delivery_enabled: true, status: 'unable_to_send' }, 503, headers);
  }

  const resendApiKey = cleanString(env('RESEND_API_KEY'));
  const fromEmail = cleanString(env('EMAIL_FROM'));
  if (!resendApiKey || !fromEmail) {
    await recordDeliveryResult(fetcher, env, inviteId, 'failed', null, 'provider_not_configured');
    return jsonResponse({ ok: false, delivery_enabled: true, status: 'unable_to_send' }, 503, headers);
  }

  const recipientEmail = cleanString(prepared.invited_email);
  if (!recipientEmail || !recipientEmail.includes('@')) {
    await recordDeliveryResult(fetcher, env, inviteId, 'failed', null, 'missing_recipient');
    return jsonResponse({ ok: false, delivery_enabled: true, status: 'unable_to_send' }, 400, headers);
  }

  const email = buildHomeAccessInviteEmail(prepared, env('APP_URL'));
  const providerRes = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [recipientEmail],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });

  const providerPayload = await safeJson(providerRes);
  if (!providerRes.ok) {
    await recordDeliveryResult(fetcher, env, inviteId, 'failed', null, safeProviderErrorCode(providerRes.status));
    return jsonResponse({ ok: false, delivery_enabled: true, status: 'unable_to_send' }, 502, headers);
  }

  await recordDeliveryResult(fetcher, env, inviteId, 'sent', parseProviderId(providerPayload), null);
  return jsonResponse({ ok: true, delivery_enabled: true, status: 'request_accepted' }, 200, headers);
}

const denoRuntime = (globalThis as typeof globalThis & { Deno?: DenoLike }).Deno;
if (denoRuntime) {
  denoRuntime.serve((req) => handleHomeAccessInviteEmailRequest(req));
}
