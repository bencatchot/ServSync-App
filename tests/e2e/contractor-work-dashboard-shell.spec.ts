import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isContractorWorkUiEnabled } from '../../src/features/work/contractorWorkAvailability';
import {
  contractorWorkAcceptedEstimatesReadyToStartFrom,
  contractorWorkActiveJobsFrom,
  contractorWorkDashboardIsEmpty,
  contractorWorkInvoicesNeedingAttentionFrom,
  contractorWorkJobHistoryFrom,
} from '../../src/features/work/contractorWorkSelectors';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

function inspection(overrides: Record<string, unknown>) {
  return {
    id: 'job-1',
    contractor_id: 'contractor-1',
    homeowner_user_id: null,
    home_id: null,
    local_contact_id: null,
    local_home_id: null,
    service_request_id: null,
    template_id: null,
    name: 'Service job',
    summary: '',
    status: 'draft',
    job_status: 'draft',
    job_origin: 'direct',
    estimate_id: null,
    rooms_with_findings: [],
    report_storage_path: null,
    report_file_name: null,
    created_at: '2026-07-18T12:00:00.000Z',
    updated_at: '2026-07-18T12:00:00.000Z',
    ...overrides,
  } as any;
}

function estimate(overrides: Record<string, unknown>) {
  return {
    id: 'estimate-1',
    contractor_id: 'contractor-1',
    homeowner_user_id: null,
    local_contact_id: null,
    service_request_id: null,
    inspection_id: null,
    title: 'Accepted estimate',
    scope: '',
    notes: '',
    terms: '',
    status: 'accepted',
    subtotal_cents: 0,
    total_cents: 0,
    created_at: '2026-07-18T12:00:00.000Z',
    updated_at: '2026-07-18T12:00:00.000Z',
    ...overrides,
  } as any;
}

function invoice(overrides: Record<string, unknown>) {
  return {
    id: 'invoice-1',
    contractor_id: 'contractor-1',
    homeowner_user_id: null,
    local_contact_id: null,
    service_request_id: null,
    job_id: null,
    estimate_id: null,
    invoice_number: 'INV-1',
    invoice_type: 'final',
    title: 'Invoice',
    scope: '',
    notes: '',
    terms: '',
    status: 'draft',
    subtotal_cents: 0,
    tax_cents: 0,
    discount_cents: 0,
    total_cents: 0,
    amount_paid_cents: 0,
    issued_at: null,
    due_at: null,
    paid_at: null,
    voided_at: null,
    created_at: '2026-07-18T12:00:00.000Z',
    updated_at: '2026-07-18T12:00:00.000Z',
    ...overrides,
  } as any;
}

