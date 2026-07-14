import type { ReactNode } from 'react';

export type ActionFeedbackTone = 'success' | 'error' | 'warning' | 'info';

export type ActionFeedbackMessage = {
  title: string;
  body?: string;
  testId?: string;
};

type ActionFeedbackProps = {
  title: string;
  body?: string;
  tone: ActionFeedbackTone;
  action?: ReactNode;
  onDismiss?: () => void;
  compact?: boolean;
  className?: string;
  testId?: string;
};

const toneStyles: Record<ActionFeedbackTone, { frame: string; dot: string }> = {
  success: {
    frame: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    dot: 'bg-emerald-600',
  },
  error: {
    frame: 'border-red-200 bg-red-50 text-red-900',
    dot: 'bg-red-600',
  },
  warning: {
    frame: 'border-amber-200 bg-amber-50 text-amber-950',
    dot: 'bg-amber-500',
  },
  info: {
    frame: 'border-[#B7D7FF] bg-blue-50 text-[#02132D]',
    dot: 'bg-[#0078FF]',
  },
};

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function ActionFeedback({
  title,
  body,
  tone,
  action,
  onDismiss,
  compact = false,
  className = '',
  testId,
}: ActionFeedbackProps) {
  const styles = toneStyles[tone];
  const isError = tone === 'error';

  return (
    <div
      className={joinClasses(
        'min-w-0 rounded-xl border shadow-sm',
        compact ? 'px-3 py-2 text-sm' : 'px-4 py-3 text-sm',
        styles.frame,
        className,
      )}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      data-testid={testId}
    >
      <div className="flex min-w-0 flex-wrap items-start gap-3">
        <span className={joinClasses('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', styles.dot)} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-5">{title}</p>
          {body && <p className="mt-1 text-sm font-normal leading-5 text-current/80">{body}</p>}
          {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="ml-auto inline-flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded-lg border border-current/20 bg-white/70 px-2 text-base font-semibold leading-none text-current hover:bg-white"
            aria-label="Dismiss action feedback"
          >
            x
          </button>
        )}
      </div>
    </div>
  );
}
