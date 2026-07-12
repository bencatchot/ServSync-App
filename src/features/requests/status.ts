import type { ServiceRequestStatus } from '../../types';
import { requestStatusPresentation, statusToneClass } from '../status/statusPresentation';

export function serviceRequestStatusLabel(status: ServiceRequestStatus) {
  return requestStatusPresentation(status).label;
}

export function serviceRequestStatusClass(status: ServiceRequestStatus) {
  return statusToneClass(requestStatusPresentation(status).tone);
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
