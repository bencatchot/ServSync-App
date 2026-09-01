import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contractorCompleteWorkScenario } from '../../scripts/demo/recorder/scenarios/contractor-complete-work.mjs';
import { contractorCreateEstimateScenario } from '../../scripts/demo/recorder/scenarios/contractor-create-estimate.mjs';
import { contractorInvoiceOutsidePaymentScenario } from '../../scripts/demo/recorder/scenarios/contractor-invoice-outside-payment.mjs';
import { contractorServiceRequestIntakeScenario } from '../../scripts/demo/recorder/scenarios/contractor-service-request-intake.mjs';
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
  addDemoPresentationOptIn,
  DEMO_PRESENTATION_QUERY_KEY,
  DEMO_PRESENTATION_QUERY_VALUE,
  HUMAN_PACED_PROFILE_NAME,
  HUMAN_PACED_RECORDING_PRESET,
  isPaymentProviderRequest,
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
  assert.deepEqual(contractorCreateEstimateScenario.expectedDurationSeconds, { min: 38, max: 55 });
  assert.equal(contractorCreateEstimateScenario.estimate.line.unit_price_cents, 189500);
  assert.equal(contractorCreateEstimateScenario.estimate.unitPrice, '1895.00');
  assert.doesNotMatch(JSON.stringify(contractorCreateEstimateScenario), /password|service_role|@example/i);
});

test('contractor service-request intake is a read-only request-to-estimate handoff', () => {
  assert.equal(validateScenarioDefinition(contractorServiceRequestIntakeScenario), contractorServiceRequestIntakeScenario);
  assert.equal(contractorServiceRequestIntakeScenario.initialCheckpoint, 'request_ready');
  assert.equal(contractorServiceRequestIntakeScenario.finalCheckpoint, 'request_ready');
  assert.deepEqual(
    contractorServiceRequestIntakeScenario.scenes.map((scene) => scene.key),
    ['request-list', 'request-details', 'estimate-handoff'],
  );
  assert.deepEqual(contractorServiceRequestIntakeScenario.expectedDurationSeconds, { min: 14, max: 34 });
  assert.equal(
    contractorServiceRequestIntakeScenario.scenes.find(scene => scene.key === 'estimate-handoff')?.caption,
    'Choose Create Estimate here to keep the request context attached',
  );
  assert.match(contractorServiceRequestIntakeScenario.fixturePolicy, /read-only after the registry-owned fixture seed/i);
  assert.doesNotMatch(JSON.stringify(contractorServiceRequestIntakeScenario), /password|service_role|@example/i);
});

test('TUT-003 contractor completion scenario preserves accepted Estimate through finalized service record', () => {
  assert.equal(validateScenarioDefinition(contractorCompleteWorkScenario), contractorCompleteWorkScenario);
  assert.equal(contractorCompleteWorkScenario.initialCheckpoint, 'estimate_accepted');
  assert.equal(contractorCompleteWorkScenario.finalCheckpoint, 'home_history_updated');
  assert.deepEqual(
    contractorCompleteWorkScenario.scenes.map((scene) => scene.key),
    ['accepted-estimate', 'job-work', 'job-complete', 'report-finalized'],
  );
  assert.deepEqual(contractorCompleteWorkScenario.expectedDurationSeconds, { min: 50, max: 115 });
  assert.equal(contractorCompleteWorkScenario.showSceneCallouts, false);
  assert.match(contractorCompleteWorkScenario.fixturePolicy, /exact UI-created Job and descendants/i);
  assert.match(contractorCompleteWorkScenario.scenes[0].caption, /Create the Job from the accepted Estimate/);
  assert.match(contractorCompleteWorkScenario.scenes[3].caption, /Finalize the report/);
  assert.doesNotMatch(JSON.stringify(contractorCompleteWorkScenario), /password|service_role|@example/i);
});

