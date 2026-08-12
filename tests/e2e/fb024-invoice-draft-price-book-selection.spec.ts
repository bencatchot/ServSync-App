import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('FB-024 Invoice Draft Price Book Selection v1', () => {
  test('intersects Price Book visibility with existing Invoice billing authority', () => {
    const app = sourceFile('src/App.tsx');
    const workspace = sourceFile('src/features/drafts/DurableDraftWorkspace.tsx');
    expect(app).toContain('const canUseInvoiceDraftPriceBook = priceBookAccess.canView && effectiveDurableDraftCapabilities.canLaunchInvoice;');
    expect(workspace).toContain("canViewPriceBook={canViewPriceBook && (form.intended_output !== 'invoice' || capabilities.canLaunchInvoice)}");
    expect(app).not.toContain('canUseInvoiceDraftPriceBook = priceBookAccess.canView;');
  });

  test('appends to legacy editable Invoice Draft lines without merging or side effects', () => {
    const app = sourceFile('src/App.tsx');
    const handler = sourceBetween(app, 'const addPriceBookLinesToInvoiceDraft =', 'const renderEstimateSavedItemPicker =');
    expect(handler).toContain('if (!canUseInvoiceDraftPriceBook || lines.length === 0) return;');
    expect(handler).toContain('line_items: [...(draft.line_items ?? []), ...lines]');
    expect(handler).not.toContain('saveInvoiceDraft');
    expect(handler).not.toContain('sendInvoiceToHomeowner');
    expect(handler).not.toContain('servsync_');
    expect(handler).not.toContain(".from('");
    expect(handler).not.toMatch(/merge|dedup/i);
  });

  test('keeps legacy editor draft-only and preserves inherited Invoice paths', () => {
    const app = sourceFile('src/App.tsx');
    const openInvoice = sourceBetween(app, 'const openInvoiceRecord = (invoice: Invoice) => {', 'const openEstimateRecord = (estimate: Estimate) => {');
    const saveInvoice = sourceBetween(app, 'const saveInvoiceDraft = async', 'const sendInvoiceToHomeowner = async');
    const invoiceFromCustomer = sourceBetween(app, 'const beginInvoiceDraftForCustomer =', 'const defaultEstimateDraftBuilderTrade =');
    const jobInvoice = sourceBetween(app, 'const createInvoiceFromJob = async', 'const openPartialInvoiceReview =');
    const partialInvoice = sourceBetween(app, 'const createPartialInvoiceFromSelectedItems = async', 'const manualWorkItemCanEdit =');
    expect(openInvoice).toContain("if (invoice.status === 'draft')");
    expect(openInvoice).toContain('setInvoiceComposerOpen(true)');
    expect(openInvoice).toContain('setInvoiceComposerOpen(false)');
    expect(saveInvoice).toContain("currentInvoice.status !== 'draft'");
    expect(saveInvoice).toContain('Only draft invoices can be edited in this version.');
    expect(invoiceFromCustomer).toContain('sourceEstimate?.line_items?.length');
    expect(invoiceFromCustomer).toContain('.map(line => createEstimateLineDraft({');
    expect(jobInvoice).toContain("supabase.rpc('servsync_create_invoice_from_job'");
    expect(partialInvoice).toContain("supabase.rpc('servsync_create_partial_invoice_from_job'");
  });

  test('uses one snapshot allowlist and never persists raw Price Book identity', () => {
    const mapper = sourceFile('src/features/price-book/priceBookEstimateLineSnapshot.ts');
    const picker = sourceFile('src/features/price-book/DraftPriceBookPicker.tsx');
    expect(mapper).toContain('export function priceBookItemToDraftLineSnapshot');
    expect(mapper).toContain('export const priceBookItemToEstimateLineDraft = priceBookItemToDraftLineSnapshot;');
    expect(picker).toContain('priceBookItemToDraftLineSnapshot(item');
    for (const privateField of [
      'item.id', 'item.contractor_id', 'item.internal_notes', 'item.internal_cost_cents',
      'item.sku', 'item.source', 'item.trade', 'item.category', 'item.subcategory',
      'item.taxable', 'item.archived_at',
    ]) expect(mapper).not.toContain(privateField);
  });

  test('keeps Price Book selection client-only and active-item scoped', () => {
    const picker = sourceFile('src/features/price-book/DraftPriceBookPicker.tsx');
    expect(picker).toContain("status: 'active'");
    expect(picker).toContain('addingSelectionRef.current');
    expect(picker).not.toContain('onSave(');
    expect(picker).not.toContain('onLaunch(');
    expect(picker).not.toContain('supabase');
    expect(picker).not.toContain('fetch(');
    expect(picker).not.toContain('localStorage');
    expect(picker).not.toContain('sessionStorage');
  });
});
