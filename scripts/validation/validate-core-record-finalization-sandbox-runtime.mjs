import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const PROJECT_REF = 'zpzdkoaubyjtsomccxya';
const EXPECTED_HEAD = 'd8a3f6487f6245c18f39eae6bb21c7403b8209c9';
const EXPECTED_MIGRATION_SHA = 'b864e61a693ed881eb2abf497adf1833c48cd9803f185ac393e4f8f420fb4461';
const MARKER = 'FB039E2RT2';
const EMAIL_PREFIX = 'fb039e2rt2-';
const BUCKET = 'home-documents';
const execute = process.argv.includes('--execute-sandbox');

if (!execute) {
  throw new Error('Refusing shared mutation. Re-run with --execute-sandbox only after explicit owner approval.');
}

const ids = {
  contractor: 'f039e202-0000-4000-8000-000000000101',
  contractorB: 'f039e202-0000-4000-8000-000000000102',
  home: 'f039e202-0000-4000-8000-000000000201',
  homeB: 'f039e202-0000-4000-8000-000000000202',
  reportMain: 'f039e202-0000-4000-8000-000000000301',
  reportMetadata: 'f039e202-0000-4000-8000-000000000302',
  reportAdmin: 'f039e202-0000-4000-8000-000000000303',
  reportOffice: 'f039e202-0000-4000-8000-000000000304',
  reportField: 'f039e202-0000-4000-8000-000000000305',
  reportViewer: 'f039e202-0000-4000-8000-000000000306',
  reportCross: 'f039e202-0000-4000-8000-000000000307',
  reportExpiry: 'f039e202-0000-4000-8000-000000000308',
  reportLegacy: 'f039e202-0000-4000-8000-000000000309',
  reportHomeowner: 'f039e202-0000-4000-8000-000000000310',
  opReportMain: 'f039e202-0000-4000-8000-000000000601',
  opReportMetadata: 'f039e202-0000-4000-8000-000000000602',
  opReportAdmin: 'f039e202-0000-4000-8000-000000000603',
  opReportOffice: 'f039e202-0000-4000-8000-000000000604',
  opReportField: 'f039e202-0000-4000-8000-000000000605',
  opReportViewer: 'f039e202-0000-4000-8000-000000000606',
  opReportCross: 'f039e202-0000-4000-8000-000000000607',
  opReportExpiry: 'f039e202-0000-4000-8000-000000000608',
  opReportLegacy: 'f039e202-0000-4000-8000-000000000609',
  opReportHomeowner: 'f039e202-0000-4000-8000-000000000610',
  opManualNoDoc: 'f039e202-0000-4000-8000-000000000611',
  opManualExpiry: 'f039e202-0000-4000-8000-000000000612',
  opManualDocument: 'f039e202-0000-4000-8000-000000000613',
  teamAdmin: 'f039e202-0000-4000-8000-000000000701',
  teamOffice: 'f039e202-0000-4000-8000-000000000702',
  teamField: 'f039e202-0000-4000-8000-000000000703',
  teamViewer: 'f039e202-0000-4000-8000-000000000704',
  memberAdmin: 'f039e202-0000-4000-8000-000000000711',
  memberMember: 'f039e202-0000-4000-8000-000000000712',
  memberViewer: 'f039e202-0000-4000-8000-000000000713',
};

const expectedFunctionHashes = {
  'servsync_can_upload_prepared_record_finalization(text)': 'd9fde3b6502820c2a51befa7dc9f68d3',
  'servsync_commit_job_report_finalization(uuid,uuid,jsonb)': '2ec472c1d7b5eb4e5dfb41f2d7f7fff7',
  'servsync_commit_manual_home_history_creation(uuid,jsonb)': 'a346916bef87e946f9efe39ce18bf220',
  'servsync_prepare_job_report_finalization(uuid,uuid,jsonb)': '669744e3521def83b715f3c973990879',
  'servsync_prepare_manual_home_history_creation(uuid,jsonb)': '65cb802125f40233ff1c7fb53c3e90e2',
};

