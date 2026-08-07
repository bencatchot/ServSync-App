import { randomBytes } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import sendEstimateEmail from '../../api/send-local-estimate-email';
import { requiredEnv } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';
import { requireValidationTarget } from './helpers/validationTarget';

const SANDBOX_REF = 'zpzdkoaubyjtsomccxya';
const PROBES_ENABLED = process.env.SECURE_ESTIMATE_EMAIL_SANDBOX_PROBES === 'true';

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
    p_phone: '(555) 010-0390',
    p_email: `${tag.toLowerCase()}@example.test`,
    p_notes: `${tag} private fixture note`,
    p_home_nickname: `${tag} Property`,
    p_address_line1: '390 Secure Delivery Lane',
    p_address_line2: '',
    p_city: 'Testville',
    p_state: 'AL',
    p_zip_code: '36532',
    p_home_type: 'Single family',
    p_year_built: '2006',
    p_square_feet: '1900',
    p_home_notes: `${tag} property fixture note`,
  });
}

test.describe.serial('Secure Estimate email delivery Sandbox probes', () => {
  test.setTimeout(90_000);
  let accounts = {} as Record<Role, SupabaseClient>;
  let operator: SupabaseClient;
  let contractorId = '';
  let contactId = '';
  let homeId = '';
  const estimateIds: string[] = [];

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

    const tag = `SEED-${Date.now()}`;
    const created = await fixtureCustomer(accounts.owner, tag);
    expect(created.error).toBeNull();
    contactId = created.data.contact.id as string;
    homeId = created.data.home.id as string;

    for (let index = 0; index < 4; index += 1) {
      const inserted = await operator.from('estimates').insert({
        contractor_id: contractorId,
        homeowner_user_id: null,
        local_contact_id: contactId,
        local_home_id: homeId,
        home_id: null,
        title: `${tag} Estimate ${index + 1}`,
        scope: 'Allowlisted customer scope.',
        notes: 'Customer-facing Estimate note.',
        terms: 'Estimate valid for 30 days.',
        status: 'draft',
        subtotal_cents: 125_00 + index,
        total_cents: 125_00 + index,
      }).select('id').single();
      expect(inserted.error).toBeNull();
      estimateIds.push(inserted.data.id as string);
      const line = await operator.from('estimate_line_items').insert({
        estimate_id: inserted.data.id,
        line_type: 'labor',
        description: 'Water heater replacement',
        line_title: 'Water heater replacement',
        customer_description: 'Remove and replace water heater.',
        quantity: 1,
        unit: 'job',
        unit_price_cents: 125_00 + index,
        sort_order: 0,
      });
      expect(line.error).toBeNull();
    }
  });

  test.afterAll(async () => {
    if (operator && estimateIds.length > 0) {
      await operator.from('estimate_line_items').delete().in('estimate_id', estimateIds);
      await operator.from('estimates').delete().in('id', estimateIds);
    }
    if (operator && contactId) await operator.from('contractor_local_contacts').delete().eq('id', contactId);
    await Promise.all(Object.values(accounts).map(account => account.auth.signOut().catch(() => undefined)));
  });

  test('allows Admin and Office preparation while denying lower roles and cross-tenant callers', async () => {
    const recipient = requiredEnv('TEST_RECIPIENT').trim().toLowerCase();
    for (const [role, estimateId] of [['admin', estimateIds[1]], ['office', estimateIds[2]]] as const) {
      const prepared = await accounts[role].rpc('servsync_prepare_local_estimate_email_delivery', {
        p_estimate_id: estimateId,
        p_recipient_email: recipient,
        p_expires_days: 7,
      });
      expect(prepared.error, `${role} should prepare an email delivery`).toBeNull();
      expect(prepared.data.token).toMatch(/^[0-9a-f]{64}$/);
      const recorded = await operator.rpc('servsync_record_local_estimate_email_delivery_result', {
        p_attempt_id: prepared.data.attempt_id,
        p_status: 'failed',
        p_provider_message_id: null,
        p_failure_code: 'provider_unavailable',
      });
      expect(recorded.error).toBeNull();
    }

    for (const role of ['field_tech', 'viewer', 'contractorB'] as const) {
      const denied = await accounts[role].rpc('servsync_prepare_local_estimate_email_delivery', {
        p_estimate_id: estimateIds[3],
        p_recipient_email: recipient,
        p_expires_days: 7,
      });
      expect(denied.error, `${role} should be denied`).toBeTruthy();
      expect(denied.data).toBeNull();
    }
  });

  test('sends one real provider message and records only sanitized history', async () => {
    const session = await accounts.owner.auth.getSession();
    const request = new Request('http://127.0.0.1:4173/api/send-local-estimate-email', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.data.session?.access_token}`,
        'Content-Type': 'application/json',
        Origin: 'http://127.0.0.1:4173',
      },
      body: JSON.stringify({
        estimate_id: estimateIds[0],
        recipient_email: requiredEnv('TEST_RECIPIENT'),
        expires_days: 7,
      }),
    });
    const response = await sendEstimateEmail.fetch(request);
    const body = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(body.status).toBe('sent');
    expect(JSON.stringify(body)).not.toMatch(/[0-9a-f]{64}/);

    const history = await accounts.owner.rpc('servsync_list_local_estimate_delivery_links', {
      p_estimate_id: estimateIds[0],
    });
    expect(history.error).toBeNull();
    expect(history.data[0].email_deliveries[0]).toMatchObject({
      recipient_email: requiredEnv('TEST_RECIPIENT').trim().toLowerCase(),
      status: 'sent',
      failure_code: null,
    });
    expect(JSON.stringify(history.data)).not.toMatch(/provider_message_id|token_hash|\"token\"/);
  });

  test('keeps recipient access document-scoped and invalidates prior access on rotation', async () => {
    const prepared = await accounts.owner.rpc('servsync_prepare_local_estimate_email_delivery', {
      p_estimate_id: estimateIds[3],
      p_recipient_email: requiredEnv('TEST_RECIPIENT'),
      p_expires_days: 7,
    });
    expect(prepared.error).toBeNull();
    const sessionDigest = randomBytes(32).toString('hex');
    const bootstrap = await operator.rpc('servsync_bootstrap_local_estimate_delivery_session', {
      p_token: prepared.data.token,
      p_session_digest: sessionDigest,
      p_previous_session_digest: null,
    });
    expect(bootstrap.error).toBeNull();
    const result = JSON.parse(bootstrap.data as string) as Record<string, unknown>;
    expect(Object.keys(result).sort()).toEqual(['estimate', 'state']);
    expect(result.state).toBe('valid');
    const estimate = result.estimate as Record<string, unknown>;
    expect(estimate).not.toHaveProperty('contractor_id');
    expect(estimate).not.toHaveProperty('local_contact_id');
    expect(estimate).not.toHaveProperty('local_home_id');
    expect(JSON.stringify(result)).not.toMatch(/private fixture note|property fixture note|claim_token|invitation_token|homeowner_user_id/i);

    const rotated = await accounts.owner.rpc('servsync_rotate_local_estimate_delivery_link', {
      p_link_id: prepared.data.delivery_link_id,
      p_expires_days: 7,
    });
    expect(rotated.error).toBeNull();

    const replaced = await operator.rpc('servsync_bootstrap_local_estimate_delivery_session', {
      p_token: prepared.data.token,
      p_session_digest: randomBytes(32).toString('hex'),
      p_previous_session_digest: null,
    });
    expect(replaced.error).toBeNull();
    expect(JSON.parse(replaced.data as string).state).toBe('replaced');

    const oldSession = await operator.rpc('servsync_lookup_local_estimate_delivery_session', {
      p_session_digest: sessionDigest,
    });
    expect(oldSession.error).toBeNull();
    expect(JSON.parse(oldSession.data as string).state).not.toBe('valid');
  });
});
