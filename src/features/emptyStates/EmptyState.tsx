import type { ReactNode } from 'react';

type EmptyStateTone = 'neutral' | 'info' | 'success';
type EmptyStateVariant = 'standard' | 'compact';

type EmptyStateProps = {
  title?: ReactNode;
  body?: ReactNode;
  text?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  icon?: ReactNode;
  tone?: EmptyStateTone;
  variant?: EmptyStateVariant;
  compact?: boolean;
  className?: string;
};

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

const toneClasses: Record<EmptyStateTone, string> = {
  neutral: 'border-[#E1E3E7] bg-[#F7F9FC] text-[#223D67]',
  info: 'border-blue-200 bg-blue-50/70 text-blue-950',
  success: 'border-emerald-200 bg-emerald-50/70 text-emerald-950',
};

const iconToneClasses: Record<EmptyStateTone, string> = {
  neutral: 'border-slate-200 bg-white text-slate-500',
  info: 'border-blue-100 bg-white text-blue-700',
  success: 'border-emerald-100 bg-white text-emerald-700',
};

export function EmptyState({
  title,
  body,
  text,
  action,
  secondaryAction,
  icon,
  tone = 'neutral',
  variant = 'standard',
  compact,
  className,
}: EmptyStateProps) {
  const isCompact = compact || variant === 'compact';
  const heading = title ?? (body ? null : text);
  const description = body ?? (title ? text : null);

  return (
    <div
      className={joinClasses(
        'rounded-xl border border-dashed',
        toneClasses[tone],
        isCompact ? 'px-3 py-4 text-left' : 'px-4 py-6 text-center',
        className
      )}
    >
      <div className={joinClasses('mx-auto flex max-w-xl', isCompact ? 'items-start gap-3' : 'flex-col items-center gap-3')}>
        {icon && (
          <span
            className={joinClasses(
              'inline-flex shrink-0 items-center justify-center rounded-full border',
              isCompact ? 'h-8 w-8' : 'h-10 w-10',
              iconToneClasses[tone]
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
        <div className={joinClasses('min-w-0', isCompact ? 'flex-1' : '')}>
          {heading && (
            <h3 className={joinClasses('font-semibold leading-6', isCompact ? 'text-sm' : 'text-base')}>
              {heading}
            </h3>
          )}
          {description && (
            <p className={joinClasses('leading-6', heading ? 'mt-1' : '', isCompact ? 'text-sm' : 'text-sm')}>
              {description}
            </p>
          )}
          {(action || secondaryAction) && (
            <div className={joinClasses('flex flex-wrap gap-2', isCompact ? 'mt-3' : 'mt-4 justify-center')}>
              {action}
              {secondaryAction}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
