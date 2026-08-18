type ContractorMarketingUiEnv = {
  VITE_CONTRACTOR_MARKETING_UI_ENABLED?: string;
};

function defaultContractorMarketingUiEnv(): ContractorMarketingUiEnv {
  return (import.meta as unknown as { env?: ContractorMarketingUiEnv }).env ?? {};
}

export function isContractorMarketingUiEnabled(
  env: ContractorMarketingUiEnv = defaultContractorMarketingUiEnv(),
) {
  return env.VITE_CONTRACTOR_MARKETING_UI_ENABLED === 'true';
}

export const CONTRACTOR_MARKETING_UI_ENABLED = isContractorMarketingUiEnabled();
