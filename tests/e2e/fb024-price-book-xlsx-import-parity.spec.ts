import { expect, test, type Page } from '@playwright/test';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import writeExcelFile from 'write-excel-file/node';
import {
  autoMapPriceBookCsvHeaders,
  buildPriceBookImportRows,
  parsePriceBookCsv,
  priceBookCsvRowsFromParsed,
  type PriceBookTabularRow,
} from '../../src/features/price-book/priceBookCsvReconciliation';

type TestCell = string | number | boolean | Date | null | { type: 'Formula'; value: string };

async function workbookBuffer(sheets: Array<{ name: string; rows: TestCell[][] }>) {
  return writeExcelFile(sheets.map(sheet => ({ sheet: sheet.name, data: sheet.rows, dateFormat: 'yyyy-mm-dd' }))).toBuffer();
}

function updateArchive(buffer: Buffer, updates: Record<string, (xml: string) => string>) {
  const files = unzipSync(buffer);
  for (const [path, update] of Object.entries(updates)) files[path] = strToU8(update(strFromU8(files[path])));
  return Buffer.from(zipSync(files));
}

function hideWorksheet(buffer: Buffer, name: string) {
  return updateArchive(buffer, {
    'xl/workbook.xml': xml => xml.replace(
      new RegExp(`(<sheet\\b[^>]*\\bname="${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}")`),
      '$1 state="hidden"',
    ),
  });
}

function cacheFormulaResult(buffer: Buffer, cell: string, value: string) {
  return updateArchive(buffer, {
    'xl/worksheets/sheet1.xml': xml => xml.replace(
      new RegExp(`(<c r="${cell}"[^>]*><f>[^<]*</f>)(</c>)`),
      `$1<v>${value}</v>$2`,
    ),
  });
}

async function parseWorkbookInBrowser(page: Page, buffer: Buffer) {
  await page.goto('/');
  return page.evaluate(async base64 => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const module = await dynamicImport('/src/features/price-book/priceBookXlsxImport.ts');
    const parse = module.parsePriceBookXlsxWorkbook as (value: ArrayBuffer) => Promise<unknown>;
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    return parse(bytes.buffer);
  }, buffer.toString('base64')) as Promise<Array<{ name: string; hidden: boolean; headers: string[]; rows: PriceBookTabularRow[]; error: string }>>;
}

