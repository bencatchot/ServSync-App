import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  completeDurableOperation,
  durableOperationCanonicalPayload,
  durableOperationKey,
  requestMediaContentType,
  saveServiceRequestDurably,
  uploadPreparedRequestMedia,
} from '../../src/features/reliability/durableOperation';
import type { SupabaseClient } from '@supabase/supabase-js';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test('canonical payload ordering is deterministic', () => {
  assert.equal(
    durableOperationCanonicalPayload({ z: 1, nested: { b: 2, a: 1 }, rows: [{ y: 2, x: 1 }] }),
    durableOperationCanonicalPayload({ rows: [{ x: 1, y: 2 }], nested: { a: 1, b: 2 }, z: 1 }),
  );
});

test('Request media derives a stable allowlisted MIME when the browser type is empty', () => {
  assert.equal(requestMediaContentType({ name: 'kitchen.HEIC', type: '' }), 'image/heic');
  assert.equal(requestMediaContentType({ name: 'walkthrough.MOV', type: '  ' }), 'video/quicktime');
  assert.equal(requestMediaContentType({ name: 'before.jpeg', type: '' }), 'image/jpeg');
  assert.equal(requestMediaContentType({ name: 'clip.webm', type: 'video/webm' }), 'video/webm');
  assert.equal(requestMediaContentType({ name: 'unsupported.bin', type: '' }), 'application/octet-stream');
});

test('operation keys survive equivalent retry and rotate for changed payload or confirmed success', async () => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  const first = await durableOperationKey('estimate:new', { title: 'A', lines: [{ sort: 0 }] });
  const retry = await durableOperationKey('estimate:new', { lines: [{ sort: 0 }], title: 'A' });
  assert.equal(retry, first);
  const changed = await durableOperationKey('estimate:new', { title: 'B', lines: [{ sort: 0 }] });
  assert.notEqual(changed, first);
  assert.equal(
    await durableOperationKey('estimate:new', { title: 'A', lines: [{ sort: 0 }] }),
    first,
    'another semantic draft must not displace the lost-response key for this payload',
  );
  await completeDurableOperation('estimate:new', changed, { title: 'B', lines: [{ sort: 0 }] });
  const afterSuccess = await durableOperationKey('estimate:new', { title: 'B', lines: [{ sort: 0 }] });
  assert.notEqual(afterSuccess, changed);
});

test('a lost Request response reconciles the durable success before another attachment upload', async () => {
  let rpcCalls = 0;
  const supabase = {
    rpc: async (name: string) => {
      rpcCalls += 1;
      assert.equal(name, 'servsync_prepare_service_request_creation');
      return { data: { status: 'succeeded', request_id: 'request-1' }, error: null };
    },
    storage: {
      from: () => ({ upload: async () => assert.fail('a committed Request must not upload again') }),
    },
  } as unknown as SupabaseClient;

  const result = await saveServiceRequestDurably(
    supabase,
    [{} as File],
    'operation-1',
    { title: 'Already committed' },
  );
  assert.equal(result?.request_id, 'request-1');
  assert.equal(rpcCalls, 1);
});

test('Request media upload reuses deterministic objects and continues missing uploads', async () => {
  const uploaded: string[] = [];
  const supabase = {
    storage: {
      from: () => ({
        upload: async (path: string) => {
          uploaded.push(path);
          return path.endsWith('existing.heic')
            ? { error: { statusCode: '409', message: 'The resource already exists' } }
            : { error: null };
        },
      }),
    },
  } as unknown as SupabaseClient;
  const files = [{ name: 'existing.heic' }, { name: 'missing.png' }] as File[];
  await uploadPreparedRequestMedia(supabase, files, [
    { ordinal: 0, storage_path: 'operation/existing.heic', sha256: 'a'.repeat(64), file_name: 'existing.heic', content_type: 'image/heic', file_size_bytes: 1 },
    { ordinal: 1, storage_path: 'operation/missing.png', sha256: 'b'.repeat(64), file_name: 'missing.png', content_type: 'image/png', file_size_bytes: 1 },
  ], 'operation-key');
  assert.deepEqual(uploaded, ['operation/existing.heic', 'operation/missing.png']);
});

test('migration defines one private forced-RLS receipt model and purpose-bound RPCs', async () => {
  const sql = await readFile(new URL('../../servsync-core-authoring-durable-idempotency.sql', import.meta.url), 'utf8');
  assert.equal(createHash('sha256').update(sql).digest('hex'), '5a364e95d2e791f0adc4712bc71502ebc732f3285e79c690220020e83b9f77f6');
  assert.match(sql, /create table public\.servsync_core_authoring_operations/);
  assert.match(sql, /enable row level security;\s*alter table public\.servsync_core_authoring_operations force row level security/);
  assert.match(sql, /revoke all on table public\.servsync_core_authoring_operations from public, anon, authenticated, service_role/);
  assert.match(sql, /unique \(actor_user_id, operation_type, operation_key\)/);
  assert.match(sql, /servsync_prepare_service_request_creation/);
  assert.match(sql, /servsync_commit_service_request_creation/);
  assert.match(sql, /servsync_save_estimate_draft_idempotent/);
  assert.match(sql, /servsync_save_invoice_draft_idempotent/);
});

