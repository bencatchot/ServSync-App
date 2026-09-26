/**
 * Real ServSync UI screenshots with fictional, browser-local response fixtures.
 * Never connects to an external backend; no credentials or shared records used.
 * Run against a local Vite app with its usual public Supabase client configured:
 * node scripts/marketing/capture-landing-product.mjs http://127.0.0.1:4178
 * PNG masters/evidence go to /tmp/servsync-landing-capture. Requires cwebp
 * on PATH for loss-aware WebP compression; no visual reconstruction.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const appUrl = process.argv[2] || 'http://127.0.0.1:4178';
if (!['127.0.0.1', 'localhost'].includes(new URL(appUrl).hostname))
  throw new Error('Capture is restricted to localhost.');
const output = '/tmp/servsync-landing-capture';
const assets = new URL('../../public/landing/', import.meta.url).pathname;
await mkdir(output, { recursive: true });
const stamp = '2026-09-22T15:00:00Z';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = id(1),
  homeowner = id(2),
  contractorId = id(3),
  homeId = id(4),
  estimateId = id(5),
  reportId = id(6);
const contractor = {
  id: contractorId,
  owner_user_id: owner,
  business_name: 'Harbor Home Services',
  slug: 'sample-harbor-home-services',
  contact_name: 'Alex Morgan',
  email: 'alex@example.test',
  phone: '',
  website_url: '',
  logo_url: '',
  city: 'Fairhope',
  state: 'AL',
  zip_code: '36532',
  service_categories: ['Plumbing'],
  service_zip_codes: [],
  license_number: '',
  insurance_status: '',
  bonded_status: '',
  business_summary: '',
  external_review_links: [],
  public_profile_enabled: true,
  account_status: 'active',
  subscription_status: 'free',
  monthly_price_cents: 0,
  subscription_notes: '',
  admin_notes: '',
  permanent_invite_code: null,
  created_at: stamp,
  updated_at: stamp,
};
const home = {
  id: homeId,
  homeowner_user_id: homeowner,
  nickname: 'Bay House',
  address_line1: '100 Sample Lane',
  address_line2: '',
  city: 'Fairhope',
  state: 'AL',
  zip_code: '36532',
  home_type: 'Single-family home',
  year_built: '2008',
  square_feet: '2100',
  notes: '',
  created_at: stamp,
  updated_at: stamp,
};
const permissions = {
  share_home_overview: true,
  share_address: true,
  share_contact: true,
  share_photos: false,
  share_preferred_vendors: false,
};
const connection = {
  connection_id: id(7),
  homeowner_user_id: homeowner,
  display_name: 'Jamie Parker',
  phone: '',
  city: 'Fairhope',
  state: 'AL',
  zip_code: '36532',
  status: 'active',
  source: 'homeowner',
  permissions,
  home,
  homes: [home],
  created_at: stamp,
  updated_at: stamp,
};
const estimate = {
  id: estimateId,
  contractor_id: contractorId,
  homeowner_user_id: homeowner,
  local_contact_id: null,
  service_request_id: null,
  inspection_id: null,
  home_id: homeId,
  local_home_id: null,
  title: 'Water heater replacement',
  scope:
    'Replace the aging water heater with a new 50-gallon unit. Includes installation, connection checks, and removal of the old unit.',
  notes: 'Protect the utility room floor and leave the work area clean.',
  terms: 'Estimate valid for 30 days.',
  status: 'accepted',
  subtotal_cents: 185000,
  total_cents: 185000,
  labor_mode: 'line_specific',
  tax_rate_percent: 0,
  tax_cents: 0,
  created_at: stamp,
  updated_at: stamp,
  line_items: [
    {
      id: id(11),
      estimate_id: estimateId,
      line_type: 'material',
      line_title: '50-gallon water heater',
      description: '50-gallon water heater',
      customer_description: 'New unit, fittings, and connection materials',
      quantity: 1,
      unit: 'each',
      unit_price_cents: 115000,
      sort_order: 0,
      created_at: stamp,
      updated_at: stamp,
    },
    {
      id: id(12),
      estimate_id: estimateId,
      line_type: 'labor',
      line_title: 'Installation and system checks',
      description: 'Installation and system checks',
      customer_description: 'Install, test connections, and confirm operation',
      quantity: 1,
      unit: 'job',
      unit_price_cents: 60000,
      sort_order: 1,
      created_at: stamp,
      updated_at: stamp,
    },
    {
      id: id(13),
      estimate_id: estimateId,
      line_type: 'fee',
      line_title: 'Removal and disposal',
      description: 'Removal and disposal',
      customer_description: 'Remove and responsibly dispose of the old unit',
      quantity: 1,
      unit: 'each',
      unit_price_cents: 10000,
      sort_order: 2,
      created_at: stamp,
      updated_at: stamp,
    },
  ],
  payment_schedule_items: [
    {
      id: id(14),
      estimate_id: estimateId,
      invoice_type: 'deposit',
      label: 'Deposit',
      amount_type: 'percentage',
      amount_value: 25,
      calculated_amount_cents: 46250,
      due_trigger: 'Due upon approval',
      sort_order: 0,
      created_at: stamp,
      updated_at: stamp,
    },
    {
      id: id(15),
      estimate_id: estimateId,
      invoice_type: 'final',
      label: 'Final payment',
      amount_type: 'percentage',
      amount_value: 75,
      calculated_amount_cents: 138750,
      due_trigger: 'Due upon completion',
      sort_order: 1,
      created_at: stamp,
      updated_at: stamp,
    },
  ],
};
const history = {
  id: id(8),
  homeowner_user_id: homeowner,
  home_id: homeId,
  service_request_id: null,
  estimate_id: null,
  invoice_id: null,
  inspection_id: id(9),
  report_document_id: reportId,
  invoice_document_id: null,
  category: 'Plumbing',
  title: 'Water heater replacement',
  description:
    'Installed a new 50-gallon water heater. Connections and operation checked, old unit removed, and work area cleaned.',
  performed_at: stamp,
  contractor_name: contractor.business_name,
  cost_cents: null,
  notes: 'Service report and installation details saved with this home.',
  created_at: stamp,
  updated_at: stamp,
};
const document = {
  id: reportId,
  homeowner_user_id: homeowner,
  home_id: homeId,
  home_room_id: null,
  storage_path: 'fictional-sample/report.pdf',
  file_name: 'Water-heater-service-report.pdf',
  content_type: 'application/pdf',
  file_size_bytes: 54000,
  document_type: 'report',
  upload_source: 'job_report',
  notes: '',
  created_at: stamp,
};
const audit = [];
const browser = await chromium.launch({ headless: true });
for (const role of ['contractor', 'homeowner']) {
  const userId = role === 'contractor' ? owner : homeowner;
  const profile = {
    id: userId,
    role,
    full_name: role === 'contractor' ? 'Alex Morgan' : 'Jamie Parker',
    email: role + '@example.test',
    created_at: stamp,
    updated_at: stamp,
  };
  const user = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email: profile.email,
    email_confirmed_at: stamp,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: { role, full_name: profile.full_name },
    created_at: stamp,
  };
  const height = role === 'homeowner' ? 900 : 1240;
  const context = await browser.newContext({
    viewport: { width: 1440, height },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  const blocked = [];
  const calls = [];
  const errors = [];
  await context.routeWebSocket('**/*', (socket) => socket.close());
  await context.route('**/*', async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (
      url.origin === new URL(appUrl).origin &&
      !url.pathname.startsWith('/api/') &&
      ['GET', 'HEAD'].includes(request.method())
    )
      return route.continue();
    const name = url.pathname.split('/').pop();
    calls.push(name);
    if (
      !url.pathname.includes('/rest/v1/') &&
      !url.pathname.includes('/auth/v1/')
    ) {
      blocked.push(url.pathname);
      return route.abort();
    }
    const readRpc =
      /^(current_user_can_|servsync_(get_|list_|current_|contractor_(connected_homeowners|service_requests|pending_connection_requests|team)$|homeowner_service_requests$|find_help$))/;
    if (url.pathname.includes('/rpc/') && !readRpc.test(name))
      throw new Error('Unexpected RPC blocked: ' + name);
    let data = [];
    if (url.pathname.includes('/auth/v1/token')) {
      const claims = Buffer.from(
        JSON.stringify({
          sub: userId,
          aud: 'authenticated',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString('base64url');
      data = {
        access_token: `eyJhbGciOiJIUzI1NiJ9.${claims}.fictional`,
        refresh_token: 'fictional-refresh',
        token_type: 'bearer',
        expires_in: 3600,
        user,
      };
    } else if (name === 'user') data = user;
    else if (name === 'profiles') data = [profile];
    else if (name === 'contractor_profiles') data = [contractor];
    else if (name === 'homeowner_profiles')
      data = [
        {
          user_id: homeowner,
          display_name: 'Jamie Parker',
          phone: '',
          city: 'Fairhope',
          state: 'AL',
          zip_code: '36532',
        },
      ];
    else if (name === 'homes') data = [home];
    else if (name === 'estimates') data = [estimate];
    else if (name === 'home_maintenance_log') data = [history];
    else if (name === 'home_documents') data = [document];
    else if (name === 'servsync_contractor_connected_homeowners')
      data = [connection];
    else if (name === 'servsync_get_homeowner_connections')
      data = [
        {
          ...connection,
          contractor_id: contractorId,
          business_name: contractor.business_name,
          contact_name: contractor.contact_name,
          email: '',
          logo_url: '',
          shared_properties: [{ ...permissions, home_id: homeId }],
        },
      ];
    else if (name === 'servsync_current_contractor_profile') data = contractor;
    else if (name === 'servsync_contractor_team')
      data = {
        contractor_id: contractorId,
        can_manage: true,
        included_seats: 3,
        active_seat_count: 1,
        extra_seat_count: 0,
        members: [],
        invites: [],
      };
    else if (name.startsWith('current_user_can_')) data = true;
    else if (name === 'servsync_current_contractor_entitlements')
      data = {
        contractor_id: contractorId,
        billing_status: 'free',
        current_plan: 'beta',
        access_mode: 'full',
        can_use_workspace: true,
        can_create_estimates: true,
        can_send_estimates: true,
        can_create_jobs: true,
        can_create_invoices: true,
        can_send_invoices: true,
      };
    if (
      request.method() !== 'GET' &&
      !url.pathname.includes('/auth/') &&
      !url.pathname.includes('/rpc/')
    )
      throw new Error('Unexpected capture write blocked: ' + name);
    if (
      request.headers().accept?.includes('vnd.pgrst.object') &&
      Array.isArray(data)
    )
      data = data[0] ?? null;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${appUrl}/#/${role}`, { waitUntil: 'networkidle' });
  await page.getByLabel('Email', { exact: true }).fill(profile.email);
  await page
    .getByLabel('Password', { exact: true })
    .fill('fictional-local-only');
  await page
    .getByRole('main')
    .getByRole('button', { name: 'Sign in', exact: true })
    .click();
  await page.getByRole('button', { name: 'Dashboard', exact: true }).waitFor();
  if (role === 'contractor') {
    await page.getByRole('button', { name: 'Work', exact: true }).click();
    await page
      .getByText(/open estimates/i)
      .first()
      .click();
  } else
    await page
      .getByRole('button', { name: 'Home History', exact: true })
      .click();
  await page
    .getByText('Water heater replacement', { exact: true })
    .first()
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  const stem =
    role === 'contractor' ? 'contractor-estimate' : 'homeowner-history';
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${output}/${stem}.png` });
  const card = page.getByTestId(
    role === 'contractor'
      ? 'contractor-estimate-card'
      : 'home-history-entry-card',
  );
  // Capture the same real responsive record at phone width. No CSS or DOM edits.
  await page.setViewportSize({ width: 390, height: 1600 });
  await card.scrollIntoViewIfNeeded();
  const detail = card;
  if (role === 'contractor') {
    await card.screenshot({ path: `${output}/${stem}-mobile.png` });
    // The card teaser is a literal browser crop: accepted estimate, scope, and
    // next step. The complete schedule remains visible in the full-size image.
    await card.evaluate((el) => el.scrollIntoView({ block: 'start' }));
    const box = await card.boundingBox();
    const schedule = await page
      .getByTestId('contractor-estimate-payment-schedule-section')
      .boundingBox();
    await page.screenshot({
      path: `${output}/${stem}-detail.png`,
      clip: {
        x: box.x,
        y: box.y,
        width: box.width,
        height: schedule.y - box.y - 5,
      },
    });
  } else await detail.screenshot({ path: `${output}/${stem}-detail.png` });
  const suffixes =
    role === 'contractor' ? ['', '-detail', '-mobile'] : ['', '-detail'];
  for (const suffix of suffixes) {
    await run('cwebp', [
      '-quiet',
      '-q',
      '90',
      '-m',
      '6',
      '-metadata',
      'none',
      `${output}/${stem}${suffix}.png`,
      '-o',
      `${assets}${stem}${suffix}.webp`,
    ]);
  }
  console.log(
    `Captured ${stem}: desktop 2880x${height * 2}; native mobile record and teaser crops at 2x.`,
  );
  if (errors.length)
    throw new Error('App errors during capture: ' + errors.join('; '));
  audit.push({
    role,
    calls: [...new Set(calls)],
    blocked: [...new Set(blocked)],
    errors,
  });
  await context.close();
}
await writeFile(
  `${output}/capture-evidence.json`,
  JSON.stringify(audit, null, 2),
);
await browser.close();
