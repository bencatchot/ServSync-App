import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  REQUEST_FREE_ESTIMATE_SESSION_COOKIE,
  createRequestFreeEstimateDeliveryHandler,
} from '../../api/request-free-local-estimate-delivery';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const SESSION = 'b'.repeat(64);
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
    contractor: { business_name: 'Fixture Contractor' },
    customer: { display_name: 'Fixture Customer' },
    property: { address_line1: '100 Test Street', address_line2: '', city: 'Testville', state: 'IA', zip_code: '50000' },
    title: 'Water heater replacement',
    scope: 'Replace the existing water heater.',
    notes: '',
    terms: 'Valid for 30 days.',
    status: 'sent',
    source_updated_at: '2026-08-07T12:00:00.000Z',
    subtotal_cents: 120000,
    material_total_cents: 80000,
    labor_total_cents: 40000,
    fee_total_cents: 0,
    other_total_cents: 0,
    tax_cents: 0,
    total_cents: 120000,
    line_items: [{ line_type: 'labor', title: 'Installation', description: '', model_spec: '', supply_status: null, quantity: 1, unit: 'job', unit_price_cents: 120000, labor_hours: null }],
    payment_schedule_items: [],
  },
};

test.describe('secure guest Estimate acceptance boundary', () => {
  test('stores immutable exact-snapshot evidence behind forced RLS', () => {
    const sql = source('servsync-secure-guest-estimate-acceptance.sql');
    expect(sql).toContain('create table public.local_estimate_delivery_acceptances');
    expect(sql).toContain('constraint local_estimate_delivery_acceptances_estimate_unique unique (estimate_id)');
    expect(sql).toContain('constraint local_estimate_delivery_acceptances_link_unique unique (delivery_link_id)');
    expect(sql).toContain("acceptance_channel text not null default 'secure_guest'");
    expect(sql).toContain('snapshot_hash bytea not null');
    expect(sql).toContain("extensions.digest(convert_to(v_link.document_snapshot::text, 'UTF8'), 'sha256')");
    expect(sql).toContain('alter table public.local_estimate_delivery_acceptances force row level security;');
    expect(sql).toContain('revoke all on table public.local_estimate_delivery_acceptances from public, anon, authenticated, service_role;');
    expect(sql).toContain('local_estimate_delivery_acceptances_immutable');
    expect(sql).not.toMatch(/raw_(?:token|bearer)|session_secret|verified_identity|electronic_signature/i);
  });

  test('derives acceptance only from the recipient session and keeps execution service-only', () => {
    const sql = source('servsync-secure-guest-estimate-acceptance.sql');
    const acceptance = between(sql, 'create function public.servsync_accept_local_estimate_delivery_session(p_session_digest text)', 'alter function public.servsync_accept_local_estimate_delivery_session(text)');
    expect(acceptance.slice(0, acceptance.indexOf('returns text'))).not.toMatch(/\bp_(?:estimate_id|contractor_id|customer_id|accepted_at)\b/);
    expect(sql).toContain('grant execute on function public.servsync_accept_local_estimate_delivery_session(text) to service_role;');
    expect(sql).toContain('revoke all on function public.servsync_accept_local_estimate_delivery_session(text) from public, anon, authenticated, service_role;');
    expect(sql).not.toMatch(/grant execute on function public\.servsync_accept_local_estimate_delivery_session\(text\) to (?:public|anon|authenticated)/i);
    expect(sql).not.toContain('servsync_homeowner_respond_to_estimate');
  });

  test('locks and compares every canonical snapshot input before the sent-to-accepted transition', () => {
    const sql = source('servsync-secure-guest-estimate-acceptance.sql');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('for update;');
    expect(sql).toContain('lock table public.estimate_line_items, public.estimate_payment_schedule_items in share mode;');
    expect(sql).toContain('v_snapshot.source_updated_at is distinct from v_link.source_updated_at');
    expect(sql).toContain('v_snapshot.document_snapshot is distinct from v_link.document_snapshot');
    expect(sql).toContain("if v_estimate.status <> 'sent'");
    expect(sql).toContain("set status = 'accepted'");
    expect(sql).toContain('when unique_violation then');
    expect(sql).toContain("'acceptance_channel', 'secure_guest'");
    expect(sql).toContain("'source_rpc', 'servsync_accept_local_estimate_delivery_session'");
    expect(sql).not.toMatch(/insert into public\.(?:jobs|inspections|invoices|payments)/i);
  });

  test('revalidates expiry and local-customer lifecycle without broad recipient access', () => {
    const sql = source('servsync-secure-guest-estimate-acceptance.sql');
    for (const guard of [
      "v_link.status <> 'active'",
      'v_link.expires_at <= v_now',
      'v_session.expires_at <= v_now',
      'v_contractor.account_status <> \'active\'',
      'v_contact.homeowner_user_id is not null',
      'v_contact.claimed_at is not null',
      'v_contact.archived_at is not null',
      'v_home.home_id is not null',
      'v_home.claimed_at is not null',
      'v_home.archived_at is not null',
    ]) expect(sql).toContain(guard);
    expect(sql).not.toMatch(/grant (?:select|insert|update|delete|all).*authenticated/i);
    const panel = source('src/features/estimates/LocalEstimateDeliveryPanel.tsx');
    expect(panel).toContain('Accepted through secure guest delivery');
    expect(panel).toContain('link.acceptance.source_updated_at');
    expect(panel).toContain('link.acceptance.recipient_email');
  });

  test('accept endpoint sends only the session digest to the service boundary', async () => {
    const acceptCalls: string[] = [];
    const handler = createRequestFreeEstimateDeliveryHandler({
      checkEntryRateLimit: async () => ({ rateLimited: false }),
      bootstrapEstimateSession: async () => JSON.stringify({ state: 'invalid' }),
      lookupEstimateSession: async digest => {
        expect(digest).toBe(DIGEST);
        return JSON.stringify(estimateSnapshot);
      },
      lookupEstimateResponse: async () => JSON.stringify({ state: 'eligible' }),
      acceptEstimate: async digest => {
        acceptCalls.push(digest);
        return JSON.stringify({ state: 'accepted', accepted_at: '2026-08-07T12:05:00.000Z' });
      },
      respondToEstimate: async () => JSON.stringify({ state: 'ineligible' }),
      generateSessionIdentifier: () => randomBytes(32).toString('hex'),
    });
    const response = await handler(new Request('https://servsync.example/api/request-free-local-estimate-delivery', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${REQUEST_FREE_ESTIMATE_SESSION_COOKIE}=${SESSION}`,
      },
      body: JSON.stringify({ action: 'accept' }),
    }));
    expect(response.status).toBe(200);
    expect(acceptCalls).toEqual([DIGEST]);
    await expect(response.json()).resolves.toMatchObject({
      state: 'valid',
      acceptance: { state: 'accepted', accepted_at: '2026-08-07T12:05:00.000Z' },
    });
  });

  test('fails closed for missing sessions and uncertain acceptance responses', async () => {
    const base = {
      checkEntryRateLimit: async () => ({ rateLimited: false }),
      bootstrapEstimateSession: async () => JSON.stringify({ state: 'invalid' }),
      lookupEstimateSession: async () => JSON.stringify(estimateSnapshot),
      lookupEstimateResponse: async () => JSON.stringify({ state: 'eligible' }),
      respondToEstimate: async () => JSON.stringify({ state: 'ineligible' }),
      generateSessionIdentifier: () => SESSION,
    };
    const noSession = createRequestFreeEstimateDeliveryHandler({
      ...base,
      acceptEstimate: async () => JSON.stringify({ state: 'accepted', accepted_at: '2026-08-07T12:05:00.000Z' }),
    });
    expect((await noSession(new Request('https://servsync.example/api/request-free-local-estimate-delivery', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accept' }),
    }))).status).toBe(200);

    const unsafe = createRequestFreeEstimateDeliveryHandler({
      ...base,
      acceptEstimate: async () => JSON.stringify({ state: 'accepted', accepted_at: '2026-08-07T12:05:00.000Z', estimate_id: 'leak' }),
    });
    const unsafeResponse = await unsafe(new Request('https://servsync.example/api/request-free-local-estimate-delivery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `${REQUEST_FREE_ESTIMATE_SESSION_COOKIE}=${SESSION}` },
      body: JSON.stringify({ action: 'accept' }),
    }));
    expect(unsafeResponse.status).toBe(503);
  });
});

for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`accepts the exact Estimate and renders confirmation without overflow at ${viewport.name}`, async ({ page }) => {
    const token = randomBytes(32).toString('hex');
    const acceptedAt = '2026-08-07T12:05:00.000Z';
    const consoleErrors: string[] = [];
    const failures: string[] = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('requestfailed', request => failures.push(request.url()));
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.route('**/api/request-free-local-estimate-delivery', async route => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...estimateSnapshot,
          acceptance: body.action === 'accept'
            ? { state: 'accepted', accepted_at: acceptedAt }
            : { state: 'eligible' },
        }),
      });
    });
    page.on('dialog', dialog => void dialog.accept());
    await page.goto(`/#/estimate-delivery?access=${token}`);
    await expect(page.getByTestId('request-free-estimate-acceptance-eligible')).toBeVisible();
    await page.getByRole('button', { name: 'Accept Estimate' }).click();
    await expect(page.getByTestId('request-free-estimate-accepted')).toBeVisible();
    await expect(page.getByText('Accepted through this secure guest delivery', { exact: false })).toBeVisible();
    await expect(page.getByText('electronic signature', { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    expect(consoleErrors).toEqual([]);
    expect(failures).toEqual([]);
  });
}

test('shows a safe stale-version state without an acceptance action', async ({ page }) => {
  const token = randomBytes(32).toString('hex');
  await page.route('**/api/request-free-local-estimate-delivery', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ...estimateSnapshot, acceptance: { state: 'stale' } }),
  }));
  await page.goto(`/#/estimate-delivery?access=${token}`);
  await expect(page.getByTestId('request-free-estimate-acceptance-stale')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept Estimate' })).toHaveCount(0);
  await expect(page.getByText('Ask the contractor to send the updated Estimate.')).toBeVisible();
});
