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
  test('adds dedicated contractor-only Draft, item, and launch tables', () => {
    const sql = sqlSource();

    expect(sql).toContain('create table if not exists public.contractor_work_drafts');
    expect(sql).toContain('create table if not exists public.contractor_work_draft_items');
    expect(sql).toContain('create table if not exists public.contractor_work_draft_launches');
    expect(sql).toContain("intended_output is null or intended_output in ('estimate', 'job')");
    expect(sql).toContain("work_format = 'standard'");
    expect(sql).toContain("status in ('active', 'consumed', 'discarded')");
    expect(sql).toContain('legacy_inspection_id uuid references public.inspections');
    expect(sql).toContain('private_notes text not null default');
    expect(sql).toContain('contractor_work_drafts_launch_state_check');
    expect(sql).toContain('contractor_work_drafts_legacy_inspection_unique_idx');
    expect(sql).toContain('contractor_work_draft_launches_one_success_idx');
    expect(sql).toContain('contractor_work_draft_launches_idempotency_idx');

    expect(sql).not.toMatch(/create table if not exists public\.draft_jobs/i);
    expect(sql).not.toMatch(/alter table public\.inspections\s+rename/i);
    expect(sql).not.toMatch(/delete from public\.inspections/i);
    expect(sql).not.toMatch(/create table if not exists public\.(?:contractor_work_draft_)?invoices/i);
  });

  test('adds validated source Draft linkage without using polymorphic output ids', () => {
    const sql = sqlSource();

    expect(sql).toContain('add column if not exists source_work_draft_id uuid');
    expect(sql).toContain('estimates_source_work_draft_fk');
    expect(sql).toContain('inspections_source_work_draft_fk');
    expect(sql).toContain('launched_estimate_id uuid references public.estimates');
    expect(sql).toContain('launched_job_id uuid references public.inspections');
    expect(sql).toContain("launched_output_type = 'estimate' and launched_estimate_id is not null and launched_job_id is null");
    expect(sql).toContain("launched_output_type = 'job' and launched_job_id is not null and launched_estimate_id is null");
    expect(sql).not.toContain('launched_output_id');
    expect(sql).not.toContain('output_record_id');
  });

  test('RLS and grants keep Draft records private to authorized contractor users', () => {
    const sql = sqlSource();

    for (const table of [
      'contractor_work_drafts',
      'contractor_work_draft_items',
      'contractor_work_draft_launches',
    ]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`revoke all on table public.${table} from public`);
      expect(sql).toContain(`revoke all on table public.${table} from anon`);
      expect(sql).toContain(`grant select on public.${table} to authenticated`);
    }

    expect(sql).toContain('current_user_can_access_contractor');
    expect(sql).toContain('current_user_is_platform_admin');
    expect(sql).not.toMatch(/homeowner.*work drafts/i);
    expect(sql).not.toMatch(/homeowner_user_id = auth\.uid\(\).*contractor_work_drafts/is);
    expect(sql).not.toMatch(/grant (insert|update|delete).*contractor_work_drafts to authenticated/i);
  });

  test('save and resume RPCs validate tenant, active status, intended output, items, and legacy bridge', () => {
    const sql = sqlSource();
    const saveRpc = sourceBetween(sql, 'create or replace function public.servsync_save_work_draft', 'create or replace function public.servsync_import_legacy_draft_job');
    const getRpc = sourceBetween(sql, 'create or replace function public.servsync_get_work_draft', 'create or replace function public.servsync_save_work_draft');
    const importRpc = sourceBetween(sql, 'create or replace function public.servsync_import_legacy_draft_job', 'create or replace function public.servsync_private_launch_work_draft_as_estimate');

    expect(saveRpc).toContain('security definer');
    expect(saveRpc).toContain('set search_path = public');
    expect(saveRpc).toContain('current_user_can_manage_contractor_billing');
    expect(saveRpc).toContain("v_existing.status <> 'active'");
    expect(saveRpc).toContain('DRAFT_NOT_ACTIVE');
    expect(saveRpc).toContain('UNSUPPORTED_OUTPUT');
    expect(saveRpc).toContain('CUSTOMER_INVALID');
    expect(saveRpc).toContain('PROPERTY_INVALID');
    expect(saveRpc).toContain('LEGACY_DRAFT_INCOMPATIBLE');
    expect(saveRpc).toContain('p_removed_item_ids');
    expect(saveRpc).toContain('delete from public.contractor_work_draft_items');
    expect(saveRpc).toContain("when v_item ? 'unit_price_cents'");
    expect(saveRpc).toContain("when v_item ? 'labor_hours'");

    expect(getRpc).toContain('jsonb_agg(to_jsonb(item) order by item.sort_order asc');
    expect(getRpc).toContain('DRAFT_PERMISSION_DENIED');
    expect(importRpc).toContain("v_job.job_origin <> 'draft_composer'");
    expect(importRpc).toContain('legacy_inspection_id');
    expect(importRpc).not.toMatch(/delete from public\.job_work_items/i);
  });

  test('launch RPC enforces one atomic output, idempotency, and consumed-state behavior', () => {
    const sql = sqlSource();
    const launchRpc = sourceBetween(sql, 'create or replace function public.servsync_launch_work_draft', 'revoke execute on function public.servsync_get_work_draft');

    expect(launchRpc).toContain('for update');
    expect(launchRpc).toContain('IDEMPOTENCY_CONFLICT');
    expect(launchRpc).toContain('DRAFT_ALREADY_CONSUMED');
    expect(launchRpc).toContain('INTENDED_OUTPUT_REQUIRED');
    expect(launchRpc).toContain('INTENDED_OUTPUT_MISMATCH');
    expect(launchRpc).toContain('UNSUPPORTED_OUTPUT');
    expect(launchRpc).toContain('LAUNCH_CONFLICT');
    expect(launchRpc).toContain('servsync_private_launch_work_draft_as_estimate');
    expect(launchRpc).toContain('servsync_private_launch_work_draft_as_job');
    expect(launchRpc).toContain("set status = 'consumed'");
    expect(launchRpc).toContain("status', case when v_existing_launch.idempotency_key = p_idempotency_key then 'succeeded' else 'already_consumed' end");
    expect(launchRpc).not.toMatch(/insert into public\.invoices/i);
    expect(launchRpc).not.toMatch(/insert into public\.notifications/i);
    expect(launchRpc).not.toMatch(/insert into public\.workflow_activity_events/i);
  });

  test('Estimate launch creates only a draft Estimate and does not copy private Draft notes', () => {
    const sql = sqlSource();
    const estimateHelper = sourceBetween(sql, 'create or replace function public.servsync_private_launch_work_draft_as_estimate', 'create or replace function public.servsync_private_launch_work_draft_as_job');

    expect(estimateHelper).toContain('current_user_can_manage_contractor_billing');
    expect(estimateHelper).toContain('insert into public.estimates');
    expect(estimateHelper).toContain('source_work_draft_id');
    expect(estimateHelper).toContain("'draft'");
    expect(estimateHelper).toContain('insert into public.estimate_line_items');
    expect(estimateHelper).toContain('item.unit_price_cents');
    expect(estimateHelper).toContain('item.labor_hours');
    expect(estimateHelper).toContain('item.sort_order');
    expect(estimateHelper).toContain("''");
    expect(estimateHelper).not.toContain('p_draft.private_notes');
    expect(estimateHelper).not.toMatch(/insert into public\.inspections/i);
    expect(estimateHelper).not.toMatch(/insert into public\.invoices/i);
  });

  test('Job launch creates one operational inspection-backed Job and seeds work items', () => {
    const sql = sqlSource();
    const jobHelper = sourceBetween(sql, 'create or replace function public.servsync_private_launch_work_draft_as_job', 'create or replace function public.servsync_launch_work_draft');

    expect(jobHelper).toContain('current_user_can_write_contractor_jobs');
    expect(jobHelper).toContain('insert into public.inspections');
    expect(jobHelper).toContain('source_work_draft_id');
    expect(jobHelper).toContain("'direct'");
    expect(jobHelper).toContain('insert into public.job_work_items');
    expect(jobHelper).toContain("'work_draft_item'");
    expect(jobHelper).toContain('item.unit_price_cents');
    expect(jobHelper).toContain('item.labor_hours');
    expect(jobHelper).toContain('item.internal_notes');
    expect(jobHelper).not.toContain('p_draft.private_notes');
    expect(jobHelper).not.toMatch(/insert into public\.estimates/i);
    expect(jobHelper).not.toMatch(/insert into public\.invoices/i);
  });

  test('browser-callable RPC grants are authenticated-only and private helpers are not browser callable', () => {
    const sql = sqlSource();

    for (const signature of [
      'public.servsync_get_work_draft(uuid)',
      'public.servsync_save_work_draft(uuid, jsonb, jsonb, uuid[])',
      'public.servsync_import_legacy_draft_job(uuid, text)',
      'public.servsync_launch_work_draft(uuid, text, uuid)',
    ]) {
      expect(sql).toContain(`revoke execute on function ${signature} from public`);
      expect(sql).toContain(`revoke execute on function ${signature} from anon`);
      expect(sql).toContain(`grant execute on function ${signature} to authenticated`);
    }

    expect(sql).toContain('revoke all on function public.servsync_private_launch_work_draft_as_estimate');
    expect(sql).toContain('revoke all on function public.servsync_private_launch_work_draft_as_job');
  });

  test('frontend additions are hidden API contracts, not visible launch UI', () => {
    const apiSource = sourceFile('src/features/drafts/durableDraftLaunchApi.ts');
    const appSource = sourceFile('src/App.tsx');
    const sharedComposerSource = sourceFile('src/features/drafts/ContractorDraftComposer.tsx');

    expect(apiSource).toContain('servsync_save_work_draft');
    expect(apiSource).toContain('servsync_get_work_draft');
    expect(apiSource).toContain('servsync_launch_work_draft');
    expect(appSource).not.toContain('launchContractorWorkDraft');
    expect(sharedComposerSource).not.toContain('Create Estimate');
    expect(sharedComposerSource).not.toContain('Create Job');
    expect(sharedComposerSource).not.toContain('Create Invoice');
    expect(sharedComposerSource).not.toContain('Launch Draft');
  });

  test('changed-file scope stays inside the approved Slice 2B foundation', () => {
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
    for (const file of files) {
      expect(allowedFiles.has(file), `${file} should be approved for durable Draft launch foundation`).toBe(true);
    }

    expect(files.some(file => file.includes('package'))).toBe(false);
    expect(files.some(file => file.includes('vercel'))).toBe(false);
    expect(files.some(file => file.includes('supabase/functions'))).toBe(false);
    expect(files.some(file => file.includes('marketing-screenshots'))).toBe(false);
  });
});
