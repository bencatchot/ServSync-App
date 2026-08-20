import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
export type WorkspaceLoadPhase = 'initial' | 'ready' | 'error';

export function WorkspaceLoadBoundary({
  phase,
  label,
  error,
  onRetry,
}: {
  phase: WorkspaceLoadPhase;
  label: string;
  error?: string;
  onRetry: () => void;
}) {
  if (phase === 'initial') {
    return (
      <section
        className="min-h-[24rem] rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        aria-busy="true"
        aria-label={`Loading ${label}`}
        data-testid="workspace-initial-loading"
      >
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
          <Loader2 size={18} className="animate-spin text-blue-700" aria-hidden="true" />
          Loading {label}...
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
          {[0, 1, 2, 3].map(item => (
            <div key={item} className="h-28 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
          ))}
        </div>
        <div className="mt-5 h-48 animate-pulse rounded-lg border border-slate-200 bg-slate-50" aria-hidden="true" />
      </section>
    );
  }

  if (phase === 'error') {
    return (
      <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-950" role="alert" data-testid="workspace-load-error">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="text-base font-bold">{label} could not be loaded</h2>
            <p className="mt-1 text-sm leading-6">{error || 'Your destination is still selected. Try loading this workspace again.'}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-950 hover:bg-amber-100"
            >
              <RefreshCw size={16} aria-hidden="true" />
              Try again
            </button>
          </div>
        </div>
      </section>
    );
  }

  return null;
}