const supabaseUrl = `https://${PROJECT_REF}.supabase.co`;
const createdUsers = [];
const storagePaths = new Set();
const sessions = [];
let service;
let baselineBefore;
let cleanupStarted = false;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function client(key) {
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function cli(args) {
  return execFileSync('supabase', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function dbQuery(sql) {
  const parsed = JSON.parse(cli(['db', 'query', '--linked', '--output', 'json', sql]));
  return parsed.rows ?? [];
}

function sqlUuidList(values) {
  return values.map(value => `'${value}'::uuid`).join(', ');
}

function baselineQuery() {
  return `with baseline as (
    select 'auth_users' label, count(*)::bigint count, md5(coalesce(string_agg(id::text, ',' order by id), '')) fingerprint from auth.users
    union all select 'profiles', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from public.profiles
    union all select 'contractor_profiles', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from public.contractor_profiles
    union all select 'contractor_team_members', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from public.contractor_team_members
    union all select 'contractor_billing_accounts', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from public.contractor_billing_accounts
    union all select 'referral_codes', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from public.referral_codes
    union all select 'referrals', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from public.referrals
    union all select 'servsync_referral_invites', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from public.servsync_referral_invites
    union all select 'homes', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from public.homes
    union all select 'home_memberships', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from public.home_memberships
    union all select 'service_requests', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from public.service_requests
    union all select 'service_request_quotes', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from public.service_request_quotes
    union all select 'inspections', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from public.inspections
    union all select 'home_documents', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from public.home_documents
    union all select 'home_maintenance_log', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from public.home_maintenance_log
    union all select 'notifications', count(*), md5(coalesce(string_agg(id::text, ',' order by id), '')) from public.notifications
    union all select 'storage_home_documents', count(*), md5(coalesce(string_agg(name, ',' order by name), '')) from storage.objects where bucket_id = '${BUCKET}'
  ) select label, count, fingerprint from baseline order by label;`;
}

function markerResidueQuery() {
  const operationIds = Object.entries(ids).filter(([key]) => key.startsWith('op')).map(([, value]) => value);
  const jobIds = Object.entries(ids).filter(([key]) => key.startsWith('report')).map(([, value]) => value);
  return `select
    (select count(*) from auth.users where email like '${EMAIL_PREFIX}%@example.invalid') as auth_users,
    (select count(*) from public.profiles where email like '${EMAIL_PREFIX}%@example.invalid') as profiles,
    (select count(*) from public.contractor_profiles where id in (${sqlUuidList([ids.contractor, ids.contractorB])})) as contractors,
    (select count(*) from public.contractor_team_members where id in (${sqlUuidList([ids.teamAdmin, ids.teamOffice, ids.teamField, ids.teamViewer])})) as team_members,
    (select count(*) from public.homes where id in (${sqlUuidList([ids.home, ids.homeB])})) as homes,
    (select count(*) from public.home_memberships where id in (${sqlUuidList([ids.memberAdmin, ids.memberMember, ids.memberViewer])})) as memberships,
    (select count(*) from public.inspections where id in (${sqlUuidList(jobIds)})) as jobs,
    (select count(*) from public.servsync_core_record_finalization_operations where operation_key in (${sqlUuidList(operationIds)})) as receipts,
    (select count(*) from public.home_documents where file_name like '${MARKER}%') as documents,
    (select count(*) from public.home_maintenance_log where title like '${MARKER}%') as history,
    (select count(*) from storage.objects where bucket_id = '${BUCKET}' and (name like '%/${ids.reportMain}/%' or name like '%/${ids.reportMetadata}/%' or name like '%/${ids.reportLegacy}/%' or name like '%/${ids.opManualDocument}.%')) as objects;`;
}

function definitionQuery() {
  return `select p.oid::regprocedure::text signature,
    pg_get_userbyid(p.proowner) owner,
    p.prosecdef,
    p.provolatile,
    coalesce(array_to_string(p.proconfig, ','), '') proconfig,
    md5(pg_get_functiondef(p.oid)) definition_md5
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in (
    'servsync_prepare_job_report_finalization','servsync_commit_job_report_finalization',
    'servsync_prepare_manual_home_history_creation','servsync_commit_manual_home_history_creation',
    'servsync_can_upload_prepared_record_finalization') order by 1;`;
}

function assertZeroResidue(row, label) {
  for (const [key, value] of Object.entries(row ?? {})) {
    assert.equal(Number(value), 0, `${label}: ${key} residue must be zero`);
  }
}

function preflight() {
  assert.equal(readFileSync('supabase/.temp/project-ref', 'utf8').trim(), PROJECT_REF, 'linked project must be Sandbox');
  assert.equal(cli(['--version']).trim().startsWith('2.'), true, 'Supabase CLI must be available');
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), EXPECTED_HEAD, 'git head mismatch');
  assert.equal(sha256(readFileSync('servsync-core-record-finalization-durable-idempotency.sql')), EXPECTED_MIGRATION_SHA, 'migration hash mismatch');
  const definitions = dbQuery(definitionQuery());
  assert.equal(definitions.length, 5, 'all five installed definitions must exist');
  for (const item of definitions) {
    assert.equal(item.owner, 'postgres', `${item.signature} owner mismatch`);
    assert.equal(item.prosecdef, true, `${item.signature} must remain SECURITY DEFINER`);
    assert.equal(item.proconfig, 'search_path=public', `${item.signature} search path mismatch`);
    assert.equal(item.definition_md5, expectedFunctionHashes[item.signature], `${item.signature} definition drift`);
  }
  const catalog = dbQuery(`select
    (select relrowsecurity and relforcerowsecurity from pg_class where oid='public.servsync_core_record_finalization_operations'::regclass) as forced_rls,
    (select count(*) from pg_policy where polrelid='public.servsync_core_record_finalization_operations'::regclass) as receipt_policies,
    (select confdeltype from pg_constraint where conname='servsync_core_record_finalization_operations_history_id_fkey') as history_delete,
    (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname='home_docs_upload_prepared_record_finalizations') as prepared_policy,
    (to_regprocedure('public.servsync_finalize_field_work(uuid,jsonb,text,text,text,integer)') is not null) as legacy_finalizer,
    (select count(*) from public.servsync_core_record_finalization_operations) as receipts;`)[0];
  assert.deepEqual(catalog, { forced_rls: true, receipt_policies: 0, history_delete: 'n', prepared_policy: 1, legacy_finalizer: true, receipts: 0 });
  assertZeroResidue(dbQuery(markerResidueQuery())[0], 'preflight');
  baselineBefore = dbQuery(baselineQuery());
  return definitions;
}

function loadKeys() {
  const keys = JSON.parse(cli(['projects', 'api-keys', '--project-ref', PROJECT_REF, '--output', 'json']));
  const anonKey = keys.find(item => item.name === 'anon')?.api_key;
  const serviceRoleKey = keys.find(item => item.name === 'service_role')?.api_key;
  assert.ok(anonKey && serviceRoleKey, 'Sandbox legacy API keys are required in memory');
  return { anonKey, serviceRoleKey };
}

async function createUser(name, role, anonKey) {
  const email = `${EMAIL_PREFIX}${name}@example.invalid`;
  const password = `Rt2-${name}-Only!8264`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `${MARKER} ${name}`, role },
  });
  if (error || !data.user) throw new Error(`Could not create ${name} fixture identity.`);
  createdUsers.push(data.user.id);
  const { error: profileError } = await service.from('profiles').update({ role, full_name: `${MARKER} ${name}` }).eq('id', data.user.id);
  if (profileError) throw new Error(`Could not normalize ${name} profile.`);
  const actor = client(anonKey);
  const { data: signed, error: signError } = await actor.auth.signInWithPassword({ email, password });
  if (signError || !signed.user) throw new Error(`Could not sign in ${name} fixture identity.`);
  sessions.push(actor);
  return { id: data.user.id, email, password, client: actor };
}

