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

function corsHeadersFor(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://servsync.app',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

const baseCorsHeaders = {
  'Access-Control-Allow-Origin': 'https://servsync.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
};

function jsonResponse(body: unknown, status = 200, headers = baseCorsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function cleanString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) return jsonResponse({ error: 'RESEND_API_KEY is not configured.' }, 500, corsHeaders);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Not authenticated.' }, 401, corsHeaders);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      return jsonResponse({ error: 'Supabase environment is not configured.' }, 500, corsHeaders);
    }

    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: authHeader },
    });
    const user = await userRes.json();
    const userId = typeof user?.id === 'string' ? user.id : '';
    if (!userRes.ok || !userId) return jsonResponse({ error: 'Not authenticated.' }, 401, corsHeaders);

    const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles?select=role,email&id=eq.${userId}&limit=1`, {
      headers: {
        apikey: supabaseServiceRoleKey,
        Authorization: `Bearer ${supabaseServiceRoleKey}`,
      },
    });
    const profiles = await profileRes.json();
    const role = Array.isArray(profiles) ? profiles[0]?.role : undefined;
    if (role !== 'platform_admin') {
      return jsonResponse({
        error: 'Only platform admins can send onboarding emails.',
        details: { signedInEmail: user?.email || null, profileRole: role || null },
      }, 403, corsHeaders);
    }

    const body = await req.json();
    const email = cleanString(body.email).toLowerCase();
    const customerName = cleanString(body.customerName, 'your property');
    const ownerName = cleanString(body.ownerName, 'there');
    const onboardingLink = cleanString(body.onboardingLink);

    if (!email || !email.includes('@')) return jsonResponse({ error: 'Missing valid customer email.' }, 400, corsHeaders);
    if (!onboardingLink.startsWith('https://')) return jsonResponse({ error: 'Missing valid onboarding link.' }, 400, corsHeaders);

    const replyToEmail = cleanString(Deno.env.get('REPLY_TO_EMAIL'));
    const brandLogoUrl = cleanString(Deno.env.get('BRAND_LOGO_URL'));
    const logoHtml = brandLogoUrl ? `<p style="margin:0 0 18px"><img src="${brandLogoUrl}" alt="Prevention Pros" style="max-width:170px;height:auto;display:block" /></p>` : '';
    const subject = `Home profile setup for Prevention Pros`;
    const text = `Hi ${ownerName},

Here is the link to finish setting up your Prevention Pros home profile for ${customerName}:

${onboardingLink}

This helps me keep your home details, preferred vendors, reports, invoices, and future service notes organized in one place.

If you have any trouble opening the link, just reply to this email and I’ll help.

Thank you,
Ben Catchot
Prevention Pros LLC
preventionprosllc.com

Privacy Policy: https://preventionpros.app/#/privacy
Terms of Use: https://preventionpros.app/#/terms`;
    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.55;color:#1f2937;max-width:620px;margin:0 auto;padding:24px">
        ${logoHtml}
        <p>Hi ${ownerName},</p>
        <p>Here is the link to finish setting up your Prevention Pros home profile for <strong>${customerName}</strong>:</p>
        <p style="margin:24px 0">
          <a href="${onboardingLink}" style="background:#2563eb;color:white;text-decoration:none;padding:11px 16px;border-radius:8px;font-weight:600;display:inline-block">Open home profile</a>
        </p>
        <p>This helps me keep your home details, preferred vendors, reports, invoices, and future service notes organized in one place.</p>
        <p style="font-size:14px;color:#475569">If the button does not open, copy and paste this link into your browser:</p>
        <p style="word-break:break-all;color:#2563eb;font-size:14px">${onboardingLink}</p>
        <p>If you have any trouble opening the link, just reply to this email and I’ll help.</p>
        <p style="margin-top:28px">Thank you,<br/>Ben Catchot<br/>Prevention Pros LLC<br/><span style="color:#64748b">preventionprosllc.com</span></p>
        <p style="font-size:12px;color:#94a3b8;margin-top:20px"><a href="https://preventionpros.app/#/privacy" style="color:#64748b">Privacy Policy</a> · <a href="https://preventionpros.app/#/terms" style="color:#64748b">Terms of Use</a></p>
      </div>
    `;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Ben Catchot <ben@preventionpros.app>',
        to: [email],
        subject,
        html,
        text,
        ...(replyToEmail ? { reply_to: replyToEmail } : {}),
      }),
    });

    const resendJson = await resendRes.json();
    if (!resendRes.ok) {
      console.error('Resend error', resendJson);
      return jsonResponse({ error: 'Email sending failed.', details: resendJson }, 502, corsHeaders);
    }

    return jsonResponse({ ok: true, id: resendJson.id }, 200, corsHeaders);
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unknown error' }, 500, corsHeaders);
  }
});
