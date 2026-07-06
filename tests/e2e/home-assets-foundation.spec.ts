import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sqlPath = 'servsync-home-assets-foundation.sql';
const sqlSource = () => readFileSync(resolve(process.cwd(), sqlPath), 'utf8');

function sourceFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
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

  return Array.from(
    new Set(
      `${branchDiff}\n${workingTreeDiff}\n${untracked}`
        .split('\n')
        .map(file => file.trim())
        .filter(Boolean),
    ),
  );
}

function createTableBlock(source: string) {
  const match = source.match(/create table if not exists public\.home_assets \(([\s\S]*?)\n\);/i);
  expect(match, 'home_assets create table block should exist').toBeTruthy();
  return match?.[1] ?? '';
}

test.describe('home_assets foundation SQL', () => {
  test('creates a property-scoped home_assets table with safe baseline fields and constraints', () => {
    const source = sqlSource();
    const table = createTableBlock(source);

    expect(source).toContain('create table if not exists public.home_assets');
    expect(table).toContain('id uuid primary key default gen_random_uuid()');
    expect(table).toContain('home_id uuid not null references public.homes(id) on delete cascade');
    expect(table).toContain('home_room_id uuid references public.home_rooms(id) on delete set null');
    expect(table).toContain('asset_category text not null');
    expect(table).toContain('asset_type text');
    expect(table).toContain('name text not null');
    expect(table).toContain('manufacturer text');
    expect(table).toContain('model text');
    expect(table).toContain('install_date date');
    expect(table).toContain('warranty_expires_on date');
    expect(table).toContain('notes text');
    expect(table).toContain('archived_at timestamptz');
    expect(table).toContain('created_by uuid not null references auth.users(id) on delete restrict');
    expect(table).toContain('created_at timestamptz not null default now()');
    expect(table).toContain('updated_at timestamptz not null default now()');

    expect(table).toContain('constraint home_assets_name_not_blank');
    expect(table).toContain('length(trim(name)) > 0');
    expect(table).toContain('constraint home_assets_asset_category_not_blank');
    expect(table).toContain('length(trim(asset_category)) > 0');
    expect(table).toContain('constraint home_assets_name_length');
    expect(table).toContain('char_length(name) <= 160');
    expect(table).toContain('constraint home_assets_asset_category_length');
    expect(table).toContain('char_length(asset_category) <= 80');
    expect(table).toContain('constraint home_assets_asset_type_length');
    expect(table).toContain('char_length(asset_type) <= 120');
    expect(table).toContain('constraint home_assets_manufacturer_length');
    expect(table).toContain('char_length(manufacturer) <= 120');
    expect(table).toContain('constraint home_assets_model_length');
    expect(table).toContain('char_length(model) <= 120');
    expect(table).toContain('constraint home_assets_notes_length');
    expect(table).toContain('char_length(notes) <= 4000');
    expect(table).toContain('constraint home_assets_install_date_sane');
    expect(table).toContain("install_date >= date '1800-01-01'");
    expect(table).toContain('constraint home_assets_warranty_date_sane');
    expect(table).toContain("warranty_expires_on >= date '1800-01-01'");
  });

  test('adds useful indexes, timestamp trigger, identity protection, and same-home room validation', () => {
    const source = sqlSource();

    expect(source).toContain('home_assets_home_archived_idx');
    expect(source).toContain('on public.home_assets(home_id, archived_at)');
    expect(source).toContain('home_assets_home_room_archived_idx');
    expect(source).toContain('on public.home_assets(home_id, home_room_id, archived_at)');
    expect(source).toContain('home_assets_home_category_archived_idx');
    expect(source).toContain('on public.home_assets(home_id, asset_category, archived_at)');
    expect(source).toContain('home_assets_created_by_idx');
    expect(source).toContain('on public.home_assets(created_by)');
    expect(source).toContain('home_assets_touch_updated_at');
    expect(source).toContain('for each row execute function public.touch_updated_at()');

    expect(source).toContain('create or replace function public.home_assets_validate_home_room()');
    expect(source).toContain('security definer');
    expect(source).toContain('set search_path = public');
    expect(source).toContain('if new.home_room_id is null then');
    expect(source).toContain('return new;');
    expect(source).toContain('select hr.home_id');
    expect(source).toContain('from public.home_rooms hr');
    expect(source).toContain('where hr.id = new.home_room_id');
    expect(source).toContain("raise exception 'Home room not found.'");
    expect(source).toContain('if v_room_home_id is distinct from new.home_id then');
    expect(source).toContain("raise exception 'Home asset room must belong to the same home as the asset.'");
    expect(source).toContain('Archived rooms may remain linked for historical continuity.');
    expect(source).not.toContain('archived_at is null');
    expect(source).toContain('before insert or update of home_id, home_room_id on public.home_assets');
    expect(source).toContain('for each row execute function public.home_assets_validate_home_room()');

    expect(source).toContain('create or replace function public.home_assets_protect_identity()');
    expect(source).toContain('Home asset id cannot be changed.');
    expect(source).toContain('Home asset cannot be moved to another home.');
    expect(source).toContain('Home asset creator cannot be changed.');
    expect(source).toContain('before update on public.home_assets');
    expect(source).toContain('for each row execute function public.home_assets_protect_identity()');
  });

  test('uses owner/admin-only RLS, denies member/viewer browsing, and omits normal browser hard deletes', () => {
    const source = sqlSource();

    expect(source).toContain('alter table public.home_assets enable row level security');
    expect(source).toContain('Home assets: owner admin read');
    expect(source).toContain('Home assets: owner admin inserts');
    expect(source).toContain('Home assets: owner admin updates');
    expect(source).toContain('public.current_user_can_manage_home(home_id)');
    expect(source).toContain('created_by = auth.uid()');
    expect(source).toContain('public.current_user_is_platform_admin()');
    expect(source).not.toContain('public.current_user_can_access_home(home_id)');
    expect(source).not.toMatch(/Home assets:[\s\S]*member/i);
    expect(source).not.toMatch(/Home assets:[\s\S]*viewer/i);

    expect(source).toContain('revoke all on table public.home_assets from public');
    expect(source).toContain('revoke all on table public.home_assets from anon');
    expect(source).toContain('revoke all on table public.home_assets from authenticated');
    expect(source).toContain('grant select, insert, update on table public.home_assets to authenticated');
    expect(source).not.toMatch(/create policy[\s\S]*?for delete[\s\S]*?on public\.home_assets/i);
    expect(source).not.toMatch(/grant[\s\S]*delete[\s\S]*on table public\.home_assets/i);

    expect(source).toContain('revoke all on function public.home_assets_validate_home_room() from public');
    expect(source).toContain('revoke all on function public.home_assets_validate_home_room() from anon');
    expect(source).toContain('revoke all on function public.home_assets_validate_home_room() from authenticated');
    expect(source).toContain('revoke all on function public.home_assets_protect_identity() from public');
    expect(source).toContain('revoke all on function public.home_assets_protect_identity() from anon');
    expect(source).toContain('revoke all on function public.home_assets_protect_identity() from authenticated');
  });

  test('keeps assets non-sensitive and excludes key-location, security, map, media, and workflow fields', () => {
    const source = sqlSource();
    const table = createTableBlock(source).toLowerCase();

    for (const forbiddenColumn of [
      'serial',
      'lockbox',
      'gate_code',
      'alarm',
      'security',
      'hidden_key',
      'access_code',
      'access_notes',
      'shutoff',
      'key_location',
      'photo',
      'media',
      'storage_path',
      'latitude',
      'longitude',
      'x_position',
      'y_position',
      'layout',
      'coordinates',
      'floor_plan',
      'local_home_id',
      'contractor_id',
      'document_id',
      'reminder_id',
      'inspection_id',
      'job_id',
      'estimate_id',
      'invoice_id',
    ]) {
      expect(table, `home_assets should not add ${forbiddenColumn} fields`).not.toContain(forbiddenColumn);
    }

    for (const forbidden of [
      'public.home_reminders',
      'public.home_documents',
      'public.inspections',
      'public.job_work_items',
      'public.estimates',
      'public.invoices',
      'rooms_with_findings',
      'inspection_templates',
      'home_map',
      'home_key_locations',
      'key_locations',
      'storage.',
      'public.contractor_local_homes',
      'public.contractor_profiles',
      'public.connection_shared_properties',
      'servsync_list_my_shared_home_shells',
      'servsync_list_my_shared_home_reminder_shells',
    ]) {
      expect(source, `SQL should not touch ${forbidden}`).not.toContain(forbidden);
    }
  });

  test('does not expand SQL shells, contractor surfaces, storage, or workflow behavior', () => {
    const appSource = sourceFile('src/App.tsx');
    const sharedHomeShellSource = sourceFile('servsync-shared-home-shell.sql');
    const sharedReminderShellSource = sourceFile('servsync-shared-home-reminders-shell.sql');
    const contractorSource = appSource.slice(
      appSource.indexOf('function ContractorDashboard({ profile, onSignOut }'),
      appSource.indexOf('function PlatformAdminDashboard({ onSignOut }'),
    );

    expect(appSource).toContain(".from('home_assets')");
    expect(appSource).toContain('Assets &amp; Systems');
    expect(sharedHomeShellSource).not.toContain('home_assets');
    expect(sharedReminderShellSource).not.toContain('home_assets');
    expect(contractorSource).not.toContain('home_assets');
    expect(contractorSource).not.toContain('home_room_id');
  });

  test('changed-file scope stays SQL, tests, and planning docs only', () => {
    const files = changedFiles();
    const allowedFiles = new Set([
      'servsync-home-assets-foundation.sql',
      'servsync-home-map-layout-foundation.sql',
      'src/App.tsx',
      'src/types.ts',
      'tests/e2e/home-assets-foundation.spec.ts',
      'tests/e2e/home-assets-ui.spec.ts',
      'tests/e2e/home-document-room-ui.spec.ts',
      'tests/e2e/home-map-layout-foundation.spec.ts',
      'tests/e2e/home-map-ui.spec.ts',
      'tests/e2e/home-reminder-room-ui.spec.ts',
      'tests/e2e/home-room-detail-ui.spec.ts',
      'tests/e2e/home-rooms-ui.spec.ts',
      'tests/e2e/security-catalog.spec.ts',
      'docs/servsync-master-plan/ServSync_Feature_Backlog.md',
      'docs/servsync-master-plan/CHANGELOG.md',
      'docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md',
    ]);

    expect(files.length, 'branch should have changed files for this slice').toBeGreaterThan(0);
    for (const file of files) {
      expect(allowedFiles.has(file), `${file} should be an approved home_assets foundation file`).toBe(true);
    }

    expect(files.some(file => file.endsWith('.sql') && !['servsync-home-assets-foundation.sql', 'servsync-home-map-layout-foundation.sql'].includes(file))).toBe(false);
    expect(files.some(file => file.includes('supabase/functions/'))).toBe(false);
    expect(files.some(file => file.includes('.env'))).toBe(false);
    expect(files.some(file => file.includes('package'))).toBe(false);
    expect(files.some(file => file.includes('vercel'))).toBe(false);
    expect(files.some(file => /storage|bucket/i.test(file) && file !== 'servsync-home-assets-foundation.sql')).toBe(false);
  });
});
