import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  FinalizedReportDeliveryLinkMetadata,
  FinalizedReportEmailDeliveryAttempt,
  RequestFreeFinalizedReportLookup,
  RequestFreeFinalizedReportState,
} from '../../types';

function requireObject(data: unknown, fallback: string) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(fallback);
  return data as Record<string, unknown>;
}

export async function listFinalizedReportDeliveryLinks(client: SupabaseClient, inspectionId: string) {
  const { data, error } = await client.rpc('servsync_list_finalized_report_delivery_links', { p_inspection_id: inspectionId });
  if (error) throw error;
  return Array.isArray(data) ? data as FinalizedReportDeliveryLinkMetadata[] : [];
}

export async function revokeFinalizedReportDeliveryLink(client: SupabaseClient, linkId: string) {
  const { data, error } = await client.rpc('servsync_revoke_finalized_report_delivery_link', { p_link_id: linkId });
  if (error) throw error;
  return requireObject(data, 'ServSync did not confirm the report-link revocation.') as unknown as FinalizedReportDeliveryLinkMetadata;
}

export async function sendFinalizedReportEmail(
  client: SupabaseClient,
  inspectionId: string,
  recipientEmail: string,
  expiresDays: number,
) {
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (sessionError || !accessToken) throw new Error('Sign in again before sending this report.');
  const response = await fetch('/api/send-finalized-report-email', {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
    referrerPolicy: 'same-origin',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspection_id: inspectionId, recipient_email: recipientEmail, expires_days: expiresDays }),
  });
  const result: unknown = await response.json().catch(() => null);
  const record = requireObject(result, 'ServSync could not confirm the report email result.');
  if (response.ok && record.status === 'sent' && record.attempt && typeof record.attempt === 'object') {
    return record.attempt as FinalizedReportEmailDeliveryAttempt;
  }
  if (record.status === 'sending') throw new Error('The email provider may have accepted this report, but ServSync could not confirm the result. Check delivery history before retrying.');
  if (record.reason === 'invalid_request') throw new Error('Enter a valid recipient email and expiration.');
  if (record.reason === 'delivery_unavailable') throw new Error('Report email delivery is unavailable. No successful send was recorded.');
  throw new Error('The report email could not be sent. Check the recipient address and retry.');
}

function contentDispositionFileName(value: string | null) {
  if (!value) return 'finalized-report.pdf';
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(value)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded); } catch { return 'finalized-report.pdf'; }
  }
  return /filename="([^"]+)"/i.exec(value)?.[1] ?? 'finalized-report.pdf';
}

export async function lookupRequestFreeFinalizedReport(
  token: string | null,
  options: { request?: typeof fetch; signal?: AbortSignal } = {},
): Promise<RequestFreeFinalizedReportLookup> {
  const request = options.request ?? fetch;
  const response = await request('/api/request-free-finalized-report-delivery', {
    method: 'POST',
    body: token === null ? '{}' : JSON.stringify({ token }),
    cache: 'no-store',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    referrerPolicy: 'no-referrer',
    signal: options.signal,
  });
  if (response.status === 429) return { state: 'rate_limited' };
  if (response.ok && response.headers.get('content-type')?.startsWith('application/pdf')) {
    return {
      state: 'valid',
      pdf: await response.blob(),
      fileName: contentDispositionFileName(response.headers.get('content-disposition')),
    };
  }
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1) return { state: 'error' };
  const state = (body as { state?: unknown }).state;
  const states: RequestFreeFinalizedReportState[] = ['invalid', 'expired', 'revoked', 'replaced', 'unavailable', 'rate_limited', 'error'];
  return typeof state === 'string' && states.includes(state as RequestFreeFinalizedReportState)
    ? { state: state as RequestFreeFinalizedReportState }
    : { state: 'error' };
}
