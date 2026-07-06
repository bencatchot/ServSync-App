import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const sqlSource = () => sourceFile('servsync-home-document-upload-room-registration.sql');

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

test.describe('manual home document upload room-registration foundation SQL', () => {
  test('adds nullable home_room_id to upload reservations without changing storage policy tables', () => {
    const source = sqlSource();

    expect(source).toContain('alter table public.home_document_upload_reservations');
    expect(source).toContain('add column if not exists home_room_id uuid references public.home_rooms(id) on delete set null');
    expect(source).toContain('home_doc_upload_reservations_home_room_idx');
    expect(source).toContain('on public.home_document_upload_reservations(homeowner_user_id, home_id, home_room_id, created_at desc)');
    expect(source).not.toMatch(/home_room_id uuid not null/i);
    expect(source).not.toMatch(/storage\.(buckets|objects)/i);
    expect(source).not.toMatch(/create policy/i);
  });

  test('extends prepare RPC with optional room parameter and same-home validation', () => {
    const source = sqlSource();

    expect(source).toContain('drop function if exists public.servsync_prepare_manual_home_document_upload(uuid, text, text, bigint, text, text)');
    expect(source).toContain('create or replace function public.servsync_prepare_manual_home_document_upload(');
    expect(source).toContain('p_home_room_id uuid default null');
    expect(source).toContain('security definer');
    expect(source).toContain('set search_path = public');
    expect(source).toContain('perform public.servsync_validate_manual_home_document_upload(');
    expect(source).toContain('if p_home_room_id is not null then');
    expect(source).toContain('if p_home_id is null then');
    expect(source).toContain("raise exception 'Choose a property before tagging this document to a room.'");
    expect(source).toContain('select hr.home_id');
    expect(source).toContain('from public.home_rooms hr');
    expect(source).toContain('where hr.id = p_home_room_id');
    expect(source).toContain("raise exception 'Choose an existing room before uploading this document.'");
    expect(source).toContain('if v_room_home_id is distinct from p_home_id then');
    expect(source).toContain("raise exception 'Document room must belong to the selected property.'");
    expect(source).toContain('home_room_id,');
    expect(source).toContain('p_home_room_id,');
  });

  test('register RPC carries reservation room link into home_documents while preserving null behavior', () => {
    const source = sqlSource();
    const registerSource = source.slice(source.indexOf('create or replace function public.servsync_register_manual_home_document_upload('));

    expect(registerSource).toContain('create or replace function public.servsync_register_manual_home_document_upload(');
    expect(registerSource).toContain('returns public.home_documents');
    expect(registerSource).toContain('security definer');
    expect(registerSource).toContain('set search_path = public');
    expect(registerSource).toContain('from public.home_document_upload_reservations');
    expect(registerSource).toContain('and homeowner_user_id = v_user_id');
    expect(registerSource).toContain('and status = \'pending\'');
    expect(registerSource).toContain('and expires_at > now()');
    expect(registerSource).toContain('perform public.servsync_validate_manual_home_document_upload(');
    expect(registerSource).toContain('insert into public.home_documents (');
    expect(registerSource).toContain('home_room_id,');
    expect(registerSource).toContain('v_reservation.home_room_id,');
    expect(registerSource).toContain('return v_document;');
    expect(registerSource).not.toMatch(/home_rooms[\s\S]{0,120}\.notes/i);
  });

  test('keeps document grants, storage policies, shared shells, contractor access, and media scope unchanged', () => {
    const source = sqlSource();
    const sharedHomeShellSource = sourceFile('servsync-shared-home-shell.sql');
    const sharedReminderShellSource = sourceFile('servsync-shared-home-reminders-shell.sql');

    const grantStatements = source
      .split('\n')
      .map(line => line.trim())
      .filter(line => /^grant\b/i.test(line));
    expect(grantStatements.join('\n')).not.toMatch(/on (table )?public\.home_documents/i);
    expect(source).not.toContain('alter table public.home_documents enable row level security');
    expect(source).not.toMatch(/create policy[\s\S]*?on public\.home_documents/i);
    expect(source).toContain('revoke execute on function public.servsync_prepare_manual_home_document_upload(uuid, text, text, bigint, text, text, uuid) from public');
    expect(source).toContain('revoke execute on function public.servsync_prepare_manual_home_document_upload(uuid, text, text, bigint, text, text, uuid) from anon');
    expect(source).toContain('grant execute on function public.servsync_prepare_manual_home_document_upload(uuid, text, text, bigint, text, text, uuid) to authenticated');
    expect(source).toContain('revoke execute on function public.servsync_register_manual_home_document_upload(text) from public');
    expect(source).toContain('revoke execute on function public.servsync_register_manual_home_document_upload(text) from anon');
    expect(source).toContain('grant execute on function public.servsync_register_manual_home_document_upload(text) to authenticated');

    expect(source).not.toContain('servsync_list_my_shared_home_shells');
    expect(source).not.toContain('servsync_list_my_shared_home_reminder_shells');
    expect(sharedHomeShellSource).not.toContain('home_documents');
    expect(sharedHomeShellSource).not.toContain('home_room_id');
    expect(sharedHomeShellSource).not.toContain('home_rooms');
    expect(sharedReminderShellSource).not.toContain('home_documents');
    expect(sharedReminderShellSource).not.toContain('home_room_id');
    expect(sharedReminderShellSource).not.toContain('home_rooms');

    for (const forbidden of [
      'home_photo_path',
      'profile_photo_path',
      'inspection-media',
      'service-request-media',
      'public.job_work_items',
      'public.inspections',
      'public.estimates',
      'public.invoices',
      'home_map',
      'home_assets',
      'home_systems',
      'key_locations',
      'floor_plan',
      'public.contractor_local_homes',
      'public.contractor_profiles',
      'public.connection_shared_properties',
    ]) {
      expect(source, `SQL should not touch ${forbidden}`).not.toContain(forbidden);
    }
  });

  test('changed-file scope stays SQL, tests, and planning docs only with no UI or storage policy files', () => {
    const files = changedFiles();
    const allowedFiles = new Set([
      'servsync-home-document-upload-room-registration.sql',
      'tests/e2e/home-document-room-upload-foundation.spec.ts',
      'docs/servsync-master-plan/ServSync_Feature_Backlog.md',
      'docs/servsync-master-plan/CHANGELOG.md',
      'docs/servsync-master-plan/ServSync_Master_Plan_v1_0.md',
    ]);

    expect(files.length, 'branch should have changed files for this slice').toBeGreaterThan(0);
    for (const file of files) {
      expect(allowedFiles.has(file), `${file} should be an approved document upload room-registration file`).toBe(true);
    }

    expect(files).not.toContain('src/App.tsx');
    expect(files).not.toContain('src/types.ts');
    expect(files.some(file => file.endsWith('.sql') && file !== 'servsync-home-document-upload-room-registration.sql')).toBe(false);
    expect(files.some(file => file.includes('supabase/functions/'))).toBe(false);
    expect(files.some(file => file.includes('.env'))).toBe(false);
    expect(files.some(file => file.includes('package'))).toBe(false);
    expect(files.some(file => file.includes('vercel'))).toBe(false);
    expect(files.some(file => /storage|bucket/i.test(file) && file !== 'servsync-home-document-upload-room-registration.sql')).toBe(false);
  });
});
