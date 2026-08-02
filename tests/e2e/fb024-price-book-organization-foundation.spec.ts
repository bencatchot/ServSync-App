import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ContractorPriceBookItem } from '../../src/types';
import { filterPriceBookItems, priceBookFilterOptions } from '../../src/features/price-book/priceBookView';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function item(index: number, overrides: Partial<ContractorPriceBookItem> = {}): ContractorPriceBookItem {
  return {
    id: `item-${index}`,
    contractor_id: 'contractor-1',
    title: `Organization item ${String(index).padStart(2, '0')}`,
    customer_description: 'Customer-safe detail',
    internal_notes: 'Private note',
    trade: index % 2 === 0 ? 'HVAC' : 'Plumbing',
    category: index % 3 === 0 ? 'Service' : 'Repair',
    subcategory: index % 2 === 0 ? 'Diagnostics' : null,
    line_type: index % 2 === 0 ? 'labor' : 'material',
    unit: 'each',
    default_unit_price_cents: index === 0 ? null : index * 100,
    taxable: true,
    labor_hours: null,
    sku: `ORG-${index}`,
    source: 'manual',
    active: true,
    archived_at: null,
    created_at: '2026-08-02T12:00:00.000Z',
    updated_at: '2026-08-02T12:00:00.000Z',
    ...overrides,
  };
}

async function installManagementHarness(page: Page, count = 30) {
  await page.goto('/');
  await page.evaluate(async ({ itemCount }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const reactModule = await dynamicImport('/node_modules/.vite/deps/react.js');
    const reactDomModule = await dynamicImport('/node_modules/.vite/deps/react-dom_client.js');
    const workspaceModule = await dynamicImport('/src/features/price-book/ContractorPriceBookWorkspace.tsx');
    const React = reactModule.default as {
      createElement: (...args: unknown[]) => unknown;
    };
    const createRoot = (reactDomModule.default as { createRoot: (element: HTMLElement) => { render: (node: unknown) => void } }).createRoot;
    const Workspace = workspaceModule.ContractorPriceBookWorkspace as (...args: unknown[]) => unknown;
    const buildItem = (index: number) => ({
      id: `item-${index}`,
      contractor_id: 'contractor-1',
      title: `Organization item ${String(index).padStart(2, '0')}`,
      customer_description: 'Customer-safe detail',
      internal_notes: 'Private note',
      trade: index % 2 === 0 ? 'HVAC' : 'Plumbing',
      category: index % 3 === 0 ? 'Service' : 'Repair',
      subcategory: index % 2 === 0 ? 'Diagnostics' : null,
      line_type: index % 2 === 0 ? 'labor' : 'material',
      unit: 'each',
      default_unit_price_cents: index === 0 ? null : index * 100,
      taxable: true,
      labor_hours: null,
      sku: `ORG-${index}`,
      source: 'manual',
      active: true,
      archived_at: null,
      created_at: '2026-08-02T12:00:00.000Z',
      updated_at: '2026-08-02T12:00:00.000Z',
    });

    let items = Array.from({ length: itemCount }, (_, index) => buildItem(index));
    const blankDraft = {
      title: '', customer_description: '', internal_notes: '', trade: '', category: '', subcategory: '',
      line_type: 'material', unit: 'each', default_unit_price: '', taxable: true, labor_hours: '', sku: '', active: true,
    };

    document.body.innerHTML = '<main id="price-book-organization-root"></main>';
    const root = createRoot(document.getElementById('price-book-organization-root') as HTMLElement);
    const render = () => {
      (window as typeof window & { __priceBookHarnessItems?: typeof items }).__priceBookHarnessItems = items;
      root.render(React.createElement(Workspace, {
        items,
        contractorSaved: true,
        canManage: true,
        loadState: 'ready',
        loadError: '',
        draft: blankDraft,
        setDraft: () => undefined,
        formOpen: false,
        editingItemId: null,
        savingItem: false,
        togglingItemId: null,
        onBack: () => undefined,
        onRetry: () => undefined,
        onOpenAddForm: () => undefined,
        onCancelForm: () => undefined,
        onSave: () => undefined,
        onEdit: () => undefined,
        onToggleActive: () => undefined,
        onBulkUpdate: async (ids: string[], changes: Record<string, unknown>) => {
          await new Promise(resolveDelay => window.setTimeout(resolveDelay, 75));
          items = items.map(row => ids.includes(row.id) ? { ...row, ...changes } : row);
          render();
          return true;
        },
      }));
    };
    render();
  }, { itemCount: count });
}

