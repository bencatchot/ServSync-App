import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import sendFinalizedReportEmail from '../../api/send-finalized-report-email';
import { expectActiveTabHeading, loginAs, openSidebarTab } from './helpers/auth';
import { waitForContractorWorkspaceReady } from './helpers/customers';
import { requiredEnv } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';
import { requireValidationTarget } from './helpers/validationTarget';

const SANDBOX_REF = 'zpzdkoaubyjtsomccxya';
const PROBES_ENABLED = process.env.FINALIZED_REPORT_EMAIL_SANDBOX_PROBES === 'true';
const PDF_BYTES = new TextEncoder().encode('%PDF-1.4\nServSync finalized report validation fixture\n%%EOF');

type Role = 'owner' | 'admin' | 'office' | 'field_tech' | 'viewer' | 'disabled' | 'homeowner' | 'contractorB';

const ROLE_ENV: Record<Role, { email: string; password: string }> = {
  owner: { email: 'TEST_CONTRACTOR_EMAIL', password: 'TEST_CONTRACTOR_PASSWORD' },
  admin: { email: 'TEST_CONTRACTOR_ADMIN_EMAIL', password: 'TEST_CONTRACTOR_ADMIN_PASSWORD' },
  office: { email: 'TEST_CONTRACTOR_OFFICE_EMAIL', password: 'TEST_CONTRACTOR_OFFICE_PASSWORD' },
  field_tech: { email: 'TEST_CONTRACTOR_FIELD_TECH_EMAIL', password: 'TEST_CONTRACTOR_FIELD_TECH_PASSWORD' },
  viewer: { email: 'TEST_CONTRACTOR_VIEWER_EMAIL', password: 'TEST_CONTRACTOR_VIEWER_PASSWORD' },
  disabled: { email: 'TEST_CONTRACTOR_DISABLED_EMAIL', password: 'TEST_CONTRACTOR_DISABLED_PASSWORD' },
  homeowner: { email: 'TEST_HOMEOWNER_EMAIL', password: 'TEST_HOMEOWNER_PASSWORD' },
  contractorB: { email: 'TEST_CONTRACTOR_B_EMAIL', password: 'TEST_CONTRACTOR_B_PASSWORD' },
};