test('forward fix renews only expired same-payload Request preparations', async () => {
  const sql = await readFile(new URL('../../servsync-core-authoring-request-preparation-renewal-forward-fix.sql', import.meta.url), 'utf8');
  assert.match(sql, /servsync_private_core_authoring_operation_lock\(v_actor, 'service_request_create', p_operation_key\)[\s\S]*for update/);
  assert.match(sql, /payload_sha256 <> v_hash/);
  assert.match(sql, /v_existing\.status = 'succeeded'[\s\S]*return v_existing\.result_payload/);
  assert.match(sql, /v_existing\.status <> 'prepared'/);
  assert.match(sql, /v_existing\.expires_at > now\(\)[\s\S]*update public\.servsync_core_authoring_operations[\s\S]*expires_at = now\(\) \+ interval '30 days'/);
  assert.match(sql, /contractor_id = v_existing\.contractor_id[\s\S]*connection\.status = 'active'/);
  assert.match(sql, /home\.homeowner_user_id = v_actor/);
  assert.match(sql, /'renewed', true/);
  assert.match(sql, /comment on function public\.servsync_prepare_service_request_creation\(uuid,jsonb\)/);
  assert.match(sql, /revoke all on function public\.servsync_prepare_service_request_creation\(uuid,jsonb\) from public, anon, authenticated, service_role/);
  assert.match(sql, /grant execute on function public\.servsync_prepare_service_request_creation\(uuid,jsonb\) to authenticated/);
});

test('every operation locks before receipt resolution and rejects conflicting fingerprints', async () => {
  const sql = await readFile(new URL('../../servsync-core-authoring-durable-idempotency.sql', import.meta.url), 'utf8');
  assert.ok((sql.match(/servsync_private_core_authoring_operation_lock\(/g) ?? []).length >= 5);
  assert.ok((sql.match(/payload_sha256 <> v_hash/g) ?? []).length >= 3);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended/);
});

test('Request media is prepared at deterministic operation-owned paths and registered only at commit', async () => {
  const sql = await readFile(new URL('../../servsync-core-authoring-durable-idempotency.sql', import.meta.url), 'utf8');
  assert.match(sql, /v_actor::text \|\| '\/operations\/' \|\| p_operation_key::text/);
  assert.match(sql, /homeowner_upload_prepared_request_media/);
  assert.match(sql, /from storage\.objects object[\s\S]*servsync_sha256[\s\S]*servsync_operation_key/);
  const requestInsert = sql.indexOf('insert into public.service_requests');
  const messageInsert = sql.indexOf('insert into public.service_request_messages', requestInsert);
  const mediaInsert = sql.indexOf('insert into public.service_request_media', messageInsert);
  const receiptSuccess = sql.indexOf("set status = 'succeeded'", mediaInsert);
  assert.ok(requestInsert > 0 && messageInsert > requestInsert && mediaInsert > messageInsert && receiptSuccess > mediaInsert);
});

test('Estimate and Invoice replacements remain within one RPC transaction', async () => {
  const sql = await readFile(new URL('../../servsync-core-authoring-durable-idempotency.sql', import.meta.url), 'utf8');
  assert.match(sql, /delete from public\.estimate_line_items[\s\S]*delete from public\.estimate_payment_schedule_items[\s\S]*insert into public\.estimate_line_items[\s\S]*insert into public\.estimate_payment_schedule_items/);
  assert.match(sql, /v_estimate\.status <> 'draft'/);
  assert.match(sql, /v_invoice\.status <> 'draft' or v_invoice\.amount_paid_cents <> 0/);
  assert.match(sql, /current_user_can_manage_contractor_estimates/);
  assert.match(sql, /current_user_can_manage_contractor_billing/);
});

test('public RPC grants are exact and private helpers remain private', async () => {
  const sql = await readFile(new URL('../../servsync-core-authoring-durable-idempotency.sql', import.meta.url), 'utf8');
  for (const signature of [
    'servsync_prepare_service_request_creation(uuid,jsonb)',
    'servsync_commit_service_request_creation(uuid,jsonb)',
    'servsync_save_estimate_draft_idempotent(uuid,uuid,jsonb)',
    'servsync_save_invoice_draft_idempotent(uuid,uuid,jsonb)',
  ]) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature.replace(/[()]/g, '\\$&')} from public,anon,authenticated,service_role`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature.replace(/[()]/g, '\\$&')} to authenticated`));
  }
  assert.doesNotMatch(sql, /grant execute on function public\.servsync_private_core_authoring_(?:payload_hash|operation_lock|estimate_result|invoice_result).*authenticated/);
});

test('application handlers use only durable RPC paths for the protected operations', async () => {
  const source = await readFile(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  const durableOperations = await readFile(new URL('../../src/features/reliability/durableOperation.ts', import.meta.url), 'utf8');
  const request = source.slice(source.indexOf('const createServiceRequest = async'), source.indexOf('const updateHomeownerServiceRequest'));
  const estimate = source.slice(source.indexOf('const saveEstimateDraft = async'), source.indexOf('const saveInvoiceDraft = async'));
  const invoice = source.slice(source.indexOf('const saveInvoiceDraft = async'), source.indexOf('const sendInvoiceToHomeowner'));
  assert.match(request, /saveServiceRequestDurably/);
  assert.match(request, /content_type: requestMediaContentType\(file\)/);
  assert.doesNotMatch(request, /content_type: file\.type/);
  assert.doesNotMatch(request, /rpc\('servsync_create_service_request'/);
  assert.match(durableOperations, /servsync_prepare_service_request_creation/);
  assert.match(durableOperations, /servsync_commit_service_request_creation/);
  assert.match(durableOperations, /contentType: item\.content_type/);
  assert.match(estimate, /servsync_save_estimate_draft_idempotent/);
  assert.doesNotMatch(estimate, /from\('estimates'\)|from\('estimate_line_items'\)|from\('estimate_payment_schedule_items'\)/);
  assert.match(invoice, /servsync_save_invoice_draft_idempotent/);
  assert.doesNotMatch(invoice, /from\('invoices'\)|from\('invoice_line_items'\)/);
});
