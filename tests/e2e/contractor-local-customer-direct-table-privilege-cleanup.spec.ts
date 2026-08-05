import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(process.cwd(), 'servsync-contractor-local-customer-direct-table-privilege-cleanup.sql');
const migration = readFileSync(migrationPath, 'utf8');

test.describe('contractor-local customer direct-table privilege cleanup source', () => {
  test('revokes table and column privileges from every browser role without changing RLS or policies', () => {
    for (const table of ['contractor_local_contacts', 'contractor_local_homes']) {
      for (const role of ['public', 'anon', 'authenticated']) {
        expect(migration).toContain(`revoke all privileges on table public.${table} from ${role};`);
      }
    }
    expect(migration).toContain("array['PUBLIC', 'anon', 'authenticated']");
    expect(migration).toContain('revoke all privileges (%s) on table public.%I from %s');
    expect(migration.match(/^grant .+;$/gm)).toEqual([
      'grant select, insert, update, delete on table public.contractor_local_contacts to service_role;',
      'grant select, insert, update, delete on table public.contractor_local_homes to service_role;',
    ]);
    expect(migration).not.toMatch(/\b(create|alter|drop)\s+policy\b/i);
    expect(migration).not.toMatch(/\balter\s+table\b/i);
    expect(migration).not.toMatch(/\bcreate\s+(?:or\s+replace\s+)?function\b/i);
  });

  test('fails closed unless the tables, RLS, trusted operator access, and controlled RPCs exist', () => {
    expect(migration).toContain("v_owner <> 'postgres' or not v_rls_enabled");
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(migration).toContain(`'service_role', format('public.%I', v_table_name), '${privilege}'`);
    }
    for (const rpc of [
      'servsync_list_local_customer_summaries()',
      'servsync_get_local_customer_management_detail(uuid)',
      'servsync_create_local_contact(text,text,text,text,text,text,text,text,text,text,text,text,text,text)',
      'servsync_update_local_contact_profile(uuid,text,text,text,text)',
      'servsync_create_local_home(uuid,text,text,text,text,text,text,text)',
      'servsync_update_local_home(uuid,text,text,text,text,text,text,text)',
      'servsync_list_local_customer_claim_invites_v2(uuid)',
      'servsync_create_local_customer_claim_invite_v2(uuid,uuid[],integer)',
      'servsync_lookup_local_customer_claim(text)',
      'servsync_prepare_local_customer_claim_invite_delivery(uuid)',
      'servsync_accept_local_customer_claim_v2(text,jsonb,jsonb)',
      'servsync_decline_local_customer_claim(text)',
      'servsync_revoke_local_customer_claim_invite(uuid)',
    ]) {
      expect(migration).toContain(`to_regprocedure('public.${rpc}')`);
    }
  });

  test('keeps application source off both contractor-local tables', () => {
    const sourceFiles = readdirSync(join(process.cwd(), 'src'), { recursive: true })
      .filter(path => typeof path === 'string' && /\.(?:ts|tsx)$/.test(path));
    for (const relativePath of sourceFiles) {
      const source = readFileSync(join(process.cwd(), 'src', relativePath), 'utf8');
      expect(source, `${relativePath} should use controlled RPCs`).not.toMatch(
        /\.from\(['"]contractor_local_(?:contacts|homes)['"]\)/,
      );
    }
  });

  test('contains literal direct test-table access only in the operator helper', () => {
    const e2eDir = join(process.cwd(), 'tests/e2e');
    const files = readdirSync(e2eDir, { recursive: true })
      .filter(path => typeof path === 'string' && /\.(?:ts|tsx)$/.test(path));
    const directCallers = files.filter(relativePath => {
      const source = readFileSync(join(e2eDir, relativePath), 'utf8');
      return /\b(?:client|supabase|owner|contractorClient)\s*\.\s*from\s*\(\s*['"]contractor_local_(?:contacts|homes)['"]\)/.test(source);
    });
    expect(directCallers).toEqual(['helpers/sandboxLocalCustomerOperator.ts']);

    const denialProbe = readFileSync(
      join(e2eDir, 'contractor-local-customer-direct-table-privilege-cleanup-role-probes.spec.ts'),
      'utf8',
    );
    expect(denialProbe).toContain("'contractor_local_contacts' | 'contractor_local_homes'");
    expect(denialProbe).toContain('client.from(table)');
    expect(denialProbe).toContain('permission denied for table');
  });

  test('keeps the operator helper server-only and pinned to the dedicated Sandbox', () => {
    const helper = readFileSync(
      join(process.cwd(), 'tests/e2e/helpers/sandboxLocalCustomerOperator.ts'),
      'utf8',
    );
    expect(helper).toContain("const SANDBOX_PROJECT_REF = 'zpzdkoaubyjtsomccxya'");
    expect(helper).toContain("requiredEnv('SUPABASE_SERVICE_ROLE_KEY')");
    expect(helper).toContain("requiredEnv('TEST_SUPABASE_URL')");
    expect(helper).not.toMatch(/VITE_[A-Z_]*SERVICE_ROLE/);
    expect(helper).not.toMatch(/console\.(?:log|error|warn)/);
  });
});
