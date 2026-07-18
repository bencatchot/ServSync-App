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

export function contractorWorkDashboardIsEmpty({
  draftsToContinueCount,
  activeJobsCount,
  workReadyToStartCount,
  readyToInvoiceJobCount,
  invoiceAttentionCount,
  upcomingWorkCount,
}: {
  draftsToContinueCount: number;
  activeJobsCount: number;
  workReadyToStartCount: number;
  readyToInvoiceJobCount: number;
  invoiceAttentionCount: number;
  upcomingWorkCount: number;
}) {
  return draftsToContinueCount === 0
    && activeJobsCount === 0
    && workReadyToStartCount === 0
    && readyToInvoiceJobCount === 0
    && invoiceAttentionCount === 0
    && upcomingWorkCount === 0;
}
