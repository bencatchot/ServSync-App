import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sqlPath = resolve(process.cwd(), 'servsync-demo-mode-foundation.sql');
const scriptPath = resolve(process.cwd(), 'scripts/demo/seed-demo-scenario.mjs');
const packagePath = resolve(process.cwd(), 'package.json');
const runbookPath = resolve(process.cwd(), 'docs/demo/ServSync_Demo_Mode_Runbook.md');
const appPath = resolve(process.cwd(), 'src/App.tsx');

function read(path: string) {
  return readFileSync(path, 'utf8');
}

test.describe('Demo Mode hidden foundation source checks', () => {
  test('SQL creates private demo registry tables with no browser-role access', () => {
    const sql = read(sqlPath);

    for (const tableName of ['demo_scenarios', 'demo_scenario_runs', 'demo_scenario_records']) {
      expect(sql).toMatch(new RegExp(`create table if not exists public\\.${tableName}`, 'i'));
      expect(sql).toMatch(new RegExp(`alter table public\\.${tableName} enable row level security`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke all on table public\\.${tableName} from public`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke all on table public\\.${tableName} from anon`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke all on table public\\.${tableName} from authenticated`, 'i'));
      expect(sql).not.toMatch(new RegExp(`grant .* on table public\\.${tableName} to authenticated`, 'i'));
      expect(sql).not.toMatch(new RegExp(`grant .* on table public\\.${tableName} to anon`, 'i'));
    }
  });

  test('SQL reset path is registered-record only and has an explicit table allowlist', () => {
    const sql = read(sqlPath);

    expect(sql).toMatch(/create or replace function public\.servsync_demo_reset_order/i);
    for (const tableName of [
      'homes',
      'home_rooms',
      'home_assets',
      'homeowner_contractor_connections',
      'connection_permissions',
      'service_requests',
      'service_request_messages',
      'estimates',
      'estimate_line_items',
      'estimate_payment_schedule_items',
      'inspections',
      'job_work_items',
      'notifications',
      'workflow_activity_events',
    ]) {
      expect(sql).toMatch(new RegExp(`p_table_name = '${tableName}'`, 'i'));
    }

    expect(sql).toMatch(/delete from %I\.%I where %I = \$1/i);
    expect(sql).toMatch(/format\([\s\S]*%I[\s\S]*%I[\s\S]*%I/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/disable row level security/i);
    expect(sql).not.toMatch(/delete from auth\.users/i);
    expect(sql).not.toMatch(/p_table_name = 'profiles'/i);
    expect(sql).not.toMatch(/p_table_name = 'homeowner_profiles'/i);
    expect(sql).not.toMatch(/p_table_name = 'contractor_profiles'/i);
    expect(sql).not.toMatch(/delete from public\.[a-z_]+;\s/i);
  });

  test('privileged demo helpers are not executable by browser roles', () => {
    const sql = read(sqlPath);

    for (const fn of [
      'servsync_demo_start_run',
      'servsync_demo_register_record',
      'servsync_demo_finish_run',
      'servsync_demo_reset_registered_run',
    ]) {
      expect(sql).toMatch(new RegExp(`create or replace function public\\.${fn}`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${fn}[\\s\\S]* from public`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${fn}[\\s\\S]* from anon`, 'i'));
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${fn}[\\s\\S]* from authenticated`, 'i'));
      expect(sql).not.toMatch(new RegExp(`grant execute on function public\\.${fn}[\\s\\S]* to authenticated`, 'i'));
      expect(sql).not.toMatch(new RegExp(`grant execute on function public\\.${fn}[\\s\\S]* to anon`, 'i'));
    }
  });

  test('script refuses production, shared sandbox, missing enable flag, and unsafe reset', async () => {
    const module = await import('../../scripts/demo/seed-demo-scenario.mjs');
    const baseEnv = {
      DEMO_MODE_ENABLED: 'true',
      DEMO_SUPABASE_URL: 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co',
      DEMO_SUPABASE_PROJECT_REF: 'aaaaaaaaaaaaaaaaaaaa',
      DEMO_SUPABASE_ANON_KEY: 'anon-key-placeholder',
      DEMO_SUPABASE_SERVICE_ROLE_KEY: 'service-role-placeholder',
      DEMO_HOMEOWNER_PASSWORD: 'placeholder-password',
      DEMO_CONTRACTOR_PASSWORD: 'placeholder-password',
    };

    expect(module.parseSupabaseProjectRefFromUrl(baseEnv.DEMO_SUPABASE_URL)).toBe('aaaaaaaaaaaaaaaaaaaa');
    expect(() => module.assertSafeDemoTarget({ ...baseEnv, DEMO_MODE_ENABLED: 'false' })).toThrow(/DEMO_MODE_ENABLED/i);
    expect(() =>
      module.assertSafeDemoTarget({
        ...baseEnv,
        DEMO_SUPABASE_URL: 'https://uqgtheclhxqlnjpfmheq.supabase.co',
        DEMO_SUPABASE_PROJECT_REF: 'uqgtheclhxqlnjpfmheq',
      })
    ).toThrow(/production/i);
    expect(() =>
      module.assertSafeDemoTarget({
        ...baseEnv,
        DEMO_SUPABASE_URL: 'https://zpzdkoaubyjtsomccxya.supabase.co',
        DEMO_SUPABASE_PROJECT_REF: 'zpzdkoaubyjtsomccxya',
      })
    ).toThrow(/shared ServSync sandbox/i);
    expect(() => module.requireResetAcknowledgement('reset', 'water_heater_core_loop', baseEnv)).toThrow(/DEMO_RESET_ACKNOWLEDGE/i);
    expect(() =>
      module.requireResetAcknowledgement('reset', 'water_heater_core_loop', {
        ...baseEnv,
        DEMO_RESET_ACKNOWLEDGE: 'reset-water_heater_core_loop',
      })
    ).not.toThrow();
  });

  test('script creates deterministic current-looking demo dates from an anchor', async () => {
    const module = await import('../../scripts/demo/seed-demo-scenario.mjs');
    const dates = module.buildDatePlan('2026-07-10T15:00:00.000Z');

    expect(dates.anchor).toBe('2026-07-10T15:00:00.000Z');
    expect(new Date(dates.requestCreatedAt).getTime()).toBeLessThan(new Date(dates.estimateCreatedAt).getTime());
    expect(new Date(dates.estimateCreatedAt).getTime()).toBeLessThan(new Date(dates.estimateSentAt).getTime());
    expect(new Date(dates.estimateSentAt).getTime()).toBeLessThan(new Date(dates.estimateAcceptedAt).getTime());
    expect(new Date(dates.estimateAcceptedAt).getTime()).toBeLessThan(new Date(dates.jobCreatedAt).getTime());
    expect(new Date(dates.jobCreatedAt).getTime()).toBeLessThan(new Date(dates.visitWindowStart).getTime());
  });

  test('package scripts and runbook describe private dedicated-demo usage only', () => {
    const packageJson = JSON.parse(read(packagePath));
    const runbook = read(runbookPath);

    expect(packageJson.scripts['demo:seed']).toBe('node scripts/demo/seed-demo-scenario.mjs seed water_heater_core_loop');
    expect(packageJson.scripts['demo:reset']).toBe('node scripts/demo/seed-demo-scenario.mjs reset water_heater_core_loop');
    expect(packageJson.scripts['demo:verify']).toBe('node scripts/demo/seed-demo-scenario.mjs verify water_heater_core_loop');
    expect(runbook).toContain('DEMO_MODE_ENABLED');
    expect(runbook).toContain('DEMO_SUPABASE_PROJECT_REF');
    expect(runbook).toContain('Known forbidden refs');
    expect(runbook).toContain('Production: `uqgtheclhxqlnjpfmheq`');
    expect(runbook).toContain('Shared sandbox: `zpzdkoaubyjtsomccxya`');
    expect(runbook).toContain('No email, SMS, push, payment, webhook, AI, geocoding, storage upload, or deployment action is part of Slice 1.');
  });

  test('Demo Mode Slice 1 does not add app UI or browser-exposed service-role usage', () => {
    const script = read(scriptPath);
    const app = read(appPath);

    expect(script).toContain('DEMO_SUPABASE_SERVICE_ROLE_KEY');
    expect(app).not.toContain('DEMO_SUPABASE_SERVICE_ROLE_KEY');
    expect(app).not.toMatch(/Demo Mode|demo:seed|water_heater_core_loop/i);
  });
});
