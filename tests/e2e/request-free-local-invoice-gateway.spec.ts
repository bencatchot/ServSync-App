import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MAX_PUBLIC_RESPONSE_BYTES,
  MAX_REQUEST_BYTES,
  REQUEST_FREE_INVOICE_RATE_LIMIT_ID,
  REQUEST_FREE_INVOICE_SESSION_COOKIE,
  REQUEST_FREE_INVOICE_SESSION_SECONDS,
  bootstrapInvoiceSessionWithServiceRole,
  checkVercelEntryRateLimit,
  createRequestFreeInvoiceDeliveryHandler,
  lookupInvoiceSessionWithServiceRole,
} from '../../api/request-free-local-invoice-delivery';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const TOKEN = 'a'.repeat(64);
const SESSION = 'b'.repeat(64);

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function paddedTokenBody(bytes: number) {
  const body = JSON.stringify({ token: TOKEN });
  if (body.length > bytes) throw new Error('Requested fixture is smaller than the token body.');
  return body + ' '.repeat(bytes - body.length);
}

function request(body: BodyInit, init: RequestInit = {}) {
  return new Request('https://servsync.example/api/request-free-local-invoice-delivery', {
    method: 'POST',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    body,
  });
}

function serializedInvoice(targetBytes: number) {
  const invoice = {
    contractor: { business_name: 'Fixture Contractor' },
    customer: { display_name: 'Fixture Customer' },
    property: { address_line1: '1 Fixture Way', address_line2: '', city: 'Fixture', state: 'IA', zip_code: '50000' },
    invoice_number: 'INV-FIXTURE',
    title: 'Fixture invoice',
    scope: '',
    notes: '',
    terms: '',
    status: 'sent',
    subtotal_cents: 100,
    tax_cents: 0,
    discount_cents: 0,
    total_cents: 100,
    amount_paid_cents: 0,
    issued_at: '2026-08-03T00:00:00.000Z',
    due_at: null,
    line_items: [{ title: 'Fixture item', description: '', quantity: 1, unit: 'each', unit_price_cents: 100 }],
  };
  const base = JSON.stringify({ state: 'valid', invoice });
  invoice.notes = 'x'.repeat(targetBytes - new TextEncoder().encode(base).byteLength);
  const serialized = JSON.stringify({ state: 'valid', invoice });
  expect(new TextEncoder().encode(serialized).byteLength).toBe(targetBytes);
  return serialized;
}

function handlerFixture(options: {
  rateLimited?: boolean;
  configurationError?: boolean;
  rateError?: boolean;
  bootstrap?: (token: string, digest: string, previousDigest: string | null) => Promise<string>;
  session?: (digest: string) => Promise<string>;
  generatedSession?: string;
} = {}) {
  const bootstrapCalls: Array<{ token: string; digest: string; previousDigest: string | null }> = [];
  const sessionCalls: string[] = [];
  const handler = createRequestFreeInvoiceDeliveryHandler({
    checkEntryRateLimit: async () => {
      if (options.rateError) throw new Error('fixture limiter failure');
      return {
        rateLimited: options.rateLimited ?? false,
        configurationError: options.configurationError,
      };
    },
    bootstrapInvoiceSession: async (token, digest, previousDigest) => {
      bootstrapCalls.push({ token, digest, previousDigest });
      return options.bootstrap?.(token, digest, previousDigest) ?? JSON.stringify({ state: 'invalid' });
    },
    lookupInvoiceSession: async digest => {
      sessionCalls.push(digest);
      return options.session?.(digest) ?? JSON.stringify({ state: 'unavailable' });
    },
    generateSessionIdentifier: () => options.generatedSession ?? SESSION,
  });
  return { handler, bootstrapCalls, sessionCalls };
}

function sessionCookie(value = SESSION) {
  return `${REQUEST_FREE_INVOICE_SESSION_COOKIE}=${value}`;
}

