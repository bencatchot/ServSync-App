import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const scriptPath = resolve(process.cwd(), 'scripts/demo/seed-demo-scenario.mjs');
const manifestPath = resolve(process.cwd(), 'scripts/demo/scenarios/water-heater-core-loop.mjs');
const appPath = resolve(process.cwd(), 'src/App.tsx');
const packagePath = resolve(process.cwd(), 'package.json');

function read(path: string) {
  return readFileSync(path, 'utf8');
}

test.describe('Demo Mode checkpoint source checks', () => {
  test('manifest defines only the Slice 2A supported checkpoints and deferred future states', async () => {
    const manifest = await import('../../scripts/demo/scenarios/water-heater-core-loop.mjs');

    expect(manifest.scenarioKey).toBe('water_heater_core_loop');
    expect(manifest.defaultCheckpointKey).toBe('job_created');
    expect(manifest.supportedCheckpointKeys).toEqual([
      'request_ready',
      'contractor_review_ready',
      'estimate_draft',
      'estimate_sent',
      'estimate_accepted',
      'job_created',
    ]);
    expect(manifest.deferredCheckpointKeys).toEqual(
      expect.arrayContaining(['estimate_viewed', 'job_in_progress', 'job_completed', 'invoice_draft', 'invoice_sent', 'invoice_paid', 'home_history_updated'])
    );
    expect(manifest.checkpointDefinitions.map((checkpoint: { key: string }) => checkpoint.key)).toEqual(manifest.supportedCheckpointKeys);
    expect(manifest.checkpointByKey.job_created.requiredSteps).toEqual([
      'identities',
      'profilesAndCompany',
      'property',
      'connection',
      'request',
      'contractorReview',
      'estimateDraft',
      'estimateSent',
      'estimateAccepted',
      'jobCreated',
    ]);
  });

  test('checkpoint parser rejects unknown, malformed, and deferred checkpoints before target validation', async () => {
    const module = await import('../../scripts/demo/seed-demo-scenario.mjs');

    expect(module.parseCheckpointKey([])).toBe('job_created');
    expect(module.parseCheckpointKey(['--checkpoint=request_ready'])).toBe('request_ready');
    expect(module.parseCheckpointKey(['--checkpoint', 'estimate_sent'])).toBe('estimate_sent');
    expect(() => module.parseCheckpointKey(['--checkpoint=estimate_viewed'])).toThrow(/Deferred demo checkpoint/);
    expect(() => module.parseCheckpointKey(['--checkpoint=job'])).toThrow(/Unsupported demo checkpoint/);
    expect(() => module.parseCheckpointKey(['--checkpoint='])).toThrow(/checkpoint key is required|Unsupported demo checkpoint/);
    expect(() => module.parseCheckpointKey(['--check=request_ready'])).toThrow(/Unsupported demo argument/);
    for (const args of [
      ['--checkpoint=request_ready', '--checkpoint=job_created'],
      ['--checkpoint', 'request_ready', '--checkpoint', 'job_created'],
      ['--checkpoint=request_ready', '--checkpoint', 'job_created'],
      ['--checkpoint', 'request_ready', '--checkpoint=job_created'],
      ['--checkpoint=request_ready', '--checkpoint=request_ready'],
      ['--checkpoint=request_ready', '--checkpoint=estimate_sent'],
    ]) {
      expect(() => module.parseCheckpointKey(args)).toThrow(/Checkpoint may be specified only once/);
    }
    await expect(
      module.runDemoCommand(['seed', 'water_heater_core_loop', '--checkpoint=request_ready', '--checkpoint=job_created'], {})
    ).rejects.toThrow(/Checkpoint may be specified only once/);
  });

  test('runner uses one canonical step path rather than copied per-checkpoint seed routines', () => {
    const script = read(scriptPath);

    expect(script).toMatch(/function checkpointRequires\(checkpointKey, stepKey\)/);
    expect(script).toMatch(/async function createEstimateDraft/);
    expect(script).toMatch(/async function sendEstimate/);
    expect(script).toMatch(/async function acceptEstimate/);
    expect(script).toMatch(/async function createJobFromEstimate/);
    expect(script).toMatch(/if \(checkpointRequires\(checkpointKey, 'estimateDraft'\)\)/);
    expect(script).toMatch(/if \(checkpointRequires\(checkpointKey, 'estimateSent'\)\)/);
    expect(script).toMatch(/if \(checkpointRequires\(checkpointKey, 'estimateAccepted'\)\)/);
    expect(script).toMatch(/if \(checkpointRequires\(checkpointKey, 'jobCreated'\)\)/);
    expect(script).not.toMatch(/async function seedRequestReady|async function seedEstimateDraft|async function seedJobCreated/);
  });

  test('run metadata stores selected checkpoint, expected graph, and executed steps', () => {
    const script = read(scriptPath);

    expect(script).toMatch(/p_checkpoint: checkpointKey/);
    expect(script).toMatch(/selected_checkpoint: checkpointKey/);
    expect(script).toMatch(/expected_checkpoint_graph: checkpoint\.expected/);
    expect(script).toMatch(/required_steps: checkpoint\.requiredSteps/);
    expect(script).toMatch(/executed_steps: executedSteps/);
    expect(script).toMatch(/p_checkpoint: checkpoint/);
    expect(script).toMatch(/registerCreatedRecord\(service, runId, 'service_requests'[\s\S]*'request_ready'/);
    expect(script).toMatch(/registerCreatedRecord\(service, runId, 'estimates'[\s\S]*'estimate_draft'/);
    expect(script).toMatch(/registerRecord\(service, runId, 'workflow_activity_events'[\s\S]*'estimate_accepted'/);
    expect(script).toMatch(/registerCreatedRecord\(service, runId, 'inspections'[\s\S]*'job_created'/);
  });

  test('verification is checkpoint-aware and forbids records beyond the selected checkpoint', () => {
    const script = read(scriptPath);

    expect(script).toMatch(/Requested checkpoint \$\{requestedCheckpointKey\} does not match active run checkpoint/);
    expect(script).toMatch(/Checkpoint \$\{checkpointKey\} should not have an estimate/);
    expect(script).toMatch(/Checkpoint \$\{checkpointKey\} should not have a job/);
    expect(script).toMatch(/Checkpoint \$\{checkpointKey\} should not have estimate approval workflow events/);
    expect(script).toMatch(/Checkpoint \$\{checkpointKey\} should not have job-created workflow events/);
    expect(script).toMatch(/Draft estimate should not have sent evidence in updated_at/);
    expect(script).toMatch(/Sent or later estimate checkpoint is missing sent timestamp evidence/);
    expect(script).toMatch(/verifyEstimateApprovalWorkflowEvent\(issues, \{ estimate, events: workflowEvents \}\)/);
    expect(script).toMatch(/verifyAcceptedEstimateWorkflowEvents\(issues, \{ estimate, job, events: workflowEvents \}\)/);
  });

  test('lower-checkpoint reseed uses reset and rebuild, preserving auth identity handling', () => {
    const script = read(scriptPath);

    expect(script).toMatch(/const previousReset = await resetNonResetRuns\(service, scenarioKey, 'pre-seed-reconciliation'\)/);
    expect(script).toMatch(/ensureAuthUser\(service, homeownerEmail, homeownerPassword, scenarioKey, 'homeowner'\)/);
    expect(script).toMatch(/ensureAuthUser\(service, contractorEmail, contractorPassword, scenarioKey, 'contractor_owner'\)/);
    expect(script).toMatch(/assertDistinctDemoIdentities/);
    expect(script).not.toMatch(/in-place rollback|rollbackCheckpoint|deleteByCheckpoint/);
  });

  test('production, shared sandbox, and external-effect guards still apply', async () => {
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
    for (const truthy of ['true', ' TRUE ', '1', 'yes', 'on', 'enabled']) {
      expect(() => module.assertSafeDemoTarget({ ...baseEnv, WEBHOOK_DELIVERY_ENABLED: truthy })).toThrow(/WEBHOOK_DELIVERY_ENABLED/i);
    }
  });

  test('package exposes read-only checkpoint listing without adding dependencies or lifecycle hooks', () => {
    const packageJson = JSON.parse(read(packagePath));

    expect(packageJson.scripts['demo:seed']).toBe('node scripts/demo/seed-demo-scenario.mjs seed water_heater_core_loop');
    expect(packageJson.scripts['demo:verify']).toBe('node scripts/demo/seed-demo-scenario.mjs verify water_heater_core_loop');
    expect(packageJson.scripts['demo:checkpoints']).toBe('node scripts/demo/seed-demo-scenario.mjs checkpoints');
    expect(packageJson.scripts.postinstall).toBeUndefined();
    expect(packageJson.scripts.prepare).toBeUndefined();
    expect(packageJson.scripts.prebuild).toBeUndefined();
    expect(packageJson.scripts.postbuild).toBeUndefined();
  });

  test('checkpoint work adds no browser seed/reset controls or frontend service-role exposure', () => {
    const app = read(appPath);

    expect(app).not.toMatch(/demo:seed|demo:reset|demo:checkpoints|water_heater_core_loop/i);
    expect(app).not.toContain('DEMO_SUPABASE_SERVICE_ROLE_KEY');
    expect(app).not.toMatch(/Checkpoint selector|Seed scenario|Reset scenario|presentation=1/i);
  });
});