async function secondSession(actor, anonKey) {
  const duplicate = client(anonKey);
  const { data, error } = await duplicate.auth.signInWithPassword({ email: actor.email, password: actor.password });
  if (error || !data.user) throw new Error('Could not create independent authenticated session.');
  sessions.push(duplicate);
  return duplicate;
}

async function insertOne(table, value) {
  const { data, error } = await service.from(table).insert(value).select('*').single();
  if (error) throw new Error(`Could not create ${table} fixture: ${error.message}`);
  return data;
}

async function setupFixtures(anonKey) {
  const actors = {};
  actors.owner = await createUser('contractor-owner', 'contractor', anonKey);
  actors.admin = await createUser('contractor-admin', 'contractor', anonKey);
  actors.office = await createUser('contractor-office', 'contractor', anonKey);
  actors.field = await createUser('contractor-field', 'contractor', anonKey);
  actors.viewer = await createUser('contractor-viewer', 'contractor', anonKey);
  actors.cross = await createUser('cross-contractor', 'contractor', anonKey);
  actors.homeowner = await createUser('homeowner-owner', 'homeowner', anonKey);
  actors.homeownerB = await createUser('homeowner-cross', 'homeowner', anonKey);
  actors.sharedAdmin = await createUser('shared-admin', 'homeowner', anonKey);
  actors.sharedMember = await createUser('shared-member', 'homeowner', anonKey);
  actors.sharedViewer = await createUser('shared-viewer', 'homeowner', anonKey);

  await insertOne('contractor_profiles', {
    id: ids.contractor, owner_user_id: actors.owner.id, business_name: `${MARKER} Contractor`,
    slug: 'fb039e2rt2-contractor', contact_name: `${MARKER} Owner`, email: actors.owner.email,
  });
  await insertOne('contractor_profiles', {
    id: ids.contractorB, owner_user_id: actors.cross.id, business_name: `${MARKER} Cross Contractor`,
    slug: 'fb039e2rt2-cross-contractor', contact_name: `${MARKER} Cross`, email: actors.cross.email,
  });
  for (const [id, actor, role] of [
    [ids.teamAdmin, actors.admin, 'admin'], [ids.teamOffice, actors.office, 'office'],
    [ids.teamField, actors.field, 'field_tech'], [ids.teamViewer, actors.viewer, 'viewer'],
  ]) {
    await insertOne('contractor_team_members', {
      id, contractor_id: ids.contractor, user_id: actor.id, email: actor.email,
      display_name: `${MARKER} ${role}`, role, status: 'active', invited_by: actors.owner.id,
    });
  }
  await insertOne('homes', {
    id: ids.home, homeowner_user_id: actors.homeowner.id, nickname: `${MARKER} Primary Home`,
    address_line1: '390 Reliability Lane', city: 'Testville', state: 'TX', zip_code: '75001', home_type: 'Single family',
  });
  await insertOne('homes', {
    id: ids.homeB, homeowner_user_id: actors.homeownerB.id, nickname: `${MARKER} Cross Home`,
    address_line1: '391 Reliability Lane', city: 'Testville', state: 'TX', zip_code: '75001', home_type: 'Single family',
  });
  for (const [id, actor, role] of [
    [ids.memberAdmin, actors.sharedAdmin, 'admin'], [ids.memberMember, actors.sharedMember, 'member'],
    [ids.memberViewer, actors.sharedViewer, 'viewer'],
  ]) {
    await insertOne('home_memberships', {
      id, home_id: ids.home, user_id: actor.id, role, status: 'active',
      invited_by_user_id: actors.homeowner.id, accepted_at: new Date().toISOString(),
    });
  }
  const jobs = [
    ids.reportMain, ids.reportMetadata, ids.reportAdmin, ids.reportOffice, ids.reportField,
    ids.reportViewer, ids.reportCross, ids.reportExpiry, ids.reportLegacy, ids.reportHomeowner,
  ];
  for (const [index, id] of jobs.entries()) {
    await insertOne('inspections', {
      id, contractor_id: ids.contractor, homeowner_user_id: actors.homeowner.id, home_id: ids.home,
      name: `${MARKER} Job ${index + 1}`, summary: '', status: 'draft', rooms_with_findings: [],
      job_status: 'in_progress', job_origin: 'direct',
    });
  }
  actors.owner2 = await secondSession(actors.owner, anonKey);
  actors.homeowner2 = await secondSession(actors.homeowner, anonKey);
  return actors;
}

