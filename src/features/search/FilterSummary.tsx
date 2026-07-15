import type { ReactNode } from 'react';

type FilterSummaryProps = {
  resultCount: number;
  totalCount?: number;
  activeLabels?: ReactNode[];
  searchTerm?: string;
  onClear?: () => void;
  clearLabel?: string;
  compact?: boolean;
  className?: string;
  testId?: string;
};

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function resultLabel(resultCount: number, totalCount?: number) {
  const resultText = `${resultCount} result${resultCount === 1 ? '' : 's'}`;
  if (totalCount === undefined || totalCount === resultCount) return resultText;
  return `${resultCount} of ${totalCount} result${totalCount === 1 ? '' : 's'}`;
}

export function FilterSummary({
  resultCount,
  totalCount,
  activeLabels = [],
  searchTerm,
  onClear,
  clearLabel = 'Clear filters',
  compact = false,
  className,
  testId,
}: FilterSummaryProps) {
  const trimmedSearch = searchTerm?.trim();

  return (
    <div
      className={joinClasses(
        'flex flex-col gap-2 rounded-xl border border-slate-200 bg-white text-slate-600 sm:flex-row sm:items-center sm:justify-between',
        compact ? 'px-3 py-2 text-xs' : 'px-3 py-3 text-sm',
        className
      )}
      data-testid={testId}
    >
      <div className="min-w-0 space-y-1">
        <p className="font-semibold text-slate-700">{resultLabel(resultCount, totalCount)}</p>
        {(trimmedSearch || activeLabels.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {trimmedSearch && (
              <span className="max-w-full break-words rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-800">
                Search: &ldquo;{trimmedSearch}&rdquo;
              </span>
            )}
            {activeLabels.map((label, index) => (
              <span key={index} className="max-w-full break-words rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          className="self-start text-left font-semibold text-blue-700 hover:text-blue-800 sm:self-center sm:text-right"
          aria-label={clearLabel}
        >
          {clearLabel}
        </button>
      )}
    </div>
  );
}
