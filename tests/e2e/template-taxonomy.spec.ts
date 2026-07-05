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

test.describe('Jobs template taxonomy', () => {
  test('Jobs overview uses clarified template helper copy', () => {
    const source = appSource();
    const jobsOverviewSource = sourceBetween(
      source,
      'data-testid="contractor-jobs-overview-tools-list"',
      "{contractorJobsView === 'new_financial' && (",
    );

    expect(jobsOverviewSource).toContain('Saved work templates and inspection checklists');
    expect(jobsOverviewSource).not.toContain('Workflow and estimate starters');
  });

  test('Templates library separates saved work templates from inspection checklists', () => {
    const source = appSource();
    const templatesSource = sourceBetween(
      source,
      "{contractorJobsView === 'templates' && (",
      "{contractorJobsView === 'overview' && (",
    );

    expect(templatesSource).toContain('Saved Work Templates');
    expect(templatesSource).toContain('Saved Work Templates are reusable estimate-backed structures today. Use them to start estimates now. Invoice draft and direct job starts are future workflow options.');
    expect(templatesSource).toContain('Inspection Checklists');
    expect(templatesSource).toContain('Your Inspection Checklists');
    expect(templatesSource).toContain('Home-specific Inspection Checklists');
    expect(templatesSource).toContain('Home-specific checklists are saved inspection/report layouts for a property. Full Home Setup Templates and Home Map tools are future work.');
    expect(templatesSource).not.toContain('Your estimate templates');
    expect(templatesSource).not.toContain('Inspection templates');
    expect(templatesSource).not.toContain('Your Templates');
    expect(templatesSource).not.toContain('Home Templates');
  });

  test('Saved Work Templates expose only estimate starts while invoice and direct-job starts stay future-only', () => {
    const source = appSource();
    const estimateTemplateStartSource = sourceBetween(source, 'const renderSavedEstimateTemplateStartPicker =', 'const renderBuildEstimateDraftPanel =');
    const savedWorkTemplatesSource = sourceBetween(
      source,
      "{templateLibraryView === 'estimate' && filteredCustomEstimateTemplates.length > 0 && (",
      "{templateLibraryView === 'generic' && filteredStarterTemplates.length > 0 && (",
    );

    expect(estimateTemplateStartSource).toContain('Use for Estimate');
    expect(savedWorkTemplatesSource).toContain('Use for Estimate');
    expect(savedWorkTemplatesSource).toContain('Create Invoice Draft - Future');
    expect(savedWorkTemplatesSource).toContain('Start Direct Job - Future');
    expect(savedWorkTemplatesSource).toContain('Copied template pricing must be reviewed before sending any estimate.');
    expect(savedWorkTemplatesSource).toContain('Template prices are not current, recommended, or already approved pricing.');
    expect(savedWorkTemplatesSource).not.toContain('beginInvoiceDraftForCustomer');
    expect(savedWorkTemplatesSource).not.toContain('saveInvoiceDraft');
    expect(savedWorkTemplatesSource).not.toContain('startNewInspection');
    expect(savedWorkTemplatesSource).not.toContain('beginFieldWorkForHomeowner');
    expect(savedWorkTemplatesSource).not.toContain('beginFieldWorkForLocalContact');
  });

  test('selected customer context can create manual invoice drafts from saved work templates without sending or creating jobs', () => {
    const source = appSource();
    const selectedCustomerTemplateSource = sourceBetween(
      source,
      'Create Manual Invoice Draft uses the selected customer context only.',
      '{activeDocumentRecords.length === 0 ? (',
    );
    const invoiceTemplateDraftSource = sourceBetween(
      source,
      'function invoiceDraftFromTemplate(',
      'function invoiceTemplateStartNoticeForTemplate',
    );
    const applyInvoiceTemplateSource = sourceBetween(
      source,
      'const applySavedEstimateTemplateInvoiceDraft =',
      'const closeActiveInvoiceEditor =',
    );

    expect(selectedCustomerTemplateSource).toContain('Create Manual Invoice Draft');
    expect(selectedCustomerTemplateSource).toContain('Creates a draft invoice from this template. Confirm the work was performed and review all prices before sending.');
    expect(selectedCustomerTemplateSource).toContain('This does not create a job or estimate and does not send the invoice.');
    expect(selectedCustomerTemplateSource).toContain('applySavedEstimateTemplateInvoiceDraft(template, subjectName');
    expect(selectedCustomerTemplateSource).toContain('workspaceNewRecordHomeId');
    expect(selectedCustomerTemplateSource).toContain('workspaceNewRecordLocalHomeId');

    expect(invoiceTemplateDraftSource).toContain('title: `Invoice — ${template.name}');
    expect(invoiceTemplateDraftSource).toContain('scope: template.scope');
    expect(invoiceTemplateDraftSource).toContain('notes: template.notes');
    expect(invoiceTemplateDraftSource).toContain('terms: template.terms');
    expect(invoiceTemplateDraftSource).toContain('line_type: normalizeEstimateLineType(line.line_type)');
    expect(invoiceTemplateDraftSource).toContain('line_title: line.line_title');
    expect(invoiceTemplateDraftSource).toContain('customer_description: line.customer_description');
    expect(invoiceTemplateDraftSource).toContain('model_spec: line.model_spec');
    expect(invoiceTemplateDraftSource).toContain('supply_status: normalizeEstimateLineSupplyStatus(line.supply_status)');
    expect(invoiceTemplateDraftSource).toContain('quantity: String(line.quantity)');
    expect(invoiceTemplateDraftSource).toContain('unit: line.unit');
    expect(invoiceTemplateDraftSource).toContain('unit_price: lineUnitPriceInputFromCents(line.unit_price_cents)');
    expect(invoiceTemplateDraftSource).toContain('labor_hours: laborHoursInputFromValue(line.labor_hours)');

    expect(applyInvoiceTemplateSource).toContain('setInvoiceDraft(invoiceDraftFromTemplate(template');
    expect(applyInvoiceTemplateSource).toContain('setInvoiceTemplateStartNotice(invoiceTemplateStartNoticeForTemplate(template))');
    expect(applyInvoiceTemplateSource).toContain('setInvoiceComposerOpen(true)');
    expect(applyInvoiceTemplateSource).toContain('setEstimateComposerOpen(false)');
    expect(applyInvoiceTemplateSource).not.toContain('saveInvoiceDraft');
    expect(applyInvoiceTemplateSource).not.toContain('sendInvoiceToHomeowner');
    expect(applyInvoiceTemplateSource).not.toContain('startNewInspection');
    expect(applyInvoiceTemplateSource).not.toContain('beginFieldWorkForHomeowner');
    expect(applyInvoiceTemplateSource).not.toContain('beginFieldWorkForLocalContact');
    expect(applyInvoiceTemplateSource).not.toContain('createInvoiceFromEstimate');
    expect(applyInvoiceTemplateSource).not.toContain('createInvoiceFromJob');
  });

  test('home-scoped inspection checklist UI no longer uses general Home Templates labels', () => {
    const source = appSource();
    const homeScopedSource = sourceBetween(
      source,
      'const defaultHomeTemplateName =',
      'const persistInspectionRooms =',
    ) + sourceBetween(
      source,
      '{homeTemplatePrompt && (',
      "{contractorTab === 'overview' && (",
    );

    expect(homeScopedSource).toContain('Home-specific Inspection Checklist');
    expect(homeScopedSource).toContain('home-specific inspection checklist');
    expect(homeScopedSource).not.toContain('Home Template');
    expect(homeScopedSource).not.toContain('home template');
  });

  test('saved work templates still use estimate template data and inspection checklists still use inspection templates', () => {
    const source = appSource();
    const loadSource = sourceBetween(source, '// Load inspection templates and inspections', 'if (!estimateTemplatesRes.error) setEstimateTemplates');
    const estimateTemplateStartSource = sourceBetween(source, 'const renderSavedEstimateTemplateStartPicker =', 'const renderBuildEstimateDraftPanel =');
    const templatesSource = sourceBetween(source, "{contractorJobsView === 'templates' && (", "{contractorJobsView === 'overview' && (");

    expect(loadSource).toContain(".from('inspection_templates')");
    expect(loadSource).toContain(".from('estimate_templates')");
    expect(estimateTemplateStartSource).toContain('estimateTemplates.map(template =>');
    expect(templatesSource).toContain('estimateTemplates.length');
    expect(templatesSource).toContain('contractorScopedInspectionTemplates.length');
    expect(templatesSource).toContain('homeScopedInspectionTemplates.length');
  });

  test('direct service job creation remains separate from estimate templates', () => {
    const source = appSource();
    const createJobSource = sourceBetween(source, 'const startNewInspection = async () => {', 'const saveTemplate = async () => {');
    const newJobFormSource = sourceBetween(source, "{inspectionView === 'new' && (", "{inspectionView === 'detail' && activeInspection && (() => {");
    const invoiceStartSource = sourceBetween(source, 'const beginInvoiceDraftForCustomer =', 'const defaultEstimateDraftBuilderTrade =');
    const invoiceSaveSource = sourceBetween(source, 'const saveInvoiceDraft = async', 'const sendInvoiceToHomeowner = async');

    expect(createJobSource).toContain("supabase.rpc('servsync_create_field_work'");
    expect(createJobSource).not.toContain('estimate_templates');
    expect(createJobSource).not.toContain('estimateDraftFromTemplate');
    expect(invoiceStartSource).not.toContain('estimate_templates');
    expect(invoiceStartSource).not.toContain('estimateTemplates');
    expect(invoiceStartSource).not.toContain('estimateDraftFromTemplate');
    expect(invoiceSaveSource).not.toContain('estimate_templates');
    expect(invoiceSaveSource).not.toContain('estimateTemplates');
    expect(invoiceSaveSource).not.toContain('estimateDraftFromTemplate');
    expect(newJobFormSource).toContain('Blank Service Job');
    expect(newJobFormSource).toContain('Repair');
    expect(newJobFormSource).toContain('Install');
  });

  test('does not add forbidden backend or platform-scope changes', () => {
    const source = appSource();

    expect(source).not.toContain('createWorkTemplate');
    expect(source).not.toContain('home_map');
    expect(source).not.toContain('floor_plan');
  });
});
