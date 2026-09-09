import type { ContractorAccountStatus, ContractorSubscriptionStatus } from '../../types';

export type AdminContractorDraft = {
  account_status: ContractorAccountStatus;
  subscription_status: ContractorSubscriptionStatus;
  monthly_price: string;
  subscription_notes: string;
  admin_notes: string;
};
