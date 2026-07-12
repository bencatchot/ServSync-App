import type { EstimateStatus, InvoiceStatus, JobLifecycleStatus, ServiceRequestStatus } from '../../types';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'muted' | 'violet';

export interface StatusPresentation {
  label: string;
  tone: StatusTone;
}

const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border-red-200 bg-red-50 text-red-700',
  muted: 'border-slate-200 bg-slate-100 text-slate-600',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
};

export function statusToneClass(tone: StatusTone) {
  return STATUS_TONE_CLASSES[tone] ?? STATUS_TONE_CLASSES.neutral;
}

export function readableStatusLabel(value?: string | null) {
  const normalized = (value || '').trim();
  if (!normalized) return 'Unknown';
  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, match => match.toUpperCase());
}

export function estimateStatusPresentation(status: EstimateStatus | string): StatusPresentation {
  const presentations: Partial<Record<EstimateStatus, StatusPresentation>> = {
    draft: { label: 'Draft', tone: 'neutral' },
    sent: { label: 'Sent', tone: 'info' },
    accepted: { label: 'Accepted', tone: 'success' },
    declined: { label: 'Declined', tone: 'danger' },
    expired: { label: 'Expired', tone: 'warning' },
    revised: { label: 'Revised', tone: 'violet' },
  };
  return presentations[status as EstimateStatus] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}

export function jobStatusPresentation(status: JobLifecycleStatus | string): StatusPresentation {
  const presentations: Record<JobLifecycleStatus, StatusPresentation> = {
    draft: { label: 'Planning', tone: 'neutral' },
    scheduled: { label: 'Scheduled', tone: 'info' },
    in_progress: { label: 'In Progress', tone: 'warning' },
    completed: { label: 'Completed', tone: 'success' },
    closed: { label: 'Closed', tone: 'muted' },
    cancelled: { label: 'Cancelled', tone: 'danger' },
  };
  return presentations[status as JobLifecycleStatus] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}

export function invoiceStatusPresentation(status: InvoiceStatus | string): StatusPresentation {
  const presentations: Record<InvoiceStatus, StatusPresentation> = {
    draft: { label: 'Draft', tone: 'neutral' },
    sent: { label: 'Sent', tone: 'info' },
    viewed: { label: 'Viewed', tone: 'violet' },
    paid: { label: 'Paid', tone: 'success' },
    partially_paid: { label: 'Partially Paid', tone: 'warning' },
    overdue: { label: 'Overdue', tone: 'danger' },
    void: { label: 'Void', tone: 'muted' },
  };
  return presentations[status as InvoiceStatus] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}

export function requestStatusPresentation(status: ServiceRequestStatus | string): StatusPresentation {
  const presentations: Record<ServiceRequestStatus, StatusPresentation> = {
    open: { label: 'Open', tone: 'info' },
    contractor_responded: { label: 'Responded', tone: 'violet' },
    homeowner_replied: { label: 'Homeowner Replied', tone: 'warning' },
    declined: { label: 'Declined', tone: 'danger' },
    closed: { label: 'Closed', tone: 'muted' },
  };
  return presentations[status as ServiceRequestStatus] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}
