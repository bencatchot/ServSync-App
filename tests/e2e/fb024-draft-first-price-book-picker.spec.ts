import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ContractorPriceBookItem } from '../../src/types';
import { prepareDurableDraftSave } from '../../src/features/drafts/durableDraftComposerIntegration';
import { createBlankSharedDraftComposerDraft } from '../../src/features/drafts/draftComposerMappings';
import { priceBookItemToEstimateLineDraft } from '../../src/features/price-book/priceBookEstimateLineSnapshot';

const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000401';

function priceBookItem(overrides: Partial<ContractorPriceBookItem> = {}): ContractorPriceBookItem {
  return {
    id: 'price-book-1',
    contractor_id: CONTRACTOR_ID,
    title: 'Copper fitting replacement',
    customer_description: 'Includes one standard copper fitting.',
    internal_notes: 'Private margin target',
    trade: 'Plumbing',
    category: 'Repair',
    subcategory: 'Fittings',
    line_type: 'material',
    unit: 'each',
    default_unit_price_cents: 0,
    taxable: true,
    labor_hours: 1.25,
    sku: 'PRIVATE-SKU',
    source: 'csv_import',
    active: true,
    archived_at: null,
    created_at: '2026-08-01T12:00:00.000Z',
    updated_at: '2026-08-01T12:00:00.000Z',
    ...overrides,
  };
}

async function installComposerHarness(page: Page) {
  await page.goto('/');
  await page.evaluate(async ({ contractorId }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const reactModule = await dynamicImport('/node_modules/.vite/deps/react.js');
    const reactDomModule = await dynamicImport('/node_modules/.vite/deps/react-dom_client.js');
    const composerModule = await dynamicImport('/src/features/drafts/ContractorDraftComposer.tsx');
    const mappingModule = await dynamicImport('/src/features/drafts/draftComposerMappings.ts');
    const React = reactModule.default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = (reactDomModule.default as { createRoot: (element: HTMLElement) => { render: (node: unknown) => void } }).createRoot;
    const ContractorDraftComposer = composerModule.ContractorDraftComposer as (...args: unknown[]) => unknown;
    const createBlankDraft = mappingModule.createBlankSharedDraftComposerDraft as (value: Record<string, unknown>) => Record<string, unknown>;

    const item = (overrides: Record<string, unknown> = {}) => ({
      id: 'price-book-1', contractor_id: contractorId, title: 'Copper fitting replacement',
      customer_description: 'Includes one standard copper fitting.', internal_notes: 'Private margin target',
      trade: 'Plumbing', category: 'Repair', subcategory: 'Fittings', line_type: 'material', unit: 'each',
      default_unit_price_cents: 0, taxable: true, labor_hours: 1.25, sku: 'PRIVATE-SKU', source: 'csv_import',
      active: true, archived_at: null, created_at: '2026-08-01T12:00:00.000Z', updated_at: '2026-08-01T12:00:00.000Z',
      ...overrides,
    });
    const state = {
      draft: createBlankDraft({
        intended_output: 'estimate',
        work_format: 'standard',
        title: 'Estimate planning',
        line_items: [],
      }),
      savedDraft: null as Record<string, unknown> | null,
      items: [
        item(),
        item({ id: 'price-book-2', title: 'Diagnostic labor', customer_description: 'Standard diagnostic visit.', trade: 'HVAC', category: 'Service', line_type: 'labor', unit: 'hour', default_unit_price_cents: null, labor_hours: null }),
        item({ id: 'price-book-3', title: 'Archived fee', line_type: 'fee', active: false, archived_at: '2026-08-01T13:00:00.000Z' }),
      ],
      loadState: 'ready',
      loadError: '',
      canView: true,
      canSave: true,
      saveCount: 0,
      launchCount: 0,
    };

    document.body.innerHTML = '<div id="draft-price-book-root"></div>';
    const root = createRoot(document.getElementById('draft-price-book-root') as HTMLElement);
    const render = () => root.render(React.createElement(ContractorDraftComposer, {
      draft: state.draft,
      customerOptions: [],
      checklistOptions: [],
      savedWorkTemplates: [],
      priceBookItems: state.items,
      priceBookLoadState: state.loadState,
      priceBookLoadError: state.loadError,
      canViewPriceBook: state.canView,
      currentDraftId: 'draft-1',
      canSave: state.canSave,
      saving: false,
      launchLabel: 'Create Estimate',
      onChange: (draft: Record<string, unknown>) => { state.draft = draft; render(); },
      onSave: () => {
        state.saveCount += 1;
        state.savedDraft = structuredClone(state.draft);
      },
      onLaunch: () => { state.launchCount += 1; },
      onBack: () => undefined,
      onRemovePersistedLine: () => undefined,
    }));
    const harness = {
      render,
      setIntent(value: 'estimate' | 'job' | 'invoice' | null) {
        state.draft = { ...state.draft, intended_output: value };
        render();
      },
      setWorkFormat(value: 'standard' | 'inspection_checklist') {
        state.draft = { ...state.draft, work_format: value };
        render();
      },
      setCanView(value: boolean) { state.canView = value; render(); },
      setCanSave(value: boolean) { state.canSave = value; render(); },
      setLoadState(value: 'idle' | 'loading' | 'ready' | 'error', error = '') {
        state.loadState = value;
        state.loadError = error;
        render();
      },
      setItems(items: Record<string, unknown>[]) { state.items = items; render(); },
      reopenSaved() {
        if (!state.savedDraft) throw new Error('No saved Draft snapshot');
        state.draft = structuredClone(state.savedDraft);
        render();
      },
      item,
      snapshot() {
        return {
          draft: structuredClone(state.draft),
          items: structuredClone(state.items),
          saveCount: state.saveCount,
          launchCount: state.launchCount,
        };
      },
    };
    (window as typeof window & { __draftPriceBookHarness: typeof harness }).__draftPriceBookHarness = harness;
    render();
  }, { contractorId: CONTRACTOR_ID });
}

