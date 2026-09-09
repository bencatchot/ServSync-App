import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mobileDemoWorkDefines } from '../../scripts/mobile/environment.mjs';
import { isSharedDraftComposerLaunchEnabled } from '../../src/features/drafts/sharedDraftComposerAvailability.ts';
import { isDraftJobUiEnabled } from '../../src/features/jobs/draftJobAvailability.ts';
import { isContractorWorkUiEnabled } from '../../src/features/work/contractorWorkAvailability.ts';
import { isGlobalDurableDraftMasterEnabled, canSeeDurableDraftWorkflow } from '../../src/features/drafts/durableDraftCohortAvailability.ts';

const resolvedEnv = input => Object.fromEntries(Object.entries(mobileDemoWorkDefines(input))
  .map(([name, value]) => [name.replace('import.meta.env.', ''), JSON.parse(value)]));
const master = env => isGlobalDurableDraftMasterEnabled({
  sharedDraftComposerEnabled: isSharedDraftComposerLaunchEnabled(env),
  draftJobUiEnabled: isDraftJobUiEnabled(env),
  contractorWorkUiEnabled: isContractorWorkUiEnabled(env),
  demoPresentationActive: false,
});

test('native Demo builds enable the current Work gates even with no local feature flags', () => {
  assert.equal(master({}), false, 'missing web flags select the legacy workflow');
  assert.equal(master(resolvedEnv({})), true);
});

test('native Demo builds reject each conflicting Work switch', () => {
  const env = resolvedEnv({});
  assert.equal(master(resolvedEnv(env)), true);
  for (const name of Object.keys(env)) {
    for (const value of ['false', '', 'TRUE']) {
      assert.throws(() => mobileDemoWorkDefines({ [name]: value }), /match the hosted Work workflow/);
    }
  }
});

test('native build switches retain cohort, session and presentation restrictions', () => {
  const context = {
    globalMasterEnabled: master(resolvedEnv({})), validContractorContext: true,
    activeContractorId: 'contractor-a', activeSessionIdentity: 'owner-a', demoPresentationActive: false,
    availability: { status: 'resolved', canUseDurableDrafts: true, contractorId: 'contractor-a', sessionIdentity: 'owner-a' },
  };
  assert.equal(canSeeDurableDraftWorkflow(context), true);
  assert.equal(canSeeDurableDraftWorkflow({ ...context, availability: { ...context.availability, canUseDurableDrafts: false } }), false);
  assert.equal(canSeeDurableDraftWorkflow({ ...context, activeSessionIdentity: 'owner-b' }), false);
  assert.equal(canSeeDurableDraftWorkflow({ ...context, demoPresentationActive: true }), false);
});
