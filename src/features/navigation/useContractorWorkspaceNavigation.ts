import { useCallback, useEffect, useRef, useState } from 'react';
import { STORAGE_KEYS } from '../../utils/localStorage';
import {
  contractorNavigationStateFromStorage,
  isContractorWorkspaceTab,
  type ContractorFinancialsView,
  type ContractorWorkspaceTab,
  type ContractorWorkView,
} from './contractorWorkspaceNavigation';

const practiceRequested = () => window.location.hash.split('?')[0] === '#/contractor'
  && new URLSearchParams(window.location.hash.split('?')[1]).get('practice') === 'estimate';
const historyTabKey = 'servsyncContractorTab';

export function useContractorWorkspaceNavigation() {
  const [initialNavigation] = useState(() => contractorNavigationStateFromStorage(window.localStorage, STORAGE_KEYS));
  const [tab, setCurrentTab] = useState<ContractorWorkspaceTab>(() => practiceRequested() ? 'practice' : isContractorWorkspaceTab(window.history.state?.[historyTabKey]) ? window.history.state[historyTabKey] : initialNavigation.tab);
  const tabRef = useRef(tab);
  const setTab = useCallback((next: ContractorWorkspaceTab, replace = false) => {
    const previous = tabRef.current;
    if (next === previous) return;
    // Only Practice transitions introduce history entries; existing workspace entry paths stay intact.
    if (window.location.hash.split('?')[0] === '#/contractor'
      && (next === 'practice' || previous === 'practice' || window.history.state?.[historyTabKey])) {
      const params = new URLSearchParams(window.location.hash.split('?')[1]);
      if (next === 'practice') params.set('practice', 'estimate');
      else params.delete('practice');
      if (!replace) window.history.replaceState({ ...window.history.state, [historyTabKey]: previous }, '');
      window.history[replace ? 'replaceState' : 'pushState']({ ...window.history.state, [historyTabKey]: next }, '', `#/contractor${params.size ? `?${params}` : ''}`);
    }
    tabRef.current = next;
    setCurrentTab(next);
  }, []);
  useEffect(() => {
    const restore = () => {
      if (window.location.hash.split('?')[0] !== '#/contractor') return;
      const recorded = window.history.state?.[historyTabKey];
      const next = practiceRequested() ? 'practice' : isContractorWorkspaceTab(recorded) ? recorded : 'overview';
      tabRef.current = next;
      setCurrentTab(next);
    };
    window.addEventListener('popstate', restore);
    window.addEventListener('hashchange', restore);
    return () => {
      window.removeEventListener('popstate', restore);
      window.removeEventListener('hashchange', restore);
    };
  }, []);
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
