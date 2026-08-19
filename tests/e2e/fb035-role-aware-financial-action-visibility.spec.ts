import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { capabilitiesFromCompatibilityChecks } from '../../src/features/drafts/durableDraftCapabilities';
import {
  contractorFinancialActionVisibility,
  invoiceRecordOpensEditable,
} from '../../src/features/work/financialActionVisibility';

const appSource = () => readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const ROLE_UI_ENABLED = process.env.FB035_ROLE_FINANCIAL_UI === 'true';
type ContractorRole = 'owner' | 'admin' | 'office' | 'field_tech' | 'viewer';

const ROLE_ENV: Record<ContractorRole, { email: string; password: string }> = {
  owner: { email: 'TEST_CONTRACTOR_EMAIL', password: 'TEST_CONTRACTOR_PASSWORD' },
  admin: { email: 'TEST_CONTRACTOR_ADMIN_EMAIL', password: 'TEST_CONTRACTOR_ADMIN_PASSWORD' },
  office: { email: 'TEST_CONTRACTOR_OFFICE_EMAIL', password: 'TEST_CONTRACTOR_OFFICE_PASSWORD' },
  field_tech: { email: 'TEST_CONTRACTOR_FIELD_TECH_EMAIL', password: 'TEST_CONTRACTOR_FIELD_TECH_PASSWORD' },
  viewer: { email: 'TEST_CONTRACTOR_VIEWER_EMAIL', password: 'TEST_CONTRACTOR_VIEWER_PASSWORD' },
};

