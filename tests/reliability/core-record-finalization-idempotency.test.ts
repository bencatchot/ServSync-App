import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  createManualHomeHistoryDurably,
  finalizeJobReportDurably,
  type JobReportFinalizationPayload,
  type ManualHomeHistoryPayload,
} from '../../src/features/reliability/recordFinalization';

const migrationUrl = new URL('../../servsync-core-record-finalization-durable-idempotency.sql', import.meta.url);
const retirementMigrationUrl = new URL('../../servsync-core-record-finalization-legacy-retirement.sql', import.meta.url);
const sandboxHarnessUrl = new URL('../../scripts/validation/validate-core-record-finalization-sandbox-runtime.mjs', import.meta.url);
const demoUiHarnessUrl = new URL('../../scripts/validation/validate-core-record-finalization-demo-ui.mjs', import.meta.url);
const sandboxRetirementHarnessUrl = new URL('../../scripts/validation/validate-core-record-finalization-sandbox-retirement-runtime.mjs', import.meta.url);
const environmentFingerprintUrl = new URL('../../tests/sql/core-record-finalization-environment-fingerprint.sql', import.meta.url);
const packageUrl = new URL('../../package.json', import.meta.url);

async function migrationSource() {
  return readFile(migrationUrl, 'utf8');
}

async function retirementMigrationSource() {
  return readFile(retirementMigrationUrl, 'utf8');
}

function functionBody(sql: string, functionName: string) {
  const match = new RegExp(`create(?: or replace)? function public\\.${functionName}\\b`, 'i').exec(sql);
  const start = match?.index ?? -1;
  assert.ok(start >= 0, `${functionName} must be defined`);
  const remainder = sql.slice(start + 1);
  const nextMatch = /\ncreate(?: or replace)? function public\./i.exec(remainder);
  const next = nextMatch ? start + 1 + nextMatch.index : -1;
  return sql.slice(start, next < 0 ? sql.length : next);
}

const reportPayload: JobReportFinalizationPayload = {
  rooms_with_findings: [],
  summary: 'Completed work',
  file_name: 'job-report.pdf',
  file_size_bytes: 12,
  file_sha256: 'c'.repeat(64),
  include_summary: true,
  include_value_add: false,
  value_add_text: '',
};

const historyPayload: ManualHomeHistoryPayload = {
  service_request_id: null,
  home_id: 'home-1',
  category: 'Plumbing',
  title: 'Replaced faucet',
  description: 'Installed replacement faucet.',
  performed_at: '2026-08-24',
  contractor_name: 'Example Contractor',
  cost_cents: 12500,
  notes: 'Warranty retained.',
  document: null,
};

test('lost report-finalization response reconciles succeeded receipt before another upload', async () => {
  const rpcNames: string[] = [];
  const supabase = {
    rpc: async (name: string, payload: unknown) => {
      rpcNames.push(name);
      assert.deepEqual(payload, {
        p_operation_key: 'operation-1',
        p_inspection_id: 'job-1',
        p_payload: reportPayload,
      });
      return { data: { status: 'succeeded', document_id: 'document-1', maintenance_log_id: 'history-1' }, error: null };
    },
    storage: {
      from: () => ({ upload: async () => assert.fail('a reconciled report must not upload again') }),
    },
  } as unknown as SupabaseClient;

  const result = await finalizeJobReportDurably(
    supabase,
    'operation-1',
    'job-1',
    reportPayload,
    new Blob(['report'], { type: 'application/pdf' }),
  );

  assert.deepEqual(rpcNames, ['servsync_prepare_job_report_finalization']);
  assert.equal(result?.document_id, 'document-1');
  assert.equal(result?.maintenance_log_id, 'history-1');
});

