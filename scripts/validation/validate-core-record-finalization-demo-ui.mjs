import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const PROJECT_REF = 'bdytwgejqnlblhrnqxkp';
const MERGE_HEAD = '6d28655ac5a81eb8fb1b243161b164e8d4d7acc3';
const MARKER = 'FB039E2UI1';
const EMAIL_PREFIX = 'fb039e2ui1-';
const STATE_PATH = '/tmp/servsync-fb039e2-demo-ui-state.json';
const BUCKET = 'home-documents';
const ids = {
  contractor: 'f039e205-0000-4000-8000-000000000101',
  home: 'f039e205-0000-4000-8000-000000000201',
  job: 'f039e205-0000-4000-8000-000000000301',
};
const actors = {
  contractor: {
    email: `${EMAIL_PREFIX}contractor@example.invalid`,
    password: 'UI1-Contractor-Only!8265',
    role: 'contractor',
  },
  homeowner: {
    email: `${EMAIL_PREFIX}homeowner@example.invalid`,
    password: 'UI1-Homeowner-Only!8265',
    role: 'homeowner',
  },
};
const materialHashes = {
  'servsync-core-record-finalization-durable-idempotency.sql': 'b864e61a693ed881eb2abf497adf1833c48cd9803f185ac393e4f8f420fb4461',
  'servsync-core-record-finalization-legacy-retirement.sql': 'edde0d89c5513cf36e4773ddb798261cf26dd1a4095c59f03875f2b716ce5289',
};

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

