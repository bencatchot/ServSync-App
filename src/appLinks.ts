import type { UserRole } from './types';

export const APP_ROUTE_NAMES = [
  'home',
  'homeowner',
  'contractor',
  'admin',
  'profile',
  'terms',
  'privacy',
  'acceptable-use',
  'contractor-agreement',
  'trust-safety',
] as const;

export type AppRouteName = typeof APP_ROUTE_NAMES[number];

type AppRouteQuery = Record<string, string | number | boolean | null | undefined>;
type AppLocationLike = Pick<Location, 'origin' | 'pathname'>;

function currentBrowserLocation(): AppLocationLike {
  if (typeof window === 'undefined') {
    throw new Error('App route URLs require a browser location.');
  }
  return window.location;
}

export function appWebBaseUrl(location: AppLocationLike = currentBrowserLocation()) {
  const pathname = location.pathname || '/';
  return `${location.origin}${pathname}`;
}

export function appHashRoute(route: AppRouteName, query: AppRouteQuery = {}) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    params.set(key, String(value));
  });
  const queryString = params.toString();
  return `#/${route}${queryString ? `?${queryString}` : ''}`;
}

export function appRouteUrl(route: AppRouteName, query: AppRouteQuery = {}, location?: AppLocationLike) {
  return `${appWebBaseUrl(location ?? currentBrowserLocation())}${appHashRoute(route, query)}`;
}

export function passwordResetRouteForRole(role: UserRole): AppRouteName {
  if (role === 'contractor') return 'contractor';
  if (role === 'platform_admin') return 'admin';
  return 'homeowner';
}

export function passwordResetRedirectTo(role: UserRole, location?: AppLocationLike) {
  return appRouteUrl(passwordResetRouteForRole(role), { mode: 'reset-password' }, location);
}

export function homeownerClaimUrl(token: string, location?: AppLocationLike) {
  return appRouteUrl('homeowner', { claim: token }, location);
}

export function homeownerInviteUrl(code: string, location?: AppLocationLike) {
  return appRouteUrl('homeowner', { invite: code }, location);
}

export function contractorTeamInviteUrl(code: string, location?: AppLocationLike) {
  return appRouteUrl('contractor', { team_invite: code }, location);
}

export function contractorProfileUrl(slug: string, location?: AppLocationLike) {
  return appRouteUrl('profile', { slug }, location);
}
