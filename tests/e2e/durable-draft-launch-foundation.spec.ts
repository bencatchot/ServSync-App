import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sqlPath = resolve(process.cwd(), 'servsync-durable-draft-launch-foundation.sql');
const permissionCorrectionSqlPath = resolve(
  process.cwd(),
  'servsync-durable-draft-launch-permission-parity-correction.sql',
);

function sourceFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

function sqlSource() {
  return readFileSync(sqlPath, 'utf8');
}

function permissionCorrectionSqlSource() {
  return readFileSync(permissionCorrectionSqlPath, 'utf8');
}

function topLevelSqlStatements(source: string) {
  const statements: string[] = [];
  let current = '';
  let index = 0;
  let quote: 'single' | 'double' | null = null;
  let dollarTag: string | null = null;
  let blockCommentDepth = 0;
  let lineComment = false;

  while (index < source.length) {
    if (lineComment) {
      if (source[index] === '\n') lineComment = false;
      index += 1;
      continue;
    }
    if (blockCommentDepth > 0) {
      if (source.startsWith('/*', index)) {
        blockCommentDepth += 1;
        index += 2;
      } else if (source.startsWith('*/', index)) {
        blockCommentDepth -= 1;
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    if (dollarTag) {
      if (source.startsWith(dollarTag, index)) {
        current += dollarTag;
        index += dollarTag.length;
        dollarTag = null;
      } else {
        current += source[index];
        index += 1;
      }
      continue;
    }
    if (quote) {
      current += source[index];
      if (source[index] === (quote === 'single' ? "'" : '"')) {
        if (source[index + 1] === source[index]) {
          current += source[index + 1];
          index += 2;
          continue;
        }
        quote = null;
      }
      index += 1;
      continue;
    }
    if (source.startsWith('--', index)) {
      lineComment = true;
      index += 2;
      continue;
    }
    if (source.startsWith('/*', index)) {
      blockCommentDepth = 1;
      index += 2;
      continue;
    }
    if (source[index] === "'") {
      quote = 'single';
      current += source[index];
      index += 1;
      continue;
    }
    if (source[index] === '"') {
      quote = 'double';
      current += source[index];
      index += 1;
      continue;
    }
    if (source[index] === '$') {
      const tag = source.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
      if (tag) {
        dollarTag = tag;
        current += tag;
        index += tag.length;
        continue;
      }
    }
    if (source[index] === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      index += 1;
      continue;
    }
    current += source[index];
    index += 1;
  }

  expect(quote).toBeNull();
  expect(dollarTag).toBeNull();
  expect(blockCommentDepth).toBe(0);
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function predecessorFingerprint(fields: string[]) {
  return createHash('md5').update(fields.map(field => field ?? '').join('\x1f')).digest('hex');
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
    expect(sql).toContain('contractor_work_draft_launches_estimate_snapshot_unique_idx');
    expect(sql).toContain('contractor_work_draft_launches_job_snapshot_unique_idx');
    expect(sql).toContain('launched_estimate_id uuid references public.estimates(id) on delete set null');
    expect(sql).toContain('launched_job_id uuid references public.inspections(id) on delete set null');
    expect(sql).toContain('launched_estimate_id_snapshot uuid');
    expect(sql).toContain('launched_job_id_snapshot uuid');
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

  test('retains contractor audit history and keeps subject deletion constraints coherent', () => {
    const sql = sqlSource();
    const draftsTable = sourceBetween(sql, 'create table if not exists public.contractor_work_drafts', 'create table if not exists public.contractor_work_draft_items');
    const itemsTable = sourceBetween(sql, 'create table if not exists public.contractor_work_draft_items', 'create table if not exists public.contractor_work_draft_launches');
    const launchesTable = sourceBetween(sql, 'create table if not exists public.contractor_work_draft_launches', 'create unique index if not exists contractor_work_drafts_legacy_inspection_unique_idx');

    expect(draftsTable).toContain('contractor_id uuid not null references public.contractor_profiles(id) on delete restrict');
    expect(itemsTable).toContain('contractor_id uuid not null references public.contractor_profiles(id) on delete restrict');
    expect(launchesTable).toContain('contractor_id uuid not null references public.contractor_profiles(id) on delete restrict');
    expect(launchesTable).toContain('draft_id uuid not null references public.contractor_work_drafts(id) on delete restrict');
    expect(draftsTable).toContain("subject_type text not null check (subject_type in ('connected_homeowner', 'local_contact'))");
    expect(draftsTable).toContain('subject_display_name_snapshot text not null');
    expect(draftsTable).toContain("status <> 'active' or homeowner_user_id is not null");
    expect(draftsTable).toContain("status <> 'active' or local_contact_id is not null");
    expect(draftsTable).toContain("constraint contractor_work_drafts_property_subject_check check (\n    status <> 'active'");
    expect(draftsTable).toContain('launched_estimate_id uuid references public.estimates(id) on delete set null');
    expect(draftsTable).toContain('launched_job_id uuid references public.inspections(id) on delete set null');
    expect(launchesTable).toContain('launched_estimate_id uuid references public.estimates(id) on delete set null');
    expect(launchesTable).toContain('launched_job_id uuid references public.inspections(id) on delete set null');
    expect(sql).toContain('Contractor deletion is restricted while Draft audit records exist.');
    expect(sql).toContain('consumed or discarded Drafts are immutable and may retain only private snapshots after subject deletion.');
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

  test('Draft persistence uses the same capability union in canonical and correction SQL', () => {
    const canonical = sqlSource();
    const correction = permissionCorrectionSqlSource();
    const helperStart = 'create or replace function public.servsync_private_can_persist_work_draft';
    const saveStart = 'create or replace function public.servsync_save_work_draft';
    const canonicalHelper = sourceBetween(canonical, helperStart, saveStart);
    const correctionHelper = sourceBetween(correction, helperStart, saveStart);
    const canonicalSave = sourceBetween(
      canonical,
      saveStart,
      'create or replace function public.servsync_private_validate_work_draft_relationships',
    );
    const correctionSave = sourceBetween(
      correction,
      saveStart,
      'revoke all on function public.servsync_private_can_persist_work_draft',
    );

    expect(correctionHelper.trim()).toBe(canonicalHelper.trim());
    expect(correctionSave.trim()).toBe(canonicalSave.trim());
    for (const helper of [canonicalHelper, correctionHelper]) {
      expect(helper).toContain('current_user_can_manage_contractor_billing(p_contractor_id)');
      expect(helper).toContain('current_user_can_write_contractor_jobs(p_contractor_id)');
      expect(helper).toMatch(/manage_contractor_billing\(p_contractor_id\)\s+or\s+public\.current_user_can_write_contractor_jobs/s);
      expect(helper).not.toMatch(/field_tech|office|admin|owner/i);
      expect(helper).toContain('set search_path = public');
    }
    for (const saveRpc of [canonicalSave, correctionSave]) {
      expect(saveRpc).toContain('public.servsync_private_can_persist_work_draft(v_contractor_id)');
      expect(saveRpc).toContain("raise exception using message = 'DRAFT_PERMISSION_DENIED'");
      expect(saveRpc).not.toMatch(/current_user_can_manage_contractor_billing\(v_contractor_id\)[^\n]*then/);
    }
  });

  test('permission correction is function-only and preserves launch, import, RLS, and data', () => {
    const correction = permissionCorrectionSqlSource();
    const statements = topLevelSqlStatements(correction);
    const allowedStatements = [
      /^begin$/i,
      /^do\s+\$/i,
      /^create\s+or\s+replace\s+function\b/i,
      /^revoke\b/i,
      /^grant\b/i,
      /^comment\b/i,
      /^notify\b/i,
      /^commit$/i,
    ];

    expect(correction.trim().startsWith('-- ServSync durable Draft launch permission-parity correction.')).toBe(true);
    expect(statements[0]).toBe('begin');
    expect(statements[1]).toMatch(/^do\s+\$\$/i);
    expect(statements.at(-1)).toBe('commit');
    for (const statement of statements) {
      expect(allowedStatements.some(pattern => pattern.test(statement)), statement.slice(0, 120)).toBe(true);
    }
    expect(statements.some(statement => /^(?:insert|update|delete|merge|truncate)\b/i.test(statement))).toBe(false);
    expect(statements.some(statement => /^(?:alter|create|drop)\s+(?:table|index|trigger|policy)\b/i.test(statement))).toBe(false);
    expect(correction).toContain("to_regprocedure('public.servsync_save_work_draft(uuid,jsonb,jsonb,jsonb)')");
    expect(correction).toContain('grant execute on function public.servsync_save_work_draft(uuid, jsonb, jsonb, jsonb) to authenticated');
    expect(correction).toContain('revoke all on function public.servsync_private_can_persist_work_draft(uuid) from authenticated');
    expect(correction).toContain("notify pgrst, 'reload schema'");
    expect(correction).not.toMatch(/\bcreate\s+table\b|\balter\s+table\b|\bdrop\s+table\b/i);
    expect(Array.from(correction.matchAll(/create or replace function public\.([^(\s]+)/g), match => match[1])).toEqual([
      'servsync_private_can_persist_work_draft',
      'servsync_save_work_draft',
    ]);
    expect(correction).not.toContain('create or replace function public.servsync_launch_work_draft');
    expect(correction).not.toContain('create or replace function public.servsync_import_legacy_draft_job');
    expect(correction).not.toMatch(/create policy|drop policy|enable row level security/i);
  });

  test('permission correction requires the exact reviewed predecessor before replacement', () => {
    const correction = permissionCorrectionSqlSource();
    const statements = topLevelSqlStatements(correction);
    const guard = statements[1];
    const helperIndex = statements.findIndex(statement => statement.startsWith('create or replace function public.servsync_private_can_persist_work_draft'));
    const saveIndex = statements.findIndex(statement => statement.startsWith('create or replace function public.servsync_save_work_draft'));

    expect(helperIndex).toBeGreaterThan(1);
    expect(saveIndex).toBeGreaterThan(helperIndex);
    expect(guard).toContain("proc.proname = 'servsync_save_work_draft'");
    expect(guard).toContain(') <> 1 then');
    expect(guard).toContain("to_regprocedure('public.servsync_save_work_draft(uuid,jsonb,jsonb,jsonb)')");
    expect(guard).toContain("v_save_fingerprint <> '04e8524257fb6fb60a843e4d509045c6'");
    for (const attribute of [
      'pg_get_function_identity_arguments(proc.oid)',
      'pg_get_function_arguments(proc.oid)',
      'oidvectortypes(proc.proargtypes)',
      'pg_get_function_result(proc.oid)',
      'proc.prokind::text',
      'language.lanname',
      'proc.prosecdef::text',
      'proc.proleakproof::text',
      'proc.proisstrict::text',
      'proc.provolatile::text',
      'proc.proparallel::text',
      'array_to_string(proc.proconfig',
      'proc.prosrc',
    ]) expect(guard).toContain(attribute);
    expect(guard).toContain("has_function_privilege('public', v_save_oid, 'execute')");
    expect(guard).toContain("has_function_privilege('anon', v_save_oid, 'execute')");
    expect(guard).toContain("has_function_privilege('authenticated', v_save_oid, 'execute')");
    expect(guard).toContain("proc.proname = 'servsync_private_can_persist_work_draft'");
    expect(guard).toContain('SLICE_2B_PERMISSION_PARITY_HELPER_ALREADY_EXISTS');
  });

  test('permission correction fingerprint detects predecessor default-argument drift', () => {
    const guard = topLevelSqlStatements(permissionCorrectionSqlSource())[1];
    const identityArguments = 'p_draft_id uuid, p_metadata jsonb, p_items jsonb, p_removed_item_ids jsonb';
    const installedFullArguments = "p_draft_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb, p_items jsonb DEFAULT '[]'::jsonb, p_removed_item_ids jsonb DEFAULT '[]'::jsonb";
    const defaultVariants = [
      "p_draft_id uuid, p_metadata jsonb DEFAULT '{}'::jsonb, p_items jsonb DEFAULT '[]'::jsonb, p_removed_item_ids jsonb DEFAULT '[]'::jsonb",
      "p_draft_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT NULL::jsonb, p_items jsonb DEFAULT '[]'::jsonb, p_removed_item_ids jsonb DEFAULT '[]'::jsonb",
      "p_draft_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '[]'::jsonb, p_items jsonb DEFAULT '[]'::jsonb, p_removed_item_ids jsonb DEFAULT '[]'::jsonb",
      "p_draft_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb, p_items jsonb DEFAULT '{}'::jsonb, p_removed_item_ids jsonb DEFAULT '[]'::jsonb",
      "p_draft_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::jsonb, p_items jsonb DEFAULT '[]'::jsonb, p_removed_item_ids jsonb DEFAULT NULL::jsonb",
      "p_draft_id uuid DEFAULT NULL::uuid, p_metadata jsonb DEFAULT '{}'::text::jsonb, p_items jsonb DEFAULT '[]'::jsonb, p_removed_item_ids jsonb DEFAULT '[]'::jsonb",
    ];
    const fixedCatalogFields = [
      'public',
      'servsync_save_work_draft',
      identityArguments,
      'uuid, jsonb, jsonb, jsonb',
      'jsonb',
      'f',
      'plpgsql',
      'true',
      'false',
      'false',
      'v',
      'u',
      'search_path=public',
      'installed predecessor body fixture',
    ];
    const identityOnlyFingerprint = predecessorFingerprint(fixedCatalogFields);
    const installedFingerprint = predecessorFingerprint([
      ...fixedCatalogFields.slice(0, 3),
      installedFullArguments,
      ...fixedCatalogFields.slice(3),
    ]);

    expect(guard).toContain("coalesce(pg_get_function_arguments(proc.oid), '')");
    expect(guard).toContain('identity and full arguments (including defaults)');
    expect(guard).toContain("v_save_fingerprint <> '04e8524257fb6fb60a843e4d509045c6'");
    expect(new Set(defaultVariants.map(() => predecessorFingerprint(fixedCatalogFields)))).toEqual(
      new Set([identityOnlyFingerprint]),
    );
    const variantFingerprints = defaultVariants.map(variant => predecessorFingerprint([
      ...fixedCatalogFields.slice(0, 3),
      variant,
      ...fixedCatalogFields.slice(3),
    ]));
    expect(new Set(variantFingerprints).size).toBe(defaultVariants.length);
    for (const fingerprint of variantFingerprints) expect(fingerprint).not.toBe(installedFingerprint);
  });

  test('permission correction verifies save dependencies, row types, columns, and installation markers', () => {
    const guard = topLevelSqlStatements(permissionCorrectionSqlSource())[1];

    for (const dependency of [
      "('auth', 'uid', '', 'uuid')",
      "('public', 'current_user_can_manage_contractor_billing', 'uuid', 'boolean')",
      "('public', 'current_user_can_write_contractor_jobs', 'uuid', 'boolean')",
      "('public', 'servsync_current_contractor_profile', '', 'TABLE(",
      "('public', 'servsync_get_work_draft', 'uuid', 'jsonb')",
      "('public', 'servsync_private_work_draft_integer', 'text, text', 'integer')",
      "('public', 'servsync_private_work_draft_numeric', 'text, text', 'numeric')",
      "('public', 'servsync_private_work_draft_uuid', 'text, text', 'uuid')",
    ]) expect(guard).toContain(dependency);
    expect(guard).toContain('actual.overload_count <> 1');

    for (const rowType of [
      'public.contractor_work_drafts',
      'public.contractor_work_draft_items',
      'public.service_requests',
      'public.homes',
      'public.profiles',
      'public.contractor_local_contacts',
      'public.contractor_local_homes',
      'public.homeowner_contractor_connections',
      'public.inspections',
    ]) expect(guard).toContain(`('${rowType}')`);
    expect(guard).toContain('to_regtype(type_name) is null');

    for (const columnContract of [
      "('contractor_work_drafts', 'subject_display_name_snapshot', 'text')",
      "('contractor_work_drafts', 'job_labor_hours', 'numeric(8,2)')",
      "('contractor_work_draft_items', 'quantity', 'numeric(12,2)')",
      "('contractor_work_draft_items', 'labor_hours', 'numeric(8,2)')",
      "('service_requests', 'home_id', 'uuid')",
      "('homeowner_contractor_connections', 'status', 'text')",
      "('contractor_local_homes', 'local_contact_id', 'uuid')",
      "('inspections', 'job_status', 'text')",
    ]) expect(guard).toContain(columnContract);
    expect(guard).toContain('format_type(attribute.atttypid, attribute.atttypmod)');

    for (const marker of [
      "to_regclass('public.contractor_work_draft_launches')",
      "to_regprocedure('public.servsync_get_work_draft(uuid)')",
      "to_regprocedure('public.servsync_import_legacy_draft_job(uuid,text)')",
      "to_regprocedure('public.servsync_launch_work_draft(uuid,text,uuid)')",
      "to_regclass('public.inspections_unique_operational_service_request_idx')",
      "trg.tgname = 'inspections_guard_operational_service_request'",
      'table_class.relrowsecurity',
      "('contractor_work_drafts', 'contractor_work_drafts_subject_check')",
      "('contractor_work_draft_items', 'contractor_work_draft_items_contractor_match_fk')",
      "('contractor_work_draft_launches', 'contractor_work_draft_launches_status_linkage_check')",
    ]) expect(guard).toContain(marker);
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

  test('legacy import validates and locks relationships before private snapshot reads', () => {
    const sql = sqlSource();
    const validator = sourceBetween(sql, 'create or replace function public.servsync_private_validate_legacy_work_draft_relationships', 'create or replace function public.servsync_import_legacy_draft_job');
    const importRpc = sourceBetween(sql, 'create or replace function public.servsync_import_legacy_draft_job', 'create or replace function public.servsync_private_launch_work_draft_as_estimate');

    expect(validator).toContain('homeowner_contractor_connections');
    expect(validator).toContain("connection.status = 'active'");
    expect(validator).toContain('request.contractor_id = p_job.contractor_id');
    expect(validator).toContain('v_request.homeowner_user_id <> p_job.homeowner_user_id');
    expect(validator).toContain('v_request.home_id is distinct from p_job.home_id');
    expect(validator).toContain('home.homeowner_user_id = p_job.homeowner_user_id');
    expect(validator).toContain('contact.contractor_id = p_job.contractor_id');
    expect(validator).toContain('home.local_contact_id = p_job.local_contact_id');
    expect(validator).toContain('for share');
    expect(validator.indexOf('from public.service_requests request')).toBeLessThan(validator.indexOf('from public.homeowner_contractor_connections connection'));
    expect(validator.indexOf('from public.homeowner_contractor_connections connection')).toBeLessThan(validator.indexOf('from public.homes home'));
    expect(validator.indexOf('from public.contractor_local_contacts contact')).toBeLessThan(validator.indexOf('from public.contractor_local_homes home'));
    expect(importRpc.indexOf('servsync_private_validate_legacy_work_draft_relationships(v_job)')).toBeLessThan(importRpc.indexOf('insert into public.contractor_work_drafts'));
    expect(importRpc).not.toMatch(/from public\.profiles profile[\s\S]{0,500}from public\.homes home/);
  });

  test('legacy import cannot disclose foreign compatibility before tenant authorization', () => {
    const sql = sqlSource();
    const importRpc = sourceBetween(sql, 'create or replace function public.servsync_import_legacy_draft_job', 'create or replace function public.servsync_private_launch_work_draft_as_estimate');
    const contractorLookupIndex = importRpc.indexOf('servsync_current_contractor_profile');
    const permissionIndex = importRpc.indexOf('current_user_can_manage_contractor_billing(v_contractor_id)');
    const inspectionLookupIndex = importRpc.indexOf('from public.inspections');
    const compatibilityIndex = importRpc.indexOf("v_job.job_origin <> 'draft_composer'");

    expect(contractorLookupIndex).toBeGreaterThanOrEqual(0);
    expect(permissionIndex).toBeGreaterThan(contractorLookupIndex);
    expect(inspectionLookupIndex).toBeGreaterThan(permissionIndex);
    expect(compatibilityIndex).toBeGreaterThan(inspectionLookupIndex);
    expect(importRpc).toContain('and (v_is_platform_admin or contractor_id = v_contractor_id)');
    expect(importRpc).toContain("raise exception using message = 'LEGACY_DRAFT_INCOMPATIBLE'");
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
    expect(launchRpc).toContain("raise exception using message = 'DRAFT_NOT_FOUND'");
    expect(sourceBetween(sql, 'create or replace function public.servsync_get_work_draft', 'create or replace function public.servsync_save_work_draft'))
      .toContain("raise exception using message = 'DRAFT_NOT_FOUND'");
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
    expect(launchRpc).toContain("v_constraint_name = 'inspections_unique_operational_service_request_idx'");
    expect(launchRpc).not.toMatch(/when unique_violation then\s*raise exception using message = 'LAUNCH_CONFLICT'/);
    expect(sql).not.toContain('failure_code');
    expect(sql).not.toContain("status in ('succeeded', 'failed')");
  });

  test('launch revalidates connected and local subjects in the same transaction', () => {
    const sql = sqlSource();
    const validator = sourceBetween(sql, 'create or replace function public.servsync_private_validate_work_draft_relationships', 'create or replace function public.servsync_private_can_create_work_draft_estimate');
    const launchRpc = sourceBetween(sql, 'create or replace function public.servsync_launch_work_draft', 'revoke execute on function public.servsync_get_work_draft');

    expect(validator).toContain('homeowner_contractor_connections');
    expect(validator).toContain('connection_shared_properties');
    expect(validator).toContain("connection.status = 'active'");
    expect(validator).toContain('home.homeowner_user_id = p_draft.homeowner_user_id');
    expect(validator).toContain('request.contractor_id = p_draft.contractor_id');
    expect(validator).toContain('v_request.homeowner_user_id <> p_draft.homeowner_user_id');
    expect(validator).toContain('v_request.home_id is distinct from p_draft.home_id');
    expect(validator).toContain('home.local_contact_id = p_draft.local_contact_id');
    expect(validator).toContain('SERVICE_REQUEST_INVALID');
    expect(validator).toContain("p_requested_output = 'job'");
    expect(validator).toContain('v_request_authorizes_home');
    expect(validator).toContain('PROPERTY_NOT_SHARED');
    expect(launchRpc).toContain('servsync_private_validate_work_draft_relationships(v_draft, v_output_type)');

    const requestLockIndex = validator.indexOf('from public.service_requests request');
    const connectionLockIndex = validator.indexOf('from public.homeowner_contractor_connections connection');
    const sharedPropertyLockIndex = validator.indexOf('from public.connection_shared_properties shared_property');
    const homeLockIndex = validator.indexOf('from public.homes home');
    const localContactLockIndex = validator.indexOf('from public.contractor_local_contacts contact');
    const localHomeLockIndex = validator.indexOf('from public.contractor_local_homes home');
    expect(requestLockIndex).toBeLessThan(connectionLockIndex);
    expect(connectionLockIndex).toBeLessThan(sharedPropertyLockIndex);
    expect(sharedPropertyLockIndex).toBeLessThan(homeLockIndex);
    expect(homeLockIndex).toBeLessThan(localContactLockIndex);
    expect(localContactLockIndex).toBeLessThan(localHomeLockIndex);
    expect(validator.split('for share').length - 1).toBeGreaterThanOrEqual(6);
  });

  test('Draft-to-Job property authorization matches the normal Job creation rule', () => {
    const sql = sqlSource();
    const validator = sourceBetween(sql, 'create or replace function public.servsync_private_validate_work_draft_relationships', 'create or replace function public.servsync_private_can_create_work_draft_estimate');
    const normalJob = sourceBetween(sourceFile('servsync-connection-shared-properties.sql'), 'create or replace function public.servsync_create_field_work', 'revoke execute on function public.servsync_create_field_work');

    for (const source of [validator, normalJob]) {
      expect(source).toContain('connection_shared_properties');
      expect(source).toContain("status = 'active'");
      expect(source).toContain('home_id');
      expect(source).toContain('service_request');
    }
    expect(normalJob).toContain('v_home_allowed_by_request');
    expect(validator).toContain('v_request_authorizes_home');
  });

  test('duplicate Job prevention excludes only the exact inactive legacy placeholder', () => {
    const sql = sqlSource();
    const launchRpc = sourceBetween(sql, 'create or replace function public.servsync_launch_work_draft', 'revoke execute on function public.servsync_get_work_draft');
    const legacyId = '11111111-1111-4111-8111-111111111111';
    const unrelatedId = '22222222-2222-4222-8222-222222222222';
    const isOperationalConflict = (job: { id: string; origin: string; status: string; jobStatus: string }) =>
      job.jobStatus !== 'cancelled' && !(
        job.id === legacyId
        && job.origin === 'draft_composer'
        && job.status === 'draft'
        && job.jobStatus === 'draft'
      );

    expect(launchRpc).toContain('job.id = v_draft.legacy_inspection_id');
    expect(launchRpc).toContain("job.job_origin = 'draft_composer'");
    expect(launchRpc).toContain("job.status = 'draft'");
    expect(launchRpc).toContain("job.job_status = 'draft'");
    expect(launchRpc).toContain("job.job_status <> 'cancelled'");
    expect(launchRpc).not.toContain("job.job_origin <> 'draft_composer'");
    expect(isOperationalConflict({ id: legacyId, origin: 'draft_composer', status: 'draft', jobStatus: 'draft' })).toBe(false);
    expect(isOperationalConflict({ id: legacyId, origin: 'draft_composer', status: 'active', jobStatus: 'scheduled' })).toBe(true);
    expect(isOperationalConflict({ id: unrelatedId, origin: 'draft_composer', status: 'draft', jobStatus: 'draft' })).toBe(true);
    expect(isOperationalConflict({ id: unrelatedId, origin: 'direct', status: 'active', jobStatus: 'cancelled' })).toBe(false);
    expect(isOperationalConflict({ id: unrelatedId, origin: 'direct', status: 'active', jobStatus: 'scheduled' })).toBe(true);
    expect(isOperationalConflict({ id: unrelatedId, origin: 'estimate', status: 'active', jobStatus: 'scheduled' })).toBe(true);
  });

  test('shared inspections guard serializes every operational service-request Job path', () => {
    const sql = sqlSource();
    const guard = sourceBetween(sql, 'create or replace function public.servsync_guard_operational_job_service_request', 'drop trigger if exists inspections_guard_operational_service_request');

    expect(sql).toContain('create unique index if not exists inspections_unique_operational_service_request_idx');
    expect(sql).toContain('before insert or update of contractor_id, service_request_id, status, job_status, job_origin');
    expect(guard).toContain('pg_advisory_xact_lock');
    expect(guard).toContain("new.contractor_id::text || ':' || new.service_request_id::text");
    expect(guard.indexOf('pg_advisory_xact_lock')).toBeLessThan(guard.indexOf('from public.inspections existing'));
    expect(guard).toContain("existing.job_status <> 'cancelled'");
    expect(guard).toContain('servsync_private_inspection_is_draft_placeholder');
    expect(guard).toContain("raise exception using message = 'JOB_SERVICE_REQUEST_CONFLICT'");
    expect(sourceFile('servsync-connection-shared-properties.sql')).toContain('insert into public.inspections');
    expect(sourceFile('servsync-draft-job-scope-backend-foundation.sql')).toContain('update public.inspections');
    expect(sourceFile('servsync-partial-invoicing-estimate-work-items.sql')).toContain('insert into public.inspections');
  });

  test('deleted outputs retain immutable private audit identity without reactivating Drafts', () => {
    const sql = sqlSource();
    const draftsTable = sourceBetween(sql, 'create table if not exists public.contractor_work_drafts', 'create table if not exists public.contractor_work_draft_items');
    const launchesTable = sourceBetween(sql, 'create table if not exists public.contractor_work_draft_launches', 'create unique index if not exists contractor_work_drafts_legacy_inspection_unique_idx');
    const launchRpc = sourceBetween(sql, 'create or replace function public.servsync_launch_work_draft', 'revoke execute on function public.servsync_get_work_draft');
    const types = sourceFile('src/features/drafts/durableDraftLaunchTypes.ts');
    const deleteRpc = sourceBetween(sourceFile('servsync-job-lifecycle.sql'), 'create or replace function public.servsync_delete_inspection', 'grant execute on function public.servsync_delete_inspection');

    for (const table of [draftsTable, launchesTable]) {
      expect(table).toContain('launched_estimate_id uuid references public.estimates(id) on delete set null');
      expect(table).toContain('launched_job_id uuid references public.inspections(id) on delete set null');
      expect(table).toContain('launched_estimate_id_snapshot uuid');
      expect(table).toContain('launched_job_id_snapshot uuid');
      expect(table).toContain('launched_job_id is null or launched_job_id = launched_job_id_snapshot');
    }
    expect(launchRpc).toContain("'output_id_snapshot'");
    expect(launchRpc).toContain("'output_available'");
    expect(launchRpc).toContain("set status = 'consumed'");
    expect(deleteRpc).toContain('delete from public.inspections');
    expect(deleteRpc).toContain("job_status = 'draft'");
    expect(types).toContain('output_id_snapshot: string');
    expect(types).toContain('output_available: boolean');
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
      'servsync_private_can_persist_work_draft',
      'servsync_private_validate_work_draft_relationships',
      'servsync_private_validate_legacy_work_draft_relationships',
      'servsync_private_can_create_work_draft_estimate',
      'servsync_private_inspection_is_draft_placeholder',
      'servsync_guard_operational_job_service_request',
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
    const mappingsSource = sourceFile('src/features/drafts/durableDraftMappings.ts');
    const appSource = sourceFile('src/App.tsx');
    const sharedComposerSource = sourceFile('src/features/drafts/ContractorDraftComposer.tsx');

    expect(typesSource).toContain('export type ContractorWorkDraftMetadataInput');
    expect(typesSource).toContain('metadata: ContractorWorkDraftMetadataInput');
    expect(typesSource).not.toContain('metadata: Record<string, unknown>');
    expect(typesSource).not.toContain("'succeeded' | 'failed'");
    expect(apiSource).toContain('p_metadata: metadata');
    expect(apiSource).toContain('p_removed_item_ids: removedItemIds');
    expect(mappingsSource).toContain('homeowner_user_id: draft.subject.homeownerUserId');
    expect(mappingsSource).toContain('legacy_inspection_id: draft.legacyInspectionId');
    expect(appSource).not.toContain('launchContractorWorkDraft');
    expect(sharedComposerSource).not.toContain('Create Estimate');
    expect(sharedComposerSource).not.toContain('Create Job');
    expect(sharedComposerSource).not.toContain('Create Invoice');
    expect(sharedComposerSource).not.toContain('Launch Draft');
  });

  test('documents typed top-level UUID coercion without overstating custom errors', () => {
    const sql = sqlSource();

    expect(sql).toContain('Typed UUID arguments are coerced by PostgREST/PostgreSQL before this function runs.');
    expect(sql).toContain('ServSync error codes apply after successful argument coercion');
    expect(sql).toContain('Foreign and unavailable legacy Draft IDs use the same non-enumerating compatibility response');
  });

  test('later frontend slices preserve protected SQL, deployment, and dependency scope', () => {
    const files = changedFiles();
    expect(files.length).toBeGreaterThan(0);
    expect(files).not.toContain('servsync-durable-draft-launch-foundation.sql');
    expect(files).not.toContain('servsync-durable-draft-launch-permission-parity-correction.sql');
    expect(files.some(file => /package|lock|vercel|supabase\/functions|marketing-screenshots|\.env/.test(file))).toBe(false);
  });

  test('Changelog file scope matches the final Slice 2B PR', () => {
    const changelog = sourceFile('docs/servsync-master-plan/CHANGELOG.md');
    const currentEntry = sourceBetween(changelog, '## 2026-07-19', '## 2026-07-18');

    expect(currentEntry).not.toContain('`src/types.ts`');
  });

  test('documents merged foundation, validated sandbox correction, and split Slice 2C plan', () => {
    const changelog = sourceFile('docs/servsync-master-plan/CHANGELOG.md');
    const backlog = sourceFile('docs/servsync-master-plan/ServSync_Feature_Backlog.md');
    const masterPlan = sourceFile('docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md');

    for (const source of [changelog, backlog, masterPlan]) {
      expect(source).toMatch(/PR #317 (?:is |subsequently )?merged|merged PR #317/i);
      expect(source).toMatch(/permission correction (?:is |was |were )?installed|foundation and permission correction are installed|both the foundation and its permission-parity correction installed/i);
      expect(source).toMatch(/runtime (?:matrix|validation) passed/i);
      expect(source).toContain('Production remains untouched');
      expect(source).toContain('Slice 2C-A');
      expect(source).toContain('Slice 2C-B');
      expect(source).toContain('Slice 2C-C');
      expect(source).toContain('Slice 2C-D');
    }
    expect(changelog).toContain('no UI wiring');
    expect(backlog).toContain('hidden typed durable API contracts');
    expect(masterPlan).toContain('typed durable adapters');
    expect(masterPlan).toContain('C1 does not auto-open the created output');
  });
});
