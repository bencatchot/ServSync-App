import { expect, test } from '@playwright/test';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { containDialogTabFocus } from '../../src/features/invoices/dialogFocusContainment';

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
  test('keeps the Sandbox-installed foundation migration byte-for-byte unchanged', () => {
    const sql = source('servsync-request-free-local-invoice-delivery.sql');
    expect(createHash('sha256').update(sql).digest('hex')).toBe(
      '244b3a9275862f6c855a360970d74b4b42b581aca36f26c7fb7adf82001fe8b4',
    );
  });

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
    const currentContractorHelper = sourceBetween(
      sql,
      'create or replace function public.servsync_private_current_local_invoice_delivery_contractor_id',
      'create or replace function public.servsync_private_local_invoice_delivery_metadata',
    );
    const listRpc = sourceBetween(sql, 'create or replace function public.servsync_list_local_invoice_delivery_links', 'create or replace function public.servsync_create_local_invoice_delivery_link');
    const createRpc = sourceBetween(sql, 'create or replace function public.servsync_create_local_invoice_delivery_link', 'create or replace function public.servsync_rotate_local_invoice_delivery_link');
    const rotateRpc = sourceBetween(sql, 'create or replace function public.servsync_rotate_local_invoice_delivery_link', 'create or replace function public.servsync_revoke_local_invoice_delivery_link');
    const revokeRpc = sourceBetween(sql, 'create or replace function public.servsync_revoke_local_invoice_delivery_link', 'create or replace function public.servsync_lookup_local_invoice_delivery');
    const lookupRpc = sourceBetween(sql, 'create or replace function public.servsync_lookup_local_invoice_delivery', "comment on table public.local_invoice_delivery_links");

    for (const rpc of [listRpc, createRpc, rotateRpc, revokeRpc]) {
      expect(rpc).toContain('auth.uid() is null');
      expect(rpc).toContain('servsync_private_current_local_invoice_delivery_contractor_id');
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
    expect(currentContractorHelper).toContain('from public.servsync_current_contractor_profile() contractor');
    expect(currentContractorHelper).toContain('servsync_private_can_manage_local_invoice_delivery(contractor.id)');
    for (const role of ['public', 'anon', 'authenticated']) {
      expect(roleHelper).toContain(`revoke all on function public.servsync_private_can_manage_local_invoice_delivery(uuid) from ${role};`);
      expect(currentContractorHelper).toContain(`revoke all on function public.servsync_private_current_local_invoice_delivery_contractor_id() from ${role};`);
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

  test('management paths authorize the current contractor before tenant-scoped resolution and canonical locks', () => {
    const sql = source('servsync-request-free-local-invoice-delivery.sql');
    const listRpc = sourceBetween(sql, 'create or replace function public.servsync_list_local_invoice_delivery_links', 'create or replace function public.servsync_create_local_invoice_delivery_link');
    const createRpc = sourceBetween(sql, 'create or replace function public.servsync_create_local_invoice_delivery_link', 'create or replace function public.servsync_rotate_local_invoice_delivery_link');
    const rotateRpc = sourceBetween(sql, 'create or replace function public.servsync_rotate_local_invoice_delivery_link', 'create or replace function public.servsync_revoke_local_invoice_delivery_link');
    const revokeRpc = sourceBetween(sql, 'create or replace function public.servsync_revoke_local_invoice_delivery_link', 'create or replace function public.servsync_lookup_local_invoice_delivery');

    expect(createRpc).not.toContain('p_contractor_id');
    expect(createRpc).not.toContain('p_local_contact_id');
    expect(createRpc).not.toContain('p_local_home_id');
    expect(rotateRpc).not.toContain('p_invoice_id');
    for (const rpc of [listRpc, createRpc, rotateRpc, revokeRpc]) {
      expectInOrder(rpc, [
        'v_authorized_contractor_id := public.servsync_private_current_local_invoice_delivery_contractor_id()',
        'if v_authorized_contractor_id is null then',
        'from public.',
      ]);
      expect(rpc).not.toContain('You do not have permission to manage invoice delivery.');
    }
    for (const rpc of [createRpc, rotateRpc, revokeRpc]) {
      expectInOrder(rpc, [
        'from public.contractor_local_contacts',
        'for update',
        'from public.contractor_local_homes',
        'for update',
        'from public.invoices',
        'for update',
      ]);
      expect(rpc).toContain('contractor_id = v_authorized_contractor_id');
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

  test('public DTO uses an exact rendered allowlist and keeps legacy descriptions out of public detail', () => {
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
      "'email'",
      "'phone'",
      "'city', v_contractor.city",
      "'state', v_contractor.state",
      "'nickname'",
      "'line_type'",
    ]) {
      expect(publicResult).not.toContain(forbidden);
    }
    expect(lookupRpc).toContain("'title', coalesce(nullif(trim(line.line_title), ''), nullif(trim(line.description), ''), 'Invoice item')");
    expect(lookupRpc).toContain("'description', coalesce(nullif(trim(line.customer_description), ''), '')");
    expect(lookupRpc).not.toContain("'description', coalesce(nullif(trim(line.customer_description), ''), nullif(trim(line.description), ''), '')");
    expect(lookupRpc).toContain("'contractor', jsonb_build_object(\n        'business_name', v_contractor.business_name\n      )");
    expect(lookupRpc).toContain("'property', jsonb_build_object(\n        'address_line1', v_home.address_line1");
    expect(publicResult).toContain("'line_items', v_lines");
    expect(publicResult).toContain("'business_name', v_contractor.business_name");
    expect(publicResult).toContain("'display_name', v_contact.display_name");
  });

  test('one-time copy remains memory-only and the sensitive route excludes analytics and auth shell loading', () => {
    const app = source('src/App.tsx');
    const panel = source('src/features/invoices/LocalInvoiceDeliveryPanel.tsx');
    const publicView = source('src/features/invoices/RequestFreeInvoiceView.tsx');
    const publicLookup = source('src/features/invoices/requestFreeInvoiceDelivery.ts');
    const gateway = source('api/request-free-local-invoice-delivery.ts');
    const entry = source('src/main.tsx');
    const links = source('src/appLinks.ts');

    expect(app).toContain("if (route === 'invoice-delivery')");
    expect(app.indexOf("if (route === 'invoice-delivery')")).toBeLessThan(app.indexOf('<Analytics />'));
    expect(entry).toContain("await import('./features/invoices/RequestFreeInvoiceView')");
    expect(entry).toContain("await import('./App')");
    expect(entry).toContain("window.addEventListener('hashchange', onHashChange)");
    expect(entry).toContain("window.removeEventListener('hashchange', onHashChange)");
    expect(entry).toContain('root.render(null)');
    expect(entry).toContain('<RequestFreeInvoiceView key={target.token} token={target.token} />');
    expect(entry.indexOf("await import('./features/invoices/RequestFreeInvoiceView')")).toBeLessThan(entry.indexOf("await import('./App')"));
    expect(publicLookup).toContain("request('/api/request-free-local-invoice-delivery'");
    expect(publicLookup).toContain("credentials: 'omit'");
    expect(publicLookup).toContain("cache: 'no-store'");
    expect(publicLookup).toContain("referrerPolicy: 'no-referrer'");
    expect(publicLookup).not.toContain("client.rpc('servsync_lookup_local_invoice_delivery'");
    expect(gateway).toContain('process.env.SUPABASE_SERVICE_ROLE_KEY');
    expect(links).toContain("return appRouteUrl('invoice-delivery', { access: token }, location);");
    expect(panel).toContain('navigator.clipboard.writeText(urlRef.current)');
    expect(panel).toContain('setOneTimeUrl(\'\')');
    expect(panel).toContain("result.token = ''");
    expect(panel).toContain('Rotate the link to receive another copy');
    expect(panel).toContain('if (busyRef.current) return');
    expect(panel).toContain('min={1}');
    expect(panel).toContain('max={90}');
    expect(panel).toContain('containDialogTabFocus(event, dialogRef.current)');
    expect(panel).toContain('focusTarget?.focus()');
    expect(panel).toContain('urlRef.current = url');
    expect(panel).not.toContain('inputRef.current.value =');
    expect(panel).toContain("if (event.key === 'Escape')");
    expect(panel).toContain('event.preventDefault()');
    expect(panel).not.toMatch(/localStorage|sessionStorage|indexedDB/i);
    expect(panel).not.toMatch(/console\.(log|info|warn|error)/);
    expect(publicView).toContain("robots.content = 'noindex, nofollow, noarchive'");
    expect(publicView).toContain("referrer.content = 'no-referrer'");
    expect(publicView).not.toContain('<Analytics');
  });

  test('corrective migration closes direct PostgREST lookup and leaves one service-only signature', () => {
    const sql = source('servsync-request-free-local-invoice-delivery-gateway-hardening.sql');

    for (const role of ['public', 'anon', 'authenticated', 'service_role']) {
      expect(sql).toContain(`revoke all on function public.servsync_lookup_local_invoice_delivery(text) from ${role};`);
    }
    expect(sql).toContain('grant execute on function public.servsync_lookup_local_invoice_delivery(text) to service_role;');
    expect(sql).not.toContain('grant execute on function public.servsync_lookup_local_invoice_delivery(text) to anon;');
    expect(sql).toContain("procedure.proname = 'servsync_lookup_local_invoice_delivery'");
    expect(sql).toContain('if v_lookup_count <> 1');
    expect(sql).toContain('returns text');
  });

  test('database rate buckets are atomic, private, bounded, and precede protected record locks', () => {
    const sql = source('servsync-request-free-local-invoice-delivery-gateway-hardening.sql');
    const consume = sourceBetween(
      sql,
      'create or replace function public.servsync_private_consume_local_invoice_delivery_rate_limit',
      'create or replace function public.servsync_private_cleanup_local_invoice_delivery_rate_limits',
    );
    const cleanup = sourceBetween(
      sql,
      'create or replace function public.servsync_private_cleanup_local_invoice_delivery_rate_limits',
      'create or replace function public.servsync_private_render_local_invoice_delivery',
    );
    const lookup = sourceBetween(
      sql,
      'create function public.servsync_lookup_local_invoice_delivery',
      'alter function public.servsync_lookup_local_invoice_delivery(text) owner to postgres',
    );

    expect(sql).toContain('create table public.local_invoice_delivery_rate_buckets');
    expect(sql).toContain('primary key (scope, key_hash)');
    expect(sql).toContain("check (scope in ('global', 'token'))");
    expect(sql).toContain('alter table public.local_invoice_delivery_rate_buckets enable row level security');
    for (const role of ['public', 'anon', 'authenticated', 'service_role']) {
      expect(sql).toContain(`revoke all on table public.local_invoice_delivery_rate_buckets from ${role};`);
    }
    expect(consume).toContain('on conflict (scope, key_hash) do update');
    expect(consume).toContain('return coalesce(v_allowed, false)');
    expect(cleanup).toContain("bucket.scope = 'token'");
    expect(cleanup).toContain("interval '24 hours'");
    expect(cleanup).toContain('limit 25');
    expect(cleanup).not.toContain("bucket.scope = 'global'");
    expectInOrder(lookup, [
      "'global', v_global_key, 300, 5::numeric",
      'from public.local_invoice_delivery_links link',
      "'token', v_token_hash, 10, (1::numeric / 6::numeric)",
      'from public.contractor_local_contacts',
      'for update',
      'from public.contractor_local_homes',
      'for update',
      'from public.invoices',
      'for update',
    ]);
  });

  test('public rendering rejects line and byte overages before history mutation and saturates counters', () => {
    const sql = source('servsync-request-free-local-invoice-delivery-gateway-hardening.sql');
    const renderer = sourceBetween(
      sql,
      'create or replace function public.servsync_private_render_local_invoice_delivery',
      'create or replace function public.servsync_create_local_invoice_delivery_link',
    );
    const createRpc = sourceBetween(
      sql,
      'create or replace function public.servsync_create_local_invoice_delivery_link',
      'create or replace function public.servsync_rotate_local_invoice_delivery_link',
    );
    const rotateRpc = sourceBetween(
      sql,
      'create or replace function public.servsync_rotate_local_invoice_delivery_link',
      'drop function public.servsync_lookup_local_invoice_delivery',
    );
    const lookup = sourceBetween(
      sql,
      'create function public.servsync_lookup_local_invoice_delivery',
      'alter function public.servsync_lookup_local_invoice_delivery(text) owner to postgres',
    );

    expect(renderer).toContain('limit 101');
    expect(renderer).toContain('if public_line_count > 100 then');
    expect(renderer).toContain("failure_reason := 'line_limit'");
    expect(renderer).toContain("serialized_bytes := octet_length(convert_to(serialized_payload, 'UTF8'))");
    expect(renderer).toContain('if serialized_bytes > 262144 then');
    expect(renderer).toContain("failure_reason := 'response_limit'");
    expect(createRpc).toContain("v_render.failure_reason in ('line_limit', 'response_limit')");
    expect(rotateRpc).toContain("v_render.failure_reason in ('line_limit', 'response_limit')");
    expectInOrder(rotateRpc, [
      'servsync_private_render_local_invoice_delivery',
      "revocation_reason = 'replaced'",
    ]);
    expectInOrder(lookup, [
      'servsync_private_render_local_invoice_delivery',
      'if v_render.serialized_payload is null then',
      'update public.local_invoice_delivery_links',
    ]);
    expect(lookup).toContain('when open_count < 9223372036854775807 then open_count + 1');
    expect(lookup).toContain('else 9223372036854775807');
    expect(lookup).toContain('return v_render.serialized_payload');

    expect([99, 100, 101].map(count => ({ count, allowed: count > 0 && count <= 100 }))).toEqual([
      { count: 99, allowed: true },
      { count: 100, allowed: true },
      { count: 101, allowed: false },
    ]);
    const max = 9_223_372_036_854_775_807n;
    expect([max - 1n, max].map(count => (count < max ? count + 1n : max))).toEqual([max, max]);
  });
});

test.describe('FB-003B request-free local invoice recipient UI', () => {
  const validInvoice = {
    state: 'valid',
    invoice: {
      contractor: { business_name: 'Fixture Plumbing' },
      customer: { display_name: 'Fixture Customer' },
      property: { address_line1: '100 Test Street', address_line2: '', city: 'Test City', state: 'IA', zip_code: '50000' },
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
        { title: 'Service labor', description: 'Diagnose and repair.', quantity: 1, unit: 'service', unit_price_cents: 12500 },
        { title: 'Price-required material', description: 'Contractor will confirm pricing.', quantity: 1, unit: 'each', unit_price_cents: null },
        { title: 'Included adjustment', description: 'Included at no charge.', quantity: 1, unit: 'each', unit_price_cents: 0 },
      ],
    },
  };

  const markedInvoice = (title: string, customerName: string) => ({
    ...validInvoice,
    invoice: {
      ...validInvoice.invoice,
      title,
      customer: { display_name: customerName },
    },
  });

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
      await page.route('**/api/request-free-local-invoice-delivery', route => route.fulfill({
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

  test('unmounts sensitive invoice content across public, authenticated, and token route changes', async ({ page }) => {
    const tokenA = randomBytes(32).toString('hex');
    const tokenB = randomBytes(32).toString('hex');
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text().replaceAll(tokenA, '[redacted]').replaceAll(tokenB, '[redacted]'));
    });
    page.on('requestfailed', request => failedRequests.push(request.url().replaceAll(tokenA, '[redacted]').replaceAll(tokenB, '[redacted]')));
    await page.route('**/_vercel/insights/**', route => route.fulfill({ status: 204, body: '' }));
    await page.route('**/api/request-free-local-invoice-delivery', route => {
      const body = route.request().postDataJSON() as { token?: string };
      const response = body.token === tokenA
        ? markedInvoice('Route fixture A', 'Route Customer A')
        : markedInvoice('Route fixture B', 'Route Customer B');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
    });

    await page.goto(`/#/invoice-delivery?access=${tokenA}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Route fixture A' })).toBeVisible();

    await page.evaluate(token => { window.location.hash = `#/invoice-delivery?access=${token}`; }, tokenB);
    await expect(page.getByRole('heading', { level: 1, name: 'Route fixture B' })).toBeVisible();
    await expect(page.getByText('Route Customer A')).toHaveCount(0);

    await page.evaluate(() => { window.location.hash = '#/terms'; });
    await expect(page.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeVisible();
    await expect(page.getByText('Route Customer B')).toHaveCount(0);

    await page.evaluate(() => { window.location.hash = '#/contractor'; });
    await expect(page.getByRole('heading', { level: 1, name: /Sign in|Supabase is not connected/ })).toBeVisible();
    await expect(page.getByTestId('request-free-invoice-valid')).toHaveCount(0);

    await page.evaluate(token => { window.location.hash = `#/invoice-delivery?access=${token}`; }, tokenA);
    await expect(page.getByRole('heading', { level: 1, name: 'Route fixture A' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });

  test('renders the correct invoice through browser Back and Forward navigation', async ({ page }) => {
    const tokenA = randomBytes(32).toString('hex');
    const tokenB = randomBytes(32).toString('hex');
    const consoleErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text().replaceAll(tokenA, '[redacted]').replaceAll(tokenB, '[redacted]'));
    });
    page.on('requestfailed', request => failedRequests.push(request.url().replaceAll(tokenA, '[redacted]').replaceAll(tokenB, '[redacted]')));
    await page.route('**/api/request-free-local-invoice-delivery', route => {
      const body = route.request().postDataJSON() as { token?: string };
      const response = body.token === tokenA
        ? markedInvoice('History fixture A', 'History Customer A')
        : markedInvoice('History fixture B', 'History Customer B');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
    });

    await page.goto(`/#/invoice-delivery?access=${tokenA}`);
    await expect(page.getByRole('heading', { level: 1, name: 'History fixture A' })).toBeVisible();
    await page.evaluate(token => { window.location.hash = `#/invoice-delivery?access=${token}`; }, tokenB);
    await expect(page.getByRole('heading', { level: 1, name: 'History fixture B' })).toBeVisible();

    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: 'History fixture A' })).toBeVisible();
    await expect(page.getByText('History Customer B')).toHaveCount(0);

    await page.goForward();
    await expect(page.getByRole('heading', { level: 1, name: 'History fixture B' })).toBeVisible();
    await expect(page.getByText('History Customer A')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });

  test('rejects malformed tokens before making a lookup request', async ({ page }) => {
    let lookupRequests = 0;
    page.on('request', request => {
      if (request.url().includes('/api/request-free-local-invoice-delivery')) lookupRequests += 1;
    });
    await page.goto('/#/invoice-delivery?access=not-a-token');
    await expect(page.getByTestId('request-free-invoice-invalid')).toBeVisible();
    expect(lookupRequests).toBe(0);
  });

  for (const state of ['invalid', 'expired', 'revoked', 'replaced', 'unavailable', 'rate_limited', 'error'] as const) {
    test(`renders the safe ${state} state without invoice content`, async ({ page }) => {
      const token = randomBytes(32).toString('hex');
      await page.route('**/api/request-free-local-invoice-delivery', route => route.fulfill({
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

  for (const response of [
    { status: 429, state: 'rate_limited' },
    { status: 503, state: 'error' },
  ] as const) {
    test(`maps gateway HTTP ${response.status} to a safe recipient state`, async ({ page }) => {
      const token = randomBytes(32).toString('hex');
      await page.route('**/api/request-free-local-invoice-delivery', route => route.fulfill({
        status: response.status,
        contentType: 'application/json',
        headers: response.status === 429 ? { 'Retry-After': '60' } : {},
        body: JSON.stringify({ state: response.state }),
      }));
      await page.goto(`/#/invoice-delivery?access=${token}`);
      await expect(page.getByTestId(`request-free-invoice-${response.state}`)).toBeVisible();
      await expect(page.getByText('Fixture Customer')).toHaveCount(0);
    });
  }
});

test.describe('FB-003B contractor delivery panel lifecycle', () => {
  test('keeps history and one-time links operational through real StrictMode effect replay', async ({ page }) => {
    const consoleErrors: string[] = [];
    const consoleWarnings: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
      if (message.type() === 'warning') consoleWarnings.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('requestfailed', request => failedRequests.push(new URL(request.url()).pathname));

    await page.route('**/src/main.tsx', route => route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: '',
    }));
    await page.goto('/');
    await page.evaluate(async () => {
      const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
      const React = (await dynamicImport('/node_modules/.vite/deps/react.js')).default as {
        createElement: (...args: unknown[]) => unknown;
        StrictMode: unknown;
      };
      const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as {
        createRoot: (node: HTMLElement) => { render: (node: unknown) => void; unmount: () => void };
      }).createRoot;
      const Panel = (await dynamicImport('/src/features/invoices/LocalInvoiceDeliveryPanel.tsx')).LocalInvoiceDeliveryPanel as (...args: unknown[]) => unknown;
      const deliveryUrl = (await dynamicImport('/src/appLinks.ts')).requestFreeLocalInvoiceUrl as (token: string) => string;

      document.body.innerHTML = '<main><div id="strict-delivery-root"></div></main>';
      const root = createRoot(document.getElementById('strict-delivery-root') as HTMLElement);
      const ids = {
        initialInvoice: crypto.randomUUID(),
        staleInvoice: crypto.randomUUID(),
        currentInvoice: crypto.randomUUID(),
        unmountInvoice: crypto.randomUUID(),
        contact: crypto.randomUUID(),
      };
      type PendingHistory = {
        invoiceId: string;
        settled: boolean;
        resolve: (value: unknown) => void;
      };
      const pendingHistory: PendingHistory[] = [];
      const copiedValues: string[] = [];
      const generatedUrls: string[] = [];
      let currentInvoiceId = ids.initialInvoice;
      let autoResolveHistory: unknown[] | null = null;
      let currentLink: Record<string, unknown> | null = null;

      const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, '0')).join('');
      const link = () => ({
        id: crypto.randomUUID(),
        state: 'active',
        expires_at: '2026-09-02T12:00:00.000Z',
        created_at: '2026-08-03T12:00:00.000Z',
        created_by_name: 'Fixture Owner',
        revoked_at: null,
        revoked_by_name: null,
        first_opened_at: null,
        last_opened_at: null,
        open_count: 0,
      });
      const deferredHistory = (invoiceId: string) => {
        let resolve!: (value: unknown) => void;
        const promise = new Promise(done => { resolve = done; });
        pendingHistory.push({ invoiceId, settled: false, resolve });
        return promise;
      };
      const resolveHistory = (invoiceId: string, records: unknown[]) => {
        const request = pendingHistory.find(item => !item.settled && item.invoiceId === invoiceId);
        if (!request) throw new Error('Missing pending history request.');
        request.settled = true;
        request.resolve({ data: records, error: null, status: 200 });
      };
      const issueLink = () => {
        const rawToken = token();
        const nextLink = link();
        currentLink = nextLink;
        generatedUrls.push(deliveryUrl(rawToken));
        return { data: { link: nextLink, token: rawToken }, error: null, status: 200 };
      };
      const client = {
        rpc(name: string, args: Record<string, unknown>) {
          if (name === 'servsync_list_local_invoice_delivery_links') {
            if (autoResolveHistory) {
              const records = autoResolveHistory;
              autoResolveHistory = null;
              return Promise.resolve({ data: records, error: null, status: 200 });
            }
            return deferredHistory(String(args.p_invoice_id));
          }
          if (name === 'servsync_create_local_invoice_delivery_link') return Promise.resolve(issueLink());
          if (name === 'servsync_rotate_local_invoice_delivery_link') {
            const result = issueLink();
            autoResolveHistory = currentLink ? [currentLink] : [];
            return Promise.resolve(result);
          }
          throw new Error(`Unexpected fixture RPC: ${name}`);
        },
      };
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async (value: string) => { copiedValues.push(value); } },
      });
      window.confirm = () => true;

      const render = () => root.render(React.createElement(
        React.StrictMode,
        null,
        React.createElement(Panel, {
          client,
          invoice: {
            id: currentInvoiceId,
            status: 'sent',
            line_items: [{ id: crypto.randomUUID() }],
          },
          localContact: {
            id: ids.contact,
            display_name: 'StrictMode Fixture Customer',
            homeowner_user_id: null,
            claimed_at: null,
          },
          canManage: true,
          onInvoiceChanged: async () => undefined,
        }),
      ));
      render();

      const command = (name: string) => {
        if (name === 'resolve-initial') resolveHistory(ids.initialInvoice, []);
        if (name === 'switch-stale') { currentInvoiceId = ids.staleInvoice; render(); }
        if (name === 'switch-current') { currentInvoiceId = ids.currentInvoice; render(); }
        if (name === 'resolve-current') resolveHistory(ids.currentInvoice, []);
        if (name === 'resolve-stale') resolveHistory(ids.staleInvoice, [link()]);
        if (name === 'switch-unmount') { currentInvoiceId = ids.unmountInvoice; render(); }
        if (name === 'unmount-and-resolve') {
          root.unmount();
          resolveHistory(ids.unmountInvoice, []);
        }
        if (name === 'url-is-current') {
          const input = document.querySelector<HTMLInputElement>('#local-invoice-one-time-url');
          return Boolean(input && input.value === generatedUrls.at(-1));
        }
        if (name === 'copied-current') return copiedValues.at(-1) === generatedUrls.at(-1);
        if (name === 'rotated-url-is-new') {
          return generatedUrls.length === 2 && generatedUrls[0] !== generatedUrls[1];
        }
        if (name === 'pending-stale') return pendingHistory.filter(item => !item.settled && item.invoiceId === ids.staleInvoice).length;
        if (name === 'pending-current') return pendingHistory.filter(item => !item.settled && item.invoiceId === ids.currentInvoice).length;
        if (name === 'pending-unmount') return pendingHistory.filter(item => !item.settled && item.invoiceId === ids.unmountInvoice).length;
        return null;
      };
      (window as unknown as { __strictDeliveryHarness: { command: (name: string) => unknown } }).__strictDeliveryHarness = { command };
    });

    const runHarness = <T,>(command: string) => page.evaluate<T, string>(name => (
      window as unknown as { __strictDeliveryHarness: { command: (value: string) => T } }
    ).__strictDeliveryHarness.command(name), command);

    const panelToggle = page.getByRole('button', { name: 'Secure customer link' });
    await panelToggle.click();
    await expect(page.getByText('Loading secure-link history...')).toBeVisible();
    await runHarness('resolve-initial');
    const createButton = page.getByRole('button', { name: 'Create link' });
    await expect(createButton).toBeVisible();

    await createButton.click();
    const dialog = page.getByTestId('local-invoice-one-time-link-dialog');
    const oneTimeInput = dialog.getByLabel('One-time link copy');
    await expect(dialog).toBeVisible();
    await expect(oneTimeInput).toBeFocused();
    expect(await runHarness<boolean>('url-is-current')).toBe(true);
    expect(await runHarness<boolean>('copied-current')).toBe(true);

    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Close one-time invoice link' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(oneTimeInput).toBeFocused();
    await dialog.getByRole('button', { name: 'Copied' }).click();
    expect(await runHarness<boolean>('copied-current')).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(panelToggle).toBeFocused();

    await page.getByRole('button', { name: 'Rotate link' }).click();
    await expect(dialog).toBeVisible();
    await expect(oneTimeInput).toBeFocused();
    expect(await runHarness<boolean>('url-is-current')).toBe(true);
    expect(await runHarness<boolean>('rotated-url-is-new')).toBe(true);
    await dialog.getByRole('button', { name: 'Close one-time invoice link' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(panelToggle).toBeFocused();

    await runHarness('switch-stale');
    await expect.poll(() => runHarness<number>('pending-stale')).toBe(1);
    await runHarness('switch-current');
    await expect.poll(() => runHarness<number>('pending-current')).toBe(1);
    await runHarness('resolve-current');
    await expect(createButton).toBeVisible();
    await runHarness('resolve-stale');
    await expect(createButton).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rotate link' })).toHaveCount(0);

    await runHarness('switch-unmount');
    await expect.poll(() => runHarness<number>('pending-unmount')).toBe(1);
    await runHarness('unmount-and-resolve');
    await page.waitForTimeout(50);

    expect(consoleErrors).toEqual([]);
    expect(consoleWarnings).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(failedRequests).toEqual([]);
  });
});

