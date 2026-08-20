import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { capabilitiesFromCompatibilityChecks } from '../../src/features/drafts/durableDraftCapabilities';
import { contractorJobActionVisibility } from '../../src/features/work/jobActionVisibility';

const appSource = () => readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const ROLE_UI_ENABLED = process.env.FB035_VIEWER_JOB_UI === 'true';
type OperationalRole = 'owner' | 'admin' | 'office' | 'field_tech';

const ROLE_ENV: Record<OperationalRole | 'viewer', { email: string; password: string }> = {
  owner: { email: 'TEST_CONTRACTOR_EMAIL', password: 'TEST_CONTRACTOR_PASSWORD' },
  admin: { email: 'TEST_CONTRACTOR_ADMIN_EMAIL', password: 'TEST_CONTRACTOR_ADMIN_PASSWORD' },
  office: { email: 'TEST_CONTRACTOR_OFFICE_EMAIL', password: 'TEST_CONTRACTOR_OFFICE_PASSWORD' },
  field_tech: { email: 'TEST_CONTRACTOR_FIELD_TECH_EMAIL', password: 'TEST_CONTRACTOR_FIELD_TECH_PASSWORD' },
  viewer: { email: 'TEST_CONTRACTOR_VIEWER_EMAIL', password: 'TEST_CONTRACTOR_VIEWER_PASSWORD' },
};

function resolvedCapabilities(options: { jobs: boolean; billing?: boolean; tenant?: boolean }) {
  const tenant = options.tenant ?? true;
  return capabilitiesFromCompatibilityChecks({
    contractorId: tenant ? 'contractor-1' : null,
    currentUserId: tenant ? 'user-1' : null,
    contractorOwnerUserId: 'owner-1',
    canAccessContractor: tenant,
    canManageEstimates: false,
    canManageBilling: options.billing ?? false,
    canWriteJobs: options.jobs,
  });
}

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

