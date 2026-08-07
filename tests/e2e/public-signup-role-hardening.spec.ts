import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const sha256 = (path: string) => createHash('sha256').update(read(path)).digest('hex');

const migrationName = 'servsync-public-signup-role-hardening.sql';
const migration = read(migrationName);

test.describe('public signup role hardening', () => {
  test('uses a server-controlled public role allowlist and preserves referral attribution', () => {
    expect(migration).toContain("if v_role not in ('homeowner', 'contractor') then");
    expect(migration).toContain("v_role := 'homeowner';");
    expect(migration).not.toMatch(/v_role\s+not\s+in\s*\([^)]*platform_admin/i);
    expect(migration).not.toContain('raw_app_meta_data');

    expect(migration).toContain("new.raw_user_meta_data->>'referral_code'");
    expect(migration).toContain("new.raw_user_meta_data->>'referral_invite_code'");
    expect(migration).toContain('perform public.servsync_ensure_referral_code(new.id, v_role);');
    expect(migration).toContain('insert into public.referrals');
    expect(migration).toContain('insert into public.contractor_invites');
    expect(migration).toContain('update public.contractor_invites');
  });

  test('blocks self-service role assignment and role changes below the UI boundary', () => {
    expect(migration).toContain('create or replace function public.servsync_guard_self_service_profile_role()');
    expect(migration).toContain("current_user in ('anon', 'authenticated')");
    expect(migration).toContain("tg_op = 'INSERT' and new.role not in ('homeowner', 'contractor')");
    expect(migration).toContain("tg_op = 'UPDATE' and new.role is distinct from old.role");
    expect(migration).toContain('before insert or update of role on public.profiles');
    expect(migration).toContain("errcode = '42501'");
  });

  test('pins function security and direct execution posture', () => {
    expect(migration.match(/create or replace function public\.handle_new_user\(\)/gi)).toHaveLength(1);
    expect(migration).toMatch(/public\.handle_new_user\(\)[\s\S]*security definer[\s\S]*set search_path = public/i);
    expect(migration).toContain('alter function public.handle_new_user() owner to postgres;');
    expect(migration).toContain('revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;');
    expect(migration).toContain('grant execute on function public.handle_new_user() to postgres;');
    expect(migration).toContain('drop trigger if exists on_auth_user_created on auth.users;');
    expect(migration).toContain('after insert on auth.users');
  });

  test('makes the reconciliation migration final in both blank-install sequences', () => {
    for (const installer of [
      'scripts/apply-sql-dry-run.sh',
      'scripts/apply-blank-supabase-schema.sh',
    ]) {
      const source = read(installer);
      const sequenceStart = source.indexOf('SQL_FILES=(');
      const sequenceEnd = source.indexOf('\n)', sequenceStart);
      const sequence = source.slice(sequenceStart, sequenceEnd);
      const attribution = sequence.indexOf('servsync-referral-attribution.sql');
      const hardening = sequence.indexOf(migrationName);
      expect(attribution).toBeGreaterThan(-1);
      expect(hardening).toBeGreaterThan(attribution);

      const filesAfterHardening = sequence.slice(hardening + migrationName.length);
      const laterHandleNewUserDefinitions = [...filesAfterHardening.matchAll(/"([^"]+\.sql)"/g)]
        .map(match => match[1])
        .filter(file => read(file).includes('function public.handle_new_user()'));
      expect(laterHandleNewUserDefinitions).toEqual([]);
    }
  });

  test('does not rewrite the historical signup and referral migrations', () => {
    expect(sha256('servsync-clean-foundation.sql')).toBe('256b1f76d958fb72d8ea416d51010fbe790699c4a14de4f0efd6bd3bf3e25366');
    expect(sha256('servsync-permanent-referral.sql')).toBe('3e059de1382b9c9a08b2ff77a42e32ca74db41aea97b03ef4f1b5151ddcc0f13');
    expect(sha256('servsync-referrals-v1.sql')).toBe('ab022ea252e2fd07781f533f3188bcbd83bdecd162f5898e897d10f8ec8995da');
    expect(sha256('servsync-referral-attribution.sql')).toBe('be838d2f040cf4cbbf101669aab49738e185856865715dd3da409fccd72a2214');
  });

  test('keeps public UI signup roles limited to homeowner and contractor', () => {
    const app = read('src/App.tsx');
    expect(app).toContain("const signupRole: Exclude<UserRole, 'platform_admin'>");
    expect(app).toContain("ServSync admin accounts are created manually. Sign in with an existing admin account.");
    expect(app).not.toMatch(/auth\.signUp\([\s\S]{0,500}role:\s*['"]platform_admin['"]/);
  });
});
