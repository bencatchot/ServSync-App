import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  autoMapPriceBookCsvHeaders,
  buildPriceBookImportRows,
  interpretPriceBookImport,
  parsePriceBookCsv,
  priceBookCsvRowsFromParsed,
} from '../../src/features/price-book/priceBookCsvReconciliation';
import {
  applyPriceBookPossibleDuplicateReview,
  findPriceBookPossibleDuplicate,
  type PriceBookDuplicateCandidateItem,
} from '../../src/features/price-book/priceBookPossibleDuplicates';
import type { PriceBookImportPreviewRow, PriceBookNormalizedValues } from '../../src/features/price-book/priceBookCsvReconciliation';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

async function installImportHarness(page: Page, existingItems: PriceBookDuplicateCandidateItem[] = []) {
  await page.goto('/');
  await page.evaluate(async importedExistingItems => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const reactModule = await dynamicImport('/node_modules/.vite/deps/react.js');
    const reactDomModule = await dynamicImport('/node_modules/.vite/deps/react-dom_client.js');
    const panelModule = await dynamicImport('/src/features/price-book/PriceBookCsvReconciliationPanel.tsx');
    const React = reactModule.default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = (reactDomModule.default as { createRoot: (element: HTMLElement) => { render: (node: unknown) => void } }).createRoot;
    const Panel = panelModule.PriceBookCsvReconciliationPanel as (...args: unknown[]) => unknown;
    const state = { previewRows: [] as Array<Record<string, unknown>>, executeCalls: 0, completedCalls: 0, rollbackPreviewCalls: 0, rollbackExecuteCalls: 0, rollbackCompletedCalls: 0, executeActions: {} as Record<string, string> };
    (window as typeof window & { __priceBookImportHarness?: typeof state }).__priceBookImportHarness = state;
    document.body.innerHTML = '<main id="price-book-import-root"></main>';
    createRoot(document.getElementById('price-book-import-root') as HTMLElement).render(React.createElement(Panel, {
      existingItems: importedExistingItems,
      api: {
        listSources: async () => [{ id: 'source-1', display_name: 'Master catalog', source_kind: 'file_upload', status: 'active', created_at: '2026-08-02T12:00:00.000Z' }],
        createSource: async (displayName: string) => ({ id: 'source-2', display_name: displayName, source_kind: 'file_upload', status: 'active', created_at: '2026-08-02T12:00:00.000Z' }),
        preview: async (_sourceId: string, rows: Array<Record<string, unknown>>) => {
          state.previewRows = rows;
          return {
            source: { id: 'source-1', display_name: 'Master catalog' },
            counts: { add: 1, update: 1, skip: 0, error: 0 },
            rows: rows.map((row, index) => {
              const unchanged = (row.values as { title?: string }).title === 'Unchanged service';
              return ({
              row_number: row.row_number,
              external_item_id: row.external_item_id,
              sku: null,
              row_fingerprint: 'a'.repeat(64),
              mapped_fields: row.mapped_fields,
              match_type: unchanged || index > 0 ? 'external_id' : 'none',
              reconciliation_status: unchanged ? 'unchanged' : index === 0 ? 'new' : 'changed',
              match_confidence: unchanged || index > 0 ? 'high' : 'none',
              target_item_id: unchanged || index > 0 ? 'item-2' : null,
              target_updated_at: unchanged || index > 0 ? '2026-08-02T12:00:00.000Z' : null,
              current_values: unchanged ? row.values : index === 0 ? null : { title: 'Old follow-up', default_unit_price_cents: 100 },
              incoming_values: row.values,
              result_values: row.values,
              changed_fields: unchanged || index === 0 ? [] : ['title', 'default_unit_price_cents'],
              conflict_fields: [],
              recommended_action: unchanged ? 'skip' : index === 0 ? 'add' : 'update',
              allowed_actions: unchanged ? ['skip'] : index === 0 ? ['add', 'skip'] : ['update', 'skip'],
              warnings: [],
              errors: [],
            })}),
          };
        },
        execute: async (input: { actions: Record<string, string> }) => {
          state.executeCalls += 1;
          state.executeActions = input.actions;
          return { batch_id: 'batch-1', status: 'completed', source_id: 'source-1', row_count: 2, add_count: 1, update_count: 1, skip_count: 0, error_count: 0, idempotent: false };
        },
        listBatches: async () => [{ id: 'batch-1', source_id: 'source-1', source_name: 'Master catalog', status: 'completed', original_filename: 'catalog.csv', file_size_bytes: 120, row_count: 3, add_count: 1, update_count: 1, skip_count: 1, error_count: 0, created_at: '2026-08-02T12:00:00.000Z', completed_at: '2026-08-02T12:00:01.000Z', rollback: null }],
        previewRollback: async () => {
          state.rollbackPreviewCalls += 1;
          return {
            batch_id: 'batch-1', source_id: 'source-1', original_filename: 'catalog.csv', completed_at: '2026-08-02T12:00:01.000Z', already_rolled_back: false, rollback_id: null, rolled_back_at: null, can_rollback: true,
            counts: { restore: 1, archive: 1, unchanged: 1, conflict: 0 },
            rows: [
              { original_batch_row_id: 'row-1', row_number: 2, target_price_book_item_id: 'item-1', title: 'Updated diagnostic', original_action: 'update', rollback_action: 'restore_fields', restore_fields: ['title'], conflict_fields: [], errors: [], outcome: 'restored' },
              { original_batch_row_id: 'row-2', row_number: 3, target_price_book_item_id: 'item-2', title: 'Imported maintenance', original_action: 'add', rollback_action: 'archive_item', restore_fields: [], conflict_fields: [], errors: [], outcome: 'archived' },
              { original_batch_row_id: 'row-3', row_number: 4, target_price_book_item_id: null, title: 'Skipped row', original_action: 'skip', rollback_action: 'no_change', restore_fields: [], conflict_fields: [], errors: [], outcome: 'unchanged' },
            ],
          };
        },
        executeRollback: async () => {
          state.rollbackExecuteCalls += 1;
          return { rollback_id: 'rollback-1', batch_id: 'batch-1', status: 'completed', restore_count: 1, archive_count: 1, unchanged_count: 1, idempotent: false };
        },
      },
      onCompleted: async () => { state.completedCalls += 1; },
      onRollbackCompleted: async () => { state.rollbackCompletedCalls += 1; },
    }));
  }, existingItems);
}

