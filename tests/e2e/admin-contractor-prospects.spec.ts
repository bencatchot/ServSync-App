import { expect, test, type Page } from '@playwright/test';

const details = {
  business_name: 'Fairhope Plumbing', contact_name: 'Pat Example', email: 'owner@example.test', phone: '555-0101',
  website_url: 'https://example.test', logo_url: '', city: 'Fairhope', state: 'AL', zip_code: '36532',
  business_summary: 'Plumbing repairs and maintenance.', service_categories: ['Plumbing'], service_zip_codes: ['36532'],
};
const row = { id: '10000000-0000-4000-8000-000000000001', slug: 'fairhope-plumbing', details, published: true, revision: 1, invited_email: null, expires_at: null, claimed_at: null, status: 'draft' };

async function mount(page: Page, component: string, mode = 'normal') {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Find local contractors. Keep the work organized.' }).waitFor();
  await page.evaluate(async ({ component, mode, initial }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const React = (await dynamicImport('/node_modules/.vite/deps/react.js')).default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as { createRoot: (element: HTMLElement) => { render: (node: unknown) => void } }).createRoot;
    const clientModule = await dynamicImport('/src/supabaseClient.ts');
    const client = clientModule.supabase as { rpc: (name: string, args?: Record<string, unknown>) => Promise<unknown> };
    let item = { ...structuredClone(initial), ...(mode === 'claimed' ? { claim_status: 'claimed' } : {}) } as Record<string, unknown>;
    let exists = component !== 'AdminContractorProspects';
    const calls: Array<{ name: string; args?: Record<string, unknown> }> = [];
    Object.assign(window, { prospectCalls: calls });
    client.rpc = async (name, args = {}) => {
      calls.push({ name, args });
      if (mode === 'missing') return { data: null, error: { code: 'PGRST202', message: 'Missing function' } };
      if (mode === 'wrong-email') return { data: null, error: { message: 'Sign in with the verified contractor account invited by ServSync.' } };
      if (name === 'servsync_admin_contractor_prospects') return { data: exists ? [item] : [], error: null };
      if (name === 'servsync_admin_save_contractor_prospect') {
        item = { ...item, details: args.p_details, slug: args.p_slug, published: args.p_published, revision: exists ? Number(item.revision) + 1 : 1 }; exists = true;
        return { data: item, error: null };
      }
      if (name === 'servsync_admin_issue_contractor_claim') {
        item = { ...item, revision: Number(item.revision) + 1, invited_email: args.p_email, status: 'pending', expires_at: '2026-09-23T12:00:00Z' };
        return { data: { token: 'a'.repeat(64), profile: item }, error: null };
      }
      if (name === 'servsync_admin_revoke_contractor_claim') {
        item = { ...item, revision: Number(item.revision) + 1, status: 'revoked', expires_at: null };
        return { data: item, error: null };
      }
      if (name === 'servsync_public_contractor_prospects') return { data: args.p_search === 'Roofing' ? [] : [item], error: null };
      if (name === 'servsync_review_contractor_claim') return { data: item, error: null };
      if (name === 'servsync_accept_contractor_claim') return { data: { contractor_id: item.id, slug: item.slug }, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    };
    const moduleName = component.includes('Prospect') && !component.startsWith('Admin') ? 'PublicContractorProspects' : component;
    const module = await dynamicImport(`/src/features/contractor-prospects/${moduleName}.tsx`);
    const props = component === 'ContractorClaimPage' ? {
      token: 'a'.repeat(64), profile: mode === 'anonymous' ? null : { id: '20000000-0000-4000-8000-000000000001', role: 'contractor' },
      authentication: React.createElement('p', {}, 'Authentication form'), onClaimed: () => { document.body.setAttribute('data-claimed', 'true'); },
    } : component === 'PublicContractorProspect' ? { slug: initial.slug } : {};
    document.body.innerHTML = '<main class="mx-auto max-w-5xl bg-slate-50 p-4"><div id="prospect-root"></div></main>';
    createRoot(document.getElementById('prospect-root')!).render(React.createElement(module[component], props));
  }, { component, mode, initial: row });
}

