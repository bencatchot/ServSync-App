import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contractorCreateEstimateScenario } from '../../scripts/demo/recorder/scenarios/contractor-create-estimate.mjs';
import { homeownerReviewEstimateScenario } from '../../scripts/demo/recorder/scenarios/homeowner-review-estimate.mjs';
import { homeownerServiceRequestScenario } from '../../scripts/demo/recorder/scenarios/homeowner-service-request.mjs';
import {
  assertRecordingDuration,
  assertSafeRecorderEnvironment,
  buildArtifactMetadata,
  parseRecorderArgs,
  scanVisibleTextForSensitiveData,
  validateScenarioDefinition,
} from '../../scripts/demo/recorder/lib.mjs';

test('canonical scenario is bounded, reviewable, and Demo-only', () => {
  assert.equal(validateScenarioDefinition(homeownerServiceRequestScenario), homeownerServiceRequestScenario);
  assert.equal(homeownerServiceRequestScenario.initialCheckpoint, 'connected_request_ready');
  assert.equal(homeownerServiceRequestScenario.finalCheckpoint, 'request_ready');
  assert.deepEqual(homeownerServiceRequestScenario.scenes.map((scene) => scene.key), ['homeowner-submit', 'contractor-review']);
  assert.equal(homeownerServiceRequestScenario.viewport.width, 1440);
  assert.equal(homeownerServiceRequestScenario.viewport.height, 900);
  assert.equal(homeownerServiceRequestScenario.finalState.contractorTab, 'Service Requests');
  assert.ok(homeownerServiceRequestScenario.property.addressLine1);
});

test('contractor Estimate scenario is a bounded request-to-draft workflow', () => {
  assert.equal(validateScenarioDefinition(contractorCreateEstimateScenario), contractorCreateEstimateScenario);
  assert.equal(contractorCreateEstimateScenario.initialCheckpoint, 'request_ready');
  assert.equal(contractorCreateEstimateScenario.finalCheckpoint, 'estimate_draft');
  assert.deepEqual(
    contractorCreateEstimateScenario.scenes.map((scene) => scene.key),
    ['request-context', 'estimate-draft', 'estimate-saved'],
  );
  assert.deepEqual(contractorCreateEstimateScenario.expectedDurationSeconds, { min: 15, max: 25 });
  assert.equal(contractorCreateEstimateScenario.estimate.line.unit_price_cents, 189500);
  assert.equal(contractorCreateEstimateScenario.estimate.unitPrice, '1895.00');
  assert.doesNotMatch(JSON.stringify(contractorCreateEstimateScenario), /password|service_role|@example/i);
});

test('homeowner Estimate scenario is a bounded sent-to-accepted response', () => {
  assert.equal(validateScenarioDefinition(homeownerReviewEstimateScenario), homeownerReviewEstimateScenario);
  assert.equal(homeownerReviewEstimateScenario.initialCheckpoint, 'estimate_sent');
  assert.equal(homeownerReviewEstimateScenario.finalCheckpoint, 'estimate_accepted');
  assert.deepEqual(
    homeownerReviewEstimateScenario.scenes.map((scene) => scene.key),
    ['estimate-available', 'estimate-details', 'estimate-accepted'],
  );
  assert.deepEqual(homeownerReviewEstimateScenario.expectedDurationSeconds, { min: 15, max: 22 });
  assert.deepEqual(homeownerReviewEstimateScenario.response, { action: 'accept', resultingStatus: 'accepted' });
  assert.equal(homeownerReviewEstimateScenario.estimate.lineCount, 5);
  assert.equal(homeownerReviewEstimateScenario.estimate.paymentScheduleCount, 2);
  assert.doesNotMatch(JSON.stringify(homeownerReviewEstimateScenario), /password|service_role|@example/i);
});

test('recorder target guard rejects Production, Sandbox, and non-durable app origins', () => {
  const scenario = homeownerServiceRequestScenario;
  assert.equal(assertSafeRecorderEnvironment({}, scenario).projectRef, 'bdytwgejqnlblhrnqxkp');
  assert.throws(() => assertSafeRecorderEnvironment({ DEMO_SUPABASE_PROJECT_REF: 'uqgtheclhxqlnjpfmheq' }, scenario), /dedicated ServSync Demo/i);
  assert.throws(() => assertSafeRecorderEnvironment({ DEMO_SUPABASE_PROJECT_REF: 'zpzdkoaubyjtsomccxya' }, scenario), /dedicated ServSync Demo/i);
  assert.throws(() => assertSafeRecorderEnvironment({ DEMO_SUPABASE_URL: 'https://bdytwgejqnlblhrnqxkp.example.com' }, scenario), /dedicated ServSync Demo/i);
  assert.throws(() => assertSafeRecorderEnvironment({ DEMO_RECORDING_APP_URL: 'https://servsync.app' }, scenario), /durable ServSync Demo origin/i);
});

test('operator arguments stay intentionally small', () => {
  assert.deepEqual(parseRecorderArgs(['homeowner-service-request']), {
    scenarioKey: 'homeowner-service-request', pacing: 'marketing', outputDir: null, headed: false,
  });
  assert.equal(parseRecorderArgs(['homeowner-service-request', '--pacing=tutorial', '--headed']).pacing, 'tutorial');
  assert.equal(parseRecorderArgs(['contractor-create-estimate']).scenarioKey, 'contractor-create-estimate');
  assert.equal(parseRecorderArgs(['homeowner-review-estimate']).scenarioKey, 'homeowner-review-estimate');
  assert.throws(() => parseRecorderArgs(['homeowner-service-request', '--pacing=cinematic']), /Unsupported pacing/i);
  assert.throws(() => parseRecorderArgs(['homeowner-service-request', '--publish']), /Unsupported Demo recorder option/i);
});

