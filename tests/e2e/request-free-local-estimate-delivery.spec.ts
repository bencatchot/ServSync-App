import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  MAX_ESTIMATE_PUBLIC_RESPONSE_BYTES,
  MAX_ESTIMATE_REQUEST_BYTES,
  REQUEST_FREE_ESTIMATE_RATE_LIMIT_ID,
  REQUEST_FREE_ESTIMATE_SESSION_COOKIE,
  REQUEST_FREE_ESTIMATE_SESSION_SECONDS,
  createRequestFreeEstimateDeliveryHandler,
} from '../../api/request-free-local-estimate-delivery';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const TOKEN = 'a'.repeat(64);
const SESSION = 'b'.repeat(64);

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

function gatewayFixture(options: {
  bootstrap?: string;
  session?: string;
  response?: string;
  accepted?: string;
  responded?: string;
  rateLimited?: boolean;
  configurationError?: boolean;
} = {}) {
  const bootstrapCalls: Array<{ token: string; digest: string; previous: string | null }> = [];
  const sessionCalls: string[] = [];
  const responseCalls: string[] = [];
  const acceptCalls: string[] = [];
  const respondCalls: Array<{ digest: string; action: string; message: string | null }> = [];
  return {
    bootstrapCalls,
    sessionCalls,
    responseCalls,
    acceptCalls,
    respondCalls,
    handler: createRequestFreeEstimateDeliveryHandler({
      checkEntryRateLimit: async () => ({
        rateLimited: options.rateLimited ?? false,
        configurationError: options.configurationError,
      }),
      bootstrapEstimateSession: async (token, digest, previous) => {
        bootstrapCalls.push({ token, digest, previous });
        return options.bootstrap ?? JSON.stringify({ state: 'invalid' });
      },
      lookupEstimateSession: async digest => {
        sessionCalls.push(digest);
        return options.session ?? JSON.stringify({ state: 'unavailable' });
      },
      lookupEstimateResponse: async digest => {
        responseCalls.push(digest);
        return options.response ?? JSON.stringify({ state: 'eligible' });
      },
      acceptEstimate: async digest => {
        acceptCalls.push(digest);
        return options.accepted ?? JSON.stringify({ state: 'accepted', accepted_at: '2026-08-07T12:05:00.000Z' });
      },
      respondToEstimate: async (digest, action, message) => {
        respondCalls.push({ digest, action, message });
        return options.responded ?? JSON.stringify({ state: 'declined', responded_at: '2026-08-07T12:06:00.000Z', message: null });
      },
      generateSessionIdentifier: () => SESSION,
    }),
  };
}

