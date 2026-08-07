import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requiredEnv } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';
import { requireValidationTarget } from './helpers/validationTarget';

const SANDBOX_REF = 'zpzdkoaubyjtsomccxya';
const PROBES_ENABLED = process.env.SECURE_GUEST_ESTIMATE_ACCEPTANCE_SANDBOX_PROBES === 'true';

type Role = 'owner' | 'admin' | 'office' | 'field_tech' | 'viewer' | 'contractorB';

const ROLE_ENV: Record<Role, { email: string; password: string }> = {
  owner: { email: 'TEST_CONTRACTOR_EMAIL', password: 'TEST_CONTRACTOR_PASSWORD' },
  admin: { email: 'TEST_CONTRACTOR_ADMIN_EMAIL', password: 'TEST_CONTRACTOR_ADMIN_PASSWORD' },
  office: { email: 'TEST_CONTRACTOR_OFFICE_EMAIL', password: 'TEST_CONTRACTOR_OFFICE_PASSWORD' },
  field_tech: { email: 'TEST_CONTRACTOR_FIELD_TECH_EMAIL', password: 'TEST_CONTRACTOR_FIELD_TECH_PASSWORD' },
  viewer: { email: 'TEST_CONTRACTOR_VIEWER_EMAIL', password: 'TEST_CONTRACTOR_VIEWER_PASSWORD' },
  contractorB: { email: 'TEST_CONTRACTOR_B_EMAIL', password: 'TEST_CONTRACTOR_B_PASSWORD' },
};