function client(key) {
  return createClient(`https://${PROJECT_REF}.supabase.co`, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function loadKeys() {
  const keys = JSON.parse(cli(['projects', 'api-keys', '--project-ref', PROJECT_REF, '--output', 'json']));
  const anonKey = keys.find(item => item.name === 'anon')?.api_key;
  const serviceRoleKey = keys.find(item => item.name === 'service_role')?.api_key;
  assert.ok(anonKey && serviceRoleKey, 'Demo API keys must be available in memory.');
  return { anonKey, serviceRoleKey };
}

function baselineQuery() {
  return `begin;
    create temp table servsync_finalization_fingerprints(
      label text primary key, count bigint, fingerprint text
    ) on commit drop;
    do $fingerprints$
    declare relation record;
    begin
      for relation in select schemaname, tablename from pg_tables where schemaname = 'public'
      loop
        execute format(
          'insert into servsync_finalization_fingerprints select %L,count(*)::bigint,md5(coalesce(string_agg(md5(to_jsonb(row_value)::text),'''' order by md5(to_jsonb(row_value)::text)),'''')) from %I.%I row_value',
          relation.schemaname || '.' || relation.tablename, relation.schemaname, relation.tablename
        );
      end loop;
    end
    $fingerprints$;
    insert into servsync_finalization_fingerprints
    select 'auth.users', count(*), md5(coalesce(string_agg(
      md5((to_jsonb(row_value) - 'encrypted_password' - 'confirmation_token' - 'recovery_token'
        - 'email_change_token_new' - 'email_change' - 'email_change_token_current'
        - 'reauthentication_token' - 'phone_change_token' - 'phone_change')::text),
      '' order by id), '')) from auth.users row_value;
    insert into servsync_finalization_fingerprints
    select 'auth.identities', count(*), md5(coalesce(string_agg(
      md5((to_jsonb(row_value) - 'identity_data')::text), '' order by id), '')) from auth.identities row_value;
    insert into servsync_finalization_fingerprints
    select 'storage.buckets', count(*), md5(coalesce(string_agg(md5(to_jsonb(row_value)::text), '' order by id), '')) from storage.buckets row_value;
    insert into servsync_finalization_fingerprints
    select 'storage.objects', count(*), md5(coalesce(string_agg(md5(to_jsonb(row_value)::text), '' order by id), '')) from storage.objects row_value;
    select label, count, fingerprint from servsync_finalization_fingerprints order by label;
    rollback;`;
}

function residueQuery() {
  return `select
    (select count(*) from auth.users where email like '${EMAIL_PREFIX}%') auth_users,
    (select count(*) from public.profiles where email like '${EMAIL_PREFIX}%') profiles,
    (select count(*) from public.contractor_profiles where id='${ids.contractor}') contractors,
    (select count(*) from public.homes where id='${ids.home}') homes,
    (select count(*) from public.inspections where id='${ids.job}') jobs,
    (select count(*) from public.servsync_core_record_finalization_operations where contractor_id='${ids.contractor}' or home_id='${ids.home}' or job_id='${ids.job}' or subject_id='${ids.job}') receipts,
    (select count(*) from public.home_documents where file_name like '${MARKER}%' or id in (select nullif(result_payload->>'document_id','')::uuid from public.servsync_core_record_finalization_operations where contractor_id='${ids.contractor}' or home_id='${ids.home}')) documents,
    (select count(*) from public.home_maintenance_log where title like '${MARKER}%' or inspection_id='${ids.job}') history,
    (select count(*) from public.notifications where id in (select nullif(result_payload->>'notification_id','')::uuid from public.servsync_core_record_finalization_operations where job_id='${ids.job}')) notifications,
    (select count(*) from storage.objects where bucket_id='${BUCKET}' and name in (select storage_manifest->>'storage_path' from public.servsync_core_record_finalization_operations where contractor_id='${ids.contractor}' or home_id='${ids.home}')) objects;`;
}

function assertZero(row, label) {
  for (const [key, value] of Object.entries(row ?? {})) {
    assert.equal(Number(value), 0, `${label}: ${key} residue must be zero`);
  }
}

function preflight() {
  assert.equal(readFileSync('supabase/.temp/project-ref', 'utf8').trim(), PROJECT_REF, 'linked backend must be Demo');
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  execFileSync('git', ['merge-base', '--is-ancestor', MERGE_HEAD, head]);
  for (const [path, expected] of Object.entries(materialHashes)) {
    assert.equal(sha256(readFileSync(path)), expected, `${path} hash mismatch`);
  }
  const remote = JSON.parse(cli(['projects', 'list', '--output', 'json']))
    .find(project => project.id === PROJECT_REF);
  assert.deepEqual({ id: remote?.id, name: remote?.name, status: remote?.status }, {
    id: PROJECT_REF, name: 'ServSync Demo', status: 'ACTIVE_HEALTHY',
  });
}

async function insertOne(service, table, value) {
  const { data, error } = await service.from(table).insert(value).select('*').single();
  if (error) throw new Error(`Could not create ${table}: ${error.message}`);
  return data;
}

async function setup() {
  preflight();
  assertZero(dbQuery(residueQuery())[0], 'preflight');
  const baseline = dbQuery(baselineQuery());
  const { serviceRoleKey } = loadKeys();
  const service = client(serviceRoleKey);
  const userIds = {};
  try {
    for (const [name, actor] of Object.entries(actors)) {
      const { data, error } = await service.auth.admin.createUser({
        email: actor.email, password: actor.password, email_confirm: true,
        user_metadata: { full_name: `${MARKER} ${name}`, role: actor.role },
      });
      if (error || !data.user) throw new Error(`Could not create ${name} Auth fixture.`);
      userIds[name] = data.user.id;
      const { error: profileError } = await service.from('profiles').update({
        role: actor.role, full_name: `${MARKER} ${name}`,
      }).eq('id', data.user.id);
      if (profileError) throw new Error(`Could not normalize ${name} profile.`);
    }
    await insertOne(service, 'contractor_profiles', {
      id: ids.contractor, owner_user_id: userIds.contractor,
      business_name: `${MARKER} Contractor`, slug: 'fb039e2ui1-contractor',
      contact_name: `${MARKER} Contractor`, email: actors.contractor.email,
    });
    await insertOne(service, 'homes', {
      id: ids.home, homeowner_user_id: userIds.homeowner,
      nickname: `${MARKER} Home`, address_line1: '392 Reliability Lane',
      city: 'Testville', state: 'TX', zip_code: '75001', home_type: 'Single family',
    });
    await insertOne(service, 'inspections', {
      id: ids.job, contractor_id: ids.contractor, homeowner_user_id: userIds.homeowner,
      home_id: ids.home, name: `${MARKER} Completed Job`, status: 'draft',
      job_status: 'completed', job_origin: 'direct',
      summary: `${MARKER} completed through deployed Demo application observation.`,
      rooms_with_findings: [{
        room: 'Kitchen', findings: [{ title: `${MARKER} Faucet repair`, status: 'Fixed On Site', action: 'Completed.', notes: `${MARKER} fictional work` }],
      }],
    });
    writeFileSync(STATE_PATH, JSON.stringify({ baseline, userIds, ids, created_at: new Date().toISOString() }));
    console.log(JSON.stringify({ status: 'ready', marker: MARKER, job_id: ids.job, users: Object.keys(userIds) }));
  } catch (error) {
    for (const id of Object.values(userIds).reverse()) await service.auth.admin.deleteUser(id).catch(() => undefined);
    throw error;
  }
}

function observationQuery() {
  return `select
    (select count(*) from public.inspections where id='${ids.job}' and status='finalized' and job_status='completed' and report_storage_path is not null) finalized_jobs,
    (select count(*) from public.home_documents where id in (select nullif(result_payload->>'document_id','')::uuid from public.servsync_core_record_finalization_operations where job_id='${ids.job}')) report_documents,
    (select count(*) from public.home_maintenance_log where inspection_id='${ids.job}') report_history,
    (select count(*) from public.notifications where id in (select nullif(result_payload->>'notification_id','')::uuid from public.servsync_core_record_finalization_operations where job_id='${ids.job}' and status='succeeded')) report_notifications,
    (select count(*) from public.servsync_core_record_finalization_operations where operation_type='job_report_finalize' and subject_id='${ids.job}' and status='succeeded') report_receipts,
    (select count(*) from public.home_maintenance_log where home_id='${ids.home}' and title='${MARKER} Manual no document') manual_without_document,
    (select count(*) from public.home_maintenance_log where home_id='${ids.home}' and title='${MARKER} Manual with document' and invoice_document_id is not null) manual_with_document,
    (select count(*) from public.home_documents where home_id='${ids.home}' and file_name like '${MARKER}%') manual_documents,
    (select count(*) from public.servsync_core_record_finalization_operations where operation_type='manual_home_history_create' and home_id='${ids.home}' and status='succeeded') manual_receipts,
    (select count(*) from storage.objects object where bucket_id='${BUCKET}' and exists (select 1 from public.home_documents document where document.storage_path=object.name and document.id in (select nullif(result_payload->>'document_id','')::uuid from public.servsync_core_record_finalization_operations where contractor_id='${ids.contractor}' or home_id='${ids.home}'))) registered_objects,
    (select count(*) from storage.objects object where bucket_id='${BUCKET}' and object.name in (select storage_manifest->>'storage_path' from public.servsync_core_record_finalization_operations where contractor_id='${ids.contractor}' or home_id='${ids.home}') and not exists (select 1 from public.home_documents document where document.storage_path=object.name)) orphan_objects;`;
}

async function verify() {
  preflight();
  const row = dbQuery(observationQuery())[0];
  assert.deepEqual(row, {
    finalized_jobs: 1, report_documents: 1, report_history: 1, report_notifications: 1,
    report_receipts: 1, manual_without_document: 1, manual_with_document: 1,
    manual_documents: 1, manual_receipts: 2, registered_objects: 2, orphan_objects: 0,
  });
  console.log(JSON.stringify({ status: 'passed', observation: row }, null, 2));
}

async function cleanup() {
  preflight();
  const state = JSON.parse(readFileSync(STATE_PATH, 'utf8'));
  const { serviceRoleKey } = loadKeys();
  const service = client(serviceRoleKey);
  const paths = dbQuery(`select storage_path from public.home_documents where file_name like '${MARKER}%' or id in (select nullif(result_payload->>'document_id','')::uuid from public.servsync_core_record_finalization_operations where contractor_id='${ids.contractor}' or home_id='${ids.home}')`)
    .map(row => row.storage_path).filter(Boolean);
  if (paths.length) {
    const { error } = await service.storage.from(BUCKET).remove(paths);
    if (error) throw new Error(`Exact Storage API cleanup failed: ${error.message}`);
  }
  for (const id of Object.values(state.userIds).reverse()) {
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) throw new Error(`Auth lifecycle cleanup failed: ${error.message}`);
  }
  assertZero(dbQuery(residueQuery())[0], 'post-cleanup');
  assert.deepEqual(dbQuery(baselineQuery()), state.baseline, 'pre-existing Demo fingerprints must remain exact');
  unlinkSync(STATE_PATH);
  console.log(JSON.stringify({ status: 'clean', fixture_residue: 0, preservation: 'exact', storage_cleanup: 'supabase-api', auth_cleanup: 'lifecycle' }));
}

const mode = process.argv[2];
if (!['--setup', '--verify', '--cleanup'].includes(mode)) {
  throw new Error('Refusing Demo mutation. Supply one explicit approved mode.');
}
if (mode === '--setup') await setup();
if (mode === '--verify') await verify();
if (mode === '--cleanup') await cleanup();
