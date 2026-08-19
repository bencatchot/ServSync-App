import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  contractorNavigationStateFromStorage,
  estimateWorkViewForStatus,
  invoiceFinancialsViewForStatus,
} from '../../src/features/navigation/contractorWorkspaceNavigation';
import { STORAGE_KEYS } from '../../src/utils/localStorage';

const repoRoot = process.cwd();

function repoFile(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function storage(values: Record<string, string> = {}): Pick<Storage, 'getItem'> {
  return { getItem: key => values[key] ?? null };
}

test.describe('FB-039B Work and Financials information architecture', () => {
  test('defaults to independent Work and Financials state', () => {
    expect(contractorNavigationStateFromStorage(storage(), STORAGE_KEYS)).toEqual({
      tab: 'overview',
      workView: 'overview',
      financialsView: 'overview',
      workCustomerFilter: null,
      financialsCustomerFilter: null,
      migratedLegacyState: false,
    });
  });

  test('migrates identifiable legacy destinations and customer context once', () => {
    const legacyJob = contractorNavigationStateFromStorage(storage({
      [STORAGE_KEYS.contractorTab]: 'inspections',
      [STORAGE_KEYS.contractorJobsView]: 'open_jobs',
      [STORAGE_KEYS.contractorJobsCustomerFilter]: 'customer-a',
    }), STORAGE_KEYS);
    expect(legacyJob).toMatchObject({
      tab: 'work',
      workView: 'open_jobs',
      workCustomerFilter: 'customer-a',
      financialsCustomerFilter: null,
      migratedLegacyState: true,
    });

    const legacyInvoice = contractorNavigationStateFromStorage(storage({
      [STORAGE_KEYS.contractorTab]: 'inspections',
      [STORAGE_KEYS.contractorJobsView]: 'open_financial',
      [STORAGE_KEYS.contractorFinancialRecordKind]: 'invoices',
      [STORAGE_KEYS.contractorJobsCustomerFilter]: 'customer-b',
    }), STORAGE_KEYS);
    expect(legacyInvoice).toMatchObject({
      tab: 'financials',
      financialsView: 'open_invoices',
      financialsCustomerFilter: 'customer-b',
      workCustomerFilter: null,
      migratedLegacyState: true,
    });
  });

  test('fails ambiguous legacy financial state back to a useful overview', () => {
    expect(contractorNavigationStateFromStorage(storage({
      [STORAGE_KEYS.contractorTab]: 'inspections',
      [STORAGE_KEYS.contractorJobsView]: 'open_financial',
    }), STORAGE_KEYS)).toMatchObject({
      tab: 'work',
      workView: 'overview',
      financialsView: 'overview',
    });
  });

  test('preserves independent saved views and customer filters', () => {
    expect(contractorNavigationStateFromStorage(storage({
      [STORAGE_KEYS.contractorTab]: 'financials',
      [STORAGE_KEYS.contractorWorkView]: 'closed_jobs',
      [STORAGE_KEYS.contractorFinancialsView]: 'closed_invoices',
      [STORAGE_KEYS.contractorWorkCustomerFilter]: 'work-customer',
      [STORAGE_KEYS.contractorFinancialsCustomerFilter]: 'billing-customer',
    }), STORAGE_KEYS)).toMatchObject({
      tab: 'financials',
      workView: 'closed_jobs',
      financialsView: 'closed_invoices',
      workCustomerFilter: 'work-customer',
      financialsCustomerFilter: 'billing-customer',
      migratedLegacyState: false,
    });
  });

  test('persists canonical state and removes only legacy keys after migration', () => {
    const source = repoFile('src/features/navigation/useContractorWorkspaceNavigation.ts');
    expect(source).toContain('setItem(STORAGE_KEYS.contractorWorkView, workView)');
    expect(source).toContain('setItem(STORAGE_KEYS.contractorFinancialsView, financialsView)');
    expect(source).toContain('removeItem(STORAGE_KEYS.contractorJobsView)');
    expect(source).toContain('removeItem(STORAGE_KEYS.contractorJobsCustomerFilter)');
    expect(source).toContain('removeItem(STORAGE_KEYS.contractorFinancialRecordKind)');
    expect(source).not.toContain('removeItem(STORAGE_KEYS.contractorWorkView)');
    expect(source).not.toContain('removeItem(STORAGE_KEYS.contractorFinancialsView)');
  });

  test('maps focused Estimate and Invoice lifecycle destinations deterministically', () => {
    expect(estimateWorkViewForStatus('draft')).toBe('open_estimates');
    expect(estimateWorkViewForStatus('accepted')).toBe('open_estimates');
    expect(estimateWorkViewForStatus('declined')).toBe('closed_estimates');
    expect(invoiceFinancialsViewForStatus('draft')).toBe('open_invoices');
    expect(invoiceFinancialsViewForStatus('partially_paid')).toBe('open_invoices');
    expect(invoiceFinancialsViewForStatus('paid')).toBe('closed_invoices');
    expect(invoiceFinancialsViewForStatus('void')).toBe('closed_invoices');
  });

  test('renders canonical Work and role-gated Financials navigation without a visible Jobs destination', () => {
    const source = repoFile('src/App.tsx');
    expect(source).toContain("{ id: 'work',         label: 'Work'");
    expect(source).toContain("...(canManageFinancialActions ? [{ id: 'financials', label: 'Financials'");
    expect(source).toContain("id: 'work',\n      label: 'Work'");
    expect(source).not.toContain("{ id: 'inspections',  label: 'Jobs'");
    expect(source).toContain("...(canManageFinancialActions ? [{ id: 'financials'");
    expect(source).toContain("contractorTab === 'financials' && (canManageFinancialActions || Boolean(focusedInvoiceRecordId))");
    expect(source).toContain("setContractorTab('work')");
    expect(source).toContain("setContractorTab('financials')");
  });

  test('keeps Invoice management out of Work and splits attention ownership', () => {
    const workDashboard = repoFile('src/features/work/ContractorWorkDashboard.tsx');
    const financialsDashboard = repoFile('src/features/financials/ContractorFinancialsDashboard.tsx');
    const selectors = repoFile('src/features/work/contractorWorkSelectors.ts');
    expect(workDashboard).not.toContain('onViewInvoices');
    expect(workDashboard).not.toContain('invoiceCount');
    expect(workDashboard).not.toContain('onOpenInvoice');
    expect(financialsDashboard).toContain('Invoice Drafts');
    expect(financialsDashboard).toContain('Open Invoices');
    expect(financialsDashboard).toContain('ContractorFinancialsNeedsAttention');
    expect(selectors).toContain('workTotal:');
    expect(selectors).toContain('financialsTotal: invoiceAttentionRecords.length');
  });

  test('routes Estimate, Job, Draft, and Invoice handoffs through canonical destinations', () => {
    const source = repoFile('src/App.tsx');
    expect(source).toContain('setWorkCustomerFilterSubjectId(connection?.connection_id');
    expect(source).toContain('setFinancialsCustomerFilterSubjectId(connection?.connection_id');
    expect(source).toContain('setContractorWorkView(estimateWorkViewForStatus(estimate.status))');
    expect(source).toContain('setContractorFinancialsView(invoiceFinancialsViewForStatus(invoice.status))');
    expect(source).toContain("if (output.type === 'invoice')");
    expect(source).toContain('focusSavedInvoiceRecord(output.record)');
    expect(source).toContain("setContractorFinancialsView('new_invoices')");
    expect(source).toContain("setContractorWorkView('new_estimates')");
  });

  test('uses server-resolved billing capability rather than role strings', () => {
    const source = repoFile('src/App.tsx');
    expect(source).toContain('const canManageFinancialActions = financialActionVisibility.canManageBilling;');
    expect(source).toContain('if (!canManageFinancialActions) return;');
    expect(source).not.toContain("currentContractorTeamRole === 'owner' || currentContractorTeamRole === 'admin'");
  });

  test('leaves homeowner navigation ownership unchanged', () => {
    const source = repoFile('src/App.tsx');
    expect(source).toContain("type HomeownerTab = 'overview' | 'home' | 'contractors' | 'requests' | 'calendar' | 'estimates' | 'log' | 'documents' | 'discover' | 'trust' | 'privacy' | 'support';");
    expect(source).toContain("{ id: 'estimates',    label: 'Estimates / Invoices'");
  });
});