function existingItem(index: number, values: Partial<PriceBookDuplicateCandidateItem> = {}): PriceBookDuplicateCandidateItem {
  return {
    id: `item-${index}`,
    title: `HVAC service ${index}`,
    customer_description: `Customer-safe description ${index}`,
    trade: 'HVAC',
    category: (index - 1) % 2 ? 'Repairs' : 'Diagnostics',
    subcategory: null,
    line_type: (index - 1) % 4 === 0 ? 'material' : (index - 1) % 4 === 1 ? 'fee' : (index - 1) % 4 === 2 ? 'labor' : 'other',
    unit: null,
    default_unit_price_cents: index === 1 ? 0 : 18900,
    sku: `OLD-${String(index).padStart(3, '0')}`,
    active: true,
    ...values,
  };
}

function previewRow(values: PriceBookNormalizedValues, overrides: Partial<PriceBookImportPreviewRow> = {}): PriceBookImportPreviewRow {
  return {
    row_number: 2,
    external_item_id: 'NEW-1',
    sku: null,
    row_fingerprint: 'a'.repeat(64),
    mapped_fields: Object.keys(values),
    match_type: 'none',
    reconciliation_status: 'new',
    match_confidence: 'none',
    target_item_id: null,
    target_updated_at: null,
    current_values: null,
    incoming_values: values,
    result_values: values,
    changed_fields: [],
    conflict_fields: [],
    recommended_action: 'add',
    allowed_actions: ['add', 'skip'],
    warnings: [],
    errors: [],
    ...overrides,
  };
}