test.describe('Contractor Work dashboard shell guardrails', () => {
  test('uses a strict Work UI feature gate that defaults off unless exactly true', () => {
    expect(isContractorWorkUiEnabled({})).toBe(false);
    expect(isContractorWorkUiEnabled({ VITE_CONTRACTOR_WORK_UI_ENABLED: 'false' })).toBe(false);
    expect(isContractorWorkUiEnabled({ VITE_CONTRACTOR_WORK_UI_ENABLED: 'TRUE' })).toBe(false);
    expect(isContractorWorkUiEnabled({ VITE_CONTRACTOR_WORK_UI_ENABLED: 'true' })).toBe(true);

    const gateSource = sourceFile('src/features/work/contractorWorkAvailability.ts');
    expect(gateSource).toContain("env.VITE_CONTRACTOR_WORK_UI_ENABLED === 'true'");
  });

  test('derives Work dashboard groups without letting composer Drafts become operational work', () => {
    const composerDraft = inspection({
      id: 'composer-draft',
      job_origin: 'draft_composer',
      status: 'draft',
      job_status: 'draft',
      estimate_id: 'estimate-from-draft',
    });
    const activeJob = inspection({
      id: 'active-job',
      job_origin: 'draft_composer',
      status: 'draft',
      job_status: 'in_progress',
      estimate_id: 'estimate-linked',
    });
    const closedJob = inspection({
      id: 'closed-job',
      job_origin: 'direct',
      status: 'finalized',
      job_status: 'completed',
    });

    const activeJobs = contractorWorkActiveJobsFrom([composerDraft, activeJob, closedJob]);
    const historyJobs = contractorWorkJobHistoryFrom([composerDraft, activeJob, closedJob]);
    const estimatesReady = contractorWorkAcceptedEstimatesReadyToStartFrom([
      estimate({ id: 'estimate-ready' }),
      estimate({ id: 'estimate-linked' }),
      estimate({ id: 'estimate-with-inspection', inspection_id: 'missing-but-linked' }),
      estimate({ id: 'estimate-draft', status: 'draft' }),
    ], [activeJob, closedJob]);
    const invoiceAttention = contractorWorkInvoicesNeedingAttentionFrom([
      invoice({ id: 'draft-invoice', status: 'draft' }),
      invoice({ id: 'overdue-invoice', status: 'overdue' }),
      invoice({ id: 'partial-invoice', status: 'partially_paid' }),
      invoice({ id: 'paid-invoice', status: 'paid' }),
      invoice({ id: 'void-invoice', status: 'void' }),
    ]);

    expect(activeJobs.map(job => job.id)).toEqual(['active-job']);
    expect(historyJobs.map(job => job.id)).toEqual(['closed-job']);
    expect(estimatesReady.map(item => item.id)).toEqual(['estimate-ready']);
    expect(invoiceAttention.map(item => item.id)).toEqual(['draft-invoice', 'overdue-invoice', 'partial-invoice']);
  });

  test('recognizes the true empty state only when every implemented group is empty', () => {
    expect(contractorWorkDashboardIsEmpty({
      draftsToContinueCount: 0,
      activeJobsCount: 0,
      workReadyToStartCount: 0,
      readyToInvoiceJobCount: 0,
      invoiceAttentionCount: 0,
      upcomingWorkCount: 0,
    })).toBe(true);

    expect(contractorWorkDashboardIsEmpty({
      draftsToContinueCount: 0,
      activeJobsCount: 1,
      workReadyToStartCount: 0,
      readyToInvoiceJobCount: 0,
      invoiceAttentionCount: 0,
      upcomingWorkCount: 0,
    })).toBe(false);
  });

  test('wires the gated Work shell only into the existing Jobs overview path', () => {
    const appSource = sourceFile('src/App.tsx');
    const overviewSource = sourceBetween(
      appSource,
      "{contractorJobsView === 'overview' && (",
      "{contractorJobsView === 'new_financial' && (",
    );
    const recentJobsSource = sourceBetween(
      appSource,
      '{contractorJobsView === \'overview\' && !CONTRACTOR_WORK_UI_ENABLED && (',
      '{/* ── DRAFT JOB COMPOSER VIEW ── */}',
    );

    expect(appSource).toContain("import { CONTRACTOR_WORK_UI_ENABLED } from './features/work/contractorWorkAvailability';");
    expect(appSource).toContain("import { ContractorWorkDashboard } from './features/work/ContractorWorkDashboard';");
    expect(overviewSource).toContain('CONTRACTOR_WORK_UI_ENABLED ? (');
    expect(overviewSource).toContain('<ContractorWorkDashboard');
    expect(overviewSource).toContain('canStartDraft={DRAFT_JOB_UI_ENABLED && canManageDraftJobs}');
    expect(overviewSource).toContain('draftsToContinue={DRAFT_JOB_UI_ENABLED && canManageDraftJobs ? composerDraftJobs : []}');
    expect(overviewSource).toContain('onStartNewDraft={startCleanDraftJobComposer}');
    expect(overviewSource).toContain('onContinueDraft={draft => void continueDraftJob(draft)}');
    expect(overviewSource).toContain('activeJobs={openJobs}');
    expect(overviewSource).toContain('workReadyToStart={acceptedEstimatesNeedingJobs}');
    expect(overviewSource).toContain('readyToInvoiceJobs={completedJobsReadyToInvoice}');
    expect(overviewSource).toContain('invoicesNeedingAttention={invoiceAttentionRecords}');
    expect(overviewSource).toContain('upcomingWorkCount={scheduleSnapshotCount}');
    expect(overviewSource).toContain('data-testid="contractor-jobs-overview"');
    expect(recentJobsSource).toContain('operationalInspections.slice(0, 5).map');
    expect(recentJobsSource).not.toContain('inspections.slice(0, 5)');
  });

  test('keeps Start New Draft an action, not a new route or mobile destination', () => {
    const appSource = sourceFile('src/App.tsx');
    const dashboardSource = sourceFile('src/features/work/ContractorWorkDashboard.tsx');
    const contractorNavSource = sourceBetween(
      appSource,
      'const contractorMobileNavItems: MobileNavItem[] = [',
      '  return (\n    <SidebarLayout\n      brand={{ name: contractorDraft.business_name',
    );

    expect(contractorNavSource).toContain("label: 'Jobs'");
    expect(contractorNavSource).not.toContain("label: 'Work'");
    expect(contractorNavSource).not.toContain("label: 'Drafts'");
    expect(contractorNavSource).not.toContain("label: 'Start New Draft'");
    expect(appSource).not.toContain("contractorTab === 'work'");
    expect(appSource).not.toContain("id: 'work'");
    expect(dashboardSource).toContain('data-testid="contractor-work-start-draft-header"');
    expect(dashboardSource).toContain('data-testid="contractor-work-start-draft-empty"');
    expect(dashboardSource).not.toContain('fixed inset');
    expect(dashboardSource).not.toContain('Templates');
    expect(dashboardSource).not.toContain('Recent Activity');
    expect(dashboardSource).not.toContain('Waiting on Customer');
  });

  test('starts dashboard Drafts clean while preserving contextual Draft starts elsewhere', () => {
    const appSource = sourceFile('src/App.tsx');
    const contextualStartSource = sourceBetween(
      appSource,
      'const startDraftJobComposer = (overrides: Partial<DraftJobComposerDraft> = {}) => {',
      'const startCleanDraftJobComposer = () => {',
    );
    const cleanStartSource = sourceBetween(
      appSource,
      'const startCleanDraftJobComposer = () => {',
      'const continueDraftJob = async',
    );
    const overviewSource = sourceBetween(
      appSource,
      "{contractorJobsView === 'overview' && (",
      "{contractorJobsView === 'new_financial' && (",
    );
    const legacyDraftPromptSource = sourceBetween(
      appSource,
      'Need a contractor-only draft first?',
      'Choose job workflow',
    );

    expect(contextualStartSource).toContain("subject_type: selectedJobsLocalContact ? 'local' : 'connected'");
    expect(contextualStartSource).toContain("homeowner_user_id: selectedJobsConnection?.homeowner_user_id ?? ''");
    expect(contextualStartSource).toContain("home_id: selectedJobsConnection ? connectedHomeList(selectedJobsConnection)[0]?.id ?? '' : ''");
    expect(contextualStartSource).toContain("local_contact_id: selectedJobsLocalContact?.id ?? ''");
    expect(contextualStartSource).toContain("local_home_id: selectedJobsLocalContact ? singleLocalHomeId(selectedJobsLocalContact) : ''");

    expect(cleanStartSource).toContain('setJobsCustomerFilterSubjectId(null)');
    expect(cleanStartSource).toContain('startDraftJobComposer({');
    expect(cleanStartSource).toContain("subject_type: 'connected'");
    expect(cleanStartSource).toContain("homeowner_user_id: ''");
    expect(cleanStartSource).toContain("home_id: ''");
    expect(cleanStartSource).toContain("local_contact_id: ''");
    expect(cleanStartSource).toContain("local_home_id: ''");
    expect(cleanStartSource).toContain("service_request_id: ''");
    expect(cleanStartSource).toContain("title: ''");
    expect(cleanStartSource).toContain("scope: ''");
    expect(cleanStartSource).toContain("notes: ''");
    expect(cleanStartSource).toContain('line_items: []');

    expect(overviewSource).toContain('onStartNewDraft={startCleanDraftJobComposer}');
    expect(overviewSource).not.toContain('onStartNewDraft={() => startDraftJobComposer()}');
    expect(legacyDraftPromptSource).toContain('onClick={() => startDraftJobComposer()}');
  });
});
