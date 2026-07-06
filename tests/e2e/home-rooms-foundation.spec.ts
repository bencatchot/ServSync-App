import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sqlPath = 'servsync-home-rooms-foundation.sql';
const sqlSource = () => readFileSync(resolve(process.cwd(), sqlPath), 'utf8');

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
  const match = source.match(/create table if not exists public\.home_rooms \(([\s\S]*?)\n\);/i);
  expect(match, 'home_rooms create table block should exist').toBeTruthy();
  return match?.[1] ?? '';
}

test.describe('home_rooms foundation SQL', () => {
  test('creates a property-scoped home_rooms table with safe baseline columns and constraints', () => {
    const source = sqlSource();
    const table = createTableBlock(source);

    expect(source).toContain('create table if not exists public.home_rooms');
    expect(table).toContain('id uuid primary key default gen_random_uuid()');
    expect(table).toContain('home_id uuid not null references public.homes(id) on delete cascade');
    expect(table).toContain('name text not null');
    expect(table).toContain('room_type text');
    expect(table).toContain('floor_label text');
    expect(table).toContain('area_label text');
    expect(table).toContain('sort_order integer not null default 0');
    expect(table).toContain('notes text');
    expect(table).toContain('archived_at timestamptz');
    expect(table).toContain('created_by uuid not null references auth.users(id) on delete restrict');
    expect(table).toContain('created_at timestamptz not null default now()');
    expect(table).toContain('updated_at timestamptz not null default now()');

    expect(table).toContain('constraint home_rooms_name_not_blank');
    expect(table).toContain('length(trim(name)) > 0');
    expect(table).toContain('constraint home_rooms_name_length');
    expect(table).toContain('char_length(name) <= 120');
    expect(table).toContain('constraint home_rooms_room_type_length');
    expect(table).toContain('char_length(room_type) <= 80');
    expect(table).toContain('constraint home_rooms_floor_label_length');
    expect(table).toContain('char_length(floor_label) <= 80');
    expect(table).toContain('constraint home_rooms_area_label_length');
    expect(table).toContain('char_length(area_label) <= 80');
    expect(table).toContain('constraint home_rooms_notes_length');
    expect(table).toContain('char_length(notes) <= 4000');
    expect(table).toContain('constraint home_rooms_sort_order_non_negative');
    expect(table).toContain('sort_order >= 0');

    expect(source).toContain('home_rooms_home_idx');
    expect(source).toContain('home_rooms_home_archived_idx');
    expect(source).toContain('home_rooms_home_sort_idx');
    expect(source).toContain('home_rooms_created_by_idx');
    expect(source).toContain('home_rooms_touch_updated_at');
    expect(source).toContain('home_rooms_protect_identity');
    expect(source).toContain('revoke all on function public.home_rooms_protect_identity() from public');
    expect(source).toContain('revoke all on function public.home_rooms_protect_identity() from anon');
    expect(source).toContain('revoke all on function public.home_rooms_protect_identity() from authenticated');
  });

  test('keeps rooms non-sensitive and excludes future map, asset, system, key-location, and local-property fields', () => {
    const source = sqlSource();
    const table = createTableBlock(source).toLowerCase();

    for (const forbiddenColumn of [
      'lockbox',
      'gate_code',
      'alarm',
      'hidden_key',
      'access_code',
      'access_notes',
      'shutoff',
      'system_id',
      'asset_id',
      'key_location',
      'latitude',
      'longitude',
      'x_position',
      'y_position',
      'layout',
      'coordinates',
      'floor_plan',
      'local_home_id',
      'contractor_id',
    ]) {
      expect(table, `home_rooms should not add ${forbiddenColumn} fields`).not.toContain(forbiddenColumn);
    }

    expect(source).not.toContain('contractor_local_homes');
    expect(source).not.toContain('contractor_local_contacts');
    expect(source).not.toContain('connection_shared_properties');
    expect(source).not.toContain('current_user_owns_contractor');
  });

  test('uses shared-home helpers for read/write policy without normal browser hard deletes', () => {
    const source = sqlSource();

    expect(source).toContain('alter table public.home_rooms enable row level security');
    expect(source).toContain('Home rooms: active shared roles read');
    expect(source).toContain('public.current_user_can_access_home(home_id)');
    expect(source).toContain('Home rooms: owner admin inserts');
    expect(source).toContain('Home rooms: owner admin updates');
    expect(source).toContain('public.current_user_can_manage_home(home_id)');
    expect(source).toContain('created_by = auth.uid()');
    expect(source).toContain('public.current_user_is_platform_admin()');

    expect(source).toContain('revoke all on table public.home_rooms from public');
    expect(source).toContain('revoke all on table public.home_rooms from anon');
    expect(source).toContain('revoke all on table public.home_rooms from authenticated');
    expect(source).toContain('grant select, insert, update on table public.home_rooms to authenticated');
    expect(source).not.toMatch(/create policy[\s\S]*?for delete[\s\S]*?on public\.home_rooms/i);
    expect(source).not.toMatch(/grant[\s\S]*delete[\s\S]*on table public\.home_rooms/i);
  });

  test('does not migrate or mutate inspection/checklist room data', () => {
    const source = sqlSource();

    expect(source).not.toContain('rooms_with_findings');
    expect(source).not.toContain('inspection_templates');
    expect(source).not.toContain('public.inspections');
    expect(source).not.toMatch(/alter table[\s\S]*inspection/i);
    expect(source).not.toMatch(/update public\.(inspections|inspection_templates)/i);
    expect(source).not.toMatch(/insert into public\.(inspections|inspection_templates)/i);
  });

  test('changed-file scope stays SQL, tests, and planning docs only', () => {
    const files = changedFiles();
    const allowedFiles = new Set([
      'servsync-home-rooms-foundation.sql',
      'tests/e2e/home-rooms-foundation.spec.ts',
      'tests/e2e/security-catalog.spec.ts',
      'docs/servsync-master-plan/ServSync_Feature_Backlog.md',
      'docs/servsync-master-plan/CHANGELOG.md',
      'docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md',
    ]);

    expect(files.length, 'branch should have changed files for this slice').toBeGreaterThan(0);
    for (const file of files) {
      expect(allowedFiles.has(file), `${file} should be an approved home_rooms foundation file`).toBe(true);
    }

    expect(files).not.toContain('src/App.tsx');
    expect(files.some(file => file.includes('supabase/functions/'))).toBe(false);
    expect(files.some(file => file.includes('.env'))).toBe(false);
    expect(files.some(file => file.includes('package'))).toBe(false);
    expect(files.some(file => file.includes('vercel'))).toBe(false);
  });
});
