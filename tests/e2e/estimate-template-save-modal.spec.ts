import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('Estimate template save modal', () => {
  test('Save as template opens a modal instead of the old prompt flow', () => {
    const source = appSource();
    const saveSource = sourceBetween(source, 'const saveEstimateAsTemplate = async', 'const renameEstimateTemplate = async');
    const modalSource = sourceBetween(source, '{saveEstimateTemplateModal && (', '</SidebarLayout>');

    expect(source).toContain('const [saveEstimateTemplateModal, setSaveEstimateTemplateModal]');
    expect(source).toContain('const openSaveEstimateTemplateModal = (estimate: Estimate)');
    expect(source).toContain('onClick={() => openSaveEstimateTemplateModal(estimate)}');
    expect(saveSource).not.toContain('window.prompt');
    expect(modalSource).toContain('data-testid="save-estimate-template-modal"');
    expect(modalSource).toContain('role="dialog"');
    expect(modalSource).toContain('aria-modal="true"');
  });

  test('modal includes required copy and blocks invalid saves', () => {
    const source = appSource();
    const saveSource = sourceBetween(source, 'const saveEstimateAsTemplate = async', 'const renameEstimateTemplate = async');
    const modalSource = sourceBetween(source, '{saveEstimateTemplateModal && (', '</SidebarLayout>');

    for (const copy of [
      'Save as template',
      'Reuse this estimate structure for future work.',
      'Template name',
      'What should this template include?',
      'Save structure only',
      'Save scope, notes, terms, quantities, and line items without prices.',
      'Save structure and pricing',
      'Save line items with the current prices so future estimates can start with the same pricing.',
      'Save template',
      'Cancel',
    ]) {
      expect(modalSource).toContain(copy);
    }

    expect(saveSource).toContain('const templateName = saveEstimateTemplateModal.name.trim()');
    expect(saveSource).toContain("error: 'Template name is required.'");
    expect(saveSource).toContain("error: 'Add at least one line item before saving this estimate as a template.'");
    expect(saveSource).toContain('if (sortedLineItems.length === 0)');
  });

  test('structure-only and priced template saves use the existing contractor-owned insert path', () => {
    const source = appSource();
    const saveSource = sourceBetween(source, 'const saveEstimateAsTemplate = async', 'const renameEstimateTemplate = async');

    expect(saveSource).toContain("const includePricing = saveEstimateTemplateModal.pricingMode === 'structure_and_pricing'");
    expect(saveSource).toContain(".from('estimate_templates').insert({");
    expect(saveSource).toContain('contractor_id: contractor.id');
    expect(saveSource).toContain('name: templateName');
    expect(saveSource).toContain("trade: contractorDraft.service_categories[0] || ''");
    expect(saveSource).toContain("scope: estimate.scope || ''");
    expect(saveSource).toContain("notes: estimate.notes || ''");
    expect(saveSource).toContain("terms: estimate.terms || ''");
    expect(saveSource).toContain('line_items: sortedLineItems.map((line, index) => ({');
    expect(saveSource).toContain('line_type: normalizeEstimateLineType(line.line_type)');
    expect(saveSource).toContain('line_title: line.line_title || line.description ||');
    expect(saveSource).toContain('customer_description: line.customer_description ||');
    expect(saveSource).toContain('model_spec: line.model_spec ||');
    expect(saveSource).toContain('supply_status: normalizeEstimateLineSupplyStatus(line.supply_status) || null');
    expect(saveSource).toContain('quantity: line.quantity');
    expect(saveSource).toContain('unit: line.unit');
    expect(saveSource).toContain('unit_price_cents: includePricing ? line.unit_price_cents : null');
    expect(saveSource).toContain('labor_hours: line.labor_hours ?? null');
    expect(saveSource).toContain('sort_order: index');
    expect(saveSource).toContain("setNotice('Template saved. You can use it when creating future estimates.')");
    expect(saveSource).toContain('await loadContractor()');
  });

  test('save flow does not mutate estimates or templates beyond the new template insert', () => {
    const source = appSource();
    const saveSource = sourceBetween(source, 'const saveEstimateAsTemplate = async', 'const renameEstimateTemplate = async');

    expect(saveSource).not.toContain(".from('estimates')");
    expect(saveSource).not.toContain(".from('invoices')");
    expect(saveSource).not.toContain(".from('inspections')");
    expect(saveSource).not.toContain('.update(');
    expect(saveSource).not.toContain('.delete(');
    expect(saveSource).not.toContain('beginFieldWorkForLocalContact');
    expect(saveSource).not.toContain('beginInvoiceDraftForCustomer');
    expect(saveSource).not.toContain('sendEstimate');
    expect(saveSource).not.toContain('labor_mode');
    expect(saveSource).not.toContain('labor_rate');
    expect(saveSource).not.toContain('job_labor_hours');
    expect(saveSource).not.toContain('total_cents');
    expect(saveSource).not.toContain('editor_source_note');
  });

  test('Slice C template-start warnings remain compatible with both saved template modes', () => {
    const source = appSource();
    const noticeSource = sourceBetween(source, 'function estimateTemplateHasCopiedPricing', 'function defaultEstimateTemplateName');

    expect(noticeSource).toContain('unit_price_cents !== null && line.unit_price_cents !== undefined');
    expect(noticeSource).toContain('Pricing copied from saved template. Review all prices before sending. New/current pricing has not been entered for this estimate yet.');
    expect(noticeSource).toContain('Prices were not saved with this template. Add pricing before sending.');
  });
});
