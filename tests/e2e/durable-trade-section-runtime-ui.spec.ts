import { expect, test, type Page } from '@playwright/test';

const CONTRACTOR_ID = '10000000-0000-4000-8000-000000000001';
const JOB_ID = '20000000-0000-4000-8000-000000000001';
const INSTANCE_ID = '30000000-0000-4000-8000-000000000001';

const definition = () => ({
  schema_version: 1,
  section: { key: 'fixture', label: 'Fixture section', description: 'Private field capture.', customer_visibility: 'contractor_private' },
  readings: [
    { key: 'measurement', label: 'Measurement', description: null, value_type: 'number', unit: 'units', required: true, customer_visibility: 'contractor_private', options: [] },
    { key: 'observation', label: 'Observation', description: null, value_type: 'text', unit: null, required: false, customer_visibility: 'contractor_private', options: [] },
  ],
  tests: [
    { key: 'verified', label: 'Verified', description: null, value_type: 'boolean', required: true, customer_visibility: 'contractor_private', options: [] },
    { key: 'condition', label: 'Condition', description: null, value_type: 'choice', required: true, customer_visibility: 'contractor_private', options: ['good', 'review'] },
  ],
  findings: [],
  recommendations: [],
});

const workType = () => ({
  work_type_key: 'fixturetrade.fixture_service', trade_key: 'fixturetrade', workflow_family_key: 'fixture_work',
  capability_key: 'fixturetrade.fixture_service', version_number: 1, display_name: 'Fixture service',
  description: 'Disposable fixture.', definition_contract: definition(),
});

const instance = (overrides: Record<string, unknown> = {}) => ({
  id: INSTANCE_ID, contractor_id: CONTRACTOR_ID, work_draft_id: null, estimate_id: null, job_id: JOB_ID,
  homeowner_user_id: '50000000-0000-4000-8000-000000000001', local_contact_id: null,
  home_id: '60000000-0000-4000-8000-000000000001', local_home_id: null,
  property_asset_id: null, property_asset_revision_number: null,
  workflow_family_id: '70000000-0000-4000-8000-000000000001', workflow_family_key: 'fixture_work',
  trade_id: '71000000-0000-4000-8000-000000000001', trade_key: 'fixturetrade',
  work_type_id: '72000000-0000-4000-8000-000000000001', work_type_key: 'fixturetrade.fixture_service',
  capability_id: '73000000-0000-4000-8000-000000000001', capability_key: 'fixturetrade.fixture_service',
  definition_version_id: '74000000-0000-4000-8000-000000000001', definition_version_number: 1,
  definition_schema_version: 1, definition_snapshot: definition(), definition_snapshot_sha256: 'a'.repeat(64),
  current_values: { measurement: 2.5, verified: true, condition: 'good' }, lifecycle_status: 'active',
  current_revision_number: 1, section_order: 0, origin_kind: 'job',
  idempotency_key: '40000000-0000-4000-8000-000000000001',
  created_by_user_id: '75000000-0000-4000-8000-000000000001',
  created_at: '2026-08-09T10:00:00.000Z', updated_at: '2026-08-09T10:00:00.000Z', lifecycle_changed_at: null,
  ...overrides,
});

type HarnessOptions = {
  enabled?: boolean;
  role?: 'owner' | 'admin' | 'office' | 'field_tech' | 'viewer' | null;
  jobStatus?: string;
  recordStatus?: string;
  workTypes?: unknown[];
  instances?: unknown[];
  mutationMode?: 'success' | 'stale' | 'ambiguous' | 'capability';
  loadError?: { code: string; message: string } | null;
};