async function installImportHarness(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const React = (await dynamicImport('/node_modules/.vite/deps/react.js')).default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = ((await dynamicImport('/node_modules/.vite/deps/react-dom_client.js')).default as {
      createRoot: (element: HTMLElement) => { render: (node: unknown) => void };
    }).createRoot;
    const { PriceBookCsvReconciliationPanel } = await dynamicImport('/src/features/price-book/PriceBookCsvReconciliationPanel.tsx');
    const state = {
      previewRows: [] as Array<Record<string, unknown>>,
      previewCalls: 0,
      executeCalls: 0,
      executeInput: null as null | Record<string, unknown>,
      batchCompleted: false,
      rollbackPreviewCalls: 0,
      rollbackExecuteCalls: 0,
    };
    (window as typeof window & { __xlsxImportHarness?: typeof state }).__xlsxImportHarness = state;
    document.body.innerHTML = '<main id="xlsx-import-root"></main>';
    createRoot(document.getElementById('xlsx-import-root') as HTMLElement).render(React.createElement(PriceBookCsvReconciliationPanel as (...args: unknown[]) => unknown, {
      api: {
        listSources: async () => [{ id: 'source-1', display_name: 'Main HVAC Price Book', source_kind: 'file_upload', status: 'active', created_at: '2026-08-12T00:00:00.000Z' }],
        createSource: async () => { throw new Error('Not used'); },
        preview: async (_sourceId: string, rows: Array<Record<string, unknown>>) => {
          state.previewCalls += 1;
          state.previewRows = rows;
          const actions = ['add', 'update', 'skip'] as const;
          return {
            source: { id: 'source-1', display_name: 'Main HVAC Price Book' },
            counts: { add: rows.length > 0 ? 1 : 0, update: rows.length > 1 ? 1 : 0, skip: Math.max(0, rows.length - 2), error: 0 },
            rows: rows.map((row, index) => ({
              row_number: row.row_number, external_item_id: row.external_item_id, sku: null, row_fingerprint: String(index).padStart(64, '0'), mapped_fields: row.mapped_fields,
              match_type: index === 0 ? 'none' : 'external_id', reconciliation_status: index === 0 ? 'new' : index === 1 ? 'changed' : 'unchanged', match_confidence: index === 0 ? 'none' : 'high',
              target_item_id: index === 0 ? null : `item-${index}`, target_updated_at: index === 0 ? null : '2026-08-12T00:00:00.000Z', current_values: index === 0 ? null : row.values,
              incoming_values: row.values, result_values: row.values, changed_fields: index === 1 ? ['title'] : [], conflict_fields: [], recommended_action: actions[Math.min(index, 2)],
              allowed_actions: index === 0 ? ['add', 'skip'] : index === 1 ? ['update', 'skip'] : ['skip'], warnings: [], errors: [],
            })),
          };
        },
        execute: async (input: Record<string, unknown>) => {
          state.executeCalls += 1;
          state.executeInput = input;
          state.batchCompleted = true;
          return { batch_id: 'xlsx-batch', status: 'completed', source_id: 'source-1', row_count: 3, add_count: 1, update_count: 1, skip_count: 1, error_count: 0, idempotent: false };
        },
        listBatches: async () => state.batchCompleted ? [{ id: 'xlsx-batch', source_id: 'source-1', source_name: 'Main HVAC Price Book', status: 'completed', original_filename: 'catalog.xlsx', file_size_bytes: 3000, row_count: 3, add_count: 1, update_count: 1, skip_count: 1, error_count: 0, created_at: '2026-08-12T00:00:00.000Z', completed_at: '2026-08-12T00:00:01.000Z', rollback: null }] : [],
        previewRollback: async () => {
          state.rollbackPreviewCalls += 1;
          return { batch_id: 'xlsx-batch', source_id: 'source-1', original_filename: 'catalog.xlsx', completed_at: '2026-08-12T00:00:01.000Z', already_rolled_back: false, rollback_id: null, rolled_back_at: null, can_rollback: true, counts: { restore: 1, archive: 1, unchanged: 1, conflict: 0 }, rows: [
            { original_batch_row_id: 'row-1', row_number: 2, target_price_book_item_id: 'item-1', title: 'Added', original_action: 'add', rollback_action: 'archive_item', restore_fields: [], conflict_fields: [], errors: [], outcome: 'archived' },
            { original_batch_row_id: 'row-2', row_number: 3, target_price_book_item_id: 'item-2', title: 'Updated', original_action: 'update', rollback_action: 'restore_fields', restore_fields: ['title'], conflict_fields: [], errors: [], outcome: 'restored' },
            { original_batch_row_id: 'row-3', row_number: 4, target_price_book_item_id: null, title: 'Skipped', original_action: 'skip', rollback_action: 'no_change', restore_fields: [], conflict_fields: [], errors: [], outcome: 'unchanged' },
          ] };
        },
        executeRollback: async () => {
          state.rollbackExecuteCalls += 1;
          return { rollback_id: 'rollback-1', batch_id: 'xlsx-batch', status: 'completed', restore_count: 1, archive_count: 1, unchanged_count: 1, idempotent: false };
        },
      },
      onCompleted: async () => undefined,
      onRollbackCompleted: async () => undefined,
    }));
  });
  await expect(page.getByLabel('Existing source')).toHaveValue('source-1');
}

const normalRows: TestCell[][] = [
  ['external_id', 'title', 'price', 'taxable'],
  ['A-1', 'Diagnostic visit', null, true],
  ['A-2', 'No-charge follow-up', 0, false],
  ['A-3', 'Seasonal maintenance', 35.5, true],
];

