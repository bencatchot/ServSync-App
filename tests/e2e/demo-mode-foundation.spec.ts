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
      expect(sql).toMatch(new RegExp(`create or replace function public\\.${fn}[\\s\\S]*security definer[\\s\\S]*set search_path = public, pg_temp`, 'i'));
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
        DEMO_SUPABASE_URL: 'https://bbbbbbbbbbbbbbbbbbbb.supabase.co',
        DEMO_SUPABASE_PROJECT_REF: 'aaaaaaaaaaaaaaaaaaaa',
      })
    ).toThrow(/does not match/i);
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
    for (const truthy of ['true', ' TRUE ', '1', 'yes', 'on', 'enabled']) {
      expect(() => module.assertSafeDemoTarget({ ...baseEnv, EMAIL_ENABLED: truthy })).toThrow(/EMAIL_ENABLED/i);
    }
    expect(() => module.assertSafeDemoTarget({ ...baseEnv, EMAIL_ENABLED: 'maybe' })).toThrow(/unrecognized boolean/i);
    expect(() => module.assertSafeDemoTarget({ ...baseEnv, EMAIL_ENABLED: ' false ' })).not.toThrow();
  });

  test('script reconciles every non-reset seed run before reseeding or resetting', () => {
    const script = read(scriptPath);

    expect(script).toContain("const NON_RESET_RUN_STATUSES = ['started', 'failed', 'succeeded']");
    expect(script).toMatch(/async function getScenarioRuns[\s\S]*\.eq\('operation', 'seed'\)[\s\S]*\.in\('status', statuses\)/);
    expect(script).toMatch(/async function inspectNonResetRuns[\s\S]*getRegisteredRecordsForRun/);
    expect(script).toMatch(/async function resetNonResetRuns[\s\S]*for \(const run of runs\)[\s\S]*await resetRun\(service, run\.id\)/);
    expect(script).toMatch(/const previousReset = await resetNonResetRuns\(service, scenarioKey, 'pre-seed-reconciliation'\)/);
    expect(script).not.toMatch(/getLatestSucceededRun|resetLatestIfPresent/);
  });

  test('script fails closed on likely unregistered scenario residue and avoids broad cleanup fallbacks', () => {
    const script = read(scriptPath);

    expect(script).toMatch(/async function assertNoLikelyUnregisteredScenarioRecords/);
    expect(script).toMatch(/findRegisteredRecord\(service, tableName, record\.id\)/);
    expect(script).toMatch(/Demo seed refused: likely unregistered scenario-owned records found/);
    expect(script).toMatch(/\.eq\('nickname', DEMO_PROPERTY\.nickname\)/);
    expect(script).toMatch(/\.eq\('title', 'Water heater replacement estimate'\)/);
    expect(script).not.toMatch(/delete\(\)\.eq\('homeowner_user_id'|delete\(\)\.eq\('user_id'|delete\(\)\.ilike\('title'|delete\(\)\.gte\('created_at'/);
    expect(script).not.toMatch(/truncate|delete from auth\.users/i);
  });

  test('script reduces insert-before-register risk with exact compensation only', () => {
    const script = read(scriptPath);

    expect(script).toMatch(/async function registerCreatedRecord/);
    expect(script).toMatch(/await registerRecord\(service, runId, tableName, recordId/);
    expect(script).toMatch(/await deleteExactCreatedRecord\(service, tableName, recordId\)/);
    expect(script).toMatch(/Exact compensation failed for orphan candidate/);
    expect(script).toMatch(/await registerCreatedRecord\(service, runId, 'homes'/);
    expect(script).toMatch(/await registerCreatedRecord\(service, runId, 'service_requests'/);
    expect(script).toMatch(/await registerCreatedRecord\(service, runId, 'estimates'/);
    expect(script).toMatch(/await registerCreatedRecord\(service, runId, 'inspections'/);
  });

  test('verify checks complete workflow linkage, identities, registry, and duplicate absence', () => {
    const script = read(scriptPath);

    expect(script).toMatch(/async function verifyScenario\(service, scenarioKey, env = process\.env\)/);
    expect(script).toMatch(/assertSafeDemoTarget\(env\)/);
    expect(script).toMatch(/Unresolved started\/failed runs still own registered records/);
    expect(script).toMatch(/Expected exactly one active succeeded scenario run with records/);
    expect(script).toMatch(/verifyAuthUser\(service, homeownerEmail, scenarioKey, 'homeowner'/);
    expect(script).toMatch(/verifyAuthUser\(service, contractorEmail, scenarioKey, 'contractor_owner'/);
    expect(script).toMatch(/Homeowner and contractor auth users resolved to the same ID/);
    expect(script).toMatch(/Required scenario table \$\{tableName\} has no registered records/);
    expect(script).toMatch(/verifyRegistryCompleteness\(service, records, issues\)/);
    expect(script).toMatch(/Registry points to missing/);
    expect(script).toMatch(/Demo service request is not linked to the expected homeowner, contractor, connection, and title/);
    expect(script).toMatch(/Demo estimate is not accepted or not linked to the expected request\/homeowner\/contractor\/home/);
    expect(script).toMatch(/Demo job is not linked to the accepted estimate and expected scenario records/);
    expect(script).toMatch(/Expected exactly one job linked to the demo estimate/);
    expect(script).toMatch(/Demo verification failed/);
  });

  test('auth reconciliation requires explicit demo ownership metadata', () => {
    const script = read(scriptPath);

    expect(script).toMatch(/servsync_demo_owned/);
    expect(script).toMatch(/servsync_demo_scenario/);
    expect(script).toMatch(/servsync_demo_role/);
    expect(script).toMatch(/assertDemoAuthMetadata\(existing, email, scenarioKey, role\)/);
    expect(script).toMatch(/is not marked as ServSync demo-owned/);
    expect(script).toMatch(/belongs to a different demo scenario/);
    expect(script).toMatch(/has an unexpected demo role/);
    expect(script).toMatch(/multiple auth users matched/);
    expect(script).toMatch(/assertDistinctDemoIdentities/);
  });

  test('notification registration is not broad timestamp-based ownership', () => {
    const script = read(scriptPath);

    expect(script).toMatch(/function notificationHandlingDecision/);
    expect(script).toContain('does not register them for reset');
    expect(script).not.toMatch(/registerRecentNotifications/);
    expect(script).not.toMatch(/\.from\('notifications'\)[\s\S]*\.in\('user_id'/);
    expect(script).not.toMatch(/\.from\('notifications'\)[\s\S]*\.gte\('created_at'/);
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
