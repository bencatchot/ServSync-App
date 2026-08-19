import type { Estimate, Inspection, Invoice, JobWorkItem } from '../../types';
import { operationalJobsFrom } from '../jobs/jobRecordSelectors';
import { inspectionIsClosedJob, inspectionIsOpenJob } from '../jobs/status';
import { jobWorkItemCanInvoice } from '../jobs/workItemSummary';

export type ContractorWorkBillingAttention = {
  readyToInvoiceJobs: Inspection[];
  invoicesNeedingAttention: Invoice[];
};

export type ContractorWorkAttention = {
  acceptedEstimatesNeedingJobs: Estimate[];
  completedJobsReadyToInvoice: Inspection[];
  invoiceAttentionRecords: Invoice[];
  total: number;
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

export function contractorWorkLinkedNonVoidInvoiceForJob(
  job: Pick<Inspection, 'id' | 'estimate_id'>,
  invoices: Invoice[],
) {
  return invoices.find(invoice =>
    invoice.status !== 'void'
    && (invoice.job_id === job.id || (job.estimate_id ? invoice.estimate_id === job.estimate_id : false))
  ) ?? null;
}

export function contractorWorkCompletedJobsReadyToInvoiceFrom({
  inspections,
  invoices,
  jobWorkItemsByJobId,
}: {
  inspections: Inspection[];
  invoices: Invoice[];
  jobWorkItemsByJobId: Record<string, JobWorkItem[]>;
}) {
  return contractorWorkJobHistoryFrom(inspections).filter(job => {
    if (contractorWorkLinkedNonVoidInvoiceForJob(job, invoices)) return false;

    const jobWorkItems = jobWorkItemsByJobId[job.id] ?? [];
    return jobWorkItems.length === 0 || jobWorkItems.some(jobWorkItemCanInvoice);
  });
}

export function contractorWorkAttentionFrom({
  estimates,
  inspections,
  invoices,
  jobWorkItemsByJobId,
}: {
  estimates: Estimate[];
  inspections: Inspection[];
  invoices: Invoice[];
  jobWorkItemsByJobId: Record<string, JobWorkItem[]>;
}): ContractorWorkAttention {
  const operationalInspections = operationalJobsFrom(inspections);
  const acceptedEstimatesNeedingJobs = contractorWorkAcceptedEstimatesReadyToStartFrom(estimates, operationalInspections);
  const completedJobsReadyToInvoice = contractorWorkCompletedJobsReadyToInvoiceFrom({
    inspections: operationalInspections,
    invoices,
    jobWorkItemsByJobId,
  });
  const invoiceAttentionRecords = contractorWorkInvoicesNeedingAttentionFrom(invoices);

  return {
    acceptedEstimatesNeedingJobs,
    completedJobsReadyToInvoice,
    invoiceAttentionRecords,
    total: contractorJobsNeedsAttentionCount({
      acceptedEstimateCount: acceptedEstimatesNeedingJobs.length,
      readyToInvoiceJobCount: completedJobsReadyToInvoice.length,
      invoiceAttentionCount: invoiceAttentionRecords.length,
    }),
  };
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
