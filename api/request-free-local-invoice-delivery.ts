import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@vercel/firewall';

export const REQUEST_FREE_INVOICE_RATE_LIMIT_ID = 'request-free-local-invoice-delivery';
export const REQUEST_FREE_INVOICE_SESSION_COOKIE = '__Host-servsync-invoice-session';
export const REQUEST_FREE_INVOICE_SESSION_SECONDS = 30 * 60;
export const MAX_REQUEST_BYTES = 1_024;
export const MAX_PUBLIC_RESPONSE_BYTES = 262_144;

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_STATES = new Set([
  'valid',
  'invalid',
  'expired',
  'revoked',
  'replaced',
  'unavailable',
  'rate_limited',
  'error',
]);

type SafeState = 'valid' | 'invalid' | 'expired' | 'revoked' | 'replaced' | 'unavailable' | 'rate_limited' | 'error';

type RateLimitResult = {
  rateLimited: boolean;
  configurationError?: boolean;
};

type RequestMode =
  | { kind: 'bootstrap'; token: string }
  | { kind: 'session' };

export type RequestFreeInvoiceGatewayDependencies = {
  checkEntryRateLimit: (request: Request) => Promise<RateLimitResult>;
  bootstrapInvoiceSession: (
    token: string,
    sessionDigest: string,
    previousSessionDigest: string | null,
  ) => Promise<string>;
  lookupInvoiceSession: (sessionDigest: string) => Promise<string>;
  generateSessionIdentifier: () => string;
};

type VercelRateLimitCheck = typeof checkRateLimit;

class RequestTooLargeError extends Error {}

const responseHeaders = {
  'Cache-Control': 'no-store, private',
  'Content-Type': 'application/json; charset=utf-8',
};

