import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MAX_PUBLIC_RESPONSE_BYTES,
  MAX_REQUEST_BYTES,
  REQUEST_FREE_INVOICE_RATE_LIMIT_ID,
  createRequestFreeInvoiceDeliveryHandler,
  lookupInvoiceWithServiceRole,
} from '../../api/request-free-local-invoice-delivery';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const TOKEN = 'a'.repeat(64);

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function request(body: string, init: RequestInit = {}) {
  return new Request('https://servsync.example/api/request-free-local-invoice-delivery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    body,
    ...init,
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
  lookup?: (token: string) => Promise<string>;
} = {}) {
  let lookupCalls = 0;
  const handler = createRequestFreeInvoiceDeliveryHandler({
    checkEntryRateLimit: async () => {
      if (options.rateError) throw new Error('fixture limiter failure');
      return {
        rateLimited: options.rateLimited ?? false,
        configurationError: options.configurationError,
      };
    },
    lookupInvoice: async token => {
      lookupCalls += 1;
      return options.lookup?.(token) ?? JSON.stringify({ state: 'invalid' });
    },
  });
  return { handler, lookupCalls: () => lookupCalls };
}

test.describe('FB-003B same-origin invoice delivery gateway', () => {
  test('accepts only POST and the exact token object', async () => {
    const fixture = handlerFixture();
    const getResponse = await fixture.handler(new Request('https://servsync.example/api/request-free-local-invoice-delivery'));
    expect(getResponse.status).toBe(405);
    expect(getResponse.headers.get('allow')).toBe('POST');

    for (const body of [
      '{}',
      JSON.stringify({ token: 'not-a-token' }),
      JSON.stringify({ token: TOKEN, extra: true }),
      JSON.stringify([TOKEN]),
      '{',
    ]) {
      const response = await fixture.handler(request(body));
      expect(response.status).toBe(400);
    }
    expect(fixture.lookupCalls()).toBe(0);
  });

  test('bounds streamed request bodies at exactly 1,024 bytes', async () => {
    const fixture = handlerFixture();
    const atLimit = await fixture.handler(request('x'.repeat(MAX_REQUEST_BYTES)));
    const overLimit = await fixture.handler(request('x'.repeat(MAX_REQUEST_BYTES + 1)));
    const declaredOverLimit = await fixture.handler(request('{}', {
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(MAX_REQUEST_BYTES + 1) },
    }));

    expect(atLimit.status).toBe(400);
    expect(overLimit.status).toBe(413);
    expect(declaredOverLimit.status).toBe(413);
    expect(fixture.lookupCalls()).toBe(0);
  });

  test('fails closed for missing Firewall configuration or limiter failure', async () => {
    for (const options of [{ configurationError: true }, { rateError: true }]) {
      const fixture = handlerFixture(options);
      const response = await fixture.handler(request(JSON.stringify({ token: TOKEN })));
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ state: 'error' });
      expect(fixture.lookupCalls()).toBe(0);
    }
  });

  test('returns 429 with Retry-After and never reaches the database after rejection', async () => {
    const fixture = handlerFixture({ rateLimited: true });
    const response = await fixture.handler(request(JSON.stringify({ token: TOKEN })));

    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    expect(await response.json()).toEqual({ state: 'rate_limited' });
    expect(fixture.lookupCalls()).toBe(0);
  });

  test('allows a guarded request and preserves the exact safe serialized response', async () => {
    const serialized = JSON.stringify({ state: 'expired' });
    const fixture = handlerFixture({ lookup: async token => {
      expect(token).toBe(TOKEN);
      return serialized;
    } });
    const response = await fixture.handler(request(JSON.stringify({ token: TOKEN })));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    expect(await response.text()).toBe(serialized);
    expect(fixture.lookupCalls()).toBe(1);
  });

  for (const bytes of [262_143, 262_144, 262_145]) {
    test(`enforces the final serialized response boundary at ${bytes} bytes`, async () => {
      const fixture = handlerFixture({ lookup: async () => serializedInvoice(bytes) });
      const response = await fixture.handler(request(JSON.stringify({ token: TOKEN })));
      expect(response.status).toBe(bytes <= MAX_PUBLIC_RESPONSE_BYTES ? 200 : 503);
      expect(response.headers.get('cache-control')).toBe('no-store, private');
    });
  }

  test('fails closed before network access when server-only Supabase configuration is missing', async () => {
    const previousUrl = process.env.SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      await expect(lookupInvoiceWithServiceRole(TOKEN)).rejects.toThrow('Missing server configuration.');
    } finally {
      if (previousUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = previousUrl;
      if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
  });

  test('source fixes the Firewall identity, RPC, server-only configuration, and logging boundary', () => {
    const gateway = source('api/request-free-local-invoice-delivery.ts');
    expect(REQUEST_FREE_INVOICE_RATE_LIMIT_ID).toBe('request-free-local-invoice-delivery');
    expect(gateway).toContain("checkRateLimit(REQUEST_FREE_INVOICE_RATE_LIMIT_ID, { request })");
    expect(gateway).not.toContain('rateLimitKey:');
    expect(gateway).toContain("client.rpc('servsync_lookup_local_invoice_delivery'");
    expect(gateway).not.toMatch(/client\.rpc\([^'\"]*[a-zA-Z_$]/);
    expect(gateway).toContain('process.env.SUPABASE_URL');
    expect(gateway).toContain('process.env.SUPABASE_SERVICE_ROLE_KEY');
    expect(gateway).not.toContain('VITE_SUPABASE_SERVICE_ROLE_KEY');
    expect(gateway).not.toMatch(/console\.(?:log|info|warn|error)/);
    expect(gateway).not.toMatch(/x-forwarded-for|x-real-ip/i);
  });
});
