import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contractorCreateEstimateScenario } from '../../scripts/demo/recorder/scenarios/contractor-create-estimate.mjs';
import { homeownerHomeHistoryScenario } from '../../scripts/demo/recorder/scenarios/homeowner-home-history.mjs';
import { homeownerServiceRequestScenario } from '../../scripts/demo/recorder/scenarios/homeowner-service-request.mjs';
import { servsyncPlatformIntroductionScenario } from '../../scripts/demo/recorder/scenarios/servsync-platform-introduction.mjs';
import {
  resolveFinalizedReportRegistryRecords,
  validateFinalizedReportStoragePath,
} from '../../scripts/demo/seed-demo-scenario.mjs';
import {
  assertRecordingDuration,
  assertSafeRecorderEnvironment,
  buildArtifactMetadata,
  cursorInterpolation,
  HUMAN_PACED_PROFILE_NAME,
  HUMAN_PACED_RECORDING_PRESET,
  pacingFor,
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
  assert.deepEqual(contractorCreateEstimateScenario.expectedDurationSeconds, { min: 20, max: 40 });
  assert.equal(contractorCreateEstimateScenario.estimate.line.unit_price_cents, 189500);
  assert.equal(contractorCreateEstimateScenario.estimate.unitPrice, '1895.00');
  assert.doesNotMatch(JSON.stringify(contractorCreateEstimateScenario), /password|service_role|@example/i);
});

test('homeowner Home History scenario is a bounded read-only finalized-report workflow', () => {
  assert.equal(validateScenarioDefinition(homeownerHomeHistoryScenario), homeownerHomeHistoryScenario);
  assert.equal(homeownerHomeHistoryScenario.initialCheckpoint, 'job_completed');
  assert.equal(homeownerHomeHistoryScenario.finalCheckpoint, 'home_history_updated');
  assert.deepEqual(
    homeownerHomeHistoryScenario.scenes.map((scene) => scene.key),
    ['open-home', 'home-history', 'finalized-report'],
  );
  assert.deepEqual(homeownerHomeHistoryScenario.expectedDurationSeconds, { min: 18, max: 32 });
  assert.match(homeownerHomeHistoryScenario.fixturePolicy, /canonical ServSync report through the normal contractor UI/i);
  assert.doesNotMatch(JSON.stringify(homeownerHomeHistoryScenario), /password|service_role|@example/i);
});

test('flagship introduction uses the truthful contractor-created Discover model and canonical lifecycle surfaces', () => {
  assert.equal(validateScenarioDefinition(servsyncPlatformIntroductionScenario), servsyncPlatformIntroductionScenario);
  assert.equal(servsyncPlatformIntroductionScenario.initialCheckpoint, 'contractor_discovery_ready');
  assert.equal(servsyncPlatformIntroductionScenario.finalCheckpoint, 'home_history_updated');
  assert.deepEqual(servsyncPlatformIntroductionScenario.expectedDurationSeconds, { min: 65, max: 80 });
  assert.deepEqual(
    servsyncPlatformIntroductionScenario.scenes.map((scene) => scene.key),
    ['homeowner-need', 'recommendation-list', 'contractor-side', 'servsync-intro', 'discover', 'profile-connection', 'service-request', 'estimate', 'job', 'invoice', 'home-history', 'beta'],
  );
  assert.match(servsyncPlatformIntroductionScenario.fixturePolicy, /canonical Invoice and finalized-report output/i);
  assert.doesNotMatch(JSON.stringify(servsyncPlatformIntroductionScenario), /password|service_role|@example/i);
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
  assert.equal(parseRecorderArgs(['homeowner-service-request', '--pacing=human-paced']).pacing, 'human-paced');
  assert.equal(parseRecorderArgs(['contractor-create-estimate']).scenarioKey, 'contractor-create-estimate');
  assert.equal(parseRecorderArgs(['homeowner-home-history']).scenarioKey, 'homeowner-home-history');
  assert.equal(parseRecorderArgs(['servsync-platform-introduction']).scenarioKey, 'servsync-platform-introduction');
  assert.throws(() => parseRecorderArgs(['homeowner-service-request', '--pacing=cinematic']), /Unsupported pacing/i);
  assert.throws(() => parseRecorderArgs(['homeowner-service-request', '--publish']), /Unsupported Demo recorder option/i);
});