function client(key: string) {
  return createClient(requiredEnv('TEST_SUPABASE_URL'), key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function signIn(role: Role) {
  const account = client(requiredEnv('VITE_SUPABASE_ANON_KEY'));
  const env = ROLE_ENV[role];
  const { data, error } = await account.auth.signInWithPassword({
    email: requiredEnv(env.email),
    password: requiredEnv(env.password),
  });
  expect(error, `${role} sign-in should succeed`).toBeNull();
  expect(data.session?.access_token).toBeTruthy();
  return account;
}

function fixtureCustomer(account: SupabaseClient, tag: string) {
  return account.rpc('servsync_create_local_contact', {
    p_display_name: `${tag} Customer`,
    p_phone: '(555) 010-0393',
    p_email: `${tag.toLowerCase()}@example.test`,
    p_notes: `${tag} private fixture note`,
    p_home_nickname: `${tag} Property`,
    p_address_line1: '393 Exact Snapshot Lane',
    p_address_line2: '',
    p_city: 'Testville',
    p_state: 'AL',
    p_zip_code: '36532',
    p_home_type: 'Single family',
    p_year_built: '2007',
    p_square_feet: '1900',
    p_home_notes: `${tag} property fixture note`,
  });
}

async function createEstimate(operator: SupabaseClient, contractorId: string, contactId: string, homeId: string, tag: string) {
  const inserted = await operator.from('estimates').insert({
    contractor_id: contractorId,
    homeowner_user_id: null,
    local_contact_id: contactId,
    local_home_id: homeId,
    home_id: null,
    title: `${tag} Estimate`,
    scope: 'Replace the exact fixture equipment.',
    notes: 'Customer-facing fixture note.',
    terms: 'Estimate valid for 30 days.',
    status: 'draft',
    subtotal_cents: 129_00,
    total_cents: 129_00,
  }).select('id').single();
  expect(inserted.error).toBeNull();
  const estimateId = inserted.data.id as string;
  const line = await operator.from('estimate_line_items').insert({
    estimate_id: estimateId,
    line_type: 'labor',
    description: `${tag} exact delivered line`,
    line_title: 'Fixture installation',
    customer_description: 'Install the approved fixture equipment.',
    quantity: 1,
    unit: 'job',
    unit_price_cents: 129_00,
    sort_order: 0,
  }).select('id').single();
  expect(line.error).toBeNull();
  return { estimateId, lineId: line.data.id as string };
}

async function prepareDelivery(owner: SupabaseClient, operator: SupabaseClient, estimateId: string) {
  const recipientEmail = requiredEnv('TEST_RECIPIENT').trim().toLowerCase();
  const prepared = await owner.rpc('servsync_prepare_local_estimate_email_delivery', {
    p_estimate_id: estimateId,
    p_recipient_email: recipientEmail,
    p_expires_days: 7,
  });
  expect(prepared.error).toBeNull();
  expect(prepared.data.token).toMatch(/^[0-9a-f]{64}$/);
  const recorded = await operator.rpc('servsync_record_local_estimate_email_delivery_result', {
    p_attempt_id: prepared.data.attempt_id,
    p_status: 'sent',
    p_provider_message_id: `sandbox-acceptance-${randomBytes(8).toString('hex')}`,
    p_failure_code: null,
  });
  expect(recorded.error).toBeNull();
  const sessionDigest = randomBytes(32).toString('hex');
  const bootstrap = await operator.rpc('servsync_bootstrap_local_estimate_delivery_session', {
    p_token: prepared.data.token,
    p_session_digest: sessionDigest,
    p_previous_session_digest: null,
  });
  expect(bootstrap.error).toBeNull();
  expect(JSON.parse(bootstrap.data as string).state).toBe('valid');
  return { ...prepared.data, recipientEmail, sessionDigest } as {
    delivery_link_id: string;
    token: string;
    recipientEmail: string;
    sessionDigest: string;
  };
}

test.describe.serial('Secure guest Estimate acceptance Sandbox probes', () => {
  test.setTimeout(120_000);
  let accounts = {} as Record<Role, SupabaseClient>;
  let operator: SupabaseClient;
  let contractorId = '';
  let contactId = '';
  let homeId = '';
  const estimateIds: string[] = [];
  const jobIds: string[] = [];
  const lines = new Map<string, string>();

  test.beforeAll(async () => {
    test.skip(!PROBES_ENABLED, 'Enable only for the approved Sandbox validation operation.');
    requireApprovedSandboxForMutation();
    const target = requireValidationTarget({ requireSupabaseEnv: true });
    expect(target.configuredProjectRef).toBe(SANDBOX_REF);
    expect(requiredEnv('TEST_SUPABASE_URL')).toContain(SANDBOX_REF);
    operator = client(requiredEnv('SUPABASE_SERVICE_ROLE_KEY'));
    accounts = Object.fromEntries(await Promise.all(
      (Object.keys(ROLE_ENV) as Role[]).map(async role => [role, await signIn(role)] as const),
    )) as Record<Role, SupabaseClient>;

    const current = await accounts.owner.rpc('servsync_current_contractor_profile');
    expect(current.error).toBeNull();
    contractorId = (Array.isArray(current.data) ? current.data[0]?.id : current.data?.id) as string;
    expect(contractorId).toBeTruthy();

    const tag = `SGEA-${Date.now()}`;
    const created = await fixtureCustomer(accounts.owner, tag);
    expect(created.error).toBeNull();
    contactId = created.data.contact.id as string;
    homeId = created.data.home.id as string;
    for (let index = 0; index < 5; index += 1) {
      const fixture = await createEstimate(operator, contractorId, contactId, homeId, `${tag}-${index + 1}`);
      estimateIds.push(fixture.estimateId);
      lines.set(fixture.estimateId, fixture.lineId);
    }
  });

  test.afterAll(async () => {
    if (operator && jobIds.length > 0) {
      const deletedJobs = await operator.from('inspections').delete().in('id', jobIds);
      expect(deletedJobs.error).toBeNull();
    }
    if (operator && estimateIds.length > 0) {
      const deletedEvents = await operator.from('workflow_activity_events').delete().in('estimate_id', estimateIds);
      expect(deletedEvents.error).toBeNull();
      const deletedEstimates = await operator.from('estimates').delete().in('id', estimateIds);
      expect(deletedEstimates.error).toBeNull();
    }
    if (operator && contactId) {
      const deletedContact = await operator.from('contractor_local_contacts').delete().eq('id', contactId);
      expect(deletedContact.error).toBeNull();
    }
    await Promise.all(Object.values(accounts).map(account => account.auth.signOut().catch(() => undefined)));
  });

  test('accepts one exact snapshot once and preserves the canonical accepted-to-Job path', async () => {
    const delivery = await prepareDelivery(accounts.owner, operator, estimateIds[0]);
    const attempts = await Promise.all([
      operator.rpc('servsync_accept_local_estimate_delivery_session', { p_session_digest: delivery.sessionDigest }),
      operator.rpc('servsync_accept_local_estimate_delivery_session', { p_session_digest: delivery.sessionDigest }),
    ]);
    for (const attempt of attempts) {
      expect(attempt.error).toBeNull();
      expect(JSON.parse(attempt.data as string).state).toBe('accepted');
    }

    const estimate = await operator.from('estimates').select('status').eq('id', estimateIds[0]).single();
    expect(estimate.error).toBeNull();
    expect(estimate.data.status).toBe('accepted');
    const lookup = await operator.rpc('servsync_lookup_local_estimate_delivery_acceptance', {
      p_session_digest: delivery.sessionDigest,
    });
    expect(lookup.error).toBeNull();
    expect(JSON.parse(lookup.data as string).state).toBe('accepted');

    const history = await accounts.owner.rpc('servsync_list_local_estimate_delivery_links', { p_estimate_id: estimateIds[0] });
    expect(history.error).toBeNull();
    expect(history.data[0].acceptance).toMatchObject({
      state: 'accepted',
      channel: 'secure_guest',
      recipient_email: delivery.recipientEmail,
    });
    expect(JSON.stringify(history.data)).not.toMatch(/snapshot_hash|token_hash|provider_message_id|session_hash/i);

    const job = await accounts.owner.rpc('servsync_create_job_from_estimate', { p_estimate_id: estimateIds[0] });
    expect(job.error).toBeNull();
    const jobId = job.data.job_id as string;
    expect(jobId).toBeTruthy();
    jobIds.push(jobId);
  });

  test('rejects a stale delivered snapshot without changing Estimate status', async () => {
    const delivery = await prepareDelivery(accounts.owner, operator, estimateIds[1]);
    const changed = await operator.from('estimate_line_items')
      .update({ customer_description: 'Changed after the delivered snapshot.' })
      .eq('id', lines.get(estimateIds[1])!);
    expect(changed.error).toBeNull();

    const result = await operator.rpc('servsync_accept_local_estimate_delivery_session', {
      p_session_digest: delivery.sessionDigest,
    });
    expect(result.error).toBeNull();
    expect(JSON.parse(result.data as string).state).toBe('stale');
    const estimate = await operator.from('estimates').select('status').eq('id', estimateIds[1]).single();
    expect(estimate.data.status).toBe('sent');
    const history = await accounts.owner.rpc('servsync_list_local_estimate_delivery_links', { p_estimate_id: estimateIds[1] });
    expect(history.error).toBeNull();
    expect(history.data[0].acceptance).toEqual({ state: 'not_accepted' });
  });

  test('fails closed after rotation or revocation and denies direct authenticated invocation', async () => {
    const rotatedDelivery = await prepareDelivery(accounts.owner, operator, estimateIds[2]);
    const rotated = await accounts.owner.rpc('servsync_rotate_local_estimate_delivery_link', {
      p_link_id: rotatedDelivery.delivery_link_id,
      p_expires_days: 7,
    });
    expect(rotated.error).toBeNull();
    const oldResult = await operator.rpc('servsync_accept_local_estimate_delivery_session', {
      p_session_digest: rotatedDelivery.sessionDigest,
    });
    expect(oldResult.error).toBeNull();
    expect(JSON.parse(oldResult.data as string).state).toBe('unavailable');

    const revokedDelivery = await prepareDelivery(accounts.owner, operator, estimateIds[3]);
    const revoked = await accounts.owner.rpc('servsync_revoke_local_estimate_delivery_link', {
      p_link_id: revokedDelivery.delivery_link_id,
    });
    expect(revoked.error).toBeNull();
    const revokedResult = await operator.rpc('servsync_accept_local_estimate_delivery_session', {
      p_session_digest: revokedDelivery.sessionDigest,
    });
    expect(JSON.parse(revokedResult.data as string).state).toBe('unavailable');

    for (const role of Object.keys(accounts) as Role[]) {
      const denied = await accounts[role].rpc('servsync_accept_local_estimate_delivery_session', {
        p_session_digest: revokedDelivery.sessionDigest,
      });
      expect(denied.error, `${role} must not directly execute guest acceptance`).toBeTruthy();
      expect(denied.data).toBeNull();
    }
  });

  test('serializes acceptance racing link rotation into one coherent outcome', async () => {
    const delivery = await prepareDelivery(accounts.owner, operator, estimateIds[4]);
    const [accepted, rotated] = await Promise.all([
      operator.rpc('servsync_accept_local_estimate_delivery_session', { p_session_digest: delivery.sessionDigest }),
      accounts.owner.rpc('servsync_rotate_local_estimate_delivery_link', {
        p_link_id: delivery.delivery_link_id,
        p_expires_days: 7,
      }),
    ]);

    expect(accepted.error).toBeNull();
    const acceptedState = JSON.parse(accepted.data as string).state as string;
    const estimate = await operator.from('estimates').select('status').eq('id', estimateIds[4]).single();
    expect(estimate.error).toBeNull();

    if (acceptedState === 'accepted') {
      expect(estimate.data.status).toBe('accepted');
      expect(rotated.error).toBeTruthy();
    } else {
      expect(acceptedState).toBe('unavailable');
      expect(rotated.error).toBeNull();
      expect(estimate.data.status).toBe('sent');
    }
  });
});
