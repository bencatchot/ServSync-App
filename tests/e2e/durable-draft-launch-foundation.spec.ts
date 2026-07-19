import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sqlPath = resolve(process.cwd(), 'servsync-durable-draft-launch-foundation.sql');

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

test.describe('Durable Draft Launch foundation', () => {
  test('keeps the canonical Draft model private and output linkage private-ledger-only', () => {
    const sql = sqlSource();

    expect(sql).toContain('create table if not exists public.contractor_work_drafts');
    expect(sql).toContain('create table if not exists public.contractor_work_draft_items');
    expect(sql).toContain('create table if not exists public.contractor_work_draft_launches');
    expect(sql).toContain("intended_output is null or intended_output in ('estimate', 'job')");
    expect(sql).toContain("work_format = 'standard'");
    expect(sql).toContain("status in ('active', 'consumed', 'discarded')");
    expect(sql).toContain('contractor_work_draft_launches_estimate_output_unique_idx');
    expect(sql).toContain('contractor_work_draft_launches_job_output_unique_idx');
    expect(sql).toContain('launched_estimate_id uuid references public.estimates(id) on delete restrict');
    expect(sql).toContain('launched_job_id uuid references public.inspections(id) on delete restrict');
    expect(sql).not.toContain('source_work_draft_id');
    expect(sourceFile('src/types.ts')).not.toContain('source_work_draft_id');
    expect(sql).not.toContain('launched_output_id');
    expect(sql).not.toMatch(/create table if not exists public\.(?:contractor_work_draft_)?invoices/i);
  });

  test('preserves durable audit rows when actor profiles are deleted', () => {
    const sql = sqlSource();

    expect(sql).toContain('created_by_user_id uuid references public.profiles(id) on delete set null');
    expect(sql).toContain('launched_by_user_id uuid references public.profiles(id) on delete set null');
    expect(sql).toContain('requested_by_user_id uuid references public.profiles(id) on delete set null');
    expect(sql).not.toMatch(/(?:created_by_user_id|launched_by_user_id|requested_by_user_id)[^\n]*on delete cascade/);
    expect(sql).not.toMatch(/status = 'consumed'[\s\S]*launched_by_user_id is not null[\s\S]*contractor_work_drafts_launch_state_check/);
  });

  test('RLS and grants keep Draft and launch records contractor-private', () => {
    const sql = sqlSource();

    for (const table of ['contractor_work_drafts', 'contractor_work_draft_items', 'contractor_work_draft_launches']) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on table public.${table} from public`);
      expect(sql).toContain(`revoke all on table public.${table} from anon`);
      expect(sql).toContain(`revoke all on table public.${table} from authenticated`);
      expect(sql).toContain(`grant select on public.${table} to authenticated`);
    }
    expect(sql).not.toMatch(/homeowner_user_id = auth\.uid\(\).*contractor_work_drafts/is);
    expect(sql).not.toMatch(/grant (insert|update|delete).*contractor_work_draft/i);
  });

  test('save validates stable IDs, numeric input, ordering, and immutable legacy linkage', () => {
    const sql = sqlSource();
    const saveRpc = sourceBetween(sql, 'create or replace function public.servsync_save_work_draft', 'create or replace function public.servsync_private_validate_work_draft_relationships');

    expect(saveRpc).toContain('p_removed_item_ids jsonb');
    expect(saveRpc).toContain('servsync_private_work_draft_uuid');
    expect(saveRpc).toContain('servsync_private_work_draft_numeric');
    expect(saveRpc).toContain('servsync_private_work_draft_integer');
    expect(saveRpc).toContain('v_item_id = any(v_item_ids)');
    expect(saveRpc).toContain('v_removed_id = any(v_removed_ids)');
    expect(saveRpc).toContain('v_item_id = any(v_removed_ids)');
    expect(saveRpc).toContain('cardinality(v_removed_ids)');
    expect(saveRpc).toContain('v_sort_order < 0');
    expect(saveRpc).toContain('v_labor_hours > 999999.99');
    expect(saveRpc).toContain('v_job_labor_hours > 999999.99');
    expect(saveRpc).toContain('v_legacy_inspection_id <> v_existing.legacy_inspection_id');
    expect(saveRpc).toContain('LEGACY_DRAFT_INCOMPATIBLE');
    expect(saveRpc).not.toMatch(/->>'(?:id|quantity|unit_price_cents|labor_hours|sort_order)'[^\n]*::(?:uuid|numeric|integer)/);
  });

  test('resume and output copies use deterministic item ordering', () => {
    const sql = sqlSource();
    const deterministicOrder = 'order by item.sort_order asc, item.created_at asc, item.id asc';

    expect(sql.split(deterministicOrder).length - 1).toBeGreaterThanOrEqual(4);
    expect(sql).toContain('sort_order integer not null default 0 check (sort_order >= 0)');
    expect(sql).toContain('labor_hours numeric(8,2)');
  });

  test('legacy import is non-destructive and does not durably infer Job intent', () => {
    const sql = sqlSource();
    const importRpc = sourceBetween(sql, 'create or replace function public.servsync_import_legacy_draft_job', 'create or replace function public.servsync_private_launch_work_draft_as_estimate');

    expect(importRpc).toContain('p_intended_output text default null');
    expect(importRpc).toContain("v_job.job_origin <> 'draft_composer'");
    expect(importRpc).toContain('legacy_inspection_id');
    expect(importRpc).toContain('order by item.sort_order asc, item.created_at asc, item.id asc');
    expect(importRpc).not.toMatch(/delete from public\.(?:inspections|job_work_items)/i);
  });

  test('authorization precedes all launch-ledger lookup and retry output disclosure', () => {
    const sql = sqlSource();
    const launchRpc = sourceBetween(sql, 'create or replace function public.servsync_launch_work_draft', 'revoke execute on function public.servsync_get_work_draft');
    const permissionIndex = launchRpc.indexOf('current_user_can_access_contractor');
    const conflictLookupIndex = launchRpc.indexOf('into v_conflicting_launch');
    const successLookupIndex = launchRpc.indexOf('into v_existing_launch');
    const consumedReturnIndex = launchRpc.indexOf("'status', 'already_consumed'");

    expect(permissionIndex).toBeGreaterThanOrEqual(0);
    expect(permissionIndex).toBeLessThan(conflictLookupIndex);
    expect(permissionIndex).toBeLessThan(successLookupIndex);
    expect(permissionIndex).toBeLessThan(consumedReturnIndex);
    expect(launchRpc).toContain("raise exception using message = 'DRAFT_PERMISSION_DENIED'");
  });

  test('launch serializes idempotency and returns one canonical output without broad masking', () => {
    const sql = sqlSource();
    const launchRpc = sourceBetween(sql, 'create or replace function public.servsync_launch_work_draft', 'revoke execute on function public.servsync_get_work_draft');

    expect(launchRpc).toContain('for update');
    expect(launchRpc).toContain('pg_advisory_xact_lock');
    expect(launchRpc).toContain('hashtextextended');
    expect(launchRpc).toContain('IDEMPOTENCY_CONFLICT');
    expect(launchRpc).toContain("status', case when v_existing_launch.idempotency_key = p_idempotency_key then 'succeeded' else 'already_consumed' end");
    expect(launchRpc).toContain("v_draft.status = 'consumed'");
    expect(launchRpc).toContain("'launch_id', null");
    expect(launchRpc).toContain("set status = 'consumed'");
    expect(launchRpc).not.toContain('when unique_violation');
    expect(sql).not.toContain('failure_code');
    expect(sql).not.toContain("status in ('succeeded', 'failed')");
  });

  test('launch revalidates connected and local subjects in the same transaction', () => {
    const sql = sqlSource();
    const validator = sourceBetween(sql, 'create or replace function public.servsync_private_validate_work_draft_relationships', 'create or replace function public.servsync_private_can_create_work_draft_estimate');
    const launchRpc = sourceBetween(sql, 'create or replace function public.servsync_launch_work_draft', 'revoke execute on function public.servsync_get_work_draft');

    expect(validator).toContain('homeowner_contractor_connections');
    expect(validator).toContain("connection.status = 'active'");
    expect(validator).toContain('home.homeowner_user_id = p_draft.homeowner_user_id');
    expect(validator).toContain('request.contractor_id = p_draft.contractor_id');
    expect(validator).toContain('v_request.homeowner_user_id <> p_draft.homeowner_user_id');
    expect(validator).toContain('v_request.home_id is distinct from p_draft.home_id');
    expect(validator).toContain('home.local_contact_id = p_draft.local_contact_id');
    expect(validator).toContain('SERVICE_REQUEST_INVALID');
    expect(launchRpc).toContain('servsync_private_validate_work_draft_relationships(v_draft)');
  });

  test('Estimate launch matches normal calculation buckets and existing creation permission', () => {
    const sql = sqlSource();
    const estimateHelper = sourceBetween(sql, 'create or replace function public.servsync_private_launch_work_draft_as_estimate', 'create or replace function public.servsync_private_launch_work_draft_as_job');
    const permissionHelper = sourceBetween(sql, 'create or replace function public.servsync_private_can_create_work_draft_estimate', 'create or replace function public.servsync_import_legacy_draft_job');

    expect(permissionHelper).toContain('contractor.owner_user_id = auth.uid()');
    expect(estimateHelper).toContain('servsync_private_can_create_work_draft_estimate');
    expect(estimateHelper).toContain("line_type in ('material', 'other')");
    expect(estimateHelper).toContain("p_draft.labor_mode = 'line_specific'");
    expect(estimateHelper).toContain("and line_type in ('material', 'other')");
    expect(estimateHelper).toContain("case when item.line_type in ('material', 'other') then item.labor_hours else null end");
    expect(estimateHelper).toContain("'draft'");
    expect(estimateHelper).not.toContain('p_draft.private_notes');
    expect(estimateHelper).not.toContain('source_work_draft_id');
    expect(estimateHelper).not.toMatch(/insert into public\.(?:inspections|invoices)/i);
    expect(sql).not.toMatch(/field_tech[\s\S]{0,120}(?:estimate|DRAFT_PERMISSION_DENIED)/i);
  });

  test('Job launch matches the existing normal Job permission boundary', () => {
    const sql = sqlSource();
    const jobHelper = sourceBetween(sql, 'create or replace function public.servsync_private_launch_work_draft_as_job', 'create or replace function public.servsync_launch_work_draft');

    expect(jobHelper).toContain('current_user_can_write_contractor_jobs');
    expect(jobHelper).toContain('insert into public.inspections');
    expect(jobHelper).toContain("'direct'");
    expect(jobHelper).toContain('insert into public.job_work_items');
    expect(jobHelper).toContain("'work_draft_item'");
    expect(jobHelper).toContain("'work-draft-item:' || (row_number()");
    expect(jobHelper).not.toContain("'work-draft-item:' || item.id::text");
    expect(jobHelper).toContain('item.internal_notes');
    expect(jobHelper).not.toContain('p_draft.private_notes');
    expect(jobHelper).not.toContain('source_work_draft_id');
    expect(jobHelper).not.toMatch(/insert into public\.(?:estimates|invoices)/i);
  });

  test('browser-callable RPCs are authenticated-only and private helpers stay private', () => {
    const sql = sqlSource();

    for (const signature of [
      'public.servsync_get_work_draft(uuid)',
      'public.servsync_save_work_draft(uuid, jsonb, jsonb, jsonb)',
      'public.servsync_import_legacy_draft_job(uuid, text)',
      'public.servsync_launch_work_draft(uuid, text, uuid)',
    ]) {
      expect(sql).toContain(`revoke execute on function ${signature} from public`);
      expect(sql).toContain(`revoke execute on function ${signature} from anon`);
      expect(sql).toContain(`grant execute on function ${signature} to authenticated`);
    }

    for (const helper of [
      'servsync_private_launch_work_draft_as_estimate',
      'servsync_private_launch_work_draft_as_job',
      'servsync_private_validate_work_draft_relationships',
      'servsync_private_can_create_work_draft_estimate',
      'servsync_private_work_draft_uuid',
      'servsync_private_work_draft_numeric',
      'servsync_private_work_draft_integer',
    ]) {
      expect(sql).toContain(`revoke all on function public.${helper}`);
    }
  });

  test('frontend save contract is a strict full snapshot and launch UI remains hidden', () => {
    const apiSource = sourceFile('src/features/drafts/durableDraftLaunchApi.ts');
    const typesSource = sourceFile('src/features/drafts/durableDraftLaunchTypes.ts');
    const appSource = sourceFile('src/App.tsx');
    const sharedComposerSource = sourceFile('src/features/drafts/ContractorDraftComposer.tsx');

    expect(typesSource).toContain('export type ContractorWorkDraftMetadataInput');
    expect(typesSource).toContain('metadata: ContractorWorkDraftMetadataInput');
    expect(typesSource).not.toContain('metadata: Record<string, unknown>');
    expect(typesSource).not.toContain("'succeeded' | 'failed'");
    expect(apiSource).toContain('homeowner_user_id: payload.metadata.homeowner_user_id ?? null');
    expect(apiSource).toContain('legacy_inspection_id: payload.metadata.legacy_inspection_id ?? null');
    expect(appSource).not.toContain('launchContractorWorkDraft');
    expect(sharedComposerSource).not.toContain('Create Estimate');
    expect(sharedComposerSource).not.toContain('Create Job');
    expect(sharedComposerSource).not.toContain('Create Invoice');
    expect(sharedComposerSource).not.toContain('Launch Draft');
  });

  test('changed-file scope stays inside the approved Slice 2B correction', () => {
    const files = changedFiles();
    const allowedFiles = new Set([
      'servsync-durable-draft-launch-foundation.sql',
      'src/features/drafts/durableDraftLaunchApi.ts',
      'src/features/drafts/durableDraftLaunchTypes.ts',
      'src/types.ts',
      'tests/e2e/durable-draft-launch-foundation.spec.ts',
      'docs/servsync-master-plan/CHANGELOG.md',
      'docs/servsync-master-plan/ServSync_Feature_Backlog.md',
      'docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md',
    ]);

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(allowedFiles.has(file), `${file} should be approved`).toBe(true);
    expect(files.some(file => /package|vercel|supabase\/functions|marketing-screenshots/.test(file))).toBe(false);
  });
});