test('shared Help and Marketing pacing uses the reviewed human-paced defaults', () => {
  const marketing = pacingFor('marketing');
  const help = pacingFor('human-paced');
  assert.equal(help, marketing);
  assert.equal(help, HUMAN_PACED_RECORDING_PRESET);
  assert.equal(help.profile, HUMAN_PACED_PROFILE_NAME);
  assert.equal(help.initialHold, 1300);
  assert.equal(marketing.settleBeforeClick, 550);
  assert.equal(marketing.postClick, 900);
  assert.equal(marketing.typing, 75);
  assert.equal(marketing.finalHold, 3200);
  assert.ok(marketing.nearbyTravel >= 600);
  assert.ok(marketing.mediumTravel >= 1000);
  assert.ok(marketing.largeTravel >= 1500);
  const recorderSource = readFileSync(resolve(process.cwd(), 'scripts/demo/record-demo.mjs'), 'utf8');
  assert.match(recorderSource, /cursorInterpolation/);
  assert.match(recorderSource, /await wait\(pacing\.settleBeforeClick\)/);
  assert.match(recorderSource, /await moveCursorToRest\(page, (?:scenePacing|pacing)\)/);
  assert.doesNotMatch(recorderSource, /preClick: 160|postClick: 300/);
});

test('human-paced cursor interpolation is smooth, categorized, and never teleports', () => {
  const nearby = cursorInterpolation({ x: 100, y: 100 }, { x: 220, y: 140 });
  const medium = cursorInterpolation({ x: 100, y: 100 }, { x: 620, y: 300 });
  const large = cursorInterpolation({ x: 100, y: 100 }, { x: 1200, y: 780 });
  assert.equal(nearby.duration, 700);
  assert.equal(medium.duration, 1100);
  assert.equal(large.duration, 1500);
  assert.ok(nearby.points.length >= 24);
  assert.ok(medium.points.length > nearby.points.length);
  assert.ok(large.points.length > medium.points.length);
  assert.deepEqual(large.points.at(-1), { x: 1200, y: 780 });
  assert.ok(large.points.every((point, index) => index === 0 || point.x > large.points[index - 1].x));
  assert.ok(Math.hypot(large.points[0].x - 100, large.points[0].y - 100) < 2);
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
  assert.equal(metadata.pacing_profile, HUMAN_PACED_PROFILE_NAME);
  assert.equal(metadata.pacing_defaults.settle_before_click_ms, 550);
  assert.equal(metadata.canonical_output_provenance, 'validated_servsync_demo_recorder');
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
});

test('Home History fixture patch extends only the exact Demo reset allowlist with dependency-safe ordering', () => {
  const foundation = readFileSync(resolve(process.cwd(), 'servsync-demo-mode-foundation.sql'), 'utf8');
  const patch = readFileSync(
    resolve(process.cwd(), 'servsync-demo-recorder-home-history-fixture-registry.sql'),
    'utf8',
  );
  for (const source of [foundation, patch]) {
    const history = source.indexOf("p_table_name = 'home_maintenance_log' then 119");
    const document = source.indexOf("p_table_name = 'home_documents' then 118");
    const notification = source.indexOf("p_table_name = 'notifications' then 115");
    const job = source.indexOf("p_table_name = 'inspections' then 80");
    assert.ok(history >= 0 && document > history && notification > document && job > notification);
  }
  assert.match(patch, /Dedicated Demo project only: bdytwgejqnlblhrnqxkp/);
  assert.doesNotMatch(patch, /create table|alter table|delete from|truncate|storage\.objects/i);
});

test('flagship fixture patch allows only exact Discover and Invoice rows with dependency-safe reset ordering', () => {
  const patch = readFileSync(resolve(process.cwd(), 'servsync-demo-recorder-flagship-fixture-registry.sql'), 'utf8');
  const post = patch.indexOf("p_table_name = 'contractor_posts' then 125");
  const notification = patch.indexOf("p_table_name = 'notifications' then 115");
  const invoiceLine = patch.indexOf("p_table_name = 'invoice_line_items' then 114");
  const invoice = patch.indexOf("p_table_name = 'invoices' then 113");
  const job = patch.indexOf("p_table_name = 'inspections' then 80");
  assert.ok(post >= 0 && notification > post && invoiceLine > notification && invoice > invoiceLine && job > invoice);
  assert.match(patch, /Dedicated Demo project only: bdytwgejqnlblhrnqxkp/);
  assert.doesNotMatch(patch, /create table|alter table|delete from|truncate|storage\.objects/i);
});

