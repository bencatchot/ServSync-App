import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const appSource = () => sourceFile('src/App.tsx');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('contractor selected-homeowner estimates tile', () => {
  test('uses real all-property estimate records without templates', () => {
    const source = appSource();
    const workspaceDataSource = sourceBetween(
      source,
      'const rawFieldWork = conn ? fieldWorkForHomeowner(conn.homeowner_user_id)',
      'const workspaceUnassignedRecordCount = propertyScopeEnabled',
    );
    const tabTileSource = sourceBetween(
      source,
      "id: 'estimates',\n                        label: 'Estimates',",
      "id: 'schedule',",
    );

    expect(workspaceDataSource).toContain('const rawSubjectEstimates = conn');
    expect(workspaceDataSource).toContain('? estimatesForHomeowner(conn.homeowner_user_id)');
    expect(workspaceDataSource).toContain('? estimates.filter(estimate => estimate.local_contact_id === localCustomer.id)');
    expect(workspaceDataSource).toContain('const subjectEstimates = rawSubjectEstimates.filter(matchesWorkspacePropertyScope);');
    expect(workspaceDataSource).toContain("const invoiceRecords = subjectEstimates.filter(estimate => estimateDocumentLabel(estimate) === 'Invoice');");
    expect(workspaceDataSource).toContain("const estimateRecords = subjectEstimates.filter(estimate => estimateDocumentLabel(estimate) !== 'Invoice');");
    expect(workspaceDataSource).toContain("const subjectEstimateRecordsAcrossProperties = rawSubjectEstimates.filter(estimate => estimateDocumentLabel(estimate) !== 'Invoice');");
    expect(workspaceDataSource).toContain("const noSubjectEstimateCopy = isConn ? 'No estimates for this homeowner yet' : 'No estimates for this customer yet';");

    expect(tabTileSource).toContain('value: String(subjectEstimateRecordsAcrossProperties.length)');
    expect(tabTileSource).toContain('Estimate records for this customer');
    expect(tabTileSource).toContain('noSubjectEstimateCopy');
    expect(tabTileSource).not.toContain('estimateTemplates');
    expect(tabTileSource).not.toContain('visibleEstimateTemplates');
    expect(tabTileSource).not.toContain('templates');
    expect(tabTileSource).not.toContain('Use templates or create a draft');
  });

  test('opens the filtered Jobs estimates list without stale focused estimates', () => {
    const source = appSource();
    const estimatesCardSource = sourceBetween(
      source,
      "label: 'Estimates',\n                        value: String(subjectEstimateRecordsAcrossProperties.length),",
      "label: 'Invoices',",
    );

    expect(estimatesCardSource).toContain('if (workspaceSubjectFilterId) setJobsCustomerFilterSubjectId(workspaceSubjectFilterId);');
    expect(estimatesCardSource).toContain('setFocusedEstimateRecordId(null);');
    expect(estimatesCardSource).toContain("setContractorFinancialRecordKind('estimates');");
    expect(estimatesCardSource).toContain("setContractorJobsView('open_financial');");
    expect(estimatesCardSource).toContain("setContractorTab('inspections');");
    expect(estimatesCardSource).not.toContain("setContractorJobsView('new_financial')");
    expect(estimatesCardSource).not.toContain("estimateRecords.length > 0 ? 'open_financial' : 'new_financial'");
    expect(estimatesCardSource).not.toContain('estimateTemplates');
    expect(estimatesCardSource).not.toContain('visibleEstimateTemplates');
  });

  test('keeps starter and saved template catalogs out of the selected-customer estimates panel', () => {
    const source = appSource();
    const selectedCustomerEstimatePanelSource = sourceBetween(
      source,
      "{(activeTabId === 'estimates' || activeTabId === 'invoices') && (",
      "{activeTabId === 'requests' && conn && (",
    );
    const estimateCreationFlowSource = sourceBetween(
      source,
      'const beginEstimateDraftForCustomer =',
      'const beginInvoiceDraftFromEstimate =',
    ) + sourceBetween(
      source,
      'const renderEstimateStartChoice =',
      'const renderBuildEstimateDraftPanel =',
    );

    expect(selectedCustomerEstimatePanelSource).toContain('Create estimate');
    expect(selectedCustomerEstimatePanelSource).toContain('activeDocumentRecords.length === 0');
    expect(selectedCustomerEstimatePanelSource).toContain('selectedDocumentSection.estimates.map(estimate =>');
    expect(selectedCustomerEstimatePanelSource).toContain('noSubjectEstimateCopy');
    expect(selectedCustomerEstimatePanelSource).not.toContain('ServSync estimate starters');
    expect(selectedCustomerEstimatePanelSource).not.toContain('Search estimate templates');
    expect(selectedCustomerEstimatePanelSource).not.toContain('visibleStarterEstimateTemplates');
    expect(selectedCustomerEstimatePanelSource).not.toContain('visibleEstimateTemplates');
    expect(selectedCustomerEstimatePanelSource).not.toContain('Saved Work Templates');
    expect(selectedCustomerEstimatePanelSource).not.toContain('Create Manual Invoice Draft');
    expect(selectedCustomerEstimatePanelSource).not.toContain('Start Manual Job');

    expect(estimateCreationFlowSource).toContain('setEstimateStartMode(\'choose\')');
    expect(estimateCreationFlowSource).toContain('Choose estimate template');
    expect(estimateCreationFlowSource).toContain('renderSavedEstimateTemplateStartPicker');
  });
});