function client(key: string) {
  return createClient(requiredEnv('TEST_SUPABASE_URL'), key, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
}

async function signIn(role: Role) {
  const account = client(requiredEnv('VITE_SUPABASE_ANON_KEY'));
  const credentials = ROLE_ENV[role];
  const { data, error } = await account.auth.signInWithPassword({
    email: requiredEnv(credentials.email),
    password: requiredEnv(credentials.password),
  });
  expect(error, `${role} sign-in should succeed`).toBeNull();
  expect(data.session?.access_token).toBeTruthy();
  return account;
}

test.describe.serial('Finalized report external email delivery Sandbox probes', () => {
  test.setTimeout(120_000);
  let accounts = {} as Record<Role, SupabaseClient>;
  let operator: SupabaseClient;
  let contractorId = '';
  let contactId = '';
  let homeId = '';
  const inspectionIds: string[] = [];
  const inspectionNames: string[] = [];
  const storagePaths: string[] = [];

  test.beforeAll(async () => {
    test.skip(!PROBES_ENABLED, 'Enable only for an approved Sandbox validation operation.');
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

    const tag = `REPORT-DELIVERY-${Date.now()}`;
    const created = await accounts.owner.rpc('servsync_create_local_contact', {
      p_display_name: `${tag} Customer`,
      p_phone: '(555) 010-0391',
      p_email: `${tag.toLowerCase()}@example.test`,
      p_notes: `${tag} private fixture note`,
      p_home_nickname: `${tag} Property`,
      p_address_line1: '391 Secure Report Lane',
      p_address_line2: '',
      p_city: 'Testville',
      p_state: 'AL',
      p_zip_code: '36532',
      p_home_type: 'Single family',
      p_year_built: '2007',
      p_square_feet: '1901',
      p_home_notes: `${tag} property fixture note`,
    });
    expect(created.error).toBeNull();
    contactId = created.data.contact.id as string;
    homeId = created.data.home.id as string;

    for (let index = 0; index < 4; index += 1) {
      const inspectionId = randomUUID();
      const storagePath = `contractor-field-work/${contractorId}/${inspectionId}/${randomUUID()}.pdf`;
      const upload = await operator.storage.from('home-documents').upload(storagePath, PDF_BYTES, {
        contentType: 'application/pdf',
        upsert: false,
      });
      expect(upload.error).toBeNull();
      const inspectionName = `${tag} Finalized Report ${index + 1}`;
      const inserted = await operator.from('inspections').insert({
        id: inspectionId,
        contractor_id: contractorId,
        homeowner_user_id: null,
        local_contact_id: contactId,
        local_home_id: homeId,
        home_id: null,
        name: inspectionName,
        summary: 'Customer-facing fixture summary.',
        job_type: 'inspection',
        status: 'finalized',
        job_status: 'completed',
        completed_at: new Date().toISOString(),
        report_storage_path: storagePath,
        report_file_name: `${tag} Report ${index + 1}.pdf`,
      });
      expect(inserted.error).toBeNull();
      inspectionIds.push(inspectionId);
      inspectionNames.push(inspectionName);
      storagePaths.push(storagePath);
    }
  });

  test.afterAll(async () => {
    if (operator && inspectionIds.length > 0) await operator.from('inspections').delete().in('id', inspectionIds);
    if (operator && storagePaths.length > 0) await operator.storage.from('home-documents').remove(storagePaths);
    if (operator && contactId) await operator.from('contractor_local_contacts').delete().eq('id', contactId);
    await Promise.all(Object.values(accounts).map(account => account.auth.signOut().catch(() => undefined)));
  });

  test('allows Owner, Admin, and Office while denying lower, inactive, and cross-tenant roles', async () => {
    const recipient = requiredEnv('TEST_RECIPIENT').trim().toLowerCase();
    for (const [role, inspectionId] of [['admin', inspectionIds[1]], ['office', inspectionIds[2]]] as const) {
      const prepared = await accounts[role].rpc('servsync_prepare_finalized_report_email_delivery', {
        p_inspection_id: inspectionId,
        p_recipient_email: recipient,
        p_expires_days: 7,
      });
      expect(prepared.error, `${role} should prepare a finalized report delivery`).toBeNull();
      expect(prepared.data.token).toMatch(/^[0-9a-f]{64}$/);
      const recorded = await operator.rpc('servsync_record_finalized_report_email_delivery_result', {
        p_attempt_id: prepared.data.attempt_id,
        p_status: 'failed',
        p_provider_message_id: null,
        p_failure_code: 'provider_unavailable',
      });
      expect(recorded.error).toBeNull();
    }

    for (const role of ['field_tech', 'viewer', 'disabled', 'homeowner', 'contractorB'] as const) {
      const denied = await accounts[role].rpc('servsync_prepare_finalized_report_email_delivery', {
        p_inspection_id: inspectionIds[3],
        p_recipient_email: recipient,
        p_expires_days: 7,
      });
      expect(denied.error, `${role} should be denied`).toBeTruthy();
      expect(denied.data).toBeNull();
    }

    const anonymous = client(requiredEnv('VITE_SUPABASE_ANON_KEY'));
    const unauthenticated = await anonymous.rpc('servsync_prepare_finalized_report_email_delivery', {
      p_inspection_id: inspectionIds[3],
      p_recipient_email: recipient,
      p_expires_days: 7,
    });
    expect(unauthenticated.error).toBeTruthy();
    for (const account of [anonymous, accounts.owner, operator]) {
      const direct = await account.from('finalized_report_delivery_links').select('id').limit(1);
      expect(direct.error).toBeTruthy();
      expect(direct.data).toBeNull();
    }
  });

  test('sends one real provider message and records only sanitized history', async () => {
    const session = await accounts.owner.auth.getSession();
    const response = await sendFinalizedReportEmail.fetch(new Request('http://127.0.0.1:4173/api/send-finalized-report-email', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.data.session?.access_token}`,
        'Content-Type': 'application/json',
        Origin: 'http://127.0.0.1:4173',
      },
      body: JSON.stringify({
        inspection_id: inspectionIds[0],
        recipient_email: requiredEnv('TEST_RECIPIENT'),
        expires_days: 7,
      }),
    }));
    const body = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(body.status).toBe('sent');
    expect(JSON.stringify(body)).not.toMatch(/[0-9a-f]{64}/);

    const history = await accounts.owner.rpc('servsync_list_finalized_report_delivery_links', {
      p_inspection_id: inspectionIds[0],
    });
    expect(history.error).toBeNull();
    expect(history.data[0].email_deliveries[0]).toMatchObject({
      recipient_email: requiredEnv('TEST_RECIPIENT').trim().toLowerCase(),
      status: 'sent',
      failure_code: null,
    });
    expect(JSON.stringify(history.data)).not.toMatch(/provider_message_id|token_hash|storage_path|storage_etag|storage_version|"token"/);
  });

  test('renders the authorized contractor send/history flow without desktop or mobile overflow', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginAs(page, 'contractor');
    await openSidebarTab(page, /Jobs/i);
    await expectActiveTabHeading(page, /^Jobs$/i);
    await waitForContractorWorkspaceReady(page);
    const openReport = async () => {
      const title = page.getByRole('main').locator('p').filter({ hasText: inspectionNames[0] }).first();
      await expect(title).toHaveText(inspectionNames[0]);
      const card = title.locator('xpath=../../..');
      await expect(card).toBeVisible({ timeout: 30_000 });
      await card.getByRole('button', { name: /^View report$/i }).click();
      await expect(page.getByTestId('finalized-report-delivery-panel')).toBeVisible({ timeout: 30_000 });
      await page.getByRole('button', { name: /^Send to Customer$/i }).click();
      await expect(page.getByTestId('finalized-report-email-form')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
    };
    await openReport();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await openSidebarTab(page, /Jobs/i);
    await waitForContractorWorkspaceReady(page);
    await openReport();
  });

  test('keeps recipient access scoped to one PDF and invalidates it on revocation', async () => {
    const prepared = await accounts.owner.rpc('servsync_prepare_finalized_report_email_delivery', {
      p_inspection_id: inspectionIds[3],
      p_recipient_email: requiredEnv('TEST_RECIPIENT'),
      p_expires_days: 7,
    });
    expect(prepared.error).toBeNull();
    const sessionDigest = randomBytes(32).toString('hex');
    const bootstrap = await operator.rpc('servsync_bootstrap_finalized_report_delivery_session', {
      p_token: prepared.data.token,
      p_session_digest: sessionDigest,
      p_previous_session_digest: null,
    });
    expect(bootstrap.error).toBeNull();
    const result = JSON.parse(bootstrap.data as string) as Record<string, unknown>;
    expect(Object.keys(result).sort()).toEqual(['report', 'state']);
    expect(result.state).toBe('valid');
    expect(Object.keys(result.report as Record<string, unknown>).sort()).toEqual([
      'bucket_id', 'file_name', 'storage_etag', 'storage_object_id', 'storage_path', 'storage_size_bytes', 'storage_version',
    ]);
    expect(JSON.stringify(result)).not.toMatch(/private fixture note|property fixture note|claim_token|invitation_token|customer|homeowner_user_id/i);

    const pdf = await operator.storage.from('home-documents').download((result.report as { storage_path: string }).storage_path);
    expect(pdf.error).toBeNull();
    expect(new Uint8Array(await pdf.data!.arrayBuffer())).toEqual(PDF_BYTES);

    const revoked = await accounts.owner.rpc('servsync_revoke_finalized_report_delivery_link', {
      p_link_id: prepared.data.delivery_link_id,
    });
    expect(revoked.error).toBeNull();
    const oldSession = await operator.rpc('servsync_lookup_finalized_report_delivery_session', {
      p_session_digest: sessionDigest,
    });
    expect(oldSession.error).toBeNull();
    // Revocation deletes active recipient sessions rather than retaining a
    // distinguishable session record that could disclose prior link state.
    expect(JSON.parse(oldSession.data as string).state).toBe('unavailable');
  });
});
