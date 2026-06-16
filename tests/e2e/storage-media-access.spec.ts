import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { credentialsFor, requiredEnv } from './helpers/env';
import { requireApprovedSandboxForMutation } from './helpers/guards';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';
const STORAGE_QA_PREFIX = 'Storage QA 20260616134147';

type CredentialKey = Parameters<typeof credentialsFor>[0];
type AuthenticatedClient = {
  client: SupabaseClient;
  userId: string;
};

function requireSandboxSupabaseConfig() {
  const url = requiredEnv('VITE_SUPABASE_URL');
  const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');

  if (url.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run storage/media access tests against the production Supabase project.');
  }

  if (!url.includes(SANDBOX_SUPABASE_REF)) {
    throw new Error(`Storage/media access tests require sandbox Supabase ref ${SANDBOX_SUPABASE_REF}.`);
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

function parentPrefix(storagePath: string) {
  return storagePath.split('/').slice(0, -1).join('/');
}

async function canCreateSignedUrl(client: SupabaseClient, bucket: string, storagePath: string) {
  const { data, error } = await client.storage.from(bucket).createSignedUrl(storagePath, 60);
  return Boolean(data?.signedUrl && !error);
}

async function canDownload(client: SupabaseClient, bucket: string, storagePath: string) {
  const { data, error } = await client.storage.from(bucket).download(storagePath);
  return Boolean(data && !error);
}

async function listCount(client: SupabaseClient, bucket: string, storagePath: string) {
  const { data, error } = await client.storage.from(bucket).list(parentPrefix(storagePath), { limit: 20 });
  return error ? 0 : data?.length ?? 0;
}

async function expectCanAccessObject(client: SupabaseClient, bucket: string, storagePath: string, label: string) {
  expect(await canCreateSignedUrl(client, bucket, storagePath), `${label} should create a signed URL`).toBe(true);
  expect(await canDownload(client, bucket, storagePath), `${label} should download the object`).toBe(true);
}

async function expectCannotAccessObject(client: SupabaseClient, bucket: string, storagePath: string, label: string) {
  expect(await canCreateSignedUrl(client, bucket, storagePath), `${label} should not create a signed URL`).toBe(false);
  expect(await canDownload(client, bucket, storagePath), `${label} should not download the object`).toBe(false);
  expect(await listCount(client, bucket, storagePath), `${label} should not list private folder contents`).toBe(0);
}

async function latestHomeownerBDocument(client: SupabaseClient) {
  const { data, error } = await client
    .from('home_documents')
    .select('id,file_name,storage_path,notes,created_at')
    .or(`file_name.ilike.%${STORAGE_QA_PREFIX} Homeowner B Document%,notes.ilike.%${STORAGE_QA_PREFIX} Homeowner B Document%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  expect(error, 'Homeowner B private document fixture query should not error').toBeNull();
  expect(data?.storage_path, 'Homeowner B private document fixture should exist').toBeTruthy();

  return data as { id: string; storage_path: string };
}

async function latestHomeownerBSupportAttachment(client: SupabaseClient) {
  const { data, error } = await client
    .from('support_inquiries')
    .select('id,title,messages:support_inquiry_messages(attachments)')
    .ilike('title', `%${STORAGE_QA_PREFIX} Support Attachment%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  expect(error, 'Homeowner B support fixture query should not error').toBeNull();
  const attachment = (data?.messages || []).flatMap((message: { attachments?: { storage_path?: string }[] }) => message.attachments || [])[0];
  expect(attachment?.storage_path, 'Homeowner B support attachment fixture should exist').toBeTruthy();

  return attachment as { storage_path: string };
}

async function latestHomeownerAReport(client: SupabaseClient) {
  const { data, error } = await client
    .from('inspections')
    .select('id,name,status,homeowner_user_id,rooms_with_findings,report_storage_path,created_at')
    .ilike('name', `%${STORAGE_QA_PREFIX} Report Media Homeowner A%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  expect(error, 'Homeowner A report media fixture query should not error').toBeNull();
  expect(data?.id, 'Homeowner A report media fixture should exist').toBeTruthy();
  expect(['finalized', 'completed'], 'Homeowner A report media fixture should be finalized or completed').toContain(data?.status);

  const roomsJson = JSON.stringify(data?.rooms_with_findings || {});
  const inspectionMediaPath = [...roomsJson.matchAll(/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:png|jpg|jpeg|webp|gif|mp4|mov)/gi)]
    .map(match => match[0])[0];

  expect(inspectionMediaPath, 'Homeowner A report inspection-media fixture should include a media path').toBeTruthy();
  expect(data?.report_storage_path, 'Homeowner A finalized report should include a filed report document path').toBeTruthy();

  return {
    inspectionMediaPath,
    reportStoragePath: data!.report_storage_path as string,
  };
}

async function publicBucketNames(client: SupabaseClient, bucket: string) {
  const { data, error } = await client.storage.from(bucket).list('', { limit: 100 });
  expect(error, `${bucket} public bucket root list should not error`).toBeNull();

  const rootItems = data || [];
  const nestedResults = await Promise.all(
    rootItems.slice(0, 20).map(async item => {
      const nested = await client.storage.from(bucket).list(item.name, { limit: 100 });
      return nested.error ? [] : (nested.data || []).map(nestedItem => `${item.name}/${nestedItem.name}`);
    }),
  );

  return [...rootItems.map(item => item.name), ...nestedResults.flat()];
}

function expectNoPrivateLookingPublicNames(names: string[], bucket: string) {
  const privateLooking = names.filter(name =>
    /Storage QA|home-documents|service-request-media|inspection-media|support-attachments|support attachment|homeowner b document|report media/i.test(name),
  );
  expect(privateLooking, `${bucket} should not expose private-looking fixture names`).toHaveLength(0);
}

test.describe('sandbox storage/media access boundaries', () => {
  test.beforeAll(() => {
    requireApprovedSandboxForMutation();
    requireSandboxSupabaseConfig();
  });

  test('private storage fixtures are scoped to intended users and public buckets stay separated', async () => {
    const homeownerA = await signInAs('homeowner');
    const homeownerB = await signInAs('homeownerB');
    const contractorA = await signInAs('contractor');
    const contractorB = await signInAs('contractorB');
    const accounts = [homeownerA, homeownerB, contractorA, contractorB];

    try {
      const homeownerBDocument = await latestHomeownerBDocument(homeownerB.client);
      const supportAttachment = await latestHomeownerBSupportAttachment(homeownerB.client);
      const report = await latestHomeownerAReport(contractorA.client);

      await expectCanAccessObject(homeownerB.client, 'home-documents', homeownerBDocument.storage_path, 'Homeowner B private document owner');
      await expectCannotAccessObject(homeownerA.client, 'home-documents', homeownerBDocument.storage_path, 'Homeowner A against Homeowner B private document');
      await expectCannotAccessObject(contractorA.client, 'home-documents', homeownerBDocument.storage_path, 'Contractor A against Homeowner B private document');
      await expectCannotAccessObject(contractorB.client, 'home-documents', homeownerBDocument.storage_path, 'Contractor B against Homeowner B private document');

      await expectCanAccessObject(homeownerB.client, 'support-attachments', supportAttachment.storage_path, 'Homeowner B support attachment owner');
      await expectCannotAccessObject(homeownerA.client, 'support-attachments', supportAttachment.storage_path, 'Homeowner A against Homeowner B support attachment');
      await expectCannotAccessObject(contractorA.client, 'support-attachments', supportAttachment.storage_path, 'Contractor A against Homeowner B support attachment');
      await expectCannotAccessObject(contractorB.client, 'support-attachments', supportAttachment.storage_path, 'Contractor B against Homeowner B support attachment');

      await expectCanAccessObject(contractorA.client, 'inspection-media', report.inspectionMediaPath, 'Contractor A report media owner');
      await expectCanAccessObject(homeownerA.client, 'inspection-media', report.inspectionMediaPath, 'Homeowner A finalized report media recipient');
      await expectCannotAccessObject(homeownerB.client, 'inspection-media', report.inspectionMediaPath, 'Homeowner B against Homeowner A report media');
      await expectCannotAccessObject(contractorB.client, 'inspection-media', report.inspectionMediaPath, 'Contractor B against Contractor A report media');

      await expectCanAccessObject(homeownerA.client, 'home-documents', report.reportStoragePath, 'Homeowner A finalized report document recipient');
      await expectCannotAccessObject(homeownerB.client, 'home-documents', report.reportStoragePath, 'Homeowner B against Homeowner A finalized report document');
      await expectCannotAccessObject(contractorB.client, 'home-documents', report.reportStoragePath, 'Contractor B against Contractor A finalized report document');

      expectNoPrivateLookingPublicNames(await publicBucketNames(homeownerA.client, 'discover-media'), 'discover-media');
      expectNoPrivateLookingPublicNames(await publicBucketNames(contractorA.client, 'contractor-assets'), 'contractor-assets');
    } finally {
      await signOutAll(accounts);
    }
  });
});
