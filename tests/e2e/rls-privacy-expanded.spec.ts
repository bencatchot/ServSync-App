import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { credentialsFor, requiredEnv } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';

type CredentialKey = Parameters<typeof credentialsFor>[0];
type AuthenticatedClient = {
  client: SupabaseClient;
  userId: string;
};
type QueryBuilder = any;
type TableRow = Record<string, any>;

function requireSandboxSupabaseConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');

  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run expanded RLS privacy tests against the production Supabase project.');
  }

  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`Expanded RLS privacy tests require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
  }

  return { url, anonKey };
}

async function signInAs(key: CredentialKey): Promise<AuthenticatedClient> {
  const { url, anonKey } = requireSandboxSupabaseConfig();
  const credentials = credentialsFor(key);
  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await client.auth.signInWithPassword(credentials);
  expect(error, `${key} login should succeed`).toBeNull();
  expect(data.user?.id, `${key} auth user should be present`).toBeTruthy();

  return { client, userId: data.user!.id };
}

async function signInOptional(emailName: string, passwordName: string): Promise<AuthenticatedClient | null> {
  const email = process.env[emailName]?.trim();
  const password = process.env[passwordName]?.trim();
  if (!email || !password) return null;

  const { url, anonKey } = requireSandboxSupabaseConfig();
  const client = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  expect(error, `${emailName} login should succeed when optional credentials are configured`).toBeNull();
  expect(data.user?.id, `${emailName} auth user should be present`).toBeTruthy();

  return { client, userId: data.user!.id };
}

async function signOutAll(accounts: Array<AuthenticatedClient | null>) {
  await Promise.all(accounts.filter(Boolean).map(account => account!.client.auth.signOut().catch(() => undefined)));
}

async function countRows(
  client: SupabaseClient,
  table: string,
  apply: (query: QueryBuilder) => QueryBuilder = query => query,
): Promise<number> {
  const query = apply(client.from(table).select('id', { count: 'exact', head: true }));
  const { count, error } = await query;
  expect(error, `${table} count query should not error`).toBeNull();
  return count ?? 0;
}

async function maybeFirst(
  client: SupabaseClient,
  table: string,
  columns = '*',
  apply: (query: QueryBuilder) => QueryBuilder = query => query,
): Promise<TableRow | null> {
  const query = apply(client.from(table).select(columns).limit(1));
  const { data, error } = await query.maybeSingle();
  expect(error, `${table} fixture query should not error`).toBeNull();
  return (data as TableRow | null) ?? null;
}

async function expectVisibleById(client: SupabaseClient, table: string, id: string, label: string) {
  await expect(countRows(client, table, query => query.eq('id', id)), label).resolves.toBe(1);
}

async function expectHiddenById(client: SupabaseClient, table: string, id: string, label: string) {
  await expect(countRows(client, table, query => query.eq('id', id)), label).resolves.toBe(0);
}

async function contractorProfileId(account: AuthenticatedClient, label: string): Promise<string> {
  const own = await maybeFirst(
    account.client,
    'contractor_profiles',
    'id,owner_user_id,business_name',
    query => query.eq('owner_user_id', account.userId),
  );
  if (own?.id) return own.id as string;

  const { data, error } = await account.client.rpc('servsync_current_contractor_profile');
  expect(error, `${label} current contractor profile RPC should not error`).toBeNull();
  const profile = Array.isArray(data) ? data[0] : data;
  expect(profile?.id, `${label} contractor profile should exist in sandbox`).toBeTruthy();
  return profile.id as string;
}

async function latestLineForParent(client: SupabaseClient, table: string, foreignKey: string, parentId: string) {
  return maybeFirst(client, table, 'id', query => query.eq(foreignKey, parentId).order('created_at', { ascending: true }));
}

async function expectRpcDenied(client: SupabaseClient, fn: string, args: Record<string, unknown>, label: string) {
  const { data, error } = await client.rpc(fn, args);
  expect(error, `${label} should be denied`).toBeTruthy();
  expect(data, `${label} should not return success data`).toBeFalsy();
}

async function canCreateSignedUrl(client: SupabaseClient, bucket: string, storagePath: string) {
  const { data, error } = await client.storage.from(bucket).createSignedUrl(storagePath, 60);
  return Boolean(data?.signedUrl && !error);
}

test.describe('expanded sandbox RLS and cross-user privacy boundaries', () => {
  let homeownerA: AuthenticatedClient;
  let homeownerB: AuthenticatedClient;
  let contractorA: AuthenticatedClient;
  let contractorB: AuthenticatedClient;
  let optionalViewer: AuthenticatedClient | null;
  let optionalAdmin: AuthenticatedClient | null;

  test.beforeAll(async () => {
    requireApprovedSandboxForMutation();
    requireSandboxSupabaseConfig();

    homeownerA = await signInAs('homeowner');
    homeownerB = await signInAs('homeownerB');
    contractorA = await signInAs('contractor');
    contractorB = await signInAs('contractorB');
    optionalViewer = await signInOptional('TEST_CONTRACTOR_VIEWER_EMAIL', 'TEST_CONTRACTOR_VIEWER_PASSWORD');
    optionalAdmin = await signInOptional('TEST_ADMIN_EMAIL', 'TEST_ADMIN_PASSWORD');
  });

  test.afterAll(async () => {
    await signOutAll([homeownerA, homeownerB, contractorA, contractorB, optionalViewer, optionalAdmin]);
  });

  test('financial records isolate estimates, estimate lines, invoices, and invoice lines', async () => {
    const contractorAId = await contractorProfileId(contractorA, 'Contractor A');

    const estimate = await maybeFirst(
      contractorA.client,
      'estimates',
      'id,status,homeowner_user_id,contractor_id',
      query => query.eq('contractor_id', contractorAId).order('updated_at', { ascending: false }),
    );
    test.skip(!estimate, 'Sandbox needs at least one Contractor A estimate fixture for expanded RLS coverage.');

      await expectVisibleById(contractorA.client, 'estimates', estimate!.id, 'Contractor A should see own estimate');
      await expectHiddenById(contractorB.client, 'estimates', estimate!.id, 'Contractor B should not see Contractor A estimate');
      await expectHiddenById(homeownerB.client, 'estimates', estimate!.id, 'Homeowner B should not see Homeowner A/Contractor A estimate');

      const estimateLine = await latestLineForParent(contractorA.client, 'estimate_line_items', 'estimate_id', estimate!.id);
      if (estimateLine?.id) {
        await expectVisibleById(contractorA.client, 'estimate_line_items', estimateLine.id, 'Contractor A should see own estimate line');
        await expectHiddenById(contractorB.client, 'estimate_line_items', estimateLine.id, 'Contractor B should not see Contractor A estimate line');
        await expectHiddenById(homeownerB.client, 'estimate_line_items', estimateLine.id, 'Homeowner B should not see unrelated estimate line');
      }

      const homeownerVisibleEstimate = await maybeFirst(
        homeownerA.client,
        'estimates',
        'id,status,homeowner_user_id',
        query => query.eq('homeowner_user_id', homeownerA.userId).neq('status', 'draft').order('updated_at', { ascending: false }),
      );
      if (homeownerVisibleEstimate?.id) {
        await expectVisibleById(homeownerA.client, 'estimates', homeownerVisibleEstimate.id, 'Homeowner A should see own non-draft estimate');
        await expectHiddenById(homeownerB.client, 'estimates', homeownerVisibleEstimate.id, 'Homeowner B should not see Homeowner A estimate');
      }

      const draftEstimate = await maybeFirst(
        contractorA.client,
        'estimates',
        'id,status,homeowner_user_id',
        query => query.eq('contractor_id', contractorAId).eq('status', 'draft').not('homeowner_user_id', 'is', null),
      );
      if (draftEstimate?.id && draftEstimate.homeowner_user_id === homeownerA.userId) {
        await expectHiddenById(homeownerA.client, 'estimates', draftEstimate.id, 'Homeowner A should not see draft contractor estimate');
      }

      const invoice = await maybeFirst(
        contractorA.client,
        'invoices',
        'id,status,homeowner_user_id,contractor_id',
        query => query.eq('contractor_id', contractorAId).order('updated_at', { ascending: false }),
      );
      test.skip(!invoice, 'Sandbox needs at least one Contractor A invoice fixture for expanded RLS coverage.');

      await expectVisibleById(contractorA.client, 'invoices', invoice!.id, 'Contractor A should see own invoice');
      await expectHiddenById(contractorB.client, 'invoices', invoice!.id, 'Contractor B should not see Contractor A invoice');
      await expectHiddenById(homeownerB.client, 'invoices', invoice!.id, 'Homeowner B should not see unrelated invoice');

      const invoiceLine = await latestLineForParent(contractorA.client, 'invoice_line_items', 'invoice_id', invoice!.id);
      if (invoiceLine?.id) {
        await expectVisibleById(contractorA.client, 'invoice_line_items', invoiceLine.id, 'Contractor A should see own invoice line');
        await expectHiddenById(contractorB.client, 'invoice_line_items', invoiceLine.id, 'Contractor B should not see Contractor A invoice line');
        await expectHiddenById(homeownerB.client, 'invoice_line_items', invoiceLine.id, 'Homeowner B should not see unrelated invoice line');
      }

      const homeownerVisibleInvoice = await maybeFirst(
        homeownerA.client,
        'invoices',
        'id,status,homeowner_user_id',
        query => query.eq('homeowner_user_id', homeownerA.userId).neq('status', 'draft').order('updated_at', { ascending: false }),
      );
      if (homeownerVisibleInvoice?.id) {
        await expectVisibleById(homeownerA.client, 'invoices', homeownerVisibleInvoice.id, 'Homeowner A should see own non-draft invoice');
        await expectHiddenById(homeownerB.client, 'invoices', homeownerVisibleInvoice.id, 'Homeowner B should not see Homeowner A invoice');
      }

      const draftInvoice = await maybeFirst(
        contractorA.client,
        'invoices',
        'id,status,homeowner_user_id',
        query => query.eq('contractor_id', contractorAId).eq('status', 'draft').not('homeowner_user_id', 'is', null),
      );
      if (draftInvoice?.id && draftInvoice.homeowner_user_id === homeownerA.userId) {
        await expectHiddenById(homeownerA.client, 'invoices', draftInvoice.id, 'Homeowner A should not see draft contractor invoice');
      }
  });

  test('jobs and report records stay contractor-scoped until homeowner-visible finalization', async () => {
    const contractorAId = await contractorProfileId(contractorA, 'Contractor A');
      const job = await maybeFirst(
        contractorA.client,
        'inspections',
        'id,status,homeowner_user_id,contractor_id',
        query => query.eq('contractor_id', contractorAId).order('updated_at', { ascending: false }),
      );
      test.skip(!job, 'Sandbox needs at least one Contractor A inspection/job fixture for expanded RLS coverage.');

      await expectVisibleById(contractorA.client, 'inspections', job!.id, 'Contractor A should see own job/report');
      await expectHiddenById(contractorB.client, 'inspections', job!.id, 'Contractor B should not see Contractor A job/report');
      await expectHiddenById(homeownerB.client, 'inspections', job!.id, 'Homeowner B should not see Homeowner A job/report');

      const finalizedHomeownerJob = await maybeFirst(
        homeownerA.client,
        'inspections',
        'id,status,homeowner_user_id',
        query => query.eq('homeowner_user_id', homeownerA.userId).eq('status', 'finalized').order('updated_at', { ascending: false }),
      );
      if (finalizedHomeownerJob?.id) {
        await expectVisibleById(homeownerA.client, 'inspections', finalizedHomeownerJob.id, 'Homeowner A should see finalized own report');
        await expectHiddenById(homeownerB.client, 'inspections', finalizedHomeownerJob.id, 'Homeowner B should not see finalized Homeowner A report');
      }

      const draftHomeownerJob = await maybeFirst(
        contractorA.client,
        'inspections',
        'id,status,homeowner_user_id',
        query => query.eq('contractor_id', contractorAId).neq('status', 'finalized').not('homeowner_user_id', 'is', null),
      );
      if (draftHomeownerJob?.id && draftHomeownerJob.homeowner_user_id === homeownerA.userId) {
        await expectHiddenById(homeownerA.client, 'inspections', draftHomeownerJob.id, 'Homeowner A should not see draft/internal report');
      }
  });

  test('service request messages and media remain limited to connected parties', async () => {
    const contractorAId = await contractorProfileId(contractorA, 'Contractor A');
      const request = await maybeFirst(
        homeownerA.client,
        'service_requests',
        'id,homeowner_user_id,contractor_id',
        query => query.eq('homeowner_user_id', homeownerA.userId).eq('contractor_id', contractorAId).order('updated_at', { ascending: false }),
      );
      test.skip(!request, 'Sandbox needs a Homeowner A / Contractor A service request fixture for message/media privacy coverage.');

      await expectVisibleById(homeownerA.client, 'service_requests', request!.id, 'Homeowner A should see own service request');
      await expectVisibleById(contractorA.client, 'service_requests', request!.id, 'Contractor A should see connected service request');
      await expectHiddenById(homeownerB.client, 'service_requests', request!.id, 'Homeowner B should not see unrelated service request');
      await expectHiddenById(contractorB.client, 'service_requests', request!.id, 'Contractor B should not see unrelated service request');

      const message = await maybeFirst(
        homeownerA.client,
        'service_request_messages',
        'id,request_id',
        query => query.eq('request_id', request!.id).order('created_at', { ascending: true }),
      );
      if (message?.id) {
        await expectVisibleById(homeownerA.client, 'service_request_messages', message.id, 'Homeowner A should see own request message');
        await expectVisibleById(contractorA.client, 'service_request_messages', message.id, 'Contractor A should see connected request message');
        await expectHiddenById(homeownerB.client, 'service_request_messages', message.id, 'Homeowner B should not see unrelated request message');
        await expectHiddenById(contractorB.client, 'service_request_messages', message.id, 'Contractor B should not see unrelated request message');
      }

      const media = await maybeFirst(
        homeownerA.client,
        'service_request_media',
        'id,request_id,storage_path',
        query => query.eq('request_id', request!.id).order('created_at', { ascending: true }),
      );
      if (media?.id) {
        await expectVisibleById(homeownerA.client, 'service_request_media', media.id, 'Homeowner A should see own request media metadata');
        await expectVisibleById(contractorA.client, 'service_request_media', media.id, 'Contractor A should see connected request media metadata');
        await expectHiddenById(homeownerB.client, 'service_request_media', media.id, 'Homeowner B should not see unrelated request media metadata');
        await expectHiddenById(contractorB.client, 'service_request_media', media.id, 'Contractor B should not see unrelated request media metadata');

        if (media.storage_path) {
          await expect(canCreateSignedUrl(homeownerA.client, 'service-request-media', media.storage_path), 'Homeowner A should sign own request media URL').resolves.toBe(true);
          await expect(canCreateSignedUrl(contractorA.client, 'service-request-media', media.storage_path), 'Contractor A should sign connected request media URL').resolves.toBe(true);
          await expect(canCreateSignedUrl(homeownerB.client, 'service-request-media', media.storage_path), 'Homeowner B should not sign unrelated request media URL').resolves.toBe(false);
          await expect(canCreateSignedUrl(contractorB.client, 'service-request-media', media.storage_path), 'Contractor B should not sign unrelated request media URL').resolves.toBe(false);
        }
      }
  });

  test('shared-property permissions do not expose unshared homes or hidden categories', async () => {
    const contractorAId = await contractorProfileId(contractorA, 'Contractor A');
      const connection = await maybeFirst(
        homeownerA.client,
        'homeowner_contractor_connections',
        'id,homeowner_user_id,contractor_id,status',
        query => query.eq('homeowner_user_id', homeownerA.userId).eq('contractor_id', contractorAId).eq('status', 'active'),
      );
      test.skip(!connection, 'Sandbox needs an active Homeowner A / Contractor A connection fixture for shared-property coverage.');

      const sharedProperty = await maybeFirst(
        contractorA.client,
        'connection_shared_properties',
        'id,connection_id,home_id',
        query => query.eq('connection_id', connection!.id),
      );
      test.skip(!sharedProperty, 'Sandbox needs at least one shared property row for connection shared-property coverage.');

      await expectVisibleById(contractorA.client, 'connection_shared_properties', sharedProperty!.id, 'Contractor A should see explicitly shared property');
      await expectHiddenById(contractorB.client, 'connection_shared_properties', sharedProperty!.id, 'Contractor B should not see Contractor A shared property');

      const homeownerHomes = await homeownerA.client
        .from('homes')
        .select('id')
        .eq('homeowner_user_id', homeownerA.userId)
        .order('created_at', { ascending: true });
      expect(homeownerHomes.error, 'Homeowner A homes query should not error').toBeNull();
      const unsharedHome = (homeownerHomes.data || []).find(home => home.id !== sharedProperty!.home_id);
      if (unsharedHome?.id) {
        await expectHiddenById(contractorA.client, 'homes', unsharedHome.id, 'Contractor A should not direct-fetch another unshared Homeowner A property');
      }

      const connectedHomeowners = await contractorA.client.rpc('servsync_contractor_connected_homeowners');
      expect(connectedHomeowners.error, 'Contractor connected homeowners RPC should not error').toBeNull();
      const row = ((connectedHomeowners.data || []) as TableRow[]).find(item => item.connection_id === connection!.id);
      expect(row, 'Contractor A connected-homeowner row should exist').toBeTruthy();
      const permissions = row?.permissions || {};
      if (permissions.share_contact === false) {
        expect(row.display_name, 'Hidden contact permission should not expose homeowner display name').toBe('Homeowner');
        expect(row.phone, 'Hidden contact permission should not expose homeowner phone').toBe('');
      }
      if (permissions.share_home_overview === false) {
        expect(row.home, 'Hidden home-overview permission should not expose home details').toBeNull();
      }
      if (permissions.share_address === false && row.home) {
        expect(row.home.address_line1, 'Hidden address permission should not expose address line 1').toBe('');
        expect(row.home.address_line2, 'Hidden address permission should not expose address line 2').toBe('');
      }
  });

  test('contractor team records and contractor-only estimate tools stay tenant-scoped', async () => {
    const contractorAId = await contractorProfileId(contractorA, 'Contractor A');
      const teamMember = await maybeFirst(
        contractorA.client,
        'contractor_team_members',
        'id,contractor_id,role,status',
        query => query.eq('contractor_id', contractorAId),
      );
      if (teamMember?.id) {
        await expectVisibleById(contractorA.client, 'contractor_team_members', teamMember.id, 'Contractor A should see own team member');
        await expectHiddenById(contractorB.client, 'contractor_team_members', teamMember.id, 'Contractor B should not see Contractor A team member');
      }

      const savedCharge = await maybeFirst(
        contractorA.client,
        'contractor_saved_estimate_charges',
        'id,contractor_id',
        query => query.eq('contractor_id', contractorAId).order('created_at', { ascending: false }),
      );
      if (savedCharge?.id) {
        await expectVisibleById(contractorA.client, 'contractor_saved_estimate_charges', savedCharge.id, 'Contractor A should see own saved charge');
        await expectHiddenById(contractorB.client, 'contractor_saved_estimate_charges', savedCharge.id, 'Contractor B should not see Contractor A saved charge');
        await expectHiddenById(homeownerA.client, 'contractor_saved_estimate_charges', savedCharge.id, 'Homeowner should not see contractor-only saved charge');
      }

      const estimateTemplate = await maybeFirst(
        contractorA.client,
        'estimate_templates',
        'id,contractor_id',
        query => query.eq('contractor_id', contractorAId).order('created_at', { ascending: false }),
      );
      if (estimateTemplate?.id) {
        await expectVisibleById(contractorA.client, 'estimate_templates', estimateTemplate.id, 'Contractor A should see own estimate template');
        await expectHiddenById(contractorB.client, 'estimate_templates', estimateTemplate.id, 'Contractor B should not see Contractor A estimate template');
        await expectHiddenById(homeownerA.client, 'estimate_templates', estimateTemplate.id, 'Homeowner should not see contractor-only estimate template');
      }

      if (optionalViewer && teamMember?.id) {
        await expectRpcDenied(
          optionalViewer.client,
          'servsync_update_contractor_team_member',
          { p_member_id: teamMember.id, p_role: teamMember.role, p_status: teamMember.status },
          'Viewer/limited team account should not update team members',
        );
      } else {
        test.info().annotations.push({
          type: 'skip-note',
          description: 'Viewer role mutation coverage skipped because TEST_CONTRACTOR_VIEWER_EMAIL/PASSWORD or team-member fixture is not configured.',
        });
      }
  });

  test('support and admin-only surfaces deny non-admin users', async () => {
    const supportInquiry = await maybeFirst(
        homeownerA.client,
        'support_inquiries',
        'id,requester_user_id',
        query => query.eq('requester_user_id', homeownerA.userId).order('updated_at', { ascending: false }),
      );
      if (supportInquiry?.id) {
        await expectVisibleById(homeownerA.client, 'support_inquiries', supportInquiry.id, 'Requester should see own support inquiry');
        await expectHiddenById(homeownerB.client, 'support_inquiries', supportInquiry.id, 'Other homeowner should not see support inquiry');
        await expectHiddenById(contractorA.client, 'support_inquiries', supportInquiry.id, 'Unrelated contractor should not see support inquiry');
      }

      await expect(countRows(homeownerA.client, 'profiles'), 'Non-admin homeowner should not list broad profile data').resolves.toBeLessThanOrEqual(1);
      await expect(countRows(contractorA.client, 'profiles'), 'Non-admin contractor should not list broad profile data').resolves.toBeLessThanOrEqual(1);

      const overview = await homeownerA.client.rpc('servsync_admin_overview');
      expect(overview.error, 'Non-admin admin overview RPC should not error').toBeNull();
      expect(overview.data, 'Non-admin admin overview should return zeroed summary').toMatchObject({
        homeowners: 0,
        contractors: 0,
        active_connections: 0,
        pending_connections: 0,
        active_invites: 0,
      });

      const connectionOverview = await homeownerA.client.rpc('servsync_admin_connection_overview');
      expect(connectionOverview.error, 'Non-admin admin connection overview RPC should not error').toBeNull();
      expect(connectionOverview.data || [], 'Non-admin admin connection overview should return no rows').toHaveLength(0);

      await expectRpcDenied(homeownerA.client, 'servsync_admin_platform_health', {}, 'Non-admin should not access platform health report');
      await expectRpcDenied(contractorA.client, 'servsync_admin_revenue_breakdown', {}, 'Non-admin should not access revenue report');

      if (optionalAdmin) {
        const adminOverview = await optionalAdmin.client.rpc('servsync_admin_overview');
        expect(adminOverview.error, 'Sandbox admin overview should work when optional admin credentials are configured').toBeNull();
        expect(adminOverview.data, 'Sandbox admin overview should return an object').toBeTruthy();
      } else {
        test.info().annotations.push({
          type: 'skip-note',
          description: 'Positive admin coverage skipped because TEST_ADMIN_EMAIL/PASSWORD is not configured.',
        });
      }
  });

  test('high-risk SECURITY DEFINER RPCs reject unrelated users', async () => {
    const contractorAId = await contractorProfileId(contractorA, 'Contractor A');

      const sentEstimate = await maybeFirst(
        contractorA.client,
        'estimates',
        'id,status,homeowner_user_id,contractor_id',
        query => query.eq('contractor_id', contractorAId).eq('status', 'sent').not('homeowner_user_id', 'is', null),
      );
      if (sentEstimate?.id) {
        await expectRpcDenied(
          homeownerB.client,
          'servsync_homeowner_respond_to_estimate',
          { p_estimate_id: sentEstimate.id, p_action: 'accept' },
          'Unrelated homeowner should not accept another homeowner estimate',
        );
      }

      const acceptedEstimate = await maybeFirst(
        contractorA.client,
        'estimates',
        'id,status,contractor_id',
        query => query.eq('contractor_id', contractorAId).eq('status', 'accepted'),
      );
      if (acceptedEstimate?.id) {
        await expectRpcDenied(
          contractorB.client,
          'servsync_create_invoice_from_estimate',
          { p_estimate_id: acceptedEstimate.id },
          'Unrelated contractor should not create invoice from Contractor A estimate',
        );
        await expectRpcDenied(
          contractorB.client,
          'servsync_create_job_from_estimate',
          { p_estimate_id: acceptedEstimate.id },
          'Unrelated contractor should not create job from Contractor A estimate',
        );
      }

      const job = await maybeFirst(
        contractorA.client,
        'inspections',
        'id,contractor_id',
        query => query.eq('contractor_id', contractorAId).order('updated_at', { ascending: false }),
      );
      if (job?.id) {
        await expectRpcDenied(
          contractorB.client,
          'servsync_create_invoice_from_job',
          { p_inspection_id: job.id },
          'Unrelated contractor should not create invoice from Contractor A job',
        );
      }

      const invoice = await maybeFirst(
        contractorA.client,
        'invoices',
        'id,contractor_id,status',
        query => query.eq('contractor_id', contractorAId).neq('status', 'draft').order('updated_at', { ascending: false }),
      );
      if (invoice?.id) {
        await expectRpcDenied(
          homeownerB.client,
          'servsync_homeowner_view_invoice',
          { p_invoice_id: invoice.id },
          'Unrelated homeowner should not mark another homeowner invoice viewed',
        );
        await expectRpcDenied(
          contractorB.client,
          'servsync_file_invoice_to_home_history',
          { p_invoice_id: invoice.id },
          'Unrelated contractor should not file Contractor A invoice to Home History',
        );
      }
  });
});
