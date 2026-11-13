import { expect, test, type Page } from '@playwright/test';
const postId = '40000000-0000-4000-8000-000000000001';
async function setup(page: Page, initialStatus: string | null = null) {
  const userId = '00000000-0000-4000-8000-000000000001';
  const contractorId = '10000000-0000-4000-8000-000000000001';
  const homeId = '20000000-0000-4000-8000-000000000001';
  const profile = { id: userId, role: 'homeowner', full_name: 'Fixture Homeowner', email: 'homeowner@example.test' };
  const contractor = { id: contractorId, contractor_id: contractorId, business_name: 'Bay Plumbing', slug: 'bay-plumbing', categories: ['Plumbing'], service_categories: ['Plumbing'], city: 'Fairhope', state: 'AL', zip_code: '36532', service_zip_codes: [], business_summary: '', website_url: 'https://example.com', logo_url: '', public_profile_enabled: true, account_status: 'active', external_review_links: [] };
  const home = { id: homeId, homeowner_user_id: userId, nickname: 'Fixture Home', address_line1: '123 Fixture St', address_line2: '', city: 'Fairhope', state: 'AL', zip_code: '36532', home_type: '', year_built: '', square_feet: '', notes: '', created_at: '2026-09-01T12:00:00Z' };
  const permissions = { share_home_overview: true, share_address: true, share_photos: false, share_contact: true, share_preferred_vendors: false };
  const connection = { connection_id: '30000000-0000-4000-8000-000000000001', contractor_id: contractorId, business_name: 'Bay Plumbing', contact_name: 'Pat', email: 'contractor@example.test', phone: '', logo_url: '', city: 'Fairhope', state: 'AL', status: 'active', source: 'homeowner', permissions, shared_properties: [{ ...permissions, home_id: homeId }], created_at: '2026-09-01T12:00:00Z', updated_at: '2026-09-01T12:00:00Z' };
  const writes: { name: string; body: { p_request_message?: string; p_share_contact?: boolean; p_property_permissions?: unknown[]; p_payload?: { description: string; media: unknown[] } } }[] = [];
  const state = { status: initialStatus, hasHome: true, available: true, lookupError: false, title: 'Garden faucet installation', profileAvailable: true };
  const post = { post_id: postId, contractor_id: contractorId, title: state.title, description: 'A public update only.', photos: [], created_at: '2026-09-01T12:00:00Z' };
  await page.route('**/*', async route => { const url = new URL(route.request().url()); if (url.origin === new URL(process.env.TEST_APP_URL!).origin) await route.continue(); else await route.abort(); });
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
    } else if (name === 'servsync_get_public_contractor_profile') data = state.profileAvailable ? contractor : null;
    else if (name === 'servsync_discover_feed') {
      if (state.lookupError && url.searchParams.has('post_id')) { await route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"Fixture lookup unavailable"}' }); return; }
      const match = url.searchParams.get('post_id');
      data = state.available && (!match || match === `eq.${postId}`) ? [{ ...post, title: state.title }] : [];
    }
    else if (name === 'servsync_submit_contextual_connection_request') data = { connection_id: connection.connection_id, property_count: 1 };
    else if (name === 'servsync_prepare_service_request_creation') data = { status: 'succeeded', request_id: 'request-fixture' };
    else if (name === 'profiles') data = [profile];
    else if (name === 'homeowner_profiles') data = [{ user_id: userId, display_name: 'Fixture Homeowner', phone: '', city: 'Fairhope', state: 'AL' }];
    else if (name === 'homes') data = state.hasHome ? [home] : [];
    else if (name === 'homeowner_contractor_connections') data = state.status ? [{ id: connection.connection_id, status: state.status }] : [];
    else if (name === 'contractor_profiles') data = [contractor];
    else if (name === 'servsync_get_homeowner_connections') data = state.status ? [{ ...connection, status: state.status }] : [];
    if (route.request().method() !== 'GET' && !url.pathname.includes('/auth/') && !url.pathname.includes('/rpc/')) writes.push({ name, body: route.request().postDataJSON() });
    if (/submit_contextual|prepare_service_request|commit_service_request/.test(name)) writes.push({ name, body: route.request().postDataJSON() });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.route('**/api/**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Fixture mode"}' }));
  return { state, writes, profile };
}
async function signIn(page: Page) {
  await page.getByRole('button', { name: 'Sign in to connect' }).click();
  await page.getByLabel('Email', { exact: true }).fill('homeowner@example.test');
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('main').getByRole('button', { name: 'Sign in', exact: true }).click();
}
async function selectPost(page: Page) {
  await page.getByRole('button', { name: 'Ask about similar work', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Public post reference' })).toContainText('Garden faucet installation');
}
async function connect(page: Page) {
  await page.getByRole('button', { name: 'Request connection with Bay Plumbing', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const reference = page.getByRole('dialog').getByRole('region', { name: 'Public post reference' });
  if (await reference.count()) await expect(reference).toContainText('Garden faucet installation');
}

for (const width of [1440, 390]) {
  test(`project → sign-in → explicit connection send at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const { writes } = await setup(page);
    await page.goto('/#/profile?slug=bay-plumbing');
    await selectPost(page);
    await selectPost(page); // repeated clicks replace, never duplicate context
    await page.getByRole('button', { name: 'Create homeowner account' }).click();
    await expect(page.getByLabel('Full name', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Full name', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Public post reference' }).getByRole('link')).toHaveAttribute('href', new RegExp(postId));
    await signIn(page);
    await connect(page);
    expect(writes).toEqual([]);
    await page.getByRole('textbox', { name: 'Optional message', exact: true }).fill('Please help with our garden faucet.');
    await page.getByLabel('Share my contact info with this contractor').check();
    await page.getByRole('button', { name: 'Send connection request', exact: true }).click();
    await expect(page.getByText('Connection request sent', { exact: true })).toBeVisible();
    expect(writes).toHaveLength(1);
    expect(writes[0].name).toBe('servsync_submit_contextual_connection_request');
    expect(writes[0].body.p_request_message).toBe(`Please help with our garden faucet.\n\nPublic post referenced by homeowner: Garden faucet installation\n#/profile?slug=bay-plumbing&post=${postId}`);
    expect(writes[0].body.p_share_contact).toBe(true);
    expect(writes[0].body.p_property_permissions).toEqual([{ home_id: '20000000-0000-4000-8000-000000000001', share_home_overview: true, share_address: false, share_preferred_vendors: false, share_photos: false }]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/servsync-inquiry-connection-${width}.png`, fullPage: true });
  });
  test(`project → sign-in → existing service composer at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const { writes } = await setup(page, 'active');
    await page.goto('/#/profile?slug=bay-plumbing');
    await selectPost(page);
    await signIn(page);
    await page.getByRole('button', { name: 'Request service', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Request service from Bay Plumbing' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Public post reference' })).toBeFocused();
    await expect(page.getByRole('region', { name: 'Public post reference' })).toBeInViewport();
    await expect(page.getByRole('region', { name: 'Public post reference' }).getByRole('link')).toHaveAttribute('href', new RegExp(postId));
    expect(writes).toEqual([]);
    await page.getByLabel('Short title', { exact: true }).fill('Similar faucet work');
    await page.getByLabel('What do you need help with?', { exact: true }).fill('Our faucet needs replacing.');
    await page.screenshot({ path: `/tmp/servsync-inquiry-service-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Send request', exact: true }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].name).toBe('servsync_prepare_service_request_creation');
    expect(writes[0].body.p_payload!.description).toContain(`Our faucet needs replacing.\n\nPublic post referenced by homeowner: Garden faucet installation`);
    expect(writes[0].body.p_payload!.description).toContain(postId);
    expect(writes[0].body.p_payload!.media).toEqual([]);
  });
}

test('property setup return preserves exact post without sending', async ({ page }) => {
  const { writes, state } = await setup(page);
  state.hasHome = false;
  await page.goto(`/#/profile?slug=bay-plumbing&post=${postId}&intent=connect`);
  await signIn(page);
  await page.getByRole('button', { name: 'Set up my property' }).click();
  await expect(page.getByRole('link', { name: 'Return to contractor profile' })).toHaveAttribute('href', `#/profile?slug=bay-plumbing&intent=connect&post=${postId}`);
  // The property fixture becomes available; no shared property is created.
  state.hasHome = true;
  await page.getByRole('link', { name: 'Return to contractor profile' }).click();
  await connect(page);
  await expect(page.getByRole('region', { name: 'Public post reference' }).getByRole('link')).toHaveAttribute('href', new RegExp(postId));
  await expect(page.getByText('Fixture Home', { exact: true }).first()).toBeVisible();
  expect(writes).toEqual([]);
});

test('pending relationship does not resend or silently alter existing request', async ({ page }) => {
  const { writes } = await setup(page, 'pending');
  await page.goto(`/#/profile?slug=bay-plumbing&post=${postId}&intent=connect`);
  await signIn(page);
  await expect(page.getByText('This post has not been added', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request service', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Request connection with Bay Plumbing' })).toHaveCount(0);
  expect(writes).toEqual([]);
});

for (const failure of ['deleted', 'hidden', 'changed', 'lookup-error'] as const) {
  test(`${failure} post blocks connection submission and preserves form and consent`, async ({ page }) => {
    const { writes, state } = await setup(page);
    await page.goto(`/#/profile?slug=bay-plumbing&post=${postId}&intent=connect`);
    await signIn(page);
    await connect(page);
    await page.getByRole('textbox', { name: 'Optional message', exact: true }).fill('Keep my original wording.');
    await page.getByLabel('Share my contact info with this contractor').check();
    if (failure === 'deleted') state.available = false;
    if (failure === 'hidden') state.profileAvailable = false;
    if (failure === 'changed') state.title = 'A different project now';
    if (failure === 'lookup-error') state.lookupError = true;
    await page.getByRole('button', { name: 'Send connection request', exact: true }).click();
    await expect(page.getByRole('dialog').getByText(/no longer available|post changed|could not be checked/)).toBeVisible();
    expect(writes).toEqual([]);
    await page.getByRole('button', { name: 'Remove post reference' }).click();
    await expect(page.getByRole('textbox', { name: 'Optional message', exact: true })).toHaveValue('Keep my original wording.');
    await expect(page.getByLabel('Share my contact info with this contractor')).toBeChecked();
    await page.getByRole('button', { name: 'Send connection request', exact: true }).click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].body.p_request_message).toBe('Keep my original wording.');
  });
}

test('cancel removes continuation; malformed and spoofed post cannot be sent', async ({ page }) => {
  const { writes } = await setup(page);
  await page.goto(`/#/profile?slug=bay-plumbing&post=${postId}&intent=connect`);
  await signIn(page);
  await connect(page);
  await page.getByRole('button', { name: 'Close connection request', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).not.toHaveURL(/post=/);
  await connect(page);
  await expect(page.getByRole('region', { name: 'Public post reference' })).toHaveCount(0);
  for (const invalid of ['fake', '40000000-0000-4000-8000-000000000099']) {
    await page.goto(`/#/profile?slug=bay-plumbing&post=${invalid}`);
    await expect(page.getByRole('region', { name: 'Public post reference' })).toContainText('no longer available');
    await expect(page.getByRole('button', { name: 'Request connection with Bay Plumbing' })).toBeDisabled();
  }
  expect(writes).toEqual([]);
});

test('service reference stays visible on Dashboard and clears when contractor selection changes', async ({ page }) => {
  const { writes } = await setup(page, 'active');
  await page.goto(`/#/profile?slug=bay-plumbing&post=${postId}&intent=connect`);
  await signIn(page);
  await page.getByRole('button', { name: 'Request service', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Request service from Bay Plumbing' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Short title', exact: true }).fill('Keep title');
  await page.getByRole('textbox', { name: 'What do you need help with?', exact: true }).fill('Keep original service text.');
  await page.getByRole('button', { name: 'Dashboard', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Public post reference' }).getByRole('link')).toHaveAttribute('href', new RegExp(postId));
  await page.getByRole('combobox', { name: 'Connected contractor', exact: true }).selectOption('');
  await page.getByRole('combobox', { name: 'Connected contractor', exact: true }).selectOption('30000000-0000-4000-8000-000000000001');
  await expect(page.getByRole('region', { name: 'Public post reference' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Short title', exact: true })).toHaveValue('Keep title');
  await expect(page.getByRole('textbox', { name: 'What do you need help with?', exact: true })).toHaveValue('Keep original service text.');
  expect(writes).toEqual([]);
});

test('service revalidation blocks stale post, removal preserves draft, cancel clears context', async ({ page }) => {
  const { writes, state } = await setup(page, 'active');
  await page.goto(`/#/profile?slug=bay-plumbing&post=${postId}&intent=connect`);
  await signIn(page);
  await page.getByRole('button', { name: 'Request service', exact: true }).click();
  await page.getByRole('textbox', { name: 'Short title', exact: true }).fill('Keep title');
  await page.getByRole('textbox', { name: 'What do you need help with?', exact: true }).fill('Keep original service text.');
  state.available = false;
  await page.getByRole('button', { name: 'Send request', exact: true }).click();
  await expect(page.getByText('no longer available for this contractor', { exact: false })).toBeVisible();
  expect(writes).toEqual([]);
  await page.getByRole('button', { name: 'Remove post reference' }).click();
  await expect(page.getByRole('textbox', { name: 'Short title', exact: true })).toHaveValue('Keep title');
  await expect(page.getByRole('textbox', { name: 'What do you need help with?', exact: true })).toHaveValue('Keep original service text.');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Request service from Bay Plumbing' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Public post reference' })).toHaveCount(0);
  expect(writes).toEqual([]);
});
