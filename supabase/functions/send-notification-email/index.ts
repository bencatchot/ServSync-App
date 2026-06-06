// ServSync — send-notification-email edge function
// Called by a Supabase database webhook on notifications INSERT.
//
// To activate:
//   1. Deploy:  supabase functions deploy send-notification-email
//   2. Set env vars in Supabase dashboard (Project Settings → Edge Functions):
//        EMAIL_ENABLED=true
//        RESEND_API_KEY=re_xxxxx        ← or swap for any provider below
//        EMAIL_FROM=noreply@yourapp.com
//   3. Create a database webhook on public.notifications INSERT pointing here.

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

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const EMAIL_ENABLED = Deno.env.get('EMAIL_ENABLED') === 'true';

  if (!EMAIL_ENABLED) {
    console.log('[send-notification-email] Disabled — set EMAIL_ENABLED=true to activate.');
    return new Response(JSON.stringify({ sent: false, reason: 'disabled' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const payload: WebhookPayload = await req.json();
  const { user_id, title, body } = payload.record;

  // Look up recipient email and preference using service role
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: userProfile } = await supabase
    .from('profiles')
    .select('email, full_name, email_notifications_enabled')
    .eq('id', user_id)
    .single();

  if (!userProfile?.email_notifications_enabled) {
    console.log(`[send-notification-email] User ${user_id} has email notifications disabled.`);
    return new Response(JSON.stringify({ sent: false, reason: 'user_opted_out' }), {
      headers: { 'Content-Type': 'application/json' },
    });
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
        subject: title,
        html: buildEmailHtml(recipientName, title, body),
      }),
    });
    const result = await res.json();
    console.log('[send-notification-email] Resend result:', result);
    return new Response(JSON.stringify({ sent: true, provider: 'resend', result }), {
      headers: { 'Content-Type': 'application/json' },
    });
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
        subject: title,
        content: [{ type: 'text/html', value: buildEmailHtml(recipientName, title, body) }],
      }),
    });
    console.log('[send-notification-email] SendGrid status:', res.status);
    return new Response(JSON.stringify({ sent: true, provider: 'sendgrid', status: res.status }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  console.log('[send-notification-email] EMAIL_ENABLED=true but no provider key found.');
  return new Response(JSON.stringify({ sent: false, reason: 'no_provider_key' }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

function buildEmailHtml(name: string, title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#0f172a;color:#e2e8f0;padding:32px;">
  <div style="max-width:520px;margin:0 auto;background:#1e293b;border-radius:16px;padding:32px;">
    <p style="font-size:13px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:#3b82f6;margin:0 0 8px;">ServSync</p>
    <h1 style="font-size:20px;font-weight:700;color:#fff;margin:0 0 12px;">${title}</h1>
    <p style="font-size:14px;color:#94a3b8;margin:0 0 24px;">${body}</p>
    <a href="https://servsync.app" style="display:inline-block;background:#3b82f6;color:#fff;font-size:14px;font-weight:600;padding:10px 20px;border-radius:10px;text-decoration:none;">Open ServSync</a>
    <hr style="border:none;border-top:1px solid #334155;margin:24px 0;" />
    <p style="font-size:11px;color:#475569;margin:0;">Hi ${name} — you're receiving this because you have email notifications enabled. You can turn them off in your ServSync profile settings.</p>
  </div>
</body>
</html>`;
}
