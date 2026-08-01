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
      '{contractorJobsView === \'overview\' && durableDraftLegacyFallbackReady && !sharedDraftComposerEnabled && (',
      '{/* ── DRAFT JOB COMPOSER VIEW ── */}',
    );

    expect(appSource).toContain("import { CONTRACTOR_WORK_UI_ENABLED } from './features/work/contractorWorkAvailability';");
    expect(appSource).toContain("import { ContractorWorkDashboard } from './features/work/ContractorWorkDashboard';");
    expect(appSource).toContain('const globalDurableDraftMasterEnabled = isGlobalDurableDraftMasterEnabled({');
    expect(overviewSource).toContain('durableDraftCohortSafeHold ? (');
    expect(overviewSource).toContain('sharedDraftComposerEnabled ? (');
    expect(overviewSource).toContain('<ContractorWorkDashboard');
    expect(overviewSource).toContain('canStartDraft={!SERVSYNC_DEMO_PRESENTATION_MODE && effectiveDurableDraftCapabilities.canPersistDraft}');
    expect(overviewSource).toContain('draftsToContinue={[]}');
    expect(overviewSource).toContain('onStartNewDraft={startCleanDraftJobComposer}');
    expect(overviewSource).toContain('onContinueDraft={draft => void continueDraftJob(draft)}');
    expect(overviewSource).toContain('activeJobs={openJobs}');
    expect(overviewSource).toContain('workReadyToStart={acceptedEstimatesNeedingJobs}');
    expect(overviewSource).toContain('readyToInvoiceJobs={completedJobsReadyToInvoice}');
    expect(overviewSource).toContain('invoicesNeedingAttention={invoiceAttentionRecords}');
    expect(overviewSource).toContain('upcomingWorkCount={scheduleSnapshotCount}');
    expect(overviewSource).toContain('onOpenServicePlans={openContractorServicePlans}');
    expect(overviewSource).toContain('data-testid="contractor-jobs-overview"');
    expect(recentJobsSource).toContain('operationalInspections.slice(0, 5).map');
    expect(recentJobsSource).not.toContain('inspections.slice(0, 5)');
  });

  test('keeps Service Plans available in empty and populated Work states without making it a Draft output', () => {
    const appSource = sourceFile('src/App.tsx');
    const dashboardSource = sourceFile('src/features/work/ContractorWorkDashboard.tsx');
    const composerSource = sourceFile('src/features/drafts/ContractorDraftComposer.tsx');
    const servicePlansEntryIndex = dashboardSource.indexOf('data-testid="contractor-work-service-plans-entry"');

    expect(dashboardSource).toContain('onOpenServicePlans: () => void;');
    expect(dashboardSource).toContain('data-testid="contractor-work-open-service-plans"');
    expect(dashboardSource).toContain('Create maintenance plan templates and homeowner offers.');
    expect(servicePlansEntryIndex).toBeGreaterThan(dashboardSource.indexOf('data-testid="contractor-work-dashboard-empty"'));
    expect(servicePlansEntryIndex).toBeGreaterThan(dashboardSource.indexOf('data-testid="contractor-work-job-history-link"'));
    expect(appSource).toContain("setContractorJobsViewAndScroll('service_agreements')");
    expect(appSource).toContain('onOpenServicePlans={openContractorServicePlans}');
    expect(composerSource).not.toContain('Service Plans');
    expect(composerSource).not.toContain('service_agreement');
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

  test('keeps Work overview attention cards shrinkable on mobile', () => {
    const dashboardSource = sourceFile('src/features/work/ContractorWorkDashboard.tsx');
    const attentionSectionSource = sourceBetween(
      dashboardSource,
      'function AttentionSection({',
      'export function ContractorWorkDashboard({',
    );
    const dashboardGridSource = sourceBetween(
      dashboardSource,
      '<div className="grid min-w-0 gap-4 xl:grid-cols-2">',
      '<section data-testid="contractor-work-job-history-link"',
    );
    const historySource = sourceBetween(
      dashboardSource,
      '<section data-testid="contractor-work-job-history-link"',
      '</section>',
    );

    expect(attentionSectionSource).toContain('className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"');
    expect(attentionSectionSource).toContain('className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"');
    expect(attentionSectionSource).toContain('className="min-w-0 break-words text-sm font-bold text-slate-950"');
    expect(attentionSectionSource).toContain('className="mt-2 break-words text-sm leading-5 text-slate-500"');
    expect(attentionSectionSource).toContain('className="mt-3 inline-flex min-h-[2.5rem] max-w-full items-center gap-2');
    expect(attentionSectionSource).toContain('<span className="min-w-0 break-words">{actionLabel}</span>');
    expect(dashboardSource).toContain('className="grid min-w-0 gap-4 xl:grid-cols-2"');
    expect(dashboardGridSource).toContain('testId="contractor-work-active-jobs-section"');
    expect(dashboardGridSource).toContain('testId="contractor-work-ready-to-start-section"');
    expect(historySource).toContain('className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4"');
    expect(historySource).toContain('className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"');
    expect(historySource).toContain('<span className="min-w-0 break-words">View Job History</span>');
    expect(attentionSectionSource).not.toContain('overflow-x-auto');
  });

  test('starts dashboard Drafts clean while preserving contextual Draft starts elsewhere', () => {
    const appSource = sourceFile('src/App.tsx');
    const contextualStartSource = sourceBetween(
      appSource,
      'const startDraftJobComposer = (',
      'const startCleanDraftJobComposer = (',
    );
    const cleanStartSource = sourceBetween(
      appSource,
      'const startCleanDraftJobComposer = (',
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
