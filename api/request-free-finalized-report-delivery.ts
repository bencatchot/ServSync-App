import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@vercel/firewall';

export const REQUEST_FREE_REPORT_RATE_LIMIT_ID = 'request-free-local-invoice-delivery';
export const REQUEST_FREE_REPORT_SESSION_COOKIE = '__Host-servsync-report-session';
export const REQUEST_FREE_REPORT_SESSION_SECONDS = 30 * 60;
export const MAX_REPORT_REQUEST_BYTES = 1_024;
export const MAX_REPORT_PDF_BYTES = 20 * 1024 * 1024;

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORAGE_PATH_PATTERN = /^contractor-field-work\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/i;
const SAFE_STATES = new Set(['invalid', 'expired', 'revoked', 'replaced', 'unavailable', 'rate_limited', 'error']);

type SafeFailureState = 'invalid' | 'expired' | 'revoked' | 'replaced' | 'unavailable' | 'rate_limited' | 'error';
type RateLimitResult = { rateLimited: boolean; configurationError?: boolean };
type RequestMode = { kind: 'bootstrap'; token: string } | { kind: 'session' };
type PrivateReportAccess = {
  state: 'valid';
  report: {
    bucket_id: 'home-documents';
    storage_path: string;
    file_name: string;
    storage_object_id: string;
    storage_version: string;
    storage_etag: string;
    storage_size_bytes: number;
  };
};

export type RequestFreeReportGatewayDependencies = {
  checkEntryRateLimit: (request: Request) => Promise<RateLimitResult>;
  bootstrapReportSession: (token: string, sessionDigest: string, previousSessionDigest: string | null) => Promise<string>;
  lookupReportSession: (sessionDigest: string) => Promise<string>;
  downloadReport: (bucket: string, path: string) => Promise<Blob>;
  generateSessionIdentifier: () => string;
};

class RequestTooLargeError extends Error {}

const baseHeaders = {
  'Cache-Control': 'no-store, private',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'self'; sandbox",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function activeSessionCookie(sessionIdentifier: string) {
  return `${REQUEST_FREE_REPORT_SESSION_COOKIE}=${sessionIdentifier}; Max-Age=${REQUEST_FREE_REPORT_SESSION_SECONDS}; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

function expiredSessionCookie() {
  return `${REQUEST_FREE_REPORT_SESSION_COOKIE}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

function failureResponse(state: SafeFailureState, status: number, extraHeaders: HeadersInit = {}) {
  return new Response(JSON.stringify({ state }), {
    status,
    headers: {
      ...baseHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': expiredSessionCookie(),
      ...extraHeaders,
    },
  });
}

async function readBoundedBody(request: Request) {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > MAX_REPORT_REQUEST_BYTES) {
      throw new RequestTooLargeError();
    }
  }
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REPORT_REQUEST_BYTES) {
        try { await reader.cancel(); } catch { /* Best-effort cancellation. */ }
        throw new RequestTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(body);
}

function parseRequestMode(body: string): RequestMode | null {
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) return { kind: 'session' };
  if (keys.length !== 1 || keys[0] !== 'token' || typeof record.token !== 'string') return null;
  return TOKEN_PATTERN.test(record.token) ? { kind: 'bootstrap', token: record.token } : null;
}

