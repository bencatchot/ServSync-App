import type { Invoice } from '../../types';

/** Customer-facing unpaid invoices. Private drafts are counted separately. */
export function isOpenInvoice(invoice: Pick<Invoice, 'status'>): boolean {
  return ['sent', 'viewed', 'overdue', 'partially_paid'].includes(invoice.status);
}
