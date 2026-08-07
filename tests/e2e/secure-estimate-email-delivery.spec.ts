import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  MAX_ESTIMATE_EMAIL_REQUEST_BYTES,
  buildEstimateDeliveryEmail,
  createSendLocalEstimateEmailHandler,
  type EstimateEmailAttempt,
  type PreparedEstimateEmailDelivery,
} from '../../api/send-local-estimate-email';

const ESTIMATE_ID = '11111111-1111-4111-8111-111111111111';
const LINK_ID = '22222222-2222-4222-8222-222222222222';
const ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'a'.repeat(64);

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function between(text: string, start: string, end: string) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return text.slice(startIndex, endIndex);
}

function prepared(overrides: Partial<PreparedEstimateEmailDelivery> = {}): PreparedEstimateEmailDelivery {
  return {
    token: TOKEN,
    attempt_id: ATTEMPT_ID,
    delivery_link_id: LINK_ID,
    recipient_email: 'customer@example.com',
    expires_at: '2026-09-06T00:00:00.000Z',
    contractor_business_name: 'Fixture & Sons <Internal>',
    customer_display_name: 'Jamie Customer',
    estimate_title: 'Water heater replacement',
    estimate_total_cents: 125000,
    ...overrides,
  };
}

function attempt(overrides: Partial<EstimateEmailAttempt> = {}): EstimateEmailAttempt {
  return {
    id: ATTEMPT_ID,
    delivery_link_id: LINK_ID,
    recipient_email: 'customer@example.com',
    status: 'sent',
    attempted_at: '2026-08-07T12:00:00.000Z',
    sent_at: '2026-08-07T12:00:01.000Z',
    failed_at: null,
    failure_code: null,
    attempted_by_name: 'Fixture Owner',
    ...overrides,
  };
}