test.describe('FB-024 Price Book Organization Foundation v1', () => {
  test('migration is additive, tenant-indexed, and grants only the new mutation column', () => {
    const sql = sourceFile('servsync-price-book-organization-foundation.sql');

    expect(sql).toMatch(/alter table public\.contractor_price_book_items\s+add column if not exists subcategory text;/i);
    expect(sql).toMatch(/contractor_price_book_items_organization_idx[\s\S]*contractor_id, trade, category, subcategory/i);
    expect(sql).toMatch(/revoke insert \(subcategory\), update \(subcategory\)[\s\S]*from public/i);
    expect(sql).toMatch(/revoke insert \(subcategory\), update \(subcategory\)[\s\S]*from anon/i);
    expect(sql).toMatch(/grant insert \(subcategory\), update \(subcategory\)[\s\S]*to authenticated/i);
    expect(sql).not.toMatch(/\bdefault\b|\bnot null\b/i);
    expect(sql).not.toMatch(/\n\s*(update|delete from|insert into|truncate|drop table)\s+public\./i);
    expect(sql).not.toMatch(/uqgtheclhxqlnjpfmheq|zpzdkoaubyjtsomccxya|bdytwgejqnlblhrnqxkp/i);
    expect(sql).not.toMatch(/create\s+(or replace\s+)?function|create policy|alter table[\s\S]*disable row level security/i);
  });

  test('filters the provider-neutral hierarchy and preserves blank subcategories', () => {
    const items = [
      item(1, { trade: 'Plumbing', category: 'Repair', subcategory: 'Fixtures' }),
      item(2, { trade: 'Plumbing', category: 'Repair', subcategory: null }),
      item(3, { trade: 'HVAC', category: 'Service', subcategory: 'Diagnostics' }),
    ];

    expect(priceBookFilterOptions(items, 'subcategory')).toEqual(['Diagnostics', 'Fixtures']);
    expect(filterPriceBookItems(items, {
      status: 'active', search: '', lineType: 'all', trade: 'Plumbing', category: 'Repair', subcategory: 'Fixtures',
    }).map(row => row.id)).toEqual(['item-1']);
    expect(filterPriceBookItems(items, {
      status: 'active', search: 'diagnostics', lineType: 'all', trade: '', category: '', subcategory: '',
    }).map(row => row.id)).toEqual(['item-3']);
    expect(items[1].subcategory).toBeNull();
  });

  test('keeps bulk updates authorized, current-page scoped, and free of delete paths', () => {
    const app = sourceFile('src/App.tsx');
    const workspace = sourceFile('src/features/price-book/ContractorPriceBookWorkspace.tsx');
    const handler = app.slice(app.indexOf('const bulkUpdateContractorPriceBookItems'), app.indexOf('const resetServiceAgreementTemplateDraft'));

    expect(workspace).toContain('Selection is current-page only and clears when the view changes.');
    expect(workspace).toContain('[items, status, search, lineType, trade, category, subcategory, page]');
    expect(workspace).toContain("'trade' | 'category' | 'subcategory' | 'line_type' | 'archive' | 'restore'");
    expect(workspace).toContain('window.confirm');
    expect(workspace).toContain('applyingBulkAction');
    expect(workspace).toContain("bulkAction === 'subcategory' && !normalizedValue ? null : normalizedValue");
    expect(handler).toContain('.eq(\'contractor_id\', contractor.id)');
    expect(handler).toContain(".in('id', uniqueIds)");
    expect(handler).toContain(".select('id')");
    expect(handler).toContain('updatedIds.size !== uniqueIds.length');
    expect(handler).not.toContain('.delete(');
  });

  test('adds generic CSV subcategory mapping without changing add-only import boundaries', () => {
    const app = sourceFile('src/App.tsx');
    const csvStart = app.indexOf('const CONTRACTOR_PRICE_BOOK_CSV_FIELDS');
    const csvEnd = app.indexOf('function savedEstimateChargeLineDescription');
    const csv = app.slice(csvStart, csvEnd);
    const importer = app.slice(app.indexOf('const importContractorPriceBookCsvRows'), app.indexOf('const addSavedChargeToEstimateDraft'));

    expect(csv).toContain("{ key: 'subcategory', label: 'Subcategory'");
    expect(csv).toContain("subcategory: ['subcategory', 'sub_category'");
    expect(csv).toContain("subcategory: contractorPriceBookCsvValue(row, mapping, 'subcategory') || null");
    expect(csv).toContain('title,description,notes,trade,category,subcategory,line_type');
    expect(importer).toContain(".from('contractor_price_book_items').insert(payloads)");
    expect(importer).not.toMatch(/\.upsert\(|\.update\(|\.delete\(/);
    expect(app).toContain('CONTRACTOR_PRICE_BOOK_CSV_MAX_ROWS = 500');
    expect(csv).not.toMatch(/Price Book Ninjas|Housecall Pro|Jobber|ServiceTitan/i);
  });

  test('does not propagate organization metadata into Draft or estimate snapshots', () => {
    const mapper = sourceFile('src/features/price-book/priceBookEstimateLineSnapshot.ts');
    for (const privateField of ['item.trade', 'item.category', 'item.subcategory', 'item.internal_notes', 'item.sku', 'item.source', 'item.taxable', 'item.id']) {
      expect(mapper).not.toContain(privateField);
    }
    expect(mapper).toContain("quantity: '1'");
    expect(mapper).toContain('item.default_unit_price_cents');
    expect(mapper).toContain('item.labor_hours');
  });

  test('renders responsive hierarchy controls and applies a current-page-only bulk change', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await installManagementHarness(page);
    await expect(page.getByTestId('price-book-item-row')).toHaveCount(25);
    await expect(page.getByLabel('Trade').first()).toBeVisible();
    await expect(page.getByLabel('Category').first()).toBeVisible();
    await expect(page.getByLabel('Subcategory').first()).toBeVisible();

    await page.getByRole('checkbox', { name: 'Select Organization item 00' }).check();
    await expect(page.getByText('1 selected. Selection is current-page only and clears when the view changes.')).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('0 selected. Selection is current-page only and clears when the view changes.')).toBeVisible();
    await page.getByRole('button', { name: 'Previous' }).click();

    await page.getByRole('checkbox', { name: /Select this page/ }).check();
    await expect(page.getByText('25 selected. Selection is current-page only and clears when the view changes.')).toBeVisible();
    await page.getByLabel('Bulk action').selectOption('subcategory');
    await page.getByLabel('New subcategory').fill('Bulk organized');
    page.once('dialog', dialog => void dialog.accept());
    await page.getByRole('button', { name: 'Apply to 25' }).click();
    await expect(page.getByText('0 selected. Selection is current-page only and clears when the view changes.')).toBeVisible();

    const changedCounts = await page.evaluate(() => {
      const rows = (window as typeof window & { __priceBookHarnessItems?: Array<{ subcategory: string | null }> }).__priceBookHarnessItems || [];
      return {
        changed: rows.filter(row => row.subcategory === 'Bulk organized').length,
        unchanged: rows.filter(row => row.subcategory !== 'Bulk organized').length,
      };
    });
    expect(changedCounts).toEqual({ changed: 25, unchanged: 5 });

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('contractor-price-book-workspace')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