async function installHarness(page: Page, options: HarnessOptions = {}) {
  await page.goto('/');
  await page.evaluate(async ({ options, ids }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const React = (await dynamicImport('/node_modules/.vite/deps/react.js')).default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as {
      createRoot: (element: HTMLElement) => { render: (node: unknown) => void };
    }).createRoot;
    const module = await dynamicImport('/src/features/trade-sections/TradeSectionJobPanel.tsx');
    const Panel = module.TradeSectionJobPanel as (...args: unknown[]) => unknown;
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let rows = options.instances ?? [];
    let mutationMode = options.mutationMode ?? 'success';
    const client = {
      rpc(name: string, args: Record<string, unknown>) {
        calls.push({ name, args });
        if (options.loadError && name.startsWith('servsync_list_')) return Promise.resolve({ data: null, error: options.loadError });
        if (name === 'servsync_list_available_trade_pack_work_types') return Promise.resolve({ data: options.workTypes ?? [], error: null });
        if (name === 'servsync_list_trade_section_instances') return Promise.resolve({ data: rows, error: null });
        if (name === 'servsync_create_trade_section_instance') {
          const template = (window as unknown as { __tradeRuntimeInstance: (value: Record<string, unknown>) => Record<string, unknown> }).__tradeRuntimeInstance;
          const created = template({ current_values: args.p_values, idempotency_key: args.p_idempotency_key, section_order: args.p_section_order });
          if (mutationMode === 'capability') return Promise.resolve({ data: null, error: { code: 'P0001', message: 'Trade Section capability is unavailable.' } });
          rows = [...rows.filter(row => (row as Record<string, unknown>).id !== created.id), created];
          if (mutationMode === 'ambiguous') return Promise.reject(new Error('network'));
          return Promise.resolve({ data: created, error: null });
        }
        if (name === 'servsync_update_trade_section_values') {
          if (mutationMode === 'stale') return Promise.resolve({ data: null, error: { code: 'P0001', message: 'Trade Section has changed; refresh and try again.' } });
          if (mutationMode === 'ambiguous') return Promise.reject(new Error('network'));
          const current = rows.find(row => (row as Record<string, unknown>).id === args.p_instance_id) as Record<string, unknown>;
          const updated = { ...current, current_values: args.p_values, current_revision_number: Number(args.p_expected_revision) + 1, updated_at: '2026-08-09T11:00:00.000Z' };
          rows = rows.map(row => (row as Record<string, unknown>).id === args.p_instance_id ? updated : row);
          return Promise.resolve({ data: updated, error: null });
        }
        return Promise.resolve({ data: null, error: { code: 'P0001', message: 'Unexpected RPC' } });
      },
    };
    document.body.innerHTML = '<main class="mx-auto max-w-4xl p-4"><div id="trade-section-test-root"></div></main>';
    const root = createRoot(document.getElementById('trade-section-test-root') as HTMLElement);
    root.render(React.createElement(Panel, {
      client,
      contractorId: ids.contractorId,
      jobId: ids.jobId,
      jobStatus: options.jobStatus ?? 'in_progress',
      recordStatus: options.recordStatus ?? 'draft',
      role: options.role === undefined ? 'owner' : options.role,
      enabled: options.enabled ?? true,
    }));
    (window as unknown as { __tradeRuntimeHarness: unknown }).__tradeRuntimeHarness = {
      calls,
      setMutationMode(next: 'success' | 'stale' | 'ambiguous' | 'capability') { mutationMode = next; },
    };
  }, { options, ids: { contractorId: CONTRACTOR_ID, jobId: JOB_ID } });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ base }) => {
    const runtimeWindow = window as unknown as { __tradeRuntimeErrors: string[]; __tradeRuntimeInstance: (value: Record<string, unknown>) => Record<string, unknown> };
    runtimeWindow.__tradeRuntimeErrors = [];
    const originalConsoleError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      runtimeWindow.__tradeRuntimeErrors.push(args.map(String).join(' '));
      originalConsoleError(...args);
    };
    window.addEventListener('error', event => runtimeWindow.__tradeRuntimeErrors.push(event.message));
    window.addEventListener('unhandledrejection', event => runtimeWindow.__tradeRuntimeErrors.push(String(event.reason)));
    (window as unknown as { __tradeRuntimeInstance: (value: Record<string, unknown>) => Record<string, unknown> }).__tradeRuntimeInstance = value => ({ ...base, ...value });
  }, { base: instance() });
});

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => (window as unknown as { __tradeRuntimeErrors: string[] }).__tradeRuntimeErrors)).toEqual([]);
});