function reportPayload(buffer, suffix, summary = `${MARKER} canonical report`) {
  return {
    rooms_with_findings: [{ room: 'Kitchen', finding: `${MARKER} safe finding` }],
    summary,
    file_name: `${MARKER}-report-${suffix}.pdf`,
    file_size_bytes: buffer.length,
    file_sha256: sha256(buffer),
    include_summary: true,
    include_value_add: false,
    value_add_text: '',
  };
}

function manualPayload(document = null, suffix = 'manual') {
  return {
    service_request_id: null,
    home_id: ids.home,
    category: 'Maintenance',
    title: `${MARKER} ${suffix}`,
    description: `${MARKER} durable manual History`,
    performed_at: '2026-08-24',
    contractor_name: 'Self',
    cost_cents: 4200,
    notes: `${MARKER} notes`,
    document,
  };
}

async function rpcOk(actor, name, args) {
  const { data, error } = await actor.rpc(name, args);
  if (error) throw new Error(`${name} failed: ${error.message}`);
  return data;
}

async function rpcDenied(actor, name, args, label, pattern = /not found|not available|choose one|different details|already prepared|could not be verified/i) {
  const { error } = await actor.rpc(name, args);
  assert.ok(error, `${label} must be denied`);
  assert.match(error.message, pattern, `${label} must return bounded guidance`);
  return error;
}

async function upload(actor, path, buffer, contentType, operationKey, fileSha = sha256(buffer)) {
  const result = await actor.storage.from(BUCKET).upload(path, buffer, {
    contentType, upsert: false,
    metadata: { servsync_sha256: fileSha, servsync_operation_key: operationKey },
  });
  if (!result.error) storagePaths.add(path);
  return result;
}

async function removeStorage(paths) {
  const exact = [...new Set(paths)].filter(Boolean);
  if (exact.length === 0) return;
  const { error } = await service.storage.from(BUCKET).remove(exact);
  if (error) throw new Error(`Exact Storage API cleanup failed: ${error.message}`);
  for (const path of exact) storagePaths.delete(path);
}

async function assertStorageDenied(actor, path, label) {
  const { error } = await actor.storage.from(BUCKET).download(path);
  assert.ok(error, `${label} must not read private Storage`);
}

