import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Plus,
  Receipt,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { Estimate, Inspection, Invoice } from '../../types';
import { inspectionIsClosedJob } from '../jobs/status';
import { contractorWorkDashboardIsEmpty } from './contractorWorkSelectors';

type DashboardRecord = Inspection | Estimate | Invoice;

export type ContractorWorkDashboardProps = {
  loading: boolean;
  loadError?: string;
  canStartDraft: boolean;
  draftsToContinue: Inspection[];
  activeJobs: Inspection[];
  workReadyToStart: Estimate[];
  readyToInvoiceJobs: Inspection[];
  invoicesNeedingAttention: Invoice[];
  upcomingWorkCount: number;
  onStartNewDraft: () => void;
  onViewDrafts: () => void;
  onContinueDraft: (draft: Inspection) => void;
  onViewOpenJobs: () => void;
  onOpenJob: (job: Inspection) => void;
  onReviewAcceptedEstimates: () => void;
  onReviewBilling: () => void;
  onViewUpcomingWork: () => void;
  onViewJobHistory: () => void;
};

function formatWorkDashboardDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function recordTitle(record: DashboardRecord) {
  if ('invoice_number' in record) return record.title || `Invoice ${record.invoice_number}`;
  if ('name' in record) return record.name || 'Untitled work';
  return record.title || 'Untitled estimate';
}

function recordMeta(record: DashboardRecord) {
  if ('invoice_number' in record) return `Invoice ${record.invoice_number}`;
  if ('status' in record && 'total_cents' in record) return `Estimate status: ${record.status}`;
  if ('job_status' in record) return inspectionIsClosedJob(record) ? 'Job history' : 'Operational job';
  return '';
}

function PreviewList<T extends DashboardRecord>({
  items,
  onOpen,
}: {
  items: T[];
  onOpen?: (item: T) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      {items.slice(0, 3).map(item => {
        const updatedLabel = formatWorkDashboardDate(item.updated_at || item.created_at);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen?.(item)}
            className="flex min-h-[3.25rem] w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-blue-300 hover:bg-blue-50"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-950">{recordTitle(item)}</span>
              <span className="mt-0.5 block truncate text-xs text-slate-500">{[recordMeta(item), updatedLabel].filter(Boolean).join(' · ')}</span>
            </span>
            <ArrowRight size={15} className="shrink-0 text-slate-400" />
          </button>
        );
      })}
    </div>
  );
}

