import type { ServiceRequestStatus } from '../../types';

export function serviceRequestStatusLabel(status: ServiceRequestStatus) {
  const labels: Record<ServiceRequestStatus, string> = {
    open: 'Open',
    contractor_responded: 'Responded',
    homeowner_replied: 'Replied',
    declined: 'Declined',
    closed: 'Closed',
  };
  return labels[status] || status;
}

export function serviceRequestStatusClass(status: ServiceRequestStatus) {
  if (status === 'open') return 'bg-slate-100 text-slate-700';
  if (status === 'contractor_responded') return 'bg-blue-50 text-blue-700';
  if (status === 'homeowner_replied') return 'bg-amber-50 text-amber-700';
  if (status === 'closed') return 'bg-emerald-50 text-emerald-700';
  return 'bg-red-50 text-red-700';
}

export function serviceRequestStatusAccent(status: ServiceRequestStatus) {
  if (status === 'open') return 'border-l-slate-300';
  if (status === 'contractor_responded') return 'border-l-blue-400';
  if (status === 'homeowner_replied') return 'border-l-amber-400';
  if (status === 'closed') return 'border-l-emerald-400';
  return 'border-l-red-300';
}

export function urgencyLabel(urgency: string) {
  if (urgency === 'urgent') return '🔴 Urgent';
  if (urgency === 'normal') return 'Normal';
  return 'Low';
}