function request(body: unknown, headers: HeadersInit = {}) {
  return new Request('https://servsync.example/api/send-local-estimate-email', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer caller-jwt',
      'Content-Type': 'application/json',
      Origin: 'https://servsync.example',
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function handlerFixture(options: {
  prepared?: PreparedEstimateEmailDelivery;
  provider?: { ok: true; id: string } | { ok: false; errorCode: 'provider_rejected' | 'provider_rate_limited' | 'provider_unavailable' };
  recordFails?: boolean;
  configured?: boolean;
} = {}) {
  const prepareCalls: Array<{ token: string; input: Record<string, unknown> }> = [];
  const messages: Array<Record<string, unknown>> = [];
  const recordCalls: Array<Record<string, unknown>> = [];
  const handler = createSendLocalEstimateEmailHandler({
    configurationAvailable: () => options.configured ?? true,
    prepare: async (token, input) => {
      prepareCalls.push({ token, input });
      return options.prepared ?? prepared();
    },
    send: async message => {
      messages.push(message);
      return options.provider ?? { ok: true, id: 'resend-message-123' };
    },
    record: async (attemptId, status, providerMessageId, failureCode) => {
      recordCalls.push({ attemptId, status, providerMessageId, failureCode });
      if (options.recordFails) throw new Error('record unavailable');
      return attempt({
        status,
        sent_at: status === 'sent' ? '2026-08-07T12:00:01.000Z' : null,
        failed_at: status === 'failed' ? '2026-08-07T12:00:01.000Z' : null,
        failure_code: failureCode,
      });
    },
    fromAddress: () => 'ServSync <noreply@servsync.app>',
    publicOrigin: () => 'https://servsync.example',
  });
  return { handler, prepareCalls, messages, recordCalls };
}

const validBody = {
  estimate_id: ESTIMATE_ID,
  recipient_email: ' Customer@Example.com ',
  expires_days: 30,
};

test.describe('secure Estimate email SQL boundary', () => {
  test('keeps attempt history private and grants only the narrow RPC callers', () => {
    const sql = source('servsync-secure-estimate-email-delivery.sql');
    expect(sql).toContain('alter table public.local_estimate_delivery_email_attempts force row level security;');
    expect(sql).toContain('revoke all on table public.local_estimate_delivery_email_attempts from public, anon, authenticated, service_role;');
    expect(sql).toContain('grant execute on function public.servsync_prepare_local_estimate_email_delivery(uuid, text, integer) to authenticated;');
    expect(sql).toContain('grant execute on function public.servsync_record_local_estimate_email_delivery_result(uuid, text, text, text) to service_role;');
    expect(sql).not.toMatch(/grant execute on function public\.servsync_record_local_estimate_email_delivery_result[^;]+to (?:public|anon|authenticated)/i);
  });

  test('derives contractor authority, rotates the prior link, and preserves the original Customer email', () => {
    const sql = source('servsync-secure-estimate-email-delivery.sql');
    const prepare = between(sql, 'create function public.servsync_prepare_local_estimate_email_delivery', 'create function public.servsync_record_local_estimate_email_delivery_result');
    expect(prepare).toContain('servsync_private_current_local_estimate_delivery_contractor_id()');
    expect(prepare).not.toContain('p_contractor_id');
    expect(prepare).not.toContain('p_local_contact_id');
    expect(prepare).not.toContain('p_local_home_id');
    expect(prepare).toContain("revocation_reason = case when v_active_link.expires_at <= now() then 'expired' else 'replaced' end");
    expect(prepare).toContain('rotated_from_id');
    expect(prepare).not.toMatch(/update public\.contractor_local_contacts/i);
  });

  test('fails closed for connected, claimed, mapped, archived, cross-tenant, and lower-role callers', () => {
    const sql = source('servsync-secure-estimate-email-delivery.sql');
    const prepare = between(sql, 'create function public.servsync_prepare_local_estimate_email_delivery', 'create function public.servsync_record_local_estimate_email_delivery_result');
    for (const guard of [
      'estimate.contractor_id = v_contractor_id',
      'v_estimate.homeowner_user_id is not null',
      'v_contact.homeowner_user_id is not null',
      'v_contact.claimed_at is not null',
      'v_contact.archived_at is not null',
      'v_home.home_id is not null',
      'v_home.claimed_at is not null',
      'v_home.archived_at is not null',
    ]) expect(prepare).toContain(guard);
    expect(source('servsync-request-free-local-estimate-delivery.sql')).toContain("member.role in ('admin', 'office')");
    expect(source('servsync-request-free-local-estimate-delivery.sql')).not.toMatch(/member\.role in \([^)]*(?:field_tech|viewer)/);
  });

  test('rate-limits sends and exposes only sanitized attempt history', () => {
    const sql = source('servsync-secure-estimate-email-delivery.sql');
    expect(sql).toContain("attempt.attempted_at > now() - interval '1 minute'");
    expect(sql).toContain("attempt.attempted_at > now() - interval '1 day'");
    expect(sql).toContain('v_daily_attempts >= 100');
    const metadata = between(sql, 'create function public.servsync_private_local_estimate_email_attempt_metadata', 'create or replace function public.servsync_private_local_estimate_delivery_metadata');
    expect(metadata).toContain("'recipient_email'");
    expect(metadata).toContain("'failure_code'");
    expect(metadata).not.toContain('provider_message_id');
    expect(metadata).not.toContain('token_hash');
    expect(metadata).not.toContain("'token'");
  });
});

test.describe('secure Estimate email server handler', () => {
  test('rejects cross-origin, unauthenticated, malformed, oversized, and unconfigured requests before mutation', async () => {
    expect(MAX_ESTIMATE_EMAIL_REQUEST_BYTES).toBe(2048);
    const fixture = handlerFixture();
    expect((await fixture.handler(request(validBody, { Origin: 'https://attacker.example' }))).status).toBe(403);
    expect((await fixture.handler(request(validBody, { Authorization: '' }))).status).toBe(401);
    expect((await fixture.handler(request({ ...validBody, contractor_id: ESTIMATE_ID }))).status).toBe(400);
    expect((await fixture.handler(request('x'.repeat(MAX_ESTIMATE_EMAIL_REQUEST_BYTES + 1)))).status).toBe(413);
    expect(fixture.prepareCalls).toHaveLength(0);

    const unconfigured = handlerFixture({ configured: false });
    const response = await unconfigured.handler(request(validBody));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'failed', reason: 'delivery_unavailable' });
    expect(unconfigured.prepareCalls).toHaveLength(0);
  });

  test('uses only non-VITE server credentials and keeps provider secrets out of browser code', () => {
    const api = source('api/send-local-estimate-email.ts');
    const browser = source('src/features/estimates/requestFreeEstimateDelivery.ts');
    expect(api).toContain('process.env.SUPABASE_SERVICE_ROLE_KEY');
    expect(api).toContain('process.env.RESEND_API_KEY');
    expect(api).not.toMatch(/process\.env\.VITE_/);
    expect(browser).not.toMatch(/RESEND_API_KEY|SUPABASE_SERVICE_ROLE_KEY|EMAIL_FROM/);
  });

  test('normalizes the recipient, sends the one secure link, records success, and never returns the bearer', async () => {
    const fixture = handlerFixture();
    const response = await fixture.handler(request(validBody));
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body.status).toBe('sent');
    expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(fixture.prepareCalls).toEqual([{
      token: 'caller-jwt',
      input: { estimate_id: ESTIMATE_ID, recipient_email: 'customer@example.com', expires_days: 30 },
    }]);
    expect(fixture.messages).toHaveLength(1);
    expect(fixture.messages[0].to).toEqual(['customer@example.com']);
    expect(String(fixture.messages[0].html)).toContain(`access=${TOKEN}`);
    expect(fixture.recordCalls).toEqual([{
      attemptId: ATTEMPT_ID,
      status: 'sent',
      providerMessageId: 'resend-message-123',
      failureCode: null,
    }]);
  });

  test('records provider failure as failed and keeps provider internals out of the response', async () => {
    const fixture = handlerFixture({ provider: { ok: false, errorCode: 'provider_rejected' } });
    const response = await fixture.handler(request(validBody));
    expect(response.status).toBe(502);
    const body = await response.json() as Record<string, unknown>;
    expect(body.status).toBe('failed');
    expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(fixture.recordCalls[0]).toEqual({
      attemptId: ATTEMPT_ID,
      status: 'failed',
      providerMessageId: null,
      failureCode: 'provider_rejected',
    });
  });

  test('reports an unconfirmed result as sending instead of inventing success or failure', async () => {
    const fixture = handlerFixture({ recordFails: true });
    const response = await fixture.handler(request(validBody));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'sending', reason: 'result_unconfirmed' });
  });

  test('builds branded allowlisted content and escapes contractor-controlled values', () => {
    const message = buildEstimateDeliveryEmail(prepared({
      contractor_business_name: 'Fixture & Sons <Internal>\r\nBcc: hidden@example.com',
    }), `https://servsync.example/#/estimate-delivery?access=${TOKEN}`, 'ServSync <noreply@servsync.app>');
    expect(message.subject).toContain('sent you an Estimate');
    expect(message.subject).not.toContain('\r');
    expect(message.subject).not.toContain('\n');
    expect(message.html).toContain('View Estimate');
    expect(message.html).toContain('Fixture &amp; Sons &lt;Internal&gt; Bcc: hidden@example.com');
    expect(message.html).not.toContain('Fixture & Sons <Internal>');
    expect(message.text).toContain('Viewing it does not accept, approve, or sign');
    expect(message.html).not.toMatch(/private notes|claim_token|invitation_token|customer history/i);
  });
});

test('contractor UI keeps delivery overrides separate from Customer profile identity', () => {
  const panel = source('src/features/estimates/LocalEstimateDeliveryPanel.tsx');
  const client = source('src/features/estimates/requestFreeEstimateDelivery.ts');
  expect(panel).toContain('Editing it here does not change the Customer profile.');
  expect(panel).toContain("busy === 'send' ? 'Sending...' :");
  expect(panel).toContain('Email {emailStatusLabel(delivery.status)}');
  expect(panel).toContain('Each send publishes a fresh snapshot');
  expect(client).toContain("fetch('/api/send-local-estimate-email'");
  expect(client).not.toMatch(/servsync_update_contractor_local_customer|update\(['"]contractor_local_contacts/i);
});
