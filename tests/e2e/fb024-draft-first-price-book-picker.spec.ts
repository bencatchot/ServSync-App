import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ContractorPriceBookItem } from '../../src/types';
import { prepareDurableDraftSave } from '../../src/features/drafts/durableDraftComposerIntegration';
import { createBlankSharedDraftComposerDraft } from '../../src/features/drafts/draftComposerMappings';
import {
  priceBookItemToEstimateLineDraft,
  priceBookStagedQuantityError,
} from '../../src/features/price-book/priceBookEstimateLineSnapshot';
import { workComposerLineTotalCents } from '../../src/features/work-composer/workComposerDrafts';

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
    internal_cost_cents: 875,
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
      internal_cost_cents: 875,
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
    const zero = priceBookItemToEstimateLineDraft(priceBookItem(), '5');
    const blank = priceBookItemToEstimateLineDraft(priceBookItem({ id: 'blank', default_unit_price_cents: null, labor_hours: null }), '3');
    const priced = priceBookItemToEstimateLineDraft(priceBookItem({ id: 'priced', default_unit_price_cents: 3500 }), '4');

    expect(zero).toMatchObject({
      line_type: 'material',
      description: 'Copper fitting replacement',
      line_title: 'Copper fitting replacement',
      customer_description: 'Includes one standard copper fitting.',
      quantity: '5',
      unit: 'each',
      unit_price: '0.00',
      labor_hours: '1.25',
    });
    expect(blank.unit_price).toBe('');
    expect(blank.labor_hours).toBe('');
    expect(blank.quantity).toBe('3');
    expect(priced.unit_price).toBe('35.00');
    expect(priced.quantity).toBe('4');
    expect(workComposerLineTotalCents(priced)).toBe(14000);
    expect(zero.id).not.toBe(blank.id);
    expect(JSON.stringify(zero)).not.toContain('Private margin target');
    expect(JSON.stringify(zero)).not.toContain('PRIVATE-SKU');
    expect(JSON.stringify(zero)).not.toContain('csv_import');
    expect(JSON.stringify(zero)).not.toContain('price-book-1');
    for (const excluded of ['contractor_id', 'internal_notes', 'internal_cost_cents', 'sku', 'source', 'trade', 'category', 'taxable', 'archived_at']) {
      expect(zero).not.toHaveProperty(excluded);
      expect(priced).not.toHaveProperty(excluded);
    }
  });

  test('uses the existing positive finite Draft quantity rule for staging', () => {
    for (const valid of ['1', '4', '0.5', '2.5']) expect(priceBookStagedQuantityError(valid)).toBe('');
    for (const invalid of ['', '0', '-1', 'not-a-number', 'Infinity']) {
      expect(priceBookStagedQuantityError(invalid)).toBe('Enter a quantity greater than zero.');
    }
  });

  test('persists the editable snapshot fields without Price Book linkage for Draft-to-Estimate launch', () => {
    const line = priceBookItemToEstimateLineDraft(priceBookItem(), '2.5');
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
      quantity: 2.5,
      unit: 'each',
      unit_price_cents: 0,
      labor_hours: 1.25,
    })]);
    expect(JSON.stringify(prepared.payload)).not.toContain('price-book-1');
    expect(JSON.stringify(prepared.payload)).not.toContain('PRIVATE-SKU');
    expect(JSON.stringify(prepared.payload)).not.toContain('Private margin target');
    expect(JSON.stringify(prepared.payload)).not.toContain('internal_cost');
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
    expect(picker).toContain('addingSelectionRef.current');
    expect(picker).toContain('current.includes(item.id) ? current : [...current, item.id]');
    expect(composer).toContain('onAddLines={addPriceBookLines}');
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
    expect(picker).not.toContain('localStorage');
    expect(picker).not.toContain('sessionStorage');
  });

  test('renders collapsed on mobile and searches and filters active, non-archived items', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installComposerHarness(page);
    await expect(page.getByTestId('durable-draft-price-book')).toBeVisible();
    await expect(page.getByTestId('durable-draft-price-book-picker')).toHaveCount(0);
    await page.getByTestId('durable-draft-price-book-toggle').click();
    await expect(page.getByTestId('durable-draft-price-book-results').getByText('Copper fitting replacement')).toBeVisible();
    await page.getByLabel('Select Copper fitting replacement').check();
    await expect(page.getByLabel('Staged quantity for Copper fitting replacement')).toHaveValue('1');
    await expect(page.getByText('Diagnostic labor')).toBeVisible();
    await expect(page.getByText('Archived fee')).toHaveCount(0);

    await page.getByPlaceholder('Search title, description, trade, category, SKU...').fill('diagnostic');
    await expect(page.getByText('Diagnostic labor')).toBeVisible();
    await expect(page.getByTestId('durable-draft-price-book-results').getByText('Copper fitting replacement')).toHaveCount(0);
    await expect(page.getByTestId('durable-draft-price-book-staged')).toContainText('Copper fitting replacement');
    await page.getByPlaceholder('Search title, description, trade, category, SKU...').fill('');
    await page.getByLabel('Filter Price Book items').getByLabel('Trade').selectOption('Plumbing');
    await page.getByLabel('Filter Price Book items').getByLabel('Category').selectOption('Repair');
    await expect(page.getByTestId('durable-draft-price-book-results').getByText('Copper fitting replacement')).toBeVisible();
    await expect(page.getByTestId('durable-draft-price-book-results').getByText('Diagnostic labor')).toHaveCount(0);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('stages whole and decimal quantities, keeps repeated snapshots independent, and resets after add', async ({ page }) => {
    await installComposerHarness(page);
    await page.evaluate(() => window.__draftPriceBookHarness.setItems([
      window.__draftPriceBookHarness.item({ default_unit_price_cents: 3500 }),
      window.__draftPriceBookHarness.item({ id: 'blank-price', title: 'Price required item', default_unit_price_cents: null }),
    ]));
    await page.getByTestId('durable-draft-price-book-toggle').click();
    await page.getByPlaceholder('Search title, description, trade, category, SKU...').fill('Copper');
    await page.getByLabel('Select Copper fitting replacement').check();
    const quantity = page.getByLabel('Staged quantity for Copper fitting replacement');
    await expect(quantity).toHaveValue('1');
    await quantity.fill('4');
    await page.getByTestId('durable-draft-price-book-add-selected').click();
    await expect(page.getByLabel('Staged quantity for Copper fitting replacement')).toHaveCount(0);
    await expect(page.getByPlaceholder('Search title, description, trade, category, SKU...')).toHaveValue('Copper');
    await page.waitForTimeout(300);
    await page.getByLabel('Select Copper fitting replacement').check();
    await page.getByLabel('Staged quantity for Copper fitting replacement').fill('2.5');
    await page.getByTestId('durable-draft-price-book-add-selected').click();

    const snapshot = await page.evaluate(() => window.__draftPriceBookHarness.snapshot());
    expect((snapshot.draft.line_items as Array<Record<string, unknown>>).map(line => line.quantity)).toEqual(['4', '2.5']);
    expect((snapshot.draft.line_items as Array<Record<string, unknown>>).map(line => line.unit_price)).toEqual(['35.00', '35.00']);
    expect(snapshot.items).toEqual([
      expect.objectContaining({ id: 'price-book-1', default_unit_price_cents: 3500, internal_cost_cents: 875 }),
      expect.objectContaining({ id: 'blank-price', default_unit_price_cents: null, internal_cost_cents: 875 }),
    ]);
    expect(JSON.stringify(snapshot.draft)).not.toMatch(/internal_cost|PRIVATE-SKU|Private margin target|price-book-1/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('blocks invalid staged quantities without adding a line', async ({ page }) => {
    await installComposerHarness(page);
    await page.getByTestId('durable-draft-price-book-toggle').click();
    await page.getByLabel('Select Copper fitting replacement').check();
    const quantity = page.getByLabel('Staged quantity for Copper fitting replacement');
    for (const invalid of ['', '0', '-1']) {
      await quantity.fill(invalid);
      await page.getByTestId('durable-draft-price-book-add-selected').click();
      await expect(page.getByRole('alert')).toContainText('Enter a quantity greater than zero.');
      const snapshot = await page.evaluate(() => window.__draftPriceBookHarness.snapshot());
      expect(snapshot.draft.line_items).toEqual([]);
    }
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
    await page.getByLabel('Select Copper fitting replacement').check();
    await page.getByLabel('Staged quantity for Copper fitting replacement').fill('3');
    const addButton = page.getByTestId('durable-draft-price-book-add-selected');
    await addButton.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });

    let snapshot = await page.evaluate(() => window.__draftPriceBookHarness.snapshot());
    expect((snapshot.draft.line_items as unknown[])).toHaveLength(1);
    expect(snapshot.saveCount).toBe(0);
    expect(snapshot.launchCount).toBe(0);
    expect(snapshot.items).toEqual(originalItems);

    await page.getByLabel('Draft estimate line item 1 description').fill('Edited copper fitting');
    await page.getByLabel('Draft estimate line item 1 unit price').fill('45.00');
    await page.getByRole('button', { name: 'Save Draft' }).click();
    await page.evaluate(() => window.__draftPriceBookHarness.reopenSaved());

    await expect(page.getByLabel('Draft estimate line item 1 description')).toHaveValue('Edited copper fitting');
    await expect(page.getByLabel('Draft estimate line item 1 quantity')).toHaveValue('3');
    await expect(page.getByLabel('Draft estimate line item 1 unit price')).toHaveValue('45.00');
    snapshot = await page.evaluate(() => window.__draftPriceBookHarness.snapshot());
    expect(snapshot.saveCount).toBe(1);
    expect(snapshot.launchCount).toBe(0);
  });

  test('stages multiple items across search and filters in selection order', async ({ page }) => {
    await installComposerHarness(page);
    await page.evaluate(() => window.__draftPriceBookHarness.setItems([
      window.__draftPriceBookHarness.item({ id: 'filter', title: 'Filter', trade: 'HVAC', category: 'Maintenance', default_unit_price_cents: 2500 }),
      window.__draftPriceBookHarness.item({ id: 'capacitor', title: 'Capacitor', trade: 'HVAC', category: 'Repair', default_unit_price_cents: 7500 }),
      window.__draftPriceBookHarness.item({ id: 'labor', title: 'Diagnostic labor', trade: 'Electrical', category: 'Service', line_type: 'labor', default_unit_price_cents: null }),
    ]));
    await page.getByTestId('durable-draft-price-book-toggle').click();

    const search = page.getByPlaceholder('Search title, description, trade, category, SKU...');
    await search.fill('Filter');
    await page.getByLabel('Select Filter').check();
    await page.getByLabel('Staged quantity for Filter').fill('4');
    await search.fill('Capacitor');
    await page.getByLabel('Select Capacitor').check();
    await page.getByLabel('Staged quantity for Capacitor').fill('2.5');
    await search.fill('Diagnostic');
    await page.getByLabel('Select Diagnostic labor').check();

    await expect(page.getByTestId('durable-draft-price-book-staged-item')).toHaveCount(3);
    await expect(page.getByTestId('durable-draft-price-book-staged')).toContainText('Filter');
    await page.getByLabel('Filter Price Book items').getByLabel('Trade').selectOption('Electrical');
    await expect(page.getByTestId('durable-draft-price-book-staged')).toContainText('Capacitor');
    await page.getByTestId('durable-draft-price-book-add-selected').click();

    const snapshot = await page.evaluate(() => window.__draftPriceBookHarness.snapshot());
    const lines = snapshot.draft.line_items as Array<Record<string, unknown>>;
    expect(lines.map(line => [line.description, line.quantity])).toEqual([
      ['Filter', '4'],
      ['Capacitor', '2.5'],
      ['Diagnostic labor', '1'],
    ]);
    await expect(page.getByTestId('durable-draft-price-book-staged')).toHaveCount(0);
    await page.getByRole('button', { name: 'Save Draft' }).click();
    await page.evaluate(() => window.__draftPriceBookHarness.reopenSaved());
    await expect(page.getByLabel('Draft estimate line item 1 quantity')).toHaveValue('4');
    await expect(page.getByLabel('Draft estimate line item 2 quantity')).toHaveValue('2.5');
    await expect(page.getByLabel('Draft estimate line item 3 quantity')).toHaveValue('1');
    await page.getByRole('button', { name: 'Create Estimate' }).click();
    expect((await page.evaluate(() => window.__draftPriceBookHarness.snapshot())).launchCount).toBe(1);
  });

  test('removes a staged item and blocks the entire group for one invalid quantity', async ({ page }) => {
    await installComposerHarness(page);
    await page.getByTestId('durable-draft-price-book-toggle').click();
    await page.getByLabel('Select Copper fitting replacement').check();
    await page.getByLabel('Select Diagnostic labor').check();
    await page.getByLabel('Staged quantity for Diagnostic labor').fill('0');
    await page.getByTestId('durable-draft-price-book-add-selected').click();
    expect((await page.evaluate(() => window.__draftPriceBookHarness.snapshot())).draft.line_items).toEqual([]);
    await expect(page.getByRole('alert')).toContainText('Enter a quantity greater than zero.');

    await page.getByLabel('Remove Diagnostic labor from selected items').click();
    await page.getByTestId('durable-draft-price-book-add-selected').click();
    const snapshot = await page.evaluate(() => window.__draftPriceBookHarness.snapshot());
    expect(snapshot.draft.line_items).toHaveLength(1);
    expect((snapshot.draft.line_items as Array<Record<string, unknown>>)[0].description).toBe('Copper fitting replacement');
  });

  test('preserves blank, zero, priced, existing-line, and private-field boundaries in one add', async ({ page }) => {
    await installComposerHarness(page);
    await page.evaluate(() => {
      const harness = window.__draftPriceBookHarness;
      harness.setItems([
        harness.item({ id: 'blank', title: 'Blank price', default_unit_price_cents: null }),
        harness.item({ id: 'zero', title: 'Zero price', default_unit_price_cents: 0 }),
        harness.item({ id: 'priced', title: 'Priced item', default_unit_price_cents: 7500 }),
      ]);
    });
    await page.getByRole('button', { name: 'Add estimate line' }).click();
    await page.getByLabel('Draft estimate line item 1 description').fill('Existing manual line');
    await page.getByTestId('durable-draft-price-book-toggle').click();
    for (const title of ['Blank price', 'Zero price', 'Priced item']) await page.getByLabel(`Select ${title}`).check();
    await page.getByTestId('durable-draft-price-book-add-selected').click();

    const snapshot = await page.evaluate(() => window.__draftPriceBookHarness.snapshot());
    const lines = snapshot.draft.line_items as Array<Record<string, unknown>>;
    expect(lines.map(line => line.description)).toEqual(['Existing manual line', 'Blank price', 'Zero price', 'Priced item']);
    expect(lines.slice(1).map(line => line.unit_price)).toEqual(['', '0.00', '75.00']);
    expect(JSON.stringify(lines)).not.toMatch(/internal_cost|margin|profit|PRIVATE-SKU|Private margin target|csv_import|price-book-/);
  });

  test('keeps multi-add usable without horizontal overflow at 390x844', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installComposerHarness(page);
    await page.getByTestId('durable-draft-price-book-toggle').click();
    await page.getByLabel('Select Copper fitting replacement').check();
    await page.getByPlaceholder('Search title, description, trade, category, SKU...').fill('Diagnostic');
    await page.getByLabel('Select Diagnostic labor').check();
    await page.getByLabel('Staged quantity for Diagnostic labor').fill('2');
    await page.getByLabel('Remove Copper fitting replacement from selected items').click();
    await page.getByTestId('durable-draft-price-book-add-selected').click();
    expect((await page.evaluate(() => window.__draftPriceBookHarness.snapshot())).draft.line_items).toHaveLength(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('keeps the legacy estimate picker on the shared mapper', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    expect(app).toContain('priceBookItemToEstimateLineDraft(item)');
    expect(app).not.toContain('function estimateLineDraftFromPriceBookItem');
  });
});
