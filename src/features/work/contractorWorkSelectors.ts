import type { Estimate, Inspection, Invoice } from '../../types';
import { operationalJobsFrom } from '../jobs/jobRecordSelectors';
import { inspectionIsClosedJob, inspectionIsOpenJob } from '../jobs/status';

export type ContractorWorkBillingAttention = {
  readyToInvoiceJobs: Inspection[];
  invoicesNeedingAttention: Invoice[];
};

export function contractorWorkActiveJobsFrom(inspections: Inspection[]) {
  return operationalJobsFrom(inspections).filter(inspectionIsOpenJob);
}

export function contractorWorkJobHistoryFrom(inspections: Inspection[]) {
  return operationalJobsFrom(inspections).filter(inspectionIsClosedJob);
}

export function contractorWorkAcceptedEstimatesReadyToStartFrom(estimates: Estimate[], operationalInspections: Inspection[]) {
  return estimates.filter(estimate =>
    estimate.status === 'accepted'
    && !estimate.inspection_id
    && !operationalInspections.some(inspection => inspection.estimate_id === estimate.id)
  );
}

export function contractorWorkInvoicesNeedingAttentionFrom(invoices: Invoice[]) {
  return invoices.filter(invoice => ['draft', 'overdue', 'partially_paid'].includes(invoice.status));
}

export function contractorJobsNeedsAttentionCount({
  acceptedEstimateCount,
  readyToInvoiceJobCount,
  invoiceAttentionCount,
}: {
  acceptedEstimateCount: number;
  readyToInvoiceJobCount: number;
  invoiceAttentionCount: number;
}) {
  return acceptedEstimateCount + readyToInvoiceJobCount + invoiceAttentionCount;
}
