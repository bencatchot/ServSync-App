import type { ReactNode } from 'react';

type VisibilityNoticeTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';
type VisibilityNoticeVariant = 'standard' | 'compact';

type VisibilityNoticeProps = {
  title: ReactNode;
  body: ReactNode;
  tone?: VisibilityNoticeTone;
  variant?: VisibilityNoticeVariant;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  testId?: string;
};

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

const toneClasses: Record<VisibilityNoticeTone, string> = {
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  danger: 'border-red-200 bg-red-50 text-red-900',
};

const iconToneClasses: Record<VisibilityNoticeTone, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  info: 'bg-blue-100 text-blue-700',
  warning: 'bg-amber-100 text-amber-700',
  success: 'bg-emerald-100 text-emerald-700',
  danger: 'bg-red-100 text-red-700',
};

export function VisibilityNotice({
  title,
  body,
  tone = 'info',
  variant = 'standard',
  icon,
  action,
  className,
  testId,
}: VisibilityNoticeProps) {
  const isCompact = variant === 'compact';

  return (
    <div
      className={joinClasses(
        'rounded-xl border',
        toneClasses[tone],
        isCompact ? 'px-3 py-2' : 'px-3 py-3',
        className
      )}
      data-testid={testId}
    >
      <div className="flex min-w-0 flex-wrap items-start gap-2">
        {icon ? (
          <span
            className={joinClasses(
              'inline-flex shrink-0 items-center justify-center rounded-full',
              isCompact ? 'h-6 w-6' : 'h-7 w-7',
              iconToneClasses[tone]
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className={joinClasses('font-bold leading-5', isCompact ? 'text-xs' : 'text-sm')}>{title}</p>
          <p className={joinClasses('mt-0.5 break-words font-semibold leading-5', isCompact ? 'text-xs' : 'text-xs')}>{body}</p>
          {action ? <div className="mt-2 flex flex-wrap gap-2">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}