test('TUT-004 contractor Invoice scenario preserves completed work through the outside-payment ledger', () => {
  assert.equal(validateScenarioDefinition(contractorInvoiceOutsidePaymentScenario), contractorInvoiceOutsidePaymentScenario);
  assert.equal(contractorInvoiceOutsidePaymentScenario.initialCheckpoint, 'job_completed');
  assert.equal(contractorInvoiceOutsidePaymentScenario.finalCheckpoint, 'invoice_partially_paid');
  assert.deepEqual(
    contractorInvoiceOutsidePaymentScenario.scenes.map((scene) => scene.key),
    ['completed-job', 'invoice-draft', 'invoice-delivered', 'outside-payment', 'payment-recorded'],
  );
  assert.deepEqual(contractorInvoiceOutsidePaymentScenario.expectedDurationSeconds, { min: 38, max: 90 });
  assert.equal(contractorInvoiceOutsidePaymentScenario.showSceneCallouts, false);
  assert.equal(contractorInvoiceOutsidePaymentScenario.payment.amountCents, 40000);
  assert.equal(contractorInvoiceOutsidePaymentScenario.payment.method, 'bank_transfer');
  assert.match(contractorInvoiceOutsidePaymentScenario.fixturePolicy, /customer, property, Request, Estimate, Job, Invoice, and payment lineage/i);
  assert.doesNotMatch(JSON.stringify(contractorInvoiceOutsidePaymentScenario), /password|service_role|@example/i);
});

