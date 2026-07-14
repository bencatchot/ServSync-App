import type { ReactNode } from 'react';

type DraftNoticeTone = 'neutral' | 'info' | 'warning' | 'success';
type DraftNoticeVariant = 'standard' | 'compact';

type DraftNoticeProps = {
  title: ReactNode;
  body: ReactNode;
  tone?: DraftNoticeTone;
  variant?: DraftNoticeVariant;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  testId?: string;
};

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

const toneClasses: Record<DraftNoticeTone, string> = {
  neutral: 'border-slate-200 bg-white text-slate-700',
  info: 'border-blue-200 bg-white/80 text-blue-950',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
};

const iconToneClasses: Record<DraftNoticeTone, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  info: 'bg-blue-100 text-blue-700',
  warning: 'bg-amber-100 text-amber-700',
  success: 'bg-emerald-100 text-emerald-700',
};

export function DraftNotice({
  title,
  body,
  tone = 'info',
  variant = 'standard',
  icon,
  action,
  className,
  testId,
}: DraftNoticeProps) {
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
