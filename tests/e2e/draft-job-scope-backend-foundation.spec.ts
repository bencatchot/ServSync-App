import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sqlPath = resolve(process.cwd(), 'servsync-draft-job-scope-backend-foundation.sql');
const typesPath = resolve(process.cwd(), 'src/types.ts');

function sourceFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function sqlSource() {
  return readFileSync(sqlPath, 'utf8');
}

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

function changedFiles() {
  const branchDiff = execFileSync('git', ['diff', '--name-only', 'origin/main...HEAD'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const workingTreeDiff = execFileSync('git', ['diff', '--name-only'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  return Array.from(new Set(`${branchDiff}\n${workingTreeDiff}\n${untracked}`
    .split('\n')
    .map(file => file.trim())
    .filter(Boolean)));
}

test.describe('Draft Job backend foundation', () => {
  test('adds Draft Job metadata to inspections without introducing competing draft or scope tables', () => {
    const sql = sqlSource();

    expect(sql).toContain('add column if not exists job_origin');
    expect(sql).toContain("job_origin in ('direct', 'estimate', 'draft_composer', 'invoice_direct', 'imported', 'other')");
    expect(sql).toContain('add column if not exists draft_created_by');
    expect(sql).toContain('add column if not exists draft_updated_by');
    expect(sql).toContain('add column if not exists draft_saved_at');
    expect(sql).toContain('add column if not exists activated_at');
    expect(sql).toContain('add column if not exists activated_by');
    expect(sql).toContain("where status = 'draft'");

    expect(sql).not.toMatch(/create table (if not exists )?public\.draft_jobs/i);
    expect(sql).not.toMatch(/create table (if not exists )?public\.work_records/i);
    expect(sql).not.toMatch(/create table (if not exists )?public\.job_scope_items/i);
    expect(sql).not.toContain("'planned'");
    expect(sql).not.toMatch(/job_number|job_sequence|invoice_allocation|payment_ledger/i);
  });

  test('evolves job_work_items as canonical scope with additive approval and work-state fields', () => {
    const sql = sqlSource();

    expect(sql).toContain('alter table public.job_work_items');
    expect(sql).toContain('add column if not exists work_state');
    expect(sql).toContain("work_state in ('draft', 'open', 'in_progress', 'completed', 'removed', 'non_billable')");
    expect(sql).toContain('add column if not exists approval_required');
    expect(sql).toContain('add column if not exists approval_status');
    expect(sql).toContain("'approved_servsync'");
    expect(sql).toContain("'approved_offline'");
    expect(sql).toContain("'proceeded_without_recorded_approval'");
    expect(sql).toContain('add column if not exists room_id');
    expect(sql).toContain('add column if not exists room_label');
    expect(sql).toContain('add column if not exists location_label');
    expect(sql).toContain("'draft_job_scope'");
    expect(sql).toContain('Existing completion_status and billing_status remain compatibility fields.');

    expect(sql).not.toMatch(/drop column|rename column|alter column .* drop not null/i);
    expect(sql).not.toMatch(/create table .*allocation|create table .*payment/i);
  });

  test('Draft Job RPCs are security-definer, authenticated-only, and validate ownership and subjects', () => {
    const sql = sqlSource();
    const createRpc = sourceBetween(sql, 'create or replace function public.servsync_create_draft_job', 'create or replace function public.servsync_update_draft_job');
    const updateRpc = sourceBetween(sql, 'create or replace function public.servsync_update_draft_job', 'create or replace function public.servsync_upsert_draft_job_scope');

    for (const rpc of [createRpc, updateRpc]) {
      expect(rpc).toContain('security definer');
      expect(rpc).toContain('set search_path = public');
      expect(rpc).toContain('current_user_can_manage_contractor_billing');
      expect(rpc).toContain('homeowner_contractor_connections');
      expect(rpc).toContain('contractor_local_contacts');
      expect(rpc).toContain('contractor_local_homes');
      expect(rpc).toContain('service_requests');
    }
    expect(createRpc).toContain("'draft_composer'");
    expect(createRpc).toContain("'draft'");
    expect(updateRpc).toContain("status <> 'draft' or");
    expect(updateRpc).toContain("job_status <> 'draft'");
    expect(updateRpc).toContain("job_origin <> 'draft_composer'");

    for (const signature of [
      'public.servsync_create_draft_job(uuid, uuid, uuid, uuid, uuid, text, text)',
      'public.servsync_update_draft_job(uuid, uuid, uuid, uuid, uuid, uuid, text, text)',
      'public.servsync_upsert_draft_job_scope(uuid, jsonb)',
      'public.servsync_activate_draft_job(uuid, text)',
    ]) {
      expect(sql).toContain(`revoke execute on function ${signature} from public`);
      expect(sql).toContain(`revoke execute on function ${signature} from anon`);
      expect(sql).toContain(`grant execute on function ${signature} to authenticated`);
    }
  });

  test('scope upsert is transactional, scoped to one Draft Job, and avoids blind delete/recreate', () => {
    const sql = sqlSource();
    const scopeRpc = sourceBetween(sql, 'create or replace function public.servsync_upsert_draft_job_scope', 'create or replace function public.servsync_activate_draft_job');

    expect(scopeRpc).toContain('for update');
    expect(scopeRpc).toContain("v_job.status <> 'draft' or v_job.job_status <> 'draft' or v_job.job_origin <> 'draft_composer'");
    expect(scopeRpc).toContain('Scope items contain duplicate source identities.');
    expect(scopeRpc).toContain('Scope item does not belong to this Draft Job.');
    expect(scopeRpc).toContain('Reserved or invoiced scope items cannot be changed by Draft Job scope updates.');
    expect(scopeRpc).toContain("set completion_status = 'removed'");
    expect(scopeRpc).toContain("work_state = 'removed'");
    expect(scopeRpc).toContain("billing_status = 'not_billable'");
    expect(scopeRpc).not.toMatch(/delete from public\.job_work_items/i);
    expect(scopeRpc).not.toMatch(/truncate/i);
  });

  test('field technician path cannot change financial or approval scope fields', () => {
    const sql = sqlSource();
    const scopeRpc = sourceBetween(sql, 'create or replace function public.servsync_upsert_draft_job_scope', 'create or replace function public.servsync_activate_draft_job');

    expect(scopeRpc).toContain('v_can_operational := public.current_user_can_write_contractor_jobs');
    expect(scopeRpc).toContain('v_can_financial := public.current_user_can_manage_contractor_billing');
    expect(scopeRpc).toContain('Field technicians cannot add Draft Job scope items.');
    expect(scopeRpc).toContain('Field technicians cannot remove Draft Job scope items.');
    expect(scopeRpc).toContain('Field technicians cannot change financial or approval fields on Draft Job scope.');
    for (const protectedField of [
      'v_line_type is distinct from v_existing.line_type',
      'v_quantity is distinct from v_existing.quantity',
      'v_unit_price_cents is distinct from v_existing.unit_price_cents',
      'v_billable is distinct from v_existing.billable',
      'v_approval_status is distinct from v_existing.approval_status',
    ]) {
      expect(scopeRpc).toContain(protectedField);
    }
  });

  test('activation preserves job identity and does not create estimates, invoices, notifications, or finalized reports', () => {
    const sql = sqlSource();
    const activationRpc = sourceBetween(sql, 'create or replace function public.servsync_activate_draft_job', 'revoke execute on function public.servsync_create_draft_job');

    expect(activationRpc).toContain('for update');
    expect(activationRpc).toContain("v_job.status <> 'draft' or v_job.job_origin <> 'draft_composer'");
    expect(activationRpc).toContain("v_job.job_status <> 'draft'");
    expect(activationRpc).toContain('Draft Job is already activated.');
    expect(activationRpc).toContain('Add at least one active scope item before activating this Draft Job.');
    expect(activationRpc).toContain('public.contractor_visit_events');
    expect(activationRpc).toContain("v_next_status not in ('scheduled', 'in_progress')");
    expect(activationRpc).toContain('set job_status = v_next_status');
    expect(activationRpc).toContain('activated_at = now()');
    expect(activationRpc).toContain('activated_by = auth.uid()');

    expect(activationRpc).not.toMatch(/insert into public\.inspections/i);
    expect(activationRpc).not.toMatch(/insert into public\.estimates/i);
    expect(activationRpc).not.toMatch(/insert into public\.invoices/i);
    expect(activationRpc).not.toMatch(/insert into public\.notifications/i);
    expect(activationRpc).not.toMatch(/workflow_activity_events/i);
    expect(activationRpc).not.toMatch(/status = 'finalized'/i);
  });

  test('Draft Job persistence stays contractor-only and does not create homeowner-visible side effects', () => {
    const sql = sqlSource();
    const partialSql = sourceFile('servsync-partial-invoicing-data-foundation.sql');
    const createRpc = sourceBetween(sql, 'create or replace function public.servsync_create_draft_job', 'create or replace function public.servsync_update_draft_job');
    const updateRpc = sourceBetween(sql, 'create or replace function public.servsync_update_draft_job', 'create or replace function public.servsync_upsert_draft_job_scope');
    const scopeRpc = sourceBetween(sql, 'create or replace function public.servsync_upsert_draft_job_scope', 'create or replace function public.servsync_activate_draft_job');
    const draftRpcSource = [createRpc, updateRpc, scopeRpc].join('\n');

    expect(draftRpcSource).not.toMatch(/insert into public\.contractor_visit_events/i);
    expect(draftRpcSource).not.toMatch(/insert into public\.service_request_appointments/i);
    expect(draftRpcSource).not.toMatch(/insert into public\.notifications/i);
    expect(draftRpcSource).not.toMatch(/insert into public\.workflow_activity_events/i);
    expect(draftRpcSource).not.toMatch(/insert into public\.estimates/i);
    expect(draftRpcSource).not.toMatch(/insert into public\.invoices/i);
    expect(draftRpcSource).not.toMatch(/insert into public\.home_documents/i);
    expect(draftRpcSource).not.toMatch(/insert into public\.maintenance_log/i);

    expect(partialSql).toContain('create policy "Job work items: contractor team reads"');
    expect(partialSql).not.toContain('Job work items: homeowner reads');
    expect(sourceFile('servsync-job-lifecycle.sql')).toContain("homeowner_user_id = auth.uid()\n    and status = 'finalized'");
  });

  test('existing estimate-to-job and partial-invoicing SQL remain the protected behavior paths', () => {
    const estimateSql = sourceFile('servsync-partial-invoicing-estimate-work-items.sql');
    const partialSql = sourceFile('servsync-partial-invoicing-data-foundation.sql');
    const newSql = sqlSource();

    expect(estimateSql).toContain('pg_advisory_xact_lock');
    expect(estimateSql).toContain('on conflict (estimate_id)');
    expect(estimateSql).toContain('servsync_seed_job_work_items_from_estimate');
    expect(newSql).not.toContain('servsync_create_job_from_estimate');

    expect(partialSql).toContain('servsync_create_partial_invoice_from_job');
    expect(partialSql).toContain('One or more selected work items are already drafted, invoiced, or not billable.');
    expect(newSql).not.toContain('servsync_create_partial_invoice_from_job');
    expect(newSql).not.toContain('servsync_mark_invoice_paid');
    expect(newSql).not.toContain('servsync_void_invoice');
  });

  test('TypeScript contracts expose only additive Draft Job and scope fields', () => {
    const types = readFileSync(typesPath, 'utf8');

    expect(types).toContain("export type JobOrigin = 'direct' | 'estimate' | 'draft_composer' | 'invoice_direct' | 'imported' | 'other';");
    expect(types).toContain("export type JobWorkItemWorkState = 'draft' | 'open' | 'in_progress' | 'completed' | 'removed' | 'non_billable';");
    expect(types).toContain('export type JobWorkItemApprovalStatus =');
    expect(types).toContain('work_state: JobWorkItemWorkState;');
    expect(types).toContain('approval_status: JobWorkItemApprovalStatus;');
    expect(types).toContain('job_origin?: JobOrigin | null;');
    expect(types).toContain('activated_at?: string | null;');

    expect(types).not.toContain("'planned'");
  });

  test('changed-file scope stays inside approved backend foundation boundaries', () => {
    const files = changedFiles();
    const allowedFiles = new Set([
      'servsync-draft-job-scope-backend-foundation.sql',
      'src/types.ts',
      'tests/e2e/draft-job-scope-backend-foundation.spec.ts',
      'tests/e2e/unified-start-job-composer-foundation.spec.ts',
      'docs/servsync-master-plan/CHANGELOG.md',
      'docs/servsync-master-plan/ServSync_Feature_Backlog.md',
      'docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md',
    ]);

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(allowedFiles.has(file), `${file} should be approved for Draft Job backend foundation`).toBe(true);
    }

    expect(files.some(file => file.includes('package'))).toBe(false);
    expect(files.some(file => file.includes('vercel'))).toBe(false);
    expect(files.some(file => file.includes('supabase/functions'))).toBe(false);
    expect(files.some(file => file.includes('marketing-screenshots'))).toBe(false);
  });
});