test('sensitive visible-text scan catches configured credentials and token-like text', () => {
  assert.deepEqual(scanVisibleTextForSensitiveData('Fictional Demo Bay Home', { password: 'private-pass' }), []);
  assert.deepEqual(scanVisibleTextForSensitiveData('private-pass', { password: 'private-pass' }), ['Visible page text contains password.']);
  assert.match(scanVisibleTextForSensitiveData('service_role', {})[0], /credential marker/i);
});

test('duration and metadata contracts fail closed', () => {
  assert.doesNotThrow(() => assertRecordingDuration(18.25, { min: 14, max: 40 }));
  assert.throws(() => assertRecordingDuration(0, { min: 14, max: 40 }), /no playable duration/i);
  assert.throws(() => assertRecordingDuration(8, { min: 14, max: 40 }), /outside/i);
  const metadata = buildArtifactMetadata({
    scenario: homeownerServiceRequestScenario,
    sourceCommit: 'a'.repeat(40),
    pacing: 'marketing',
    durationSeconds: 18.2539,
    fileName: 'demo.webm',
    createdAt: '2026-08-14T12:00:00.000Z',
  });
  assert.equal(metadata.duration_seconds, 18.254);
  assert.equal(metadata.contains_credentials, false);
  assert.match(metadata.fixture_policy, /registry-owned/i);
  const estimateMetadata = buildArtifactMetadata({
    scenario: contractorCreateEstimateScenario,
    sourceCommit: 'b'.repeat(40),
    pacing: 'marketing',
    durationSeconds: 19.5,
    fileName: 'estimate.webm',
    createdAt: '2026-08-14T12:00:00.000Z',
  });
  assert.match(estimateMetadata.fixture_policy, /estimate_draft/i);
  const homeownerEstimateMetadata = buildArtifactMetadata({
    scenario: homeownerReviewEstimateScenario,
    sourceCommit: 'c'.repeat(40),
    pacing: 'marketing',
    durationSeconds: 18.5,
    fileName: 'homeowner-estimate.webm',
    createdAt: '2026-08-14T12:00:00.000Z',
  });
  assert.match(homeownerEstimateMetadata.fixture_policy, /estimate_accepted/i);
});

test('fixture adoption is exact, lineage-bound, and does not broaden reset authority', () => {
  const source = readFileSync(resolve(process.cwd(), 'scripts/demo/seed-demo-scenario.mjs'), 'utf8');
  const recorderSource = readFileSync(resolve(process.cwd(), 'scripts/demo/record-demo.mjs'), 'utf8');
  assert.match(source, /async function adoptRecorderServiceRequest/);
  assert.match(source, /run\.checkpoint !== 'connected_request_ready'/);
  assert.match(source, /expected exactly one new matching service request/);
  assert.match(source, /\.eq\('homeowner_user_id', homeownerId\)/);
  assert.match(source, /\.eq\('contractor_id', contractorId\)/);
  assert.match(source, /\.eq\('connection_id', connectionId\)/);
  assert.match(source, /\.eq\('home_id', homeId\)/);
  assert.match(source, /linkedEstimates\.length > 0 \|\| linkedJobs\.length > 0/);
  assert.match(source, /verifyScenario\(service, scenarioKey, env, 'request_ready'\)/);
  assert.match(source, /record_role === 'demo_connection'/);
  assert.match(source, /connection_id: created\.connectionId/);
  assert.doesNotMatch(source, /truncate|delete from auth\.users/i);
  assert.match(recorderSource, /requestSubmissionStarted && !requestAdopted/);
  assert.match(recorderSource, /runDemoCommand\(\['adopt-request', scenario\.fixtureScenarioKey\], env\)\.catch/);
  assert.match(source, /async function adoptRecorderEstimateDraft/);
  assert.match(source, /run\.checkpoint !== 'request_ready'/);
  assert.match(source, /expected exactly one new matching Estimate draft/);
  assert.match(source, /recorder_scenario: 'contractor-create-estimate'/);
  assert.match(source, /scheduleItems\.length > 0 \|\| linkedJobs\.length > 0 \|\| linkedInvoices\.length > 0/);
  assert.match(source, /verifyScenario\(service, scenarioKey, env, 'estimate_draft'\)/);
  assert.match(recorderSource, /estimateSubmissionStarted && !estimateAdopted/);
  assert.match(recorderSource, /runDemoCommand\(\['adopt-estimate', scenario\.fixtureScenarioKey\], env\)\.catch/);
  assert.match(source, /async function adoptRecorderEstimateResponse/);
  assert.match(source, /contractorClient\.rpc\('servsync_send_estimate'/);
  assert.doesNotMatch(source, /\.update\(\{ status: 'sent', updated_at: dates\.estimateSentAt \}\)/);
  assert.match(source, /run\.checkpoint !== 'estimate_sent'/);
  assert.match(source, /expected one exact approval event/);
  assert.match(source, /recorder_scenario: 'homeowner-review-estimate'/);
  assert.match(source, /accepting the Estimate created a Job or Invoice/);
  assert.match(source, /verifyScenario\(service, scenarioKey, env, 'estimate_accepted'\)/);
  assert.match(recorderSource, /responseSubmissionStarted && !responseAdopted/);
  assert.match(recorderSource, /runDemoCommand\(\['adopt-estimate-response', scenario\.fixtureScenarioKey\], env\)\.catch/);
});