function AttentionSection({
  testId,
  icon,
  title,
  count,
  helper,
  actionLabel,
  onAction,
  children,
}: {
  testId: string;
  icon: ReactNode;
  title: string;
  count: number | string;
  helper: string;
  actionLabel: string;
  onAction: () => void;
  children?: ReactNode;
}) {
  return (
    <section data-testid={testId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-blue-50 p-1.5 text-blue-700">{icon}</span>
            <h3 className="text-sm font-bold text-slate-950">{title}</h3>
          </div>
          <p className="mt-2 text-sm leading-5 text-slate-500">{helper}</p>
        </div>
        <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">{count}</span>
      </div>
      {children}
      <button
        type="button"
        onClick={onAction}
        className="mt-3 inline-flex min-h-[2.5rem] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900"
      >
        {actionLabel}
        <ArrowRight size={15} />
      </button>
    </section>
  );
}

export function ContractorWorkDashboard({
  loading,
  loadError,
  canStartDraft,
  draftsToContinue,
  activeJobs,
  workReadyToStart,
  readyToInvoiceJobs,
  invoicesNeedingAttention,
  upcomingWorkCount,
  onStartNewDraft,
  onViewDrafts,
  onContinueDraft,
  onViewOpenJobs,
  onOpenJob,
  onReviewAcceptedEstimates,
  onReviewBilling,
  onViewUpcomingWork,
  onViewJobHistory,
}: ContractorWorkDashboardProps) {
  const empty = contractorWorkDashboardIsEmpty({
    draftsToContinueCount: draftsToContinue.length,
    activeJobsCount: activeJobs.length,
    workReadyToStartCount: workReadyToStart.length,
    readyToInvoiceJobCount: readyToInvoiceJobs.length,
    invoiceAttentionCount: invoicesNeedingAttention.length,
    upcomingWorkCount,
  });

  if (loading) {
    return (
      <section data-testid="contractor-work-dashboard-loading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-950">Loading Work dashboard...</p>
        <p className="mt-1 text-sm text-slate-500">Checking existing work, Drafts, billing items, and upcoming schedule items.</p>
      </section>
    );
  }

  if (loadError) {
    return (
      <section data-testid="contractor-work-dashboard-error" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" />
          <div>
            <h2 className="text-base font-bold text-amber-950">Work dashboard could not load</h2>
            <p className="mt-1 text-sm leading-5 text-amber-900">{loadError}</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section data-testid="contractor-work-dashboard" className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Jobs workspace preview</p>
            <h2 className="mt-1 text-2xl font-bold text-slate-950">Work</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              What existing work needs my attention, and what should happen next?
            </p>
          </div>
          {canStartDraft && !empty && (
            <button
              type="button"
              data-testid="contractor-work-start-draft-header"
              onClick={onStartNewDraft}
              className="inline-flex min-h-[2.75rem] items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 transition hover:border-blue-400 hover:bg-blue-50"
            >
              <Plus size={16} />
              Start New Draft
            </button>
          )}
        </div>
      </div>

      {empty ? (
        <section data-testid="contractor-work-dashboard-empty" className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center shadow-sm">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-blue-50 text-blue-700">
            <ClipboardCheck size={20} />
          </div>
          <h3 className="mt-3 text-lg font-bold text-slate-950">Nothing needs your attention yet</h3>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
            Existing work, Drafts, approvals, and billing items will appear here as they move through the workflow.
          </p>
          {canStartDraft && (
            <button
              type="button"
              data-testid="contractor-work-start-draft-empty"
              onClick={onStartNewDraft}
              className="mt-4 inline-flex min-h-[2.75rem] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              <Plus size={16} />
              Start New Draft
            </button>
          )}
        </section>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {draftsToContinue.length > 0 && (
            <AttentionSection
              testId="contractor-work-drafts-section"
              icon={<FileText size={16} />}
              title="Drafts to Continue"
              count={draftsToContinue.length}
              helper="Contractor-only Drafts that can be continued without entering operational Job lists."
              actionLabel="View all Drafts"
              onAction={onViewDrafts}
            >
              <PreviewList items={draftsToContinue} onOpen={onContinueDraft} />
            </AttentionSection>
          )}

          {activeJobs.length > 0 && (
            <AttentionSection
              testId="contractor-work-active-jobs-section"
              icon={<ClipboardCheck size={16} />}
              title="Active Jobs"
              count={activeJobs.length}
              helper="Open operational Jobs only. Composer Drafts are excluded before this section is derived."
              actionLabel="View open Jobs"
              onAction={onViewOpenJobs}
            >
              <PreviewList items={activeJobs} onOpen={onOpenJob} />
            </AttentionSection>
          )}

          {workReadyToStart.length > 0 && (
            <AttentionSection
              testId="contractor-work-ready-to-start-section"
              icon={<CheckCircle2 size={16} />}
              title="Work Ready to Start"
              count={workReadyToStart.length}
              helper="Accepted estimates that do not already have an associated operational Job."
              actionLabel="Review accepted estimates"
              onAction={onReviewAcceptedEstimates}
            >
              <PreviewList items={workReadyToStart} onOpen={() => onReviewAcceptedEstimates()} />
            </AttentionSection>
          )}

          {(readyToInvoiceJobs.length > 0 || invoicesNeedingAttention.length > 0) && (
            <AttentionSection
              testId="contractor-work-billing-attention-section"
              icon={<Receipt size={16} />}
              title="Billing Attention"
              count={`${readyToInvoiceJobs.length} jobs / ${invoicesNeedingAttention.length} invoices`}
              helper={`${readyToInvoiceJobs.length} completed job${readyToInvoiceJobs.length === 1 ? '' : 's'} ready to invoice; ${invoicesNeedingAttention.length} invoice${invoicesNeedingAttention.length === 1 ? '' : 's'} need review.`}
              actionLabel="Review billing"
              onAction={onReviewBilling}
            />
          )}

          {upcomingWorkCount > 0 && (
            <AttentionSection
              testId="contractor-work-upcoming-section"
              icon={<Calendar size={16} />}
              title="Upcoming Work"
              count={upcomingWorkCount}
              helper="Upcoming scheduled visits, appointment requests, and contractor calendar items from the current schedule snapshot."
              actionLabel="View Calendar"
              onAction={onViewUpcomingWork}
            />
          )}

          <section data-testid="contractor-work-job-history-link" className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-white p-1.5 text-slate-600">
                    <FolderOpen size={16} />
                  </span>
                  <h3 className="text-sm font-bold text-slate-950">Job History</h3>
                </div>
                <p className="mt-2 text-sm leading-5 text-slate-500">Review completed and closed Jobs without treating history as attention work.</p>
              </div>
              <button
                type="button"
                onClick={onViewJobHistory}
                className="inline-flex min-h-[2.5rem] shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-900"
              >
                View Job History
                <ArrowRight size={15} />
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
