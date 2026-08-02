import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  autoMapPriceBookCsvHeaders,
  buildPriceBookImportRows,
  parsePriceBookCsv,
  priceBookCsvRowsFromParsed,
} from '../../src/features/price-book/priceBookCsvReconciliation';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

async function installImportHarness(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<Record<string, unknown>>;
    const reactModule = await dynamicImport('/node_modules/.vite/deps/react.js');
    const reactDomModule = await dynamicImport('/node_modules/.vite/deps/react-dom_client.js');
    const panelModule = await dynamicImport('/src/features/price-book/PriceBookCsvReconciliationPanel.tsx');
    const React = reactModule.default as { createElement: (...args: unknown[]) => unknown };
    const createRoot = (reactDomModule.default as { createRoot: (element: HTMLElement) => { render: (node: unknown) => void } }).createRoot;
    const Panel = panelModule.PriceBookCsvReconciliationPanel as (...args: unknown[]) => unknown;
    const state = { previewRows: [] as Array<Record<string, unknown>>, executeCalls: 0, completedCalls: 0, executeActions: {} as Record<string, string> };
    (window as typeof window & { __priceBookImportHarness?: typeof state }).__priceBookImportHarness = state;
    document.body.innerHTML = '<main id="price-book-import-root"></main>';
    createRoot(document.getElementById('price-book-import-root') as HTMLElement).render(React.createElement(Panel, {
      api: {
        listSources: async () => [{ id: 'source-1', display_name: 'Master catalog', source_kind: 'file_upload', status: 'active', created_at: '2026-08-02T12:00:00.000Z' }],
        createSource: async (displayName: string) => ({ id: 'source-2', display_name: displayName, source_kind: 'file_upload', status: 'active', created_at: '2026-08-02T12:00:00.000Z' }),
        preview: async (_sourceId: string, rows: Array<Record<string, unknown>>) => {
          state.previewRows = rows;
          return {
            source: { id: 'source-1', display_name: 'Master catalog' },
            counts: { add: 1, update: 1, skip: 0, error: 0 },
            rows: rows.map((row, index) => ({
              row_number: row.row_number,
              external_item_id: row.external_item_id,
              sku: null,
              row_fingerprint: 'a'.repeat(64),
              mapped_fields: row.mapped_fields,
              match_type: index === 0 ? 'none' : 'external_id',
              reconciliation_status: index === 0 ? 'new' : 'changed',
              match_confidence: index === 0 ? 'none' : 'high',
              target_item_id: index === 0 ? null : 'item-2',
              target_updated_at: index === 0 ? null : '2026-08-02T12:00:00.000Z',
              current_values: index === 0 ? null : { title: 'Old follow-up', default_unit_price_cents: 100 },
              incoming_values: row.values,
              result_values: row.values,
              changed_fields: index === 0 ? [] : ['title', 'default_unit_price_cents'],
              conflict_fields: [],
              recommended_action: index === 0 ? 'add' : 'update',
              allowed_actions: index === 0 ? ['add', 'skip'] : ['update', 'skip'],
              warnings: [],
              errors: [],
            })),
          };
        },
        execute: async (input: { actions: Record<string, string> }) => {
          state.executeCalls += 1;
          state.executeActions = input.actions;
          return { batch_id: 'batch-1', status: 'completed', source_id: 'source-1', row_count: 2, add_count: 1, update_count: 1, skip_count: 0, error_count: 0, idempotent: false };
        },
        listBatches: async () => [],
      },
      onCompleted: async () => { state.completedCalls += 1; },
    }));
  });
}

test.describe('FB-024 Price Book Repeat-Import Reconciliation v1', () => {
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

  test('migration creates private tenant audit and authenticated manager RPCs without rollback or provider delivery', () => {
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
    await page.getByLabel('Choose CSV').setInputFiles({
      name: 'catalog.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('external_id,title,price\nA-1,Diagnostic visit,\nA-2,No-charge follow-up,0'),
    });
    await expect(page.getByText('2 rows; 0 blocked before server preview.')).toBeVisible();
    await page.getByRole('button', { name: 'Preview reconciliation' }).click();
    await expect(page.getByTestId('price-book-import-review-row')).toHaveCount(2);
    await expect(page.getByText(/Row 2 · New · New item/i)).toBeVisible();
    await expect(page.getByText(/Row 3 · Changed · Stable external ID match/i)).toBeVisible();
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
});