test.describe('FB-003B one-time link dialog focus containment', () => {
  for (const viewport of [
    { name: 'desktop', width: 1280, height: 720 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`cycles keyboard focus inside the dialog at ${viewport.name} size`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.setContent(`
        <button id="background">Background action</button>
        <section id="dialog" role="dialog" aria-modal="true" tabindex="-1">
          <button id="close">Close</button>
          <input id="link" readonly value="redacted-link" />
          <button id="copy">Copy link</button>
          <button id="disabled" disabled>Unavailable</button>
          <button id="done">Done</button>
        </section>
      `);
      await page.evaluate(handlerSource => {
        const handler = (0, eval)(`(${handlerSource})`) as typeof containDialogTabFocus;
        const dialog = document.querySelector<HTMLElement>('#dialog');
        window.addEventListener('keydown', event => handler(event, dialog));
        document.querySelector<HTMLInputElement>('#link')?.focus();
      }, containDialogTabFocus.toString());

      await expect(page.locator('#link')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('#copy')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('#done')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('#close')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('#link')).toBeFocused();
      await page.keyboard.press('Shift+Tab');
      await expect(page.locator('#close')).toBeFocused();

      await page.locator('#background').focus();
      await page.keyboard.press('Tab');
      await expect(page.locator('#close')).toBeFocused();

      await page.evaluate(() => {
        for (const id of ['close', 'link', 'done']) {
          document.querySelector<HTMLButtonElement | HTMLInputElement>(`#${id}`)!.disabled = true;
        }
        document.querySelector<HTMLButtonElement>('#background')?.focus();
      });
      await page.keyboard.press('Tab');
      await expect(page.locator('#copy')).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(page.locator('#copy')).toBeFocused();
      await expect(page.locator('#background')).not.toBeFocused();
    });
  }
});