function sessionIdentifierFromRequest(request: Request) {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  const matches = cookieHeader.split(';').map(part => part.trim()).filter(part => part.startsWith(`${REQUEST_FREE_REPORT_SESSION_COOKIE}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(REQUEST_FREE_REPORT_SESSION_COOKIE.length + 1);
  return TOKEN_PATTERN.test(value) ? value : null;
}

function sessionDigest(sessionIdentifier: string) {
  return createHash('sha256').update(sessionIdentifier).digest('hex');
}

function safeFileName(value: string) {
  const normalized = value.replace(/[\u0000-\u001f\u007f"\\/]+/g, ' ').replace(/\s+/g, ' ').trim();
  const base = normalized.toLowerCase().endsWith('.pdf') ? normalized.slice(0, -4) : normalized;
  return `${base.slice(0, 120) || 'finalized-report'}.pdf`;
}

function parsePrivateAccess(serialized: string): PrivateReportAccess | SafeFailureState | null {
  let parsed: unknown;
  try { parsed = JSON.parse(serialized); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (typeof record.state !== 'string') return null;
  if (record.state !== 'valid') {
    return SAFE_STATES.has(record.state) && Object.keys(record).length === 1 ? record.state as SafeFailureState : null;
  }
  if (Object.keys(record).sort().join(',') !== 'report,state' || !record.report || typeof record.report !== 'object' || Array.isArray(record.report)) return null;
  const report = record.report as Record<string, unknown>;
  if (Object.keys(report).sort().join(',') !== 'bucket_id,file_name,storage_etag,storage_object_id,storage_path,storage_size_bytes,storage_version') return null;
  if (report.bucket_id !== 'home-documents'
      || typeof report.storage_path !== 'string' || !STORAGE_PATH_PATTERN.test(report.storage_path)
      || typeof report.file_name !== 'string' || report.file_name.length < 1 || report.file_name.length > 180
      || typeof report.storage_object_id !== 'string' || !UUID_PATTERN.test(report.storage_object_id)
      || typeof report.storage_version !== 'string' || !UUID_PATTERN.test(report.storage_version)
      || typeof report.storage_etag !== 'string' || !/^"[0-9a-f]{32,128}"$/i.test(report.storage_etag)
      || typeof report.storage_size_bytes !== 'number' || !Number.isSafeInteger(report.storage_size_bytes)
      || report.storage_size_bytes < 5 || report.storage_size_bytes > MAX_REPORT_PDF_BYTES) return null;
  return parsed as PrivateReportAccess;
}

export async function checkReportEntryRateLimit(request: Request) {
  if (process.env.VERCEL !== '1') return { rateLimited: false, configurationError: true };
  const result = await checkRateLimit(REQUEST_FREE_REPORT_RATE_LIMIT_ID, { request });
  return { rateLimited: result.rateLimited, configurationError: result.error === 'not-found' };
}

function serviceRoleClient() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing server configuration.');
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function bootstrapReportSessionWithServiceRole(token: string, newSessionDigest: string, previousSessionDigest: string | null) {
  const { data, error } = await serviceRoleClient().rpc('servsync_bootstrap_finalized_report_delivery_session', {
    p_token: token,
    p_session_digest: newSessionDigest,
    p_previous_session_digest: previousSessionDigest,
  });
  if (error || typeof data !== 'string') throw new Error('Protected report bootstrap failed.');
  return data;
}

async function lookupReportSessionWithServiceRole(currentSessionDigest: string) {
  const { data, error } = await serviceRoleClient().rpc('servsync_lookup_finalized_report_delivery_session', {
    p_session_digest: currentSessionDigest,
  });
  if (error || typeof data !== 'string') throw new Error('Protected report-session lookup failed.');
  return data;
}

async function downloadReportWithServiceRole(bucket: string, path: string) {
  const { data, error } = await serviceRoleClient().storage.from(bucket).download(path);
  if (error || !data) throw new Error('Protected report download failed.');
  return data;
}

export function createRequestFreeFinalizedReportDeliveryHandler(
  dependencies: RequestFreeReportGatewayDependencies = {
    checkEntryRateLimit: checkReportEntryRateLimit,
    bootstrapReportSession: bootstrapReportSessionWithServiceRole,
    lookupReportSession: lookupReportSessionWithServiceRole,
    downloadReport: downloadReportWithServiceRole,
    generateSessionIdentifier: () => randomBytes(32).toString('hex'),
  },
) {
  return async function handler(request: Request) {
    if (request.method !== 'POST') return failureResponse('error', 405, { Allow: 'POST' });
    let rateLimit: RateLimitResult;
    try { rateLimit = await dependencies.checkEntryRateLimit(request); } catch { return failureResponse('error', 503); }
    if (rateLimit.configurationError) return failureResponse('error', 503);
    if (rateLimit.rateLimited) return failureResponse('rate_limited', 429, { 'Retry-After': '60' });
    const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (contentType !== 'application/json') return failureResponse('invalid', 415);

    let body: string;
    try { body = await readBoundedBody(request); } catch (error) {
      return failureResponse('invalid', error instanceof RequestTooLargeError ? 413 : 400);
    }
    const mode = parseRequestMode(body);
    if (!mode) return failureResponse('invalid', 400);
    const existingSessionIdentifier = sessionIdentifierFromRequest(request);
    if (mode.kind === 'session' && !existingSessionIdentifier) return failureResponse('unavailable', 200);

    let newSessionIdentifier = '';
    try {
      const serialized = mode.kind === 'bootstrap'
        ? await (async () => {
          newSessionIdentifier = dependencies.generateSessionIdentifier();
          if (!TOKEN_PATTERN.test(newSessionIdentifier)) throw new Error('Invalid generated recipient session.');
          return dependencies.bootstrapReportSession(
            mode.token,
            sessionDigest(newSessionIdentifier),
            existingSessionIdentifier ? sessionDigest(existingSessionIdentifier) : null,
          );
        })()
        : await dependencies.lookupReportSession(sessionDigest(existingSessionIdentifier!));
      const access = parsePrivateAccess(serialized);
      if (!access) return failureResponse('error', 503);
      if (typeof access === 'string') {
        const status = access === 'rate_limited' ? 429 : access === 'error' ? 503 : 200;
        return failureResponse(access, status, access === 'rate_limited' ? { 'Retry-After': '60' } : {});
      }
      const pdf = await dependencies.downloadReport(access.report.bucket_id, access.report.storage_path);
      if (pdf.size !== access.report.storage_size_bytes || pdf.size > MAX_REPORT_PDF_BYTES) return failureResponse('unavailable', 200);
      const header = new TextDecoder().decode(await pdf.slice(0, 5).arrayBuffer());
      if (header !== '%PDF-') return failureResponse('unavailable', 200);
      const cookie = mode.kind === 'bootstrap' ? activeSessionCookie(newSessionIdentifier) : undefined;
      const fileName = safeFileName(access.report.file_name);
      return new Response(pdf, {
        status: 200,
        headers: {
          ...baseHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
          ...(cookie ? { 'Set-Cookie': cookie } : {}),
        },
      });
    } catch {
      return failureResponse('error', 503);
    } finally {
      newSessionIdentifier = '';
    }
  };
}

const handler = createRequestFreeFinalizedReportDeliveryHandler();

export default { fetch: handler };
