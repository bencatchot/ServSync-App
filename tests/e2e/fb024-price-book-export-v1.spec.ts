import { expect, test, type Page } from '@playwright/test';
import readExcelFile from 'read-excel-file/node';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ContractorPriceBookItem } from '../../src/types';
import {
  autoMapPriceBookCsvHeaders,
  buildPriceBookImportRows,
  interpretPriceBookImport,
  parsePriceBookCsv,
  priceBookCsvRowsFromParsed,
} from '../../src/features/price-book/priceBookCsvReconciliation';
import {
  PRICE_BOOK_EXPORT_HEADERS,
  PRICE_BOOK_EXPORT_MAX_ITEMS,
  PRICE_BOOK_EXPORT_WORKSHEET_NAME,
  escapePriceBookCsvFormula,
  priceBookExportFilename,
  priceBookExportRows,
  priceBookItemsForExport,
  serializePriceBookCsv,
} from '../../src/features/price-book/priceBookExport';
import { contractorPriceBookAccess } from '../../src/features/price-book/priceBookAccess';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function item(index: number, overrides: Partial<ContractorPriceBookItem> = {}): ContractorPriceBookItem {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    contractor_id: 'contractor-private-id',
    title: `HVAC item ${String(index).padStart(3, '0')}`,
    customer_description: `Customer description ${index}`,
    internal_notes: `private note ${index}`,
    trade: 'HVAC',
    category: index % 2 ? 'Repair' : 'Maintenance',
    subcategory: index % 3 ? 'Cooling' : null,
    line_type: (['other', 'labor', 'material', 'fee'] as const)[index % 4],
    unit: index % 2 ? 'each' : null,
    default_unit_price_cents: index % 5 === 0 ? null : index === 1 ? 0 : (7500 + index),
    taxable: index % 2 === 0,
    labor_hours: index % 4 === 0 ? null : Number((index / 10).toFixed(2)),
    sku: `HVAC-${String(index).padStart(3, '0')}`,
    source: 'private-import-source',
    active: index % 7 !== 0,
    archived_at: index % 7 === 0 ? '2026-08-12T12:00:00.000Z' : null,
    created_at: '2026-08-12T12:00:00.000Z',
    updated_at: '2026-08-12T12:00:00.000Z',
    internal_cost_cents: 1234,
    ...overrides,
  };
}

function importRequestsFromCsv(csv: string) {
  const tabular = priceBookCsvRowsFromParsed(parsePriceBookCsv(csv));
  const interpretation = interpretPriceBookImport(tabular.headers, tabular.rows);
  return {
    headers: tabular.headers,
    interpretation,
    requests: buildPriceBookImportRows(tabular.rows, interpretation.mapping),
  };
}

async function xlsxBytesInBrowser(page: Page, items: ContractorPriceBookItem[]) {
  await page.goto('/');
  return page.evaluate(async exportItems => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const module = await dynamicImport('/src/features/price-book/priceBookExport.ts');
    const createBlob = module.createPriceBookXlsxBlob as (value: unknown[]) => Promise<Blob>;
    return Array.from(new Uint8Array(await (await createBlob(exportItems)).arrayBuffer()));
  }, items);
}

async function installExportHarness(page: Page, items: ContractorPriceBookItem[]) {
  await page.goto('/');
  await page.evaluate(async exportItems => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const React = (await dynamicImport('/node_modules/.vite/deps/react.js')).default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as {
      createRoot: (element: HTMLElement) => { render: (node: unknown) => void };
    }).createRoot;
    const { PriceBookExportPanel } = await dynamicImport('/src/features/price-book/PriceBookExportPanel.tsx');
    const state = { loads: 0, downloads: [] as string[], fail: false };
    (window as typeof window & { __priceBookExportHarness?: typeof state }).__priceBookExportHarness = state;
    URL.createObjectURL = () => 'blob:price-book-export';
    URL.revokeObjectURL = () => undefined;
    HTMLAnchorElement.prototype.click = function click() { state.downloads.push(this.download); };
    document.body.innerHTML = '<main id="price-book-export-root"></main>';
    createRoot(document.getElementById('price-book-export-root') as HTMLElement).render(React.createElement(
      PriceBookExportPanel as (...args: unknown[]) => unknown,
      {
        loadedItems: exportItems,
        loadAllItems: async () => {
          state.loads += 1;
          if (state.fail) throw new Error('Complete catalog could not be verified.');
          return exportItems;
        },
      },
    ));
  }, items);
}