test('flagship preparation and adoption stay exact-row, Demo-only, and product-path based', () => {
  const seedSource = readFileSync(resolve(process.cwd(), 'scripts/demo/seed-demo-scenario.mjs'), 'utf8');
  const recorderSource = readFileSync(resolve(process.cwd(), 'scripts/demo/recorder/flagship-introduction.mjs'), 'utf8');
  assert.match(seedSource, /FLAGSHIP_DISCOVER_CONTRACTORS/);
  assert.match(seedSource, /demo_flagship_discover_post/);
  assert.doesNotMatch(seedSource, /adopt-connection|pending_connection_id/);
  assert.match(recorderSource, /Share property access with Gulf Coast Home Services/);
  assert.match(seedSource, /expected exactly one new canonical draft/);
  assert.match(recorderSource, /simple-job-finalize-report/);
  assert.match(seedSource, /servsync_create_partial_invoice_from_job/);
  assert.match(recorderSource, /create-flagship-invoice/);
  assert.match(recorderSource, /adopt-report/);
  assert.match(recorderSource, /fictional_product_capability_used: false/);
  assert.doesNotMatch(recorderSource, /servsync\.app\/api|uqgtheclhxqlnjpfmheq|zpzdkoaubyjtsomccxya/);
});

test('finalized report ownership requires one exact document, history row, and notification', () => {
  const records = [
    {
      table_name: 'home_documents',
      record_role: 'demo_finalized_report_document',
      record_id: '00000000-0000-4000-8000-000000000011',
    },
    {
      table_name: 'home_maintenance_log',
      record_role: 'demo_home_history_entry',
      record_id: '00000000-0000-4000-8000-000000000012',
    },
    {
      table_name: 'notifications',
      record_role: 'demo_finalized_report_notification',
      record_id: '00000000-0000-4000-8000-000000000013',
    },
  ];
  assert.deepEqual(
    Object.values(resolveFinalizedReportRegistryRecords({ records })).map((record) => record.record_id),
    records.map((record) => record.record_id),
  );
  assert.throws(
    () => resolveFinalizedReportRegistryRecords({ records: records.slice(0, 2) }),
    /expected exactly one registered notifications/i,
  );
  assert.throws(
    () => resolveFinalizedReportRegistryRecords({ records: [...records, records[0]] }),
    /expected exactly one registered home_documents/i,
  );
});

