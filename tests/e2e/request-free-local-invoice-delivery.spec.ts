import { expect, test } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function sourceBetween(text: string, start: string, end: string) {
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end, startIndex + start.length);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `Expected source marker: ${end}`).toBeGreaterThan(startIndex);
  return text.slice(startIndex, endIndex);
}

function expectInOrder(text: string, markers: string[]) {
  let previous = -1;
  for (const marker of markers) {
    const index = text.indexOf(marker, previous + 1);
    expect(index, `Expected source marker after previous marker: ${marker}`).toBeGreaterThan(previous);
    previous = index;
  }
}

test.describe('FB-003B request-free local invoice delivery source boundary', () => {
  test('migration stores only SHA-256 hashes and enforces one active grant per invoice', () => {
    const sql = source('servsync-request-free-local-invoice-delivery.sql');

    expect(sql).toContain('token_hash bytea not null unique');
    expect(sql).toContain('check (octet_length(token_hash) = 32)');
    expect(sql).toContain("lower(encode(extensions.gen_random_bytes(32), 'hex'))");
    expect(sql).toContain("extensions.digest(v_token, 'sha256')");
    expect(sql).toContain('local_invoice_delivery_links_one_active_invoice_idx');
    expect(sql).toContain("where status = 'active'");
    expect(sql).not.toMatch(/\btoken\s+text\s+not\s+null/i);
    expect(sql).not.toContain('invite_token');
  });

  test('token-free history preserves expired, replaced, and revoked lifecycle labels', () => {
    const sql = source('servsync-request-free-local-invoice-delivery.sql');

    expect(sql).toContain("when p_link.revocation_reason = 'replaced' then 'replaced'");
    expect(sql).toContain("when p_link.revocation_reason = 'expired' then 'expired'");
    expect(sql).toContain("else 'revoked'");
  });

  test('migration keeps the grant table private, RLS-enabled, and tenant/document/property bound', () => {
    const sql = source('servsync-request-free-local-invoice-delivery.sql');
    const validator = sourceBetween(
      sql,
      'create or replace function public.servsync_private_validate_local_invoice_delivery_link',
      'create or replace function public.servsync_private_local_invoice_delivery_metadata',
    );

    expect(sql).toContain('alter table public.local_invoice_delivery_links owner to postgres;');
    expect(sql).toContain('alter table public.local_invoice_delivery_links enable row level security;');
    for (const role of ['public', 'anon', 'authenticated']) {
      expect(sql).toContain(`revoke all on table public.local_invoice_delivery_links from ${role};`);
    }
    expect(sql).not.toMatch(/grant\s+(?:select|insert|update|delete|all)[\s\S]*on table public\.local_invoice_delivery_links/i);
    expect(validator).toContain('v_invoice.contractor_id is distinct from new.contractor_id');
    expect(validator).toContain('v_invoice.local_contact_id is distinct from new.local_contact_id');
    expect(validator).toContain('v_invoice.local_home_id is distinct from new.local_home_id');
    expect(validator).toContain('v_home.local_contact_id is distinct from new.local_contact_id');
  });

  test('authenticated management RPCs are exact owner/admin/office guarded and anonymous lookup is token-only', () => {
    const sql = source('servsync-request-free-local-invoice-delivery.sql');
    const roleHelper = sourceBetween(
      sql,
      'create or replace function public.servsync_private_can_manage_local_invoice_delivery',
      'create or replace function public.servsync_private_local_invoice_delivery_metadata',
    );
    const listRpc = sourceBetween(sql, 'create or replace function public.servsync_list_local_invoice_delivery_links', 'create or replace function public.servsync_create_local_invoice_delivery_link');
    const createRpc = sourceBetween(sql, 'create or replace function public.servsync_create_local_invoice_delivery_link', 'create or replace function public.servsync_rotate_local_invoice_delivery_link');
    const rotateRpc = sourceBetween(sql, 'create or replace function public.servsync_rotate_local_invoice_delivery_link', 'create or replace function public.servsync_revoke_local_invoice_delivery_link');
    const revokeRpc = sourceBetween(sql, 'create or replace function public.servsync_revoke_local_invoice_delivery_link', 'create or replace function public.servsync_lookup_local_invoice_delivery');
    const lookupRpc = sourceBetween(sql, 'create or replace function public.servsync_lookup_local_invoice_delivery', "comment on table public.local_invoice_delivery_links");

    for (const rpc of [listRpc, createRpc, rotateRpc, revokeRpc]) {
      expect(rpc).toContain('auth.uid() is null');
      expect(rpc).toContain('servsync_private_can_manage_local_invoice_delivery');
      expect(rpc).toContain('security definer');
      expect(rpc).toContain('set search_path = public');
    }
    expect(lookupRpc).toContain('p_token text');
    expect(lookupRpc).not.toContain('p_invoice_id');
    expect(lookupRpc).not.toContain('auth.uid()');
    expect(sql).toContain('grant execute on function public.servsync_lookup_local_invoice_delivery(text) to anon;');
    expect(sql).not.toContain('grant execute on function public.servsync_lookup_local_invoice_delivery(text) to authenticated;');
    expect(sql).toContain('revoke all on table public.local_invoice_delivery_links from authenticated;');
    expect(roleHelper).toContain('contractor.owner_user_id = auth.uid()');
    expect(roleHelper).toContain("member.role in ('admin', 'office')");
    expect(roleHelper).not.toMatch(/member\.role in \([^)]*(?:field_tech|viewer)/);
    expect(roleHelper).not.toContain('current_user_is_platform_admin');
    for (const role of ['public', 'anon', 'authenticated']) {
      expect(roleHelper).toContain(`revoke all on function public.servsync_private_can_manage_local_invoice_delivery(uuid) from ${role};`);
    }
  });

  test('create issues through the immutable sent lifecycle and preserves linked work-item billing state', () => {
    const sql = source('servsync-request-free-local-invoice-delivery.sql');
    const createRpc = sourceBetween(sql, 'create or replace function public.servsync_create_local_invoice_delivery_link', 'create or replace function public.servsync_rotate_local_invoice_delivery_link');

    expect(createRpc).toContain("if v_invoice.status = 'draft' then");
    expect(createRpc).toContain("set status = 'sent'");
    expect(createRpc).toContain('issued_at = coalesce(issued_at, now())');
    expect(createRpc).toContain("set billing_status = 'invoiced'");
    expect(createRpc).toContain('invoiced_invoice_id = v_invoice.id');
    expect(createRpc).toContain('from public.invoice_line_items line');
    expect(createRpc).toContain('Add at least one invoice line');
  });

  test('management paths lock canonical records in one order and never trust client tenant or document substitutions', () => {
    const sql = source('servsync-request-free-local-invoice-delivery.sql');
    const createRpc = sourceBetween(sql, 'create or replace function public.servsync_create_local_invoice_delivery_link', 'create or replace function public.servsync_rotate_local_invoice_delivery_link');
    const rotateRpc = sourceBetween(sql, 'create or replace function public.servsync_rotate_local_invoice_delivery_link', 'create or replace function public.servsync_revoke_local_invoice_delivery_link');

    expect(createRpc).not.toContain('p_contractor_id');
    expect(createRpc).not.toContain('p_local_contact_id');
    expect(createRpc).not.toContain('p_local_home_id');
    expect(rotateRpc).not.toContain('p_invoice_id');
    for (const rpc of [createRpc, rotateRpc]) {
      expectInOrder(rpc, [
        'from public.contractor_local_contacts',
        'for update',
        'from public.contractor_local_homes',
        'for update',
        'from public.invoices',
        'for update',
      ]);
    }
    expect(createRpc).toContain("link.status = 'active'");
    expect(rotateRpc).toContain("v_old_link.status <> 'active'");
  });

  test('anonymous opens update only delivery history and preserve issued invoice lifecycle states', () => {
    const sql = source('servsync-request-free-local-invoice-delivery.sql');
    const lookupRpc = sourceBetween(sql, 'create or replace function public.servsync_lookup_local_invoice_delivery', "comment on table public.local_invoice_delivery_links");

    expect(lookupRpc).toContain("v_invoice.status not in ('sent', 'viewed', 'paid', 'partially_paid', 'overdue')");
    expect(lookupRpc).toContain('update public.local_invoice_delivery_links');
    expect(lookupRpc).toContain('open_count = open_count + 1');
    expect(lookupRpc).not.toContain('update public.invoices');
    expect(lookupRpc).not.toContain("status = 'viewed'");
    expect(lookupRpc).not.toMatch(/insert into public\.(?:notifications|payments|home_documents|activity_events)/i);
    expect(lookupRpc).toContain("when others then\n    return jsonb_build_object('state', 'error')");
  });

  test('claim transition blocks create and rotate but leaves lookup independent of claim state', () => {
    const sql = source('servsync-request-free-local-invoice-delivery.sql');
    const createRpc = sourceBetween(sql, 'create or replace function public.servsync_create_local_invoice_delivery_link', 'create or replace function public.servsync_rotate_local_invoice_delivery_link');
    const rotateRpc = sourceBetween(sql, 'create or replace function public.servsync_rotate_local_invoice_delivery_link', 'create or replace function public.servsync_revoke_local_invoice_delivery_link');
    const lookupRpc = sourceBetween(sql, 'create or replace function public.servsync_lookup_local_invoice_delivery', "comment on table public.local_invoice_delivery_links");

    for (const rpc of [createRpc, rotateRpc]) {
      expect(rpc).toContain('v_contact.homeowner_user_id is not null');
      expect(rpc).toContain('v_contact.claimed_at is not null');
      expect(rpc).toContain('v_home.home_id is not null');
      expect(rpc).toContain('v_home.claimed_at is not null');
    }
    expect(lookupRpc).not.toContain('v_contact.claimed_at');
    expect(lookupRpc).not.toContain('v_home.claimed_at');
    expect(lookupRpc).not.toContain('v_contact.homeowner_user_id is not null');
  });

  test('public DTO excludes IDs, token material, internal notes, and private delivery metadata', () => {
    const sql = source('servsync-request-free-local-invoice-delivery.sql');
    const lookupRpc = sourceBetween(sql, 'create or replace function public.servsync_lookup_local_invoice_delivery', "comment on table public.local_invoice_delivery_links");
    const publicResult = sourceBetween(lookupRpc, "return jsonb_build_object(\n    'state', 'valid'", 'end;\n$$;');

    for (const forbidden of [
      "'id'",
      "'contractor_id'",
      "'invoice_id'",
      "'local_contact_id'",
      "'local_home_id'",
      "'token'",
      "'token_hash'",
      "'internal_notes'",
      "'revocation_reason'",
      "'open_count'",
      "'created_by'",
    ]) {
      expect(publicResult).not.toContain(forbidden);
    }
    expect(publicResult).toContain("'line_items', v_lines");
    expect(publicResult).toContain("'business_name', v_contractor.business_name");
    expect(publicResult).toContain("'display_name', v_contact.display_name");
  });

  test('one-time copy remains memory-only and the sensitive route excludes analytics and auth shell loading', () => {
    const app = source('src/App.tsx');
    const panel = source('src/features/invoices/LocalInvoiceDeliveryPanel.tsx');
    const publicView = source('src/features/invoices/RequestFreeInvoiceView.tsx');
    const publicClient = source('src/publicSupabaseClient.ts');
    const entry = source('src/main.tsx');
    const links = source('src/appLinks.ts');

    expect(app).toContain("if (route === 'invoice-delivery')");
    expect(app.indexOf("if (route === 'invoice-delivery')")).toBeLessThan(app.indexOf('<Analytics />'));
    expect(entry).toContain("await import('./features/invoices/RequestFreeInvoiceView')");
    expect(entry).toContain("await import('./App')");
    expect(entry.indexOf("await import('./features/invoices/RequestFreeInvoiceView')")).toBeLessThan(entry.indexOf("await import('./App')"));
    expect(publicClient).toContain('autoRefreshToken: false');
    expect(publicClient).toContain('detectSessionInUrl: false');
    expect(publicClient).toContain('persistSession: false');
    expect(links).toContain("return appRouteUrl('invoice-delivery', { access: token }, location);");
    expect(panel).toContain('navigator.clipboard.writeText(urlRef.current)');
    expect(panel).toContain('setOneTimeUrl(\'\')');
    expect(panel).toContain("result.token = ''");
    expect(panel).toContain('Rotate the link to receive another copy');
    expect(panel).toContain('if (busyRef.current) return');
    expect(panel).toContain('min={1}');
    expect(panel).toContain('max={90}');
    expect(panel).not.toMatch(/localStorage|sessionStorage|indexedDB/i);
    expect(panel).not.toMatch(/console\.(log|info|warn|error)/);
    expect(publicView).toContain("robots.content = 'noindex, nofollow, noarchive'");
    expect(publicView).toContain("referrer.content = 'no-referrer'");
    expect(publicView).not.toContain('<Analytics');
  });
});