function request(body: string, headers: HeadersInit = {}) {
  return new Request('https://servsync.example/api/request-free-local-estimate-delivery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
}

const validEstimate = {
  state: 'valid',
  estimate: {
    contractor: { business_name: 'Fixture Contractor' },
    customer: { display_name: 'Fixture Customer' },
    property: { address_line1: '100 Test Street', address_line2: '', city: 'Testville', state: 'IA', zip_code: '50000' },
    title: 'Water heater replacement',
    scope: 'Replace the existing water heater.',
    notes: 'Permit excluded.',
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
    line_items: [
      { line_type: 'material', title: 'Water heater', description: '50-gallon unit', model_spec: 'WH-50', supply_status: 'contractor_supplied', quantity: 1, unit: 'each', unit_price_cents: 80000, labor_hours: null },
      { line_type: 'labor', title: 'Installation labor', description: '', model_spec: '', supply_status: null, quantity: 1, unit: 'job', unit_price_cents: 40000, labor_hours: null },
    ],
    payment_schedule_items: [{ invoice_type: 'deposit', label: 'Deposit', calculated_amount_cents: 60000, due_trigger: 'At approval' }],
  },
  acceptance: { state: 'eligible' },
};

const storedEstimateSnapshot = { state: validEstimate.state, estimate: validEstimate.estimate };

test.describe('request-free local Estimate source and SQL boundary', () => {
  test('stores an immutable allowlisted snapshot and only SHA-256 bearer/session digests', () => {
    const sql = source('servsync-request-free-local-estimate-delivery.sql');
    expect(sql).toContain('token_hash bytea not null unique');
    expect(sql).toContain("extensions.digest(v_token, 'sha256')");
    expect(sql).toContain('document_snapshot jsonb not null');
    expect(sql).toContain('new.document_snapshot is distinct from old.document_snapshot');
    expect(sql).toContain('local_estimate_delivery_links_one_active_estimate_idx');
    expect(sql).not.toMatch(/\braw_token\b|\bsession_token\b/i);
    expect(sql).not.toContain("'email'");
    expect(sql).not.toContain("'phone'");
    expect(sql).not.toContain("'claim_token'");
    expect(sql).not.toContain("'invitation_token'");
  });

  test('keeps private storage inaccessible and restricts public execution to the service gateway', () => {
    const sql = source('servsync-request-free-local-estimate-delivery.sql');
    for (const table of ['local_estimate_delivery_links', 'local_estimate_delivery_sessions', 'local_estimate_delivery_rate_buckets']) {
      expect(sql).toContain(`alter table public.${table} enable row level security;`);
      expect(sql).toContain(`alter table public.${table} force row level security;`);
      expect(sql).toContain(`revoke all on table public.${table} from public, anon, authenticated, service_role;`);
    }
    expect(sql).toContain('grant execute on function public.servsync_bootstrap_local_estimate_delivery_session(text, text, text) to service_role;');
    expect(sql).toContain('grant execute on function public.servsync_lookup_local_estimate_delivery_session(text) to service_role;');
    expect(sql).not.toMatch(/grant execute on function public\.servsync_(?:bootstrap|lookup)_local_estimate_delivery_session[^;]+to (?:public|anon|authenticated)/i);
  });

  test('derives tenant authority and permits only Owner, active Admin, and active Office', () => {
    const sql = source('servsync-request-free-local-estimate-delivery.sql');
    const roleHelper = between(sql, 'create function public.servsync_private_can_manage_local_estimate_delivery', 'create function public.servsync_private_current_local_estimate_delivery_contractor_id');
    const create = between(sql, 'create function public.servsync_create_local_estimate_delivery_link', 'create function public.servsync_rotate_local_estimate_delivery_link');
    expect(roleHelper).toContain('contractor.owner_user_id = auth.uid()');
    expect(roleHelper).toContain("member.role in ('admin', 'office')");
    expect(roleHelper).toContain("member.status = 'active'");
    expect(roleHelper).not.toMatch(/member\.role in \([^)]*(?:field_tech|viewer)/);
    expect(create).not.toContain('p_contractor_id');
    expect(create).not.toContain('p_local_contact_id');
    expect(create).not.toContain('p_local_home_id');
    expect(create).toContain('servsync_private_current_local_estimate_delivery_contractor_id()');
  });

  test('fails closed for claimed, mapped, archived, connected, cross-tenant, and unsupported status records', () => {
    const sql = source('servsync-request-free-local-estimate-delivery.sql');
    const create = between(sql, 'create function public.servsync_create_local_estimate_delivery_link', 'create function public.servsync_rotate_local_estimate_delivery_link');
    const bootstrap = between(sql, 'create function public.servsync_bootstrap_local_estimate_delivery_session', 'create function public.servsync_lookup_local_estimate_delivery_session');
    for (const guard of [
      'v_estimate.homeowner_user_id is not null',
      'v_contact.homeowner_user_id is not null',
      'v_contact.claimed_at is not null',
      'v_contact.archived_at is not null',
      'v_home.home_id is not null',
      'v_home.claimed_at is not null',
      'v_home.archived_at is not null',
    ]) {
      expect(create).toContain(guard);
    }
    for (const guard of [
      'v_contact.homeowner_user_id is not null',
      'v_contact.claimed_at is not null',
      'v_contact.archived_at is not null',
      'v_home.home_id is not null',
      'v_home.claimed_at is not null',
      'v_home.archived_at is not null',
    ]) expect(bootstrap).toContain(guard);
    expect(create).toContain("v_estimate.status not in ('draft', 'sent', 'revised')");
    expect(bootstrap).toContain("v_contractor.account_status <> 'active'");
    expect(bootstrap).toContain("return jsonb_build_object('state', 'unavailable')::text");
  });

  test('publishes a stable sent snapshot and never offers anonymous acceptance or mutation', () => {
    const sql = source('servsync-request-free-local-estimate-delivery.sql');
    const snapshot = between(sql, 'create function public.servsync_private_build_local_estimate_snapshot', 'create function public.servsync_private_validate_local_estimate_delivery_link');
    expect(snapshot).toContain("'status', 'sent'");
    expect(snapshot).toContain("'line_items', v_lines");
    expect(snapshot).toContain("'payment_schedule_items', v_schedule");
    expect(snapshot).toContain('serialized_bytes > 262144');
    expect(sql).not.toContain('servsync_homeowner_respond_to_estimate');
    expect(sql).not.toMatch(/insert into public\.(?:notifications|payments|home_documents)/i);
  });

  test('keeps connected delivery and current invoice security paths separate', () => {
    const app = source('src/App.tsx');
    const main = source('src/main.tsx');
    const gateway = source('api/request-free-local-estimate-delivery.ts');
    expect(app).toContain('sendEstimateToHomeowner');
    expect(app).toContain('<LocalEstimateDeliveryPanel');
    expect(app).toContain('estimate.local_home_id');
    expect(main).toContain("route !== 'invoice-delivery' && route !== 'estimate-delivery'");
    expect(main).toContain("await import('./features/estimates/RequestFreeEstimateView')");
    expect(gateway).toContain('process.env.SUPABASE_SERVICE_ROLE_KEY');
    expect(gateway).not.toContain('VITE_SUPABASE_SERVICE_ROLE_KEY');
    expect(gateway).not.toMatch(/console\.(?:log|info|warn|error)/);
  });
});

test.describe('request-free local Estimate same-origin gateway', () => {
  test('accepts only exact POST JSON bootstrap/session shapes and fails closed without a session', async () => {
    const fixture = gatewayFixture();
    const get = await fixture.handler(new Request('https://servsync.example/api/request-free-local-estimate-delivery'));
    expect(get.status).toBe(405);
    for (const body of ['{', JSON.stringify({ token: 'bad' }), JSON.stringify({ token: TOKEN, extra: true }), JSON.stringify({ action: 'request_changes' }), JSON.stringify({ action: 'accept', estimate_id: 'forged' }), JSON.stringify([])]) {
      expect((await fixture.handler(request(body))).status).toBe(400);
    }
    expect((await fixture.handler(request('{}'))).status).toBe(200);
    expect(fixture.sessionCalls).toEqual([]);
    await fixture.handler(request(JSON.stringify({ token: TOKEN })));
    expect(fixture.bootstrapCalls).toHaveLength(1);
  });

  test('creates a strict 30-minute HttpOnly cookie and stores only the session digest', async () => {
    const fixture = gatewayFixture({ bootstrap: JSON.stringify(storedEstimateSnapshot) });
    const response = await fixture.handler(request(JSON.stringify({ token: TOKEN })));
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(response.status).toBe(200);
    expect(cookie).toContain(`${REQUEST_FREE_ESTIMATE_SESSION_COOKIE}=${SESSION}`);
    expect(cookie).toContain(`Max-Age=${REQUEST_FREE_ESTIMATE_SESSION_SECONDS}`);
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).not.toContain(TOKEN);
    expect(fixture.bootstrapCalls[0]).toEqual({
      token: TOKEN,
      digest: createHash('sha256').update(SESSION).digest('hex'),
      previous: null,
    });
    expect(fixture.responseCalls).toEqual([createHash('sha256').update(SESSION).digest('hex')]);
  });

  test('enforces request, response, Firewall, and safe-shape boundaries', async () => {
    expect(MAX_ESTIMATE_REQUEST_BYTES).toBe(4096);
    expect(MAX_ESTIMATE_PUBLIC_RESPONSE_BYTES).toBe(262144);
    expect(REQUEST_FREE_ESTIMATE_RATE_LIMIT_ID).toBe('request-free-local-invoice-delivery');
    expect((await gatewayFixture({ rateLimited: true }).handler(request('{}'))).status).toBe(429);
    expect((await gatewayFixture({ configurationError: true }).handler(request('{}'))).status).toBe(503);
    const oversized = await gatewayFixture().handler(request('x'.repeat(MAX_ESTIMATE_REQUEST_BYTES + 1)));
    expect(oversized.status).toBe(413);
    const wrongShape = await gatewayFixture({ bootstrap: JSON.stringify({ state: 'valid', invoice: {} }) }).handler(request(JSON.stringify({ token: TOKEN })));
    expect(wrongShape.status).toBe(503);
  });
});