test('Home History checkpoint verifies exact home lineage on both generated rows', () => {
  const source = readFileSync(resolve(process.cwd(), 'scripts/demo/seed-demo-scenario.mjs'), 'utf8');
  assert.match(source, /home_maintenance_log'[\s\S]*?home_id[\s\S]*?history\?\.home_id !== homeId/);
  assert.match(source, /home_documents'[\s\S]*?home_id[\s\S]*?document\?\.home_id !== homeId/);
});

test('finalized report Storage identity accepts only one canonical private PDF path', () => {
  const homeownerId = '00000000-0000-4000-8000-000000000001';
  const jobId = '00000000-0000-4000-8000-000000000002';
  const objectId = '00000000-0000-4000-8000-000000000003';
  const path = `${homeownerId}/field-work/${jobId}/${objectId}.pdf`;
  assert.deepEqual(validateFinalizedReportStoragePath(path, homeownerId, jobId), {
    bucket: 'home-documents',
    path,
    folder: `${homeownerId}/field-work/${jobId}`,
    fileName: `${objectId}.pdf`,
  });
  for (const unsafePath of [
    `${homeownerId}/field-work/00000000-0000-4000-8000-000000000099/${objectId}.pdf`,
    `${homeownerId}/field-work/${jobId}/../${objectId}.pdf`,
    `${homeownerId}/field-work/${jobId}/nested/${objectId}.pdf`,
    `${homeownerId}/field-work/${jobId}/report.pdf`,
  ]) {
    assert.throws(() => validateFinalizedReportStoragePath(unsafePath, homeownerId, jobId), /refused/i);
  }
});

test('registered Storage cleanup is ordered before exact database reset and never sweeps a bucket', () => {
  const source = readFileSync(resolve(process.cwd(), 'scripts/demo/seed-demo-scenario.mjs'), 'utf8');
  const resetStart = source.indexOf('async function resetRun');
  const cleanupCall = source.indexOf('cleanupRegisteredFinalizedReportStorage(service, run)', resetStart);
  const resetRpc = source.indexOf("service.rpc('servsync_demo_reset_registered_run'", resetStart);
  assert.ok(resetStart >= 0 && cleanupCall > resetStart && resetRpc > cleanupCall);
  assert.match(source, /\.remove\(\[storage\.path\]\)/);
  assert.doesNotMatch(source, /\.emptyBucket\(|\.remove\(\[[^\]]*\*|storage\.objects.*delete/i);
  assert.match(source, /cleanup\?\.state === 'deleted'/);
  assert.match(source, /cleanup\?\.state !== 'deleting'/);
});

test('Home History recording accepts only the canonical generator name or Storage UUID basename', () => {
  const source = readFileSync(resolve(process.cwd(), 'scripts/demo/record-demo.mjs'), 'utf8');
  assert.match(source, /scenario\.finalState\.reportFileNamePattern\.test\(suggestedFileName\)/);
  assert.match(source, /isCanonicalStorageName/);
  assert.match(source, /\[0-9a-f\]\{12\}\\\.pdf/);
  assert.match(source, /if \(!isFriendlyReportName && !isCanonicalStorageName\)/);
});

test('Marketing Home History uses the canonical product finalizer and cannot seed a bespoke PDF', () => {
  const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
  const seederSource = readFileSync(resolve(process.cwd(), 'scripts/demo/seed-demo-scenario.mjs'), 'utf8');
  const recorderSource = readFileSync(resolve(process.cwd(), 'scripts/demo/record-demo.mjs'), 'utf8');

  assert.doesNotMatch(seederSource, /buildDemoFinalizedReportPdf|new jsPDF|Fictional demo record/);
  assert.match(seederSource, /Home History seeding refused:[\s\S]*canonical report bytes must be generated by the normal contractor UI/);
  assert.match(seederSource, /source_generator: 'generateInspectionPdf'/);
  assert.match(seederSource, /source_ui: 'canonical_contractor_finalize_report'/);
  assert.match(seederSource, /partial durable report lineage exists, so orphan cleanup is unsafe/);
  assert.match(seederSource, /\.like\('storage_path', `\$\{storageFolder\}\/\%`\)/);
  assert.match(seederSource, /\[1-5\]\[0-9a-f\]\{3\}.*\\\.pdf/);
  assert.match(seederSource, /\.remove\(orphanPaths\)/);
  assert.match(recorderSource, /getByTestId\('simple-job-finalize-report'\)\.click\(\)/);
  assert.match(recorderSource, /seed\.records\?\.jobId/);
  assert.match(recorderSource, /data-record-id="\$\{canonicalJobId\}"/);
  assert.match(recorderSource, /adoption\.records\?\.homeHistoryId/);
  assert.match(recorderSource, /data-record-id="\$\{canonicalHomeHistoryId\}"/);
  assert.doesNotMatch(recorderSource, /scenario\.finalState\.homeHistoryTitle/);
  assert.match(recorderSource, /runDemoCommand\(\['adopt-report', scenario\.fixtureScenarioKey\], env\)/);
  assert.match(recorderSource, /extractPdfText/);
  assert.match(recorderSource, /retired fixture-only report content/);
  assert.match(recorderSource, /Math\.max\(scenePacing\.finalHold, 5500\)/);
  assert.match(appSource, /data-testid="simple-job-finalize-report"/);
  assert.match(appSource, /onClick=\{\(\) => void finalizeInspection\(activeInspection\)\}/);
  assert.match(appSource, /canFinalizeCompletedJobReport = canManageJobOperations[\s\S]*SERVSYNC_DEMO_PRESENTATION_MODE && contractor\?\.owner_user_id === profile\.id/);
  assert.match(appSource, /canFinalizeCompletedJobReport && activeInspection\.status === 'draft'/);
  assert.match(appSource, /const finalizeInspection[\s\S]*if \(!canFinalizeCompletedJobReport\)/);
  assert.doesNotMatch(appSource, /!SERVSYNC_DEMO_PRESENTATION_MODE && canManageJobOperations && activeInspection\.status === 'draft'/);
  assert.match(appSource, /generateInspectionPdf\(finalInsp/);
  assert.match(appSource, /supabase\.rpc\('servsync_finalize_field_work'/);
});