function expectExpiredSessionCookie(response: Response) {
  const cookie = response.headers.get('set-cookie') ?? '';
  expect(cookie).toContain(`${REQUEST_FREE_INVOICE_SESSION_COOKIE}=`);
  expect(cookie).toContain('Max-Age=0');
  expect(cookie).toContain('Path=/');
  expect(cookie).toContain('Secure');
  expect(cookie).toContain('HttpOnly');
  expect(cookie).toContain('SameSite=Strict');
  expect(cookie).not.toContain('Domain=');
}

test.describe('FB-003B same-origin invoice delivery gateway', () => {
  test('accepts only POST, JSON, and the two exact request schemas', async () => {
    const fixture = handlerFixture();
    const getResponse = await fixture.handler(new Request('https://servsync.example/api/request-free-local-invoice-delivery'));
    expect(getResponse.status).toBe(405);
    expect(getResponse.headers.get('allow')).toBe('POST');
    expectExpiredSessionCookie(getResponse);

    const wrongContentType = await fixture.handler(new Request('https://servsync.example/api/request-free-local-invoice-delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ token: TOKEN }),
    }));
    expect(wrongContentType.status).toBe(415);
    expectExpiredSessionCookie(wrongContentType);

    for (const body of [
      JSON.stringify({ token: 'not-a-token' }),
      JSON.stringify({ token: TOKEN, extra: true }),
      JSON.stringify({ extra: true }),
      JSON.stringify([TOKEN]),
      '{',
    ]) {
      const response = await fixture.handler(request(body));
      expect(response.status).toBe(400);
      expectExpiredSessionCookie(response);
    }

    const bootstrap = await fixture.handler(request(JSON.stringify({ token: TOKEN })));
    expect(bootstrap.status).toBe(200);
    expect(fixture.bootstrapCalls).toHaveLength(1);

    const session = await fixture.handler(request('{}', { headers: { Cookie: sessionCookie() } }));
    expect(session.status).toBe(200);
    expect(fixture.sessionCalls).toHaveLength(1);
  });

  test('enforces 1,023, 1,024, and 1,025-byte streamed boundaries with honest or deceptive lengths', async () => {
    const fixture = handlerFixture();

    for (const bytes of [1_023, 1_024]) {
      const absentLength = await fixture.handler(request(paddedTokenBody(bytes)));
      expect(absentLength.status).toBe(200);

      const accurateLength = await fixture.handler(request(paddedTokenBody(bytes), {
        headers: { 'Content-Length': String(bytes) },
      }));
      expect(accurateLength.status).toBe(200);
    }

    const overLimit = await fixture.handler(request(paddedTokenBody(MAX_REQUEST_BYTES + 1)));
    const declaredOverLimit = await fixture.handler(request('{}', {
      headers: { 'Content-Length': String(MAX_REQUEST_BYTES + 1) },
    }));
    const underDeclared = await fixture.handler(request(paddedTokenBody(MAX_REQUEST_BYTES + 1), {
      headers: { 'Content-Length': '2' },
    }));

    expect(overLimit.status).toBe(413);
    expect(declaredOverLimit.status).toBe(413);
    expect(underDeclared.status).toBe(413);
    expectExpiredSessionCookie(overLimit);
    expectExpiredSessionCookie(declaredOverLimit);
    expectExpiredSessionCookie(underDeclared);
    expect(fixture.bootstrapCalls).toHaveLength(4);
  });

  test('returns 413 even when oversized-stream cancellation rejects', async () => {
    const fixture = handlerFixture();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(MAX_REQUEST_BYTES + 1)));
      },
      cancel() {
        throw new Error('fixture cancellation failure');
      },
    });
    const oversizedRequest = new Request('https://servsync.example/api/request-free-local-invoice-delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' });

    const response = await fixture.handler(oversizedRequest);
    expect(response.status).toBe(413);
    expectExpiredSessionCookie(response);
    expect(fixture.bootstrapCalls).toEqual([]);
    expect(fixture.sessionCalls).toEqual([]);
  });

  test('maps the installed Firewall SDK not-found result to a fail-closed configuration error', async () => {
    const previousVercel = process.env.VERCEL;
    try {
      process.env.VERCEL = '1';
      const result = await checkVercelEntryRateLimit(
        request('{}'),
        (async () => ({ rateLimited: false, error: 'not-found' })) as never,
      );
      expect(result).toEqual({ rateLimited: false, configurationError: true });
    } finally {
      if (previousVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previousVercel;
    }
  });

  test('fails closed for missing Firewall configuration or limiter failure', async () => {
    for (const options of [{ configurationError: true }, { rateError: true }]) {
      const fixture = handlerFixture(options);
      const response = await fixture.handler(request(JSON.stringify({ token: TOKEN })));
      expect(response.status).toBe(503);
      expectExpiredSessionCookie(response);
      expect(await response.json()).toEqual({ state: 'error' });
      expect(fixture.bootstrapCalls).toEqual([]);
      expect(fixture.sessionCalls).toEqual([]);
    }
  });

  test('returns 429 with Retry-After and never reaches the database after Firewall rejection', async () => {
    const fixture = handlerFixture({ rateLimited: true });
    const response = await fixture.handler(request(JSON.stringify({ token: TOKEN })));

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    expectExpiredSessionCookie(response);
    expect(await response.json()).toEqual({ state: 'rate_limited' });
    expect(fixture.bootstrapCalls).toEqual([]);
    expect(fixture.sessionCalls).toEqual([]);
  });

  test('creates an exact protected 30-minute cookie without returning session material', async () => {
    const serialized = JSON.stringify({ state: 'valid', invoice: {} });
    const fixture = handlerFixture({ bootstrap: async () => serialized });
    const response = await fixture.handler(request(JSON.stringify({ token: TOKEN })));
    const cookie = response.headers.get('set-cookie') ?? '';

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(serialized);
    expect(cookie).toContain(`${REQUEST_FREE_INVOICE_SESSION_COOKIE}=${SESSION}`);
    expect(cookie).toContain(`Max-Age=${REQUEST_FREE_INVOICE_SESSION_SECONDS}`);
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).not.toContain('Domain=');
    expect(cookie).not.toContain(TOKEN);
    expect(serialized).not.toContain(SESSION);
    expect(fixture.bootstrapCalls).toEqual([{
      token: TOKEN,
      digest: createHash('sha256').update(SESSION).digest('hex'),
      previousDigest: null,
    }]);
  });

  test('replaces a prior session digest during bootstrap and never falls back after failure', async () => {
    const previousSession = 'c'.repeat(64);
    const fixture = handlerFixture({ bootstrap: async () => JSON.stringify({ state: 'invalid' }) });
    const response = await fixture.handler(request(JSON.stringify({ token: TOKEN }), {
      headers: { Cookie: sessionCookie(previousSession) },
    }));

    expect(response.status).toBe(200);
    expectExpiredSessionCookie(response);
    expect(fixture.bootstrapCalls[0].previousDigest).toBe(createHash('sha256').update(previousSession).digest('hex'));
    expect(fixture.sessionCalls).toEqual([]);
  });

  test('requires a valid session cookie for empty-object lookup and expires unavailable sessions', async () => {
    const missing = handlerFixture();
    const missingResponse = await missing.handler(request('{}'));
    expect(missingResponse.status).toBe(200);
    expectExpiredSessionCookie(missingResponse);
    expect(missing.sessionCalls).toEqual([]);

    const malformed = handlerFixture();
    const malformedResponse = await malformed.handler(request('{}', {
      headers: { Cookie: sessionCookie('not-a-session') },
    }));
    expect(malformedResponse.status).toBe(200);
    expectExpiredSessionCookie(malformedResponse);
    expect(malformed.sessionCalls).toEqual([]);

    const unavailable = handlerFixture({ session: async () => JSON.stringify({ state: 'unavailable' }) });
    const unavailableResponse = await unavailable.handler(request('{}', {
      headers: { Cookie: sessionCookie() },
    }));
    expect(unavailableResponse.status).toBe(200);
    expectExpiredSessionCookie(unavailableResponse);
  });

  test('preserves a valid session cookie and exact serialized response on refresh lookup', async () => {
    const serialized = JSON.stringify({ state: 'valid', invoice: {} });
    const fixture = handlerFixture({ session: async () => serialized });
    const response = await fixture.handler(request('{}', { headers: { Cookie: sessionCookie() } }));

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    expect(await response.text()).toBe(serialized);
    expect(fixture.sessionCalls).toEqual([createHash('sha256').update(SESSION).digest('hex')]);
  });

  test('maps database defense-in-depth throttling to generic 429 and expires the prior session', async () => {
    const serialized = JSON.stringify({ state: 'rate_limited' });
    const fixture = handlerFixture({ session: async () => serialized });
    const response = await fixture.handler(request('{}', { headers: { Cookie: sessionCookie() } }));

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expectExpiredSessionCookie(response);
    expect(await response.text()).toBe(serialized);
  });

  test('expires the prior cookie when protected bootstrap or session execution fails', async () => {
    const bootstrap = handlerFixture({ bootstrap: async () => { throw new Error('fixture bootstrap failure'); } });
    const bootstrapResponse = await bootstrap.handler(request(JSON.stringify({ token: TOKEN }), {
      headers: { Cookie: sessionCookie('c'.repeat(64)) },
    }));
    expect(bootstrapResponse.status).toBe(503);
    expectExpiredSessionCookie(bootstrapResponse);

    const session = handlerFixture({ session: async () => { throw new Error('fixture session failure'); } });
    const sessionResponse = await session.handler(request('{}', { headers: { Cookie: sessionCookie() } }));
    expect(sessionResponse.status).toBe(503);
    expectExpiredSessionCookie(sessionResponse);
  });

  for (const bytes of [262_143, 262_144, 262_145]) {
    test(`enforces the final serialized response boundary at ${bytes} bytes`, async () => {
      const fixture = handlerFixture({ bootstrap: async () => serializedInvoice(bytes) });
      const response = await fixture.handler(request(JSON.stringify({ token: TOKEN })));
      expect(response.status).toBe(bytes <= MAX_PUBLIC_RESPONSE_BYTES ? 200 : 503);
      expect(response.headers.get('cache-control')).toBe('no-store, private');
      if (bytes > MAX_PUBLIC_RESPONSE_BYTES) expectExpiredSessionCookie(response);
    });
  }

  test('fails closed before network access when server-only Supabase configuration is missing', async () => {
    const previousUrl = process.env.SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      await expect(bootstrapInvoiceSessionWithServiceRole(TOKEN, TOKEN, null)).rejects.toThrow('Missing server configuration.');
      await expect(lookupInvoiceSessionWithServiceRole(TOKEN)).rejects.toThrow('Missing server configuration.');
    } finally {
      if (previousUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
  });

  test('source fixes the Firewall identity, RPCs, server-only configuration, and logging boundary', () => {
    const gateway = source('api/request-free-local-invoice-delivery.ts');
    expect(REQUEST_FREE_INVOICE_RATE_LIMIT_ID).toBe('request-free-local-invoice-delivery');
    expect(gateway).toContain('check(REQUEST_FREE_INVOICE_RATE_LIMIT_ID, { request })');
    expect(gateway).not.toContain('rateLimitKey:');
    expect(gateway).toContain(".rpc('servsync_bootstrap_local_invoice_delivery_session'");
    expect(gateway).toContain(".rpc('servsync_lookup_local_invoice_delivery_session'");
    expect(gateway).not.toContain(".rpc('servsync_lookup_local_invoice_delivery'");
    expect(gateway).toContain('process.env.SUPABASE_URL');
    expect(gateway).toContain('process.env.SUPABASE_SERVICE_ROLE_KEY');
    expect(gateway).not.toContain('VITE_SUPABASE_SERVICE_ROLE_KEY');
    expect(gateway).not.toMatch(/console\.(?:log|info|warn|error)/);
    expect(gateway).not.toMatch(/x-forwarded-for|x-real-ip/i);
    expect(gateway).not.toMatch(/Access-Control-Allow-Origin/i);
  });
});
