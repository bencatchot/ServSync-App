import type { Invoice, JobWorkItem } from '../../types';

export type JobWorkItemSummary = {
  totalItems: number;
  completedCount: number;
  openCount: number;
  readyToInvoiceCount: number;
  priceRequiredCount: number;
  draftedCount: number;
  invoicedCount: number;
  notBillableCount: number;
  billableActiveCount: number;
  hasLinkedInvoice: boolean;
};

export type JobWorkItemSummaryBadge = {
  label: string;
  className: string;
  title: string;
};

export function jobWorkItemCanInvoice(item: JobWorkItem) {
  return item.completion_status === 'completed'
    && item.billable
    && item.billing_status === 'unbilled'
    && item.unit_price_cents !== null
    && item.unit_price_cents !== undefined;
}

export function getJobWorkItemSummary(items: JobWorkItem[], linkedInvoice?: Pick<Invoice, 'status'> | null): JobWorkItemSummary {
  const activeBillableItems = items.filter(item =>
    item.billable
    && item.billing_status !== 'not_billable'
    && item.completion_status !== 'declined'
    && item.completion_status !== 'removed'
  );
  const completedBillableUnbilled = activeBillableItems.filter(item =>
    item.completion_status === 'completed'
    && item.billing_status === 'unbilled'
  );
  return {
    totalItems: items.length,
    completedCount: items.filter(item => item.completion_status === 'completed').length,
    openCount: items.filter(item => item.completion_status === 'open').length,
    readyToInvoiceCount: items.filter(jobWorkItemCanInvoice).length,
    priceRequiredCount: completedBillableUnbilled.filter(item => item.unit_price_cents === null || item.unit_price_cents === undefined).length,
    draftedCount: items.filter(item => item.billing_status === 'drafted').length,
    invoicedCount: items.filter(item => item.billing_status === 'invoiced').length,
    notBillableCount: items.filter(item =>
      !item.billable
      || item.billing_status === 'not_billable'
      || item.completion_status === 'declined'
      || item.completion_status === 'removed'
    ).length,
    billableActiveCount: activeBillableItems.length,
    hasLinkedInvoice: Boolean(linkedInvoice && linkedInvoice.status !== 'void'),
  };
}

export function getJobWorkItemSummaryBadges(summary: JobWorkItemSummary): JobWorkItemSummaryBadge[] {
  if (summary.totalItems === 0) return [];
  if (summary.readyToInvoiceCount > 0) {
    return [{
      label: 'Ready to invoice',
      className: 'bg-emerald-50 text-emerald-700',
      title: `${summary.readyToInvoiceCount} completed, priced item${summary.readyToInvoiceCount === 1 ? '' : 's'} ready for item-based invoicing.`,
    }];
  }
  if (summary.priceRequiredCount > 0) {
    return [{
      label: 'Price required',
      className: 'bg-amber-50 text-amber-700',
      title: `${summary.priceRequiredCount} completed item${summary.priceRequiredCount === 1 ? '' : 's'} need pricing before item-based invoicing.`,
    }];
  }
  if ((summary.draftedCount > 0 || summary.invoicedCount > 0) && (summary.openCount > 0 || summary.billableActiveCount > summary.draftedCount + summary.invoicedCount)) {
    return [{
      label: 'Partially invoiced',
      className: 'bg-blue-50 text-blue-700',
      title: 'Some work items are drafted or invoiced while other work remains open or unresolved.',
    }];
  }
  if (summary.billableActiveCount > 0 && summary.invoicedCount === summary.billableActiveCount) {
    return [{
      label: 'Fully invoiced',
      className: 'bg-emerald-50 text-emerald-700',
      title: 'All active billable work items are invoiced.',
    }];
  }
  if (summary.openCount > 0) {
    return [{
      label: 'Backlog open',
      className: 'bg-amber-50 text-amber-700',
      title: `${summary.openCount} open backlog item${summary.openCount === 1 ? '' : 's'} remain on this job.`,
    }];
  }
  if (summary.completedCount > 0 && summary.completedCount < summary.billableActiveCount) {
    return [{
      label: 'Partially complete',
      className: 'bg-sky-50 text-sky-700',
      title: 'Some work items are complete and other billable work remains.',
    }];
  }
  if (summary.billableActiveCount === 0) {
    return [{
      label: 'No billable items',
      className: 'bg-slate-100 text-slate-600',
      title: 'This job has durable work items, but none are currently billable.',
    }];
  }
  return [];
}

export function getJobWorkItemNextAction(summary: JobWorkItemSummary) {
  if (summary.totalItems === 0) return '';
  if (summary.readyToInvoiceCount > 0) return 'Create an item-based invoice from completed, priced work items.';
  if (summary.priceRequiredCount > 0) return 'Add prices to completed work items before item-based invoicing.';
  if (summary.openCount > 0 && summary.draftedCount + summary.invoicedCount > 0) return 'Continue the remaining backlog or review linked invoices.';
  if (summary.openCount > 0) return 'Complete backlog items before invoicing them.';
  if (summary.billableActiveCount === 0) return 'No billable work items are available for invoicing.';
  if (summary.invoicedCount === summary.billableActiveCount) return 'All active billable work items are invoiced.';
  return 'Review work items before invoicing.';
}