test.describe('FB-024 Price Book Repeat-Import Reconciliation v1', () => {
  test('flags 150 alternate-source services without treating similarity as stable identity', () => {
    const existing = Array.from({ length: 150 }, (_, index) => existingItem(index + 1));
    const alternateCsv = [
      'SKU,Trade,Category,Item Name,Description,Item Type,Unit Price',
      ...existing.map((item, index) => [
        `ALT-${String(index + 1).padStart(3, '0')}`,
        item.trade,
        item.category,
        index % 2 ? item.title.toUpperCase() : ` ${item.title.replace(' ', ' - ')} `,
        item.customer_description,
        item.line_type === 'other' ? 'Service' : item.line_type,
        item.default_unit_price_cents === null ? '' : (item.default_unit_price_cents / 100).toFixed(2),
      ].join(',')),
    ].join('\n');
    const parsed = priceBookCsvRowsFromParsed(parsePriceBookCsv(alternateCsv));
    const interpretation = interpretPriceBookImport(parsed.headers, parsed.rows);
    const rows = buildPriceBookImportRows(parsed.rows, interpretation.mapping).map(row => previewRow(
      row.requestRow.values,
      { row_number: row.requestRow.row_number, external_item_id: row.requestRow.external_item_id },
    ));

    const review = applyPriceBookPossibleDuplicateReview(rows, existing);
    expect(rows).toHaveLength(150);
    expect(review.candidates.size).toBe(150);
    expect(Object.values(review.actions)).toEqual(Array(150).fill('skip'));
    expect(rows.every(row => row.match_type === 'none' && row.target_item_id === null)).toBe(true);
  });

  test('uses title-heavy bounded evidence and avoids noisy false positives', () => {
    const capacitor = existingItem(1, {
      title: 'Dual Run Capacitor Replacement', category: 'Electrical', trade: 'HVAC', line_type: 'other', default_unit_price_cents: 22900,
    });
    const exactDifferentId = previewRow({ title: 'dual-run capacitor replacement', category: 'electrical', trade: 'hvac', line_type: 'other', default_unit_price_cents: 22900, sku: 'CAP-001' });
    const noExternalId = previewRow(exactDifferentId.incoming_values, { external_item_id: null });
    const minorVariation = previewRow({ title: 'Dual Run Capacitor - Replacement', category: 'Electrical', trade: 'HVAC', line_type: 'other', default_unit_price_cents: 22900 });
    const reorderedVariation = previewRow({ title: 'Replacement of Dual Run Capacitor', category: 'Electrical', trade: 'HVAC', line_type: 'other', default_unit_price_cents: 22900 });
    const materiallyDifferent = previewRow({ title: 'Single Run Capacitor Replacement', category: 'Electrical', trade: 'HVAC', line_type: 'other', default_unit_price_cents: 22900 });
    const differentCategory = previewRow({ title: capacitor.title, category: 'Maintenance', trade: 'HVAC', line_type: 'other', default_unit_price_cents: 22900 });
    const differentPrice = previewRow({ title: capacitor.title, category: 'Electrical', trade: 'HVAC', line_type: 'other', default_unit_price_cents: 32900 });

    expect(findPriceBookPossibleDuplicate(exactDifferentId, [capacitor])?.reasons).toEqual(expect.arrayContaining(['same normalized title', 'same category', 'same price']));
    expect(findPriceBookPossibleDuplicate(noExternalId, [capacitor])).not.toBeNull();
    expect(findPriceBookPossibleDuplicate(minorVariation, [capacitor])).not.toBeNull();
    expect(findPriceBookPossibleDuplicate(reorderedVariation, [capacitor])).not.toBeNull();
    expect(findPriceBookPossibleDuplicate(materiallyDifferent, [capacitor])).toBeNull();
    expect(findPriceBookPossibleDuplicate(differentCategory, [capacitor])).toBeNull();
    expect(findPriceBookPossibleDuplicate(differentPrice, [capacitor])).not.toBeNull();
  });

  test('requires additional business evidence for generic titles and surfaces ambiguous ties', () => {
    const generic = existingItem(1, { title: 'Diagnostic', category: 'Service', trade: 'HVAC', line_type: 'fee', unit: 'visit', default_unit_price_cents: 9500 });
    expect(findPriceBookPossibleDuplicate(previewRow({ title: 'DIAGNOSTIC', default_unit_price_cents: 9500 }), [generic])).toBeNull();
    expect(findPriceBookPossibleDuplicate(previewRow({ title: 'Diagnostic', category: 'Service', trade: 'HVAC', line_type: 'fee', default_unit_price_cents: 9500 }), [generic])).not.toBeNull();
    const ambiguous = findPriceBookPossibleDuplicate(previewRow({ title: 'Diagnostic', category: 'Service', trade: 'HVAC', line_type: 'fee', default_unit_price_cents: 9500 }), [generic, { ...generic, id: 'item-2' }]);
    expect(ambiguous).toMatchObject({ additionalMatchCount: 1 });
    expect(ambiguous?.reasons).toContain('multiple similar existing items');
    expect(findPriceBookPossibleDuplicate(previewRow({ title: 'Diagnostic', category: 'Service', trade: 'HVAC', line_type: 'fee', default_unit_price_cents: 9500 }), [{ ...generic, active: false }])).not.toBeNull();
  });

  test('never overrides stable server matches or their safe Update path', () => {
    const item = existingItem(1);
    const stable = previewRow({ title: item.title, category: item.category, trade: item.trade, line_type: item.line_type }, {
      match_type: 'external_id', reconciliation_status: 'changed', target_item_id: item.id, recommended_action: 'update', allowed_actions: ['update', 'skip'],
    });
    const review = applyPriceBookPossibleDuplicateReview([stable], [item]);
    expect(review.candidates.size).toBe(0);
    expect(review.actions).toEqual({ 2: 'update' });
  });

  test('allowlists candidate evidence and excludes private Price Book fields', () => {
    const privateItem = {
      ...existingItem(1),
      internal_notes: 'Private note', internal_cost_cents: 5500, margin: 44, source: 'private-import-source', contractor_id: 'contractor-1',
    };
    const candidate = findPriceBookPossibleDuplicate(previewRow({
      title: privateItem.title, customer_description: privateItem.customer_description, trade: privateItem.trade,
      category: privateItem.category, line_type: privateItem.line_type, default_unit_price_cents: privateItem.default_unit_price_cents,
    }), [privateItem]);
    expect(candidate).not.toBeNull();
    expect(JSON.stringify(candidate)).not.toMatch(/Private note|internal_cost|margin|private-import-source|contractor-1/i);
  });

  test('interprets a conventional 150-row HVAC export without translating source terminology', () => {
    const csv = [
      'SKU, Category, Item Name, Description, Item Type, Unit Price, Estimated Labor Hours, Estimated Material Cost, Taxable, Status',
      ...Array.from({ length: 150 }, (_, index) => [
        `HVAC-${String(index + 1).padStart(3, '0')}`,
        index % 2 ? 'Repairs' : 'Diagnostics',
        `HVAC service ${index + 1}`,
        `Customer-safe description ${index + 1}`,
        index % 4 === 0 ? 'Part' : index % 4 === 1 ? 'Fee' : index % 4 === 2 ? 'Labor' : 'Service',
        index === 0 ? '$0.00' : '$189.00',
        '0.7',
        '$42.00',
        index % 2 ? 'yes' : 'TRUE',
        index % 3 ? 'Active' : 'Inactive',
      ].join(',')),
    ].join('\n');
    const parsed = priceBookCsvRowsFromParsed(parsePriceBookCsv(csv));
    const interpretation = interpretPriceBookImport(parsed.headers, parsed.rows);
    const rows = buildPriceBookImportRows(parsed.rows, interpretation.mapping);

    expect(interpretation.mapping).toMatchObject({
      external_item_id: 'SKU', sku: 'SKU', category: 'Category', title: 'Item Name',
      customer_description: 'Description', line_type: 'Item Type', default_unit_price: 'Unit Price',
      labor_hours: 'Estimated Labor Hours', taxable: 'Taxable', active: 'Status',
    });
    expect(interpretation.ignoredHeaders).toEqual(['Estimated Material Cost']);
    expect(interpretation.insights.line_type).toMatchObject({ confidence: 'review', header: 'Item Type' });
    expect(interpretation.insights.external_item_id?.reason).toContain('stable repeat-import identity');
    expect(rows).toHaveLength(150);
    expect(rows.every(row => row.errors.length === 0)).toBe(true);
    expect(rows[0].requestRow).toMatchObject({
      external_item_id: 'HVAC-001',
      values: { title: 'HVAC service 1', line_type: 'material', default_unit_price_cents: 0, labor_hours: 0.7, taxable: true, active: false },
    });
    expect(rows[3].requestRow.values.line_type).toBe('other');
    expect(JSON.stringify(rows.map(row => row.requestRow))).not.toMatch(/material.cost|internal.cost|margin|profit/i);
  });

  test('normalizes common line types, booleans, prices, whitespace, and capitalization deterministically', () => {
    const sourceTypes = [' Service ', 'Repair', 'Service Item', 'LABOUR', 'Part', 'Materials', 'Equipment', 'Product', 'Charge', 'Trip Charge', 'Diagnostic', 'Miscellaneous', 'Other'];
    const expectedTypes = ['other', 'other', 'other', 'labor', 'material', 'material', 'material', 'material', 'fee', 'fee', 'other', 'other', 'other'];
    const parsed = priceBookCsvRowsFromParsed(parsePriceBookCsv([
      'Item ID,Product Name,Service Description,Service Type,Selling Price,Labor Time,Tax Status,Status',
      ...sourceTypes.map((type, index) => `ID-${index},Item ${index},Description ${index},${type},"$1,234.5","1,000",${index % 2 ? 'no' : '1'},${index % 2 ? 'disabled' : 'enabled'}`),
    ].join('\n')));
    const interpretation = interpretPriceBookImport(parsed.headers, parsed.rows);
    const rows = buildPriceBookImportRows(parsed.rows, interpretation.mapping);

    expect(rows.map(row => row.requestRow.values.line_type)).toEqual(expectedTypes);
    expect(rows.every(row => row.requestRow.values.default_unit_price_cents === 123450)).toBe(true);
    expect(rows.every(row => row.requestRow.values.labor_hours === 1000)).toBe(true);
    expect(rows.map(row => row.requestRow.values.taxable).slice(0, 2)).toEqual([true, false]);
    expect(rows.map(row => row.requestRow.values.active).slice(0, 2)).toEqual([true, false]);
    expect(rows.every(row => row.errors.length === 0)).toBe(true);
  });

  test('treats routine numeric formatting as automatically recognized', () => {
    const parsed = priceBookCsvRowsFromParsed(parsePriceBookCsv('Title,Unit Price\nRoutine service,89.0'));
    const interpretation = interpretPriceBookImport(parsed.headers, parsed.rows);
    expect(interpretation.insights.default_unit_price).toMatchObject({ confidence: 'automatic' });
    expect(interpretation.insights.default_unit_price?.interpretations).toEqual(['89.0 -> $89.00']);
  });

  test('leaves ambiguous and cost headings unmapped while malformed mapped values still fail closed', () => {
    const parsed = priceBookCsvRowsFromParsed(parsePriceBookCsv('Label,Estimated Material Cost,Amount-ish,Status\nExample,$40,$90,Maybe'));
    const interpretation = interpretPriceBookImport(parsed.headers, parsed.rows);
    expect(interpretation.mapping).toEqual({});
    expect(interpretation.ignoredHeaders).toEqual(['Label', 'Estimated Material Cost', 'Amount-ish', 'Status']);

    const mapped = buildPriceBookImportRows(parsed.rows, { title: 'Label', active: 'Status' });
    expect(mapped[0].errors).toContain('Active must be true/false, yes/no, y/n, or 1/0.');
  });

  test('inspects the full column before declining a low-confidence generic mapping', () => {
    const parsed = priceBookCsvRowsFromParsed(parsePriceBookCsv([
      'Item Name,Type,Status',
      'One,Unknown,Maybe',
      'Two,Unknown,Maybe',
      'Three,Unknown,Maybe',
      'Four,Unknown,Maybe',
      'Five,Service,Active',
    ].join('\n')));
    const interpretation = interpretPriceBookImport(parsed.headers, parsed.rows);
    const rows = buildPriceBookImportRows(parsed.rows, interpretation.mapping);

    expect(interpretation.mapping).toMatchObject({ line_type: 'Type', active: 'Status' });
    expect(rows.slice(0, 4).every(row => row.errors.length === 2)).toBe(true);
    expect(rows[4].requestRow.values).toMatchObject({ line_type: 'other', active: true });
  });

  test('normalizes generic CSV rows with stable IDs, mapped-field presence, and exact price semantics', () => {
    const parsed = priceBookCsvRowsFromParsed(parsePriceBookCsv([
      'external_id,title,description,price,taxable,sku',
      'A-1,Diagnostic visit,,,true,SKU-1',
      'A-2,No-charge follow-up,Customer-safe,0,false,SKU-2',
    ].join('\n')));
    const mapping = autoMapPriceBookCsvHeaders(parsed.headers);
    const rows = buildPriceBookImportRows(parsed.rows, mapping);

    expect(rows).toHaveLength(2);
    expect(rows[0].requestRow.external_item_id).toBe('A-1');
    expect(rows[0].requestRow.values.default_unit_price_cents).toBeNull();
    expect(rows[0].requestRow.mapped_fields).toContain('default_unit_price_cents');
    expect(rows[0].requestRow.mapped_fields).not.toContain('customer_description');
    expect(rows[1].requestRow.values.default_unit_price_cents).toBe(0);
    expect(rows[1].requestRow.values.customer_description).toBe('Customer-safe');
    expect(rows[1].requestRow.values.taxable).toBe(false);
  });

  test('blocks repeated external IDs and does not invent provider-specific mappings', () => {
    const parsed = priceBookCsvRowsFromParsed(parsePriceBookCsv('external_id,title\nDUP-1,First\nDUP-1,Second'));
    const rows = buildPriceBookImportRows(parsed.rows, autoMapPriceBookCsvHeaders(parsed.headers));
    expect(rows.every(row => row.errors.includes('External item ID is repeated in this file.'))).toBe(true);
    expect(sourceFile('src/features/price-book/priceBookCsvReconciliation.ts')).not.toMatch(/Price Book Ninjas|Housecall Pro|Jobber|ServiceTitan/i);
  });

  test('blocks exact repeated rows without stable external IDs', () => {
    const parsed = priceBookCsvRowsFromParsed(parsePriceBookCsv('title,price\nDiagnostic visit,95\nDiagnostic visit,95'));
    const rows = buildPriceBookImportRows(parsed.rows, autoMapPriceBookCsvHeaders(parsed.headers));

    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.errors.includes('This exact row is repeated without an external item ID.'))).toBe(true);
  });

  test('rejects duplicate CSV headers before mapping can become ambiguous', () => {
    expect(() => priceBookCsvRowsFromParsed(parsePriceBookCsv('title,Title\nFirst,Second')))
      .toThrow('CSV headers must be unique so every mapped field is deterministic.');
  });

  test('reconciliation migration creates private tenant audit without embedding rollback or provider delivery', () => {
    const sql = sourceFile('servsync-price-book-repeat-import-reconciliation.sql');

    for (const table of ['contractor_price_book_import_sources', 'contractor_price_book_import_batches', 'contractor_price_book_import_batch_rows']) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toMatch(new RegExp(`revoke all privileges on table public\\.${table} from public, anon, authenticated`, 'i'));
    }
    expect(sql).toContain('servsync_private_protect_price_book_import_batch_row');
    expect(sql).toContain('Price Book import row audit is append-only.');
    expect(sql).toContain('servsync_private_protect_price_book_import_batch');
    expect(sql).toContain('Completed Price Book import batches are immutable.');
    expect(sql).toContain("status text not null default 'building'");
    expect(sql).toContain("set status = 'completed'");
    expect(sql).toContain('servsync_preview_price_book_import');
    expect(sql).toContain('servsync_execute_price_book_import');
    expect(sql).toContain('servsync_list_price_book_import_batches');
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = public');
    expect(sql).toContain("provider = 'servsync_file_import'");
    expect(sql).toContain('external_object_mappings');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('idempotency_key');
    expect(sql).toContain('request_hash');
    expect(sql.match(/extensions\.digest\(/g)).toHaveLength(2);
    expect(sql).not.toMatch(/(?<!extensions\.)\bdigest\(/);
    expect(sql).toContain("v_action in ('add', 'update')");
    expect(sql).toContain('Choose exactly one explicit action for every import row.');
    expect(sql).toContain('Import file size must be between 1 byte and 1 MB.');
    expect(sql).toContain('p_file_size_bytes');
    expect(sql).toContain('Normalized values must contain only declared mapped fields.');
    expect(sql).toContain('Normalized Price Book import rows are too large.');
    expect(sql).toContain('This exact row is repeated without an external item ID.');
    expect(sql).toContain('More than one import row resolves to the same Price Book item.');
    expect(sql).toContain("'reconciliation_status'");
    expect(sql).toContain("elsif v_current is not distinct from v_baseline then");
    expect(sql).toContain("elsif v_current is not distinct from v_incoming then");
    expect(sql).toContain("v_conflicts := array_append(v_conflicts, v_field)");
    expect(sql).toContain('before_patch, after_patch, warnings, errors, outcome');
    expect(sql).not.toMatch(/create or replace function public\.[^(]*rollback/i);
    expect(sql).not.toMatch(/uqgtheclhxqlnjpfmheq|zpzdkoaubyjtsomccxya|bdytwgejqnlblhrnqxkp/i);
    expect(sql).not.toMatch(/send|email|sms|webhook|provider_delivery/i);
    expect(sql).not.toMatch(/raw_file|file_contents|csv_contents/i);
  });

  test('rollback migration is additive, private, conflict-aware, and preserves the original audit', () => {
    const sql = sourceFile('servsync-price-book-import-batch-rollback.sql');
    expect(sql).toContain('contractor_price_book_import_rollback_batches');
    expect(sql).toContain('contractor_price_book_import_rollback_rows');
    expect(sql).toContain('servsync_preview_price_book_import_rollback');
    expect(sql).toContain('servsync_execute_price_book_import_rollback');
    expect(sql).toContain('force row level security');
    expect(sql).toContain('Price Book import rollback row audit is append-only.');
    expect(sql).toContain("later_row.after_patch ? v_field");
    expect(sql).toContain("set active = false");
    expect(sql).not.toMatch(/delete from public\.contractor_price_book_items/i);
    expect(sql).not.toMatch(/update public\.contractor_price_book_import_batch_rows/i);
    expect(sql).toMatch(/grant execute on function public\.servsync_preview_price_book_import_rollback\(uuid\)[\s\S]*to authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.servsync_execute_price_book_import_rollback\(uuid, uuid\)[\s\S]*to authenticated/i);
    expect(sql).not.toMatch(/uqgtheclhxqlnjpfmheq|zpzdkoaubyjtsomccxya|bdytwgejqnlblhrnqxkp/i);
  });

  test('fails closed through canonical contractor management authority and private mappings', () => {
    const sql = sourceFile('servsync-price-book-repeat-import-reconciliation.sql');
    expect(sql).toContain('servsync_current_contractor_profile()');
    expect(sql).toContain('current_user_can_manage_contractor_estimate_settings(v_contractor_id)');
    expect(sql).toMatch(/revoke all on function public\.servsync_private[\s\S]*from public, anon, authenticated/i);
    expect(sql).toMatch(/revoke all on function public\.servsync_execute_price_book_import[\s\S]*from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.servsync_execute_price_book_import[\s\S]*to authenticated/i);
    expect(sourceFile('servsync-integration-foundation.sql')).toContain('revoke all on table public.external_object_mappings from authenticated');
  });

  test('renders a responsive preview-first Add/Update/Skip flow and executes once', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await installImportHarness(page);
    await expect(page.getByLabel('Existing source')).toHaveValue('source-1');
    await page.getByLabel('Choose CSV or XLSX').setInputFiles({
      name: 'catalog.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('external_id,title,price\nA-1,Diagnostic visit,\nA-2,No-charge follow-up,0'),
    });
    await expect(page.getByText('2 rows; 0 blocked before server preview.')).toBeVisible();
    await page.getByRole('button', { name: 'Preview reconciliation' }).click();
    await expect(page.getByTestId('price-book-import-review-row')).toHaveCount(2);
    await expect(page.getByText(/Row 2 · New · New item/i)).toBeVisible();
    await expect(page.getByText(/Row 3 · Changed · Matched using External Item ID/i)).toBeVisible();
    await expect(page.getByLabel('Action').nth(0)).toHaveValue('add');
    await expect(page.getByLabel('Action').nth(1)).toHaveValue('update');
    await expect(page.getByText('Price Required').first()).toBeVisible();
    await expect(page.getByText('$0.00').first()).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    page.once('dialog', dialog => void dialog.accept());
    await page.getByRole('button', { name: 'Confirm and apply import' }).dblclick();
    await expect(page.getByText('Import complete: 1 added, 1 updated, 0 skipped.')).toBeVisible();
    const calls = await page.evaluate(() => (window as typeof window & { __priceBookImportHarness?: { executeCalls: number; completedCalls: number; executeActions: Record<string, string> } }).__priceBookImportHarness);
    expect(calls).toMatchObject({ executeCalls: 1, completedCalls: 1, executeActions: { 2: 'add', 3: 'update' } });
  });

  test('shows confidence-aware interpretations, ignored columns, and preserves manual override', async ({ page }) => {
    await installImportHarness(page);
    await page.getByLabel('Choose CSV or XLSX').setInputFiles({
      name: 'contractor-export.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('SKU,Item Name,Description,Item Type,Unit Price,Estimated Labor Hours,Estimated Material Cost,Taxable,Status\nHVAC-1,Diagnostic visit,Customer copy,Service,$189.00,0.7,$42.00,TRUE,Active'),
    });

    await expect(page.getByText('1 rows; 0 blocked before server preview.')).toBeVisible();
    await expect(page.getByTestId('price-book-mapping-insight-line_type')).toContainText('Recognized');
    await expect(page.getByTestId('price-book-mapping-insight-line_type')).not.toContainText('other');
    await expect(page.getByTestId('price-book-mapping-insight-active')).toContainText('Active -> true');
    await expect(page.getByTestId('price-book-mapping-insight-external_item_id')).toContainText('stable repeat-import identity');
    await expect(page.getByTestId('price-book-ignored-columns')).toContainText('Estimated Material Cost');

    await page.getByLabel('Customer description').selectOption('Item Name');
    await expect(page.getByTestId('price-book-mapping-insight-customer_description')).toContainText('Selected by you');
    await page.getByLabel('Customer description').selectOption('Description');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Preview reconciliation' }).click();
    const state = await page.evaluate(() => (window as typeof window & { __priceBookImportHarness?: { previewRows: Array<{ external_item_id: string; values: Record<string, unknown> }> } }).__priceBookImportHarness);
    expect(state?.previewRows[0]).toMatchObject({ external_item_id: 'HVAC-1', values: { line_type: 'other', default_unit_price_cents: 18900, labor_hours: 0.7, active: true } });
  });

  test('shows cross-source duplicate evidence, defaults to Skip, and permits an intentional Add as new', async ({ page }) => {
    await installImportHarness(page, [existingItem(1, { title: 'Diagnostic visit', category: '', trade: '', line_type: 'other', default_unit_price_cents: null })]);
    await page.getByLabel('Choose CSV or XLSX').setInputFiles({
      name: 'alternate-source.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('external_id,title,description,line_type,price\nALT-1,Diagnostic visit,Customer-safe description 1,Service,'),
    });
    await page.getByRole('button', { name: 'Preview reconciliation' }).click();
    await expect(page.getByTestId('price-book-possible-duplicate')).toContainText('same normalized title');
    await expect(page.getByText(/Needs attention · Possible duplicate/i)).toBeVisible();
    await expect(page.getByLabel('Action')).toHaveValue('skip');
    await expect(page.getByLabel('Action').locator('option')).toHaveText(['Add as new', 'Skip']);
    await page.getByLabel('Action').selectOption('add');
    await expect(page.getByLabel('Action')).toHaveValue('add');
  });

  test('explains a fully unchanged repeat import in contractor language', async ({ page }) => {
    await installImportHarness(page);
    await page.getByLabel('Choose CSV or XLSX').setInputFiles({
      name: 'repeat.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('external_id,title,price\nSAME-1,Unchanged service,89'),
    });
    await page.getByRole('button', { name: 'Preview reconciliation' }).click();
    await expect(page.getByTestId('price-book-import-up-to-date')).toContainText('1 item already up to date');
    await expect(page.getByText(/Already up to date · Matched using External Item ID/i)).toBeVisible();
    await expect(page.getByLabel('Action')).toHaveValue('skip');
  });

  test('previews a completed batch rollback and confirms one responsive mutation', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await installImportHarness(page);
    await page.getByText('Recent import history').click();
    await page.getByRole('button', { name: 'Preview rollback' }).click();
    await expect(page.getByTestId('price-book-rollback-preview')).toBeVisible();
    await expect(page.getByTestId('price-book-rollback-row')).toHaveCount(3);
    await expect(page.getByText('Restore title')).toBeVisible();
    await expect(page.getByText('Archive imported item')).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    page.once('dialog', dialog => void dialog.accept());
    await page.getByRole('button', { name: 'Confirm rollback' }).click();
    await expect(page.getByText('Rollback complete: 1 restored, 1 archived, 1 unchanged.')).toBeVisible();
    const state = await page.evaluate(() => (window as typeof window & { __priceBookImportHarness?: { rollbackPreviewCalls: number; rollbackExecuteCalls: number; rollbackCompletedCalls: number } }).__priceBookImportHarness);
    expect(state).toMatchObject({ rollbackPreviewCalls: 1, rollbackExecuteCalls: 1, rollbackCompletedCalls: 1 });
  });
});
