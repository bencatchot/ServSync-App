import type { DurableDraftCompatibilityCapabilities } from '../drafts/durableDraftLaunchTypes';

export type ContractorFinancialActionVisibility = {
  canManageBilling: boolean;
  canCreateJobFromEstimate: boolean;
};

// Translate the existing server-resolved capabilities into presentation choices.
// These flags are not authorization boundaries; every mutation remains server checked.
export function contractorFinancialActionVisibility(
  capabilities: Pick<DurableDraftCompatibilityCapabilities, 'canLaunchInvoice' | 'canLaunchJob'>,
): ContractorFinancialActionVisibility {
  return {
    canManageBilling: capabilities.canLaunchInvoice,
    canCreateJobFromEstimate: capabilities.canLaunchJob,
  };
}

export function invoiceRecordOpensEditable(
  status: string,
  visibility: ContractorFinancialActionVisibility,
): boolean {
  return status === 'draft' && visibility.canManageBilling;
}
