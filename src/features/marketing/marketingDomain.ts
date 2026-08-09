import type { UserRole } from '../../types';

export const MARKETING_WORKSPACE_SECTIONS = [
  'overview',
  'content',
  'campaigns',
  'prospects',
  'growth',
  'settings',
] as const;

export type MarketingWorkspaceSection = (typeof MARKETING_WORKSPACE_SECTIONS)[number];

export type MarketingWorkspaceAudience =
  | { kind: 'internal' }
  | { kind: 'contractor'; contractorId: string };

export type MarketingMetricState = 'available' | 'unavailable' | 'not_connected';

export type MarketingMetric = {
  id: 'published' | 'website_visits' | 'signups' | 'contractors' | 'homeowners' | 'invites';
  label: string;
  value: number | null;
  state: MarketingMetricState;
  helper: string;
};

export type MarketingApprovalItem = {
  id: string;
  title: string;
  status: 'pending';
};

export type MarketingUpcomingItem = {
  id: string;
  title: string;
  scheduledFor: string;
};

export type MarketingRecommendedAction = {
  id: string;
  title: string;
  rationale: string;
};

export type MarketingOverviewData = {
  metrics: MarketingMetric[];
  approvals: MarketingApprovalItem[];
  upcoming: MarketingUpcomingItem[];
  recommendedNextAction: MarketingRecommendedAction | null;
};

export type InternalMarketingOverviewSource = {
  contractors: number | null;
  homeowners: number | null;
  activeInvites: number | null;
};

export function canAccessInternalMarketing(role: UserRole | null | undefined) {
  return role === 'platform_admin';
}

function sourcedCount(
  id: 'contractors' | 'homeowners' | 'invites',
  label: string,
  value: number | null,
  helper: string,
): MarketingMetric {
  return {
    id,
    label,
    value,
    state: value === null ? 'unavailable' : 'available',
    helper,
  };
}

export function buildInternalMarketingOverview(source: InternalMarketingOverviewSource): MarketingOverviewData {
  return {
    metrics: [
      {
        id: 'published',
        label: 'Published',
        value: 0,
        state: 'available',
        helper: 'No workspace publishing activity.',
      },
      {
        id: 'website_visits',
        label: 'Website Visits',
        value: null,
        state: 'not_connected',
        helper: 'Website analytics are not connected.',
      },
      {
        id: 'signups',
        label: 'Signups',
        value: null,
        state: 'unavailable',
        helper: 'Acquisition attribution is unavailable.',
      },
      sourcedCount('contractors', 'Contractors', source.contractors, 'Current ServSync contractor accounts.'),
      sourcedCount('homeowners', 'Homeowners', source.homeowners, 'Current ServSync homeowner accounts.'),
      sourcedCount('invites', 'Invites', source.activeInvites, 'Current active ServSync invites.'),
    ],
    approvals: [],
    upcoming: [],
    recommendedNextAction: null,
  };
}