test('report retry reuses a duplicate deterministic upload and commits the canonical prepared operation', async () => {
  const rpcNames: string[] = [];
  const uploads: Array<{ bucket: string; path: string; options: unknown }> = [];
  const supabase = {
    rpc: async (name: string, payload: Record<string, unknown>) => {
      rpcNames.push(name);
      if (name === 'servsync_prepare_job_report_finalization') {
        assert.equal(payload.p_operation_key, 'operation-2');
        return {
          data: {
            status: 'prepared',
            operation_key: 'canonical-operation-2',
            storage_path: 'reports/operations/canonical-operation-2/report.pdf',
            file_sha256: 'd'.repeat(64),
          },
          error: null,
        };
      }
      assert.equal(name, 'servsync_commit_job_report_finalization');
      assert.equal(payload.p_operation_key, 'canonical-operation-2');
      return { data: { status: 'succeeded', document_id: 'document-2' }, error: null };
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _body: Blob, options: unknown) => {
          uploads.push({ bucket, path, options });
          return { error: { statusCode: '409', message: 'The resource already exists' } };
        },
      }),
    },
  } as unknown as SupabaseClient;

  const result = await finalizeJobReportDurably(
    supabase,
    'operation-2',
    'job-2',
    reportPayload,
    new Blob(['report'], { type: 'application/pdf' }),
  );

  assert.deepEqual(rpcNames, [
    'servsync_prepare_job_report_finalization',
    'servsync_commit_job_report_finalization',
  ]);
  assert.deepEqual(uploads, [{
    bucket: 'home-documents',
    path: 'reports/operations/canonical-operation-2/report.pdf',
    options: {
      contentType: 'application/pdf',
      upsert: false,
      metadata: {
        servsync_operation_key: 'canonical-operation-2',
        servsync_sha256: 'c'.repeat(64),
      },
    },
  }]);
  assert.equal(result?.document_id, 'document-2');
});

test('manual Home History without a document prepares and commits without Storage activity', async () => {
  const rpcNames: string[] = [];
  const supabase = {
    rpc: async (name: string, payload: unknown) => {
      rpcNames.push(name);
      assert.deepEqual(payload, { p_operation_key: 'history-operation-1', p_payload: historyPayload });
      return name === 'servsync_prepare_manual_home_history_creation'
        ? { data: { status: 'prepared' }, error: null }
        : { data: { status: 'succeeded', maintenance_log_id: 'history-1', document_id: null }, error: null };
    },
    storage: {
      from: () => ({ upload: async () => assert.fail('document-free Home History must not upload') }),
    },
  } as unknown as SupabaseClient;

  const result = await createManualHomeHistoryDurably(supabase, 'history-operation-1', historyPayload);

  assert.deepEqual(rpcNames, [
    'servsync_prepare_manual_home_history_creation',
    'servsync_commit_manual_home_history_creation',
  ]);
  assert.equal(result?.maintenance_log_id, 'history-1');
  assert.equal(result?.document_id, null);
});

test('lost manual Home History response returns canonical success before re-uploading its document', async () => {
  const payload: ManualHomeHistoryPayload = {
    ...historyPayload,
    document: {
      file_name: 'receipt.pdf',
      content_type: 'application/pdf',
      file_size_bytes: 7,
      sha256: 'a'.repeat(64),
    },
  };
  const supabase = {
    rpc: async (name: string) => {
      assert.equal(name, 'servsync_prepare_manual_home_history_creation');
      return { data: { status: 'succeeded', maintenance_log_id: 'history-2', document_id: 'document-2' }, error: null };
    },
    storage: {
      from: () => ({ upload: async () => assert.fail('a reconciled Home History document must not upload again') }),
    },
  } as unknown as SupabaseClient;

  const result = await createManualHomeHistoryDurably(
    supabase,
    'history-operation-2',
    payload,
    { name: 'receipt.pdf' } as File,
  );

  assert.equal(result?.maintenance_log_id, 'history-2');
  assert.equal(result?.document_id, 'document-2');
});