async function testReportMatrix(actors) {
  const bufferA = Buffer.from('%PDF-1.4\nFB039E2RT2 report bytes A\n%%EOF\n');
  const bufferB = Buffer.from('%PDF-1.4\nFB039E2RT2 regenerated report bytes B are different\n%%EOF\n');
  const payloadA = reportPayload(bufferA, 'a');
  const payloadB = reportPayload(bufferB, 'b');
  const prepArgs = payload => ({ p_operation_key: ids.opReportMain, p_inspection_id: ids.reportMain, p_payload: payload });

  await Promise.all([
    rpcOk(actors.owner.client, 'servsync_prepare_job_report_finalization', prepArgs(payloadA)),
    rpcOk(actors.owner2, 'servsync_prepare_job_report_finalization', prepArgs(payloadB)),
  ]);
  const canonical = await rpcOk(actors.owner.client, 'servsync_prepare_job_report_finalization', prepArgs(payloadA));
  assert.equal(canonical.status, 'prepared');
  assert.equal(canonical.operation_key, ids.opReportMain);
  const reportPath = canonical.storage_path;
  storagePaths.add(reportPath);
  const firstUpload = await upload(actors.owner.client, reportPath, bufferA, 'application/pdf', ids.opReportMain);
  assert.equal(firstUpload.error, null, 'first valid report upload must succeed');
  const preserved = await rpcOk(actors.owner2, 'servsync_prepare_job_report_finalization', prepArgs(payloadB));
  assert.equal(preserved.file_sha256, payloadA.file_sha256, 'existing first valid report object must preserve its manifest');
  const duplicateUpload = await upload(actors.owner2, reportPath, bufferB, 'application/pdf', ids.opReportMain);
  assert.ok(duplicateUpload.error, 'regenerated duplicate report upload must not replace the object');
  await assertStorageDenied(actors.owner.client, reportPath, 'contractor uploader');
  const homeownerRead = await actors.homeowner.client.storage.from(BUCKET).download(reportPath);
  assert.equal(homeownerRead.error, null, 'primary homeowner must retain established report read visibility');

  const [commitA, commitB] = await Promise.all([
    rpcOk(actors.owner.client, 'servsync_commit_job_report_finalization', prepArgs(payloadA)),
    rpcOk(actors.owner2, 'servsync_commit_job_report_finalization', prepArgs(payloadB)),
  ]);
  assert.equal(commitA.inspection_id, ids.reportMain);
  assert.equal(commitB.inspection_id, ids.reportMain);
  assert.equal(commitA.document_id, commitB.document_id);
  assert.equal(commitA.maintenance_log_id, commitB.maintenance_log_id);
  assert.equal(commitA.notification_id, commitB.notification_id);
  const lostResponseReplay = await rpcOk(actors.owner2, 'servsync_commit_job_report_finalization', prepArgs(payloadB));
  assert.equal(lostResponseReplay.document_id, commitA.document_id);
  assert.equal(lostResponseReplay.idempotent, true);
  await rpcDenied(
    actors.owner.client,
    'servsync_prepare_job_report_finalization',
    prepArgs({ ...payloadA, summary: `${MARKER} changed semantic report` }),
    'changed report payload',
    /different details/i,
  );

  const canonicalRows = dbQuery(`select
    (select count(*) from public.inspections where id='${ids.reportMain}' and status='finalized' and job_status='completed' and report_storage_path='${reportPath}') jobs,
    (select count(*) from public.home_documents where storage_path='${reportPath}' and homeowner_user_id='${actors.homeowner.id}' and home_id='${ids.home}' and upload_source='contractor_report') documents,
    (select count(*) from public.home_maintenance_log where inspection_id='${ids.reportMain}' and report_document_id='${commitA.document_id}' and home_id='${ids.home}') history,
    (select count(*) from public.notifications where id='${commitA.notification_id}' and user_id='${actors.homeowner.id}' and type='inspection_report_filed') notifications,
    (select count(*) from public.servsync_core_record_finalization_operations where operation_key='${ids.opReportMain}' and status='succeeded' and result_id='${ids.reportMain}') receipts,
    (select count(*) from storage.objects where bucket_id='${BUCKET}' and name='${reportPath}' and user_metadata->>'servsync_sha256'='${payloadA.file_sha256}' and user_metadata->>'servsync_operation_key'='${ids.opReportMain}') objects;`)[0];
  assert.deepEqual(canonicalRows, { jobs: 1, documents: 1, history: 1, notifications: 1, receipts: 1, objects: 1 });

  const badBuffer = Buffer.from('%PDF-1.4\nFB039E2RT2 metadata rejection\n%%EOF\n');
  const badPayload = reportPayload(badBuffer, 'metadata', `${MARKER} metadata report`);
  const badArgs = { p_operation_key: ids.opReportMetadata, p_inspection_id: ids.reportMetadata, p_payload: badPayload };
  const badPrep = await rpcOk(actors.owner.client, 'servsync_prepare_job_report_finalization', badArgs);
  storagePaths.add(badPrep.storage_path);
  const badUpload = await upload(actors.owner.client, badPrep.storage_path, badBuffer, 'application/pdf', randomUUID());
  assert.equal(badUpload.error, null);
  await rpcDenied(actors.owner.client, 'servsync_commit_job_report_finalization', badArgs, 'invalid report object metadata', /could not be verified/i);
  const rejectedRows = dbQuery(`select
    (select count(*) from public.inspections where id='${ids.reportMetadata}' and status='finalized') jobs,
    (select count(*) from public.home_documents where storage_path='${badPrep.storage_path}') documents,
    (select count(*) from public.home_maintenance_log where inspection_id='${ids.reportMetadata}') history,
    (select count(*) from public.notifications where user_id='${actors.homeowner.id}' and type='inspection_report_filed' and body like '%${MARKER} metadata report%') notifications;`)[0];
  assert.deepEqual(rejectedRows, { jobs: 0, documents: 0, history: 0, notifications: 0 });
  await removeStorage([badPrep.storage_path]);
  const correctUpload = await upload(actors.owner.client, badPrep.storage_path, badBuffer, 'application/pdf', ids.opReportMetadata);
  assert.equal(correctUpload.error, null);
  await rpcOk(actors.owner.client, 'servsync_commit_job_report_finalization', badArgs);

  const roleCases = [
    [actors.admin.client, ids.reportAdmin, ids.opReportAdmin],
    [actors.office.client, ids.reportOffice, ids.opReportOffice],
    [actors.field.client, ids.reportField, ids.opReportField],
  ];
  for (const [actor, job, operation] of roleCases) {
    const bytes = Buffer.from(`%PDF-1.4\n${MARKER} role ${job}\n%%EOF\n`);
    const prepared = await rpcOk(actor, 'servsync_prepare_job_report_finalization', {
      p_operation_key: operation, p_inspection_id: job, p_payload: reportPayload(bytes, operation.slice(-3), `${MARKER} role report`),
    });
    assert.equal(prepared.status, 'prepared');
  }
  const deniedBytes = Buffer.from(`%PDF-1.4\n${MARKER} denied\n%%EOF\n`);
  await rpcDenied(actors.viewer.client, 'servsync_prepare_job_report_finalization', {
    p_operation_key: ids.opReportViewer, p_inspection_id: ids.reportViewer, p_payload: reportPayload(deniedBytes, 'viewer'),
  }, 'contractor Viewer');
  await rpcDenied(actors.cross.client, 'servsync_prepare_job_report_finalization', {
    p_operation_key: ids.opReportCross, p_inspection_id: ids.reportCross, p_payload: reportPayload(deniedBytes, 'cross'),
  }, 'cross-tenant contractor');
  await rpcDenied(actors.homeowner.client, 'servsync_prepare_job_report_finalization', {
    p_operation_key: ids.opReportHomeowner, p_inspection_id: ids.reportHomeowner, p_payload: reportPayload(deniedBytes, 'homeowner'),
  }, 'homeowner report caller');

  const expiryBytes = Buffer.from(`%PDF-1.4\n${MARKER} expiry\n%%EOF\n`);
  const expiryArgs = { p_operation_key: ids.opReportExpiry, p_inspection_id: ids.reportExpiry, p_payload: reportPayload(expiryBytes, 'expiry') };
  const expiryBefore = await rpcOk(actors.owner.client, 'servsync_prepare_job_report_finalization', expiryArgs);
  dbQuery(`update public.servsync_core_record_finalization_operations set expires_at=now()-interval '1 minute' where operation_key='${ids.opReportExpiry}';`);
  const expiryAfter = await rpcOk(actors.owner.client, 'servsync_prepare_job_report_finalization', expiryArgs);
  assert.ok(Date.parse(expiryAfter.expires_at) > Date.now());
  assert.notEqual(expiryAfter.expires_at, expiryBefore.expires_at);

  const legacyBuffer = Buffer.from(`%PDF-1.4\n${MARKER} legacy compatibility\n%%EOF\n`);
  const legacyPath = `${actors.homeowner.id}/field-work/${ids.reportLegacy}/${randomUUID()}.pdf`;
  const legacyUpload = await actors.owner.client.storage.from(BUCKET).upload(legacyPath, legacyBuffer, { contentType: 'application/pdf', upsert: false });
  assert.equal(legacyUpload.error, null, 'legacy database-ahead report upload must remain available');
  storagePaths.add(legacyPath);
  await rpcOk(actors.owner.client, 'servsync_finalize_field_work', {
    p_inspection_id: ids.reportLegacy, p_rooms_with_findings: [], p_summary: `${MARKER} legacy summary`,
    p_storage_path: legacyPath, p_file_name: `${MARKER}-legacy.pdf`, p_file_size_bytes: legacyBuffer.length,
  });
  const legacyAdopt = await rpcOk(actors.owner.client, 'servsync_prepare_job_report_finalization', {
    p_operation_key: ids.opReportLegacy, p_inspection_id: ids.reportLegacy,
    p_payload: reportPayload(legacyBuffer, 'legacy', `${MARKER} legacy summary`),
  });
  assert.equal(legacyAdopt.status, 'succeeded');
  assert.equal(legacyAdopt.legacy_reconciled, true);
  assert.equal(legacyAdopt.storage_path, legacyPath);
  const legacyCounts = dbQuery(`select
    (select count(*) from public.home_documents where storage_path='${legacyPath}') documents,
    (select count(*) from public.home_maintenance_log where inspection_id='${ids.reportLegacy}') history,
    (select count(*) from public.servsync_core_record_finalization_operations where operation_key='${ids.opReportLegacy}' and status='succeeded') receipts,
    (select count(*) from storage.objects where bucket_id='${BUCKET}' and name='${legacyPath}') objects;`)[0];
  assert.deepEqual(legacyCounts, { documents: 1, history: 1, receipts: 1, objects: 1 });
}

