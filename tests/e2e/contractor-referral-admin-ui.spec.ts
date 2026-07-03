import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = () => readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const typeSource = () => readFileSync(resolve(process.cwd(), 'src/types.ts'), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('contractor-to-contractor referral admin UI source guardrails', () => {
  test('adds a distinct contractor referral tracking section inside the platform admin Referrals tab', () => {
    const source = appSource();
    const adminSource = sourceBetween(source, 'function PlatformAdminDashboard', 'function PermissionPicker');
    const referralsTabSource = sourceBetween(
      adminSource,
      "{adminTab === 'referrals' && (",
      "{adminTab === 'reviews' &&",
    );
    const contractorReferralCard = sourceBetween(
      referralsTabSource,
      '<Card title="Contractor-to-Contractor Referrals"',
      '<Card title="Universal referrals"',
    );

    expect(adminSource).toContain("{ id: 'referrals',    label: 'Referrals'");
    expect(contractorReferralCard).toContain('Manual admin tracking only.');
    expect(contractorReferralCard).toContain('ServSync does not send outreach, create accounts, create contractor profiles, create permissions, or award rewards from this view.');
    expect(contractorReferralCard).toContain('contractor_refers_contractor');
    expect(contractorReferralCard).toContain('Referred business');
    expect(contractorReferralCard).toContain('Referring contractor');
    expect(contractorReferralCard).toContain('Admin status');
    expect(contractorReferralCard).toContain('Last outreach');
    expect(contractorReferralCard).toContain('Next follow-up');
  });

  test('uses only the approved admin referral RPCs for list and update behavior', () => {
    const source = appSource();
    const adminSource = sourceBetween(source, 'function PlatformAdminDashboard', 'function PermissionPicker');
    const loadAdminSource = sourceBetween(adminSource, 'const loadAdmin = async () => {', 'useEffect(() => {');
    const saveSource = sourceBetween(
      adminSource,
      'const saveAdminContractorReferral = async',
      'const saveAdminReviewModeration = async',
    );

    expect(loadAdminSource).toContain("supabase.rpc('servsync_admin_referral_invites')");
    expect(saveSource).toContain("supabase.rpc('servsync_admin_update_referral_invite'");
    expect(saveSource).toContain('p_referral_id: referral.referral_id');
    expect(saveSource).toContain('p_admin_status: draft.admin_status');
    expect(saveSource).toContain('p_admin_notes: cleanHumanWrittenText(draft.admin_notes)');
    expect(saveSource).toContain('p_outreach_attempt_count: outreachCount');
    expect(saveSource).toContain('p_last_outreach_at');
    expect(saveSource).toContain('p_next_follow_up_at');
    expect(saveSource).toContain('Referral tracking updated.');
    expect(saveSource).toContain('We could not update this referral. Please try again.');

    expect(adminSource).not.toContain(".from('servsync_referral_invites')");
    expect(adminSource).not.toContain('p_matched_contractor_id');
    expect(adminSource).not.toContain('p_matched_user_id');
  });

  test('keeps admin referral tracking out of homeowner and contractor dashboards', () => {
    const source = appSource();
    const homeownerSource = sourceBetween(source, 'function HomeownerDashboard', 'function ContractorDashboard');
    const contractorSource = sourceBetween(source, 'function ContractorDashboard', 'function PlatformAdminDashboard');

    for (const dashboardSource of [homeownerSource, contractorSource]) {
      expect(dashboardSource).not.toContain('Contractor-to-Contractor Referrals');
      expect(dashboardSource).not.toContain('servsync_admin_referral_invites');
      expect(dashboardSource).not.toContain('servsync_admin_update_referral_invite');
      expect(dashboardSource).not.toContain('Referral tracking updated.');
    }

    expect(contractorSource).toContain('Refer another contractor');
    expect(contractorSource).toContain("supabase.rpc('servsync_submit_contractor_referral_invite'");
  });

  test('defines explicit admin referral row and draft types without broad table access', () => {
    const source = appSource();
    const types = typeSource();

    expect(types).toContain("export type ContractorReferralInviteAdminStatus = 'new' | 'reviewing' | 'contacted' | 'followed_up' | 'joined' | 'duplicate' | 'bad_contact_info' | 'declined' | 'no_response' | 'archived';");
    expect(types).toContain('export interface AdminContractorReferralInvite');
    expect(types).toContain("referral_type: 'contractor_refers_contractor';");
    expect(source).toContain('type AdminContractorReferralInviteDraft =');
    expect(source).toContain('CONTRACTOR_REFERRAL_ADMIN_STATUS_OPTIONS');
    expect(source).toContain('contractorReferralInviteDraftFromReferral');
    expect(source).not.toContain("from('servsync_referral_invites')");
  });

  test('does not add forbidden outreach, reward, account, permission, or automation behavior', () => {
    const source = appSource();
    const adminSource = sourceBetween(source, 'function PlatformAdminDashboard', 'function PermissionPicker');
    const contractorReferralCard = sourceBetween(
      adminSource,
      '<Card title="Contractor-to-Contractor Referrals"',
      '<Card title="Universal referrals"',
    );
    const saveSource = sourceBetween(
      adminSource,
      'const saveAdminContractorReferral = async',
      'const saveAdminReviewModeration = async',
    );

    for (const forbidden of [
      /send-notification-email/i,
      /send-home-access-invite-email/i,
      /stripe/i,
      /quickbooks/i,
      /autopay/i,
      /reward_amount/i,
      /reward_status/i,
      /subscription/i,
      /paywall/i,
      /create account/i,
      /create contractor profile/i,
      /team access/i,
      /automatic matching/i,
      /guaranteed follow-up/i,
      /workflow automation/i,
      /servsync_create_contractor_team_invite/i,
      /servsync_submit_homeowner_contractor_invite_lead/i,
      /insert\(/i,
      /update\(/i,
      /delete\(/i,
    ]) {
      expect(saveSource, `Save handler should not match ${forbidden}`).not.toMatch(forbidden);
    }

    expect(contractorReferralCard).not.toContain('Reward amount');
    expect(contractorReferralCard).not.toContain('Reward status');
    expect(contractorReferralCard).not.toContain('Public referral link');
    expect(contractorReferralCard).not.toContain('Send email');
    expect(contractorReferralCard).not.toContain('Send SMS');
    expect(contractorReferralCard).not.toContain('Create account');
    expect(contractorReferralCard).not.toContain('Create profile');
    expect(contractorReferralCard).not.toContain('Grant access');
  });

  test('preserves existing invite, reward referral, team invite, Home Access, and review moderation flows as separate paths', () => {
    const source = appSource();

    expect(source).toContain("supabase.rpc('servsync_submit_homeowner_contractor_invite_lead'");
    expect(source).toContain("supabase.rpc('servsync_submit_contractor_referral_invite'");
    expect(source).toContain("supabase.rpc('servsync_admin_referrals'");
    expect(source).toContain("supabase.rpc('servsync_create_contractor_team_invite'");
    expect(source).toContain("supabase.rpc('servsync_create_home_membership_email_invite'");
    expect(source).toContain("supabase.rpc('servsync_admin_review_moderation_queue'");
    expect(source).toContain('<Card title="Universal referrals"');
    expect(source).toContain('<Card title="Contractor invite reward tracking"');
    expect(source).toContain('<Card title="Review moderation"');
  });
});
