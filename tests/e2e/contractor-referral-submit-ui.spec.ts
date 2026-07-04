import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = () => readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected to find source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected to find source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

test.describe('contractor-to-contractor referral submit UI source guardrails', () => {
  test('adds a compact submit card inside the contractor Invites & Referrals tab', () => {
    const source = appSource();
    const invitesSource = sourceBetween(
      source,
      "{contractorTab === 'invites' && (",
      "{contractorTab === 'connections' &&",
    );
    const cardSource = sourceBetween(
      invitesSource,
      '<Card title="Refer another contractor"',
      '<Card title="Permanent homeowner invite QR"',
    );

    expect(source).toContain("{ id: 'invites',      label: 'Invites & Referrals'");
    expect(cardSource).toContain('Know another small contractor who could use ServSync?');
    expect(cardSource).toContain('Send their details to the ServSync team for follow-up.');
    expect(cardSource).toContain('This does not connect your accounts or share any customer, job, estimate, invoice, or home information.');
    expect(cardSource).toContain('Business name');
    expect(cardSource).toContain('Email');
    expect(cardSource).toContain('Contact name');
    expect(cardSource).toContain('Phone');
    expect(cardSource).toContain('Trade/category');
    expect(cardSource).toContain('Location');
    expect(cardSource).toContain('Note');
  });

  test('gates submit controls to contractor owner, admin, or office roles and honors read-only mode', () => {
    const source = appSource();
    const helperSource = sourceBetween(
      source,
      'function userCanSubmitContractorReferralUi',
      'function getContractorDisabledReason',
    );
    const roleSource = sourceBetween(
      source,
      'const canSubmitContractorReferral = userCanSubmitContractorReferralUi',
      'const serviceAgreementRoleDeniedReason',
    );
    const cardSource = sourceBetween(
      source,
      '<Card title="Refer another contractor"',
      '<Card title="Permanent homeowner invite QR"',
    );

    expect(helperSource).toContain('contractor.owner_user_id === profileId');
    expect(helperSource).toContain("activeMember?.role === 'admin' || activeMember?.role === 'office'");
    expect(helperSource).not.toContain("activeMember?.role === 'field_tech'");
    expect(helperSource).not.toContain("activeMember?.role === 'viewer'");
    expect(roleSource).toContain('Only the contractor owner, admin, or office role can submit contractor referrals.');
    expect(roleSource).toContain('isContractorReadOnly(contractorEntitlementState.entitlements)');
    expect(cardSource).toContain('!canSubmitContractorReferral');
    expect(cardSource).toContain('contractorReferralControlsDisabled');
  });

  test('validates required fields and uses only the contractor submit RPC for writes', () => {
    const source = appSource();
    const submitSource = sourceBetween(
      source,
      'const submitContractorReferral = async () => {',
      'const updateConnectionRequest = async',
    );

    expect(submitSource).toContain('Business name is required.');
    expect(submitSource).toContain('Enter a valid email address before submitting the referral.');
    expect(submitSource).toContain("supabase.rpc('servsync_submit_contractor_referral_invite'");
    expect(submitSource).toContain('p_referrer_contractor_id: contractorDraft.id');
    expect(submitSource).toContain('p_referred_business_name: businessName');
    expect(submitSource).toContain('p_referred_email: email');
    expect(submitSource).toContain('p_referred_contact_name');
    expect(submitSource).toContain('p_referred_phone');
    expect(submitSource).toContain('p_referred_trade_category');
    expect(submitSource).toContain('p_referred_location');
    expect(submitSource).toContain('p_referrer_note');
    expect(submitSource).toContain('Referral submitted. The ServSync team can review it for follow-up.');
    expect(submitSource).toContain('We could not submit this referral. Please check the required fields and try again.');

    expect(submitSource).not.toContain('servsync_admin_referral_invites');
    expect(submitSource).not.toContain('servsync_admin_update_referral_invite');
    expect(submitSource).not.toContain(".from('servsync_referral_invites')");
    expect(submitSource).not.toContain('.insert(');
    expect(submitSource).not.toContain('.update(');
    expect(submitSource).not.toContain('.delete(');
  });

  test('does not add admin UI, listing, or unsafe promise copy in the submit card', () => {
    const source = appSource();
    const cardSource = sourceBetween(
      source,
      '<Card title="Refer another contractor"',
      '<Card title="Permanent homeowner invite QR"',
    );

    for (const forbidden of [
      /reward/i,
      /credit/i,
      /billing/i,
      /paywall/i,
      /automatic email/i,
      /email invite/i,
      /create account/i,
      /team access/i,
      /permissions/i,
      /admin status/i,
      /admin notes/i,
      /history/i,
      /guaranteed/i,
      /workflow automation/i,
    ]) {
      expect(cardSource, `Submit card should not contain ${forbidden}`).not.toMatch(forbidden);
    }

    expect(cardSource).not.toContain('servsync_admin_referral_invites');
    expect(cardSource).not.toContain('servsync_admin_update_referral_invite');
    expect(cardSource).not.toContain('servsync_referral_invites');
  });

  test('preserves existing invite and team invite flows as separate code paths', () => {
    const source = appSource();
    const invitesSource = sourceBetween(
      source,
      "{contractorTab === 'invites' && (",
      "{contractorTab === 'connections' &&",
    );

    expect(source).toContain("supabase.rpc('servsync_submit_homeowner_contractor_invite_lead'");
    expect(source).toContain("supabase.rpc('servsync_create_contractor_team_invite'");
    expect(source).toContain("supabase.rpc('servsync_accept_contractor_team_invite'");
    expect(source).toContain("supabase.rpc('servsync_revoke_contractor_team_invite'");
    expect(source).toContain(".from('contractor_invites')");
    expect(invitesSource).toContain('<Card title="Permanent homeowner invite QR"');
    expect(invitesSource).toContain('<Card title="Homeowner invite links"');
    expect(invitesSource).toContain('<Card title="Homeowner invite / referral status"');
    expect(invitesSource).toContain('Create homeowner invite link');
    expect(invitesSource).toContain('New homeowner invite link');
    expect(invitesSource).toContain('No homeowner invite links created yet.');
    expect(invitesSource).not.toContain('Create invite link');
    expect(invitesSource).not.toContain('<Card title="One-time invite links"');
    expect(invitesSource).not.toContain('<Card title="Permanent referral QR"');
  });

  test('does not introduce forbidden referral-scope integrations', () => {
    const source = appSource();
    const submitSource = sourceBetween(
      source,
      'const submitContractorReferral = async () => {',
      'const updateConnectionRequest = async',
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
      /servsync_create_contractor_team_invite/i,
      /servsync_accept_contractor_team_invite/i,
      /servsync_submit_homeowner_contractor_invite_lead/i,
      /servsync_submit_contextual_connection_request/i,
      /service_requests/i,
      /inspections/i,
      /estimates/i,
      /invoices/i,
      /notifications/i,
      /home_memberships/i,
    ]) {
      expect(submitSource, `Submit handler should not match ${forbidden}`).not.toMatch(forbidden);
    }
  });
});
