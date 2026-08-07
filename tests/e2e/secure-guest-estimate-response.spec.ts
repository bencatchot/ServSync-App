import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  REQUEST_FREE_ESTIMATE_SESSION_COOKIE,
  createRequestFreeEstimateDeliveryHandler,
} from '../../api/request-free-local-estimate-delivery';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const SESSION = 'c'.repeat(64);
const DIGEST = createHash('sha256').update(SESSION).digest('hex');

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

const estimateSnapshot = {
  state: 'valid',
  estimate: {
    contractor: { business_name: 'Fixture Services' },
    customer: { display_name: 'Fixture Customer' },
    property: { address_line1: '393 Response Lane', address_line2: '', city: 'Testville', state: 'AL', zip_code: '36532' },
    title: 'Fixture Estimate',
    scope: 'Complete the described fixture work.',
    notes: '',
    terms: 'Valid for 30 days.',
    status: 'sent',
    source_updated_at: '2026-08-07T12:00:00.000Z',
    subtotal_cents: 12900,
    material_total_cents: 0,
    labor_total_cents: 12900,
    fee_total_cents: 0,
    other_total_cents: 0,
    tax_cents: 0,
    total_cents: 12900,
    line_items: [{ line_type: 'labor', title: 'Fixture work', description: '', model_spec: '', supply_status: null, quantity: 1, unit: 'job', unit_price_cents: 12900, labor_hours: null }],
    payment_schedule_items: [],
  },
};

function handler(responseResult: string, calls: Array<{ action: string; message: string | null }> = []) {
  return createRequestFreeEstimateDeliveryHandler({
    checkEntryRateLimit: async () => ({ rateLimited: false }),
    bootstrapEstimateSession: async () => JSON.stringify({ state: 'invalid' }),
    lookupEstimateSession: async digest => {
      expect(digest).toBe(DIGEST);
      return JSON.stringify(estimateSnapshot);
    },
    lookupEstimateResponse: async () => JSON.stringify({ state: 'eligible' }),
    acceptEstimate: async () => JSON.stringify({ state: 'accepted', accepted_at: '2026-08-07T12:05:00.000Z' }),
    respondToEstimate: async (digest, action, message) => {
      expect(digest).toBe(DIGEST);
      calls.push({ action, message });
      return responseResult;
    },
    generateSessionIdentifier: () => randomBytes(32).toString('hex'),
  });
}

function request(body: unknown) {
  return new Request('https://servsync.example/api/request-free-local-estimate-delivery', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `${REQUEST_FREE_ESTIMATE_SESSION_COOKIE}=${SESSION}`,
    },
    body: JSON.stringify(body),
  });
}

