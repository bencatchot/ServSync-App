export type TradeSectionContractorRole = 'owner' | 'admin' | 'office' | 'field_tech' | 'viewer' | null;

type DurableTradeSectionsUiEnv = {
  VITE_DURABLE_TRADE_SECTIONS_UI_ENABLED?: string;
};

const defaultEnv = (): DurableTradeSectionsUiEnv => (import.meta.env ?? {}) as DurableTradeSectionsUiEnv;

export function isDurableTradeSectionsUiEnabled(env: DurableTradeSectionsUiEnv = defaultEnv()) {
  return env.VITE_DURABLE_TRADE_SECTIONS_UI_ENABLED === 'true';
}

export const DURABLE_TRADE_SECTIONS_UI_ENABLED = isDurableTradeSectionsUiEnabled();

export function tradeSectionRoleAccess(role: TradeSectionContractorRole) {
  return {
    canRead: role === 'owner' || role === 'admin' || role === 'office' || role === 'viewer',
    canMutate: role === 'owner' || role === 'admin' || role === 'office',
  };
}

export function isEligibleTradeSectionJob(input: {
  jobStatus: string | null | undefined;
  recordStatus: string | null | undefined;
}) {
  return input.recordStatus !== 'finalized'
    && (input.jobStatus === 'draft' || input.jobStatus === 'scheduled' || input.jobStatus === 'in_progress');
}

export function shouldMountTradeSectionJobPanel(input: {
  enabled: boolean;
  role: TradeSectionContractorRole;
  jobStatus: string | null | undefined;
  recordStatus: string | null | undefined;
}) {
  return input.enabled
    && tradeSectionRoleAccess(input.role).canRead
    && isEligibleTradeSectionJob(input);
}