test.describe('FB-003B request-free local invoice recipient UI', () => {
  const validInvoice = {
    state: 'valid',
    invoice: {
      contractor: { business_name: 'Fixture Plumbing', email: 'office@example.invalid', phone: '555-0100', city: 'Test City', state: 'IA' },
      customer: { display_name: 'Fixture Customer' },
      property: { nickname: 'Main home', address_line1: '100 Test Street', address_line2: '', city: 'Test City', state: 'IA', zip_code: '50000' },
      invoice_number: 'INV-FIXTURE',
      title: 'Water heater service',
      scope: 'Customer-safe service scope.',
      notes: 'Customer-facing note.',
      terms: 'Payment due under the agreed terms.',
      status: 'sent',
      subtotal_cents: 12500,
      tax_cents: 875,
      discount_cents: 0,
      total_cents: 13375,
      amount_paid_cents: 0,
      issued_at: '2026-08-03T12:00:00.000Z',
      due_at: '2026-09-02T12:00:00.000Z',
      line_items: [
        { title: 'Service labor', description: 'Diagnose and repair.', line_type: 'labor', quantity: 1, unit: 'service', unit_price_cents: 12500 },
        { title: 'Price-required material', description: 'Contractor will confirm pricing.', line_type: 'material', quantity: 1, unit: 'each', unit_price_cents: null },
        { title: 'Included adjustment', description: 'Included at no charge.', line_type: 'other', quantity: 1, unit: 'each', unit_price_cents: 0 },
      ],
    },
  };

  for (const viewport of [
    { name: 'desktop', width: 1280, height: 720 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`renders a private, responsive invoice at ${viewport.name} size`, async ({ page }) => {
      const token = randomBytes(32).toString('hex');
      const consoleErrors: string[] = [];
      const failedRequests: string[] = [];
      const analyticsRequests: string[] = [];
      const unrelatedAppRequests: string[] = [];
      page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text().replaceAll(token, '[redacted]'));
      });
      page.on('requestfailed', request => failedRequests.push(request.url().replaceAll(token, '[redacted]')));
      page.on('request', request => {
        if (/\/_vercel\/insights(?:\/|\?|$)/i.test(request.url())) analyticsRequests.push(request.url());
        if (/\/src\/App\.tsx(?:\?|$)|\/assets\/App-[^/]+\.js(?:\?|$)|@vercel_analytics/i.test(request.url())) unrelatedAppRequests.push(request.url());
      });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.route('**/rest/v1/rpc/servsync_lookup_local_invoice_delivery', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(validInvoice),
      }));

      await page.goto(`/#/invoice-delivery?access=${token}`);
      await expect(page.getByTestId('request-free-invoice-valid')).toBeVisible();
      expect(new URL(page.url()).search).toBe('');
      await expect(page.getByRole('heading', { level: 1, name: 'Water heater service' })).toBeVisible();
      await expect(page.getByText('Fixture Customer')).toBeVisible();
      await expect(page.getByText('100 Test Street')).toBeVisible();
      await expect(page.getByText('Service labor')).toBeVisible();
      await expect(page.getByText('Price-required material')).toBeVisible();
      await expect(page.getByText('Price required', { exact: true })).toBeVisible();
      await expect(page.getByText('Included adjustment')).toBeVisible();
      await expect(page.getByText('$0.00 each', { exact: false })).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow, noarchive');
      await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);
      expect(await page.evaluate(secret => ({
        local: Object.values(localStorage).includes(secret),
        session: Object.values(sessionStorage).includes(secret),
        cookie: document.cookie.includes(secret),
        historyState: JSON.stringify(history.state).includes(secret),
      }), token)).toEqual({ local: false, session: false, cookie: false, historyState: false });

      await page.reload();
      await expect(page.getByTestId('request-free-invoice-valid')).toBeVisible();
      expect(consoleErrors).toEqual([]);
      expect(failedRequests).toEqual([]);
      expect(analyticsRequests).toEqual([]);
      expect(unrelatedAppRequests).toEqual([]);
    });
  }

  test('rejects malformed tokens before making a lookup request', async ({ page }) => {
    let lookupRequests = 0;
    page.on('request', request => {
      if (request.url().includes('/rpc/servsync_lookup_local_invoice_delivery')) lookupRequests += 1;
    });
    await page.goto('/#/invoice-delivery?access=not-a-token');
    await expect(page.getByTestId('request-free-invoice-invalid')).toBeVisible();
    expect(lookupRequests).toBe(0);
  });

  for (const state of ['invalid', 'expired', 'revoked', 'replaced', 'unavailable', 'error'] as const) {
    test(`renders the safe ${state} state without invoice content`, async ({ page }) => {
      const token = randomBytes(32).toString('hex');
      await page.route('**/rest/v1/rpc/servsync_lookup_local_invoice_delivery', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ state }),
      }));
      await page.goto(`/#/invoice-delivery?access=${token}`);
      await expect(page.getByTestId(`request-free-invoice-${state}`)).toBeVisible();
      await expect(page.getByText('Fixture Customer')).toHaveCount(0);
      await expect(page.getByText('100 Test Street')).toHaveCount(0);
    });
  }
});