function activeSessionCookie(sessionIdentifier: string) {
  return `${REQUEST_FREE_INVOICE_SESSION_COOKIE}=${sessionIdentifier}; Max-Age=${REQUEST_FREE_INVOICE_SESSION_SECONDS}; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

function expiredSessionCookie() {
  return `${REQUEST_FREE_INVOICE_SESSION_COOKIE}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

function failureResponse(
  state: Exclude<SafeState, 'valid'>,
  status: number,
  extraHeaders?: HeadersInit,
) {
  return new Response(JSON.stringify({ state }), {
    status,
    headers: { ...responseHeaders, ...extraHeaders, 'Set-Cookie': expiredSessionCookie() },
  });
}

function serializedFailureResponse(serialized: string, status: number, extraHeaders?: HeadersInit) {
  return new Response(serialized, {
    status,
    headers: { ...responseHeaders, ...extraHeaders, 'Set-Cookie': expiredSessionCookie() },
  });
}

async function readBoundedBody(request: Request) {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) throw new RequestTooLargeError();
    if (parsedLength > MAX_REQUEST_BYTES) throw new RequestTooLargeError();
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
      if (totalBytes > MAX_REQUEST_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // Cancellation is best-effort; the size violation remains authoritative.
        }
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
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }

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
  const matches = cookieHeader
    .split(';')
    .map(part => part.trim())
    .filter(part => part.startsWith(`${REQUEST_FREE_INVOICE_SESSION_COOKIE}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(REQUEST_FREE_INVOICE_SESSION_COOKIE.length + 1);
  return TOKEN_PATTERN.test(value) ? value : null;
}

function sessionDigest(sessionIdentifier: string) {
  return createHash('sha256').update(sessionIdentifier).digest('hex');
}

function safeLookupState(serialized: string): SafeState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const result = parsed as Record<string, unknown>;
  if (typeof result.state !== 'string' || !SAFE_STATES.has(result.state)) return null;
  if (result.state === 'valid') {
    return result.invoice && typeof result.invoice === 'object' && Object.keys(result).length === 2
      ? 'valid'
      : null;
  }
  return Object.keys(result).length === 1 ? result.state as SafeState : null;
}

export async function checkVercelEntryRateLimit(
  request: Request,
  check: VercelRateLimitCheck = checkRateLimit,
): Promise<RateLimitResult> {
  if (process.env.VERCEL !== '1') return { rateLimited: false, configurationError: true };
  const result = await check(REQUEST_FREE_INVOICE_RATE_LIMIT_ID, { request });
  return {
    rateLimited: result.rateLimited,
    configurationError: result.error === 'not-found',
  };
}

function serviceRoleClient() {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing server configuration.');

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export async function bootstrapInvoiceSessionWithServiceRole(
  token: string,
  newSessionDigest: string,
  previousSessionDigest: string | null,
) {
  const { data, error } = await serviceRoleClient().rpc('servsync_bootstrap_local_invoice_delivery_session', {
    p_token: token,
    p_session_digest: newSessionDigest,
    p_previous_session_digest: previousSessionDigest,
  });
  if (error || typeof data !== 'string') throw new Error('Protected bootstrap failed.');
  return data;
}

export async function lookupInvoiceSessionWithServiceRole(currentSessionDigest: string) {
  const { data, error } = await serviceRoleClient().rpc('servsync_lookup_local_invoice_delivery_session', {
    p_session_digest: currentSessionDigest,
  });
  if (error || typeof data !== 'string') throw new Error('Protected session lookup failed.');
  return data;
}

export function createRequestFreeInvoiceDeliveryHandler(
  dependencies: RequestFreeInvoiceGatewayDependencies = {
    checkEntryRateLimit: checkVercelEntryRateLimit,
    bootstrapInvoiceSession: bootstrapInvoiceSessionWithServiceRole,
    lookupInvoiceSession: lookupInvoiceSessionWithServiceRole,
    generateSessionIdentifier: () => randomBytes(32).toString('hex'),
  },
) {
  return async function handler(request: Request) {
    if (request.method !== 'POST') {
      return failureResponse('error', 405, { Allow: 'POST' });
    }

    let rateLimit: RateLimitResult;
    try {
      rateLimit = await dependencies.checkEntryRateLimit(request);
    } catch {
      return failureResponse('error', 503);
    }
    if (rateLimit.configurationError) return failureResponse('error', 503);
    if (rateLimit.rateLimited) return failureResponse('rate_limited', 429, { 'Retry-After': '60' });

    const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (contentType !== 'application/json') return failureResponse('invalid', 415);

    let body: string;
    try {
      body = await readBoundedBody(request);
    } catch (error) {
      if (error instanceof RequestTooLargeError) return failureResponse('invalid', 413);
      return failureResponse('invalid', 400);
    }

    const mode = parseRequestMode(body);
    if (!mode) {
      return failureResponse('invalid', 400);
    }

    const existingSessionIdentifier = sessionIdentifierFromRequest(request);
    if (mode.kind === 'session' && !existingSessionIdentifier) {
      return failureResponse('unavailable', 200);
    }

    let newSessionIdentifier = '';
    try {
      const serialized = mode.kind === 'bootstrap'
        ? await (async () => {
          newSessionIdentifier = dependencies.generateSessionIdentifier();
          if (!TOKEN_PATTERN.test(newSessionIdentifier)) throw new Error('Invalid generated recipient session.');
          return dependencies.bootstrapInvoiceSession(
            mode.token,
            sessionDigest(newSessionIdentifier),
            existingSessionIdentifier ? sessionDigest(existingSessionIdentifier) : null,
          );
        })()
        : await dependencies.lookupInvoiceSession(sessionDigest(existingSessionIdentifier!));

      const state = safeLookupState(serialized);
      if (!state) return failureResponse('error', 503);
      if (new TextEncoder().encode(serialized).byteLength > MAX_PUBLIC_RESPONSE_BYTES) {
        return failureResponse('error', 503);
      }
      if (state === 'rate_limited') {
        return serializedFailureResponse(serialized, 429, { 'Retry-After': '60' });
      }
      if (state === 'error') return serializedFailureResponse(serialized, 503);

      const cookie = mode.kind === 'bootstrap' && state === 'valid'
        ? activeSessionCookie(newSessionIdentifier)
        : state === 'valid'
          ? undefined
          : expiredSessionCookie();
      return new Response(serialized, {
        status: 200,
        headers: cookie ? { ...responseHeaders, 'Set-Cookie': cookie } : responseHeaders,
      });
    } catch {
      return failureResponse('error', 503);
    } finally {
      newSessionIdentifier = '';
    }
  };
}

const handler = createRequestFreeInvoiceDeliveryHandler();

export default {
  fetch: handler,
};
