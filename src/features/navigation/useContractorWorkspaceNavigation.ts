import { useCallback, useEffect, useState } from 'react';
import { STORAGE_KEYS } from '../../utils/localStorage';
import {
  contractorNavigationStateFromStorage,
  type ContractorFinancialsView,
  type ContractorWorkspaceTab,
  type ContractorWorkView,
} from './contractorWorkspaceNavigation';

export function useContractorWorkspaceNavigation() {
  const [initialNavigation] = useState(() => contractorNavigationStateFromStorage(window.localStorage, STORAGE_KEYS));
  const [tab, setTab] = useState<ContractorWorkspaceTab>(initialNavigation.tab);
  const [workView, setWorkView] = useState<ContractorWorkView>(initialNavigation.workView);
  const [financialsView, setFinancialsView] = useState<ContractorFinancialsView>(initialNavigation.financialsView);
  const [workCustomerFilter, setWorkCustomerFilter] = useState<string | null>(initialNavigation.workCustomerFilter);
  const [financialsCustomerFilter, setFinancialsCustomerFilter] = useState<string | null>(initialNavigation.financialsCustomerFilter);

  const setViewAndScroll = useCallback(<T,>(setter: (view: T) => void, view: T) => {
    setter(view);
    if (!window.matchMedia('(max-width: 767px)').matches) return;
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }, []);
  const setWorkViewAndScroll = useCallback(
    (view: ContractorWorkView) => setViewAndScroll(setWorkView, view),
    [setViewAndScroll],
  );
  const setFinancialsViewAndScroll = useCallback(
    (view: ContractorFinancialsView) => setViewAndScroll(setFinancialsView, view),
    [setViewAndScroll],
  );

  useEffect(() => window.localStorage.setItem(STORAGE_KEYS.contractorWorkView, workView), [workView]);
  useEffect(() => window.localStorage.setItem(STORAGE_KEYS.contractorFinancialsView, financialsView), [financialsView]);
  useEffect(() => {
    if (workCustomerFilter) window.localStorage.setItem(STORAGE_KEYS.contractorWorkCustomerFilter, workCustomerFilter);
    else window.localStorage.removeItem(STORAGE_KEYS.contractorWorkCustomerFilter);
  }, [workCustomerFilter]);
  useEffect(() => {
    if (financialsCustomerFilter) window.localStorage.setItem(STORAGE_KEYS.contractorFinancialsCustomerFilter, financialsCustomerFilter);
    else window.localStorage.removeItem(STORAGE_KEYS.contractorFinancialsCustomerFilter);
  }, [financialsCustomerFilter]);
  useEffect(() => {
    if (!initialNavigation.migratedLegacyState) return;
    window.localStorage.removeItem(STORAGE_KEYS.contractorJobsView);
    window.localStorage.removeItem(STORAGE_KEYS.contractorJobsCustomerFilter);
    window.localStorage.removeItem(STORAGE_KEYS.contractorFinancialRecordKind);
  }, [initialNavigation.migratedLegacyState]);

  return {
    initialNavigation,
    tab,
    setTab,
    workView,
    setWorkView,
    setWorkViewAndScroll,
    financialsView,
    setFinancialsView,
    setFinancialsViewAndScroll,
    workCustomerFilter,
    setWorkCustomerFilter,
    financialsCustomerFilter,
    setFinancialsCustomerFilter,
  };
}
