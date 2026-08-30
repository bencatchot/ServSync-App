import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Layers3,
  Plus,
  Settings2,
  Sparkles,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { Estimate, Inspection } from '../../types';
import type { DurableDraftSummaryState } from '../drafts/useDurableDraftSummary';
import { contractorJobsNeedsAttentionCount } from './contractorWorkSelectors';

type TileState = {
  status: 'loading' | 'ready' | 'error';
  count: number;
};

type SummaryTileProps = {
  testId: string;
  label: string;
  helper: string;
  emptyHelper: string;
  state: TileState;
  icon: ReactNode;
  onClick: () => void;
  prominent?: boolean;
};

function SummaryTile({
  testId,
  label,
  helper,
  emptyHelper,
  state,
  icon,
  onClick,
  prominent = false,
}: SummaryTileProps) {
  const value = state.status === 'loading' ? '...' : state.status === 'error' ? '—' : String(state.count);
  const statusHelper = state.status === 'loading'
    ? 'Loading current records'
    : state.status === 'error'
      ? 'Count unavailable'
      : state.count === 0
        ? emptyHelper
        : helper;
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-label={`${label}: ${state.status === 'ready' ? `${state.count}. ${statusHelper}` : statusHelper}`}
      className={`${prominent ? 'col-span-2 border-amber-200 bg-amber-50 md:col-span-1' : 'border-slate-200 bg-white'} min-h-[7.25rem] min-w-0 rounded-lg border p-3 text-left shadow-sm transition hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className={`${prominent ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'} rounded-lg p-2`}>{icon}</span>
        <span className="min-w-[2ch] text-right text-xl font-bold text-slate-950" aria-hidden="true">{value}</span>
      </span>
      <span className="mt-2 block text-sm font-bold text-slate-950">{label}</span>
      <span className="mt-1 block text-xs leading-4 text-slate-600">{statusHelper}</span>
    </button>
  );
}

function ToolAction({
  testId,
  label,
  helper,
  icon,
  onClick,
}: {
  testId: string;
  label: string;
  helper: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className="flex min-h-[5.5rem] min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
    >
      <span className="shrink-0 rounded-lg bg-slate-100 p-2 text-slate-700">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-slate-950">{label}</span>
        <span className="mt-1 block text-xs leading-4 text-slate-600">{helper}</span>
      </span>
      <ArrowRight size={16} className="shrink-0 text-slate-400" />
    </button>
  );
}

export type ContractorWorkDashboardProps = {
  loading: boolean;
  contextualHelp?: ReactNode;
  loadError?: string;
  draftSummary: DurableDraftSummaryState;
  canReadDrafts: boolean;
  canStartDraft: boolean;
  canUseTemplates: boolean;
  canUseServicePlans: boolean;
  canViewPriceBook: boolean;
  estimateCount: number;
  activeJobCount: number;
  needsAttentionCount: number;
  onViewNeedsAttention: () => void;
  onViewDrafts: () => void;
  onViewEstimates: () => void;
  onViewActiveJobs: () => void;
  onStartNewDraft: () => void;
  onOpenTemplates: () => void;
  onOpenServicePlans: () => void;
  onOpenCustomPricing: () => void;
};

export function ContractorWorkDashboard({
  loading,
  contextualHelp,
  loadError,
  draftSummary,
  canReadDrafts,
  canStartDraft,
  canUseTemplates,
  canUseServicePlans,
  canViewPriceBook,
  estimateCount,
  activeJobCount,
  needsAttentionCount,
  onViewNeedsAttention,
  onViewDrafts,
  onViewEstimates,
  onViewActiveJobs,
  onStartNewDraft,
  onOpenTemplates,
  onOpenServicePlans,
  onOpenCustomPricing,
}: ContractorWorkDashboardProps) {
  const loadedState = (count: number): TileState => ({
    status: loading ? 'loading' : loadError ? 'error' : 'ready',
    count,
  });
  const actionsAvailable = canStartDraft || canUseTemplates || canUseServicePlans || canViewPriceBook;

  return (
    <section data-testid="contractor-work-dashboard" className="space-y-5">
      {contextualHelp ? <div className="flex justify-end">{contextualHelp}</div> : null}
      {loadError ? (
        <div data-testid="contractor-work-dashboard-error" role="alert" className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>Some Work information is unavailable. Counts stay hidden until access is restored.</span>
        </div>
      ) : null}

      <section aria-labelledby="jobs-at-a-glance-heading">
        <div className="mb-3">
          <h2 id="jobs-at-a-glance-heading" className="text-lg font-bold text-slate-950">At a Glance</h2>
          <p className="mt-1 text-sm text-slate-600">Open an existing workflow or review the items that need a next step.</p>
        </div>
        <div data-testid="contractor-jobs-at-a-glance" className="grid min-w-0 grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          <SummaryTile
            testId="contractor-jobs-summary-needs-attention"
            label="Needs Attention"
            helper="Records ready for a contractor next step"
            emptyHelper="Nothing needs attention"
            state={loadedState(needsAttentionCount)}
            icon={<AlertTriangle size={18} />}
            onClick={onViewNeedsAttention}
            prominent
          />
          {canReadDrafts ? (
            <SummaryTile
              testId="contractor-jobs-summary-drafts"
              label="Drafts"
              helper="Planning to continue"
              emptyHelper="No saved Drafts"
              state={draftSummary}
              icon={<FileText size={18} />}
              onClick={onViewDrafts}
            />
          ) : null}
          <SummaryTile
            testId="contractor-jobs-summary-estimates"
            label="Estimates"
            helper="Open estimate records"
            emptyHelper="No open estimates"
            state={loadedState(estimateCount)}
            icon={<ClipboardList size={18} />}
            onClick={onViewEstimates}
          />
          <SummaryTile
            testId="contractor-jobs-summary-active-jobs"
            label="Active Jobs"
            helper="Scheduled and active work"
            emptyHelper="No active Jobs"
            state={loadedState(activeJobCount)}
            icon={<ClipboardCheck size={18} />}
            onClick={onViewActiveJobs}
          />
        </div>
      </section>

      {actionsAvailable ? (
        <section aria-labelledby="jobs-actions-heading">
          <div className="mb-3">
            <h2 id="jobs-actions-heading" className="text-lg font-bold text-slate-950">Actions &amp; Tools</h2>
            <p className="mt-1 text-sm text-slate-600">Start planning or open the reusable tools your role can manage.</p>
          </div>
          <div data-testid="contractor-jobs-actions-tools" className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {canStartDraft ? (
              <ToolAction testId="contractor-work-start-draft" label="Start New Draft" helper="Plan customer work before choosing an output" icon={<Plus size={18} />} onClick={onStartNewDraft} />
            ) : null}
            {canUseTemplates ? (
              <ToolAction testId="contractor-work-open-templates" label="Templates" helper="Saved Work Templates and Inspection Checklists" icon={<Sparkles size={18} />} onClick={onOpenTemplates} />
            ) : null}
            {canUseServicePlans ? (
              <ToolAction testId="contractor-work-open-service-plans" label="Service Plans" helper="Plan templates and homeowner offers" icon={<Layers3 size={18} />} onClick={onOpenServicePlans} />
            ) : null}
            {canViewPriceBook ? (
              <ToolAction testId="contractor-work-open-custom-pricing" label="Price Book" helper="View reusable pricing items" icon={<Settings2 size={18} />} onClick={onOpenCustomPricing} />
            ) : null}
          </div>
        </section>
      ) : null}
    </section>
  );
}

type AttentionRecordProps = {
  title: string;
  reason: string;
  meta: string;
  onOpen: () => void;
};

function AttentionRecord({ title, reason, meta, onOpen }: AttentionRecordProps) {
  return (
    <button type="button" onClick={onOpen} className="flex min-h-[4.5rem] w-full min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-slate-950">{title}</span>
        <span className="mt-1 block text-xs font-semibold text-amber-800">{reason}</span>
        <span className="mt-1 block truncate text-xs text-slate-500">{meta}</span>
      </span>
      <ArrowRight size={16} className="shrink-0 text-slate-400" />
    </button>
  );
}

function formatRecordDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

export function ContractorNeedsAttention({
  estimates,
  jobs,
  onBack,
  onOpenEstimate,
  onOpenJob,
}: {
  estimates: Estimate[];
  jobs: Inspection[];
  onBack: () => void;
  onOpenEstimate: (estimate: Estimate) => void;
  onOpenJob: (job: Inspection) => void;
}) {
  const total = contractorJobsNeedsAttentionCount({
    acceptedEstimateCount: estimates.length,
    readyToInvoiceJobCount: jobs.length,
  });
  return (
    <section data-testid="contractor-needs-attention" className="space-y-5">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Needs Attention</h2>
          <p className="mt-1 text-sm text-slate-600">Only records with a clear contractor next step appear here.</p>
        </div>
        <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-400 hover:bg-blue-50">
          <ArrowLeft size={16} /> Work overview
        </button>
      </div>

      {total === 0 ? (
        <div data-testid="contractor-needs-attention-empty" className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <CheckCircle2 size={22} className="mx-auto text-emerald-700" />
          <h3 className="mt-3 text-base font-bold text-slate-950">Nothing needs attention</h3>
          <p className="mt-1 text-sm text-slate-600">Accepted estimates and completed invoiceable Jobs will appear here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {estimates.length > 0 ? (
            <section aria-labelledby="attention-estimates-heading">
              <h3 id="attention-estimates-heading" className="text-sm font-bold text-slate-950">Accepted Estimates <span className="ml-1 text-slate-500">{estimates.length}</span></h3>
              <p className="mt-1 text-xs text-slate-600">Accepted pricing ready to become a Job.</p>
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {estimates.map(estimate => <AttentionRecord key={estimate.id} title={estimate.title || 'Untitled estimate'} reason="Ready to create Job" meta={`Updated ${formatRecordDate(estimate.updated_at)}`} onOpen={() => onOpenEstimate(estimate)} />)}
              </div>
            </section>
          ) : null}
          {jobs.length > 0 ? (
            <section aria-labelledby="attention-jobs-heading">
              <h3 id="attention-jobs-heading" className="text-sm font-bold text-slate-950">Completed Jobs <span className="ml-1 text-slate-500">{jobs.length}</span></h3>
              <p className="mt-1 text-xs text-slate-600">Completed work with no current Invoice.</p>
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {jobs.map(job => <AttentionRecord key={job.id} title={job.name || 'Untitled Job'} reason="Ready to invoice" meta={`Updated ${formatRecordDate(job.updated_at)}`} onOpen={() => onOpenJob(job)} />)}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}
