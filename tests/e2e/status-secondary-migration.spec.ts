import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  contractorTeamInviteStatusPresentation,
  contractorTeamStatusPresentation,
  homeAccessStatusPresentation,
  localClaimInviteStatusPresentation,
} from '../../src/features/access/statusPresentation';
import {
  adminInviteLeadStatusPresentation,
  contractorReferralAdminStatusPresentation,
  contractorReferralInviteStatusPresentation,
  homeownerContractorInviteStatusPresentation,
  inviteStatusPresentation,
  referralRewardStatusPresentation,
  universalReferralRewardStatusPresentation,
  universalReferralStatusPresentation,
} from '../../src/features/referrals/statusPresentation';
import { reviewModerationStatusPresentation } from '../../src/features/reviews/statusPresentation';
import {
  serviceAgreementOfferStatusPresentation,
  serviceAgreementStatusPresentation,
  serviceAgreementTemplateStatusPresentation,
} from '../../src/features/serviceAgreements/statusPresentation';
import { supportStatusPresentation } from '../../src/features/support/statusPresentation';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test.describe('Secondary status migration', () => {
  test('defines canonical presentation for service agreement, support, review, referral, and access statuses', () => {
    expect(serviceAgreementTemplateStatusPresentation('active')).toEqual({ label: 'Template Active', tone: 'success' });
    expect(serviceAgreementOfferStatusPresentation('withdrawn')).toEqual({ label: 'Withdrawn', tone: 'muted' });
    expect(serviceAgreementStatusPresentation('cancelled')).toEqual({ label: 'Cancelled', tone: 'danger' });

    expect(supportStatusPresentation('waiting_on_user')).toEqual({ label: 'Waiting on You', tone: 'violet' });
    expect(supportStatusPresentation('waiting_on_user', 'admin')).toEqual({ label: 'Waiting on User', tone: 'violet' });
    expect(supportStatusPresentation('waiting_on_admin')).toEqual({ label: 'Waiting on ServSync', tone: 'info' });
    expect(reviewModerationStatusPresentation('hidden')).toEqual({ label: 'Hidden', tone: 'muted' });

    expect(homeownerContractorInviteStatusPresentation('invite_sent')).toEqual({ label: 'Invite Sent', tone: 'info' });
    expect(adminInviteLeadStatusPresentation('bad_contact_info')).toEqual({ label: 'Bad Contact Info', tone: 'warning' });
    expect(contractorReferralInviteStatusPresentation('admin_review')).toEqual({ label: 'Admin Review', tone: 'violet' });
    expect(contractorReferralAdminStatusPresentation('no_response')).toEqual({ label: 'No Response', tone: 'warning' });
    expect(inviteStatusPresentation('used')).toEqual({ label: 'Used', tone: 'success' });
    expect(referralRewardStatusPresentation('pending_review')).toEqual({ label: 'Pending Review', tone: 'warning' });
    expect(universalReferralStatusPresentation('reward_paid')).toEqual({ label: 'Reward Paid', tone: 'success' });
    expect(universalReferralRewardStatusPresentation('not_eligible')).toEqual({ label: 'Not Eligible', tone: 'muted' });

    expect(homeAccessStatusPresentation('accepted')).toEqual({ label: 'Accepted', tone: 'success' });
    expect(localClaimInviteStatusPresentation('claimed')).toEqual({ label: 'Claimed by Homeowner', tone: 'success' });
    expect(contractorTeamStatusPresentation('disabled')).toEqual({ label: 'Disabled', tone: 'muted' });
    expect(contractorTeamInviteStatusPresentation('pending')).toEqual({ label: 'Pending', tone: 'warning' });
  });

  test('falls back safely for unknown secondary status values', () => {
    expect(serviceAgreementOfferStatusPresentation('awaiting_approval')).toEqual({ label: 'Awaiting Approval', tone: 'neutral' });
    expect(supportStatusPresentation('needs-admin-review')).toEqual({ label: 'Needs Admin Review', tone: 'neutral' });
    expect(homeownerContractorInviteStatusPresentation(null)).toEqual({ label: 'Unknown', tone: 'neutral' });
    expect(reviewModerationStatusPresentation(undefined)).toEqual({ label: 'Unknown', tone: 'neutral' });
  });

  test('migrates secondary status surfaces to StatusBadge without changing workflow controls', () => {
    const source = sourceFile('src/App.tsx');

    expect(source).toContain("import { StatusBadge } from './features/status/StatusBadge';");
    expect(source).toContain("from './features/serviceAgreements/statusPresentation';");
    expect(source).toContain("from './features/support/statusPresentation';");
    expect(source).toContain("from './features/referrals/statusPresentation';");
    expect(source).toContain("from './features/reviews/statusPresentation';");
    expect(source).toContain("from './features/access/statusPresentation';");

    expect(source).toContain('<StatusBadge {...serviceAgreementOfferStatusPresentation(offer.status)} />');
    expect(source).toContain('<StatusBadge {...serviceAgreementStatusPresentation(agreement.status)} />');
    expect(source).toContain('<StatusBadge {...serviceAgreementTemplateStatusPresentation(archived ?');
    expect(source).toContain('<StatusBadge {...supportStatusPresentation(inquiry.status)} />');
    expect(source).toContain("<StatusBadge {...supportStatusPresentation(inquiry.status, 'admin')} />");
    expect(source).toContain('<StatusBadge {...reviewModerationStatusPresentation(review.moderation_status)} />');
    expect(source).toContain('<StatusBadge {...homeownerContractorInviteStatusPresentation(inviteLead.homeowner_status)}');
    expect(source).toContain('<StatusBadge {...adminInviteLeadStatusPresentation(lead.admin_status)} />');
    expect(source).toContain('<StatusBadge {...contractorReferralInviteStatusPresentation(referral.status)} />');
    expect(source).toContain('<StatusBadge {...contractorReferralAdminStatusPresentation(referral.admin_status)} />');
    expect(source).toContain('<StatusBadge {...universalReferralStatusPresentation(draft.status)} />');
    expect(source).toContain('<StatusBadge {...universalReferralRewardStatusPresentation(draft.reward_status)} />');
    expect(source).toContain('<StatusBadge {...inviteStatusPresentation(invite.status)} />');
    expect(source).toContain('<StatusBadge {...referralRewardStatusPresentation(draft.reward_status)} />');
    expect(source).toContain('<StatusBadge {...homeAccessStatusPresentation(shell.membership_status)} />');
    expect(source).toContain('<StatusBadge {...contractorTeamStatusPresentation(member.status)}');
    expect(source).toContain('<StatusBadge {...contractorTeamInviteStatusPresentation(invite.status)}');

    expect(source).toContain("saveAdminReviewModeration(review, 'approved')");
    expect(source).toContain("saveAdminReviewModeration(review, 'hidden')");
    expect(source).toContain("saveAdminReviewModeration(review, 'rejected')");
    expect(source).toContain('onStatusChange={(inquiry, status) => void updateSupportInquiryStatus(inquiry, status)}');
    expect(source).toContain('saveAdminContractorReferral(referral)');
  });

  test('removes duplicated local secondary status class helpers from App', () => {
    const source = sourceFile('src/App.tsx');

    expect(source).not.toContain('function supportStatusClass');
    expect(source).not.toContain('function reviewModerationStatusClass');
    expect(source).not.toContain('const homeAccessStatusClass');
    expect(source).not.toContain('const serviceAgreementOfferStatusClass');
    expect(source).not.toContain('const homeownerServiceAgreementStatusClass');
    expect(source).not.toContain('CONTRACTOR_REFERRAL_ADMIN_STATUS_LABELS');
    expect(source).not.toContain('ADMIN_INVITE_LEAD_STATUS_LABELS');
  });

  test('preserves explicit scope exclusions for later 2D slices after calendar, finding, and reminder migration', () => {
    const source = sourceFile('src/App.tsx');

    expect(source).toContain("from './features/appointments/statusPresentation';");
    expect(source).toContain('appointmentStatusPresentation(appointment.status)');
    expect(source).toContain('visitHomeownerResponsePresentation(event.homeowner_response_status)');
    expect(source).toContain('function calendarEventTypeLabel(type: string)');
    expect(source).toContain("from './features/findings/statusPresentation';");
    expect(source).toContain('findingStatusPresentation(f.status)');
    expect(source).toContain("from './features/reminders/statusPresentation';");
    expect(source).toContain('deriveHomeReminderDueState(reminder, dateInputValue(new Date()))');
    expect(source).toContain("reminder.status === 'open' && (");
    expect(source).toContain('const contractorHomeMapDraftStatusLabel = (status: HomeMapDraftStatus)');
    expect(source).not.toContain("from './features/projects/statusPresentation'");
    expect(source).not.toContain('ReminderStateBadge');
  });

  test('keeps secondary status helpers presentation-only', () => {
    for (const path of [
      'src/features/serviceAgreements/statusPresentation.ts',
      'src/features/support/statusPresentation.ts',
      'src/features/referrals/statusPresentation.ts',
      'src/features/reviews/statusPresentation.ts',
      'src/features/access/statusPresentation.ts',
    ]) {
      const source = sourceFile(path);
      expect(source).not.toContain('supabase');
      expect(source).not.toContain('.from(');
      expect(source).not.toContain('.rpc(');
      expect(source).not.toContain('localStorage');
      expect(source).not.toContain('sessionStorage');
      expect(source).not.toContain('Date(');
      expect(source).not.toContain('formatDate');
      expect(source).not.toContain('invoiceCanMarkPaid');
      expect(source).not.toContain('invoiceCanVoid');
    }
  });
});
