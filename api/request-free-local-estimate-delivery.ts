import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@vercel/firewall';

// Share the already-provisioned request-free document ingress limiter. Estimate
// traffic still has independent database global/token buckets below this gate.
export const REQUEST_FREE_ESTIMATE_RATE_LIMIT_ID = 'request-free-local-invoice-delivery';
export const REQUEST_FREE_ESTIMATE_SESSION_COOKIE = '__Host-servsync-estimate-session';
export const REQUEST_FREE_ESTIMATE_SESSION_SECONDS = 30 * 60;
export const MAX_ESTIMATE_REQUEST_BYTES = 1_024;
export const MAX_ESTIMATE_PUBLIC_RESPONSE_BYTES = 262_144;

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_STATES = new Set(['valid', 'invalid', 'expired', 'revoked', 'replaced', 'unavailable', 'rate_limited', 'error']);

type SafeState = 'valid' | 'invalid' | 'expired' | 'revoked' | 'replaced' | 'unavailable' | 'rate_limited' | 'error';
type SafeAcceptanceState = 'eligible' | 'accepted' | 'stale' | 'ineligible' | 'unavailable' | 'rate_limited' | 'error';
type RateLimitResult = { rateLimited: boolean; configurationError?: boolean };
type RequestMode = { kind: 'bootstrap'; token: string } | { kind: 'session' } | { kind: 'accept' };

export type RequestFreeEstimateGatewayDependencies = {
  checkEntryRateLimit: (request: Request) => Promise<RateLimitResult>;
  bootstrapEstimateSession: (token: string, sessionDigest: string, previousSessionDigest: string | null) => Promise<string>;
  lookupEstimateSession: (sessionDigest: string) => Promise<string>;
  lookupEstimateAcceptance: (sessionDigest: string) => Promise<string>;
  acceptEstimate: (sessionDigest: string) => Promise<string>;
  generateSessionIdentifier: () => string;
};

class RequestTooLargeError extends Error {}

const responseHeaders = {
  'Cache-Control': 'no-store, private',
  'Content-Type': 'application/json; charset=utf-8',
};

