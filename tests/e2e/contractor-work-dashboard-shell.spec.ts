import { expect, test } from '@playwright/test';
import type { JobWorkItem } from '../../src/types';
import { durableDraftPrimaryListCount } from '../../src/features/drafts/durableDraftListSelectors';
import { isContractorWorkUiEnabled } from '../../src/features/work/contractorWorkAvailability';
import {
  contractorJobsNeedsAttentionCount,
  contractorWorkAcceptedEstimatesReadyToStartFrom,
  contractorWorkActiveJobsFrom,
  contractorWorkAttentionFrom,
  contractorWorkCompletedJobsReadyToInvoiceFrom,
  contractorWorkInvoicesNeedingAttentionFrom,
  contractorWorkJobHistoryFrom,
} from '../../src/features/work/contractorWorkSelectors';
import { sourceBetween, sourceFile } from '../helpers/source-contract.mjs';

function inspection(overrides: Record<string, unknown>) {
  return {
    id: 'job-1', contractor_id: 'contractor-1', homeowner_user_id: null, home_id: null,
    local_contact_id: null, local_home_id: null, service_request_id: null, template_id: null,
    name: 'Service job', summary: '', status: 'draft', job_status: 'draft', job_origin: 'direct',
    estimate_id: null, rooms_with_findings: [], report_storage_path: null, report_file_name: null,
    created_at: '2026-07-18T12:00:00.000Z', updated_at: '2026-07-18T12:00:00.000Z',
    ...overrides,
  } as any;
}

function estimate(overrides: Record<string, unknown>) {
  return {
    id: 'estimate-1', contractor_id: 'contractor-1', homeowner_user_id: null, local_contact_id: null,
    service_request_id: null, inspection_id: null, title: 'Accepted estimate', scope: '', notes: '',
    terms: '', status: 'accepted', subtotal_cents: 0, total_cents: 0,
    created_at: '2026-07-18T12:00:00.000Z', updated_at: '2026-07-18T12:00:00.000Z',
    ...overrides,
  } as any;
}

function invoice(overrides: Record<string, unknown>) {
  return {
    id: 'invoice-1', contractor_id: 'contractor-1', homeowner_user_id: null, local_contact_id: null,
    service_request_id: null, job_id: null, estimate_id: null, invoice_number: 'INV-1', invoice_type: 'final',
    title: 'Invoice', scope: '', notes: '', terms: '', status: 'draft', subtotal_cents: 0, tax_cents: 0,
    discount_cents: 0, total_cents: 0, amount_paid_cents: 0, issued_at: null, due_at: null, paid_at: null,
    voided_at: null, created_at: '2026-07-18T12:00:00.000Z', updated_at: '2026-07-18T12:00:00.000Z',
    ...overrides,
  } as any;
}

function draftRow(overrides: Record<string, unknown>) {
  return {
    draftId: 'draft-1', contractorId: 'contractor-1', status: 'active', intendedOutput: 'job', title: 'Draft',
    subjectType: 'local', subjectLabel: 'Customer', propertyLabel: 'Home', legacyInspectionId: null,
    launchedOutputType: null, liveOutputId: null, outputIdSnapshot: null, outputAvailable: false,
    launchedAt: null, createdAt: '2026-07-18T12:00:00.000Z', updatedAt: '2026-07-18T12:00:00.000Z',
    ...overrides,
  } as any;
}

