import type { ReactNode } from 'react';
import { statusToneClass, type StatusTone } from './statusPresentation';

export interface StatusBadgeProps {
  label: string;
  tone: StatusTone;
  icon?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

export function StatusBadge({ label, tone, icon, size = 'sm', className = '' }: StatusBadgeProps) {
  const sizeClass = size === 'md' ? 'px-2.5 py-1 text-sm leading-5' : 'px-2 py-0.5 text-xs leading-5';

  return (
    <span className={`inline-flex max-w-full items-center gap-1 rounded-full border font-semibold ${sizeClass} ${statusToneClass(tone)} ${className}`.trim()}>
      {icon ? <span aria-hidden="true" className="inline-flex shrink-0 items-center">{icon}</span> : null}
      <span className="min-w-0 whitespace-normal break-words">{label}</span>
    </span>
  );
}
