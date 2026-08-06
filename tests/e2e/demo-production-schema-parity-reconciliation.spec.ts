import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const migrationPath = join(process.cwd(), 'servsync-demo-production-schema-parity-reconciliation.sql');
const migration = readFileSync(migrationPath, 'utf8');

const appointmentRpcs = [
  'servsync_contractor_propose_appointment',
  'servsync_contractor_respond_to_appointment',
  'servsync_homeowner_propose_appointment',
  'servsync_homeowner_respond_to_appointment',
];

test.describe('Demo-to-Production schema parity reconciliation source', () => {
  test('has the exact Demo-applied migration identity and a fail-closed target preflight', () => {
    expect(createHash('sha256').update(migration).digest('hex')).toBe(
      '6e2641f94c96075b20b3a27ff483c84541a06c83c3ddd4edb805c8675d9d701f',
    );

    for (const table of [
      'demo_scenarios',
      'demo_scenario_runs',
      'demo_scenario_records',
      'contractor_work_drafts',
      'contractor_work_draft_items',
      'contractor_work_draft_launches',
    ]) {
      expect(migration).toContain(`to_regclass('public.${table}') is null`);
    }

    expect(migration).toContain("raise exception 'DEMO_PARITY_TARGET_MISMATCH'");
    expect(migration).toContain("raise exception 'DEMO_PARITY_DURABLE_DRAFT_MISSING'");
    expect(migration).toMatch(/\nbegin;[\s\S]*commit;\s*$/);
  });

  test('reconciles only the four canonical appointment RPC signatures', () => {
    expect(migration.match(/CREATE OR REPLACE FUNCTION public\.servsync_(?:contractor|homeowner)_(?:propose|respond_to)_appointment/g)).toHaveLength(4);

    for (const rpc of appointmentRpcs) {
      expect(migration).toContain(`CREATE OR REPLACE FUNCTION public.${rpc}`);
      expect(migration).toContain(`alter function public.${rpc}`);
      expect(migration).toContain(`revoke all on function public.${rpc}`);
      expect(migration).toContain(`grant execute on function public.${rpc}`);
    }

    expect(migration).toContain('DEMO_PARITY_APPOINTMENT_RPC_MISSING');
    expect(migration).toContain('DEMO_PARITY_APPOINTMENT_RPC_OVERLOAD_MISMATCH');
    expect(migration.match(/SECURITY DEFINER/g)).toHaveLength(4);
    expect(migration.match(/SET search_path TO 'public'/g)).toHaveLength(4);
    expect(migration.match(/owner to postgres;/g)).toHaveLength(4);
    expect(migration.match(/grant execute on function .+ to public, anon, authenticated, service_role;/g)).toHaveLength(4);
  });

  test('removes only superseded compatibility helpers and introduces no schema or project foundation', () => {
    expect(migration.match(/^drop function if exists .+;$/gm)).toEqual([
      'drop function if exists public.servsync_private_assert_canonical_customer_draft_foundation();',
      'drop function if exists public.servsync_private_customer_draft_foundation_available();',
      'drop function if exists public.servsync_private_local_customer_has_readable_work(uuid, uuid, uuid);',
    ]);

    expect(migration).not.toMatch(/public\.projects?\b/i);
    expect(migration).not.toMatch(/\bcreate\s+table\b/i);
    expect(migration).not.toMatch(/\balter\s+table\b/i);
    expect(migration).not.toMatch(/\bcreate\s+(?:or\s+replace\s+)?trigger\b/i);
    expect(migration).not.toMatch(/\bcreate\s+policy\b/i);
    expect(migration).not.toMatch(/\bgrant\s+.+\s+on\s+table\b/i);
  });
});
