import { expect, test, type Page } from '@playwright/test';
import {
  BASIC_PRICE_BOOK_STARTER_IDEMPOTENCY_KEY,
  BASIC_PRICE_BOOK_STARTER_SOURCE_NAME,
  basicPriceBookStarterRows,
  createBasicPriceBookStarterCatalog,
  type PriceBookStarterCatalogApi,
} from '../../src/features/price-book/priceBookStarterCatalog';
import type { PriceBookImportPreviewRow, PriceBookImportSource } from '../../src/features/price-book/priceBookCsvReconciliation';

const source: PriceBookImportSource = {
  id: 'source-1',
  display_name: BASIC_PRICE_BOOK_STARTER_SOURCE_NAME,
  source_kind: 'file_upload',
  status: 'active',
  created_at: '2026-08-12T12:00:00.000Z',
};

function previewRow(rowNumber: number, matchType: PriceBookImportPreviewRow['match_type'] = 'none'): PriceBookImportPreviewRow {
  const request = basicPriceBookStarterRows()[rowNumber - 1];
  const mayAdd = matchType === 'none';
  return {
    row_number: rowNumber,
    external_item_id: request.external_item_id,
    sku: null,
    row_fingerprint: `row-${rowNumber}`,
    mapped_fields: request.mapped_fields,
    match_type: matchType,
    reconciliation_status: mayAdd ? 'new' : 'unchanged',
    match_confidence: mayAdd ? 'none' : 'high',
    target_item_id: mayAdd ? null : `existing-${rowNumber}`,
    target_updated_at: mayAdd ? null : '2026-08-12T12:00:00.000Z',
    current_values: mayAdd ? null : request.values,
    incoming_values: request.values,
    result_values: request.values,
    changed_fields: [],
    conflict_fields: [],
    recommended_action: mayAdd ? 'add' : 'skip',
    allowed_actions: mayAdd ? ['add', 'skip'] : ['skip'],
    warnings: [],
    errors: [],
  };
}

function starterApi(overrides: Partial<PriceBookStarterCatalogApi> = {}) {
  const rows = basicPriceBookStarterRows();
  let executeInput: Parameters<PriceBookStarterCatalogApi['execute']>[0] | null = null;
  const api: PriceBookStarterCatalogApi = {
    listSources: async () => [source],
    createSource: async () => source,
    preview: async () => ({
      source,
      rows: rows.map((_, index) => previewRow(index + 1)),
      counts: { add: rows.length, update: 0, skip: 0, error: 0 },
    }),
    execute: async input => {
      executeInput = input;
      const addCount = Object.values(input.actions).filter(action => action === 'add').length;
      const skipCount = Object.values(input.actions).filter(action => action === 'skip').length;
      return { batch_id: 'batch-1', status: 'completed', source_id: source.id, row_count: rows.length, add_count: addCount, update_count: 0, skip_count: skipCount, error_count: 0, idempotent: false };
    },
    ...overrides,
  };
  return { api, executed: () => executeInput };
}

async function renderOnboarding(page: Page, options: { canManage?: boolean; archivedOnly?: boolean; delayedStarter?: boolean } = {}) {
  await page.goto('/');
  await page.evaluate(async ({ canManage = true, archivedOnly = false, delayedStarter = false }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const React = (await dynamicImport('/node_modules/.vite/deps/react.js')).default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as { createRoot: (element: HTMLElement) => { render: (node: unknown) => void } }).createRoot;
    const Workspace = (await dynamicImport('/src/features/price-book/ContractorPriceBookWorkspace.tsx')).ContractorPriceBookWorkspace as (...args: unknown[]) => unknown;
    const archivedItem = { id: 'archived-1', contractor_id: 'contractor-1', title: 'Archived service', customer_description: '', internal_notes: '', trade: '', category: '', subcategory: null, line_type: 'other', unit: 'each', default_unit_price_cents: null, taxable: true, labor_hours: null, sku: null, source: 'manual', active: false, archived_at: '2026-08-12T12:00:00.000Z', created_at: '2026-08-12T12:00:00.000Z', updated_at: '2026-08-12T12:00:00.000Z' };
    const blankDraft = { title: '', customer_description: '', internal_notes: '', trade: '', category: '', subcategory: '', line_type: 'other', unit: '', default_unit_price: '', internal_cost: '', taxable: true, labor_hours: '', sku: '', active: true };
    document.body.innerHTML = '<main id="root"></main>';
    (window as typeof window & { __starterCalls?: number; __addFormCalls?: number }).__starterCalls = 0;
    (window as typeof window & { __starterCalls?: number; __addFormCalls?: number }).__addFormCalls = 0;
    createRoot(document.getElementById('root') as HTMLElement).render(React.createElement(Workspace, {
      items: archivedOnly ? [archivedItem] : [], contractorSaved: true, canManage, loadState: 'ready', loadError: '', draft: blankDraft,
      setDraft: () => undefined, formOpen: false, editingItemId: null, savingItem: false, togglingItemId: null,
      csvTools: React.createElement('div', { 'data-testid': 'import-panel-body' }, 'Existing importer'),
      onBack: () => undefined, onRetry: () => undefined,
      onOpenAddForm: () => { (window as typeof window & { __addFormCalls?: number }).__addFormCalls = ((window as typeof window & { __addFormCalls?: number }).__addFormCalls || 0) + 1; },
      onCancelForm: () => undefined, onSave: () => undefined, onEdit: () => undefined, onToggleActive: () => undefined,
      onBulkUpdate: async () => true,
      onboardingStorageKey: 'servsync.test.priceBook.onboardingDismissed',
      onAddStarterCatalog: async () => {
        (window as typeof window & { __starterCalls?: number }).__starterCalls = ((window as typeof window & { __starterCalls?: number }).__starterCalls || 0) + 1;
        if (delayedStarter) await new Promise(resolve => window.setTimeout(resolve, 100));
      },
    }));
  }, options);
}

