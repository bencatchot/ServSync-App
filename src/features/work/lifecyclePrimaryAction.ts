import type { EstimateStatus, InvoiceStatus, JobLifecycleStatus } from '../../types';

export type LifecyclePrimaryActionId =
  | 'review_request'
  | 'respond_to_request'
  | 'start_service_visit'
  | 'open_service_visit'
  | 'edit_estimate'
  | 'send_estimate'
  | 'wait_for_homeowner'
  | 'create_job'
  | 'open_job'
  | 'start_work'
  | 'continue_work'
  | 'create_invoice'
  | 'open_invoice'
  | 'edit_invoice'
  | 'send_invoice'
  | 'record_payment'
  | 'review_record';

export type LifecycleNextStep = {
  id: LifecyclePrimaryActionId;
  title: string;
  helper: string;
  waiting?: boolean;
};

export function requestLifecycleNextStep(input: {
  canRespond: boolean;
  canManageJobOperations: boolean;
  hasServiceVisit: boolean;
}): LifecycleNextStep {
  if (input.canRespond) {
    return {
      id: 'respond_to_request',
      title: 'Review the request and reply',
      helper: 'Confirm what the customer needs before choosing an Estimate or service-visit path.',
    };
  }
  if (input.canManageJobOperations) {
    return input.hasServiceVisit
      ? { id: 'open_service_visit', title: 'Continue the service visit', helper: 'Open the linked Job and continue the operational work.' }
      : { id: 'start_service_visit', title: 'Start a service visit', helper: 'Create the operational Job without entering a financial workflow.' };
  }
  return {
    id: 'review_request',
    title: 'Review the request',
    helper: 'This request is read-only for your role.',
  };
}

export function estimateLifecycleNextStep(input: {
  status: EstimateStatus;
  canManageEstimate: boolean;
  hasConnectedHomeowner: boolean;
  canCreateJob: boolean;
  hasLinkedJob: boolean;
}): LifecycleNextStep {
  if (input.status === 'draft') {
    if (!input.canManageEstimate) return { id: 'review_record', title: 'Review the Estimate', helper: 'This Estimate is read-only for your role.' };
    if (!input.hasConnectedHomeowner) return { id: 'edit_estimate', title: 'Finish the Estimate', helper: 'Review the draft, then use the supported local-customer delivery path.' };
    return { id: 'send_estimate', title: 'Send the Estimate', helper: 'Review the scope and price, then send this draft to the homeowner.' };
  }
  if (input.status === 'sent') {
    return { id: 'wait_for_homeowner', title: 'Wait for the homeowner response', helper: 'The Estimate is sent. No contractor action is required until the customer responds.', waiting: true };
  }
  if (input.status === 'accepted') {
    if (input.hasLinkedJob) return { id: 'open_job', title: 'Continue in the Job', helper: 'The accepted scope is already linked to an operational Job.' };
    if (input.canCreateJob) return { id: 'create_job', title: 'Create the Job', helper: 'Carry the accepted scope into Work and begin tracking completion.' };
    return { id: 'review_record', title: 'Review the accepted Estimate', helper: 'A role with Job authority can create the next operational record.' };
  }
  return { id: 'review_record', title: 'Review the Estimate', helper: 'This Estimate has no further lifecycle action.' };
}

export function jobLifecycleNextStep(input: {
  status: JobLifecycleStatus;
  canManageJobOperations: boolean;
  canManageFinancialActions: boolean;
  hasLinkedInvoice: boolean;
  hasDurableWorkItems: boolean;
}): LifecycleNextStep {
  if (['completed', 'closed'].includes(input.status)) {
    if (input.hasLinkedInvoice) return { id: 'open_invoice', title: 'Continue in Financials', helper: 'Open the Invoice linked to this completed Job.' };
    if (input.canManageFinancialActions) {
      return {
        id: 'create_invoice',
        title: input.hasDurableWorkItems ? 'Review completed items for invoicing' : 'Create the Invoice',
        helper: input.hasDurableWorkItems
          ? 'Choose completed, priced work before creating the billing record in Financials.'
          : 'Create the billing record from this completed Job in Financials.',
      };
    }
    return { id: 'review_record', title: 'Review completed work', helper: 'The completed Job is read-only for your role.' };
  }
  if (!input.canManageJobOperations) return { id: 'review_record', title: 'Review the Job', helper: 'This Job is read-only for your role.' };
  if (input.status === 'draft') return { id: 'start_work', title: 'Start the work', helper: 'Open the Job, review the scope, and begin recording progress.' };
  return { id: 'continue_work', title: 'Continue the work', helper: 'Open the Job and record progress before completing it.' };
}

export function invoiceLifecycleNextStep(input: {
  status: InvoiceStatus;
  canManageFinancialActions: boolean;
  canRecordPayment: boolean;
  hasConnectedHomeowner: boolean;
}): LifecycleNextStep {
  if (!input.canManageFinancialActions) return { id: 'review_record', title: 'Review the Invoice', helper: 'This Invoice is read-only for your role.' };
  if (input.status === 'draft') {
    if (!input.hasConnectedHomeowner) return { id: 'edit_invoice', title: 'Finish the Invoice', helper: 'Review the draft, then use the supported local-customer delivery path.' };
    return { id: 'send_invoice', title: 'Send the Invoice', helper: 'Review this billing record, then send it to the homeowner.' };
  }
  if (['sent', 'viewed', 'overdue', 'partially_paid'].includes(input.status) && input.canRecordPayment) {
    return { id: 'record_payment', title: 'Record the payment', helper: 'Apply an authorized offline payment or review the remaining balance.' };
  }
  return { id: 'review_record', title: 'Review the Invoice', helper: 'Review the current status, balance, and document.' };
}
