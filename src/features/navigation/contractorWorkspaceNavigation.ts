export type ContractorWorkspaceTab =
  | 'overview'
  | 'profile'
  | 'connections'
  | 'requests'
  | 'calendar'
  | 'invites'
  | 'discover'
  | 'marketing'
  | 'work'
  | 'financials'
  | 'beta'
  | 'trust'
  | 'privacy'
  | 'support';

export type ContractorWorkView =
  | 'overview'
  | 'needs_attention'
  | 'drafts'
  | 'new_jobs'
  | 'open_jobs'
  | 'closed_jobs'
  | 'new_estimates'
  | 'open_estimates'
  | 'closed_estimates'
  | 'templates'
  | 'custom_pricing'
  | 'service_agreements';

export type ContractorFinancialsView =
  | 'overview'
  | 'needs_attention'
  | 'new_invoices'
  | 'open_invoices'
  | 'closed_invoices';

export type ContractorWorkHeaderTab = 'overview' | 'estimates' | 'jobs_reports' | 'templates';
export type ContractorFinancialsHeaderTab = 'overview' | 'invoices';

type StorageReader = Pick<Storage, 'getItem'>;

export type ContractorNavigationStorageKeys = {
  contractorTab: string;
  contractorWorkView: string;
  contractorFinancialsView: string;
  contractorWorkCustomerFilter: string;
  contractorFinancialsCustomerFilter: string;
  contractorJobsView: string;
  contractorJobsCustomerFilter: string;
  contractorFinancialRecordKind: string;
};

export type ContractorNavigationState = {
  tab: ContractorWorkspaceTab;
  workView: ContractorWorkView;
  financialsView: ContractorFinancialsView;
  workCustomerFilter: string | null;
  financialsCustomerFilter: string | null;
  migratedLegacyState: boolean;
};

const CONTRACTOR_TABS: readonly ContractorWorkspaceTab[] = [
  'overview',
  'profile',
  'connections',
  'requests',
  'calendar',
  'invites',
  'discover',
  'marketing',
  'work',
  'financials',
  'beta',
  'trust',
  'privacy',
  'support',
];

const WORK_VIEWS: readonly ContractorWorkView[] = [
  'overview',
  'needs_attention',
  'drafts',
  'new_jobs',
  'open_jobs',
  'closed_jobs',
  'new_estimates',
  'open_estimates',
  'closed_estimates',
  'templates',
  'custom_pricing',
  'service_agreements',
];

const FINANCIALS_VIEWS: readonly ContractorFinancialsView[] = [
  'overview',
  'needs_attention',
  'new_invoices',
  'open_invoices',
  'closed_invoices',
];

function storedAllowed<T extends string>(storage: StorageReader, key: string, allowed: readonly T[], fallback: T): T {
  const value = storage.getItem(key);
  return value && allowed.includes(value as T) ? value as T : fallback;
}

function storedFilter(storage: StorageReader, key: string): string | null {
  return storage.getItem(key)?.trim() || null;
}

function legacyWorkView(value: string | null, recordKind: string | null): ContractorWorkView {
  switch (value) {
    case 'needs_attention':
    case 'drafts':
    case 'new_jobs':
    case 'open_jobs':
    case 'closed_jobs':
    case 'templates':
    case 'custom_pricing':
    case 'service_agreements':
      return value;
    case 'new_financial':
      return recordKind === 'estimates' ? 'new_estimates' : 'overview';
    case 'closed_financial':
      return recordKind === 'estimates' ? 'closed_estimates' : 'overview';
    case 'open_financial':
      return recordKind === 'estimates' ? 'open_estimates' : 'overview';
    default:
      return 'overview';
  }
}

function legacyFinancialsView(value: string | null, recordKind: string | null): ContractorFinancialsView {
  if (recordKind !== 'invoices') return 'overview';
  switch (value) {
    case 'new_financial':
      return 'new_invoices';
    case 'closed_financial':
      return 'closed_invoices';
    case 'open_financial':
      return 'open_invoices';
    default:
      return 'overview';
  }
}

export function contractorNavigationStateFromStorage(
  storage: StorageReader,
  keys: ContractorNavigationStorageKeys,
): ContractorNavigationState {
  const rawTab = storage.getItem(keys.contractorTab);
  const rawLegacyView = storage.getItem(keys.contractorJobsView);
  const rawLegacyKind = storage.getItem(keys.contractorFinancialRecordKind);
  const legacyCustomerFilter = storedFilter(storage, keys.contractorJobsCustomerFilter);
  const hasLegacyState = rawTab === 'inspections'
    || rawLegacyView !== null
    || rawLegacyKind !== null
    || legacyCustomerFilter !== null;
  const legacyFinancialDestination = rawTab === 'inspections'
    && ['new_financial', 'open_financial', 'closed_financial'].includes(rawLegacyView ?? '')
    && rawLegacyKind === 'invoices';

  const tab = rawTab === 'inspections'
    ? legacyFinancialDestination ? 'financials' : 'work'
    : storedAllowed(storage, keys.contractorTab, CONTRACTOR_TABS, 'overview');
  const workView = storedAllowed(
    storage,
    keys.contractorWorkView,
    WORK_VIEWS,
    hasLegacyState ? legacyWorkView(rawLegacyView, rawLegacyKind) : 'overview',
  );
  const financialsView = storedAllowed(
    storage,
    keys.contractorFinancialsView,
    FINANCIALS_VIEWS,
    hasLegacyState ? legacyFinancialsView(rawLegacyView, rawLegacyKind) : 'overview',
  );
  const workCustomerFilter = storedFilter(storage, keys.contractorWorkCustomerFilter)
    ?? (tab === 'work' ? legacyCustomerFilter : null);
  const financialsCustomerFilter = storedFilter(storage, keys.contractorFinancialsCustomerFilter)
    ?? (tab === 'financials' ? legacyCustomerFilter : null);

  return {
    tab,
    workView,
    financialsView,
    workCustomerFilter,
    financialsCustomerFilter,
    migratedLegacyState: hasLegacyState,
  };
}

export function workHeaderTabForView(view: ContractorWorkView): ContractorWorkHeaderTab {
  if (view === 'new_estimates' || view === 'open_estimates' || view === 'closed_estimates') return 'estimates';
  if (view === 'new_jobs' || view === 'open_jobs' || view === 'closed_jobs') return 'jobs_reports';
  if (view === 'templates' || view === 'custom_pricing' || view === 'service_agreements') return 'templates';
  return 'overview';
}

export function financialsHeaderTabForView(view: ContractorFinancialsView): ContractorFinancialsHeaderTab {
  return view === 'overview' ? 'overview' : 'invoices';
}

export function estimateWorkViewForStatus(status: string): ContractorWorkView {
  return ['declined', 'expired', 'revised'].includes(status) ? 'closed_estimates' : 'open_estimates';
}

export function invoiceFinancialsViewForStatus(status: string): ContractorFinancialsView {
  return ['paid', 'void'].includes(status) ? 'closed_invoices' : 'open_invoices';
}