for (const width of [1440, 390]) {
  test(`public profile and Discover are view-only at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await mount(page, 'PublicContractorProspect');
    await expect(page.getByText('Unclaimed profile', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request connection' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Request service' })).toBeDisabled();
    await expect(page.getByText('owner@example.test')).toHaveCount(0);
    await expect(page.locator('a[href^="mailto:"],a[href^="tel:"],a[href="https://example.test"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/servsync-unclaimed-profile-${width}.png`, fullPage: true });
    await mount(page, 'DiscoverContractorProspects');
    await expect(page.getByRole('link', { name: 'View profile' })).toHaveAttribute('href', /#\/profile\?slug=fairhope-plumbing$/);
    await expect(page.getByRole('button', { name: 'Request service' })).toBeDisabled();
    await page.getByRole('textbox', { name: 'Search business profiles' }).fill('Roofing');
    await page.getByRole('button', { name: 'Search businesses' }).click();
    await expect(page.getByText('No matching business profiles.')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('admin can publish, issue, edit safely, rotate and revoke a private claim link', async ({ page }) => {
  await mount(page, 'AdminContractorProspects');
  await page.getByRole('button', { name: 'Create prospect profile' }).click();
  await page.getByRole('textbox', { name: 'Profile address' }).fill('fairhope-plumbing');
  await page.getByRole('textbox', { name: 'Business name', exact: true }).fill('Fairhope Plumbing');
  await page.getByRole('textbox', { name: 'Business email', exact: true }).fill('owner@example.test');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Profile saved');
  await page.getByRole('textbox', { name: 'Claim recipient email' }).fill('owner@example.test');
  await page.getByRole('button', { name: 'Create new claim link' }).click();
  await expect(page.getByRole('textbox', { name: 'Private claim link' })).toHaveValue(/#\/contractor\?claim_business=a{64}$/);
  await page.getByRole('textbox', { name: 'Business name', exact: true }).fill('Edited Plumbing');
  await expect(page.getByRole('button', { name: 'Create new claim link' })).toBeDisabled();
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Private claim link' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Create new claim link' }).click();
  await page.getByRole('button', { name: 'Revoke claim link' }).click();
  await expect(page.getByRole('status')).toHaveText('Claim link revoked.');
  await expect(page.getByRole('textbox', { name: 'Private claim link' })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/servsync-prospect-admin-390.png', fullPage: true });
});

test('verified recipient reviews corrections and explicitly claims once', async ({ page }) => {
  await mount(page, 'ContractorClaimPage');
  await expect(page.getByRole('button', { name: 'Claim business profile' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Business name', exact: true }).fill('Owner Reviewed Plumbing');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Claim business profile' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-claimed', 'true');
  const claims = await page.evaluate(() => (window as unknown as { prospectCalls: Array<{ name: string; args: Record<string, unknown> }> }).prospectCalls.filter(call => call.name === 'servsync_accept_contractor_claim'));
  expect(claims).toHaveLength(1);
  expect(claims[0].args.p_details).toMatchObject({ business_name: 'Owner Reviewed Plumbing' });
  expect(page.url()).not.toContain('claim_business');
});

test('wrong recipient cannot open claim form; anonymous visitors are directed to authentication', async ({ page }) => {
  await mount(page, 'ContractorClaimPage', 'wrong-email');
  await expect(page.getByRole('alert')).toContainText('verified contractor account');
  await expect(page.getByRole('button', { name: 'Claim business profile' })).toHaveCount(0);
  await mount(page, 'ContractorClaimPage', 'anonymous');
  await expect(page.getByText('Authentication form')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Business email', exact: true })).toHaveCount(0);
});

test('source-before-backend state disables admin creation and preserves Discover availability', async ({ page }) => {
  await mount(page, 'AdminContractorProspects', 'missing');
  await expect(page.getByRole('alert')).toContainText('awaiting backend installation');
  await expect(page.getByRole('button', { name: 'Create prospect profile' })).toBeDisabled();
  await mount(page, 'DiscoverContractorProspects', 'missing');
  await expect(page.getByRole('region', { name: 'Business profiles' })).toHaveCount(0);
});

test('anonymous public route renders unclaimed listing without sign-in or contact controls', async ({ page }) => {
  await page.route('http://127.0.0.1:55499/**', route => {
    const name = route.request().url().split('/').pop();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(name === 'servsync_public_contractor_prospects' ? [row] : null) });
  });
  await page.goto('/#/profile?slug=fairhope-plumbing');
  await expect(page.getByText('Unclaimed profile', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request connection' })).toBeDisabled();
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveCount(0);
});

test('claimed businesses retain Discover entry and open the normal public profile', async ({ page }) => {
  await mount(page, 'DiscoverContractorProspects', 'claimed');
  await expect(page.getByRole('heading', { name: 'Fairhope Plumbing' })).toBeVisible();
  await expect(page.getByText('Unclaimed profile', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Request service' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'View profile' })).toHaveAttribute('href', /#\/profile\?slug=fairhope-plumbing$/);
});

test('claim entry explains pending installation without exposing backend errors', async ({ page }) => {
  await mount(page, 'ContractorClaimPage', 'missing');
  await expect(page.getByRole('alert')).toContainText('Business profile claiming is not available yet.');
  await expect(page.getByRole('button', { name: 'Claim business profile' })).toHaveCount(0);
  await expect(page.getByText('Missing function')).toHaveCount(0);
});
