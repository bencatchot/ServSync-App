import type { ContractorTeamInviteStatus, ContractorTeamStatus, LocalCustomerClaimInviteStatus } from '../../types';
import { readableStatusLabel, type StatusPresentation } from '../status/statusPresentation';

export function homeAccessStatusPresentation(status?: string | null): StatusPresentation {
  const presentations: Record<string, StatusPresentation> = {
    invited: { label: 'Invited', tone: 'warning' },
    pending: { label: 'Pending', tone: 'warning' },
    active: { label: 'Active', tone: 'success' },
    accepted: { label: 'Accepted', tone: 'success' },
    removed: { label: 'Removed', tone: 'muted' },
    revoked: { label: 'Revoked', tone: 'muted' },
    declined: { label: 'Declined', tone: 'danger' },
    expired: { label: 'Expired', tone: 'warning' },
  };
  return presentations[status || ''] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}

export function localClaimInviteStatusPresentation(status: LocalCustomerClaimInviteStatus | string): StatusPresentation {
  const presentations: Partial<Record<LocalCustomerClaimInviteStatus, StatusPresentation>> = {
    pending: { label: 'Invite Pending', tone: 'warning' },
    claimed: { label: 'Claimed by Homeowner', tone: 'success' },
    declined: { label: 'Invite Declined', tone: 'danger' },
    expired: { label: 'Invite Expired', tone: 'warning' },
    revoked: { label: 'Invite Revoked', tone: 'danger' },
  };
  return presentations[status as LocalCustomerClaimInviteStatus] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}

export function contractorTeamStatusPresentation(status: ContractorTeamStatus | string): StatusPresentation {
  const presentations: Partial<Record<ContractorTeamStatus, StatusPresentation>> = {
    active: { label: 'Active', tone: 'success' },
    disabled: { label: 'Disabled', tone: 'muted' },
  };
  return presentations[status as ContractorTeamStatus] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}

export function contractorTeamInviteStatusPresentation(status: ContractorTeamInviteStatus | string): StatusPresentation {
  const presentations: Partial<Record<ContractorTeamInviteStatus, StatusPresentation>> = {
    pending: { label: 'Pending', tone: 'warning' },
    accepted: { label: 'Accepted', tone: 'success' },
    revoked: { label: 'Revoked', tone: 'muted' },
    expired: { label: 'Expired', tone: 'warning' },
  };
  return presentations[status as ContractorTeamInviteStatus] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}
