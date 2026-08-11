import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { derivePriceBookMargin, formatGrossMarginPercent, formatSignedMoney } from '../../src/features/price-book/priceBookMargin';
import { priceBookItemToEstimateLineDraft } from '../../src/features/price-book/priceBookEstimateLineSnapshot';
import type { ContractorPriceBookItem } from '../../src/types';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceFile = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

function item(id: string, title: string, price: number | null, cost?: number | null): ContractorPriceBookItem {
  return {
    id,
    contractor_id: 'contractor-1',
    title,
    customer_description: 'Customer-safe description',
    internal_notes: 'Private note',
    trade: 'HVAC',
    category: 'Service',
    subcategory: null,
    line_type: 'labor',
    unit: 'visit',
    default_unit_price_cents: price,
    taxable: true,
    labor_hours: 1,
    sku: null,
    source: 'manual',
    active: true,
    archived_at: null,
    created_at: '2026-08-11T00:00:00.000Z',
    updated_at: '2026-08-11T00:00:00.000Z',
    ...(cost === undefined ? {} : { internal_cost_cents: cost }),
  };
}

async function renderWorkspace(page: Page, canManage: boolean) {
  await page.goto('/');
  await page.evaluate(async ({ manager }) => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const reactModule = await dynamicImport('/node_modules/.vite/deps/react.js');
    const React = reactModule.default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as {
      createRoot: (element: HTMLElement) => { render: (node: unknown) => void };
    }).createRoot;
    const { ContractorPriceBookWorkspace } = await dynamicImport('/src/features/price-book/ContractorPriceBookWorkspace.tsx');
    const items = [
      { id: 'item-1', contractor_id: 'contractor-1', title: 'Standard service', customer_description: '', internal_notes: '', trade: 'HVAC', category: 'Service', subcategory: null, line_type: 'labor', unit: 'visit', default_unit_price_cents: 10000, internal_cost_cents: 6000, taxable: true, labor_hours: 1, sku: null, source: 'manual', active: true, archived_at: null, created_at: '2026-08-11T00:00:00.000Z', updated_at: '2026-08-11T00:00:00.000Z' },
      { id: 'item-2', contractor_id: 'contractor-1', title: 'Below cost', customer_description: '', internal_notes: '', trade: 'HVAC', category: 'Service', subcategory: null, line_type: 'material', unit: 'each', default_unit_price_cents: 10000, internal_cost_cents: 12000, taxable: true, labor_hours: null, sku: null, source: 'manual', active: true, archived_at: null, created_at: '2026-08-11T00:00:00.000Z', updated_at: '2026-08-11T00:00:00.000Z' },
      { id: 'item-3', contractor_id: 'contractor-1', title: 'Zero price', customer_description: '', internal_notes: '', trade: '', category: '', subcategory: null, line_type: 'fee', unit: 'each', default_unit_price_cents: 0, internal_cost_cents: 2500, taxable: true, labor_hours: null, sku: null, source: 'manual', active: true, archived_at: null, created_at: '2026-08-11T00:00:00.000Z', updated_at: '2026-08-11T00:00:00.000Z' },
      { id: 'item-4', contractor_id: 'contractor-1', title: 'Unknown cost', customer_description: '', internal_notes: '', trade: '', category: '', subcategory: null, line_type: 'other', unit: 'each', default_unit_price_cents: 5000, internal_cost_cents: null, taxable: true, labor_hours: null, sku: null, source: 'manual', active: true, archived_at: null, created_at: '2026-08-11T00:00:00.000Z', updated_at: '2026-08-11T00:00:00.000Z' },
    ];
    const blankDraft = { title: '', customer_description: '', internal_notes: '', trade: '', category: '', subcategory: '', line_type: 'material', unit: 'each', default_unit_price: '', internal_cost: '', taxable: true, labor_hours: '', sku: '', active: true };
    document.body.innerHTML = '<main id="root"></main>';
    createRoot(document.getElementById('root') as HTMLElement).render(React.createElement(ContractorPriceBookWorkspace, {
      items, contractorSaved: true, canManage: manager, loadState: 'ready', loadError: '', draft: blankDraft,
      setDraft: () => undefined, formOpen: manager, editingItemId: null, savingItem: false, togglingItemId: null,
      onBack: () => {}, onRetry: () => {}, onOpenAddForm: () => {}, onCancelForm: () => {}, onSave: () => {},
      onEdit: () => {}, onToggleActive: () => {}, onBulkUpdate: async () => true,
    }));
  }, { manager: canManage });
}

