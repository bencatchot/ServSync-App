import { expect, test, type Page } from '@playwright/test';

const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000901';
const EXISTING_CUSTOMER_ID = '00000000-0000-4000-8000-000000000902';
const EXISTING_HOME_ID = '00000000-0000-4000-8000-000000000903';
const NEW_CUSTOMER_ID = '00000000-0000-4000-8000-000000000904';
const NEW_HOME_ID = '00000000-0000-4000-8000-000000000905';

async function installHarness(page: Page, options: {
  canCreateCustomer?: boolean;
  failFirstSave?: boolean;
  outputType?: 'estimate' | 'invoice';
} = {}) {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto('/');
  await page.evaluate(async ({ ids, options }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const reactModule = await dynamicImport('/node_modules/.vite/deps/react.js');
    const reactDomModule = await dynamicImport('/node_modules/.vite/deps/react-dom_client.js');
    const workspaceModule = await dynamicImport('/src/features/drafts/DurableDraftWorkspace.tsx');
    const mappingModule = await dynamicImport('/src/features/drafts/draftComposerMappings.ts');
    const React = reactModule.default as {
      createElement: (...args: unknown[]) => unknown;
    };
    const createRoot = (reactDomModule.default as { createRoot: (element: HTMLElement) => { render: (node: unknown) => void } }).createRoot;
    const DurableDraftWorkspace = workspaceModule.DurableDraftWorkspace as (...args: unknown[]) => unknown;
    const createBlankDraft = mappingModule.createBlankSharedDraftComposerDraft as (value: Record<string, unknown>) => Record<string, unknown>;
    const initialDraft = createBlankDraft({
      title: 'Preserve this title',
      scope: 'Preserve this unfinished scope',
      notes: 'Preserve this private note',
      intended_output: options.outputType ?? 'estimate',
      line_items: [{
        id: 'new-line-1', job_work_item_id: null, line_type: 'labor', description: 'Preserved line',
        line_title: 'Preserved line', customer_description: 'Preserved line', model_spec: '', supply_status: '',
        quantity: '1', unit: 'each', unit_price: '125.00', labor_hours: '1', work_state: 'not_started',
        room_id: null, room_label: '', location_label: '', internal_notes: '',
      }],
    });
    const target = { kind: 'new', initialDraft };
    const existing = {
      key: `local:${ids.existingCustomerId}`, subjectType: 'local', customerId: ids.existingCustomerId,
      label: 'Existing Customer', status: 'not_connected', statusLabel: 'Not connected',
      properties: [{ id: ids.existingHomeId, label: 'Existing Home' }],
    };
    const created = {
      key: `local:${ids.newCustomerId}`, subjectType: 'local', customerId: ids.newCustomerId,
      label: 'New Pilot Customer', status: 'not_connected', statusLabel: 'Not connected',
      properties: [{ id: ids.newHomeId, label: '390 Pilot Avenue' }],
    };
    const state = {
      rpcCalls: [] as string[],
      saveAttempts: 0,
      failNext: Boolean(options.failFirstSave),
      canCreateCustomer: options.canCreateCustomer !== false,
    };
    const client = {
      rpc(name: string) {
        state.rpcCalls.push(name);
        return Promise.reject(new Error(`Unexpected RPC: ${name}`));
      },
      from() {
        const query = {
          select() { return query; },
          in() { return query; },
          order() { return query; },
          then(resolve: (value: unknown) => void) { return Promise.resolve({ data: [], error: null }).then(resolve); },
        };
        return query;
      },
    };
    const capabilities = {
      contractorId: ids.contractorId,
      canReadDrafts: true,
      canPersistDraft: true,
      canImportLegacyDraft: true,
      canLaunchJob: true,
      canLaunchEstimate: true,
      canLaunchInvoice: true,
    };

    document.body.innerHTML = '<main id="draft-customer-root" class="p-4"></main>';
    const customerOptions = [existing, created];
    const root = createRoot(document.getElementById('draft-customer-root') as HTMLElement);
    const render = () => root.render(React.createElement(DurableDraftWorkspace, {
        client,
        mode: 'editor',
        target,
        capabilities,
        launchEnabled: true,
        legacyDrafts: [],
        customerOptions,
        canCreateCustomer: state.canCreateCustomer,
        onPrepareCustomerCreation: () => undefined,
        renderCustomerCreation: ({ onCreated, onCancel }: { onCreated: (customer: unknown) => void; onCancel: () => void }) => React.createElement(
          'section',
          { 'data-testid': 'test-customer-form' },
          React.createElement('label', null, 'Customer name', React.createElement('input', { 'aria-label': 'Customer name', defaultValue: 'New Pilot Customer' })),
          React.createElement('button', {
            type: 'button',
            onClick: () => {
              state.saveAttempts += 1;
              if (state.failNext) {
                state.failNext = false;
                const error = document.createElement('p');
                error.setAttribute('role', 'alert');
                error.textContent = 'Unable to save new customer.';
                document.querySelector('[data-testid="test-customer-form"]')?.append(error);
                return;
              }
              onCreated(created);
            },
          }, 'Save and use customer'),
          React.createElement('button', { type: 'button', onClick: onCancel }, 'Cancel'),
        ),
        customerLabel: () => 'Legacy customer',
        propertyLabel: () => 'Legacy property',
        onStartNew: () => undefined,
        onOpenTarget: () => undefined,
        onBack: () => undefined,
        onRefreshCapabilities: async () => capabilities,
        onLoadOutput: async () => { throw new Error('No output should load'); },
        onAdoptOutput: () => undefined,
      }));
    render();
    (window as unknown as { __draftCustomerHarness: typeof state }).__draftCustomerHarness = state;
  }, {
    ids: { contractorId: CONTRACTOR_ID, existingCustomerId: EXISTING_CUSTOMER_ID, existingHomeId: EXISTING_HOME_ID, newCustomerId: NEW_CUSTOMER_ID, newHomeId: NEW_HOME_ID },
    options,
  });
  try {
    await expect(page.getByTestId('shared-draft-composer')).toBeVisible();
  } catch (error) {
    if (pageErrors.length) throw new Error(`Harness page error: ${pageErrors.join(' | ')}`);
    throw error;
  }
}

