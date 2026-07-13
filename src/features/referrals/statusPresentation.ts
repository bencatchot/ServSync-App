import type {
  ContractorReferralInviteAdminStatus,
  ContractorReferralInviteStatus,
  InviteStatus,
  ReferralRewardStatus,
  UniversalReferralRewardStatus,
  UniversalReferralStatus,
} from '../../types';
import { readableStatusLabel, type StatusPresentation } from '../status/statusPresentation';

export function homeownerContractorInviteStatusPresentation(status?: string | null): StatusPresentation {
  const presentations: Record<string, StatusPresentation> = {
    submitted: { label: 'Submitted', tone: 'info' },
    invite_sent: { label: 'Invite Sent', tone: 'info' },
    contractor_joined: { label: 'Contractor Joined', tone: 'success' },
    contractor_declined: { label: 'Contractor Declined', tone: 'danger' },
    no_response_30_days: { label: 'No Response After 30 Days', tone: 'warning' },
  };
  return presentations[status || ''] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}

export function adminInviteLeadStatusPresentation(status?: string | null): StatusPresentation {
  const presentations: Record<string, StatusPresentation> = {
    new: { label: 'New', tone: 'neutral' },
    researching: { label: 'Researching', tone: 'violet' },
    contacted: { label: 'Contacted', tone: 'info' },
    followed_up: { label: 'Followed Up', tone: 'info' },
    joined: { label: 'Joined', tone: 'success' },
    declined: { label: 'Declined', tone: 'danger' },
    no_response: { label: 'No Response', tone: 'warning' },
    bad_contact_info: { label: 'Bad Contact Info', tone: 'warning' },
    duplicate: { label: 'Duplicate', tone: 'muted' },
  };
  return presentations[status || ''] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}

export function contractorReferralInviteStatusPresentation(status: ContractorReferralInviteStatus | string): StatusPresentation {
  const presentations: Partial<Record<ContractorReferralInviteStatus, StatusPresentation>> = {
    created: { label: 'Created', tone: 'neutral' },
    sent: { label: 'Sent', tone: 'info' },
    signed_up: { label: 'Signed Up', tone: 'violet' },
    accepted: { label: 'Accepted', tone: 'success' },
    expired: { label: 'Expired', tone: 'warning' },
    cancelled: { label: 'Cancelled', tone: 'danger' },
    duplicate: { label: 'Duplicate', tone: 'muted' },
    admin_review: { label: 'Admin Review', tone: 'violet' },
  };
  return presentations[status as ContractorReferralInviteStatus] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}

export function contractorReferralAdminStatusPresentation(status: ContractorReferralInviteAdminStatus | string): StatusPresentation {
  const presentations: Partial<Record<ContractorReferralInviteAdminStatus, StatusPresentation>> = {
    new: { label: 'New', tone: 'neutral' },
    reviewing: { label: 'Reviewing', tone: 'violet' },
    contacted: { label: 'Contacted', tone: 'info' },
    followed_up: { label: 'Followed Up', tone: 'info' },
    joined: { label: 'Joined', tone: 'success' },
    duplicate: { label: 'Duplicate', tone: 'muted' },
    bad_contact_info: { label: 'Bad Contact Info', tone: 'warning' },
    declined: { label: 'Declined', tone: 'danger' },
    no_response: { label: 'No Response', tone: 'warning' },
    archived: { label: 'Archived', tone: 'muted' },
  };
  return presentations[status as ContractorReferralInviteAdminStatus] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}

export function inviteStatusPresentation(status: InviteStatus | string): StatusPresentation {
  const presentations: Partial<Record<InviteStatus, StatusPresentation>> = {
    active: { label: 'Active', tone: 'info' },
    used: { label: 'Used', tone: 'success' },
    revoked: { label: 'Revoked', tone: 'muted' },
    expired: { label: 'Expired', tone: 'warning' },
  };
  return presentations[status as InviteStatus] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}

export function referralRewardStatusPresentation(status: ReferralRewardStatus | string): StatusPresentation {
  const presentations: Partial<Record<ReferralRewardStatus, StatusPresentation>> = {
    not_eligible: { label: 'Not Eligible', tone: 'muted' },
    pending_review: { label: 'Pending Review', tone: 'warning' },
    approved: { label: 'Approved', tone: 'success' },
    denied: { label: 'Denied', tone: 'danger' },
    paid: { label: 'Paid', tone: 'success' },
  };
  return presentations[status as ReferralRewardStatus] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}

export function universalReferralStatusPresentation(status: UniversalReferralStatus | string): StatusPresentation {
  const presentations: Partial<Record<UniversalReferralStatus, StatusPresentation>> = {
    pending: { label: 'Pending', tone: 'warning' },
    signed_up: { label: 'Signed Up', tone: 'violet' },
    qualified: { label: 'Qualified', tone: 'success' },
    reward_approved: { label: 'Reward Approved', tone: 'success' },
    reward_paid: { label: 'Reward Paid', tone: 'success' },
    rejected: { label: 'Rejected', tone: 'danger' },
  };
  return presentations[status as UniversalReferralStatus] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}

export function universalReferralRewardStatusPresentation(status: UniversalReferralRewardStatus | string): StatusPresentation {
  const presentations: Partial<Record<UniversalReferralRewardStatus, StatusPresentation>> = {
    pending: { label: 'Pending', tone: 'warning' },
    approved: { label: 'Approved', tone: 'success' },
    denied: { label: 'Denied', tone: 'danger' },
    paid: { label: 'Paid', tone: 'success' },
    not_eligible: { label: 'Not Eligible', tone: 'muted' },
  };
  return presentations[status as UniversalReferralRewardStatus] ?? { label: readableStatusLabel(status), tone: 'neutral' };
}
