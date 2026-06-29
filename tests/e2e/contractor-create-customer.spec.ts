import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { captureMajorConsoleErrors } from './helpers/console';
import { credentialsFor } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
type CredentialKey = Parameters<typeof credentialsFor>[0];

function sandboxSupabaseConfig() {
  const url = process.env.VITE_SUPABASE_URL?.trim();
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`Local customer multi-property tests require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
  }
  return { url, anonKey };
}

async function signInAs(key: CredentialKey): Promise<SupabaseClient | null> {
  const config = sandboxSupabaseConfig();
  if (!config) return null;
  const { url, anonKey } = config;
  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { error } = await client.auth.signInWithPassword(credentialsFor(key));
  expect(error, `${key} login should succeed`).toBeNull();
  return client;
}

function timestampForRecord() {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 14);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe('contractor mutating customer creation', () => {
  test('creates a clearly named local E2E customer', async ({ page }, testInfo) => {
    requireApprovedSandboxForMutation();

    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');
    const timestamp = timestampForRecord();
    const customerName = `E2E Test Customer ${timestamp}`;
    const customerEmail = `e2e-customer-${timestamp}@example.com`;

    await loginAs(page, 'contractor');
    await openSidebarTab(page, /Homeowners/i);
    await expectActiveTabHeading(page, /^Homeowners$/i);

    await main.getByRole('button', { name: /^Add$/i }).click();
    await expect(main.getByRole('heading', { name: /^Add new customer$/i })).toBeVisible();

    await main.getByPlaceholder(/e\.g\. Becky Thomas/i).fill(customerName);
    await main.getByPlaceholder(/\(555\) 555-5555/i).fill('555-010-1234');
    await main.getByPlaceholder(/customer@example\.com/i).fill(customerEmail);
    await main.getByPlaceholder(/^Main home$/i).fill(`E2E Test Property ${timestamp}`);
    await main.getByPlaceholder(/^Street address$/i).fill('123 E2E Test Street');
    await main.getByLabel(/^City$/i).fill('Testville');
    await main.getByPlaceholder(/Start typing a state/i).fill('AL');
    await main.getByLabel(/^ZIP$/i).fill('36532');
    await main.getByPlaceholder(/^Single family$/i).fill('Single family');

    await expect(main.getByPlaceholder(/e\.g\. Becky Thomas/i)).toHaveValue(customerName);
    await expect(main.getByPlaceholder(/\(555\) 555-5555/i)).toHaveValue('(555) 010-1234');
    await expect(main.getByPlaceholder(/customer@example\.com/i)).toHaveValue(customerEmail);
    await expect(main.getByPlaceholder(/^Main home$/i)).toHaveValue(`E2E Test Property ${timestamp}`);
    await expect(main.getByPlaceholder(/^Street address$/i)).toHaveValue('123 E2E Test Street');
    await expect(main.getByLabel(/^City$/i)).toHaveValue('Testville');
    await expect(main.getByPlaceholder(/Start typing a state/i)).toHaveValue('AL');
    await expect(main.getByLabel(/^ZIP$/i)).toHaveValue('36532');
    await expect(main.getByPlaceholder(/^Single family$/i)).toHaveValue('Single family');

    const createContactResponsePromise = page
      .waitForResponse(response => response.url().includes('/rpc/servsync_create_local_contact'), { timeout: 10_000 })
      .catch(() => null);

    const search = main.getByPlaceholder(/Search homeowner, city, address/i);
    const customerResult = main.getByRole('button', { name: new RegExp(escapeRegExp(customerName), 'i') });
    const saveError = main.getByText(/Unable to save new customer|Enter a customer name before saving/i);
    const saveButton = main.getByRole('button', { name: /^Save new customer$/i });

    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    const createContactResponse = await createContactResponsePromise;
    if (!createContactResponse) {
      throw new Error('No servsync_create_local_contact RPC request was observed after clicking Save new customer.');
    }
    if (!createContactResponse.ok()) {
      throw new Error(`Local customer create RPC failed with HTTP ${createContactResponse.status()}`);
    }

    await expect(search).toBeVisible();
    await search.fill(customerName);
    await expect(
      customerResult.or(saveError),
      'Expected the saved E2E customer to appear in the list, or a visible save error to appear.',
    ).toBeVisible({ timeout: 30_000 });

    if (await saveError.isVisible().catch(() => false)) {
      throw new Error(`Local customer save failed: ${await saveError.textContent()}`);
    }

    await expect(customerResult).toBeVisible();

    await consoleErrors.assertClean(testInfo);
  });

  test('adds a second local customer property and requires explicit property selection for new work', async ({ page }, testInfo) => {
    requireApprovedSandboxForMutation();

    const consoleErrors = captureMajorConsoleErrors(page);
    const main = page.getByRole('main');
    const timestamp = timestampForRecord();
    const customerName = `E2E Multi Property Customer ${timestamp}`;
    const customerEmail = `e2e-multi-property-${timestamp}@example.com`;
    const firstProperty = `Primary E2E Property ${timestamp}`;
    const secondProperty = `Guest E2E Property ${timestamp}`;

    await loginAs(page, 'contractor');
    await openSidebarTab(page, /Homeowners/i);
    await expectActiveTabHeading(page, /^Homeowners$/i);

    await main.getByRole('button', { name: /^Add$/i }).click();
    await expect(main.getByRole('heading', { name: /^Add new customer$/i })).toBeVisible();
    await main.getByPlaceholder(/e\.g\. Becky Thomas/i).fill(customerName);
    await main.getByPlaceholder(/\(555\) 555-5555/i).fill('555-010-2233');
    await main.getByPlaceholder(/customer@example\.com/i).fill(customerEmail);
    await main.getByPlaceholder(/^Main home$/i).fill(firstProperty);
    await main.getByPlaceholder(/^Street address$/i).fill('100 Primary E2E Street');
    await main.getByLabel(/^City$/i).fill('Testville');
    await main.getByPlaceholder(/Start typing a state/i).fill('AL');
    await main.getByLabel(/^ZIP$/i).fill('36532');

    const createContactResponsePromise = page.waitForResponse(
      response => response.url().includes('/rpc/servsync_create_local_contact'),
      { timeout: 10_000 },
    );
    await main.getByRole('button', { name: /^Save new customer$/i }).click();
    const createContactResponse = await createContactResponsePromise;
    expect(createContactResponse.ok()).toBeTruthy();

    const search = main.getByPlaceholder(/Search homeowner, city, address/i);
    await expect(search).toBeVisible();
    await search.fill(customerName);
    const customerResult = main.getByRole('button').filter({ hasText: customerName }).first();
    await expect(customerResult).toBeVisible({ timeout: 30_000 });
    await customerResult.click();
    await expect(main.getByRole('heading', { level: 2, name: new RegExp(`^${escapeRegExp(customerName)}$`, 'i') })).toBeVisible();
    await expect(main.getByRole('button', { name: new RegExp(escapeRegExp(firstProperty), 'i') })).toBeVisible();

    await main.getByRole('button', { name: /^Add property$/i }).click();
    await expect(main.getByText(/Claiming multiple properties is a later homeowner-flow slice/i)).toBeVisible();
    await main.getByLabel(/^Property label$/i).fill(secondProperty);
    await main.getByLabel(/^Street address$/i).fill('200 Guest E2E Avenue');
    await main.getByLabel(/^City$/i).last().fill('Testville');
    await main.getByPlaceholder(/Start typing a state/i).last().fill('AL');
    await main.getByLabel(/^ZIP$/i).last().fill('36533');

    const createHomeResponsePromise = page.waitForResponse(
      response => response.url().includes('/rpc/servsync_create_local_home'),
      { timeout: 10_000 },
    );
    await main.getByRole('button', { name: /^Save property$/i }).click();
    const createHomeResponse = await createHomeResponsePromise;
    expect(createHomeResponse.ok()).toBeTruthy();

    await expect(main.getByRole('button', { name: new RegExp(escapeRegExp(firstProperty), 'i') })).toBeVisible();
    await expect(main.getByRole('button', { name: new RegExp(escapeRegExp(secondProperty), 'i') })).toBeVisible();
    await main.getByRole('button', { name: new RegExp(escapeRegExp(secondProperty), 'i') }).click();
    await expect(main.getByRole('button', { name: new RegExp(`${escapeRegExp(secondProperty)}[\\s\\S]*Selected`, 'i') })).toBeVisible();
    await main.getByRole('button', { name: /\bJobs\b.*(?:Create work for this customer|Items in progress)/i }).click();
    await expect(main.getByRole('heading', { name: /^Jobs dashboard$/i })).toBeVisible();
    await main.getByRole('button', { name: /^Create job\b/i }).click();
    await expect(main.getByRole('heading', { name: /^Create Job$/i })).toBeVisible();
    await expect(main.getByText(new RegExp(`Selected property: ${escapeRegExp(secondProperty)}`, 'i'))).toBeVisible();

    const contractorClient = await signInAs('contractor');
    const otherContractorClient = await signInAs('contractorB');
    if (!contractorClient || !otherContractorClient) {
      testInfo.annotations.push({
        type: 'coverage-gap',
        description: 'Skipped direct unrelated-contractor RPC denial probe because VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY were not configured for this local run.',
      });
    } else {
      try {
        const { data: createdContact, error: lookupError } = await contractorClient
          .from('contractor_local_contacts')
          .select('id')
          .eq('email', customerEmail)
          .maybeSingle();
        expect(lookupError).toBeNull();
        expect(createdContact?.id).toBeTruthy();

        const { error: deniedError } = await otherContractorClient.rpc('servsync_create_local_home', {
          p_local_contact_id: createdContact!.id,
          p_nickname: `Denied property ${timestamp}`,
          p_address_line1: '999 Denied Street',
          p_address_line2: '',
          p_city: 'Blocked',
          p_state: 'AL',
          p_zip_code: '36534',
          p_notes: '',
        });
        expect(deniedError, 'Unrelated contractor must not add a property to another contractor local customer').toBeTruthy();
      } finally {
        await Promise.all([
          contractorClient.auth.signOut().catch(() => undefined),
          otherContractorClient.auth.signOut().catch(() => undefined),
        ]);
      }
    }

    await consoleErrors.assertClean(testInfo);
  });
});