test('manual document retry reuses duplicate Storage and carries canonical key plus SHA metadata', async () => {
  const payload: ManualHomeHistoryPayload = {
    ...historyPayload,
    document: {
      file_name: 'receipt.pdf',
      content_type: 'application/pdf',
      file_size_bytes: 7,
      sha256: 'b'.repeat(64),
    },
  };
  const uploads: Array<{ path: string; options: unknown }> = [];
  const supabase = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === 'servsync_prepare_manual_home_history_creation') {
        assert.equal(args.p_operation_key, 'history-operation-3');
        return {
          data: {
            status: 'prepared',
            operation_key: 'canonical-history-operation-3',
            storage_path: 'owner/home-history/canonical-history-operation-3/receipt.pdf',
          },
          error: null,
        };
      }
      assert.equal(name, 'servsync_commit_manual_home_history_creation');
      assert.equal(args.p_operation_key, 'canonical-history-operation-3');
      return { data: { status: 'succeeded', maintenance_log_id: 'history-3', document_id: 'document-3' }, error: null };
    },
    storage: {
      from: (bucket: string) => {
        assert.equal(bucket, 'home-documents');
        return {
          upload: async (path: string, _body: Blob, options: unknown) => {
            uploads.push({ path, options });
            return { error: { statusCode: 409, message: 'duplicate' } };
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  const result = await createManualHomeHistoryDurably(
    supabase,
    'history-operation-3',
    payload,
    new Blob(['receipt'], { type: 'application/pdf' }) as File,
  );

  assert.deepEqual(uploads, [{
    path: 'owner/home-history/canonical-history-operation-3/receipt.pdf',
    options: {
      contentType: 'application/pdf',
      upsert: false,
      metadata: {
        servsync_operation_key: 'canonical-history-operation-3',
        servsync_sha256: 'b'.repeat(64),
      },
    },
  }]);
  assert.equal(result?.maintenance_log_id, 'history-3');
  assert.equal(result?.document_id, 'document-3');
});

test('record finalization receipts are private, forced-RLS, actor/purpose bound state', async () => {
  const sql = await migrationSource();

  assert.match(sql, /create table public\.servsync_core_record_finalization_operations/i);
  assert.match(
    sql,
    /alter table public\.servsync_core_record_finalization_operations enable row level security;\s*alter table public\.servsync_core_record_finalization_operations force row level security/i,
  );
  assert.match(
    sql,
    /revoke all on table public\.servsync_core_record_finalization_operations from public,\s*anon,\s*authenticated,\s*service_role/i,
  );
  assert.match(sql, /unique\s*\(actor_user_id,\s*operation_type,\s*operation_key\)/i);
  assert.match(sql, /job_id uuid references public\.inspections\(id\) on delete cascade/i);
  assert.match(sql, /history_id uuid references public\.home_maintenance_log\(id\) on delete set null/i);
  assert.match(
    sql,
    /status\s*=\s*'succeeded'[\s\S]*history_id\s*=\s*result_id\s+or\s+history_id\s+is\s+null/i,
  );
  assert.match(sql, /result_id and result_payload remain as terminal tombstone evidence/i);
  assert.match(sql, /payload_sha256/i);
  assert.match(sql, /status[^;]*(?:prepared|succeeded)/is);
  assert.doesNotMatch(sql, /create policy[^;]+servsync_core_record_finalization_operations/is);
});

test('all record-finalization operations serialize before replay or conflict resolution', async () => {
  const sql = await migrationSource();

  assert.match(sql, /pg_advisory_xact_lock\s*\(\s*hashtextextended/i);
  assert.ok(
    (sql.match(/servsync_private_record_finalization_operation_lock\s*\(/gi) ?? []).length >= 4,
    'report prepare/commit and manual History paths must share transaction-scoped operation locking',
  );
  assert.ok(
    (sql.match(/payload_sha256\s*<>\s*v_hash/gi) ?? []).length >= 2,
    'both semantic operations must reject operation-key reuse with changed payloads',
  );
  assert.match(sql, /status\s*=\s*'succeeded'[\s\S]*result_payload/i);
});

test('report preparation and commit use one deterministic report identity and verify Storage before atomic writes', async () => {
  const sql = await migrationSource();
  const prepare = functionBody(sql, 'servsync_prepare_job_report_finalization');
  const commit = functionBody(sql, 'servsync_commit_job_report_finalization');

  assert.match(prepare, /current_user_can_write_contractor_jobs\s*\(/i);
  assert.match(prepare, /inspection_id[\s\S]*\.pdf|\.pdf[\s\S]*inspection_id/i);
  assert.doesNotMatch(prepare, /gen_random_uuid\s*\(\)[\s\S]*(?:storage_path|report_storage_path)/i);

  assert.match(commit, /current_user_can_write_contractor_jobs\s*\(/i);
  assert.match(commit, /from storage\.objects/i);
  assert.match(commit, /servsync_sha256/i);
  assert.match(commit, /servsync_operation_key/i);
  assert.match(commit, /first valid object[\s\S]*wins/i);
  assert.match(commit, /insert into public\.home_documents/i);
  assert.match(commit, /insert into public\.home_maintenance_log/i);
  assert.match(commit, /insert into public\.notifications/i);
  assert.match(commit, /update public\.inspections/i);

  const documentInsert = commit.indexOf('insert into public.home_documents');
  const historyInsert = commit.indexOf('insert into public.home_maintenance_log');
  const notificationInsert = commit.indexOf('insert into public.notifications');
  const receiptSuccess = commit.lastIndexOf("status = 'succeeded'");
  assert.ok(documentInsert >= 0 && historyInsert > documentInsert && notificationInsert > historyInsert);
  assert.ok(receiptSuccess > notificationInsert, 'receipt succeeds only after every canonical related row is written');
  assert.match(commit, /on conflict[^;]*(?:inspection_id|operation)/is);
});

test('manual Home History with or without a document stays owner-only and commits one canonical lineage', async () => {
  const sql = await migrationSource();
  const prepare = functionBody(sql, 'servsync_prepare_manual_home_history_creation');
  const commit = functionBody(sql, 'servsync_commit_manual_home_history_creation');

  assert.match(prepare, /homeowner_user_id\s*=\s*v_actor|homeowner_user_id\s*=\s*auth\.uid\s*\(\)/i);
  assert.match(commit, /operation\.actor_user_id\s*=\s*v_actor/i);
  for (const body of [prepare, commit]) {
    assert.doesNotMatch(body, /current_user_can_access_home\s*\(/i);
    assert.doesNotMatch(body, /current_user_can_manage_home\s*\(/i);
    assert.doesNotMatch(body, /home_memberships/i);
  }

  assert.match(commit, /insert into public\.home_maintenance_log/i);
  assert.match(commit, /invoice_document_id/i);
  assert.match(commit, /insert into public\.home_documents/i);
  assert.match(commit, /from storage\.objects/i);
  assert.match(commit, /p_payload[^;]*(?:document|null)|document[^;]*p_payload/is);
  assert.match(commit, /status\s*=\s*'succeeded'[\s\S]*result_payload/i);
});

test('shared-home roles receive no new record, document, notification, or Storage authority', async () => {
  const sql = await migrationSource();

  assert.doesNotMatch(sql, /create or replace function public\.servsync_finalize_field_work\s*\(/i);
  assert.doesNotMatch(sql, /grant\s+(?:select|insert|update|delete)[^;]*home_(?:documents|maintenance_log)[^;]*authenticated/i);
  assert.doesNotMatch(sql, /create policy[^;]*(?:home_memberships|current_user_can_access_home|current_user_can_manage_home)[^;]*(?:home_documents|home_maintenance_log|notifications|storage\.objects)/is);
  assert.doesNotMatch(sql, /current_user_home_role\s*\(/i);
  assert.doesNotMatch(sql, /hm\.role\s+in\s*\([^)]*(?:admin|member|viewer)/i);

  for (const signature of [
    'servsync_prepare_job_report_finalization(uuid,uuid,jsonb)',
    'servsync_commit_job_report_finalization(uuid,uuid,jsonb)',
    'servsync_prepare_manual_home_history_creation(uuid,jsonb)',
    'servsync_commit_manual_home_history_creation(uuid,jsonb)',
  ]) {
    const escaped = signature
      .replace(/[()]/g, '\\$&')
      .replace(/,/g, ',\\s*');
    assert.match(sql, new RegExp(`revoke all on function public\\.${escaped} from public,\\s*anon,\\s*authenticated,\\s*service_role`, 'i'));
    assert.match(sql, new RegExp(`grant execute on function public\\.${escaped} to authenticated`, 'i'));
  }

  assert.doesNotMatch(
    sql,
    /grant execute on function public\.servsync_private_record_finalization_[^;]*to authenticated/i,
  );
});

test('generic Home Document uploads cannot bypass receipts and the staged cleanup retires the legacy report path', async () => {
  const sql = await migrationSource();
  const retirement = await retirementMigrationSource();

  assert.match(sql, /policy "home_docs_upload"[\s\S]*not in \('manual-documents', 'home-history', 'field-work'\)/i);
  assert.match(sql, /policy "home_docs_upload_prepared_record_finalizations"/i);
  assert.match(retirement, /revoke all on function public\.servsync_finalize_field_work[\s\S]*authenticated[\s\S]*service_role/i);
  assert.match(retirement, /revoke all on function public\.servsync_can_upload_field_work_report_path[\s\S]*authenticated[\s\S]*service_role/i);
  assert.match(retirement, /drop policy "home_docs_upload_contractor_field_work_reports" on storage\.objects/i);
  assert.doesNotMatch(retirement, /home_memberships|current_user_can_(?:access|manage)_home/i);
});

test('prepared Storage is operation-owned, renewable, reusable, and bounded against orphan replacements', async () => {
  const sql = await migrationSource();

  assert.match(sql, /expires_at/i);
  assert.match(sql, /expires_at\s*>\s*now\s*\(\)/i);
  assert.match(sql, /expires_at\s*=\s*now\s*\(\)\s*\+\s*interval/i);
  assert.match(sql, /storage_path/i);
  assert.match(sql, /servsync_operation_key/i);
  assert.match(sql, /servsync_sha256/i);
  assert.match(sql, /operation\.operation_type = 'job_report_finalize'[\s\S]*current_user_can_write_contractor_jobs\(operation\.contractor_id\)/i);
  assert.match(sql, /status\s*=\s*'succeeded'[\s\S]*(?:return|result_payload)/i);
  assert.doesNotMatch(sql, /upsert\s*[:=]\s*true/i);
});

test('shared runtime acceptance is target-pinned, explicitly gated, and proves complete non-owner role finalization', async () => {
  const harness = await readFile(sandboxHarnessUrl, 'utf8');
  const packageJson = JSON.parse(await readFile(packageUrl, 'utf8')) as { scripts?: Record<string, string> };
  const sandboxCommand = packageJson.scripts?.['test:core-record-finalization-sandbox-runtime'] ?? '';
  const demoCommand = packageJson.scripts?.['test:core-record-finalization-demo-runtime'] ?? '';

  assert.doesNotMatch(sandboxCommand, /--execute-sandbox|--execute-demo/);
  assert.doesNotMatch(demoCommand, /--execute-sandbox|--execute-demo/);
  assert.match(harness, /process\.argv\.includes\('--execute-sandbox'\)/);
  assert.match(harness, /process\.argv\.includes\('--execute-demo'\)/);
  assert.match(harness, /bdytwgejqnlblhrnqxkp/);
  assert.match(harness, /executeSandbox === executeDemo/);
  assert.match(harness, /Refusing shared mutation/);
  assert.ok(harness.indexOf('Refusing shared mutation') < harness.indexOf('function loadKeys'), 'the mutation barrier must run before credentials are loaded');
  assert.match(harness, /APPROVED_SOURCE_HEAD/);
  assert.match(harness, /MATERIAL_CONTRACT_HASHES/);
  assert.doesNotMatch(harness, /assert\.equal\([^\n]*rev-parse[^\n]*EXPECTED_HEAD/);
  assert.match(harness, /pg_tables where schemaname = 'public'/);
  assert.match(harness, /'auth\.users'/);
  assert.match(harness, /'auth\.identities'/);
  assert.match(harness, /'storage\.buckets'/);
  assert.match(harness, /'storage\.objects'/);

  for (const role of ['Admin', 'Office', 'Field Technician']) {
    assert.match(harness, new RegExp(`label: '${role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  }
  const roleLoop = harness.slice(harness.indexOf('const roleCases ='), harness.indexOf('const deniedBytes ='));
  assert.match(roleLoop, /servsync_prepare_job_report_finalization/);
  assert.match(roleLoop, /await upload\(/);
  assert.match(roleLoop, /servsync_commit_job_report_finalization/);
  assert.match(roleLoop, /idempotent/);
  for (const canonical of ['inspections', 'home_documents', 'home_maintenance_log', 'notifications', 'servsync_core_record_finalization_operations', 'storage.objects']) {
    assert.match(roleLoop, new RegExp(canonical.replace('.', '\\.')));
  }
});

test('post-merge Demo observation and Sandbox retirement harnesses stay exact-target and fail closed', async () => {
  const demoUi = await readFile(demoUiHarnessUrl, 'utf8');
  const sandboxRetirement = await readFile(sandboxRetirementHarnessUrl, 'utf8');
  const fingerprint = await readFile(environmentFingerprintUrl, 'utf8');

  assert.match(demoUi, /bdytwgejqnlblhrnqxkp/);
  assert.match(demoUi, /6d28655ac5a81eb8fb1b243161b164e8d4d7acc3/);
  assert.match(demoUi, /FB039E2UI1/);
  assert.match(demoUi, /--setup/);
  assert.match(demoUi, /--verify/);
  assert.match(demoUi, /--cleanup/);
  assert.match(demoUi, /service\.storage\.from\(BUCKET\)\.remove/);
  assert.match(demoUi, /service\.auth\.admin\.deleteUser/);
  assert.doesNotMatch(demoUi, /delete\s+from\s+storage\.objects/i);

  assert.match(sandboxRetirement, /zpzdkoaubyjtsomccxya/);
  assert.match(sandboxRetirement, /--execute-sandbox-retirement/);
  assert.ok(sandboxRetirement.indexOf('Refusing shared Sandbox mutation') < sandboxRetirement.indexOf('function loadKeys'));
  assert.match(sandboxRetirement, /legacy finalizer must be denied/);
  assert.match(sandboxRetirement, /Legacy report-upload bypass unexpectedly succeeded/);
  assert.match(sandboxRetirement, /servsync_prepare_job_report_finalization/);
  assert.match(sandboxRetirement, /servsync_commit_job_report_finalization/);
  assert.match(sandboxRetirement, /idempotent/);
  assert.match(sandboxRetirement, /service\.storage\.from\(BUCKET\)\.remove/);
  assert.match(sandboxRetirement, /service\.auth\.admin\.deleteUser/);
  assert.doesNotMatch(sandboxRetirement, /delete\s+from\s+storage\.objects/i);

  for (const relation of ['public', 'auth.users', 'auth.identities', 'storage.buckets', 'storage.objects']) {
    assert.match(fingerprint, new RegExp(relation.replace('.', '\\.')));
  }
  assert.match(fingerprint, /rollback;/i);
});