test.describe('FB-024 Price Book XLSX Import Parity v1', () => {
  test('normalizes XLSX scalar values into the same canonical requests as CSV', async ({ page }) => {
    const workbook = await workbookBuffer([{ name: 'Catalog', rows: [...normalRows, ['A-4', new Date('2026-08-12T12:00:00.000Z'), 35, true]] }]);
    const [worksheet] = await parseWorkbookInBrowser(page, workbook);
    expect(worksheet).toMatchObject({ name: 'Catalog', hidden: false, headers: ['external_id', 'title', 'price', 'taxable'], error: '' });
    expect(worksheet.rows[3].values.title).toBe('2026-08-12');

    const csv = priceBookCsvRowsFromParsed(parsePriceBookCsv([
      'external_id,title,price,taxable',
      'A-1,Diagnostic visit,,true',
      'A-2,No-charge follow-up,0,false',
      'A-3,Seasonal maintenance,35.5,true',
      'A-4,2026-08-12,35,true',
    ].join('\n')));
    const xlsxRequests = buildPriceBookImportRows(worksheet.rows, autoMapPriceBookCsvHeaders(worksheet.headers)).map(row => row.requestRow);
    const csvRequests = buildPriceBookImportRows(csv.rows, autoMapPriceBookCsvHeaders(csv.headers)).map(row => row.requestRow);
    expect(xlsxRequests).toEqual(csvRequests);
    expect(xlsxRequests.map(row => row.values.default_unit_price_cents)).toEqual([null, 0, 3550, 3500]);
    expect(xlsxRequests.map(row => row.values.taxable)).toEqual([true, false, true, true]);
  });

  test('uses cached formula values without evaluating formulas or external references', async ({ page }) => {
    const formulaRows: TestCell[][] = [
      ['external_id', 'title', 'price'],
      ['F-1', 'Cached price', { type: 'Formula', value: '=30+5' }],
      ['F-2', 'External formula', { type: 'Formula', value: '=WEBSERVICE("https://formula.invalid/value")' }],
    ];
    const uncached = await workbookBuffer([{ name: 'Formulas', rows: formulaRows }]);
    const cached = cacheFormulaResult(uncached, 'C2', '35');
    const externalRequests: string[] = [];
    page.on('request', request => { if (request.url().includes('formula.invalid')) externalRequests.push(request.url()); });
    const [worksheet] = await parseWorkbookInBrowser(page, cached);

    expect(worksheet.rows[0].values.price).toBe('35');
    expect(worksheet.rows[1].values.price).toBe('');
    expect(externalRequests).toEqual([]);
  });

  test('filters hidden sheets and requires explicit selection between visible usable sheets', async ({ page }) => {
    const workbook = hideWorksheet(await workbookBuffer([
      { name: 'Sheet A', rows: [['external_id', 'title'], ['A-1', 'From A']] },
      { name: 'Sheet B', rows: [['external_id', 'title'], ['B-1', 'From B']] },
      { name: 'Internal', rows: [['external_id', 'title'], ['H-1', 'Hidden row']] },
    ]), 'Internal');
    await installImportHarness(page);
    await page.getByLabel('Choose CSV or XLSX').setInputFiles({ name: 'multi.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: workbook });

    await expect(page.getByLabel('Worksheet')).toHaveValue('');
    await expect(page.getByLabel('Worksheet').locator('option')).toHaveCount(3);
    await expect(page.getByText('1 hidden worksheet was ignored.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Preview reconciliation' })).toHaveCount(0);

    await page.getByLabel('Worksheet').selectOption('Sheet A');
    await page.getByRole('button', { name: 'Preview reconciliation' }).click();
    await expect(page.getByTestId('price-book-import-review-row')).toHaveCount(1);
    await page.getByLabel('Worksheet').selectOption('Sheet B');
    await expect(page.getByTestId('price-book-import-review-row')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Preview reconciliation' }).click();
    const state = await page.evaluate(() => (window as typeof window & { __xlsxImportHarness?: { previewRows: Array<{ external_item_id: string }>; executeCalls: number } }).__xlsxImportHarness);
    expect(state?.previewRows.map(row => row.external_item_id)).toEqual(['B-1']);
    expect(state?.executeCalls).toBe(0);
  });

  test('auto-selects one sheet and reuses preview, execution, audit, and rollback on mobile', async ({ page }) => {
    const workbook = await workbookBuffer([{ name: 'Catalog', rows: normalRows }]);
    await page.setViewportSize({ width: 390, height: 844 });
    await installImportHarness(page);
    await page.getByLabel('Choose CSV or XLSX').setInputFiles({ name: 'catalog.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: workbook });
    await expect(page.getByLabel('Worksheet')).toHaveValue('Catalog');
    await expect(page.getByText('3 rows; 0 blocked before server preview.')).toBeVisible();
    await page.getByRole('button', { name: 'Preview reconciliation' }).click();
    await expect(page.getByTestId('price-book-import-review-row')).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    page.once('dialog', dialog => void dialog.accept());
    await page.getByRole('button', { name: 'Confirm and apply import' }).click();
    await expect(page.getByText('Import complete: 1 added, 1 updated, 1 skipped.')).toBeVisible();
    await page.getByText('Recent import history').click();
    await page.getByRole('button', { name: 'Preview rollback' }).click();
    await expect(page.getByTestId('price-book-rollback-row')).toHaveCount(3);
    page.once('dialog', dialog => void dialog.accept());
    await page.getByRole('button', { name: 'Confirm rollback' }).click();
    await expect(page.getByText('Rollback complete: 1 restored, 1 archived, 1 unchanged.')).toBeVisible();

    const state = await page.evaluate(() => (window as typeof window & { __xlsxImportHarness?: { executeCalls: number; executeInput: Record<string, unknown>; rollbackPreviewCalls: number; rollbackExecuteCalls: number } }).__xlsxImportHarness);
    expect(state).toMatchObject({ executeCalls: 1, rollbackPreviewCalls: 1, rollbackExecuteCalls: 1 });
    expect(state?.executeInput).toMatchObject({ filename: 'catalog.xlsx', sourceId: 'source-1' });
    expect(JSON.stringify(state?.executeInput)).not.toMatch(/xlsxRows|workbook|worksheet|raw_file|file_contents/i);
  });

  test('fails closed on duplicate headers, row/column limits, corrupted files, and unsupported formats', async ({ page }) => {
    const duplicate = await workbookBuffer([{ name: 'Duplicate', rows: [['title', 'Title'], ['One', 'Two']] }]);
    const [duplicateSheet] = await parseWorkbookInBrowser(page, duplicate);
    expect(duplicateSheet.error).toBe('XLSX headers must be unique so every mapped field is deterministic.');

    const blankHeader = await workbookBuffer([{ name: 'Blank header', rows: [['external_id', null, 'price'], ['A-1', 'Ambiguous', 10]] }]);
    const [blankHeaderSheet] = await parseWorkbookInBrowser(page, blankHeader);
    expect(blankHeaderSheet.error).toBe('XLSX headers cannot be blank when their column contains data.');

    const shortHeader = await workbookBuffer([{ name: 'Short header', rows: [['external_id', 'title'], ['A-1', 'Ambiguous', 10]] }]);
    const [shortHeaderSheet] = await parseWorkbookInBrowser(page, shortHeader);
    expect(shortHeaderSheet.error).toBe('XLSX headers cannot be blank when their column contains data.');

    const empty = await workbookBuffer([{ name: 'Empty', rows: [[null]] }]);
    const [emptySheet] = await parseWorkbookInBrowser(page, empty);
    expect(emptySheet.error).toBe('This worksheet is empty.');

    const tooManyRows = await workbookBuffer([{ name: 'Rows', rows: [['external_id', 'title'], ...Array.from({ length: 501 }, (_, index) => [`R-${index}`, `Item ${index}`])] }]);
    const [rowSheet] = await parseWorkbookInBrowser(page, tooManyRows);
    expect(rowSheet.error).toBe('XLSX imports are limited to 500 item rows.');

    const tooManyColumns = await workbookBuffer([{ name: 'Columns', rows: [Array.from({ length: 51 }, (_, index) => `Column ${index + 1}`), Array.from({ length: 51 }, () => 'value')] }]);
    const [columnSheet] = await parseWorkbookInBrowser(page, tooManyColumns);
    expect(columnSheet.error).toBe('XLSX worksheets can contain up to 50 meaningful columns.');

    await installImportHarness(page);
    await page.getByLabel('Choose CSV or XLSX').setInputFiles({ name: 'legacy.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('not xls') });
    await expect(page.getByRole('alert')).toContainText('Upload a supported .csv or .xlsx file.');
    await page.getByLabel('Choose CSV or XLSX').setInputFiles({ name: 'broken.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('not a zip') });
    await expect(page.getByRole('alert')).toContainText('Unable to read this XLSX workbook safely.');
    await page.getByLabel('Choose CSV or XLSX').setInputFiles({ name: 'oversized.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.alloc(1024 * 1024 + 1) });
    await expect(page.getByRole('alert')).toContainText('XLSX files can be up to 1 MB.');
  });

  test('keeps duplicate-ID, private cost, margin, profit, and quantity columns outside the canonical request', async ({ page }) => {
    const workbook = await workbookBuffer([{ name: 'Private columns', rows: [
      ['external_id', 'title', 'price', 'internal cost', 'margin', 'profit', 'quantity'],
      ['DUP-1', 'First', 20, 10, 50, 10, 4],
      ['DUP-1', 'Second', 30, 15, 50, 15, 2],
    ] }]);
    const [worksheet] = await parseWorkbookInBrowser(page, workbook);
    const rows = buildPriceBookImportRows(worksheet.rows, autoMapPriceBookCsvHeaders(worksheet.headers));
    expect(rows.every(row => row.errors.includes('External item ID is repeated in this file.'))).toBe(true);
    expect(JSON.stringify(rows.map(row => row.requestRow))).not.toMatch(/internal.cost|margin|profit|quantity/i);
  });
});
