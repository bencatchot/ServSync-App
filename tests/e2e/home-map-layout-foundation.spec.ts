import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const sqlSource = () => sourceFile('servsync-home-map-layout-foundation.sql');

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

test.describe('home_room_layouts foundation SQL', () => {
  test('creates simple room layout rows without CAD, media, key-location, or contractor fields', () => {
    const source = sqlSource();

    expect(source).toContain('create table if not exists public.home_room_layouts');
    expect(source).toContain('home_id uuid not null references public.homes(id) on delete cascade');
    expect(source).toContain('home_room_id uuid not null references public.home_rooms(id) on delete cascade');
    expect(source).toContain('layout_x integer not null default 0');
    expect(source).toContain('layout_y integer not null default 0');
    expect(source).toContain('layout_width integer not null default 4');
    expect(source).toContain('layout_height integer not null default 3');
    expect(source).toContain('measured_width numeric(8,2)');
    expect(source).toContain('measured_depth numeric(8,2)');
    expect(source).toContain("measurement_unit is null or measurement_unit in ('ft', 'm')");
    expect(source).toContain('home_room_layouts_grid_bounds');
    expect(source).toContain('home_room_layouts_active_room_unique_idx');
    expect(source).toContain('home_room_layouts_home_archived_sort_idx');
    expect(source).toContain('home_room_layouts_home_floor_archived_idx');
    const tableBlock = source.match(/create table if not exists public\.home_room_layouts \(([\s\S]*?)\n\);/i)?.[1] || '';

    for (const forbidden of [
      'key_location',
      'lockbox',
      'gate_code',
      'alarm',
      'hidden_key',
      'access_instruction',
      'storage_path',
      'photo',
      'media',
      'cad_',
      'lidar',
      'scan',
      'three_d',
      'contractor',
      'proposal',
    ]) {
      expect(tableBlock.toLowerCase(), `home_room_layouts should avoid ${forbidden}`).not.toContain(forbidden);
    }
  });

  test('enforces same-home rooms, identity protection, shared read-only, owner/admin management, and no hard delete', () => {
    const source = sqlSource();

    expect(source).toContain('create or replace function public.home_room_layouts_validate_home_room()');
    expect(source).toContain('Home map room must belong to the same home as the layout.');
    expect(source).toContain('before insert or update of home_id, home_room_id on public.home_room_layouts');
    expect(source).toContain('create or replace function public.home_room_layouts_protect_identity()');
    expect(source).toContain('Home map layout id cannot be changed.');
    expect(source).toContain('Home map layout cannot be moved to another home.');
    expect(source).toContain('Home map layout cannot be moved to another room.');
    expect(source).toContain('Home map layout creator cannot be changed.');
    expect(source).toContain('alter table public.home_room_layouts enable row level security');
    expect(source).toContain('Home room layouts: active shared roles read');
    expect(source).toContain('public.current_user_can_access_home(home_id)');
    expect(source).toContain('Home room layouts: owner admin inserts');
    expect(source).toContain('Home room layouts: owner admin updates');
    expect(source).toContain('public.current_user_can_manage_home(home_id)');
    expect(source).toContain('grant select, insert, update on table public.home_room_layouts to authenticated');
    expect(source).not.toMatch(/create policy[\s\S]*?for delete[\s\S]*?on public\.home_room_layouts/i);
    expect(source).not.toMatch(/grant[\s\S]*delete[\s\S]*on table public\.home_room_layouts/i);
    expect(source).toContain('revoke all on function public.home_room_layouts_validate_home_room() from public');
    expect(source).toContain('revoke all on function public.home_room_layouts_protect_identity() from authenticated');
  });

  test('keeps assets manager-only so shared member/viewer roles cannot query notes', () => {
    const source = sqlSource();

    expect(source).toContain('drop policy if exists "Home assets: owner admin read" on public.home_assets');
    expect(source).toContain('drop policy if exists "Home assets: active shared roles read" on public.home_assets');
    expect(source).toContain('Home assets: owner admin read');
    expect(source).toContain('public.current_user_can_manage_home(home_id)');
    expect(source).not.toMatch(/create policy "Home assets: active shared roles read"[\s\S]*public\.current_user_can_access_home\(home_id\)/);
    expect(source).not.toMatch(/create policy[\s\S]*Home assets[\s\S]*contractor/i);
    expect(source).not.toMatch(/grant[\s\S]*delete[\s\S]*on table public\.home_assets/i);
    expect(source).not.toContain('storage.objects');
    expect(source).not.toContain('create bucket');
  });

  test('changed-file scope stays within approved Home Map / Rooms & Systems files', () => {
    const files = changedFiles();
    const allowedFiles = new Set([
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
      expect(allowedFiles.has(file), `${file} should be approved for Home Map v1 / Rooms & Systems v1`).toBe(true);
    }
    expect(files.some(file => file.includes('supabase/functions/'))).toBe(false);
    expect(files.some(file => file.includes('.env'))).toBe(false);
    expect(files.some(file => file.includes('package'))).toBe(false);
    expect(files.some(file => file.includes('vercel'))).toBe(false);
    expect(files.some(file => /storage|bucket/i.test(file))).toBe(false);
  });
});
