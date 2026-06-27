import type { JobWorkItemSummary } from './workItemSummary';

export function JobWorkItemSummaryStrip({ summary }: { summary: JobWorkItemSummary }) {
  if (summary.totalItems === 0) return null;
  const chips = [
    { label: 'completed', value: summary.completedCount },
    { label: 'open backlog', value: summary.openCount },
    { label: 'price required', value: summary.priceRequiredCount },
    { label: 'drafted', value: summary.draftedCount },
    { label: 'invoiced', value: summary.invoicedCount },
  ];
  return (
    <div data-testid="job-work-item-summary-strip" className="rounded-xl border border-blue-100 bg-white/80 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">Work summary</span>
        {chips.map(chip => (
          <span key={chip.label} data-testid="job-work-item-summary-chip" className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
            {chip.value} {chip.label}
          </span>
        ))}
      </div>
    </div>
  );
}
