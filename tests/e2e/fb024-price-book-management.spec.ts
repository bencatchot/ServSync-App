import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ContractorPriceBookItem } from '../../src/types';
import {
  filterPriceBookItems,
  priceBookFilterOptions,
  priceBookPage,
} from '../../src/features/price-book/priceBookView';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function item(index: number, overrides: Partial<ContractorPriceBookItem> = {}): ContractorPriceBookItem {
  return {
    id: `item-${index}`,
    contractor_id: 'contractor-1',
    title: `Item ${String(index).padStart(3, '0')}`,
    customer_description: '',
    internal_notes: '',
    trade: index % 2 === 0 ? 'HVAC' : 'Plumbing',
    category: index % 3 === 0 ? 'Service' : 'Repair',
    subcategory: index % 2 === 0 ? 'Diagnostics' : null,
    line_type: index % 2 === 0 ? 'labor' : 'material',
    unit: 'each',
    default_unit_price_cents: index * 100,
    taxable: true,
    labor_hours: null,
    sku: `SKU-${index}`,
    source: 'manual',
    active: true,
    archived_at: null,
    created_at: '2026-08-01T12:00:00.000Z',
    updated_at: '2026-08-01T12:00:00.000Z',
    ...overrides,
  };
}

test.describe('FB-024 Price Book management cleanup', () => {
  test('filters existing fields without changing stored records', () => {
    const items = [
      item(1, { title: 'Water heater service', trade: 'Plumbing', category: 'Service', line_type: 'labor' }),
      item(2, { title: 'Copper pipe', trade: 'Plumbing', category: 'Material', line_type: 'material' }),
      item(3, { title: 'Archived inspection', trade: 'HVAC', active: false, archived_at: '2026-08-01T13:00:00.000Z', line_type: 'other' }),
    ];

    expect(filterPriceBookItems(items, { status: 'active', search: 'water', lineType: 'all', trade: '', category: '', subcategory: '' }).map(row => row.id)).toEqual(['item-1']);
    expect(filterPriceBookItems(items, { status: 'active', search: '', lineType: 'material', trade: 'Plumbing', category: 'Material', subcategory: '' }).map(row => row.id)).toEqual(['item-2']);
    expect(filterPriceBookItems(items, { status: 'archived', search: '', lineType: 'all', trade: '', category: '', subcategory: '' }).map(row => row.id)).toEqual(['item-3']);
    expect(priceBookFilterOptions(items, 'trade')).toEqual(['HVAC', 'Plumbing']);
    expect(items[0].title).toBe('Water heater service');
  });

  test('limits rendering to 25 rows and pages normal and busy Price Books deterministically', () => {
    expect(priceBookPage([], 1)).toMatchObject({ items: [], page: 1, pageCount: 1, firstResult: 0, lastResult: 0 });
    expect(priceBookPage(Array.from({ length: 10 }, (_, index) => item(index)), 1)).toMatchObject({ page: 1, pageCount: 1, firstResult: 1, lastResult: 10 });

    const busy = Array.from({ length: 100 }, (_, index) => item(index));
    expect(priceBookPage(busy, 1)).toMatchObject({ page: 1, pageCount: 4, firstResult: 1, lastResult: 25 });
    expect(priceBookPage(busy, 4)).toMatchObject({ page: 4, pageCount: 4, firstResult: 76, lastResult: 100 });
    expect(priceBookPage(busy, 99)).toMatchObject({ page: 4, pageCount: 4, firstResult: 76, lastResult: 100 });
  });

  test('uses Price Book everywhere visible while preserving the internal route identifier', () => {
    const app = sourceFile('src/App.tsx');
    const dashboard = sourceFile('src/features/work/ContractorWorkDashboard.tsx');
    const workspace = sourceFile('src/features/price-book/ContractorPriceBookWorkspace.tsx');

    expect(app).toContain("contractorJobsView === 'custom_pricing'");
    expect(app).not.toContain('<Card title="Price Book"');
    expect(app).toContain('<ContractorPriceBookWorkspace');
    expect(app).not.toContain('Custom Pricing');
    expect(dashboard).toContain('label="Price Book"');
    expect(dashboard).not.toContain('Custom Pricing');
    expect(workspace).toContain('Search Price Book');
    expect(workspace).not.toContain('Custom Pricing');
  });

  test('keeps search and compact results primary while forms and CSV tools use disclosure', () => {
    const workspace = sourceFile('src/features/price-book/ContractorPriceBookWorkspace.tsx');
    const searchIndex = workspace.indexOf('Search Price Book');
    const formIndex = workspace.indexOf('data-testid="price-book-item-form"');
    const csvIndex = workspace.indexOf('data-testid="price-book-import-tools"');

    expect(searchIndex).toBeGreaterThanOrEqual(0);
    expect(formIndex).toBeGreaterThan(searchIndex);
    expect(csvIndex).toBeGreaterThan(formIndex);
    expect(workspace).toContain('Advanced Options');
    expect(workspace).toContain('Only the item name is required.');
    expect(workspace).toContain('data-testid="price-book-item-list"');
    expect(workspace).toContain('min-h-[44px]');
    expect(workspace).toContain("{ value: 'other', label: 'Service' }");
    expect(workspace).not.toContain('Service / Other');
    expect(workspace).toContain('Active (');
    expect(workspace).toContain('Archived (');
  });

  test('distinguishes loading, load failure, true empty, and filtered no-results states', () => {
    const app = sourceFile('src/App.tsx');
    const workspace = sourceFile('src/features/price-book/ContractorPriceBookWorkspace.tsx');

    expect(app).toContain("setContractorPriceBookLoadState('loading')");
    expect(app).toContain("setContractorPriceBookLoadState('ready')");
    expect(app).toContain("setContractorPriceBookLoadState('error')");
    expect(workspace).toContain('data-testid="price-book-loading"');
    expect(workspace).toContain('data-testid="price-book-load-error"');
    expect(workspace).toContain('data-testid="price-book-empty-state"');
    expect(workspace).toContain('Your Price Book is empty.');
    expect(workspace).toContain('match these filters.');
    expect(workspace).toContain('Try again');
  });

  test('aligns owner, admin, and office management UI with the existing SQL authority', () => {
    const app = sourceFile('src/App.tsx');
    const sql = sourceFile('servsync-contractor-saved-estimate-charges.sql');

    const access = sourceFile('src/features/price-book/priceBookAccess.ts');

    expect(access).toContain("activeMember.role === 'admin' || activeMember.role === 'office'");
    expect(app).toContain('const priceBookAccess = contractorPriceBookAccess(contractor, teamAccess, profile.id);');
    expect(app).toContain('const canManageEstimateSettings = priceBookAccess.canManage;');
    expect(sql).toContain("tm.role in ('admin', 'office')");
  });

  test('keeps management actions fail-closed until Price Book data loads successfully', () => {
    const app = sourceFile('src/App.tsx');
    const workspace = sourceFile('src/features/price-book/ContractorPriceBookWorkspace.tsx');

    expect(workspace).toContain("const canMutate = contractorSaved && canManage && loadState === 'ready';");
    expect(workspace).toContain('{canMutate ? (');
    expect(workspace).toContain('{canMutate && formOpen ? (');
    expect(workspace).toContain('{canMutate && csvTools ? (');
    expect(app).toContain("contractorPriceBookLoadState !== 'ready'");
  });
});
