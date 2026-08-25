import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (!process.argv.includes('--execute-sandbox-retirement')) {
  throw new Error('Refusing shared Sandbox mutation without the explicit approved retirement-runtime flag.');
}

const PROJECT_REF = 'zpzdkoaubyjtsomccxya';
const MERGE_HEAD = '6d28655ac5a81eb8fb1b243161b164e8d4d7acc3';
const MARKER = 'FB039E2RT3';
const EMAIL_PREFIX = 'fb039e2rt3-';
const BUCKET = 'home-documents';
const ids = {
  contractor: 'f039e206-0000-4000-8000-000000000101',
  home: 'f039e206-0000-4000-8000-000000000201',
  job: 'f039e206-0000-4000-8000-000000000301',
  operation: 'f039e206-0000-4000-8000-000000000601',
};
const hashes = {
  'servsync-core-record-finalization-durable-idempotency.sql': 'b864e61a693ed881eb2abf497adf1833c48cd9803f185ac393e4f8f420fb4461',
  'servsync-core-record-finalization-legacy-retirement.sql': 'edde0d89c5513cf36e4773ddb798261cf26dd1a4095c59f03875f2b716ce5289',
};
const createdUsers = [];
const sessions = [];
const storagePaths = new Set();
let service;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function cli(args) {
  return execFileSync('supabase', args, {
    cwd: process.cwd(), encoding: 'utf8', maxBuffer: 30 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function dbQuery(sql) {
  return JSON.parse(cli(['db', 'query', '--linked', '--output', 'json', sql])).rows ?? [];
}

function dbFile(path) {
  return JSON.parse(cli(['db', 'query', '--linked', '--file', path, '--output', 'json'])).rows ?? [];
}

function client(key) {
  return createClient(`https://${PROJECT_REF}.supabase.co`, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function loadKeys() {
  const keys = JSON.parse(cli(['projects', 'api-keys', '--project-ref', PROJECT_REF, '--output', 'json']));
  const anonKey = keys.find(item => item.name === 'anon')?.api_key;
  const serviceRoleKey = keys.find(item => item.name === 'service_role')?.api_key;
  assert.ok(anonKey && serviceRoleKey, 'Sandbox API keys must be available in memory.');
  return { anonKey, serviceRoleKey };
}

function residueQuery() {
  return `select
    (select count(*) from auth.users where email like '${EMAIL_PREFIX}%') auth_users,
    (select count(*) from public.profiles where email like '${EMAIL_PREFIX}%') profiles,
    (select count(*) from public.contractor_profiles where id='${ids.contractor}') contractors,
    (select count(*) from public.homes where id='${ids.home}') homes,
    (select count(*) from public.inspections where id='${ids.job}') jobs,
    (select count(*) from public.servsync_core_record_finalization_operations where operation_key='${ids.operation}') receipts,
    (select count(*) from public.home_documents where storage_path like '%/${ids.job}/%') documents,
    (select count(*) from public.home_maintenance_log where inspection_id='${ids.job}') history,
    (select count(*) from storage.objects where bucket_id='${BUCKET}' and name like '%/${ids.job}/%') objects;`;
}

function assertZero(row, label) {
  for (const [key, value] of Object.entries(row ?? {})) {
    assert.equal(Number(value), 0, `${label}: ${key} residue must be zero`);
  }
}

function preflight() {
  assert.equal(readFileSync('supabase/.temp/project-ref', 'utf8').trim(), PROJECT_REF, 'linked backend must be Sandbox');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  execFileSync('git', ['merge-base', '--is-ancestor', MERGE_HEAD, head]);
  for (const [path, expected] of Object.entries(hashes)) assert.equal(sha256(readFileSync(path)), expected, `${path} hash mismatch`);
  const catalog = dbQuery(`select
    (to_regprocedure('public.servsync_finalize_field_work(uuid,jsonb,text,text,text,integer)') is not null) legacy_function,
    (to_regprocedure('public.servsync_can_upload_field_work_report_path(text)') is not null) legacy_upload_function,
    has_function_privilege('authenticated','public.servsync_finalize_field_work(uuid,jsonb,text,text,text,integer)','execute') legacy_authenticated,
    has_function_privilege('service_role','public.servsync_finalize_field_work(uuid,jsonb,text,text,text,integer)','execute') legacy_service,
    has_function_privilege('authenticated','public.servsync_can_upload_field_work_report_path(text)','execute') legacy_upload_authenticated,
    (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname='home_docs_upload_contractor_field_work_reports') legacy_policy,
    (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname='home_docs_upload_prepared_record_finalizations') prepared_policy;`)[0];
  assert.deepEqual(catalog, {
    legacy_function: true, legacy_upload_function: true, legacy_authenticated: false,
    legacy_service: false, legacy_upload_authenticated: false, legacy_policy: 0, prepared_policy: 1,
  });
  assertZero(dbQuery(residueQuery())[0], 'preflight');
}

async function createUser(name, role, anonKey) {
  const email = `${EMAIL_PREFIX}${name}@example.invalid`;
  const password = `RT3-${name}-Only!8265`;
  const { data, error } = await service.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name: `${MARKER} ${name}`, role },
  });
  if (error || !data.user) throw new Error(`Could not create ${name} Auth fixture.`);
  createdUsers.push(data.user.id);
  const { error: profileError } = await service.from('profiles').update({ role, full_name: `${MARKER} ${name}` }).eq('id', data.user.id);
  if (profileError) throw new Error(`Could not normalize ${name} profile.`);
  const actor = client(anonKey);
  const signed = await actor.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.user) throw new Error(`Could not authenticate ${name} fixture.`);
  sessions.push(actor);
  return { id: data.user.id, client: actor };
}

async function insertOne(table, value) {
  const { data, error } = await service.from(table).insert(value).select('*').single();
  if (error) throw new Error(`Could not create ${table}: ${error.message}`);
  return data;
}

async function rpcOk(actor, name, args) {
  const { data, error } = await actor.rpc(name, args);
  if (error) throw new Error(`${name} failed: ${error.message}`);
  return data;
}

async function setup(anonKey) {
  const owner = await createUser('contractor', 'contractor', anonKey);
  const homeowner = await createUser('homeowner', 'homeowner', anonKey);
  await insertOne('contractor_profiles', {
    id: ids.contractor, owner_user_id: owner.id, business_name: `${MARKER} Contractor`,
    slug: 'fb039e2rt3-contractor', contact_name: `${MARKER} Contractor`, email: `${EMAIL_PREFIX}contractor@example.invalid`,
  });
  await insertOne('homes', {
    id: ids.home, homeowner_user_id: homeowner.id, nickname: `${MARKER} Home`,
    address_line1: '393 Reliability Lane', city: 'Testville', state: 'TX', zip_code: '75001', home_type: 'Single family',
  });
  await insertOne('inspections', {
    id: ids.job, contractor_id: ids.contractor, homeowner_user_id: homeowner.id, home_id: ids.home,
    name: `${MARKER} Job`, status: 'draft', job_status: 'completed', job_origin: 'direct',
    summary: `${MARKER} durable retirement proof`,
    rooms_with_findings: [{ room: 'Kitchen', findings: [{ title: `${MARKER} repair`, status: 'Fixed On Site', action: 'Completed.' }] }],
  });
  return { owner, homeowner };
}

async function runDurable({ owner, homeowner }) {
  const bytes = Buffer.from(`%PDF-1.4\n${MARKER} durable report\n%%EOF\n`);
  const payload = {
    rooms_with_findings: [{ room: 'Kitchen', findings: [{ title: `${MARKER} repair`, status: 'Fixed On Site', action: 'Completed.' }] }],
    summary: `${MARKER} durable retirement proof`, file_name: `${MARKER}-report.pdf`,
    file_size_bytes: bytes.length, file_sha256: sha256(bytes),
    include_summary: true, include_value_add: false, value_add_text: '',
  };
  const args = { p_operation_key: ids.operation, p_inspection_id: ids.job, p_payload: payload };
  const prepared = await rpcOk(owner.client, 'servsync_prepare_job_report_finalization', args);
  assert.equal(prepared.status, 'prepared');
  storagePaths.add(prepared.storage_path);
  const uploaded = await owner.client.storage.from(BUCKET).upload(prepared.storage_path, bytes, {
    contentType: 'application/pdf', upsert: false,
    metadata: { servsync_sha256: payload.file_sha256, servsync_operation_key: ids.operation },
  });
  assert.equal(uploaded.error, null, 'receipt-bound Storage upload must succeed');
  const committed = await rpcOk(owner.client, 'servsync_commit_job_report_finalization', args);
  const replay = await rpcOk(owner.client, 'servsync_commit_job_report_finalization', args);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.document_id, committed.document_id);
  assert.equal(replay.maintenance_log_id, committed.maintenance_log_id);
  assert.equal(replay.notification_id, committed.notification_id);
  const homeownerRead = await homeowner.client.storage.from(BUCKET).download(prepared.storage_path);
  assert.equal(homeownerRead.error, null, 'primary homeowner report read visibility must remain established');

  const legacy = await owner.client.rpc('servsync_finalize_field_work', {
    p_inspection_id: ids.job, p_rooms_with_findings: [], p_summary: MARKER,
    p_report_storage_path: prepared.storage_path, p_report_file_name: `${MARKER}.pdf`, p_report_file_size_bytes: bytes.length,
  });
  assert.ok(legacy.error, 'legacy finalizer must be denied');
  assert.match(legacy.error.message, /permission|schema cache|could not find|not found/i);

  const legacyPath = `${homeowner.id}/field-work/${ids.job}/legacy-${MARKER}.pdf`;
  const legacyUpload = await owner.client.storage.from(BUCKET).upload(legacyPath, bytes, { contentType: 'application/pdf', upsert: false });
  if (!legacyUpload.error) {
    storagePaths.add(legacyPath);
    throw new Error('Legacy report-upload bypass unexpectedly succeeded.');
  }

  const canonical = dbQuery(`select
    (select count(*) from public.inspections where id='${ids.job}' and status='finalized' and report_storage_path='${prepared.storage_path}') jobs,
    (select count(*) from public.home_documents where id='${committed.document_id}' and storage_path='${prepared.storage_path}') documents,
    (select count(*) from public.home_maintenance_log where inspection_id='${ids.job}' and report_document_id='${committed.document_id}') history,
    (select count(*) from public.notifications where id='${committed.notification_id}' and user_id='${homeowner.id}') notifications,
    (select count(*) from public.servsync_core_record_finalization_operations where operation_key='${ids.operation}' and status='succeeded') receipts,
    (select count(*) from storage.objects where bucket_id='${BUCKET}' and name='${prepared.storage_path}') objects;`)[0];
  assert.deepEqual(canonical, { jobs: 1, documents: 1, history: 1, notifications: 1, receipts: 1, objects: 1 });
  return canonical;
}