test.describe('New Draft local-customer entry', () => {
  test('keeps existing selection behavior and supports opening and cancelling the shared form', async ({ page }) => {
    await installHarness(page);
    const customer = page.getByTestId('durable-draft-customer');
    await customer.click();
    await page.getByRole('option', { name: /Existing Customer/ }).click();
    await expect(customer).toHaveValue(/Existing Customer/);
    await expect(page.getByTestId('durable-draft-property')).toHaveValue(EXISTING_HOME_ID);

    await page.getByTestId('durable-draft-add-customer').click();
    await expect(page.getByTestId('test-customer-form')).toBeVisible();
    await page.getByTestId('test-customer-form').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('test-customer-form')).toHaveCount(0);
    await expect(customer).toHaveValue(/Existing Customer/);
  });

  for (const outputType of ['estimate', 'invoice'] as const) {
    test(`selects a newly saved customer and enables the ${outputType} next action without creating it`, async ({ page }) => {
      await installHarness(page, { outputType });
      await page.getByLabel('Draft title').fill('Still unfinished after customer save');
      await page.getByTestId('durable-draft-add-customer').click();
      await page.getByRole('button', { name: 'Save and use customer' }).click();

      await expect(page.getByTestId('durable-draft-customer-created')).toContainText('New Pilot Customer is selected.');
      await expect(page.getByTestId('durable-draft-customer')).toHaveValue(/New Pilot Customer/);
      await expect(page.getByTestId('durable-draft-property')).toHaveValue(NEW_HOME_ID);
      await expect(page.getByLabel('Draft title')).toHaveValue('Still unfinished after customer save');
      await expect(page.getByText('Preserve this unfinished scope')).toBeVisible();
      expect(await page.locator('input').evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value))).toContain('Preserved line');
      await expect(page.getByTestId('durable-draft-create-output')).toBeEnabled();

      const runtime = await page.evaluate(() => (window as unknown as { __draftCustomerHarness: { rpcCalls: string[]; saveAttempts: number } }).__draftCustomerHarness);
      expect(runtime.saveAttempts).toBe(1);
      expect(runtime.rpcCalls).toEqual([]);
    });
  }

  test('keeps the form open after an error and allows one safe retry', async ({ page }) => {
    await installHarness(page, { failFirstSave: true });
    await page.getByTestId('durable-draft-add-customer').click();
    await page.getByRole('button', { name: 'Save and use customer' }).click();
    await expect(page.getByRole('alert')).toHaveText('Unable to save new customer.');
    await expect(page.getByTestId('test-customer-form')).toBeVisible();
    await page.getByRole('button', { name: 'Save and use customer' }).click();
    await expect(page.getByTestId('durable-draft-customer')).toHaveValue(/New Pilot Customer/);
    const attempts = await page.evaluate(() => (window as unknown as { __draftCustomerHarness: { saveAttempts: number } }).__draftCustomerHarness.saveAttempts);
    expect(attempts).toBe(2);
  });

  test('does not expose creation to forbidden or read-only roles', async ({ page }) => {
    await installHarness(page, { canCreateCustomer: false });
    await expect(page.getByTestId('durable-draft-add-customer')).toHaveCount(0);
    await expect(page.getByTestId('test-customer-form')).toHaveCount(0);
  });

  test('is unclipped at exactly 390 by 844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installHarness(page);
    await expect(page.getByTestId('durable-draft-add-customer')).toBeVisible();
    await page.getByTestId('durable-draft-add-customer').click();
    await expect(page.getByTestId('test-customer-form')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});