async function testManualMatrix(actors) {
  const noDoc = manualPayload(null, 'manual no document');
  const noDocArgs = { p_operation_key: ids.opManualNoDoc, p_payload: noDoc };
  const [noDocA, noDocB] = await Promise.all([
    rpcOk(actors.homeowner.client, 'servsync_commit_manual_home_history_creation', noDocArgs),
    rpcOk(actors.homeowner2, 'servsync_commit_manual_home_history_creation', noDocArgs),
  ]);
  assert.equal(noDocA.maintenance_log_id, noDocB.maintenance_log_id);
  assert.equal(noDocA.document_id, null);
  const noDocReplay = await rpcOk(actors.homeowner2, 'servsync_commit_manual_home_history_creation', noDocArgs);
  assert.equal(noDocReplay.maintenance_log_id, noDocA.maintenance_log_id);
  assert.equal(noDocReplay.idempotent, true);
  await rpcDenied(actors.homeowner.client, 'servsync_prepare_manual_home_history_creation', {
    p_operation_key: ids.opManualNoDoc, p_payload: { ...noDoc, notes: `${MARKER} changed` },
  }, 'changed manual no-document payload', /different details/i);
  const deleteNoDoc = await actors.homeowner.client.from('home_maintenance_log').delete().eq('id', noDocA.maintenance_log_id).select('id');
  assert.equal(deleteNoDoc.error, null);
  assert.equal(deleteNoDoc.data?.length, 1);
  const noDocTombstone = await rpcOk(actors.homeowner.client, 'servsync_commit_manual_home_history_creation', noDocArgs);
  assert.equal(noDocTombstone.maintenance_log_id, noDocA.maintenance_log_id);
  const noDocState = dbQuery(`select
    (select count(*) from public.home_maintenance_log where id='${noDocA.maintenance_log_id}') history,
    (select count(*) from public.home_documents where notes like '%${MARKER} manual no document%') documents,
    (select count(*) from public.servsync_core_record_finalization_operations where operation_key='${ids.opManualNoDoc}' and status='succeeded' and result_id='${noDocA.maintenance_log_id}' and history_id is null) tombstones;`)[0];
  assert.deepEqual(noDocState, { history: 0, documents: 0, tombstones: 1 });

  const expiryPayload = manualPayload(null, 'manual expiry renewal');
  const expiryArgs = { p_operation_key: ids.opManualExpiry, p_payload: expiryPayload };
  const expiryBefore = await rpcOk(actors.homeowner.client, 'servsync_prepare_manual_home_history_creation', expiryArgs);
  dbQuery(`update public.servsync_core_record_finalization_operations set expires_at=now()-interval '1 minute' where operation_key='${ids.opManualExpiry}';`);
  const expiryAfter = await rpcOk(actors.homeowner2, 'servsync_prepare_manual_home_history_creation', expiryArgs);
  assert.ok(Date.parse(expiryAfter.expires_at) > Date.now());
  assert.notEqual(expiryAfter.expires_at, expiryBefore.expires_at);
  await rpcOk(actors.homeowner.client, 'servsync_commit_manual_home_history_creation', expiryArgs);

  const documentBuffer = Buffer.from(`%PDF-1.4\n${MARKER} manual receipt\n%%EOF\n`);
  const document = {
    file_name: `${MARKER}-manual-receipt.pdf`, content_type: 'application/pdf',
    file_size_bytes: documentBuffer.length, sha256: sha256(documentBuffer),
  };
  const withDocument = manualPayload(document, 'manual with document');
  const documentArgs = { p_operation_key: ids.opManualDocument, p_payload: withDocument };
  const prepared = await rpcOk(actors.homeowner.client, 'servsync_prepare_manual_home_history_creation', documentArgs);
  storagePaths.add(prepared.storage_path);
  const badUpload = await upload(actors.homeowner.client, prepared.storage_path, documentBuffer, 'application/pdf', randomUUID());
  assert.equal(badUpload.error, null);
  await rpcDenied(actors.homeowner.client, 'servsync_commit_manual_home_history_creation', documentArgs, 'invalid manual object metadata', /could not be verified/i);
  const rejected = dbQuery(`select
    (select count(*) from public.home_documents where storage_path='${prepared.storage_path}') documents,
    (select count(*) from public.home_maintenance_log where title='${withDocument.title}') history;`)[0];
  assert.deepEqual(rejected, { documents: 0, history: 0 });
  await removeStorage([prepared.storage_path]);
  const correctUpload = await upload(actors.homeowner.client, prepared.storage_path, documentBuffer, 'application/pdf', ids.opManualDocument);
  assert.equal(correctUpload.error, null);
  const [documentA, documentB] = await Promise.all([
    rpcOk(actors.homeowner.client, 'servsync_commit_manual_home_history_creation', documentArgs),
    rpcOk(actors.homeowner2, 'servsync_commit_manual_home_history_creation', documentArgs),
  ]);
  assert.equal(documentA.maintenance_log_id, documentB.maintenance_log_id);
  assert.equal(documentA.document_id, documentB.document_id);
  const documentReplay = await rpcOk(actors.homeowner2, 'servsync_commit_manual_home_history_creation', documentArgs);
  assert.equal(documentReplay.document_id, documentA.document_id);
  assert.equal(documentReplay.idempotent, true);
  const duplicateUpload = await upload(actors.homeowner.client, prepared.storage_path, documentBuffer, 'application/pdf', ids.opManualDocument);
  assert.ok(duplicateUpload.error, 'manual deterministic object must not be replaced');
  const ownerRead = await actors.homeowner.client.storage.from(BUCKET).download(prepared.storage_path);
  assert.equal(ownerRead.error, null);

  for (const [label, actor] of [
    ['shared admin', actors.sharedAdmin], ['shared member', actors.sharedMember], ['shared viewer', actors.sharedViewer],
  ]) {
    await rpcDenied(actor.client, 'servsync_prepare_manual_home_history_creation', {
      p_operation_key: randomUUID(), p_payload: manualPayload(null, `${label} denied`),
    }, label);
    const historyRead = await actor.client.from('home_maintenance_log').select('id').eq('id', documentA.maintenance_log_id);
    assert.equal(historyRead.error, null);
    assert.equal(historyRead.data?.length, 0, `${label} must not read private Home History`);
    const documentRead = await actor.client.from('home_documents').select('id').eq('id', documentA.document_id);
    assert.equal(documentRead.error, null);
    assert.equal(documentRead.data?.length, 0, `${label} must not read private documents`);
    await assertStorageDenied(actor.client, prepared.storage_path, label);
  }
  await rpcDenied(actors.homeownerB.client, 'servsync_prepare_manual_home_history_creation', {
    p_operation_key: randomUUID(), p_payload: manualPayload(null, 'cross homeowner denied'),
  }, 'cross-homeowner');
  const primaryHome = await actors.homeowner.client.from('homes').select('id').eq('id', ids.home).single();
  assert.equal(primaryHome.error, null, 'primary homeowner ownership must remain available');

  const deleteDocumentHistory = await actors.homeowner.client.from('home_maintenance_log').delete().eq('id', documentA.maintenance_log_id).select('id');
  assert.equal(deleteDocumentHistory.error, null);
  assert.equal(deleteDocumentHistory.data?.length, 1);
  const documentTombstone = await rpcOk(actors.homeowner.client, 'servsync_commit_manual_home_history_creation', documentArgs);
  assert.equal(documentTombstone.maintenance_log_id, documentA.maintenance_log_id);
  assert.equal(documentTombstone.document_id, documentA.document_id);
  const documentState = dbQuery(`select
    (select count(*) from public.home_maintenance_log where id='${documentA.maintenance_log_id}') history,
    (select count(*) from public.home_documents where id='${documentA.document_id}' and storage_path='${prepared.storage_path}') documents,
    (select count(*) from public.servsync_core_record_finalization_operations where operation_key='${ids.opManualDocument}' and status='succeeded' and result_id='${documentA.maintenance_log_id}' and history_id is null) tombstones,
    (select count(*) from storage.objects where bucket_id='${BUCKET}' and name='${prepared.storage_path}') objects;`)[0];
  assert.deepEqual(documentState, { history: 0, documents: 1, tombstones: 1, objects: 1 });
  await rpcDenied(actors.homeowner.client, 'servsync_prepare_manual_home_history_creation', {
    p_operation_key: ids.opManualDocument, p_payload: { ...withDocument, cost_cents: 4201 },
  }, 'changed manual document payload', /different details/i);
}

