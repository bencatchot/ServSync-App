import type { Estimate } from '../../types';

export function estimateStatusLabel(status: Estimate['status']) {
  const labels: Record<Estimate['status'], string> = {
    draft: 'Draft',
    sent: 'Sent to homeowner',
    accepted: 'Accepted',
    declined: 'Declined',
    expired: 'Expired',
    revised: 'Revised',
  };
  return labels[status] ?? status;
}

export function estimateStatusClass(status: Estimate['status']) {
  if (status === 'draft') return 'bg-amber-100 text-amber-700';
  if (status === 'accepted') return 'bg-emerald-100 text-emerald-700';
  if (status === 'declined' || status === 'expired') return 'bg-slate-100 text-slate-600';
  if (status === 'revised') return 'bg-violet-100 text-violet-700';
  return 'bg-blue-100 text-blue-700';
}
