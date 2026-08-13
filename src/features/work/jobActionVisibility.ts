import type { DurableDraftCompatibilityCapabilities } from '../drafts/durableDraftLaunchTypes';

export type ContractorJobActionVisibility = {
  canManageJobOperations: boolean;
};

export function contractorJobActionVisibility(
  capabilities: Pick<DurableDraftCompatibilityCapabilities, 'canLaunchJob'>,
): ContractorJobActionVisibility {
  return {
    canManageJobOperations: capabilities.canLaunchJob,
  };
}
