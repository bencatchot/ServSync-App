import { ClipboardList } from 'lucide-react';
import type { Inspection, JobWorkItem } from '../../types';
import { formatDateTime } from '../../utils/format';

type DraftJobListProps = {
  drafts: Inspection[];
  workItemsByJobId: Record<string, JobWorkItem[]>;
  customerLabel: (draft: Inspection) => string;
  propertyLabel: (draft: Inspection) => string;
  onContinue: (draft: Inspection) => void;
};

export function DraftJobList({
  drafts,
  workItemsByJobId,
  customerLabel,
  propertyLabel,
  onContinue,
}: DraftJobListProps) {
  if (drafts.length === 0) return null;

  return (
    <section className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4" data-testid="contractor-draft-jobs-section">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Drafts</p>
          <h3 className="mt-1 text-lg font-bold text-slate-950">Draft Jobs</h3>
          <p className="mt-1 text-sm leading-6 text-blue-950">Contractor-only work you can resume before choosing an outcome.</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-blue-700 shadow-sm">
          {drafts.length} draft{drafts.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {drafts.map(draft => {
          const workItems = workItemsByJobId[draft.id] ?? [];
          const activeItemCount = workItems.filter(item => item.completion_status !== 'removed' && item.work_state !== 'removed').length;
          const property = propertyLabel(draft);
          return (
            <article key={draft.id} className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm" data-testid="contractor-draft-job-card">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">
                      <ClipboardList size={12} aria-hidden="true" />
                      Draft
                    </span>
                    <span className="text-xs font-semibold text-slate-500">{activeItemCount} scope item{activeItemCount === 1 ? '' : 's'}</span>
                  </div>
                  <h4 className="truncate text-sm font-bold text-slate-950">{draft.name || 'Untitled Draft Job'}</h4>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {customerLabel(draft)}{property ? ` · ${property}` : ''} · Saved {formatDateTime(draft.draft_saved_at || draft.updated_at)}
                  </p>
                  {draft.summary ? <p className="mt-2 line-clamp-2 text-sm text-slate-600">{draft.summary}</p> : null}
                </div>
                <button type="button" onClick={() => onContinue(draft)} className="shrink-0 rounded-xl bg-blue-600 px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700">
                  Continue Draft
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
