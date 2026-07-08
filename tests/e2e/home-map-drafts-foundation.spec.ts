import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const sqlSource = () => sourceFile('servsync-home-map-drafts-foundation.sql');

function createTableBlock(source: string, tableName: string) {
  const match = source.match(new RegExp(`create table if not exists public\\.${tableName} \\(([\\s\\S]*?)\\n\\);`, 'i'));
  expect(match, `${tableName} create table block should exist`).toBeTruthy();
  return match?.[1] || '';
}

function functionBlock(source: string, functionName: string) {
  const start = source.indexOf(`create or replace function public.${functionName}`);
  expect(start, `${functionName} should exist`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf('\ncreate or replace function public.', start + 1);
  return source.slice(start, next === -1 ? undefined : next);
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

test.describe('home_map_drafts foundation SQL', () => {
  test('creates workflow-scoped draft header, room, and layout tables without sensitive live-map expansion', () => {
    const source = sqlSource();
    const draftsTable = createTableBlock(source, 'home_map_drafts');
    const roomsTable = createTableBlock(source, 'home_map_draft_rooms');
    const layoutsTable = createTableBlock(source, 'home_map_draft_room_layouts');

    expect(draftsTable).toContain('home_id uuid not null references public.homes(id) on delete cascade');
    expect(draftsTable).toContain('homeowner_user_id uuid not null references auth.users(id) on delete cascade');
    expect(draftsTable).toContain('contractor_id uuid not null references public.contractor_profiles(id) on delete cascade');
    expect(draftsTable).toContain('service_request_id uuid not null references public.service_requests(id) on delete cascade');
    expect(draftsTable).toContain("check (status in ('draft', 'submitted', 'accepted', 'declined', 'revoked'))");
    expect(draftsTable).toContain('created_by_user_id uuid not null references auth.users(id) on delete restrict');

    expect(roomsTable).toContain('draft_id uuid not null references public.home_map_drafts(id) on delete cascade');
    expect(roomsTable).toContain('source_home_room_id uuid references public.home_rooms(id) on delete set null');
    expect(roomsTable).toContain('constraint home_map_draft_rooms_name_not_blank');
    expect(roomsTable).toContain('constraint home_map_draft_rooms_notes_length');

    expect(layoutsTable).toContain('draft_room_id uuid not null references public.home_map_draft_rooms(id) on delete cascade');
    expect(layoutsTable).toContain('x_feet numeric(8,2) not null default 0');
    expect(layoutsTable).toContain('y_feet numeric(8,2) not null default 0');
    expect(layoutsTable).toContain('width_feet numeric(8,2) not null default 10');
    expect(layoutsTable).toContain('depth_feet numeric(8,2) not null default 10');
    expect(layoutsTable).toContain("check (measurement_unit = 'ft')");
    expect(source).toContain('home_map_draft_room_layouts_draft_room_uidx');

    const combinedTables = `${draftsTable}\n${roomsTable}\n${layoutsTable}`.toLowerCase();
    for (const forbidden of [
      'asset',
      'document',
      'reminder',
      'storage_path',
      'bucket',
      'serial',
      'access_code',
      'key_location',
      'lockbox',
      'alarm',
      'cad',
      'lidar',
      'three_d',
      'home_map_objects',
    ]) {
      expect(combinedTables, `draft tables should not add ${forbidden} fields`).not.toMatch(
        new RegExp(`(^|[^a-z0-9_])${forbidden}([^a-z0-9_]|$)`, 'i'),
      );
    }
  });

  test('keeps draft tables read-only for browser roles and mutates through RPCs only', () => {
    const source = sqlSource();

    for (const table of ['home_map_drafts', 'home_map_draft_rooms', 'home_map_draft_room_layouts']) {
      expect(source).toContain(`alter table public.${table} enable row level security`);
      expect(source).toContain(`revoke all on table public.${table} from public`);
      expect(source).toContain(`revoke all on table public.${table} from anon`);
      expect(source).toContain(`revoke all on table public.${table} from authenticated`);
      expect(source).toContain(`grant select on table public.${table} to authenticated`);
      expect(source).not.toMatch(new RegExp(`grant[\\s\\S]*insert[\\s\\S]*on table public\\.${table}`, 'i'));
      expect(source).not.toMatch(new RegExp(`grant[\\s\\S]*update[\\s\\S]*on table public\\.${table}`, 'i'));
      expect(source).not.toMatch(new RegExp(`grant[\\s\\S]*delete[\\s\\S]*on table public\\.${table}`, 'i'));
      expect(source).not.toMatch(new RegExp(`create policy[\\s\\S]*?for delete[\\s\\S]*?on public\\.${table}`, 'i'));
    }

    expect(source).toContain('Home map drafts: contractor reads own');
    expect(source).toContain('public.current_user_can_access_contractor(contractor_id)');
    expect(source).toContain('Home map drafts: homeowner managers read own');
    expect(source).toContain('public.current_user_can_manage_home(home_id)');
    expect(source).toContain('Home map draft rooms: draft parties read');
    expect(source).toContain('Home map draft room layouts: draft parties read');
  });

  test('adds service-request-scoped SECURITY DEFINER RPCs with authenticated-only execute grants', () => {
    const source = sqlSource();
    const rpcs = [
      'servsync_create_home_map_draft',
      'servsync_upsert_home_map_draft_room',
      'servsync_submit_home_map_draft',
      'servsync_revoke_home_map_draft',
      'servsync_decline_home_map_draft',
      'servsync_accept_home_map_draft',
    ];

    for (const rpc of rpcs) {
      const block = functionBlock(source, rpc);
      expect(block).toContain('security definer');
      expect(block).toContain('set search_path = public');
      expect(source).toContain(`revoke execute on function public.${rpc}`);
      expect(source).toContain(`grant execute on function public.${rpc}`);
      expect(source).not.toMatch(new RegExp(`grant execute on function public\\.${rpc}[\\s\\S]*?to anon`, 'i'));
    }

    const createBlock = functionBlock(source, 'servsync_create_home_map_draft');
    expect(createBlock).toContain('p_service_request_id uuid');
    expect(createBlock).toContain("v_request.status in ('declined', 'closed')");
    expect(createBlock).toContain('Home Map drafts require a homeowner property on the service request.');
    expect(createBlock).toContain('and contractor_id = v_contractor_id');
    expect(createBlock).toContain("and c.status = 'active'");
    expect(createBlock).toContain('public.current_user_can_write_contractor_jobs(v_contractor_id)');
  });

  test('acceptance is homeowner-manager-gated and is the only permanent map write path', () => {
    const source = sqlSource();
    const acceptBlock = functionBlock(source, 'servsync_accept_home_map_draft');
    const declineBlock = functionBlock(source, 'servsync_decline_home_map_draft');
    const upsertBlock = functionBlock(source, 'servsync_upsert_home_map_draft_room');

    expect(acceptBlock).toContain("v_draft.status <> 'submitted'");
    expect(acceptBlock).toContain('public.current_user_can_manage_home(v_draft.home_id)');
    expect(acceptBlock).toContain('insert into public.home_rooms');
    expect(acceptBlock).toContain('update public.home_rooms');
    expect(acceptBlock).toContain('insert into public.home_room_layouts');
    expect(acceptBlock).toContain('on conflict (home_room_id) where archived_at is null do update');
    expect(acceptBlock).toContain("measurement_unit = 'ft'");
    expect(acceptBlock).not.toContain('home_assets');
    expect(acceptBlock).not.toContain('home_documents');
    expect(acceptBlock).not.toContain('home_reminders');
    expect(acceptBlock).not.toContain('storage.objects');

    expect(declineBlock).toContain("v_draft.status <> 'submitted'");
    expect(declineBlock).toContain("set status = 'declined'");
    expect(declineBlock).not.toContain('insert into public.home_rooms');
    expect(declineBlock).not.toContain('insert into public.home_room_layouts');

    expect(upsertBlock).toContain("v_draft.status <> 'draft'");
    expect(upsertBlock).not.toContain('insert into public.home_rooms');
    expect(upsertBlock).not.toContain('insert into public.home_room_layouts');
  });

  test('does not broaden contractor access to permanent home map, assets, documents, or storage', () => {
    const source = sqlSource();

    expect(source).not.toMatch(/create policy[\s\S]*contractor[\s\S]*on public\.home_rooms/i);
    expect(source).not.toMatch(/create policy[\s\S]*contractor[\s\S]*on public\.home_room_layouts/i);
    expect(source).not.toMatch(/create policy[\s\S]*contractor[\s\S]*on public\.home_assets/i);
    expect(source).not.toMatch(/grant[\s\S]*(insert|update|delete)[\s\S]*on table public\.home_rooms[\s\S]*to authenticated/i);
    expect(source).not.toMatch(/grant[\s\S]*(insert|update|delete)[\s\S]*on table public\.home_room_layouts[\s\S]*to authenticated/i);
    expect(source).not.toMatch(/grant[\s\S]*(insert|update|delete)[\s\S]*on table public\.home_assets[\s\S]*to authenticated/i);
    expect(source).not.toContain('storage.objects');
    expect(source).not.toContain('create bucket');
    expect(source).not.toContain('home_documents');
    expect(source).not.toContain('home_reminders');
  });

  test('changed-file scope stays within approved Home Map draft foundation files', () => {
    const files = changedFiles();
    if (!files.includes('servsync-home-map-drafts-foundation.sql')) {
      return;
    }
    const allowedFiles = new Set([
      'servsync-home-map-drafts-foundation.sql',
      'tests/e2e/home-map-drafts-foundation.spec.ts',
      'tests/e2e/security-catalog.spec.ts',
      'docs/servsync-master-plan/ServSync_Feature_Backlog.md',
      'docs/servsync-master-plan/CHANGELOG.md',
      'docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md',
    ]);

    expect(files.length, 'branch should have changed files for this slice').toBeGreaterThan(0);
    for (const file of files) {
      expect(allowedFiles.has(file), `${file} should be approved for Home Map draft foundation`).toBe(true);
    }
    expect(files.some(file => file.includes('src/App.tsx'))).toBe(false);
    expect(files.some(file => file.includes('supabase/functions/'))).toBe(false);
    expect(files.some(file => file.includes('.env'))).toBe(false);
    expect(files.some(file => file.includes('package'))).toBe(false);
    expect(files.some(file => file.includes('vercel'))).toBe(false);
    expect(files.some(file => /storage|bucket/i.test(file))).toBe(false);
  });
});