function roleCredential(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required role-validation environment variable ${name}.`);
  return value;
}

async function openJobsAs(page: Page, role: OperationalRole | 'viewer') {
  await page.goto('/#/contractor');
  const main = page.getByRole('main');
  await main.getByLabel(/^Email$/i).fill(roleCredential(ROLE_ENV[role].email));
  await main.getByLabel(/^Password$/i).fill(roleCredential(ROLE_ENV[role].password));
  await main.getByRole('button', { name: /^Sign in$/i }).click();
  await expect(page.getByText(/Contractor command center/i)).toBeVisible({ timeout: 30_000 });
  if (!(await main.getByText(/^Jobs workspace$/i).isVisible())) {
    await page.getByRole('button', { name: /^Jobs(?:\s+\d+)?$/i }).last().click();
  }
  await expect(main.getByText(/Loading contractor workspace/i)).toBeHidden({ timeout: 30_000 });
  return main;
}

test.describe('FB-035 Viewer Job lifecycle visibility', () => {
  test('derives operational mutation visibility from the server-resolved Job-write capability', () => {
    for (const role of ['owner', 'admin', 'office', 'field_tech']) {
      expect(contractorJobActionVisibility(resolvedCapabilities({ jobs: true, billing: role !== 'field_tech' })), role)
        .toEqual({ canManageJobOperations: true });
    }
    expect(contractorJobActionVisibility(resolvedCapabilities({ jobs: false })))
      .toEqual({ canManageJobOperations: false });
    expect(contractorJobActionVisibility(resolvedCapabilities({ jobs: false, tenant: false })))
      .toEqual({ canManageJobOperations: false });
  });

  test('does not create a parallel role-string authorization model', () => {
    const source = appSource();
    const declaration = sourceBetween(
      source,
      'const jobActionVisibility = contractorJobActionVisibility(durableDraftCapabilities);',
      'const durableDraftInvoiceLaunchAvailable =',
    );
    expect(declaration).toContain('const canManageJobOperations = jobActionVisibility.canManageJobOperations;');
    expect(declaration).not.toContain('currentContractorTeamRole');

    const capabilitySource = readFileSync(resolve(process.cwd(), 'src/features/drafts/durableDraftCapabilities.ts'), 'utf8');
    expect(capabilitySource).toContain("capabilityRpc(client, 'current_user_can_write_contractor_jobs'");
  });

  test('keeps Job lists readable while hiding complete and delete controls for a read-only Viewer', () => {
    const source = appSource();
    const currentJobs = sourceBetween(
      source,
      "(contractorWorkView === 'open_jobs' || contractorWorkView === 'closed_jobs') && (",
      '{showLocalContactForm && canCreateContractorLocalCustomers && (',
    );
    expect(currentJobs).toContain("!canManageJobOperations ? 'View Job'");
    expect(currentJobs).toContain("canManageJobOperations && inspectionJobStatus(insp) === 'draft'");
    expect(currentJobs).toContain('canManageJobOperations && !checklistStyle && inspectionIsOpenJob(insp)');
  });

  test('renders simple Jobs, checklist findings, and reports without Viewer mutation entry points', () => {
    const source = appSource();
    expect(source).toContain("data-testid={canManageJobOperations ? 'contractor-job-operational-detail' : 'contractor-job-readonly-detail'}");
    expect(source).toContain('const simpleJobReadonly = !canManageJobOperations');
    expect(source).toContain('data-testid="viewer-job-checklist-readonly"');
    expect(source).toContain('data-testid="viewer-job-findings-readonly"');
    expect(source).toContain('canSend={contractorCanSendWorkflowMessages}');
    expect(source).toContain("currentContractorTeamRole === 'viewer'");
    expect(source).toContain('{!SERVSYNC_DEMO_PRESENTATION_MODE && <button\n                          type="button"\n                          disabled={activeInspection.status');
    expect(source).toContain('{!SERVSYNC_DEMO_PRESENTATION_MODE && canManageJobOperations && <button\n                          type="button"\n                          disabled\n                          title="Standalone scheduling coming soon"');
    expect(source).toContain("{canManageJobOperations && <div className=\"rounded-2xl border border-slate-200 bg-white p-4 shadow-sm\">");
    expect(source).toContain("{canManageFinancialActions && <div className=\"rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm\">");
    expect(source).toContain('canManageJobOperations && activeInspection.status === \'draft\' && inspectionClosedForReview');
  });

  test('prevents cached edits, autosave, uploads, lifecycle handlers, and direct stale UI calls', () => {
    const source = appSource();
    expect(source).toContain("const storedDraft = canManageJobOperations && insp.status === 'draft'");
    expect(source).toContain("if (!canManageJobOperations || !activeInspection || !inspectionCanSaveProgress(activeInspection) || finalizingInspection || completingInspectionId === activeInspection.id) return;");
    for (const marker of [
      'const persistInspectionRooms = async',
      'const startNewInspection = async',
      'const saveInspectionProgress = async',
      'const finalizeInspection = async',
      'const sendInspectionReportToHomeowner = async',
      'const completeSimpleServiceJob = async',
      'const deleteInspection = async',
      'const handleInspectionPhotoUpload = async',
      'const removeInspectionPhoto = async',
      'const saveActiveFieldWorkAsTemplate = async',
    ]) {
      const start = source.indexOf(marker);
      expect(start, `Expected handler marker: ${marker}`).toBeGreaterThanOrEqual(0);
      const handlerSource = source.slice(start, start + 1_500);
      expect(
        handlerSource.includes('canManageJobOperations') || handlerSource.includes('canFinalizeCompletedJobReport'),
      ).toBe(true);
    }
  });

  test('preserves PR #438 financial separation for Field Technician and Viewer', () => {
    const source = appSource();
    expect(source).toContain('const canManageFinancialActions = financialActionVisibility.canManageBilling;');
    expect(source).toContain('canManageFinancialActions && partialInvoiceJob && partialInvoiceModalItems');
    expect(source).toContain('canManageJobOperations && !checklistStyle && inspectionIsOpenJob(insp)');
    expect(source).toContain('(linkedInvoiceForJob || canManageFinancialActions) && <button');
  });
});

test.describe('FB-035 exact-head Job role presentation', () => {
  test.beforeEach(() => {
    test.skip(!ROLE_UI_ENABLED, 'Enable only for approved read-only exact-head role validation.');
  });

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    test(`Viewer opens Jobs read-only on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const main = await openJobsAs(page, 'viewer');
      await expect(main.getByTestId('contractor-work-start-draft')).toHaveCount(0);
      const viewJob = main.getByRole('button', { name: /^View Job$/i }).first();
      test.skip(await viewJob.count() === 0, 'The approved Viewer fixture has no readable Job.');
      await viewJob.click();
      await expect(main.getByTestId('contractor-job-readonly-detail')).toBeVisible();
      await expect(main.getByRole('button', { name: /^Save$/i })).toHaveCount(0);
      await expect(main.getByRole('button', { name: /Complete Job|Finalize Report|Delete/i })).toHaveCount(0);
      await expect(main.getByRole('button', { name: /Create Invoice|Create draft/i })).toHaveCount(0);
      await expect(main.getByTestId('workflow-message-composer')).toHaveCount(0);
      expect(await page.locator('html').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    });

    test(`Field Technician retains operational Job entry on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const main = await openJobsAs(page, 'field_tech');
      const continueJob = main.getByRole('button', { name: /^(?:Continue Job|Continue)$/i }).first();
      test.skip(await continueJob.count() === 0, 'The approved Field Technician fixture has no mutable Job.');
      await continueJob.click();
      await expect(main.getByTestId('contractor-job-operational-detail')).toBeVisible();
      await expect(main.getByRole('button', { name: /Create Invoice|Record payment/i })).toHaveCount(0);
      expect(await page.locator('html').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    });
  }
});
