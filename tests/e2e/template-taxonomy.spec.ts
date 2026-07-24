import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
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

function sourceDiff(path: string) {
  return execFileSync('git', ['diff', '--', path], { encoding: 'utf8' });
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
      "{contractorJobsView === 'overview' && !durableDraftCohortLoading && !sharedDraftComposerEnabled && (",
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

  test('global Saved Work Templates keep direct-job starts future-only', () => {
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

  test('selected customer estimates panel does not render template catalogs as customer records', () => {
    const source = appSource();
    const selectedCustomerEstimatePanelSource = sourceBetween(
      source,
      "{(activeTabId === 'estimates' || activeTabId === 'invoices') && (",
      "{activeTabId === 'requests' && conn && (",
    );

    expect(selectedCustomerEstimatePanelSource).toContain('Create estimate');
    expect(selectedCustomerEstimatePanelSource).toContain('selectedDocumentSection.estimates.map(estimate =>');
    expect(selectedCustomerEstimatePanelSource).toContain('recordPropertyLabelForContractor(estimate)');
    expect(selectedCustomerEstimatePanelSource).toContain('noSubjectEstimateCopy');
    expect(selectedCustomerEstimatePanelSource).not.toContain('ServSync estimate starters');
    expect(selectedCustomerEstimatePanelSource).not.toContain('Search estimate templates');
    expect(selectedCustomerEstimatePanelSource).not.toContain('visibleStarterEstimateTemplates');
    expect(selectedCustomerEstimatePanelSource).not.toContain('visibleEstimateTemplates');
    expect(selectedCustomerEstimatePanelSource).not.toContain('Saved Work Templates');
    expect(selectedCustomerEstimatePanelSource).not.toContain('Create Manual Invoice Draft');
    expect(selectedCustomerEstimatePanelSource).not.toContain('Start Manual Job');
  });

  test('intentional estimate creation flow still offers saved templates without direct invoice or job actions', () => {
    const source = appSource();
    const beginEstimateSource = sourceBetween(
      source,
      'const beginEstimateDraftForCustomer =',
      'const beginInvoiceDraftFromEstimate =',
    );
    const estimateStartChoiceSource = sourceBetween(
      source,
      'const renderEstimateStartChoice =',
      'const renderSavedEstimateTemplateStartPicker =',
    );
    const templatePickerSource = sourceBetween(
      source,
      'const renderSavedEstimateTemplateStartPicker =',
      'const renderBuildEstimateDraftPanel =',
    );

    expect(beginEstimateSource).toContain("setEstimateStartMode('choose')");
    expect(beginEstimateSource).toContain('setEstimateComposerOpen(true)');
    expect(estimateStartChoiceSource).toContain('Choose estimate template');
    expect(estimateStartChoiceSource).toContain("setEstimateStartMode('template')");
    expect(templatePickerSource).toContain('estimateTemplates.map(template =>');
    expect(templatePickerSource).toContain('Use for Estimate');
    expect(templatePickerSource).toContain('applySavedEstimateTemplateStart(template, subjectName)');
    expect(templatePickerSource).not.toContain('Create Manual Invoice Draft');
    expect(templatePickerSource).not.toContain('Start Manual Job');
    expect(templatePickerSource).not.toContain('invoiceDraftFromTemplate');
    expect(templatePickerSource).not.toContain('beginFieldWorkForHomeowner');
    expect(templatePickerSource).not.toContain('beginFieldWorkForLocalContact');
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
    const templatesSource = sourceBetween(
      source,
      "{contractorJobsView === 'templates' && (",
      "{contractorJobsView === 'overview' && !durableDraftCohortLoading && !sharedDraftComposerEnabled && (",
    );

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
    const newJobFormSource = sourceBetween(
      source,
      "{(inspectionView === 'new' || (!DRAFT_JOB_UI_ENABLED && inspectionView === 'draft_job')) && (",
      "{inspectionView === 'detail' && activeInspection && (() => {",
    );
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
    const diff = sourceDiff('src/App.tsx');

    expect(diff).not.toContain('createWorkTemplate');
    expect(diff).not.toContain('servsync_create_home_map');
    expect(diff).not.toContain('servsync_upsert_home_map');
    expect(diff).not.toContain('floor_plan');
  });
});