test.describe('Durable Trade Section Job panel', () => {
  test('gate-off and excluded roles or Job states make zero calls', async ({ page }) => {
    for (const options of [
      { enabled: false },
      { role: 'field_tech' as const },
      { role: null },
      { jobStatus: 'completed' },
      { recordStatus: 'finalized' },
    ]) {
      await installHarness(page, options);
      await page.waitForTimeout(50);
      await expect(page.getByTestId('trade-section-job-panel')).toHaveCount(0);
      expect(await page.evaluate(() => (window as unknown as { __tradeRuntimeHarness: { calls: unknown[] } }).__tradeRuntimeHarness.calls.length)).toBe(0);
    }
  });

  test('shows a bounded empty state with exact owner discovery', async ({ page }) => {
    await installHarness(page);
    await expect(page.getByTestId('trade-section-empty')).toBeVisible();
    const calls = await page.evaluate(() => (window as unknown as { __tradeRuntimeHarness: { calls: Array<{ name: string }> } }).__tradeRuntimeHarness.calls.map(call => call.name));
    expect(calls.sort()).toEqual(['servsync_list_available_trade_pack_work_types', 'servsync_list_trade_section_instances']);
  });

  test('shows unsupported existing snapshots without editable controls', async ({ page }) => {
    await installHarness(page, {
      instances: [instance({
        definition_schema_version: 2,
        definition_snapshot: { ...definition(), schema_version: 2 },
        current_values: { future_field: { nested: true } },
      })],
    });
    await expect(page.getByTestId('trade-section-instance-unsupported')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save section' })).toHaveCount(0);
  });

  test('gives active Admin and Office the same server-bounded mutation shell', async ({ page }) => {
    for (const role of ['admin', 'office'] as const) {
      await installHarness(page, { role, workTypes: [workType()] });
      await expect(page.getByTestId('trade-section-create')).toBeVisible();
      const calls = await page.evaluate(() => (window as unknown as { __tradeRuntimeHarness: { calls: Array<{ name: string }> } }).__tradeRuntimeHarness.calls.map(call => call.name));
      expect(calls.sort()).toEqual(['servsync_list_available_trade_pack_work_types', 'servsync_list_trade_section_instances']);
    }
  });

  test('keeps Viewer exact-Job data read-only on desktop and mobile', async ({ page }) => {
    await installHarness(page, { role: 'viewer', instances: [instance()] });
    await expect(page.getByTestId('trade-section-read-only')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save section' })).toHaveCount(0);
    await expect(page.getByTestId('trade-section-create')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __tradeRuntimeHarness: { calls: Array<{ name: string }> } }).__tradeRuntimeHarness.calls.map(call => call.name)))
      .toEqual(['servsync_list_trade_section_instances']);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText('Fixture section')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('creates and updates scalar fields through the approved RPCs', async ({ page }) => {
    await installHarness(page, { workTypes: [workType()] });
    await expect(page.getByTestId('trade-section-create')).toBeVisible();
    await page.getByLabel('Measurement *').fill('3.25');
    await page.getByLabel('Verified *').check();
    await page.getByLabel('Condition *').selectOption('review');
    await page.getByRole('button', { name: 'Add section' }).click();
    await expect(page.getByTestId('trade-section-instance')).toHaveCount(1);
    await page.getByTestId('trade-section-instance').getByLabel('Measurement *').fill('4.5');
    await page.getByRole('button', { name: 'Save section' }).click();
    const calls = await page.evaluate(() => (window as unknown as { __tradeRuntimeHarness: { calls: Array<{ name: string; args: Record<string, unknown> }> } }).__tradeRuntimeHarness.calls);
    expect(calls.filter(call => call.name === 'servsync_create_trade_section_instance')).toHaveLength(1);
    expect(calls.find(call => call.name === 'servsync_create_trade_section_instance')?.args).toMatchObject({ p_property_asset_id: null, p_job_id: JOB_ID });
    expect(calls.filter(call => call.name === 'servsync_update_trade_section_values')).toHaveLength(1);
  });

  test('preserves unsaved input after stale rejection and requires explicit reload', async ({ page }) => {
    await installHarness(page, { workTypes: [workType()], instances: [instance()], mutationMode: 'stale' });
    const measurement = page.getByTestId('trade-section-instance').getByLabel('Measurement *');
    await measurement.fill('9.75');
    await page.getByRole('button', { name: 'Save section' }).click();
    await expect(page.getByTestId('trade-section-stale')).toBeVisible();
    await expect(page.getByTestId('trade-section-reconciliation-required')).toBeVisible();
    await expect(measurement).toHaveValue('9.75');
    expect(await page.evaluate(() => (window as unknown as { __tradeRuntimeHarness: { calls: Array<{ name: string }> } }).__tradeRuntimeHarness.calls.filter(call => call.name === 'servsync_update_trade_section_values').length)).toBe(1);
  });

  test('surfaces malformed, unauthorized, and ambiguous states without mutation retry', async ({ page }) => {
    await installHarness(page, { workTypes: [{ bad: true }] });
    await expect(page.getByTestId('trade-section-load-error')).toBeVisible();

    await installHarness(page, { loadError: { code: '42501', message: 'Trade Section is unavailable.' } });
    await expect(page.getByTestId('trade-section-unauthorized')).toBeVisible();

    await installHarness(page, { workTypes: [workType()], mutationMode: 'ambiguous' });
    await page.getByLabel('Measurement *').fill('3');
    await page.getByLabel('Verified *').check();
    await page.getByLabel('Condition *').selectOption('good');
    await page.getByRole('button', { name: 'Add section' }).click();
    await expect(page.getByTestId('trade-section-create-ambiguous')).toBeVisible();
    await expect(page.getByTestId('trade-section-reconciliation-required')).toBeVisible();
    const firstCreate = await page.evaluate(() => (window as unknown as { __tradeRuntimeHarness: { calls: Array<{ name: string; args: Record<string, unknown> }> } }).__tradeRuntimeHarness.calls.find(call => call.name === 'servsync_create_trade_section_instance'));
    expect(firstCreate).toBeTruthy();
    await page.evaluate(() => (window as unknown as { __tradeRuntimeHarness: { setMutationMode: (mode: string) => void } }).__tradeRuntimeHarness.setMutationMode('success'));
    await page.getByRole('button', { name: 'Reload latest' }).click();
    await expect(page.getByTestId('trade-section-instance')).toHaveCount(1);
    await page.getByRole('button', { name: 'Add section' }).click();
    await expect(page.getByTestId('trade-section-instance')).toHaveCount(1);
    const createCalls = await page.evaluate(() => (window as unknown as { __tradeRuntimeHarness: { calls: Array<{ name: string; args: Record<string, unknown> }> } }).__tradeRuntimeHarness.calls.filter(call => call.name === 'servsync_create_trade_section_instance'));
    expect(createCalls).toHaveLength(2);
    expect(createCalls[1].args.p_idempotency_key).toBe(createCalls[0].args.p_idempotency_key);
    expect(createCalls[1].args.p_section_order).toBe(createCalls[0].args.p_section_order);
  });

  test('fails closed when capability authority changes while mounted', async ({ page }) => {
    await installHarness(page, { workTypes: [workType()], mutationMode: 'capability' });
    await page.getByLabel('Measurement *').fill('3');
    await page.getByLabel('Verified *').check();
    await page.getByLabel('Condition *').selectOption('good');
    await page.getByRole('button', { name: 'Add section' }).click();
    await expect(page.getByTestId('trade-section-create-error')).toContainText('access changed');
    await expect(page.getByTestId('trade-section-reconciliation-required')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add section' })).toBeDisabled();
  });
});
