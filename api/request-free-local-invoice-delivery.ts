import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@vercel/firewall';

export const REQUEST_FREE_INVOICE_RATE_LIMIT_ID = 'request-free-local-invoice-delivery';
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

type RateLimitResult = {
  rateLimited: boolean;
  configurationError?: boolean;
};

export type RequestFreeInvoiceGatewayDependencies = {
  checkEntryRateLimit: (request: Request) => Promise<RateLimitResult>;
  lookupInvoice: (token: string) => Promise<string>;
};

class RequestTooLargeError extends Error {}

const responseHeaders = {
  'Cache-Control': 'no-store, private',
  'Content-Type': 'application/json; charset=utf-8',
};

function safeResponse(state: 'invalid' | 'rate_limited' | 'error', status: number, extraHeaders?: HeadersInit) {
  return new Response(JSON.stringify({ state }), {
    status,
    headers: { ...responseHeaders, ...extraHeaders },
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
        await reader.cancel();
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

function parseTokenBody(body: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || typeof record.token !== 'string') return null;
  return TOKEN_PATTERN.test(record.token) ? record.token : null;
}

function isSafeLookupEnvelope(serialized: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  const result = parsed as Record<string, unknown>;
  if (typeof result.state !== 'string' || !SAFE_STATES.has(result.state)) return false;
  if (result.state === 'valid') return Boolean(result.invoice && typeof result.invoice === 'object');
  return Object.keys(result).length === 1;
}

export async function checkVercelEntryRateLimit(request: Request): Promise<RateLimitResult> {
  if (process.env.VERCEL !== '1') return { rateLimited: false, configurationError: true };
  const result = await checkRateLimit(REQUEST_FREE_INVOICE_RATE_LIMIT_ID, { request });
  return {
    rateLimited: result.rateLimited,
    configurationError: result.error === 'not-found',
  };
}

export async function lookupInvoiceWithServiceRole(token: string) {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing server configuration.');

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const { data, error } = await client.rpc('servsync_lookup_local_invoice_delivery', {
    p_token: token,
  });
  if (error || typeof data !== 'string') throw new Error('Protected lookup failed.');
  return data;
}

export function createRequestFreeInvoiceDeliveryHandler(
  dependencies: RequestFreeInvoiceGatewayDependencies = {
    checkEntryRateLimit: checkVercelEntryRateLimit,
    lookupInvoice: lookupInvoiceWithServiceRole,
  },
) {
  return async function handler(request: Request) {
    if (request.method !== 'POST') {
      return safeResponse('error', 405, { Allow: 'POST' });
    }

    let rateLimit: RateLimitResult;
    try {
      rateLimit = await dependencies.checkEntryRateLimit(request);
    } catch {
      return safeResponse('error', 503);
    }
    if (rateLimit.configurationError) return safeResponse('error', 503);
    if (rateLimit.rateLimited) return safeResponse('rate_limited', 429, { 'Retry-After': '60' });

    let body: string;
    try {
      body = await readBoundedBody(request);
    } catch (error) {
      if (error instanceof RequestTooLargeError) return safeResponse('invalid', 413);
      return safeResponse('invalid', 400);
    }

    const token = parseTokenBody(body);
    if (!token) return safeResponse('invalid', 400);

    try {
      const serialized = await dependencies.lookupInvoice(token);
      if (!isSafeLookupEnvelope(serialized)) return safeResponse('error', 503);
      if (new TextEncoder().encode(serialized).byteLength > MAX_PUBLIC_RESPONSE_BYTES) {
        return safeResponse('error', 503);
      }
      return new Response(serialized, { status: 200, headers: responseHeaders });
    } catch {
      return safeResponse('error', 503);
    }
  };
}

const handler = createRequestFreeInvoiceDeliveryHandler();

export default {
  fetch: handler,
};
