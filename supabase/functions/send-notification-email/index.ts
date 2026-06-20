// ServSync — send-notification-email edge function
// Called by a Supabase database webhook on notifications INSERT.
//
// To activate:
//   1. Deploy:  supabase functions deploy send-notification-email
//   2. Set env vars in Supabase dashboard (Project Settings → Edge Functions):
//        EMAIL_ENABLED=true
//        NOTIFICATION_WEBHOOK_SECRET=<long-random-secret>
//        RESEND_API_KEY=re_xxxxx        ← or swap for any provider below
//        EMAIL_FROM=noreply@yourapp.com
//   3. Create a database webhook on public.notifications INSERT pointing here.
//      Add header: x-servsync-webhook-secret: <same long-random-secret>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface WebhookPayload {
  type: 'INSERT';
  table: string;
  record: {
    id: string;
    user_id: string;
    type: string;
    title: string;
    body: string;
    request_id: string | null;
    created_at: string;
  };
}

// Email Notifications v1 — only these in-app notification types send an email.
// Any other notification type is in-app only. Keyed by notifications.type.
const EMAIL_V1_EVENTS: Record<string, { subject: string; intro: string }> = {
  homeowner_request: {
    subject: 'New service request on ServSync',
    intro: 'A homeowner sent you a new service request.',
  },
  estimate_sent: {
    subject: 'Your estimate is ready on ServSync',
    intro: 'A contractor sent you an estimate to review.',
  },
  estimate_accepted: {
    subject: 'Your estimate was approved on ServSync',
    intro: 'A homeowner approved one of your estimates.',
  },
  invoice_sent: {
    subject: 'You have a new invoice on ServSync',
    intro: 'A contractor sent you an invoice.',
  },
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function invalidPayload(reason: string): Response {
  console.warn(`[send-notification-email] Invalid webhook payload: ${reason}.`);
  return jsonResponse({ sent: false, reason: 'invalid_payload' }, 400);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(record: Record<string, unknown>, field: string, allowEmpty = false): string | null {
  const value = record[field];
  if (typeof value !== 'string') return null;
  if (!allowEmpty && value.trim() === '') return null;
  return value;
}

async function parseWebhookPayload(req: Request): Promise<WebhookPayload | Response> {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return invalidPayload('request body is not valid JSON');
  }

  if (!isObject(payload)) return invalidPayload('payload is not an object');
  if (payload.type !== 'INSERT') return invalidPayload('event is not INSERT');
  if (payload.table !== 'notifications') return invalidPayload('table is not notifications');
  if (!isObject(payload.record)) return invalidPayload('record is not an object');

  const userId = readRequiredString(payload.record, 'user_id');
  const type = readRequiredString(payload.record, 'type');
  const title = readRequiredString(payload.record, 'title');
  const body = readRequiredString(payload.record, 'body', true);

  if (!userId) return invalidPayload('missing user_id');
  if (!type) return invalidPayload('missing type');
  if (!title) return invalidPayload('missing title');
  if (body === null) return invalidPayload('missing body');

  return {
    type: 'INSERT',
    table: 'notifications',
    record: {
      id: typeof payload.record.id === 'string' ? payload.record.id : '',
      user_id: userId,
      type,
      title,
      body,
      request_id: typeof payload.record.request_id === 'string' ? payload.record.request_id : null,
      created_at: typeof payload.record.created_at === 'string' ? payload.record.created_at : '',
    },
  };
}

async function safeProviderJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const value = await res.json();
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function providerFailure(provider: string, status: number): Response {
  console.error(`[send-notification-email] ${provider} send failed with status ${status}.`);
  return jsonResponse({ sent: false, provider, reason: 'provider_error', status }, 502);
}

function providerSuccess(provider: string, status: number, result?: Record<string, unknown> | null): Response {
  console.log(`[send-notification-email] ${provider} send accepted with status ${status}.`);
  const providerId = typeof result?.id === 'string' ? result.id : undefined;
  return jsonResponse({ sent: true, provider, status, ...(providerId ? { provider_id: providerId } : {}) });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const EMAIL_ENABLED = Deno.env.get('EMAIL_ENABLED') === 'true';
  const WEBHOOK_SECRET = Deno.env.get('NOTIFICATION_WEBHOOK_SECRET') ?? '';

  if (!EMAIL_ENABLED) {
    console.log('[send-notification-email] Disabled — set EMAIL_ENABLED=true to activate.');
    return jsonResponse({ sent: false, reason: 'disabled' });
  }

  if (!WEBHOOK_SECRET) {
    console.error('[send-notification-email] Missing NOTIFICATION_WEBHOOK_SECRET.');
    return new Response('Webhook secret is not configured', { status: 500 });
  }

  if (req.headers.get('x-servsync-webhook-secret') !== WEBHOOK_SECRET) {
    console.error('[send-notification-email] Invalid webhook secret.');
    return new Response('Unauthorized', { status: 401 });
  }

  const parsedPayload = await parseWebhookPayload(req);
  if (parsedPayload instanceof Response) return parsedPayload;

  const payload = parsedPayload;
  const { user_id, type, title, body } = payload.record;

  // Email Notifications v1: only send for the in-scope event types. All other
  // notification types remain in-app only.
  const eventCopy = EMAIL_V1_EVENTS[type];
  if (!eventCopy) {
    console.log(`[send-notification-email] Skipping type "${type}" — not in Email v1 scope.`);
    return jsonResponse({ sent: false, reason: 'event_not_in_v1_scope' });
  }

  // Look up recipient email and preference using service role
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: userProfile, error: profileError } = await supabase
    .from('profiles')
    .select('email, full_name, email_notifications_enabled')
    .eq('id', user_id)
    .single();

  if (profileError) {
    console.error('[send-notification-email] Unable to load recipient profile.');
    return jsonResponse({ sent: false, reason: 'profile_lookup_failed' }, 500);
  }

  if (!userProfile?.email_notifications_enabled) {
    console.log('[send-notification-email] Recipient has email notifications disabled.');
    return jsonResponse({ sent: false, reason: 'user_opted_out' });
  }

  if (typeof userProfile.email !== 'string' || userProfile.email.trim() === '') {
    console.error('[send-notification-email] Recipient profile has no email address.');
    return jsonResponse({ sent: false, reason: 'missing_recipient_email' }, 500);
  }

  const recipientEmail = userProfile.email;
  const recipientName = userProfile.full_name || 'ServSync user';
  const fromAddress = Deno.env.get('EMAIL_FROM') ?? 'noreply@servsync.app';

  // ── Resend (recommended — free tier available at resend.com) ──────────────
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  if (RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: recipientEmail,
        subject: eventCopy.subject,
        html: buildEmailHtml(recipientName, title, eventCopy.intro, body),
      }),
    });
    const result = await safeProviderJson(res);
    if (!res.ok) return providerFailure('resend', res.status);
    return providerSuccess('resend', res.status, result);
  }

  // ── SendGrid fallback ─────────────────────────────────────────────────────
  const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');
  if (SENDGRID_API_KEY) {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: recipientEmail, name: recipientName }] }],
        from: { email: fromAddress, name: 'ServSync' },
        subject: eventCopy.subject,
        content: [{ type: 'text/html', value: buildEmailHtml(recipientName, title, eventCopy.intro, body) }],
      }),
    });
    if (!res.ok) return providerFailure('sendgrid', res.status);
    return providerSuccess('sendgrid', res.status);
  }

  console.log('[send-notification-email] EMAIL_ENABLED=true but no provider key found.');
  return jsonResponse({ sent: false, reason: 'no_provider_key' });
});

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildEmailHtml(name: string, title: string, intro: string, body: string): string {
  const safeName = escapeHtml(name);
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro);
  const safeBody = escapeHtml(body).replaceAll('\n', '<br />');
  // Only show the context line when it adds something beyond the intro.
  const contextLine = safeBody && safeBody !== safeIntro
    ? `<p style="font-size:15px;line-height:1.55;color:#223d67;margin:0 0 24px;">${safeBody}</p>`
    : '';

  return `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f7f9fc;color:#223d67;padding:32px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e1e3e7;border-radius:14px;padding:32px;">
    <p style="font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#0078ff;margin:0 0 8px;">ServSync</p>
    <h1 style="font-size:21px;font-weight:700;color:#02132d;margin:0 0 12px;">${safeTitle}</h1>
    <p style="font-size:15px;line-height:1.55;color:#223d67;margin:0 0 ${contextLine ? '12px' : '24px'};">${safeIntro}</p>
    ${contextLine}
    <a href="https://servsync.app" style="display:inline-block;background:#0078ff;color:#fff;font-size:14px;font-weight:600;padding:10px 20px;border-radius:10px;text-decoration:none;">Open ServSync</a>
    <hr style="border:none;border-top:1px solid #e1e3e7;margin:24px 0;" />
    <p style="font-size:12px;line-height:1.45;color:#64748b;margin:0;">Hi ${safeName}, you're receiving this because you have email notifications enabled. You can turn them off in your ServSync profile settings.</p>
  </div>
</body>
</html>`;
}