function activeSessionCookie(sessionIdentifier: string) {
  return `${REQUEST_FREE_ESTIMATE_SESSION_COOKIE}=${sessionIdentifier}; Max-Age=${REQUEST_FREE_ESTIMATE_SESSION_SECONDS}; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

function expiredSessionCookie() {
  return `${REQUEST_FREE_ESTIMATE_SESSION_COOKIE}=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; Secure; HttpOnly; SameSite=Strict`;
}

function failureResponse(state: Exclude<SafeState, 'valid'>, status: number, extraHeaders?: HeadersInit) {
  return new Response(JSON.stringify({ state }), {
    status,
    headers: { ...responseHeaders, ...extraHeaders, 'Set-Cookie': expiredSessionCookie() },
  });
}

async function readBoundedBody(request: Request) {
  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const parsedLength = Number(contentLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > MAX_ESTIMATE_REQUEST_BYTES) {
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
      if (totalBytes > MAX_ESTIMATE_REQUEST_BYTES) {
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
  if (keys.length === 1 && keys[0] === 'action' && record.action === 'accept') return { kind: 'accept' };
  if (keys.length !== 1 || keys[0] !== 'token' || typeof record.token !== 'string') return null;
  return TOKEN_PATTERN.test(record.token) ? { kind: 'bootstrap', token: record.token } : null;
}

function sessionIdentifierFromRequest(request: Request) {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  const matches = cookieHeader.split(';').map(part => part.trim()).filter(part => part.startsWith(`${REQUEST_FREE_ESTIMATE_SESSION_COOKIE}=`));
  if (matches.length !== 1) return null;
  const value = matches[0].slice(REQUEST_FREE_ESTIMATE_SESSION_COOKIE.length + 1);
  return TOKEN_PATTERN.test(value) ? value : null;
}

function sessionDigest(sessionIdentifier: string) {
  return createHash('sha256').update(sessionIdentifier).digest('hex');
}

function safeLookupState(serialized: string): SafeState | null {
  let parsed: unknown;
  try { parsed = JSON.parse(serialized); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const result = parsed as Record<string, unknown>;
  if (typeof result.state !== 'string' || !SAFE_STATES.has(result.state)) return null;
  if (result.state === 'valid') {
    return result.estimate && typeof result.estimate === 'object' && Object.keys(result).length === 2 ? 'valid' : null;
  }
  return Object.keys(result).length === 1 ? result.state as SafeState : null;
}

function safeAcceptance(serialized: string) {
  let parsed: unknown;
  try { parsed = JSON.parse(serialized); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const result = parsed as Record<string, unknown>;
  if (typeof result.state !== 'string') return null;
  const state = result.state as SafeAcceptanceState;
  if (!['eligible', 'accepted', 'stale', 'ineligible', 'unavailable', 'rate_limited', 'error'].includes(state)) return null;
  if (state === 'accepted') {
    return Object.keys(result).sort().join(',') === 'accepted_at,state' && typeof result.accepted_at === 'string'
      ? { state, accepted_at: result.accepted_at }
      : null;
  }
  return Object.keys(result).length === 1 ? { state } : null;
}

function composeRecipientResponse(serializedEstimate: string, acceptance: { state: SafeAcceptanceState; accepted_at?: string }) {
  const parsed = JSON.parse(serializedEstimate) as { state: 'valid'; estimate: Record<string, unknown> };
  return JSON.stringify({ state: parsed.state, estimate: parsed.estimate, acceptance });
}

export async function checkEstimateEntryRateLimit(request: Request) {
  if (process.env.VERCEL !== '1') return { rateLimited: false, configurationError: true };
  const result = await checkRateLimit(REQUEST_FREE_ESTIMATE_RATE_LIMIT_ID, { request });
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

export async function bootstrapEstimateSessionWithServiceRole(token: string, newSessionDigest: string, previousSessionDigest: string | null) {
  const { data, error } = await serviceRoleClient().rpc('servsync_bootstrap_local_estimate_delivery_session', {
    p_token: token,
    p_session_digest: newSessionDigest,
    p_previous_session_digest: previousSessionDigest,
  });
  if (error || typeof data !== 'string') throw new Error('Protected Estimate bootstrap failed.');
  return data;
}

export async function lookupEstimateSessionWithServiceRole(currentSessionDigest: string) {
  const { data, error } = await serviceRoleClient().rpc('servsync_lookup_local_estimate_delivery_session', {
    p_session_digest: currentSessionDigest,
  });
  if (error || typeof data !== 'string') throw new Error('Protected Estimate-session lookup failed.');
  return data;
}

export async function lookupEstimateAcceptanceWithServiceRole(currentSessionDigest: string) {
  const { data, error } = await serviceRoleClient().rpc('servsync_lookup_local_estimate_delivery_acceptance', {
    p_session_digest: currentSessionDigest,
  });
  if (error || typeof data !== 'string') throw new Error('Protected Estimate-acceptance lookup failed.');
  return data;
}

export async function acceptEstimateWithServiceRole(currentSessionDigest: string) {
  const { data, error } = await serviceRoleClient().rpc('servsync_accept_local_estimate_delivery_session', {
    p_session_digest: currentSessionDigest,
  });
  if (error || typeof data !== 'string') throw new Error('Protected Estimate acceptance failed.');
  return data;
}

export function createRequestFreeEstimateDeliveryHandler(
  dependencies: RequestFreeEstimateGatewayDependencies = {
    checkEntryRateLimit: checkEstimateEntryRateLimit,
    bootstrapEstimateSession: bootstrapEstimateSessionWithServiceRole,
    lookupEstimateSession: lookupEstimateSessionWithServiceRole,
    lookupEstimateAcceptance: lookupEstimateAcceptanceWithServiceRole,
    acceptEstimate: acceptEstimateWithServiceRole,
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
    if (mode.kind !== 'bootstrap' && !existingSessionIdentifier) return failureResponse('unavailable', 200);

    let newSessionIdentifier = '';
    try {
      const digest = existingSessionIdentifier ? sessionDigest(existingSessionIdentifier) : null;
      const serialized = mode.kind === 'bootstrap'
        ? await (async () => {
          newSessionIdentifier = dependencies.generateSessionIdentifier();
          if (!TOKEN_PATTERN.test(newSessionIdentifier)) throw new Error('Invalid generated recipient session.');
          return dependencies.bootstrapEstimateSession(
            mode.token,
            sessionDigest(newSessionIdentifier),
            existingSessionIdentifier ? sessionDigest(existingSessionIdentifier) : null,
          );
        })()
        : await dependencies.lookupEstimateSession(digest!);

      const state = safeLookupState(serialized);
      if (!state) return failureResponse('error', 503);
      if (state === 'rate_limited') return new Response(serialized, { status: 429, headers: { ...responseHeaders, 'Retry-After': '60', 'Set-Cookie': expiredSessionCookie() } });
      if (state === 'error') return new Response(serialized, { status: 503, headers: { ...responseHeaders, 'Set-Cookie': expiredSessionCookie() } });

      let acceptance: ReturnType<typeof safeAcceptance> = null;
      if (state === 'valid') {
        const activeDigest = mode.kind === 'bootstrap' ? sessionDigest(newSessionIdentifier) : digest!;
        const serializedAcceptance = mode.kind === 'accept'
          ? await dependencies.acceptEstimate(activeDigest)
          : await dependencies.lookupEstimateAcceptance(activeDigest);
        acceptance = safeAcceptance(serializedAcceptance);
        if (!acceptance) return failureResponse('error', 503);
        if (acceptance.state === 'rate_limited') return failureResponse('rate_limited', 429, { 'Retry-After': '60' });
        if (acceptance.state === 'error') return failureResponse('error', 503);
        if (acceptance.state === 'unavailable') return failureResponse('unavailable', 200);
      }

      const responseBody = state === 'valid' && acceptance ? composeRecipientResponse(serialized, acceptance) : serialized;
      if (new TextEncoder().encode(responseBody).byteLength > MAX_ESTIMATE_PUBLIC_RESPONSE_BYTES) return failureResponse('error', 503);

      const cookie = mode.kind === 'bootstrap' && state === 'valid'
        ? activeSessionCookie(newSessionIdentifier)
        : state === 'valid' ? undefined : expiredSessionCookie();
      return new Response(responseBody, { status: 200, headers: cookie ? { ...responseHeaders, 'Set-Cookie': cookie } : responseHeaders });
    } catch {
      return failureResponse('error', 503);
    } finally {
      newSessionIdentifier = '';
    }
  };
}

const handler = createRequestFreeEstimateDeliveryHandler();

export default { fetch: handler };
