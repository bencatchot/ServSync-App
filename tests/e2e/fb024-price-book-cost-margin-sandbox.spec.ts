import { expect, test, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const enabled = process.env.RUN_PRICE_BOOK_COST_MARGIN_SANDBOX === '1';
const sandboxRef = 'zpzdkoaubyjtsomccxya';
const fixtureTitle = process.env.FB024_COST_MARGIN_FIXTURE_TITLE?.trim();

const roleCredentials = {
  owner: ['TEST_CONTRACTOR_EMAIL', 'TEST_CONTRACTOR_PASSWORD'],
  admin: ['TEST_CONTRACTOR_ADMIN_EMAIL', 'TEST_CONTRACTOR_ADMIN_PASSWORD'],
  office: ['TEST_CONTRACTOR_OFFICE_EMAIL', 'TEST_CONTRACTOR_OFFICE_PASSWORD'],
  field: ['TEST_CONTRACTOR_FIELD_TECH_EMAIL', 'TEST_CONTRACTOR_FIELD_TECH_PASSWORD'],
  viewer: ['TEST_CONTRACTOR_VIEWER_EMAIL', 'TEST_CONTRACTOR_VIEWER_PASSWORD'],
  disabled: ['TEST_CONTRACTOR_DISABLED_EMAIL', 'TEST_CONTRACTOR_DISABLED_PASSWORD'],
  homeowner: ['TEST_HOMEOWNER_EMAIL', 'TEST_HOMEOWNER_PASSWORD'],
  otherContractor: ['TEST_CONTRACTOR_B_EMAIL', 'TEST_CONTRACTOR_B_PASSWORD'],
} as const;

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required Sandbox validation variable ${name}.`);
  return value;
}

function sandboxConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  if (!url.includes(sandboxRef)) throw new Error(`Refusing Price Book cost validation outside Sandbox ${sandboxRef}.`);
  return { url, anonKey: requiredEnv('VITE_SUPABASE_ANON_KEY') };
}

async function clientFor(role: keyof typeof roleCredentials) {
  const [emailName, passwordName] = roleCredentials[role];
  const { url, anonKey } = sandboxConfig();
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({
    email: requiredEnv(emailName),
    password: requiredEnv(passwordName),
  });
  expect(error, `${role} Sandbox authentication`).toBeNull();
  return client;
}

async function loginOwner(page: Page) {
  await page.goto('/#/contractor');
  const main = page.getByRole('main');
  await main.getByLabel(/^Email$/i).fill(requiredEnv(roleCredentials.owner[0]));
  await main.getByLabel(/^Password$/i).fill(requiredEnv(roleCredentials.owner[1]));
  await main.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page.getByText(/Contractor command center/i)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Jobs$/ }).click();
  await page.getByRole('button', { name: /^Price Book/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Price Book' })).toBeVisible();
}

async function editFixture(page: Page, sellingPrice: string, cost: string) {
  const row = page.getByTestId('price-book-item-row').filter({ hasText: fixtureTitle! });
  await row.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Selling price').fill(sellingPrice);
  await page.getByLabel('Internal cost').fill(cost);
  await page.getByRole('button', { name: 'Save Item' }).click();
  await expect(page.getByText('Price Book item updated.')).toBeVisible();
  return page.getByTestId('price-book-item-row').filter({ hasText: fixtureTitle! });
}

async function signOut(clients: SupabaseClient[]) {
  await Promise.all(clients.map(client => client.auth.signOut().catch(() => undefined)));
}

test.describe('FB-024 Price Book cost and margin Sandbox acceptance', () => {
  test.skip(!enabled, 'Set RUN_PRICE_BOOK_COST_MARGIN_SANDBOX=1 for the approved Sandbox-only mutation probe.');

  test('persists manager-only cost states and denies private reads to unauthorized roles', async ({ page }) => {
    expect(fixtureTitle).toMatch(/^Codex FB-024 Cost Margin [A-Za-z0-9-]+$/);
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginOwner(page);

    await page.getByRole('button', { name: 'Add Item' }).first().click();
    await page.getByLabel('Item name *').fill(fixtureTitle!);
    await page.getByLabel('Selling price').fill('100');
    await page.getByLabel('Internal cost').fill('60');
    await page.getByRole('button', { name: 'Add Item' }).last().click();
    await expect(page.getByText('Price Book item created.')).toBeVisible();
    let row = page.getByTestId('price-book-item-row').filter({ hasText: fixtureTitle! });
    await expect(row).toContainText('Cost $60.00 · $40.00 profit · 40% margin');

    const clients: SupabaseClient[] = [];
    try {
      const owner = await clientFor('owner'); clients.push(owner);
      const { data: baseItem, error: itemError } = await owner.from('contractor_price_book_items')
        .select('id,default_unit_price_cents').eq('title', fixtureTitle!).single();
      expect(itemError).toBeNull();
      expect(baseItem?.default_unit_price_cents).toBe(10000);

      for (const role of ['admin', 'office'] as const) {
        const client = await clientFor(role); clients.push(client);
        const result = await client.rpc('servsync_list_price_book_internal_costs');
        expect(result.error, `${role} may read internal cost`).toBeNull();
        expect(result.data).toContainEqual({ price_book_item_id: baseItem!.id, internal_cost_cents: 6000 });
      }

      for (const role of ['field', 'viewer', 'disabled', 'homeowner'] as const) {
        const client = await clientFor(role); clients.push(client);
        const result = await client.rpc('servsync_list_price_book_internal_costs');
        expect(result.error, `${role} must be denied internal cost`).not.toBeNull();
      }

      const other = await clientFor('otherContractor'); clients.push(other);
      const otherResult = await other.rpc('servsync_list_price_book_internal_costs');
      expect(otherResult.error).toBeNull();
      expect(otherResult.data).not.toContainEqual(expect.objectContaining({ price_book_item_id: baseItem!.id }));

      const direct = await owner.from('contractor_price_book_item_costs').select('*').eq('price_book_item_id', baseItem!.id);
      expect(direct.error, 'browser direct-table cost reads must remain denied').not.toBeNull();
    } finally {
      await signOut(clients);
    }

    row = await editFixture(page, '100', '');
    await expect(row).toContainText('Cost not set');
    await page.reload();
    await expect(page.getByTestId('price-book-item-row').filter({ hasText: fixtureTitle! })).toContainText('Cost not set');

    row = await editFixture(page, '100', '0');
    await expect(row).toContainText('Cost $0.00 · $100.00 profit · 100% margin');

    row = await editFixture(page, '100', '120');
    await expect(row).toContainText('Cost $120.00 · -$20.00 profit · -20% margin');

    row = await editFixture(page, '0', '25');
    await expect(row).toContainText('Cost $25.00 · -$25.00 profit · Margin unavailable');
    expect(await page.locator('body').textContent()).not.toMatch(/Infinity|NaN/);

    row = await editFixture(page, '100', '70');
    await expect(row).toContainText('Cost $70.00 · $30.00 profit · 30% margin');
    row = await editFixture(page, '100', '');
    await expect(row).toContainText('Cost not set');

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(row).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