test.describe('FB-024 Draft-first Price Book picker v1', () => {
  test('uses one safe snapshot mapper for blank, zero, and priced items', () => {
    const zero = priceBookItemToEstimateLineDraft(priceBookItem());
    const blank = priceBookItemToEstimateLineDraft(priceBookItem({ id: 'blank', default_unit_price_cents: null, labor_hours: null }));
    const priced = priceBookItemToEstimateLineDraft(priceBookItem({ id: 'priced', default_unit_price_cents: 129900 }));

    expect(zero).toMatchObject({
      line_type: 'material',
      description: 'Copper fitting replacement',
      line_title: 'Copper fitting replacement',
      customer_description: 'Includes one standard copper fitting.',
      quantity: '1',
      unit: 'each',
      unit_price: '0.00',
      labor_hours: '1.25',
    });
    expect(blank.unit_price).toBe('');
    expect(blank.labor_hours).toBe('');
    expect(priced.unit_price).toBe('1299.00');
    expect(zero.id).not.toBe(blank.id);
    expect(JSON.stringify(zero)).not.toContain('Private margin target');
    expect(JSON.stringify(zero)).not.toContain('PRIVATE-SKU');
    expect(JSON.stringify(zero)).not.toContain('csv_import');
    expect(JSON.stringify(zero)).not.toContain('price-book-1');
    for (const excluded of ['contractor_id', 'internal_notes', 'sku', 'source', 'trade', 'category', 'taxable', 'archived_at']) {
      expect(zero).not.toHaveProperty(excluded);
    }
  });

  test('persists the editable snapshot fields without Price Book linkage for Draft-to-Estimate launch', () => {
    const line = priceBookItemToEstimateLineDraft(priceBookItem());
    const draft = createBlankSharedDraftComposerDraft({
      intended_output: 'estimate',
      title: 'Plumbing estimate',
      line_items: [line],
    });
    const prepared = prepareDurableDraftSave({
      form: draft,
      current: null,
      contractorId: CONTRACTOR_ID,
      removedDurableItemIds: [],
    });

    expect(prepared.payload.metadata.intended_output).toBe('estimate');
    expect(prepared.payload.items).toEqual([expect.objectContaining({
      id: null,
      title: 'Copper fitting replacement',
      description: 'Copper fitting replacement',
      customer_description: 'Includes one standard copper fitting.',
      internal_notes: '',
      line_type: 'material',
      quantity: 1,
      unit: 'each',
      unit_price_cents: 0,
      labor_hours: 1.25,
    })]);
    expect(JSON.stringify(prepared.payload)).not.toContain('price-book-1');
    expect(JSON.stringify(prepared.payload)).not.toContain('PRIVATE-SKU');
    expect(JSON.stringify(prepared.payload)).not.toContain('Private margin target');
    expect(JSON.stringify(prepared.payload)).not.toContain('Fittings');
  });

  test('wires the picker only through authorized standard Estimate Draft state without backend actions', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    const composer = readFileSync(resolve(process.cwd(), 'src/features/drafts/ContractorDraftComposer.tsx'), 'utf8');
    const workspace = readFileSync(resolve(process.cwd(), 'src/features/drafts/DurableDraftWorkspace.tsx'), 'utf8');
    const picker = readFileSync(resolve(process.cwd(), 'src/features/price-book/DraftPriceBookPicker.tsx'), 'utf8');
    const combined = `${composer}\n${workspace}\n${picker}`;

    expect(app.match(/priceBookItems=\{contractorPriceBookItems\}/g) ?? []).toHaveLength(2);
    expect(app.match(/canViewPriceBook=\{priceBookAccess\.canView\}/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(composer).toContain('!isChecklistDraft && isEstimateIntent && canViewPriceBook');
    expect(composer).toContain('disabled={interactionDisabled || !canSave}');
    expect(picker).toContain("status: 'active'");
    expect(picker).toContain('addingItemIdRef.current');
    expect(picker).toContain("loadState === 'ready'");
    expect(picker).toContain('w-full');
    expect(picker).toContain('sm:w-auto');
    expect(picker).toContain('durable-draft-price-book-empty');
    expect(picker).toContain('durable-draft-price-book-no-results');
    expect(picker).toContain('durable-draft-price-book-error');
    expect(combined).not.toContain(".from('contractor_price_book_items').insert");
    expect(combined).not.toContain(".from('contractor_price_book_items').update");
    expect(picker).not.toContain('onSave(');
    expect(picker).not.toContain('onLaunch(');
  });

  test('renders collapsed on mobile and searches and filters active, non-archived items', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installComposerHarness(page);
    await expect(page.getByTestId('durable-draft-price-book')).toBeVisible();
    await expect(page.getByTestId('durable-draft-price-book-picker')).toHaveCount(0);
    await page.getByTestId('durable-draft-price-book-toggle').click();
    await expect(page.getByText('Copper fitting replacement')).toBeVisible();
    await expect(page.getByText('Diagnostic labor')).toBeVisible();
    await expect(page.getByText('Archived fee')).toHaveCount(0);

    await page.getByPlaceholder('Search title, description, trade, category, SKU...').fill('diagnostic');
    await expect(page.getByText('Diagnostic labor')).toBeVisible();
    await expect(page.getByText('Copper fitting replacement')).toHaveCount(0);
    await page.getByPlaceholder('Search title, description, trade, category, SKU...').fill('');
    await page.getByLabel('Filter Price Book items').getByLabel('Trade').selectOption('Plumbing');
    await page.getByLabel('Filter Price Book items').getByLabel('Category').selectOption('Repair');
    await expect(page.getByText('Copper fitting replacement')).toBeVisible();
    await expect(page.getByText('Diagnostic labor')).toHaveCount(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('fails closed for idle, loading, and error states and distinguishes empty from no results', async ({ page }) => {
    await installComposerHarness(page);
    for (const state of ['idle', 'loading'] as const) {
      await page.evaluate(value => window.__draftPriceBookHarness.setLoadState(value), state);
      await expect(page.getByTestId('durable-draft-price-book-toggle')).toBeDisabled();
      await expect(page.getByTestId('durable-draft-price-book-picker')).toHaveCount(0);
    }
    await page.evaluate(() => window.__draftPriceBookHarness.setLoadState('error', 'Private Price Book request failed.'));
    await expect(page.getByTestId('durable-draft-price-book-toggle')).toBeDisabled();
    await expect(page.getByTestId('durable-draft-price-book-error')).toContainText('Private Price Book request failed.');

    await page.evaluate(() => {
      window.__draftPriceBookHarness.setItems([]);
      window.__draftPriceBookHarness.setLoadState('ready');
    });
    await page.getByTestId('durable-draft-price-book-toggle').click();
    await expect(page.getByTestId('durable-draft-price-book-empty')).toBeVisible();

    await page.evaluate(() => window.__draftPriceBookHarness.setItems([window.__draftPriceBookHarness.item()]));
    await page.getByPlaceholder('Search title, description, trade, category, SKU...').fill('no match');
    await expect(page.getByTestId('durable-draft-price-book-no-results')).toBeVisible();
  });

  test('stays hidden outside authorized standard Estimate Drafts', async ({ page }) => {
    await installComposerHarness(page);
    await page.evaluate(() => window.__draftPriceBookHarness.setCanSave(false));
    await expect(page.getByTestId('durable-draft-price-book-toggle')).toBeDisabled();
    await page.evaluate(() => window.__draftPriceBookHarness.setCanSave(true));
    await page.evaluate(() => window.__draftPriceBookHarness.setCanView(false));
    await expect(page.getByTestId('durable-draft-price-book')).toHaveCount(0);
    await page.evaluate(() => {
      window.__draftPriceBookHarness.setCanView(true);
      window.__draftPriceBookHarness.setIntent('job');
    });
    await expect(page.getByTestId('durable-draft-price-book')).toHaveCount(0);
    await page.evaluate(() => window.__draftPriceBookHarness.setIntent('invoice'));
    await expect(page.getByTestId('durable-draft-price-book')).toHaveCount(0);
    await page.evaluate(() => {
      window.__draftPriceBookHarness.setIntent('estimate');
      window.__draftPriceBookHarness.setWorkFormat('inspection_checklist');
    });
    await expect(page.getByTestId('durable-draft-price-book')).toHaveCount(0);
  });

  test('guards duplicate actions, does not autosave or launch, and preserves edits after save and reopen', async ({ page }) => {
    await installComposerHarness(page);
    const originalItems = await page.evaluate(() => window.__draftPriceBookHarness.snapshot().items);
    await page.getByTestId('durable-draft-price-book-toggle').click();
    const addButton = page.getByTestId('durable-draft-price-book-add').first();
    await addButton.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });

    let snapshot = await page.evaluate(() => window.__draftPriceBookHarness.snapshot());
    expect((snapshot.draft.line_items as unknown[])).toHaveLength(1);
    expect(snapshot.saveCount).toBe(0);
    expect(snapshot.launchCount).toBe(0);
    expect(snapshot.items).toEqual(originalItems);

    await page.getByLabel('Draft estimate line item 1 description').fill('Edited copper fitting');
    await page.getByLabel('Draft estimate line item 1 quantity').fill('2');
    await page.getByLabel('Draft estimate line item 1 unit price').fill('45.00');
    await page.getByRole('button', { name: 'Save Draft' }).click();
    await page.evaluate(() => window.__draftPriceBookHarness.reopenSaved());

    await expect(page.getByLabel('Draft estimate line item 1 description')).toHaveValue('Edited copper fitting');
    await expect(page.getByLabel('Draft estimate line item 1 quantity')).toHaveValue('2');
    await expect(page.getByLabel('Draft estimate line item 1 unit price')).toHaveValue('45.00');
    snapshot = await page.evaluate(() => window.__draftPriceBookHarness.snapshot());
    expect(snapshot.saveCount).toBe(1);
    expect(snapshot.launchCount).toBe(0);
  });

  test('keeps the legacy estimate picker on the shared mapper', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    expect(app).toContain('priceBookItemToEstimateLineDraft(item)');
    expect(app).not.toContain('function estimateLineDraftFromPriceBookItem');
  });
});