async function cleanup() {
  cleanupStarted = true;
  const cleanupErrors = [];
  try {
    await removeStorage([...storagePaths]);
  } catch (error) {
    cleanupErrors.push(error);
  }
  for (const actor of sessions) await actor.auth.signOut().catch(() => undefined);
  for (const userId of [...createdUsers].reverse()) {
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error) cleanupErrors.push(new Error(`Auth lifecycle cleanup failed for exact fixture identity: ${error.message}`));
  }
  createdUsers.length = 0;
  try {
    assertZeroResidue(dbQuery(markerResidueQuery())[0], 'post-cleanup');
    const baselineAfter = dbQuery(baselineQuery());
    assert.deepEqual(baselineAfter, baselineBefore, 'pre-existing Sandbox counts/fingerprints must remain exact');
  } catch (error) {
    cleanupErrors.push(error);
  }
  if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, 'Exact cleanup or preservation verification failed.');
}

async function run() {
  const definitions = preflight();
  const { anonKey, serviceRoleKey } = loadKeys();
  service = client(serviceRoleKey);
  let runtimeError;
  try {
    const actors = await setupFixtures(anonKey);
    await testReportMatrix(actors);
    await testManualMatrix(actors);
  } catch (error) {
    runtimeError = error;
  }
  try {
    await cleanup();
  } catch (cleanupError) {
    throw new AggregateError([runtimeError, cleanupError].filter(Boolean), 'Sandbox runtime or exact cleanup failed. Stop immediately.');
  }
  if (runtimeError) throw runtimeError;
  const postDefinitions = dbQuery(definitionQuery());
  assert.deepEqual(postDefinitions, definitions, 'installed function definitions must remain unchanged');
  console.log(JSON.stringify({
    status: 'passed',
    project_ref: PROJECT_REF,
    head: EXPECTED_HEAD,
    migration_sha256: EXPECTED_MIGRATION_SHA,
    runtime_matrix: 'complete',
    storage_cleanup: 'supabase-api',
    fixture_residue: 0,
    preservation: 'exact',
  }, null, 2));
}

run().catch(error => {
  const message = error instanceof AggregateError
    ? `${error.message} ${error.errors.map(item => item?.message).filter(Boolean).join(' ')}`
    : error?.message;
  console.error(message || 'Sandbox runtime validation failed.');
  if (!cleanupStarted) console.error('Cleanup did not start; stop immediately.');
  process.exitCode = 1;
});
