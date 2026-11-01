import { useEffect } from 'react';
import type { ContractorWorkspaceTab } from './contractorWorkspaceNavigation';

export function useContractorPracticeAccess(tab: ContractorWorkspaceTab, setTab: (tab: ContractorWorkspaceTab, replace?: boolean) => void, eligible: boolean, loading: boolean) {
  useEffect(() => {
    if (!loading && !eligible && tab === 'practice') setTab('overview', true);
  }, [loading, eligible, tab, setTab]);
}
