import { createClient } from '@supabase/supabase-js';

export const MAX_REPORT_EMAIL_REQUEST_BYTES = 2_048;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export type ReportEmailAttempt = {
  id: string;
  delivery_link_id: string;
  recipient_email: string;
  status: 'sending' | 'sent' | 'failed';
  attempted_at: string;
  sent_at: string | null;
  failed_at: string | null;
  failure_code: string | null;
  attempted_by_name: string;
};

export type PreparedReportEmailDelivery = {
  token: string;
  attempt_id: string;
  delivery_link_id: string;
  recipient_email: string;
  expires_at: string;
  contractor_business_name: string;
  customer_display_name: string;
  report_title: string;
  property_label: string;
};

type SendInput = { inspection_id: string; recipient_email: string; expires_days: number };
type ProviderMessage = { from: string; to: string[]; subject: string; html: string; text: string };
type ProviderResult = { ok: true; id: string } | { ok: false; errorCode: 'provider_rejected' | 'provider_rate_limited' | 'provider_unavailable' };

export type ReportEmailHandlerDependencies = {
  configurationAvailable: () => boolean;
  prepare: (accessToken: string, input: SendInput) => Promise<PreparedReportEmailDelivery>;
  send: (message: ProviderMessage) => Promise<ProviderResult>;
  record: (attemptId: string, status: 'sent' | 'failed', providerMessageId: string | null, failureCode: string | null) => Promise<ReportEmailAttempt>;
  fromAddress: () => string;
  publicOrigin: (request: Request) => string;
};

class RequestTooLargeError extends Error {}

function json(body: Record<string, unknown>, status: number, extraHeaders: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Cache-Control': 'no-store, private', 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  });
}

async function readBoundedBody(request: Request) {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_REPORT_EMAIL_REQUEST_BYTES) throw new RequestTooLargeError();
  }
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REPORT_EMAIL_REQUEST_BYTES) {
        try { await reader.cancel(); } catch { /* Best-effort cancellation. */ }
        throw new RequestTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(body);
}

function parseInput(raw: string): SendInput | null {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(',') !== 'expires_days,inspection_id,recipient_email') return null;
  if (typeof record.inspection_id !== 'string' || !UUID_PATTERN.test(record.inspection_id)) return null;
  if (typeof record.recipient_email !== 'string') return null;
  const recipient = record.recipient_email.trim().toLowerCase();
  if (recipient.length < 3 || recipient.length > 254 || !EMAIL_PATTERN.test(recipient)) return null;
  if (!Number.isInteger(record.expires_days) || Number(record.expires_days) < 1 || Number(record.expires_days) > 90) return null;
  return { inspection_id: record.inspection_id, recipient_email: recipient, expires_days: Number(record.expires_days) };
}

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  return /^Bearer\s+([^\s]+)$/i.exec(authorization)?.[1] ?? null;
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function displayText(value: string, fallback: string) {
  const normalized = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 160) || fallback;
}

function formatExpiration(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid report delivery expiration.');
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export function buildFinalizedReportDeliveryEmail(prepared: PreparedReportEmailDelivery, reportUrl: string, from: string): ProviderMessage {
  const businessName = displayText(prepared.contractor_business_name, 'Your contractor');
  const customerName = displayText(prepared.customer_display_name, 'Customer');
  const reportTitle = displayText(prepared.report_title, 'Finalized report');
  const propertyLabel = displayText(prepared.property_label, 'your property');
  const expiration = formatExpiration(prepared.expires_at);
  const safeBusiness = escapeHtml(businessName);
  const safeCustomer = escapeHtml(customerName);
  const safeTitle = escapeHtml(reportTitle);
  const safeProperty = escapeHtml(propertyLabel);
  const safeExpiration = escapeHtml(expiration);
  const safeUrl = escapeHtml(reportUrl);
  return {
    from,
    to: [prepared.recipient_email],
    subject: `${businessName} sent you a finalized report`,
    text: [
      `Hello ${customerName},`, '',
      `${businessName} sent you the finalized report “${reportTitle}” for ${propertyLabel}.`,
      `View the report: ${reportUrl}`, '',
      `This secure document-specific link expires ${expiration}. Viewing it does not acknowledge, approve, or sign the report.`, '',
      'ServSync',
    ].join('\n'),
    html: `<!doctype html>
<html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#172033">
  <div style="display:none;max-height:0;overflow:hidden">${safeBusiness} sent you a finalized report.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:28px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #dbe3ef;border-radius:8px;overflow:hidden">
      <tr><td style="background:#0b5cab;padding:22px 28px;color:#fff;font-size:20px;font-weight:700">ServSync</td></tr>
      <tr><td style="padding:30px 28px">
        <p style="margin:0 0 12px;font-size:16px">Hello ${safeCustomer},</p>
        <h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;color:#172033">Your finalized report is ready</h1>
        <p style="margin:0 0 8px;line-height:1.6"><strong>${safeBusiness}</strong> sent you <strong>${safeTitle}</strong>.</p>
        <p style="margin:0 0 22px;color:#526784;line-height:1.6">Property: ${safeProperty}</p>
        <p style="margin:0 0 24px"><a href="${safeUrl}" style="display:inline-block;background:#0078ff;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:6px">View Report</a></p>
        <p style="margin:0;color:#526784;font-size:13px;line-height:1.6">This document-specific link expires ${safeExpiration}. Viewing it does not acknowledge, approve, or sign the report. Do not forward the link.</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`,
  };
}

function requiredServerConfig() {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() && process.env.RESEND_API_KEY?.trim());
}