function roleCredential(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required role-validation environment variable ${name}.`);
  return value;
}

async function openWorkAs(page: Page, role: ContractorRole) {
  await page.goto('/#/contractor');
  const main = page.getByRole('main');
  await main.getByLabel(/^Email$/i).fill(roleCredential(ROLE_ENV[role].email));
  await main.getByLabel(/^Password$/i).fill(roleCredential(ROLE_ENV[role].password));
  await main.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page.getByText(/Contractor command center/i)).toBeVisible({ timeout: 30_000 });
  const workWorkspace = main.getByText(/^Work workspace$/i);
  if (!(await workWorkspace.isVisible())) {
    await page.getByRole('button', { name: /^Work(?:\s+\d+)?$/i }).last().click();
  }
  await expect(workWorkspace).toBeVisible();
  await expect(main.getByRole('heading', { level: 2, name: /^Work$/i })).toBeVisible();
  await expect(main.getByText(/Loading contractor workspace/i)).toBeHidden({ timeout: 30_000 });
  return main;
}

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

function resolvedCapabilities(options: {
  owner?: boolean;
  access?: boolean;
  billing?: boolean;
  jobs?: boolean;
  tenant?: boolean;
}) {
  const tenant = options.tenant ?? true;
  return capabilitiesFromCompatibilityChecks({
    contractorId: tenant ? 'contractor-1' : null,
    currentUserId: tenant ? 'user-1' : null,
    contractorOwnerUserId: options.owner ? 'user-1' : 'owner-1',
    canAccessContractor: options.access ?? tenant,
    canManageEstimates: options.billing ?? false,
    canManageBilling: options.billing ?? false,
    canWriteJobs: options.jobs ?? false,
  });
}

test.describe('FB-035 role-aware financial action visibility', () => {
  test('uses the server-resolved billing and Job capabilities for the canonical role matrix', () => {
    const owner = contractorFinancialActionVisibility(resolvedCapabilities({ owner: true, billing: true, jobs: true }));
    const admin = contractorFinancialActionVisibility(resolvedCapabilities({ billing: true, jobs: true }));
    const office = contractorFinancialActionVisibility(resolvedCapabilities({ billing: true, jobs: true }));
    const fieldTechnician = contractorFinancialActionVisibility(resolvedCapabilities({ billing: false, jobs: true }));
    const viewer = contractorFinancialActionVisibility(resolvedCapabilities({ billing: false, jobs: false }));
    const homeownerOrCrossTenant = contractorFinancialActionVisibility(resolvedCapabilities({ tenant: false }));

    expect(owner).toEqual({ canManageBilling: true, canCreateJobFromEstimate: true });
    expect(admin).toEqual({ canManageBilling: true, canCreateJobFromEstimate: true });
    expect(office).toEqual({ canManageBilling: true, canCreateJobFromEstimate: true });
    expect(fieldTechnician).toEqual({ canManageBilling: false, canCreateJobFromEstimate: true });
    expect(viewer).toEqual({ canManageBilling: false, canCreateJobFromEstimate: false });
    expect(homeownerOrCrossTenant).toEqual({ canManageBilling: false, canCreateJobFromEstimate: false });
  });

  test('opens draft Invoices as editable only for billing-authorized users', () => {
    const billing = contractorFinancialActionVisibility(resolvedCapabilities({ billing: true, jobs: true }));
    const readOnly = contractorFinancialActionVisibility(resolvedCapabilities({ billing: false, jobs: true }));

    expect(invoiceRecordOpensEditable('draft', billing)).toBe(true);
    expect(invoiceRecordOpensEditable('draft', readOnly)).toBe(false);
    for (const status of ['sent', 'viewed', 'overdue', 'partially_paid', 'paid', 'void']) {
      expect(invoiceRecordOpensEditable(status, billing)).toBe(false);
      expect(invoiceRecordOpensEditable(status, readOnly)).toBe(false);
    }
  });

  test('keeps linked Invoice records readable while hiding Estimate billing and preserving Field Technician Job creation', () => {
    const source = appSource();
    const selectedEstimateCards = sourceBetween(
      source,
      'selectedDocumentSection.estimates.map(estimate => {',
      "{estimate.status === 'sent' && (",
    );
    const focusedEstimateCards = sourceBetween(
      source,
      'visibleEstimateRecords.map(estimate => {',
      "{estimate.status === 'sent' && (",
    );

    for (const block of [selectedEstimateCards, focusedEstimateCards]) {
      expect(block).toContain('linkedInvoice || (canManageFinancialActions && canCreateInvoiceDraftFromEstimate)');
      expect(block).toContain('financialActionVisibility.canCreateJobFromEstimate');
      expect(block).toContain('invoiceRecordOpensEditable(linkedInvoice.status, financialActionVisibility)');
      expect(block).toContain("'Open invoice'");
    }
  });

  test('guards direct Invoice, schedule billing, Job billing, priced-work, send, void, and payment surfaces', () => {
    const source = appSource();
    const openInvoice = sourceBetween(source, 'const openInvoiceRecord = (invoice: Invoice) => {', 'const openEstimateRecord = (estimate: Estimate) => {');
    const schedule = sourceBetween(source, 'const renderContractorEstimatePaymentScheduleSection =', 'const createInvoiceFromJob = async');
    const invoiceList = sourceBetween(
      source,
      "{((contractorTab === 'work' && (contractorWorkView === 'open_estimates' || contractorWorkView === 'closed_estimates')) || (contractorTab === 'financials' && (contractorFinancialsView === 'open_invoices' || contractorFinancialsView === 'closed_invoices'))) && (",
      "{contractorTab === 'work' && (contractorWorkView === 'open_jobs' || contractorWorkView === 'closed_jobs') && (",
    );
    const jobList = sourceBetween(
      source,
      "{contractorTab === 'work' && (contractorWorkView === 'open_jobs' || contractorWorkView === 'closed_jobs') && (",
      '{showLocalContactForm && canCreateContractorLocalCustomers && (',
    );

    expect(openInvoice).toContain('setFocusedInvoiceRecordId(invoice.id)');
    expect(openInvoice).toContain('invoiceRecordOpensEditable(invoice.status, financialActionVisibility)');
    expect(schedule).toContain('canManageFinancialActions && estimate.status === \'accepted\' && canRequest');
    expect(source).toContain("canManageFinancialActions && sharedDraftComposerEnabled && contractorTab === 'financials'");
    expect(source).toContain("contractorTab === 'financials' && contractorFinancialsView === 'new_invoices'");
    expect(source).toContain("setContractorFinancialsView('open_invoices')");
    expect(invoiceList).toContain("invoice.status === 'draft' && canManageFinancialActions");
    expect(invoiceList).toContain("canManageInvoicePayments && ['draft', 'sent', 'viewed', 'overdue', 'partially_paid', 'paid']");
    expect(jobList).toContain('Boolean(linkedInvoice || canManageFinancialActions)');
    expect(source).toContain('canManageFinancialActions && !options.selectable');
    expect(source).toContain('canManageFinancialActions && partialInvoiceJob && partialInvoiceModalItems');
    expect(source).toContain('canManageFinancialActions && manualWorkItemJob');
    expect(source).toContain('canManageFinancialActions && <span className="rounded-lg border border-slate-200');
  });

  test('retains handler-level fail-closed errors for stale or direct UI attempts', () => {
    const source = appSource();
    for (const marker of [
      'const beginInvoiceDraftForCustomer =',
      'const saveInvoiceDraft = async',
      'const sendInvoiceToHomeowner = async',
      'const createInvoiceFromEstimateScheduleItem = async',
      'const createInvoiceFromJob = async',
      'const openPartialInvoiceReview =',
      'const openManualWorkItemEditor =',
      'const voidInvoice = async',
    ]) {
      const start = source.indexOf(marker);
      expect(start, `Expected handler marker: ${marker}`).toBeGreaterThanOrEqual(0);
      expect(source.slice(start, start + 1_500)).toContain('if (!canManageFinancialActions)');
    }
    const capabilitySource = readFileSync(resolve(process.cwd(), 'src/features/drafts/durableDraftCapabilities.ts'), 'utf8');
    expect(capabilitySource).toContain("capabilityRpc(client, 'current_user_can_manage_contractor_billing'");
    expect(capabilitySource).toContain("capabilityRpc(client, 'current_user_can_write_contractor_jobs'");
  });

  test('does not reintroduce role-string authorization for financial actions', () => {
    const source = appSource();
    const visibilityDeclaration = sourceBetween(
      source,
      'const financialActionVisibility =',
      'const durableDraftInvoiceLaunchAvailable =',
    );
    expect(source).toContain('contractorFinancialActionVisibility(durableDraftCapabilities)');
    expect(source).toContain('const canManageFinancialActions = financialActionVisibility.canManageBilling;');
    expect(source).toContain('const canManageLocalInvoiceDelivery = canManageFinancialActions;');
    expect(visibilityDeclaration).not.toContain('currentContractorTeamRole');
  });
});

test.describe('FB-035 exact-head Sandbox role presentation', () => {
  test.beforeEach(() => {
    test.skip(!ROLE_UI_ENABLED, 'Enable only for approved read-only exact-head Sandbox role validation.');
  });

  for (const role of ['owner', 'admin', 'office'] as const) {
    test(`${role} retains the billing-authorized Draft Invoice entry`, async ({ page }) => {
      const main = await openWorkAs(page, role);
      await expect(page.getByRole('button', { name: /^Financials$/i })).toBeVisible();
      await main.getByTestId('contractor-work-start-draft').click();
      await expect(main.getByRole('radio', { name: /Draft Invoice/i })).toBeVisible();
    });
  }

  for (const role of ['field_tech', 'viewer'] as const) {
    for (const viewport of [
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'mobile', width: 390, height: 844 },
    ]) {
      test(`${role} has no financial authoring entry on ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        const main = await openWorkAs(page, role);
        await expect(page.getByRole('button', { name: /^Financials$/i })).toHaveCount(0);
        await expect(main.getByRole('button', { name: /New Estimate\/Invoice/i })).toHaveCount(0);
        await expect(main.getByRole('button', { name: /^New invoice$/i })).toHaveCount(0);
        await expect(main.getByRole('button', { name: /^Create Invoice$/i })).toHaveCount(0);
        await expect(main.getByRole('button', { name: /Record payment|Mark Paid|Send Invoice/i })).toHaveCount(0);
        if (role === 'field_tech') {
          await main.getByTestId('contractor-work-start-draft').click();
          await expect(main.getByRole('radio', { name: /^Job/i })).toBeVisible();
          await expect(main.getByRole('radio', { name: /Draft Invoice/i })).toHaveCount(0);
        } else {
          await expect(main.getByTestId('contractor-work-start-draft')).toHaveCount(0);
        }
        expect(await page.locator('html').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      });
    }
  }
});
