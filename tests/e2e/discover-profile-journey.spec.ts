import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
test(`shared profile → sign-in → canonical service composer at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 1000 });
  const userId = '00000000-0000-4000-8000-000000000001';
  const contractorId = '10000000-0000-4000-8000-000000000001';
  const homeId = '20000000-0000-4000-8000-000000000001';
  const profile = { id: userId, role: 'homeowner', full_name: 'Fixture Homeowner', email: 'homeowner@example.test' };
  const contractor = { id: contractorId, contractor_id: contractorId, business_name: 'Bay Plumbing', slug: 'bay-plumbing', categories: ['Plumbing'], service_categories: ['Plumbing'], city: 'Fairhope', state: 'AL', zip_code: '36532', service_zip_codes: [], business_summary: '', website_url: 'https://example.com', logo_url: '', public_profile_enabled: true, account_status: 'active', external_review_links: [] };
  const home = { id: homeId, homeowner_user_id: userId, nickname: 'Fixture Home', address_line1: '123 Fixture St', address_line2: '', city: 'Fairhope', state: 'AL', zip_code: '36532', home_type: '', year_built: '', square_feet: '', notes: '', created_at: '2026-09-01T12:00:00Z' };
  const permissions = { share_home_overview: true, share_address: true, share_photos: false, share_contact: true, share_preferred_vendors: false };
  const connection = { connection_id: '30000000-0000-4000-8000-000000000001', contractor_id: contractorId, business_name: 'Bay Plumbing', contact_name: 'Pat', email: 'contractor@example.test', phone: '', logo_url: '', city: 'Fairhope', state: 'AL', status: 'active', source: 'homeowner', permissions, shared_properties: [{ ...permissions, home_id: homeId }], created_at: '2026-09-01T12:00:00Z', updated_at: '2026-09-01T12:00:00Z' };
  const writes: string[] = [];
  page.on('pageerror', error => { throw error; });
  // Intercept every backend request before navigation: safe on a hosted Preview too.
  await page.route(/https:\/\/(?:discover-fixture\.invalid|[^/]+\.supabase\.co)\//, async route => {
    const url = new URL(route.request().url());
    const name = url.pathname.split('/').pop() || '';
    let data: unknown = [];
    if (url.pathname.includes('/auth/v1/token')) {
      const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: profile.email, email_confirmed_at: '2026-09-01T12:00:00Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { role: 'homeowner' }, created_at: '2026-09-01T12:00:00Z' };
      const claims = Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
      data = { access_token: `eyJhbGciOiJIUzI1NiJ9.${claims}.fixture`, refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, user };
    } else if (name === 'servsync_get_public_contractor_profile') data = contractor;
    else if (name === 'profiles') data = [profile];
    else if (name === 'homeowner_profiles') data = [{ user_id: userId, display_name: 'Fixture Homeowner', phone: '', city: 'Fairhope', state: 'AL' }];
    else if (name === 'homes') data = [home];
    else if (name === 'homeowner_contractor_connections') data = [{ id: connection.connection_id, status: 'active' }];
    else if (name === 'contractor_profiles') data = [contractor];
    else if (name === 'servsync_get_homeowner_connections') data = [connection];
    if (route.request().method() !== 'GET' && !url.pathname.includes('/auth/') && !url.pathname.includes('/rpc/')) writes.push(name);
    if (/submit_contextual|create_service_request/.test(name)) writes.push(name);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Fixture mode"}' }));
  await page.goto('/#/profile?slug=bay-plumbing');
  await page.getByRole('button', { name: 'Create homeowner account' }).click();
  await expect(page.getByLabel('Full name', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Full name', { exact: true })).toBeVisible();
  await page.screenshot({ path: `/tmp/servsync-profile-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Sign in to connect' }).click();
  await page.getByLabel('Email', { exact: true }).fill(profile.email);
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('main').getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Request service', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Request service from Bay Plumbing', exact: true })).toBeVisible();
  await expect(page.getByText('Selected property: Fixture Home', { exact: false })).toBeVisible();
  expect(writes).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/servsync-profile-request-${width}.png`, fullPage: true });
});

}