function userClient(accessToken: string) {
  return createClient(process.env.SUPABASE_URL!.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(), {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function serviceRoleClient() {
  return createClient(process.env.SUPABASE_URL!.trim(), process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(), {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function prepareWithAuthenticatedCaller(accessToken: string, input: SendInput) {
  const { data, error } = await userClient(accessToken).rpc('servsync_prepare_finalized_report_email_delivery', {
    p_inspection_id: input.inspection_id,
    p_recipient_email: input.recipient_email,
    p_expires_days: input.expires_days,
  });
  if (error || !data || typeof data !== 'object') throw new Error('Report email preparation failed.');
  return data as PreparedReportEmailDelivery;
}

async function recordWithServiceRole(attemptId: string, status: 'sent' | 'failed', providerMessageId: string | null, failureCode: string | null) {
  const { data, error } = await serviceRoleClient().rpc('servsync_record_finalized_report_email_delivery_result', {
    p_attempt_id: attemptId,
    p_status: status,
    p_provider_message_id: providerMessageId,
    p_failure_code: failureCode,
  });
  if (error || !data || typeof data !== 'object') throw new Error('Report email result recording failed.');
  return data as ReportEmailAttempt;
}

async function sendWithResend(message: ProviderMessage): Promise<ProviderResult> {
  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
  } catch { return { ok: false, errorCode: 'provider_unavailable' }; }
  if (!response.ok) {
    if (response.status === 429) return { ok: false, errorCode: 'provider_rate_limited' };
    if (response.status >= 400 && response.status < 500) return { ok: false, errorCode: 'provider_rejected' };
    return { ok: false, errorCode: 'provider_unavailable' };
  }
  let payload: unknown;
  try { payload = await response.json(); } catch { return { ok: false, errorCode: 'provider_unavailable' }; }
  const id = payload && typeof payload === 'object' && !Array.isArray(payload) && typeof (payload as { id?: unknown }).id === 'string' ? (payload as { id: string }).id : '';
  return PROVIDER_ID_PATTERN.test(id) ? { ok: true, id } : { ok: false, errorCode: 'provider_unavailable' };
}

function defaultPublicOrigin(request: Request) {
  const origin = new URL(request.url).origin;
  if (!/^https:\/\//i.test(origin) && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin)) throw new Error('Untrusted public origin.');
  return origin;
}

export function createSendFinalizedReportEmailHandler(
  dependencies: ReportEmailHandlerDependencies = {
    configurationAvailable: requiredServerConfig,
    prepare: prepareWithAuthenticatedCaller,
    send: sendWithResend,
    record: recordWithServiceRole,
    fromAddress: () => process.env.EMAIL_FROM?.trim() || 'ServSync <noreply@servsync.app>',
    publicOrigin: defaultPublicOrigin,
  },
) {
  return async function handler(request: Request) {
    if (request.method !== 'POST') return json({ status: 'failed' }, 405, { Allow: 'POST' });
    const originHeader = request.headers.get('origin');
    if (originHeader && originHeader !== new URL(request.url).origin) return json({ status: 'failed' }, 403);
    const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (contentType !== 'application/json') return json({ status: 'failed' }, 415);
    const accessToken = bearerToken(request);
    if (!accessToken) return json({ status: 'failed' }, 401);
    if (!dependencies.configurationAvailable()) return json({ status: 'failed', reason: 'delivery_unavailable' }, 503);
    let raw: string;
    try { raw = await readBoundedBody(request); } catch (error) {
      return json({ status: 'failed' }, error instanceof RequestTooLargeError ? 413 : 400);
    }
    const input = parseInput(raw);
    if (!input) return json({ status: 'failed', reason: 'invalid_request' }, 400);

    let prepared: PreparedReportEmailDelivery | null = null;
    let reportUrl = '';
    try {
      prepared = await dependencies.prepare(accessToken, input);
      if (!UUID_PATTERN.test(prepared.attempt_id) || !UUID_PATTERN.test(prepared.delivery_link_id)
          || prepared.recipient_email !== input.recipient_email || !/^[0-9a-f]{64}$/.test(prepared.token)) {
        throw new Error('Invalid report email preparation result.');
      }
      let provider: ProviderResult;
      try {
        reportUrl = new URL(`/#/report-delivery?access=${prepared.token}`, dependencies.publicOrigin(request)).toString();
        provider = await dependencies.send(buildFinalizedReportDeliveryEmail(prepared, reportUrl, dependencies.fromAddress()));
      } catch { provider = { ok: false, errorCode: 'provider_unavailable' }; }
      prepared.token = '';
      reportUrl = '';
      if (!provider.ok) {
        try {
          const attempt = await dependencies.record(prepared.attempt_id, 'failed', null, provider.errorCode);
          return json({ status: 'failed', attempt }, 502);
        } catch { return json({ status: 'sending', reason: 'result_unconfirmed' }, 503); }
      }
      try {
        const attempt = await dependencies.record(prepared.attempt_id, 'sent', provider.id, null);
        return json({ status: 'sent', attempt }, 200);
      } catch { return json({ status: 'sending', reason: 'result_unconfirmed' }, 503); }
    } catch {
      return json({ status: 'failed', reason: 'delivery_unavailable' }, 403);
    } finally {
      if (prepared) prepared.token = '';
      reportUrl = '';
    }
  };
}

const handler = createSendFinalizedReportEmailHandler();

export default { fetch: handler };