test.describe('FB-024 Contractor-Neutral Price Book Onboarding v1', () => {
  test('defines a bounded trade-neutral starter with blank pricing and no private or bundle fields', () => {
    const rows = basicPriceBookStarterRows();
    expect(rows).toHaveLength(12);
    expect(rows.map(row => row.values.title)).toEqual(expect.arrayContaining(['Service call', 'Diagnostic labor', 'Travel / trip charge', 'Common replacement part']));
    expect(JSON.stringify(rows)).not.toMatch(/HVAC|plumb|electric|assembly|bundle|internal_cost|margin|profit|default_unit_price/i);
    expect(new Set(rows.map(row => row.external_item_id)).size).toBe(rows.length);
    expect(rows.every(row => row.mapped_fields.join(',') === 'title,line_type,unit')).toBe(true);
  });

  test('uses the existing preview and one idempotent import execution without overwriting equivalents', async () => {
    const { api, executed } = starterApi({
      preview: async () => ({
        source,
        rows: basicPriceBookStarterRows().map((_, index) => previewRow(index + 1, index < 2 ? 'exact_duplicate' : 'none')),
        counts: { add: 10, update: 0, skip: 2, error: 0 },
      }),
    });
    const result = await createBasicPriceBookStarterCatalog(api);
    const input = executed();
    expect(result).toMatchObject({ add_count: 10, skip_count: 2, itemCount: 12 });
    expect(input?.idempotencyKey).toBe(BASIC_PRICE_BOOK_STARTER_IDEMPOTENCY_KEY);
    expect(input?.actions).toMatchObject({ '1': 'skip', '2': 'skip', '3': 'add', '12': 'add' });
    expect(Object.values(input?.actions || {})).not.toContain('update');
    expect(input?.filename).toBe('servsync-basic-contractor-v1.csv');
  });

  test('recovers a concurrent source-create race and fails before execution on an incomplete preview', async () => {
    let listCount = 0;
    const raced = starterApi({
      listSources: async () => (++listCount === 1 ? [] : [source]),
      createSource: async () => { throw new Error('unique'); },
    });
    await expect(createBasicPriceBookStarterCatalog(raced.api)).resolves.toMatchObject({ status: 'completed' });

    let executed = false;
    const incomplete = starterApi({
      preview: async () => ({ source, rows: [previewRow(1)], counts: { add: 1, update: 0, skip: 0, error: 0 } }),
      execute: async () => { executed = true; throw new Error('must not execute'); },
    });
    await expect(createBasicPriceBookStarterCatalog(incomplete.api)).rejects.toThrow('preview was incomplete');
    expect(executed).toBe(false);
  });

  test('offers all four first-run paths without mutating until an action is chosen', async ({ page }) => {
    await renderOnboarding(page);
    await expect(page.getByTestId('price-book-onboarding')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add your first item' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import CSV or XLSX' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add 12 starter items' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start with an empty Price Book' })).toBeVisible();
    expect(await page.evaluate(() => (window as typeof window & { __starterCalls?: number }).__starterCalls)).toBe(0);

    await page.getByRole('button', { name: 'Import CSV or XLSX' }).click();
    await expect(page.getByTestId('import-panel-body')).toBeVisible();
    expect(await page.evaluate(() => (window as typeof window & { __starterCalls?: number }).__starterCalls)).toBe(0);
  });

  test('guards starter double-actions, remembers an explicit start-empty choice, and remains usable at 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await renderOnboarding(page, { delayedStarter: true });
    const starter = page.getByRole('button', { name: /Add 12 starter items|Adding 12 starter items/ });
    await starter.dblclick();
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => (window as typeof window & { __starterCalls?: number }).__starterCalls)).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await renderOnboarding(page);
    await page.getByRole('button', { name: 'Start with an empty Price Book' }).click();
    await expect(page.getByTestId('price-book-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('price-book-empty-state')).toBeVisible();

    await renderOnboarding(page);
    await expect(page.getByTestId('price-book-onboarding')).toHaveCount(0);
    await expect(page.getByTestId('price-book-empty-state')).toBeVisible();
  });

  test('hides mutation paths for read-only roles and does not treat archived-only catalogs as first run', async ({ page }) => {
    await renderOnboarding(page, { canManage: false });
    await expect(page.getByTestId('price-book-onboarding')).toHaveCount(0);
    await expect(page.getByText('An owner, admin, or office user can add or import them.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add 12 starter items' })).toHaveCount(0);

    await renderOnboarding(page, { archivedOnly: true });
    await expect(page.getByTestId('price-book-onboarding')).toHaveCount(0);
    await expect(page.getByText('No active Price Book items.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'View archived items' })).toBeVisible();
  });
});
