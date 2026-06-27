import type { Invoice } from '../../types';

export function invoiceStatusLabel(status: Invoice['status']) {
  return status.replace(/_/g, ' ');
}

export function invoiceStatusClass(status: Invoice['status']) {
  if (status === 'draft') return 'bg-amber-100 text-amber-700';
  if (status === 'paid') return 'bg-emerald-100 text-emerald-700';
  if (status === 'void') return 'bg-slate-100 text-slate-600';
  if (status === 'overdue') return 'bg-red-100 text-red-700';
  if (status === 'sent' || status === 'viewed') return 'bg-blue-100 text-blue-700';
  return 'bg-violet-100 text-violet-700';
}

export function invoiceCanMarkPaid(status: Invoice['status']) {
  return ['sent', 'viewed', 'overdue', 'partially_paid'].includes(status);
}

export function invoiceCanVoid(status: Invoice['status']) {
  return ['draft', 'sent', 'viewed'].includes(status);
}
