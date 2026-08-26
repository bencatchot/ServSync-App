#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { supportedCheckpointKeys } from './scenarios/water-heater-core-loop.mjs';
import { assertSafeDemoTarget } from './seed-demo-scenario.mjs';

if (process.argv.slice(2).join(' ') !== '--execute-demo') {
  throw new Error('Live Demo checkpoint matrix refused. Pass exactly --execute-demo after separate owner approval.');
}

assertSafeDemoTarget(process.env);

const runner = 'scripts/demo/seed-demo-scenario.mjs';
const scenario = 'water_heater_core_loop';
const resetEnv = { ...process.env, DEMO_RESET_ACKNOWLEDGE: 'reset-water_heater_core_loop' };

function run(command, args, env = process.env, expectFailure = false) {
  const result = spawnSync(command, args, { cwd: process.cwd(), env, stdio: 'inherit' });
  if (expectFailure ? result.status === 0 : result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} ${expectFailure ? 'unexpectedly passed' : 'failed'}.`);
  }
}

function seed(checkpoint, env = process.env, expectFailure = false) {
  run(process.execPath, [runner, 'seed', scenario, `--checkpoint=${checkpoint}`], env, expectFailure);
}

function verify(checkpoint) {
  run(process.execPath, [runner, 'verify', scenario, `--checkpoint=${checkpoint}`]);
}

function reset() {
  run(process.execPath, [runner, 'reset', scenario], resetEnv);
}

for (const checkpoint of supportedCheckpointKeys) {
  if (checkpoint === 'home_history_updated') {
    run(process.execPath, ['scripts/demo/record-demo.mjs', 'homeowner-home-history']);
  } else {
    seed(checkpoint);
  }
  verify(checkpoint);
  reset();
}

// Same-checkpoint replacement proves repeatable reset/reseed behavior.
seed('invoice_paid');
verify('invoice_paid');
seed('invoice_paid');
verify('invoice_paid');
reset();

// Deliberately fail after the Invoice has been registered. The next seed must
// reconcile the failed run before rebuilding and verifying the same checkpoint.
seed(
  'invoice_draft',
  {
    ...process.env,
    SERVSYNC_DEMO_QA_INTERRUPT_AFTER_STEP: 'invoiceDraft',
    SERVSYNC_DEMO_QA_INTERRUPT_ACKNOWLEDGE: 'interrupt-demo-fixture-run',
  },
  true
);
seed('invoice_draft');
verify('invoice_draft');
reset();

process.stdout.write(`Demo checkpoint matrix passed ${supportedCheckpointKeys.length} supported checkpoints, repeat reseed, interrupted recovery, and final reset.\n`);
