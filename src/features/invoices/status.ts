import type { Invoice } from '../../types';
import { invoiceStatusPresentation, statusToneClass } from '../status/statusPresentation';

export function invoiceStatusLabel(status: Invoice['status']) {
  return invoiceStatusPresentation(status).label;
}

export function invoiceStatusClass(status: Invoice['status']) {
  return statusToneClass(invoiceStatusPresentation(status).tone);
}

export function invoiceCanMarkPaid(status: Invoice['status']) {
  return ['sent', 'viewed', 'overdue', 'partially_paid'].includes(status);
}

export function invoiceCanVoid(status: Invoice['status']) {
  return ['draft', 'sent', 'viewed'].includes(status);
}