test.describe('Jobs overview redesign guardrails', () => {
  test('keeps the strict Draft-first feature gate fail-closed', () => {
    expect(isContractorWorkUiEnabled({})).toBe(false);
    expect(isContractorWorkUiEnabled({ VITE_CONTRACTOR_WORK_UI_ENABLED: 'false' })).toBe(false);
    expect(isContractorWorkUiEnabled({ VITE_CONTRACTOR_WORK_UI_ENABLED: 'TRUE' })).toBe(false);
    expect(isContractorWorkUiEnabled({ VITE_CONTRACTOR_WORK_UI_ENABLED: 'true' })).toBe(true);
  });

  test('derives only approved attention records and keeps the visible total exact', () => {
    const composerDraft = inspection({ id: 'composer', job_origin: 'draft_composer' });
    const activeJob = inspection({ id: 'active', job_status: 'in_progress', estimate_id: 'linked' });
    const closedJob = inspection({ id: 'closed', status: 'finalized', job_status: 'completed' });
    const ready = contractorWorkAcceptedEstimatesReadyToStartFrom([
      estimate({ id: 'ready' }), estimate({ id: 'linked' }), estimate({ id: 'draft', status: 'draft' }),
    ], [activeJob, closedJob]);
    const attentionInvoices = contractorWorkInvoicesNeedingAttentionFrom([
      invoice({ id: 'draft', status: 'draft' }), invoice({ id: 'overdue', status: 'overdue' }),
      invoice({ id: 'partial', status: 'partially_paid' }), invoice({ id: 'sent', status: 'sent' }),
      invoice({ id: 'paid', status: 'paid' }),
    ]);

    expect(contractorWorkActiveJobsFrom([composerDraft, activeJob, closedJob]).map(item => item.id)).toEqual(['active']);
    expect(contractorWorkJobHistoryFrom([composerDraft, activeJob, closedJob]).map(item => item.id)).toEqual(['closed']);
    expect(ready.map(item => item.id)).toEqual(['ready']);
    expect(attentionInvoices.map(item => item.id)).toEqual(['draft', 'overdue', 'partial']);
    expect(contractorJobsNeedsAttentionCount({ acceptedEstimateCount: ready.length, readyToInvoiceJobCount: 1, invoiceAttentionCount: attentionInvoices.length })).toBe(5);
  });

  test('keeps completed Job billing attention inside the pure Work domain boundary', () => {
    const noItems = inspection({ id: 'no-items', status: 'finalized', job_status: 'completed' });
    const invoiceableItems = inspection({ id: 'invoiceable-items', status: 'finalized', job_status: 'closed' });
    const blockedItems = inspection({ id: 'blocked-items', status: 'finalized', job_status: 'completed' });
    const invoiced = inspection({ id: 'invoiced', status: 'finalized', job_status: 'completed' });
    const estimateInvoiced = inspection({ id: 'estimate-invoiced', estimate_id: 'estimate-linked', status: 'finalized', job_status: 'completed' });
    const voidInvoice = inspection({ id: 'void-invoice', status: 'finalized', job_status: 'completed' });

    const ready = contractorWorkCompletedJobsReadyToInvoiceFrom({
      inspections: [noItems, invoiceableItems, blockedItems, invoiced, estimateInvoiced, voidInvoice],
      invoices: [
        invoice({ id: 'job-invoice', job_id: 'invoiced', status: 'sent' }),
        invoice({ id: 'estimate-invoice', estimate_id: 'estimate-linked', status: 'paid' }),
        invoice({ id: 'voided-job-invoice', job_id: 'void-invoice', status: 'void' }),
      ],
      jobWorkItemsByJobId: {
        'invoiceable-items': [{ completion_status: 'completed', billable: true, billing_status: 'unbilled', unit_price_cents: 12_500 } as unknown as JobWorkItem],
        'blocked-items': [{ completion_status: 'open', billable: true, billing_status: 'unbilled', unit_price_cents: 12_500 } as unknown as JobWorkItem],
      },
    });

    expect(ready.map(item => item.id)).toEqual(['no-items', 'invoiceable-items', 'void-invoice']);
  });

  test('derives the complete Needs Attention model without App-owned policy', () => {
    const attention = contractorWorkAttentionFrom({
      estimates: [estimate({ id: 'ready' }), estimate({ id: 'draft', status: 'draft' })],
      inspections: [inspection({ id: 'completed', status: 'finalized', job_status: 'completed' })],
      invoices: [invoice({ id: 'overdue', status: 'overdue' }), invoice({ id: 'sent', status: 'sent' })],
      jobWorkItemsByJobId: {},
    });

    expect(attention.acceptedEstimatesNeedingJobs.map(item => item.id)).toEqual(['ready']);
    expect(attention.completedJobsReadyToInvoice.map(item => item.id)).toEqual(['completed']);
    expect(attention.invoiceAttentionRecords.map(item => item.id)).toEqual(['overdue']);
    expect(attention.total).toBe(3);
  });

  test('counts the same durable and earlier Draft rows the dedicated list presents', () => {
    expect(durableDraftPrimaryListCount([
      draftRow({ draftId: 'active', legacyInspectionId: 'legacy-imported' }),
      draftRow({ draftId: 'recoverable', status: 'consumed', outputAvailable: false }),
      draftRow({ draftId: 'available-output', status: 'consumed', outputAvailable: true, liveOutputId: 'job-1' }),
    ], [
      inspection({ id: 'legacy-imported', job_origin: 'draft_composer' }),
      inspection({ id: 'legacy-visible', job_origin: 'draft_composer' }),
      inspection({ id: 'operational', job_origin: 'direct' }),
    ])).toBe(3);
  });

  test('renders one compact At a Glance system and no complete record list on the overview', () => {
    const source = sourceFile('src/features/work/ContractorWorkDashboard.tsx');
    const overview = sourceBetween(source, 'export function ContractorWorkDashboard({', 'type AttentionRecordProps = {');

    expect(overview).toContain('data-testid="contractor-jobs-at-a-glance"');
    expect(overview.match(/testId="contractor-jobs-summary-/g)).toHaveLength(5);
    expect(overview).toContain('label="Needs Attention"');
    expect(overview).toContain('label="Drafts"');
    expect(overview).toContain('label="Estimates"');
    expect(overview).toContain('label="Active Jobs"');
    expect(overview).toContain('label="Invoices"');
    expect(overview).toContain('helper={`${openInvoiceCount} open · ${paidInvoiceCount} paid`}');
    expect(overview).toContain('emptyHelper="No invoice records"');
    expect(overview).not.toContain('Open invoice records');
    expect(overview).not.toContain('PreviewList');
    expect(overview).not.toContain('.map(job');
    expect(overview).not.toContain('.map(estimate');
    expect(overview).not.toContain('.map(invoice');
    expect(overview).not.toContain('>Work<');
    expect(overview).not.toContain('Saved Drafts');
  });

  test('wires Drafts and Needs Attention to dedicated destinations without changing legacy fallback', () => {
    const source = sourceFile('src/App.tsx');
    const sharedOverview = sourceBetween(source, "{contractorJobsView === 'overview' && (", "{contractorJobsView === 'drafts'");
    const destinations = sourceBetween(source, "{contractorJobsView === 'drafts'", "{contractorJobsView === 'overview' && durableDraftLegacyFallbackReady");

    expect(sharedOverview).toContain('<ContractorWorkDashboard');
    expect(sharedOverview).not.toContain('<DurableDraftWorkspace');
    expect(sharedOverview).toContain("onViewDrafts={() => setContractorJobsViewAndScroll('drafts')}");
    expect(sharedOverview).toContain("onViewNeedsAttention={() => setContractorJobsViewAndScroll('needs_attention')}");
    expect(destinations).toContain('data-testid="contractor-jobs-drafts-destination"');
    expect(destinations).toContain('<DurableDraftWorkspace');
    expect(destinations).toContain('<ContractorNeedsAttention');
    expect(source).toContain('operationalInspections.slice(0, 5).map');
    expect(source).toContain('durableDraftLegacyFallbackReady && !sharedDraftComposerEnabled');
  });

  test('preserves existing destination behavior for estimates, active Jobs, invoices, and history', () => {
    const source = sourceFile('src/App.tsx');
    const overview = sourceBetween(source, '<ContractorWorkDashboard', "/>\n                ) : null");

    expect(overview).toContain("setContractorFinancialRecordKind('estimates')");
    expect(overview).toContain("setContractorFinancialRecordKind('invoices')");
    expect(overview).toContain("setContractorJobsViewAndScroll('open_financial')");
    expect(overview).toContain("setContractorJobsViewAndScroll('open_jobs')");
    expect(source).toContain("{(contractorJobsView === 'open_jobs' || contractorJobsView === 'closed_jobs') && (");
    expect(source).toContain("contractorJobsView === 'open_jobs' ? 'Open jobs' : 'Closed jobs'");
  });

  test('keeps Paid invoices discoverable from Jobs and the Customer profile', () => {
    const source = sourceFile('src/App.tsx');

    expect(source).toContain('data-testid="contractor-invoice-status-shortcuts"');
    expect(source).toContain("{ id: 'open' as const, label: 'Open'");
    expect(source).toContain("{ id: 'paid' as const, label: 'Paid'");
    expect(source).toContain("contractorInvoiceRecordStatusFilter === 'open' && !['paid', 'void'].includes(invoice.status)");
    expect(source).toContain('data-testid="customer-financial-records"');
    expect(source).toContain('Open invoices</span>');
    expect(source).toContain('Paid invoices</span>');
    expect(source).toContain("item.kind === 'invoice' ? focusSavedInvoiceRecord(item.record) : focusSavedEstimateRecord(item.record)");
    expect(source).toContain('Customer profile');
    expect(source).not.toContain('View all open invoices');
  });

  test('opens qualifying attention rows through existing record workflows', () => {
    const source = sourceFile('src/App.tsx');
    const destination = sourceBetween(source, "{contractorJobsView === 'needs_attention'", "{contractorJobsView === 'overview' && durableDraftLegacyFallbackReady");
    const component = sourceFile('src/features/work/ContractorWorkDashboard.tsx');

    expect(destination).toContain('estimates={acceptedEstimatesNeedingJobs}');
    expect(destination).toContain('jobs={completedJobsReadyToInvoice}');
    expect(destination).toContain('invoices={invoiceAttentionRecords}');
    expect(destination).toContain('onOpenEstimate={focusSavedEstimateRecord}');
    expect(destination).toContain('onOpenJob={job => openInspection(job)}');
    expect(destination).toContain('onOpenInvoice={focusSavedInvoiceRecord}');
    expect(component).toContain("invoice.status === 'partially_paid'");
    expect(component).toContain("invoice.status === 'overdue'");
  });

  test('keeps creation and management tools role-gated and outside Draft output choices', () => {
    const source = sourceFile('src/App.tsx');
    const component = sourceFile('src/features/work/ContractorWorkDashboard.tsx');
    const composer = sourceFile('src/features/drafts/ContractorDraftComposer.tsx');

    expect(source).toContain('canUseTemplates={canManageInspectionTemplates || canManageEstimateSettings}');
    expect(source).toContain('canUseServicePlans={canManageServiceAgreements}');
    expect(source).toContain('canViewPriceBook={priceBookAccess.canView}');
    expect(component).toContain('{canStartDraft ? (');
    expect(component).toContain('{canUseTemplates ? (');
    expect(component).toContain('{canUseServicePlans ? (');
    expect(component).toContain('{canViewPriceBook ? (');
    expect(component).toContain('Saved Work Templates and Inspection Checklists');
    expect(component).toContain('label="Price Book"');
    expect(source).toContain('contractorPriceBookAccess(contractor, teamAccess, profile.id)');
    expect(composer).not.toContain('Service Plans');
    expect(composer).not.toContain('service_agreement');
  });

  test('uses mobile-stable semantic buttons, loading, zero, and error states', () => {
    const source = sourceFile('src/features/work/ContractorWorkDashboard.tsx');
    expect(source).toContain("prominent ? 'col-span-2");
    expect(source).toContain('grid min-w-0 grid-cols-2 gap-2 md:grid-cols-5');
    expect(source).toContain('min-h-[7.25rem] min-w-0 rounded-lg');
    expect(source).toContain('aria-label={`${label}:');
    expect(source).toContain("state.status === 'loading'");
    expect(source).toContain("state.status === 'error'");
    expect(source).toContain('Nothing needs attention');
    expect(source).toContain('No saved Drafts');
    expect(source).not.toContain('overflow-x-auto');
  });

  test('starts overview Drafts clean while preserving contextual and legacy behavior', () => {
    const source = sourceFile('src/App.tsx');
    const cleanStart = sourceBetween(source, 'const startCleanDraftJobComposer = (', 'const continueDraftJob = async');
    expect(cleanStart).toContain('setJobsCustomerFilterSubjectId(null)');
    expect(cleanStart).toContain("subject_type: 'connected'");
    expect(cleanStart).toContain("homeowner_user_id: ''");
    expect(cleanStart).toContain("local_contact_id: ''");
    expect(cleanStart).toContain('line_items: []');
    expect(source).toContain('onStartNewDraft={startCleanDraftJobComposer}');
    expect(source).toContain("DRAFT_JOB_UI_ENABLED ? 'draft_job' : 'new'");
  });
});