test.describe('secure guest Estimate response database boundary', () => {
  test('stores immutable exact-snapshot evidence without browser table access', () => {
    const sql = source('servsync-secure-guest-estimate-response.sql');
    expect(sql).toContain('create table if not exists public.local_estimate_delivery_responses');
    expect(sql).toContain('constraint local_estimate_delivery_responses_link_unique unique (delivery_link_id)');
    expect(sql).toContain("response_type in ('request_changes', 'declined')");
    expect(sql).toContain('char_length(response_message) between 3 and 1000');
    expect(sql).toContain('alter table public.local_estimate_delivery_responses force row level security;');
    expect(sql).toContain('revoke all on table public.local_estimate_delivery_responses from public, anon, authenticated, service_role;');
    expect(sql).toContain('local_estimate_delivery_responses_immutable');
    expect(sql).not.toMatch(/\braw_(?:bearer|token)\b|session_secret|provider_credential/i);
  });

  test('uses one locked exact-version authority for mutually exclusive outcomes', () => {
    const sql = source('servsync-secure-guest-estimate-response.sql');
    const respond = between(sql, 'create or replace function public.servsync_respond_local_estimate_delivery_session(', 'alter function public.servsync_respond_local_estimate_delivery_session');
    const accept = between(sql, 'create or replace function public.servsync_accept_local_estimate_delivery_session', 'alter function public.servsync_accept_local_estimate_delivery_session');
    for (const body of [respond, accept]) {
      expect(body).toContain('pg_advisory_xact_lock');
      expect(body).toContain('hashtextextended(v_link.estimate_id::text, 390)');
      expect(body).toContain('for update');
      expect(body).toContain('lock table public.estimate_line_items, public.estimate_payment_schedule_items in share mode');
      expect(body).toContain('v_snapshot.source_updated_at is distinct from v_link.source_updated_at');
      expect(body).toContain('v_snapshot.document_snapshot is distinct from v_link.document_snapshot');
      expect(body).toContain('local_estimate_delivery_acceptances');
      expect(body).toContain('local_estimate_delivery_responses');
    }
    expect(respond).toContain("p_action not in ('request_changes', 'decline')");
    expect(accept).toContain("return jsonb_build_object('state', 'ineligible')::text");
  });

  test('reopens change requests as editable drafts and maps declines to the canonical lifecycle', () => {
    const sql = source('servsync-secure-guest-estimate-response.sql');
    const respond = between(sql, 'create or replace function public.servsync_respond_local_estimate_delivery_session(', 'alter function public.servsync_respond_local_estimate_delivery_session');
    expect(respond).toContain("if p_action = 'decline' then");
    expect(respond).toContain("set status = 'declined'");
    expect(respond).toContain("set status = 'draft'");
    expect(respond).toContain("p_event_type => 'estimate_declined'");
    expect(respond).toContain("'estimate_changes_requested'");
    expect(respond).toContain('exception when others then');
    expect(respond).not.toMatch(/set status = 'revised'/);
    expect(respond).not.toMatch(/update public\.estimate_line_items|delete from public\.estimate_line_items/i);
  });

  test('keeps all response RPCs behind the service gateway', () => {
    const sql = source('servsync-secure-guest-estimate-response.sql');
    for (const signature of [
      'servsync_lookup_local_estimate_delivery_response(text)',
      'servsync_respond_local_estimate_delivery_session(text, text, text)',
    ]) {
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon, authenticated, service_role;`);
      expect(sql).toContain(`grant execute on function public.${signature} to service_role;`);
    }
    expect(sql).not.toMatch(/grant execute on function public\.servsync_(?:lookup|respond)_local_estimate_delivery_(?:response|session)[^;]+to (?:public|anon|authenticated)/i);
  });

  test('returns sanitized contractor history without private integrity material', () => {
    const sql = source('servsync-secure-guest-estimate-response.sql');
    const metadata = between(sql, 'create or replace function public.servsync_private_local_estimate_response_metadata', 'alter function public.servsync_private_local_estimate_response_metadata');
    expect(metadata).toContain("'recipient_email', p_response.recipient_email");
    expect(metadata).toContain("'message', p_response.response_message");
    expect(metadata).not.toMatch(/snapshot_hash|token_hash|session_hash|provider_message_id/i);
    const panel = source('src/features/estimates/LocalEstimateDeliveryPanel.tsx');
    expect(panel).toContain('Revise this Estimate through the normal workflow, then send a fresh version.');
    expect(panel).toContain('Declined through secure guest delivery');
  });
});

test.describe('secure guest Estimate response gateway', () => {
  test('normalizes and forwards one required change-request message', async () => {
    const calls: Array<{ action: string; message: string | null }> = [];
    const response = await handler(JSON.stringify({
      state: 'changes_requested',
      responded_at: '2026-08-07T12:06:00.000Z',
      message: 'Please use the quieter model.',
    }), calls)(request({ action: 'request_changes', message: '  Please use the quieter model.  ' }));
    expect(response.status).toBe(200);
    expect(calls).toEqual([{ action: 'request_changes', message: 'Please use the quieter model.' }]);
    await expect(response.json()).resolves.toMatchObject({
      state: 'valid',
      response: { state: 'changes_requested', message: 'Please use the quieter model.' },
      acceptance: { state: 'ineligible' },
    });
  });

  test('allows a reason-free decline and rejects malformed or oversized responses', async () => {
    const calls: Array<{ action: string; message: string | null }> = [];
    const endpoint = handler(JSON.stringify({
      state: 'declined',
      responded_at: '2026-08-07T12:07:00.000Z',
      message: null,
    }), calls);
    expect((await endpoint(request({ action: 'decline', message: null }))).status).toBe(200);
    expect(calls).toEqual([{ action: 'decline', message: null }]);
    for (const body of [
      { action: 'request_changes', message: '  ' },
      { action: 'request_changes', message: 'x'.repeat(1_001) },
      { action: 'decline', message: 'x'.repeat(1_001) },
      { action: 'decline', message: null, estimate_id: 'forged' },
    ]) expect((await endpoint(request(body))).status).toBe(400);
  });

  test('fails closed on unexpected response fields', async () => {
    const response = await handler(JSON.stringify({
      state: 'declined',
      responded_at: '2026-08-07T12:07:00.000Z',
      message: null,
      estimate_id: 'private-leak',
    }))(request({ action: 'decline' }));
    expect(response.status).toBe(503);
  });
});

for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`requests changes safely without overflow at ${viewport.name}`, async ({ page }) => {
    const token = randomBytes(32).toString('hex');
    const consoleErrors: string[] = [];
    const failures: string[] = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('requestfailed', requestFailure => failures.push(requestFailure.url()));
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.route('**/api/request-free-local-estimate-delivery', async route => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const response = body.action === 'request_changes'
        ? { state: 'changes_requested', responded_at: '2026-08-07T12:06:00.000Z', message: body.message }
        : { state: 'eligible' };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...estimateSnapshot, acceptance: { state: response.state === 'eligible' ? 'eligible' : 'ineligible' }, response }),
      });
    });
    await page.goto(`/#/estimate-delivery?access=${token}`);
    await page.getByRole('button', { name: 'Request changes' }).click();
    await page.getByLabel('What would you like changed?').fill('<script>alert(1)</script> Please use the quieter model.');
    await page.getByRole('button', { name: 'Submit change request' }).click();
    await expect(page.getByTestId('request-free-estimate-changes-requested')).toBeVisible();
    await expect(page.getByText('<script>alert(1)</script> Please use the quieter model.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Accept Estimate' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    expect(consoleErrors).toEqual([]);
    expect(failures).toEqual([]);
  });
}

test('requires confirmation before recording a decline and preserves future-work copy', async ({ page }) => {
  const token = randomBytes(32).toString('hex');
  await page.route('**/api/request-free-local-estimate-delivery', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const response = body.action === 'decline'
      ? { state: 'declined', responded_at: '2026-08-07T12:07:00.000Z', message: body.message }
      : { state: 'eligible' };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...estimateSnapshot, acceptance: { state: response.state === 'eligible' ? 'eligible' : 'ineligible' }, response }) });
  });
  await page.goto(`/#/estimate-delivery?access=${token}`);
  await page.getByRole('button', { name: 'Decline Estimate' }).click();
  await expect(page.getByRole('button', { name: 'Confirm decline' })).toBeVisible();
  await page.getByLabel('Reason for declining (optional)').fill('Timing does not work for us.');
  await page.getByRole('button', { name: 'Confirm decline' }).click();
  await expect(page.getByTestId('request-free-estimate-declined')).toBeVisible();
  await expect(page.getByText('It does not prevent future work or a revised Estimate.')).toBeVisible();
});