for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`renders a private Estimate snapshot without overflow at ${viewport.name} size`, async ({ page }) => {
    const token = randomBytes(32).toString('hex');
    const session = randomBytes(32).toString('hex');
    const bodies: Array<Record<string, unknown>> = [];
    const consoleErrors: string[] = [];
    const failures: string[] = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('requestfailed', requestFailure => failures.push(requestFailure.url()));
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.route('**/api/request-free-local-estimate-delivery', route => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      bodies.push(body);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: Object.hasOwn(body, 'token') ? { 'Set-Cookie': `${REQUEST_FREE_ESTIMATE_SESSION_COOKIE}=${session}; Max-Age=1800; Path=/; Secure; HttpOnly; SameSite=Strict` } : {},
        body: JSON.stringify(validEstimate),
      });
    });

    await page.goto(`/#/estimate-delivery?access=${token}`);
    await expect(page.getByTestId('request-free-estimate-valid')).toBeVisible();
    expect(page.url()).not.toContain(token);
    expect(bodies[0]).toEqual({ token });
    await expect(page.getByRole('heading', { level: 1, name: 'Water heater replacement' })).toBeVisible();
    await expect(page.getByText('Fixture Customer')).toBeVisible();
    await expect(page.getByText('Water heater', { exact: true })).toBeVisible();
    await expect(page.getByText('Viewing alone does not record acceptance', { exact: false })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow, noarchive');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    expect(await page.evaluate(secret => ({
      local: Object.values(localStorage).includes(secret),
      session: Object.values(sessionStorage).includes(secret),
      cookie: document.cookie.includes(secret),
      state: JSON.stringify(history.state).includes(secret),
    }), token)).toEqual({ local: false, session: false, cookie: false, state: false });

    await page.reload();
    await expect(page.getByTestId('request-free-estimate-valid')).toBeVisible();
    expect(bodies[1]).toEqual({});
    expect(consoleErrors).toEqual([]);
    expect(failures).toEqual([]);
  });
}
