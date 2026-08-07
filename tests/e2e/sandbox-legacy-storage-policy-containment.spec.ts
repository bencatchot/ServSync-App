import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const migration = read('servsync-sandbox-legacy-storage-policy-containment.sql');

test.describe('Sandbox legacy storage policy containment', () => {
  test('drops only the two exact legacy policies after a fail-closed catalog check', () => {
    expect(migration.match(/^drop policy .+;$/gim)).toEqual([
      'drop policy "Photos storage: authenticated manage" on storage.objects;',
      'drop policy "Reports storage: authenticated manage" on storage.objects;',
    ]);

    expect(migration).toContain("current_user <> 'postgres'");
    expect(migration).toContain("v_owner is distinct from 'supabase_storage_admin'");
    expect(migration).toContain('not coalesce(v_rls_enabled, false)');
    expect(migration).toContain("permissive = 'PERMISSIVE'");
    expect(migration).toContain("cmd = 'ALL'");
    expect(migration).toContain("roles::text[] = array['authenticated']::text[]");
    expect(migration).toContain("(bucket_id=''photos''::text)");
    expect(migration).toContain("(bucket_id=''reports''::text)");
    expect(migration).toContain('SANDBOX_STORAGE_POLICY_CONTAINMENT_POLICY_MISMATCH');
  });

  test('does not alter buckets, objects, ACLs, other policies, or application schema', () => {
    expect(migration).not.toMatch(/\bcreate\s+policy\b/i);
    expect(migration).not.toMatch(/\balter\s+policy\b/i);
    expect(migration).not.toMatch(/\balter\s+table\b/i);
    expect(migration).not.toMatch(/\b(?:grant|revoke)\b(?![^;]*policy)/i);
    expect(migration).not.toMatch(/\b(?:insert|update|delete|truncate)\s+(?:into\s+|from\s+)?storage\.(?:objects|buckets)\b/i);
    expect(migration).not.toMatch(/\bcreate\s+(?:or\s+replace\s+)?function\b/i);
    expect(migration).not.toMatch(/\bpublic\.[a-z_]+/i);
  });

  test('keeps current application and server source off the legacy buckets', () => {
    const roots = ['src', 'api'];
    for (const root of roots) {
      const files = readdirSync(join(process.cwd(), root), { recursive: true })
        .filter(path => typeof path === 'string' && /\.(?:ts|tsx|js|mjs)$/.test(path));
      for (const relativePath of files) {
        const source = read(join(root, relativePath));
        expect(source, `${root}/${relativePath} should not call a legacy bucket`).not.toMatch(
          /storage\.from\(\s*['"](?:photos|reports)['"]\s*\)/,
        );
      }
    }
  });

  test('does not hide either policy in the parity intentional-difference manifest', () => {
    const manifest = read('config/backend-environment-parity.json');
    expect(manifest).not.toContain('Photos storage: authenticated manage');
    expect(manifest).not.toContain('Reports storage: authenticated manage');
  });
});
