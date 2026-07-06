import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const sqlSource = () => sourceFile('servsync-home-reminder-room-foundation.sql');

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

test.describe('home reminder room link foundation SQL', () => {
  test('adds a nullable home_room_id foreign key with room lookup indexes', () => {
    const source = sqlSource();

    expect(source).toContain('alter table public.home_reminders');
    expect(source).toContain('add column if not exists home_room_id uuid references public.home_rooms(id) on delete set null');
    expect(source).toContain('Optional link to a durable home_rooms row for future room-tagged reminder UI.');
    expect(source).toContain('home_reminders_home_room_idx');
    expect(source).toContain('on public.home_reminders(home_room_id)');
    expect(source).toContain('home_reminders_home_room_due_idx');
    expect(source).toContain('on public.home_reminders(home_id, home_room_id, due_on)');
    expect(source).not.toMatch(/home_room_id uuid not null/i);
  });

  test('validates reminder room links stay within the same home while allowing no room link', () => {
    const source = sqlSource();

    expect(source).toContain('create or replace function public.home_reminders_validate_home_room()');
    expect(source).toContain('security definer');
    expect(source).toContain('set search_path = public');
    expect(source).toContain('if new.home_room_id is null then');
    expect(source).toContain('return new;');
    expect(source).toContain('if new.home_id is null then');
    expect(source).toContain("raise exception 'Home room link requires a reminder home.'");
    expect(source).toContain('select hr.home_id');
    expect(source).toContain('from public.home_rooms hr');
    expect(source).toContain('where hr.id = new.home_room_id');
    expect(source).toContain("raise exception 'Home room not found.'");
    expect(source).toContain('if v_room_home_id is distinct from new.home_id then');
    expect(source).toContain("raise exception 'Home reminder room must belong to the same home as the reminder.'");
    expect(source).toContain('before insert or update of home_id, home_room_id on public.home_reminders');
    expect(source).toContain('for each row execute function public.home_reminders_validate_home_room()');
  });

  test('keeps reminder RLS, browser grants, shared shell behavior, and room notes unexpanded', () => {
    const source = sqlSource();
    const sharedReminderShellSource = sourceFile('servsync-shared-home-reminders-shell.sql');

    expect(source).toContain('revoke all on function public.home_reminders_validate_home_room() from public');
    expect(source).toContain('revoke all on function public.home_reminders_validate_home_room() from anon');
    expect(source).toContain('revoke all on function public.home_reminders_validate_home_room() from authenticated');
    expect(source).not.toMatch(/create policy[\s\S]*?on public\.home_reminders/i);
    expect(source).not.toMatch(/grant[\s\S]*on (table )?public\.home_reminders/i);
    expect(source).not.toContain('alter table public.home_reminders enable row level security');

    expect(source).not.toContain('servsync_list_my_shared_home_reminder_shells');
    expect(sharedReminderShellSource).not.toContain('home_room_id');
    expect(sharedReminderShellSource).not.toContain('home_rooms');
    expect(source).not.toMatch(/home_rooms[\s\S]{0,120}\.notes/i);
    expect(source).toContain('Room notes are not copied or exposed through reminders.');
  });

  test('does not touch documents, jobs, financial records, inspections, map, assets, systems, or key locations', () => {
    const source = sqlSource();

    for (const forbidden of [
      'public.home_documents',
      'storage.',
      'public.job_work_items',
      'public.inspections',
      'public.estimates',
      'public.invoices',
      'rooms_with_findings',
      'inspection_templates',
      'home_map',
      'home_assets',
      'home_systems',
      'key_locations',
      'public.contractor_local_homes',
      'public.contractor_profiles',
      'public.connection_shared_properties',
    ]) {
      expect(source, `SQL should not touch ${forbidden}`).not.toContain(forbidden);
    }
  });

  test('changed-file scope stays SQL, tests, and planning docs only with no UI files', () => {
    const files = changedFiles();
    const allowedFiles = new Set([
      'servsync-home-reminder-room-foundation.sql',
      'tests/e2e/home-reminder-room-foundation.spec.ts',
      'docs/servsync-master-plan/ServSync_Feature_Backlog.md',
      'docs/servsync-master-plan/CHANGELOG.md',
      'docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md',
    ]);

    expect(files.length, 'branch should have changed files for this slice').toBeGreaterThan(0);
    for (const file of files) {
      expect(allowedFiles.has(file), `${file} should be an approved reminder-room foundation file`).toBe(true);
    }

    expect(files).not.toContain('src/App.tsx');
    expect(files).not.toContain('src/types.ts');
    expect(files.some(file => file.endsWith('.sql') && file !== 'servsync-home-reminder-room-foundation.sql')).toBe(false);
    expect(files.some(file => file.includes('supabase/functions/'))).toBe(false);
    expect(files.some(file => file.includes('.env'))).toBe(false);
    expect(files.some(file => file.includes('package'))).toBe(false);
    expect(files.some(file => file.includes('vercel'))).toBe(false);
  });
});
