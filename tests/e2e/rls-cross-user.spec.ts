import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { credentialsFor, requiredEnv } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';
const RLS_QA_PREFIX = 'RLS QA';

type CredentialKey = Parameters<typeof credentialsFor>[0];
type AuthenticatedClient = {
  client: SupabaseClient;
  userId: string;
};
type QueryBuilder = any;

function requireSandboxSupabaseConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');

  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run RLS tests against the production Supabase project.');
  }

  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`RLS tests require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
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

async function signOutAll(accounts: AuthenticatedClient[]) {
  await Promise.all(accounts.map(({ client }) => client.auth.signOut().catch(() => undefined)));
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

async function firstId(
  client: SupabaseClient,
  table: string,
  label: string,
  apply: (query: QueryBuilder) => QueryBuilder = query => query,
): Promise<string> {
  const query = apply(client.from(table).select('id').limit(1));
  const { data, error } = await query.maybeSingle();
  expect(error, `${label} fixture query should not error`).toBeNull();
  expect(data?.id, `${label} fixture should exist in sandbox`).toBeTruthy();
  return data.id as string;
}

async function assertVisibleCount(
  client: SupabaseClient,
  table: string,
  label: string,
  apply: (query: QueryBuilder) => QueryBuilder,
  expected: number,
) {
  const count = await countRows(client, table, apply);
  expect(count, label).toBe(expected);
}

async function contractorProfileId(client: SupabaseClient, businessName: RegExp | string, label: string): Promise<string> {
  const query = client.from('contractor_profiles').select('id,business_name').limit(20);
  const { data, error } = await query;
  expect(error, `${label} contractor profile query should not error`).toBeNull();
  const profile = (data || []).find(row => {
    const name = String(row.business_name || '');
    return typeof businessName === 'string' ? name === businessName : businessName.test(name);
  });
  expect(profile?.id, `${label} contractor profile should exist in sandbox`).toBeTruthy();
  return profile!.id as string;
}

test.describe('sandbox RLS cross-user boundaries', () => {
  test.beforeAll(() => {
    requireApprovedSandboxForMutation();
    requireSandboxSupabaseConfig();
  });

  test('homeowners and contractors cannot direct-fetch each other private records', async () => {
    const homeownerA = await signInAs('homeowner');
    const homeownerB = await signInAs('homeownerB');
    const contractorA = await signInAs('contractor');
    const contractorB = await signInAs('contractorB');
    const accounts = [homeownerA, homeownerB, contractorA, contractorB];

    try {
      const homeownerAHomeId = await firstId(
        homeownerA.client,
        'homes',
        'Homeowner A home',
        query => query.eq('homeowner_user_id', homeownerA.userId),
      );
      const homeownerBHomeId = await firstId(
        homeownerB.client,
        'homes',
        'Homeowner B home',
        query => query.eq('nickname', 'RLS QA Homeowner B Home'),
      );
      const homeownerAHistoryId = await firstId(
        homeownerA.client,
        'home_maintenance_log',
        'Homeowner A Home History entry',
        query => query.eq('homeowner_user_id', homeownerA.userId),
      );
      const homeownerBHistoryId = await firstId(
        homeownerB.client,
        'home_maintenance_log',
        'Homeowner B Home History entry',
        query => query.ilike('title', `${RLS_QA_PREFIX}%Home History Entry`),
      );
      const homeownerAReminderId = await firstId(
        homeownerA.client,
        'home_reminders',
        'Homeowner A Home Reminder',
        query => query.eq('homeowner_user_id', homeownerA.userId),
      );
      const homeownerBReminderId = await firstId(
        homeownerB.client,
        'home_reminders',
        'Homeowner B Home Reminder',
        query => query.ilike('title', `${RLS_QA_PREFIX}%Home Reminder`),
      );
      const homeownerBRequestId = await firstId(
        homeownerB.client,
        'service_requests',
        'Homeowner B service request',
        query => query.ilike('title', `${RLS_QA_PREFIX}%Service Request`),
      );

      const contractorAId = await contractorProfileId(contractorA.client, /Prevention Pros/i, 'Contractor A');
      const contractorBId = await contractorProfileId(contractorB.client, 'RLS QA Contractor B', 'Contractor B');
      const contractorALocalContactId = await firstId(
        contractorA.client,
        'contractor_local_contacts',
        'Contractor A local contact',
        query => query.eq('contractor_id', contractorAId),
      );
      const contractorBLocalContactId = await firstId(
        contractorB.client,
        'contractor_local_contacts',
        'Contractor B local contact',
        query => query.ilike('display_name', `${RLS_QA_PREFIX}%Local Customer`),
      );
      const contractorBCalendarEventId = await firstId(
        contractorB.client,
        'contractor_calendar_events',
        'Contractor B calendar event',
        query => query.ilike('title', `${RLS_QA_PREFIX}%Calendar Event`),
      );
      const contractorBTemplateId = await firstId(
        contractorB.client,
        'inspection_templates',
        'Contractor B inspection template',
        query => query.ilike('name', `${RLS_QA_PREFIX}%Checklist Template`),
      );

      await assertVisibleCount(homeownerA.client, 'homes', 'Homeowner A should see own home', query => query.eq('id', homeownerAHomeId), 1);
      await assertVisibleCount(homeownerB.client, 'homes', 'Homeowner B should see own home', query => query.eq('id', homeownerBHomeId), 1);
      await assertVisibleCount(homeownerA.client, 'home_maintenance_log', 'Homeowner A should see own Home History', query => query.eq('id', homeownerAHistoryId), 1);
      await assertVisibleCount(homeownerB.client, 'home_maintenance_log', 'Homeowner B should see own Home History', query => query.eq('id', homeownerBHistoryId), 1);
      await assertVisibleCount(homeownerA.client, 'home_reminders', 'Homeowner A should see own reminders', query => query.eq('id', homeownerAReminderId), 1);
      await assertVisibleCount(homeownerB.client, 'home_reminders', 'Homeowner B should see own reminders', query => query.eq('id', homeownerBReminderId), 1);

      await assertVisibleCount(homeownerA.client, 'homes', 'Homeowner A should not see Homeowner B home', query => query.eq('id', homeownerBHomeId), 0);
      await assertVisibleCount(homeownerB.client, 'homes', 'Homeowner B should not see Homeowner A home', query => query.eq('id', homeownerAHomeId), 0);
      await assertVisibleCount(homeownerA.client, 'home_maintenance_log', 'Homeowner A should not see Homeowner B Home History', query => query.eq('id', homeownerBHistoryId), 0);
      await assertVisibleCount(homeownerB.client, 'home_maintenance_log', 'Homeowner B should not see Homeowner A Home History', query => query.eq('id', homeownerAHistoryId), 0);
      await assertVisibleCount(homeownerA.client, 'home_reminders', 'Homeowner A should not see Homeowner B reminders', query => query.eq('id', homeownerBReminderId), 0);
      await assertVisibleCount(homeownerB.client, 'home_reminders', 'Homeowner B should not see Homeowner A reminders', query => query.eq('id', homeownerAReminderId), 0);

      await assertVisibleCount(contractorA.client, 'contractor_local_contacts', 'Contractor A should see own local contact', query => query.eq('id', contractorALocalContactId), 1);
      await assertVisibleCount(contractorB.client, 'contractor_local_contacts', 'Contractor B should see own local contact', query => query.eq('id', contractorBLocalContactId), 1);
      await assertVisibleCount(contractorA.client, 'contractor_local_contacts', 'Contractor A should not see Contractor B local contact', query => query.eq('id', contractorBLocalContactId), 0);
      await assertVisibleCount(contractorB.client, 'contractor_local_contacts', 'Contractor B should not see Contractor A local contact', query => query.eq('id', contractorALocalContactId), 0);
      await assertVisibleCount(contractorA.client, 'contractor_calendar_events', 'Contractor A should not see Contractor B calendar event', query => query.eq('id', contractorBCalendarEventId), 0);
      await assertVisibleCount(contractorA.client, 'inspection_templates', 'Contractor A should not see Contractor B template', query => query.eq('id', contractorBTemplateId), 0);

      await assertVisibleCount(contractorB.client, 'service_requests', 'Contractor B should see connected Homeowner B service request', query => query.eq('id', homeownerBRequestId), 1);
      await assertVisibleCount(contractorA.client, 'service_requests', 'Contractor A should not see unconnected Homeowner B service request', query => query.eq('id', homeownerBRequestId), 0);
      await assertVisibleCount(contractorA.client, 'homes', 'Contractor A should not direct-fetch unconnected Homeowner B home', query => query.eq('id', homeownerBHomeId), 0);
      await assertVisibleCount(contractorB.client, 'homes', 'Contractor B should not direct-fetch unconnected Homeowner A home', query => query.eq('id', homeownerAHomeId), 0);
      await assertVisibleCount(contractorA.client, 'home_reminders', 'Contractor A should not manage Homeowner B reminders', query => query.eq('id', homeownerBReminderId), 0);
      await assertVisibleCount(contractorB.client, 'home_reminders', 'Contractor B should not manage Homeowner A reminders', query => query.eq('id', homeownerAReminderId), 0);

      await assertVisibleCount(
        homeownerA.client,
        'homeowner_contractor_connections',
        'Homeowner A should remain unconnected from Contractor B',
        query => query.eq('homeowner_user_id', homeownerA.userId).eq('contractor_id', contractorBId).eq('status', 'active'),
        0,
      );
      await assertVisibleCount(
        homeownerB.client,
        'homeowner_contractor_connections',
        'Homeowner B should remain unconnected from Contractor A',
        query => query.eq('homeowner_user_id', homeownerB.userId).eq('contractor_id', contractorAId).eq('status', 'active'),
        0,
      );
      await assertVisibleCount(
        homeownerB.client,
        'homeowner_contractor_connections',
        'Homeowner B should have positive-control connection to Contractor B',
        query => query.eq('homeowner_user_id', homeownerB.userId).eq('contractor_id', contractorBId).eq('status', 'active'),
        1,
      );
    } finally {
      await signOutAll(accounts);
    }
  });
});