async function cleanup(baseline) {
  const exact = [...storagePaths];
  if (exact.length) {
    const removed = await service.storage.from(BUCKET).remove(exact);
    if (removed.error) throw new Error(`Exact Storage API cleanup failed: ${removed.error.message}`);
  }
  for (const actor of sessions) await actor.auth.signOut().catch(() => undefined);
  for (const id of [...createdUsers].reverse()) {
    const deleted = await service.auth.admin.deleteUser(id);
    if (deleted.error) throw new Error(`Auth lifecycle cleanup failed: ${deleted.error.message}`);
  }
  assertZero(dbQuery(residueQuery())[0], 'post-cleanup');
  assert.deepEqual(dbFile('tests/sql/core-record-finalization-environment-fingerprint.sql'), baseline, 'Sandbox pre-existing fingerprints must remain exact');
}

preflight();
const baseline = dbFile('tests/sql/core-record-finalization-environment-fingerprint.sql');
const { anonKey, serviceRoleKey } = loadKeys();
service = client(serviceRoleKey);
let runtimeError;
let canonical;
try {
  const fixture = await setup(anonKey);
  canonical = await runDurable(fixture);
} catch (error) {
  runtimeError = error;
}
try {
  await cleanup(baseline);
} catch (cleanupError) {
  throw new AggregateError([runtimeError, cleanupError].filter(Boolean), 'Sandbox retirement runtime or exact cleanup failed.');
}
if (runtimeError) throw runtimeError;
console.log(JSON.stringify({
  status: 'passed', target: 'Sandbox', project_ref: PROJECT_REF,
  durable_report: canonical, legacy_rpc: 'denied', legacy_upload: 'denied',
  fixture_residue: 0, preservation: 'exact', storage_cleanup: 'supabase-api', auth_cleanup: 'lifecycle',
}, null, 2));