test('TUT-004 uses the real delivery and canonical outside-payment UI before exact registry adoption', () => {
  const source = readFileSync(new URL('../../scripts/demo/record-demo.mjs', import.meta.url), 'utf8');
  const flowStart = source.indexOf('async function recordContractorInvoiceOutsidePayment');
  const flowEnd = source.indexOf('async function recordHomeownerHomeHistory', flowStart);
  const flow = source.slice(flowStart, flowEnd);

  assert.match(flow, /confirm-create-partial-invoice/);
  assert.match(flow, /runDemoCommand\(\['adopt-invoice'/);
  assert.match(flow, /contractor-send-invoice/);
  assert.match(flow, /homeowner-invoice-card/);
  assert.match(flow, /name: \/\^View Invoice\$\/i/);
  assert.match(flow, /Record money received outside ServSync/);
  assert.match(flow, /paymentProviderRequests/);
  assert.match(flow, /online payment path instead of the offline ledger/);
  assert.match(flow, /runDemoCommand\(\['adopt-invoice-payment'/);
  assert.match(flow, /scenario\.finalState\.balanceDueLabel/);
});

test('TUT-004 provider guard allows only inert first-party payment presentation and history reads', () => {
  assert.equal(
    isPaymentProviderRequest('https://servsync-demo.vercel.app/assets/InvoiceOnlinePaymentButton-DKjDtgK9.js'),
    false,
  );
  assert.equal(
    isPaymentProviderRequest('https://bdytwgejqnlblhrnqxkp.supabase.co/rest/v1/rpc/servsync_list_invoice_online_payments'),
    false,
  );
  assert.equal(isPaymentProviderRequest('https://servsync-demo.vercel.app/api/stripe-invoice-checkout'), true);
  assert.equal(isPaymentProviderRequest('https://servsync-demo.vercel.app/api/payment-intent'), true);
  assert.equal(isPaymentProviderRequest('https://checkout.stripe.com/c/pay/cs_test_example'), true);
  assert.equal(isPaymentProviderRequest('https://api.stripe.com/v1/payment_intents'), true);
});

test('TUT-004 Invoice adoption reads the reservation fields it validates', () => {
  const source = readFileSync(new URL('../../scripts/demo/seed-demo-scenario.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function fetchJobWorkItems');
  const end = source.indexOf('function inProgressCompletedWorkItemCount', start);
  const query = source.slice(start, end);

  assert.match(query, /reserved_invoice_id/);
  assert.match(query, /invoiced_invoice_id/);
});

test('TUT-003 records every approved item through a stable title identity before saving', () => {
  const source = readFileSync(new URL('../../scripts/demo/record-demo.mjs', import.meta.url), 'utf8');
  const flowStart = source.indexOf('async function recordContractorCompleteWork');
  const start = source.indexOf('await setScenarioCaption(page, scenario, 1);', flowStart);
  const end = source.indexOf('await setScenarioCaption(page, scenario, 2);', start);
  const workStep = source.slice(start, end);

  assert.match(workStep, /getAttribute\('data-work-title'\)/);
  assert.match(workStep, /getByRole\('checkbox', \{ name: `Complete approved work: \$\{title\}`, exact: true \}\)/);
  assert.match(workStep, /await waitForChecked\(checkbox\)/);
  assert.match(workStep, /inputs\.some\(input => !input\.checked\)/);
  assert.match(workStep, /originalWorkNotes\.includes\(scenario\.estimate\.scope\)/);
  assert.match(workStep, /await moveAndAppend\(page, workNotes, scenario\.work\.completionNote, pacing\)/);
  assert.match(workStep, /await waitForEnabled\(saveProgress\)/);
});

test('TUT-003 keeps one caption system and appends the completion note without clearing accepted scope', () => {
  const source = readFileSync(new URL('../../scripts/demo/record-demo.mjs', import.meta.url), 'utf8');
  const flowStart = source.indexOf('async function recordContractorCompleteWork');
  const flowEnd = source.indexOf('async function recordHomeownerHomeHistory', flowStart);
  const flow = source.slice(flowStart, flowEnd);
  const appendStart = source.indexOf('async function moveAndAppend');
  const appendEnd = source.indexOf('async function setScenarioCaption', appendStart);
  const appendHelper = source.slice(appendStart, appendEnd);

  assert.match(flow, /setScenarioCaption\(page, scenario, 0\)/);
  assert.doesNotMatch(flow, /setCaption\(page, scenario\.scenes/);
  assert.match(appendHelper, /const existingValue = await locator\.inputValue\(\)/);
  assert.match(appendHelper, /setSelectionRange\(element\.value\.length, element\.value\.length\)/);
  assert.match(appendHelper, /nextValue\.startsWith\(existingValue\)/);
  assert.doesNotMatch(appendHelper, /Meta\+A|Control\+A|Backspace/);
});

test('human-paced clicks retain cursor movement but re-resolve the action target after UI updates', () => {
  const source = readFileSync(new URL('../../scripts/demo/record-demo.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function moveAndClick');
  const end = source.indexOf('async function waitForChecked', start);
  const clickHelper = source.slice(start, end);

  assert.match(clickHelper, /await moveCursorHuman\(page, x, y, pacing\)/);
  assert.match(clickHelper, /await wait\(pacing\.settleBeforeClick\)/);
  assert.match(clickHelper, /await locator\.click\(\)/);
  assert.doesNotMatch(clickHelper, /page\.mouse\.click/);
});

test('TUT-003 proves transient finalization feedback once and keeps the final scene assertion persistent', () => {
  const source = readFileSync(new URL('../../scripts/demo/record-demo.mjs', import.meta.url), 'utf8');
  const flowStart = source.indexOf('async function recordContractorCompleteWork');
  const start = source.indexOf('await setScenarioCaption(page, scenario, 3);', flowStart);
  const end = source.indexOf('const sensitiveIssues = scanVisibleTextForSensitiveData', start);
  const finalStep = source.slice(start, end);

  assert.match(finalStep, /getByTestId\('contractor-report-finalize-feedback'\)/);
  assert.match(finalStep, /innerText\(\)[\s\S]*scenario\.finalState\.reportFeedback/);
  assert.match(finalStep, /const persistentFinalText = \[/);
  assert.match(finalStep, /'Filed to Documents'/);
  assert.match(finalStep, /const missingPersistentText = persistentFinalText\.filter/);
  assert.doesNotMatch(finalStep, /persistentFinalText = \[[\s\S]*scenario\.finalState\.reportFeedback/);
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

test('recorder adds the explicit non-persistent presentation opt-in', () => {
  const url = addDemoPresentationOptIn('https://servsync-demo.vercel.app/?existing=value#/home');
  assert.equal(url.searchParams.get(DEMO_PRESENTATION_QUERY_KEY), DEMO_PRESENTATION_QUERY_VALUE);
  assert.equal(url.searchParams.get('existing'), 'value');
  assert.equal(url.hash, '#/home');
  assert.equal(url.searchParams.getAll(DEMO_PRESENTATION_QUERY_KEY).length, 1);
});

test('recorder adds an exact scenario opt-in only when supplied', () => {
  const generic = addDemoPresentationOptIn('https://servsync-demo.vercel.app/');
  const completeWork = addDemoPresentationOptIn('https://servsync-demo.vercel.app/', 'contractor-complete-work');

  assert.equal(generic.searchParams.has('servsync-recorder-scenario'), false);
  assert.equal(completeWork.searchParams.get('servsync-recorder-scenario'), 'contractor-complete-work');
});

test('recorder navigates through the current Work destination, not the retired Jobs tab', () => {
  for (const path of [
    'scripts/demo/record-demo.mjs',
    'scripts/demo/recorder/flagship-introduction.mjs',
  ]) {
    const source = readFileSync(resolve(process.cwd(), path), 'utf8');
    assert.match(source, /openSidebar\([^\n]+, \/\^Work\$\/i\)/);
    assert.doesNotMatch(source, /openSidebar\([^\n]+, \/\^Jobs\$\/i\)/);
  }
  const recorder = readFileSync(resolve(process.cwd(), 'scripts/demo/record-demo.mjs'), 'utf8');
  assert.match(recorder, /contractor-jobs-summary-estimates/);
});

test('Home History recorder follows the current Properties workspace instead of the retired page heading', () => {
  const recorderSource = readFileSync(resolve(process.cwd(), 'scripts/demo/record-demo.mjs'), 'utf8');
  assert.match(recorderSource, /homeowner-properties-workspace/);
  assert.match(recorderSource, /property-workspace-title/);
  assert.doesNotMatch(recorderSource, /Home \\\/ Properties/);
  assert.match(recorderSource, /result\.error\?\.code === 'ENOENT'/);
  assert.match(recorderSource, /from pypdf import PdfReader/);
});

test('operator arguments stay intentionally small', () => {
  assert.deepEqual(parseRecorderArgs(['homeowner-service-request']), {
    scenarioKey: 'homeowner-service-request', pacing: 'marketing', outputDir: null, headed: false,
  });
  assert.equal(parseRecorderArgs(['homeowner-service-request', '--pacing=tutorial', '--headed']).pacing, 'tutorial');
  assert.equal(parseRecorderArgs(['homeowner-service-request', '--pacing=human-paced']).pacing, 'human-paced');
  assert.equal(parseRecorderArgs(['contractor-create-estimate']).scenarioKey, 'contractor-create-estimate');
  assert.equal(parseRecorderArgs(['contractor-service-request-intake']).scenarioKey, 'contractor-service-request-intake');
  assert.equal(parseRecorderArgs(['contractor-complete-work']).scenarioKey, 'contractor-complete-work');
  assert.equal(parseRecorderArgs(['contractor-invoice-outside-payment']).scenarioKey, 'contractor-invoice-outside-payment');
  assert.equal(parseRecorderArgs(['homeowner-home-history']).scenarioKey, 'homeowner-home-history');
  assert.equal(parseRecorderArgs(['servsync-platform-introduction']).scenarioKey, 'servsync-platform-introduction');
  assert.throws(() => parseRecorderArgs(['homeowner-service-request', '--pacing=cinematic']), /Unsupported pacing/i);
  assert.throws(() => parseRecorderArgs(['homeowner-service-request', '--publish']), /Unsupported Demo recorder option/i);
});

test('contractor intake recorder is registered for Help and stops before business-data mutation', () => {
  const recorderSource = readFileSync(resolve(process.cwd(), 'scripts/demo/record-demo.mjs'), 'utf8');
  const helpSource = readFileSync(resolve(process.cwd(), 'scripts/help/run-help-studio-recording.mjs'), 'utf8');
  assert.match(recorderSource, /contractorServiceRequestIntakeScenario/);
  assert.match(recorderSource, /isServiceRequestIntake/);
  assert.match(recorderSource, /requestCard\.getByRole\('button'\)\.first\(\)/);
  assert.match(recorderSource, /getByText\(scenario\.request\.description, \{ exact: false \}\)\.first\(\)\.waitFor/);
  assert.match(recorderSource, /setCaption\(page, scenario\.scenes\[1\]\.caption\);\n\s+await wait\(4000\)/);
  assert.match(recorderSource, /scenario\.finalState\.startChoiceTitle/);
  assert.match(helpSource, /'contractor-service-request-intake'/);
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
  assert.match(source, /async function adoptRecorderJobFromAcceptedEstimate/);
  assert.match(source, /run\.checkpoint !== 'estimate_accepted'/);
  assert.match(source, /expected exactly one new matching Job/);
  assert.match(source, /registeredEstimateLineIds\.has\(item\.source_estimate_line_item_id\)/);
  assert.match(source, /verifyScenario\(service, scenarioKey, env, 'job_scheduled'\)/);
  assert.match(source, /async function adoptRecorderCompletedJob/);
  assert.match(source, /run\.checkpoint !== 'job_scheduled'/);
  assert.match(source, /verifyScenario\(service, scenarioKey, env, 'job_completed'\)/);
  assert.match(recorderSource, /runDemoCommand\(\['adopt-job', scenario\.fixtureScenarioKey\], env\)/);
  assert.match(recorderSource, /runDemoCommand\(\['adopt-job-completion', scenario\.fixtureScenarioKey\], env\)/);
  assert.match(recorderSource, /runDemoCommand\(\['adopt-report', scenario\.fixtureScenarioKey\], env\)/);
  assert.match(source, /async function adoptRecorderInvoiceFromCompletedJob/);
  assert.match(source, /run\.checkpoint !== 'job_completed'/);
  assert.match(source, /lineWorkItemIds[\s\S]*workItemIds/);
  assert.match(source, /verifyScenario\(service, scenarioKey, env, 'invoice_draft'\)/);
  assert.match(source, /async function adoptRecorderOutsidePayment/);
  assert.match(source, /run\.checkpoint !== 'invoice_draft'/);
  assert.match(source, /servsync_list_invoice_offline_payments/);
  assert.match(source, /verifyScenario\(service, scenarioKey, env, 'invoice_partially_paid'\)/);
  assert.match(recorderSource, /invoiceCreationStarted && !invoiceAdopted/);
  assert.match(recorderSource, /paymentSubmissionStarted && !paymentAdopted/);
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
  const invoiceReleaseCall = source.indexOf('releaseRegisteredInvoiceWorkItemsForReset(service, run)', resetStart);
  const resetRpc = source.indexOf("service.rpc('servsync_demo_reset_registered_run'", resetStart);
  assert.ok(resetStart >= 0 && cleanupCall > resetStart && invoiceReleaseCall > cleanupCall && resetRpc > invoiceReleaseCall);
  assert.match(source, /\.remove\(\[storage\.path\]\)/);
  assert.doesNotMatch(source, /\.emptyBucket\(|\.remove\(\[[^\]]*\*|storage\.objects.*delete/i);
  assert.match(source, /cleanup\?\.state === 'deleted'/);
  assert.match(source, /cleanup\?\.state !== 'deleting'/);
  assert.match(source, /a registered work item points to an unregistered Invoice/);
  assert.match(source, /billing_status: 'unbilled', reserved_invoice_id: null, invoiced_invoice_id: null/);
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
  assert.match(appSource, /canFinalizeCompletedJobReport = canManageJobOperations;/);
  assert.doesNotMatch(appSource, /SERVSYNC_DEMO_PRESENTATION_MODE && contractor\?\.owner_user_id === profile\.id/);
  assert.match(appSource, /canFinalizeCompletedJobReport && activeInspection\.status === 'draft'/);
  assert.match(appSource, /const finalizeInspection[\s\S]*if \(!canFinalizeCompletedJobReport\)/);
  assert.doesNotMatch(appSource, /!SERVSYNC_DEMO_PRESENTATION_MODE && canManageJobOperations && activeInspection\.status === 'draft'/);
  assert.match(appSource, /generateInspectionPdf\(finalInsp/);
  assert.match(appSource, /finalizeJobReportDurably\(/);
});
