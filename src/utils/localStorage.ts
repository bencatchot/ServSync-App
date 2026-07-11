export const STORAGE_KEYS = {
  homeownerTab: 'servsync.homeowner.activeTab',
  homeownerSelectedHome: 'servsync.homeowner.selectedHome',
  homeownerRequestView: 'servsync.homeowner.requestView',
  homeownerRequestSearch: 'servsync.homeowner.requestSearch',
  homeownerExpandedRequests: 'servsync.homeowner.expandedRequests',
  homeownerHomeSetupSkipped: 'servsync.homeowner.homeSetupSkipped',
  contractorTab: 'servsync.contractor.activeTab',
  contractorHomeownerFilter: 'servsync.contractor.homeownerFilter',
  contractorHomeownerSearch: 'servsync.contractor.homeownerSearch',
  contractorSelectedHomeowner: 'servsync.contractor.selectedHomeowner',
  contractorHomeownerDetailTab: 'servsync.contractor.homeownerDetailTab',
  contractorHomeownerRequestView: 'servsync.contractor.homeownerRequestView',
  contractorJobsCustomerFilter: 'servsync.contractor.jobsCustomerFilter',
  contractorJobsView: 'servsync.contractor.jobsView',
  contractorProfileSetupSkipped: 'servsync.contractor.profileSetupSkipped',
  contractorViewedCalendarVisits: 'servsync.contractor.viewedCalendarVisits',
  fieldWorkState: 'servsync.contractor.fieldWorkState',
} as const;

export const SIGN_OUT_LOCAL_STORAGE_KEYS = [
  STORAGE_KEYS.fieldWorkState,
  STORAGE_KEYS.homeownerRequestSearch,
  STORAGE_KEYS.contractorHomeownerSearch,
  STORAGE_KEYS.contractorSelectedHomeowner,
  STORAGE_KEYS.contractorJobsCustomerFilter,
] as const;

export function clearSensitiveLocalStateOnSignOut() {
  try {
    SIGN_OUT_LOCAL_STORAGE_KEYS.forEach(key => window.localStorage.removeItem(key));
  } catch {
    // Local storage cleanup should never block Supabase sign-out.
  }
}

export function storedTab<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const stored = window.localStorage.getItem(key) as T | null;
  return stored && allowed.includes(stored) ? stored : fallback;
}

export function storedStringSet(key: string): Set<string> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}