test.describe('FB-024 Price Book Cost and Margin Foundation v1', () => {
  test('derives gross profit and margin without fake missing or zero-price percentages', () => {
    expect(derivePriceBookMargin(10000, 6000)).toEqual({ grossProfitCents: 4000, grossMarginPercent: 40 });
    expect(derivePriceBookMargin(10000, 12000)).toEqual({ grossProfitCents: -2000, grossMarginPercent: -20 });
    expect(derivePriceBookMargin(0, 2500)).toEqual({ grossProfitCents: -2500, grossMarginPercent: null });
    expect(derivePriceBookMargin(10000, null)).toBeNull();
    expect(formatGrossMarginPercent(null)).toBe('Margin unavailable');
    expect(formatSignedMoney(-2000)).toBe('-$20.00');
  });

  test('keeps cost out of the customer-safe Draft snapshot', () => {
    const source = item('item-1', 'Costed service', 10000, 6000);
    const snapshot = priceBookItemToEstimateLineDraft(source);
    expect(snapshot).toMatchObject({ description: 'Costed service', unit_price: '100.00' });
    expect(JSON.stringify(snapshot)).not.toMatch(/internal_cost|gross_profit|gross_margin|margin/i);
  });

  test('uses private companion storage and controlled manager RPCs', () => {
    const migration = sourceFile('servsync-price-book-cost-margin-foundation.sql');
    expect(migration).toContain('contractor_price_book_item_costs');
    expect(migration).toContain('force row level security');
    expect(migration).toMatch(/revoke all privileges on table public\.contractor_price_book_item_costs from public, anon, authenticated/i);
    expect(migration).toContain('servsync_list_price_book_internal_costs');
    expect(migration).toContain('servsync_save_price_book_item_with_cost');
    expect(migration).not.toMatch(/alter table public\.contractor_price_book_items[\s\S]*internal_cost/i);
  });

  test('keeps cost absent from customer, document, and request-free source contracts', () => {
    const protectedPaths = [
      'src/features/price-book/priceBookEstimateLineSnapshot.ts',
      'src/utils/pdfDocuments.ts',
      'src/features/invoices/requestFreeInvoiceDelivery.ts',
      'src/features/estimates/requestFreeEstimateDelivery.ts',
      'api/request-free-local-invoice-delivery.ts',
      'api/request-free-local-estimate-delivery.ts',
    ];
    for (const relativePath of protectedPaths) {
      expect(sourceFile(relativePath), `${relativePath} must remain cost-free`).not.toMatch(/internal_cost_cents|gross_profit|gross_margin/i);
    }
  });

  test('shows manager cost and margin states without division artifacts on desktop and mobile', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await renderWorkspace(page, true);
    await expect(page.getByText('Cost $60.00 · $40.00 profit · 40% margin')).toBeVisible();
    await expect(page.getByText('Cost $120.00 · -$20.00 profit · -20% margin')).toBeVisible();
    await expect(page.getByText('Cost $25.00 · -$25.00 profit · Margin unavailable')).toBeVisible();
    await expect(page.getByText('Cost not set')).toBeVisible();
    await expect(page.getByLabel('Internal cost')).toBeVisible();
    expect(await page.locator('body').textContent()).not.toMatch(/Infinity|NaN/);

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('does not render private cost or margin for a read-only contractor role', async ({ page }) => {
    await renderWorkspace(page, false);
    await expect(page.getByText('You can view Price Book items, but only the contractor owner, admin, or office role can change them.')).toBeVisible();
    await expect(page.getByTestId('price-book-margin-summary')).toHaveCount(0);
    await expect(page.getByLabel('Internal cost')).toHaveCount(0);
    expect(await page.locator('body').textContent()).not.toContain('Cost $60.00');
  });
});
