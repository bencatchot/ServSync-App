import type { ConnectionRequestContext } from '../../types';
import { connectionRequestContextPresentation } from './connectionRequestContext';

interface ConnectionRequestContextSectionProps {
  context?: ConnectionRequestContext | null;
  title: string;
  emptyText: string;
  formatTimestamp?: (value: string) => string;
  tone?: 'amber' | 'slate';
}

export function ConnectionRequestContextSection({
  context,
  title,
  emptyText,
  formatTimestamp,
  tone = 'slate',
}: ConnectionRequestContextSectionProps) {
  const presentation = connectionRequestContextPresentation(context, emptyText, formatTimestamp);
  const toneClasses = tone === 'amber'
    ? 'border-amber-200 bg-white/80 text-amber-700'
    : 'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <section className={`rounded-xl border p-4 ${toneClasses}`} data-testid="connection-request-context">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-[0.12em]">{title}</h4>
        {presentation.submittedLabel && (
          <p className="text-xs font-medium text-slate-500">{presentation.submittedLabel}</p>
        )}
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{presentation.message}</p>
    </section>
  );
}
