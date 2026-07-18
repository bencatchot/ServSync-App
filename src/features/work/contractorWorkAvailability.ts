type ContractorWorkUiEnv = {
  VITE_CONTRACTOR_WORK_UI_ENABLED?: string;
};

const defaultContractorWorkUiEnv = (): ContractorWorkUiEnv => (import.meta.env ?? {}) as ContractorWorkUiEnv;

export function isContractorWorkUiEnabled(env: ContractorWorkUiEnv = defaultContractorWorkUiEnv()) {
  return env.VITE_CONTRACTOR_WORK_UI_ENABLED === 'true';
}

export const CONTRACTOR_WORK_UI_ENABLED = isContractorWorkUiEnabled();