test.describe('FB-024 Price Book Export v1', () => {
  test('serializes a human-readable CSV contract with safe values and no private fields', () => {
    const csv = serializePriceBookCsv([
      item(1, { title: 'Service, call', customer_description: 'Line one\nLine "two"', default_unit_price_cents: 0, line_type: 'other' }),
      item(2, { title: '=HYPERLINK("https://example.invalid")', sku: '+SUM(A1:A2)', customer_description: '@external', trade: '-1+2', default_unit_price_cents: null }),
      item(3, { title: 'Crème brûlée tune-up', line_type: 'labor' }),
      item(4, { line_type: 'material' }),
      item(5, { line_type: 'fee' }),
    ]);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(parsePriceBookCsv(csv)[0]).toEqual([...PRICE_BOOK_EXPORT_HEADERS]);
    expect(csv).toContain('"Service, call"');
    expect(csv).toContain('"Line one\nLine ""two"""');
    expect(csv).toContain('\'=');
    expect(csv).toContain('\'+SUM');
    expect(csv).toContain('\'@external');
    expect(csv).toContain('\'-1+2');
    expect(csv).toContain('Crème brûlée tune-up');
    expect(csv).toContain(',Service,');
    expect(csv).toContain(',Labor,');
    expect(csv).toContain(',Material,');
    expect(csv).toContain(',Fee,');
    expect(csv).not.toContain('private note');
    expect(csv).not.toContain('contractor-private-id');
    expect(csv).not.toContain('private-import-source');
    expect(csv).not.toContain('1234');

    const rows = priceBookExportRows([item(1, { default_unit_price_cents: 0 }), item(2, { default_unit_price_cents: null })]);
    expect(rows.map(row => row.defaultPrice)).toEqual([0, null]);
    expect(escapePriceBookCsvFormula('normal')).toBe('normal');
    expect(escapePriceBookCsvFormula('-danger')).toBe("'-danger");
  });

  test('auto-maps every exported header and reconstructs all portable fields', () => {
    const original = item(11, { line_type: 'other', default_unit_price_cents: 3550, taxable: false, labor_hours: 1.25 });
    const result = importRequestsFromCsv(serializePriceBookCsv([original]));
    expect(result.interpretation.ignoredHeaders).toEqual([]);
    expect(result.interpretation.mapping).toMatchObject({
      external_item_id: 'ServSync Item Reference',
      sku: 'SKU / Code',
      title: 'Title',
      customer_description: 'Customer Description',
      default_unit_price: 'Default Price',
      line_type: 'Item Type',
      active: 'Active',
    });
    expect(result.requests).toHaveLength(1);
    expect(result.requests[0]).toMatchObject({
      externalItemId: `servsync-item:${original.id}`,
      errors: [],
      values: {
        title: original.title,
        customer_description: original.customer_description,
        trade: original.trade,
        category: original.category,
        subcategory: original.subcategory,
        line_type: 'other',
        unit: original.unit,
        default_unit_price_cents: 3550,
        taxable: false,
        labor_hours: 1.25,
        sku: original.sku,
        active: true,
      },
    });
    expect(result.requests[0].requestRow.values).not.toHaveProperty('internal_notes');
  });

  test('round-trips the 150-item synthetic HVAC catalog through CSV without remapping', () => {
    const catalog = Array.from({ length: 150 }, (_, index) => item(index + 1));
    const result = importRequestsFromCsv(serializePriceBookCsv(catalog));
    expect(result.requests).toHaveLength(150);
    expect(result.requests.every(row => row.errors.length === 0)).toBe(true);
    expect(result.interpretation.ignoredHeaders).toEqual([]);
    expect(new Set(result.requests.map(row => row.externalItemId)).size).toBe(150);
    expect(result.requests.map(row => row.values.title)).toEqual(catalog.map(row => row.title));
    expect(result.requests.map(row => row.values.default_unit_price_cents)).toEqual(catalog.map(row => row.default_unit_price_cents));
    expect(result.requests.map(row => row.values.active)).toEqual(catalog.map(row => row.active && !row.archived_at));
  });

  test('writes one visible readable XLSX worksheet and round-trips 150 rows through the importer', async ({ page }) => {
    const catalog = Array.from({ length: 150 }, (_, index) => item(index + 1));
    const buffer = Buffer.from(await xlsxBytesInBrowser(page, catalog));
    const sheets = await readExcelFile(buffer, { parseNumber: value => value });
    expect(sheets).toHaveLength(1);
    expect(sheets[0].sheet).toBe(PRICE_BOOK_EXPORT_WORKSHEET_NAME);
    expect(sheets[0].data).toHaveLength(151);
    expect(sheets[0].data[0]).toEqual([...PRICE_BOOK_EXPORT_HEADERS]);
    expect(sheets[0].data[1][9]).toBe('0');
    expect(sheets[0].data[2][9]).toBe('75.02');
    expect(sheets[0].data[4][9]).toBe('75.04');
    expect(sheets[0].data[5][9]).toBeNull();
    expect(JSON.stringify(sheets[0].data)).not.toContain('private note');
    expect(JSON.stringify(sheets[0].data)).not.toContain('contractor-private-id');

    const parsedRows = sheets[0].data.map(row => row.map(value => value == null ? '' : String(value)));
    const csvEquivalent = parsedRows.map(row => row.map(value => /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value).join(',')).join('\n');
    const roundTrip = importRequestsFromCsv(csvEquivalent);
    expect(roundTrip.requests).toHaveLength(150);
    expect(roundTrip.requests.every(row => row.errors.length === 0)).toBe(true);
    expect(roundTrip.interpretation.ignoredHeaders).toEqual([]);
    expect(roundTrip.requests.map(row => row.values.title)).toEqual(catalog.map(row => row.title));
  });

  test('preserves all-versus-active scope, empty behavior, filenames, and the bounded scale contract', () => {
    const catalog = [item(1), item(2, { active: false, archived_at: '2026-08-12T00:00:00.000Z' })];
    expect(priceBookItemsForExport(catalog, 'all')).toHaveLength(2);
    expect(priceBookItemsForExport(catalog, 'active')).toHaveLength(1);
    expect(priceBookExportRows([])).toEqual([]);
    expect(priceBookExportFilename('csv', new Date(2026, 7, 12))).toBe('ServSync_Price_Book_2026-08-12.csv');
    expect(priceBookExportFilename('xlsx', new Date(2026, 7, 12))).toBe('ServSync_Price_Book_2026-08-12.xlsx');
    expect(() => priceBookExportRows(Array.from({ length: PRICE_BOOK_EXPORT_MAX_ITEMS + 1 }, (_, index) => item(index + 1)))).toThrow('5,000 items');
  });

  test('retains existing read authorization and tenant-scoped server reconciliation boundaries', () => {
    const contractor = { owner_user_id: 'owner' };
    const teamAccess = { can_manage: false, members: [
      { user_id: 'admin', status: 'active', role: 'admin' },
      { user_id: 'office', status: 'active', role: 'office' },
      { user_id: 'tech', status: 'active', role: 'field_technician' },
      { user_id: 'viewer', status: 'active', role: 'viewer' },
    ] } as Parameters<typeof contractorPriceBookAccess>[1];
    for (const user of ['owner', 'admin', 'office', 'tech', 'viewer']) {
      expect(contractorPriceBookAccess(contractor, teamAccess, user).canView).toBe(true);
    }
    expect(contractorPriceBookAccess(contractor, teamAccess, 'inactive')).toEqual({ canView: false, canManage: false });
    expect(contractorPriceBookAccess(null, teamAccess, 'owner')).toEqual({ canView: false, canManage: false });

    const sql = sourceFile('servsync-price-book-repeat-import-reconciliation.sql');
    expect(sql).toContain("provider_account_id = p_import_source_id::text");
    expect(sql).toContain('and contractor_id = p_contractor_id');
    expect(sql).toContain('v_mapping.contractor_id is distinct from p_contractor_id');
    expect(sql).toContain("'The external item mapping is unavailable or outside this contractor account.'");
    expect(sql).toContain("when row_value -> 'current_values' is not distinct from row_value -> 'result_values' then 'unchanged'");
  });

  test('keeps export source-only, paginated, non-mutating, and free of private export columns', () => {
    const app = sourceFile('src/App.tsx');
    const exporter = sourceFile('src/features/price-book/priceBookExport.ts');
    const panel = sourceFile('src/features/price-book/PriceBookExportPanel.tsx');
    expect(app).toContain('.range(from, from + requestSize - 1)');
    expect(app).toContain("select('id', { count: 'exact', head: true })");
    expect(app).toContain('verifiedCount !== expectedCount');
    expect(app).toContain('new Set(exportedItems.map(item => item.id)).size !== expectedCount');
    expect(app).toContain('priceBookAccess.canView');
    const loader = app.slice(app.indexOf('const loadCompletePriceBookForExport'), app.indexOf('const resetServiceAgreementTemplateDraft'));
    expect(loader).not.toContain('.insert(');
    expect(loader).not.toContain('.update(');
    expect(loader).not.toContain('internal_notes');
    expect(loader).not.toContain('internal_cost');
    expect(loader).not.toContain('contractor_id,');
    expect(loader).not.toContain('source,');
    expect(exporter).not.toContain('internal_cost');
    expect(exporter).not.toContain('internal_notes');
    expect(exporter).not.toContain('contractor_id');
    expect(exporter).not.toContain('source:');
    expect(panel).toContain('Private cost, margin, internal notes, account IDs, and import history are excluded.');
  });

  test('provides a compact responsive export flow with all/active selection and fail-closed errors', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installExportHarness(page, [item(1), item(2, { active: false, archived_at: '2026-08-12T00:00:00.000Z' })]);
    await expect(page.getByTestId('price-book-export-panel')).toBeVisible();
    await expect(page.getByLabel('Format')).toHaveValue('csv');
    await expect(page.getByLabel('Items')).toHaveValue('all');
    await expect(page.getByText(/2 items currently loaded/)).toBeVisible();
    await page.getByLabel('Items').selectOption('active');
    await expect(page.getByText(/1 item currently loaded/)).toBeVisible();
    await page.getByRole('button', { name: 'Download export' }).click();
    expect(await page.evaluate(() => (window as typeof window & { __priceBookExportHarness?: { loads: number; downloads: string[] } }).__priceBookExportHarness)).toMatchObject({ loads: 1, downloads: [/ServSync_Price_Book_\d{4}-\d{2}-\d{2}\.csv/] });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await page.evaluate(() => { const state = (window as typeof window & { __priceBookExportHarness?: { fail: boolean } }).__priceBookExportHarness; if (state) state.fail = true; });
    await page.getByRole('button', { name: 'Download export' }).click();
    await expect(page.getByRole('alert')).toHaveText('Complete catalog could not be verified.');

    await installExportHarness(page, []);
    await expect(page.getByTestId('price-book-export-empty')).toHaveText('Add a Price Book item before creating an export.');
    await expect(page.getByRole('button', { name: 'Download export' })).toHaveCount(0);
  });
});
