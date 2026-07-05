import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findEstimateDraftLibraryBundleForScope } from '../../src/data/estimateDraftLibrary';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('Guided Estimate Draft Builder Slice A', () => {
  test('new estimate creation opens the guided builder for existing customers only', () => {
    const source = appSource();
    const beginSource = sourceBetween(source, 'const beginEstimateDraftForCustomer =', 'const closeActiveInvoiceEditor =');
    const customerWorkspaceCreateSource = sourceBetween(source, 'const defaultBuilderTrade = defaultEstimateDraftBuilderTrade();', 'Create estimate');

    expect(beginSource).toContain('setEstimateGuidedBuilderActive(true)');
    expect(beginSource).toContain('setEstimateReferenceToolsExpanded(false)');
    expect(beginSource).toContain('setEstimateDraftBuilderJobType(\'replacement\')');
    expect(customerWorkspaceCreateSource).toContain('setEstimateGuidedBuilderActive(true)');
    expect(beginSource).not.toContain('servsync_create_local_contact');
    expect(beginSource).not.toContain('createLocalContact');
    expect(source).not.toContain('createLocalContactForEstimate');
  });

  test('guided builder includes required copy, profile-trade priority, work type, and labor style controls', () => {
    const source = appSource();
    const panelSource = sourceBetween(source, 'const renderBuildEstimateDraftPanel =', 'const renderAdvancedTradeTools =');

    expect(panelSource).toContain('data-testid="guided-estimate-builder"');
    expect(panelSource).toContain('Build an estimate draft');
    expect(panelSource).toContain('Start with the customer, trade, work type, labor style, and rough scope. ServSync will suggest a draft recipe or a general builder.');
    expect(panelSource).toContain('tradeToolMatchesContractor(trade, contractorDraft.service_categories)');
    expect(panelSource).toContain('Your business profile trades');
    expect(panelSource).toContain('Other supported builder trades');
    expect(panelSource).toContain('Work type');
    expect(panelSource).toContain('Choose a broad action category, not a specific job.');
    expect(panelSource).toContain('Labor style');

    for (const label of [
      'Install / Replace',
      'Repair',
      'Service / Maintenance',
      'Inspection / Diagnostic',
      'Remodel / Upgrade',
      'Other',
    ]) {
      expect(source).toContain(label);
    }
  });

  test('recipe match preview is deterministic, limited to three, and includes the general fallback', () => {
    const source = appSource();
    const matchSource = sourceBetween(source, 'const ESTIMATE_DRAFT_RECIPE_REFERENCES', 'function resolveEstimateDraftLibraryBundle');
    const panelSource = sourceBetween(source, 'const renderBuildEstimateDraftPanel =', 'const renderAdvancedTradeTools =');
    const hvacReplacementBundle = findEstimateDraftLibraryBundleForScope({
      trade: 'hvac',
      work_category: 'replace',
      rough_scope: 'Replace HVAC system with furnace and AC changeout',
    });

    expect(hvacReplacementBundle?.display_name).toBe('HVAC System Replacement');
    expect(matchSource).toContain('hvac_system_replacement');
    expect(matchSource).toContain('focusTerms');
    expect(matchSource).toContain('.slice(0, 3)');
    expect(panelSource).toContain('Recommended recipe matches');
    expect(panelSource).toContain('Why this matched');
    expect(panelSource).toContain('Use this recipe');
    expect(panelSource).toContain('Use general builder');
    expect(panelSource).toContain('No specific recipe found yet. Use the general builder to create a clean editable draft from your scope.');
    expect(panelSource).toContain('This does not add AI or pricing recommendations.');
    expect(panelSource).not.toMatch(/\bOpenAI\b|AI-generated/i);
  });

  test('confirming a recipe or fallback generates the existing editable draft path', () => {
    const source = appSource();
    const applySource = sourceBetween(source, 'const applyEstimateDraftBuilder =', 'const renderBuildEstimateDraftPanel =');
    const panelSource = sourceBetween(source, 'const renderBuildEstimateDraftPanel =', 'const renderAdvancedTradeTools =');

    expect(applySource).toContain('options: { libraryBundle?: EstimateDraftLibraryBundle | null; forceGeneral?: boolean } = {}');
    expect(applySource).toContain('const libraryBundle = resolveEstimateDraftLibraryBundle({');
    expect(applySource).toContain('const selectedLibraryBundle = options.forceGeneral ? null');
    expect(applySource).toContain('? buildEstimateDraftFromLibraryBundle({');
    expect(applySource).toContain(': buildRuleBasedEstimateDraft({');
    expect(applySource).toContain('setEstimateGuidedBuilderActive(false)');
    expect(panelSource).toContain("onClick={() => applyEstimateDraftBuilder(subjectName, { libraryBundle: match.bundle })}");
    expect(panelSource).toContain("onClick={() => applyEstimateDraftBuilder(subjectName, { forceGeneral: true })}");
    expect(panelSource).toContain('Start blank estimate');
    expect(panelSource).toContain('Blank estimate ready. Add scope, lines, pricing, and terms manually.');
  });

  test('reference tools are collapsed by default and preserve existing estimating tools', () => {
    const source = appSource();
    const referenceSource = sourceBetween(source, 'const renderEstimateReferenceTools =', 'const startEstimateAssistantSpeech =');

    expect(source).toContain('const [estimateReferenceToolsExpanded, setEstimateReferenceToolsExpanded] = useState(false)');
    expect(referenceSource).toContain('Reference tools');
    expect(referenceSource).toContain('Saved charges, Price Book, templates, helper suggestions, and advanced calculators are available when you need them.');
    expect(referenceSource).toContain('aria-expanded={estimateReferenceToolsExpanded}');
    expect(referenceSource).toContain('Estimate Templates');
    expect(referenceSource).toContain('Open templates');
    expect(referenceSource).toContain('renderSavedChargeQuickPick()');
    expect(referenceSource).toContain('renderPriceBookQuickPick()');
    expect(referenceSource).toContain('renderEstimateHelperPanel()');
    expect(referenceSource).toContain('renderAdvancedTradeTools(subjectName)');
  });

  test('estimate flow can create a new customer without starting a job', () => {
    const source = appSource();
    const createHelperSource = sourceBetween(source, 'const createLocalContact = async', 'const openAddLocalHomeForm =');
    const estimateCustomerSource = sourceBetween(source, 'const openEstimateCustomerCreate =', 'const openAddLocalHomeForm =');
    const financialWorkspaceSource = sourceBetween(source, "{contractorJobsView === 'new_financial' && (", "{invoiceComposerOpen && selectedJobsCustomerName && (");

    expect(financialWorkspaceSource).toContain('Create new customer');
    expect(financialWorkspaceSource).toContain('Add a customer so you can build an estimate now. You can invite them to ServSync later.');
    expect(financialWorkspaceSource).toContain('Customer name');
    expect(financialWorkspaceSource).toContain('Phone');
    expect(financialWorkspaceSource).toContain('Email');
    expect(financialWorkspaceSource).toContain('Service address');
    expect(financialWorkspaceSource).toContain('Notes');
    expect(financialWorkspaceSource).toContain('Save customer and continue');
    expect(financialWorkspaceSource).toContain('This creates a contractor-only customer record. It does not invite the customer or create a ServSync account.');
    expect(estimateCustomerSource).toContain('autoStartFieldWork: false');
    expect(estimateCustomerSource).toContain('Customer saved. Continue building the estimate.');
    expect(estimateCustomerSource).toContain('setJobsCustomerFilterSubjectId(`local:${contact.id}`)');
    expect(estimateCustomerSource).toContain('beginEstimateDraftForCustomer(contact.display_name || \'Customer\'');
    expect(estimateCustomerSource).toContain('localHomeId: home?.id ?? singleLocalHomeId(contact) ?? undefined');
    expect(estimateCustomerSource).not.toContain('beginFieldWorkForLocalContact');
    expect(createHelperSource).toContain('servsync_create_local_contact');
    expect(createHelperSource).toContain('options?.onCreated');
    expect(createHelperSource).toContain('} else if (autoStart) {');
  });
});
