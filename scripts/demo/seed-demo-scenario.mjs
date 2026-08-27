#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  checkpointByKey,
  dateOffsets,
  defaultCheckpointKey,
  deferredCheckpointKeys,
  estimateFixture,
  lifecycleStepKeys,
  personas,
  propertyFixture,
  recorderEstimateFixture,
  requestFixture,
  supportedCheckpointKeys,
  waterHeaterCoreLoopScenario,
} from './scenarios/water-heater-core-loop.mjs';

export const WATER_HEATER_SCENARIO_KEY = waterHeaterCoreLoopScenario.scenarioKey;
export const KNOWN_PRODUCTION_REF = 'uqgtheclhxqlnjpfmheq';
export const KNOWN_SHARED_SANDBOX_REF = 'zpzdkoaubyjtsomccxya';
export const REQUIRED_ENABLE_VALUE = 'true';
export const RESET_ACKNOWLEDGEMENT_PREFIX = 'reset-';

const SCENARIOS = {
  [WATER_HEATER_SCENARIO_KEY]: waterHeaterCoreLoopScenario,
};

export const SUPPORTED_CHECKPOINT_KEYS = supportedCheckpointKeys;
export const DEFAULT_CHECKPOINT_KEY = defaultCheckpointKey;
export const DEFERRED_CHECKPOINT_KEYS = deferredCheckpointKeys;
export const LIFECYCLE_STEP_KEYS = lifecycleStepKeys;

const FORBIDDEN_EXTERNAL_FLAGS = [
  'EMAIL_ENABLED',
  'HOME_ACCESS_INVITE_EMAIL_ENABLED',
  'STRIPE_ENABLED',
  'SERVSYNC_STRIPE_CONNECT_TEST_ENABLED',
  'SERVSYNC_FACEBOOK_PUBLIC_POSTS_ENABLED',
  'SMS_ENABLED',
  'PUSH_NOTIFICATIONS_ENABLED',
  'WEBHOOK_DELIVERY_ENABLED',
  'QUICKBOOKS_ENABLED',
  'ACCOUNTING_SYNC_ENABLED',
  'AI_ENABLED',
  'GEOCODING_ENABLED',
];

const FORBIDDEN_EXTERNAL_CREDENTIALS = [
  'RESEND_API_KEY',
  'SENDGRID_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CONNECT_WEBHOOK_SECRET',
  'FACEBOOK_APP_SECRET',
  'OPENAI_API_KEY',
  'GEOCODING_API_KEY',
];

const ENABLED_BOOLEAN_VALUES = new Set(['true', '1', 'yes', 'on', 'enabled']);
const DISABLED_BOOLEAN_VALUES = new Set(['false', '0', 'no', 'off', 'disabled']);
const NON_RESET_RUN_STATUSES = ['started', 'failed', 'succeeded'];
const REVISION_RETAINED_RECORD_ROLES = {
  homes: 'demo_home',
  home_rooms: 'demo_utility_room',
  home_assets: 'demo_water_heater_asset',
};
const WORKFLOW_EVENT_TYPES = {
  estimateApproved: 'estimate_approved',
  jobCreated: 'job_created',
  jobCompleted: 'job_completed',
};
const WORKFLOW_EVENT_SOURCES = {
  estimateResponse: 'servsync_homeowner_respond_to_estimate',
  jobFromEstimate: 'servsync_create_job_from_estimate',
};
const DEMO_AUTH_METADATA = {
  owned: 'servsync_demo_owned',
  scenario: 'servsync_demo_scenario',
  role: 'servsync_demo_role',
};
const RESETTABLE_PRIMARY_KEYS = {
  contractor_posts: 'id',
  home_reminders: 'id',
  invoice_offline_payment_records: 'id',
  workflow_activity_events: 'id',
  home_maintenance_log: 'id',
  home_documents: 'id',
  notifications: 'id',
  invoice_line_items: 'id',
  invoices: 'id',
  contractor_visit_events: 'id',
  job_work_items: 'id',
  estimate_payment_schedule_items: 'id',
  estimate_line_items: 'id',
  inspections: 'id',
  estimates: 'id',
  service_request_messages: 'id',
  service_requests: 'id',
  connection_audit_events: 'id',
  connection_permissions: 'connection_id',
  homeowner_contractor_connections: 'id',
  home_assets: 'id',
  home_rooms: 'id',
  homes: 'id',
};
const FINALIZED_REPORT_BUCKET = 'home-documents';
const FINALIZED_REPORT_RECORD_ROLES = Object.freeze({
  document: 'demo_finalized_report_document',
  history: 'demo_home_history_entry',
  notification: 'demo_finalized_report_notification',
});
const REQUIRED_SCENARIO_TABLES = [
  'homes',
  'home_rooms',
  'home_assets',
  'homeowner_contractor_connections',
  'connection_permissions',
  'service_requests',
  'estimates',
  'estimate_line_items',
  'estimate_payment_schedule_items',
  'inspections',
  'contractor_visit_events',
];

const DEMO_HOMEOWNER = personas.homeowner;
const DEMO_CONTRACTOR = personas.contractor;
const DEMO_PROPERTY = propertyFixture;

const FLAGSHIP_DISCOVER_CONTRACTORS = Object.freeze([
  Object.freeze({
    key: 'carpentry',
    email: 'flagship-carpentry@example.test',
    fullName: 'Avery Collins',
    businessName: 'Gulf Coast Deck & Fence',
    slug: 'demo-gulf-coast-deck-fence',
    category: 'Carpentry',
    categories: ['Carpentry', 'Decks', 'Fences'],
    title: 'Backyard deck replacement completed in Fairhope',
    description: 'A recent deck replacement with a straightforward scope and a clean finished space for the homeowner.',
  }),
  Object.freeze({
    key: 'electrical',
    email: 'flagship-electrical@example.test',
    fullName: 'Jordan Lee',
    businessName: 'Coastal Electric Solutions',
    slug: 'demo-coastal-electric-solutions',
    category: 'Electrical',
    categories: ['Electrical', 'Outlets', 'Lighting'],
    title: 'When an outlet keeps tripping',
    description: 'An outlet that feels warm or repeatedly trips a breaker is worth having checked.',
  }),
  Object.freeze({
    key: 'washing',
    email: 'flagship-washing@example.test',
    fullName: 'Morgan Hayes',
    businessName: 'Shoreline Exterior Cleaning',
    slug: 'demo-shoreline-exterior-cleaning',
    category: 'Pressure Washing',
    categories: ['Pressure Washing', 'Exterior Cleaning'],
    title: 'Driveway and exterior cleanup completed locally',
    description: 'A recent driveway and exterior cleanup completed for a fictional local homeowner.',
  }),
  Object.freeze({
    key: 'landscaping',
    email: 'flagship-landscaping@example.test',
    fullName: 'Taylor Brooks',
    businessName: 'Fairhope Lawn & Landscape',
    slug: 'demo-fairhope-lawn-landscape',
    category: 'Landscaping',
    categories: ['Landscaping', 'Lawn Care', 'Seasonal Cleanup'],
    title: 'A practical late-summer yard reset',
    description: 'Late-summer cleanup is a good time to clear overgrowth and prepare beds for fall.',
  }),
]);

const FLAGSHIP_PRIMARY_POST = Object.freeze({
  category: 'Water heaters',
  title: 'A quick water-heater check between service visits',
  description: 'Check around the base of your water heater periodically for signs of moisture or corrosion.',
});

function requireEnv(env, key) {
  const value = env[key];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return String(value).trim();
}

export function parseSupabaseProjectRefFromUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }

  try {
    const host = new URL(rawUrl).hostname;
    const match = host.match(/^([a-z0-9]{20})\.supabase\.co$/i);
    return match ? match[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

export function assertSafeDemoTarget(env = process.env) {
  if (env.DEMO_MODE_ENABLED !== REQUIRED_ENABLE_VALUE) {
    throw new Error('Demo runner refused: DEMO_MODE_ENABLED must be exactly true.');
  }

  const supabaseUrl = requireEnv(env, 'DEMO_SUPABASE_URL');
  const expectedRef = requireEnv(env, 'DEMO_SUPABASE_PROJECT_REF').toLowerCase();
  const parsedRef = parseSupabaseProjectRefFromUrl(supabaseUrl);

  if (!parsedRef) {
    throw new Error('Demo runner refused: DEMO_SUPABASE_URL does not contain a parseable Supabase project ref.');
  }

  if (parsedRef !== expectedRef) {
    throw new Error('Demo runner refused: DEMO_SUPABASE_URL ref does not match DEMO_SUPABASE_PROJECT_REF.');
  }

  if (expectedRef === KNOWN_PRODUCTION_REF || parsedRef === KNOWN_PRODUCTION_REF) {
    throw new Error('Demo runner refused: target is the known production Supabase project.');
  }

  if (expectedRef === KNOWN_SHARED_SANDBOX_REF || parsedRef === KNOWN_SHARED_SANDBOX_REF) {
    throw new Error('Demo runner refused: target is the shared ServSync sandbox project, not the dedicated demo project.');
  }

  for (const flag of FORBIDDEN_EXTERNAL_FLAGS) {
    const normalized = String(env[flag] || '').trim().toLowerCase();
    if (!normalized) {
      continue;
    }

    if (ENABLED_BOOLEAN_VALUES.has(normalized)) {
      throw new Error(`Demo runner refused: ${flag} must not be enabled for Demo Mode seeding.`);
    }

    if (!DISABLED_BOOLEAN_VALUES.has(normalized)) {
      throw new Error(`Demo runner refused: ${flag} has an unrecognized boolean value; unset it or use false.`);
    }
  }

  for (const credential of FORBIDDEN_EXTERNAL_CREDENTIALS) {
    if (String(env[credential] || '').trim()) {
      throw new Error(`Demo runner refused: ${credential} must be absent from the Demo runner process.`);
    }
  }

  return {
    supabaseUrl,
    expectedRef,
    parsedRef,
    host: new URL(supabaseUrl).hostname,
  };
}

export function requireResetAcknowledgement(operation, scenarioKey, env = process.env) {
  if (operation !== 'reset') {
    return;
  }

  const expected = `${RESET_ACKNOWLEDGEMENT_PREFIX}${scenarioKey}`;
  if (env.DEMO_RESET_ACKNOWLEDGE !== expected) {
    throw new Error(`Demo reset refused: DEMO_RESET_ACKNOWLEDGE must be exactly ${expected}.`);
  }
}

export function parseCheckpointSelection(args = [], defaultKey = DEFAULT_CHECKPOINT_KEY) {
  let checkpointKey = defaultKey;
  let supplied = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--checkpoint') {
      if (supplied) {
        throw new Error('Checkpoint may be specified only once.');
      }
      checkpointKey = args[index + 1] || '';
      supplied = true;
      index += 1;
      continue;
    }
    if (arg?.startsWith('--checkpoint=')) {
      if (supplied) {
        throw new Error('Checkpoint may be specified only once.');
      }
      checkpointKey = arg.slice('--checkpoint='.length);
      supplied = true;
      continue;
    }
    throw new Error(`Unsupported demo argument: ${arg}`);
  }

  if (!checkpointKey || typeof checkpointKey !== 'string') {
    throw new Error('Unsupported demo checkpoint: checkpoint key is required.');
  }

  if (DEFERRED_CHECKPOINT_KEYS.includes(checkpointKey)) {
    throw new Error(`Deferred demo checkpoint is not implemented in Slice 2A: ${checkpointKey}`);
  }

  if (!SUPPORTED_CHECKPOINT_KEYS.includes(checkpointKey)) {
    throw new Error(`Unsupported demo checkpoint: ${checkpointKey}`);
  }

  return { checkpointKey, supplied };
}

export function parseCheckpointKey(args = [], defaultKey = DEFAULT_CHECKPOINT_KEY) {
  return parseCheckpointSelection(args, defaultKey).checkpointKey;
}

export function getCheckpointDefinition(checkpointKey) {
  const checkpoint = checkpointByKey[checkpointKey];
  if (!checkpoint) {
    throw new Error(`Unsupported demo checkpoint: ${checkpointKey}`);
  }
  return checkpoint;
}

export function listCheckpoints() {
  return waterHeaterCoreLoopScenario.checkpointDefinitions.map((checkpoint) => ({
    key: checkpoint.key,
    displayName: checkpoint.displayName,
    primaryRole: checkpoint.primaryRole,
    narrativePurpose: checkpoint.narrativePurpose,
    supported: true,
  }));
}

function checkpointRequires(checkpointKey, stepKey) {
  return getCheckpointDefinition(checkpointKey).requiredSteps.includes(stepKey);
}

export function buildDatePlan(anchorInput = new Date()) {
  const anchor = new Date(anchorInput);
  if (Number.isNaN(anchor.getTime())) {
    throw new Error('Invalid demo anchor timestamp.');
  }

  const hours = (value) => new Date(anchor.getTime() + value * 60 * 60 * 1000).toISOString();
  const days = (value) => new Date(anchor.getTime() + value * 24 * 60 * 60 * 1000).toISOString();

  return {
    anchor: anchor.toISOString(),
    profileCreatedAt: days(dateOffsets.profileCreatedAtDays),
    propertyCreatedAt: days(dateOffsets.propertyCreatedAtDays),
    connectionCreatedAt: days(dateOffsets.connectionCreatedAtDays),
    requestCreatedAt: days(dateOffsets.requestCreatedAtDays),
    contractorReviewReadyAt: hours(dateOffsets.contractorReviewReadyHours),
    estimateCreatedAt: hours(dateOffsets.estimateCreatedAtHours),
    estimateSentAt: hours(dateOffsets.estimateSentAtHours),
    estimateAcceptedAt: hours(dateOffsets.estimateAcceptedAtHours),
    jobCreatedAt: hours(dateOffsets.jobCreatedAtHours),
    jobScheduledAt: hours(dateOffsets.jobScheduledAtHours),
    jobInProgressAt: hours(dateOffsets.jobInProgressAtHours),
    jobReviewReadyAt: hours(dateOffsets.jobReviewReadyAtHours),
    jobCompletedAt: hours(dateOffsets.jobCompletedAtHours),
    invoiceCreatedAt: hours(dateOffsets.invoiceCreatedAtHours),
    invoiceSentAt: hours(dateOffsets.invoiceSentAtHours),
    invoiceViewedAt: hours(dateOffsets.invoiceViewedAtHours),
    invoicePartialPaidAt: hours(dateOffsets.invoicePartialPaidAtHours),
    invoicePaidAt: hours(dateOffsets.invoicePaidAtHours),
    invoiceHomeHistoryAt: hours(dateOffsets.invoiceHomeHistoryAtHours),
    visitWindowStart: days(dateOffsets.visitWindowStartDays),
    waterHeaterInstallDate: days(dateOffsets.waterHeaterInstallDateDays).slice(0, 10),
    waterHeaterWarrantyDate: days(dateOffsets.waterHeaterWarrantyDateDays).slice(0, 10),
  };
}

export function safeLogValue(value) {
  if (!value) {
    return '';
  }

  const stringValue = String(value);
  if (stringValue.length <= 8) {
    return '[redacted]';
  }
  return `${stringValue.slice(0, 4)}...[redacted]...${stringValue.slice(-4)}`;
}

function createSupabaseClients(env, target) {
  const serviceRoleKey = requireEnv(env, 'DEMO_SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = requireEnv(env, 'DEMO_SUPABASE_ANON_KEY');

  return {
    service: createClient(target.supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    anonKey,
    makeUserClient: () =>
      createClient(target.supabaseUrl, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
  };
}

async function ensureOk(result, message) {
  if (result.error) {
    throw new Error(`${message}: ${result.error.message}`);
  }
  return result.data;
}

async function maybeSingle(result, message) {
  if (result.error && result.error.code !== 'PGRST116') {
    throw new Error(`${message}: ${result.error.message}`);
  }
  return result.data || null;
}

function demoUserMetadata(scenarioKey, role) {
  return {
    [DEMO_AUTH_METADATA.owned]: true,
    [DEMO_AUTH_METADATA.scenario]: scenarioKey,
    [DEMO_AUTH_METADATA.role]: role,
  };
}

function assertDemoAuthMetadata(user, expectedEmail, scenarioKey, role) {
  const metadata = user?.user_metadata || {};
  if (user?.email?.toLowerCase() !== expectedEmail.toLowerCase()) {
    throw new Error(`Existing auth user email did not match configured demo email: ${expectedEmail}`);
  }
  if (metadata[DEMO_AUTH_METADATA.owned] !== true) {
    throw new Error(`Existing auth user ${expectedEmail} is not marked as ServSync demo-owned.`);
  }
  if (metadata[DEMO_AUTH_METADATA.scenario] !== scenarioKey) {
    throw new Error(`Existing auth user ${expectedEmail} belongs to a different demo scenario.`);
  }
  if (metadata[DEMO_AUTH_METADATA.role] !== role) {
    throw new Error(`Existing auth user ${expectedEmail} has an unexpected demo role.`);
  }
}

async function findAuthUsersByEmail(service, email) {
  const matches = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 100 });
    if (error) {
      throw new Error(`Unable to inspect demo auth users: ${error.message}`);
    }

    matches.push(...data.users.filter((item) => item.email?.toLowerCase() === email.toLowerCase()));

    if (data.users.length < 100) {
      return matches;
    }
  }

  throw new Error('Unable to reconcile demo auth users within the expected page limit.');
}

async function ensureAuthUser(service, email, password, scenarioKey, role) {
  const userMetadata = demoUserMetadata(scenarioKey, role);
  const matches = await findAuthUsersByEmail(service, email);
  if (matches.length > 1) {
    throw new Error(`Demo runner refused: multiple auth users matched ${email}.`);
  }

  if (matches.length === 1) {
    const existing = matches[0];
    assertDemoAuthMetadata(existing, email, scenarioKey, role);
    const { data, error } = await service.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: userMetadata,
    });
    if (error) {
      throw new Error(`Unable to update demo auth user ${email}: ${error.message}`);
    }
    return data.user;
  }

  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
  });
  if (error) {
    throw new Error(`Unable to create demo auth user ${email}: ${error.message}`);
  }
  return data.user;
}

function assertDistinctDemoIdentities(homeownerEmail, contractorEmail, homeownerUser, contractorUser) {
  if (homeownerEmail.toLowerCase() === contractorEmail.toLowerCase()) {
    throw new Error('Demo runner refused: homeowner and contractor demo emails must be different.');
  }
  if (homeownerUser.id === contractorUser.id) {
    throw new Error('Demo runner refused: homeowner and contractor demo auth users resolved to the same ID.');
  }
}

async function signInDemoUser(makeUserClient, email, password) {
  const client = makeUserClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`Unable to sign in demo user ${email}: ${error.message}`);
  }
  return client;
}

async function startRun(service, scenarioKey, operation, target, dates, checkpointKey = DEFAULT_CHECKPOINT_KEY, metadata = {}) {
  const scenario = SCENARIOS[scenarioKey];
  const checkpoint = getCheckpointDefinition(checkpointKey);
  const runId = await ensureOk(
    await service.rpc('servsync_demo_start_run', {
      p_scenario_key: scenarioKey,
      p_display_name: scenario.displayName,
      p_description: scenario.description,
      p_operation: operation,
      p_checkpoint: checkpointKey,
      p_anchor_timestamp: dates.anchor,
      p_target_project_ref: target.expectedRef,
      p_metadata: {
        script: 'scripts/demo/seed-demo-scenario.mjs',
        source_version: 'demo-mode-slice-2a',
        selected_checkpoint: checkpointKey,
        expected_checkpoint_graph: checkpoint.expected,
        required_steps: checkpoint.requiredSteps,
        external_effects_disabled: true,
        ...metadata,
      },
    }),
    'Unable to start demo scenario run. Apply servsync-demo-mode-foundation.sql to the dedicated demo project first'
  );
  return runId;
}

async function finishRun(service, runId, status, metadata = {}) {
  await ensureOk(
    await service.rpc('servsync_demo_finish_run', {
      p_run_id: runId,
      p_status: status,
      p_metadata: metadata,
    }),
    'Unable to finish demo scenario run'
  );
}

async function registerRecord(service, runId, tableName, recordId, recordRole, checkpoint = DEFAULT_CHECKPOINT_KEY, metadata = {}) {
  if (!recordId) {
    return;
  }

  await ensureOk(
    await service.rpc('servsync_demo_register_record', {
      p_run_id: runId,
      p_schema_name: 'public',
      p_table_name: tableName,
      p_record_id: recordId,
      p_record_role: recordRole,
      p_checkpoint: checkpoint,
      p_metadata: metadata,
    }),
    `Unable to register demo record ${tableName}.${recordId}`
  );
}

async function getScenarioRuns(service, scenarioKey, statuses = NON_RESET_RUN_STATUSES) {
  return ensureOk(
    await service
      .from('demo_scenario_runs')
      .select('id, scenario_key, operation, status, checkpoint, started_at, completed_at, anchor_timestamp, metadata')
      .eq('scenario_key', scenarioKey)
      .eq('operation', 'seed')
      .in('status', statuses)
      .order('started_at', { ascending: false }),
    'Unable to inspect demo scenario runs'
  );
}

async function getRegisteredRecordsForRun(service, runId) {
  return ensureOk(
    await service
      .from('demo_scenario_records')
      .select('id, run_id, schema_name, table_name, primary_key_column, record_id, record_role, checkpoint, reset_order, metadata')
      .eq('run_id', runId)
      .order('reset_order', { ascending: false }),
    'Unable to inspect registered demo records'
  );
}

export function validatePropertyAssetRevisionLineage(asset, revisions) {
  const issues = [];
  const ordered = [...(revisions || [])].sort((left, right) => Number(left.revision_number) - Number(right.revision_number));

  if (!asset?.id) {
    return ['Canonical demo asset is missing.'];
  }
  if (ordered.length === 0) {
    return [`Canonical demo asset ${asset.id} has no immutable revision history.`];
  }
  if (ordered.filter((revision) => revision.change_kind === 'baseline').length !== 1) {
    issues.push(`Canonical demo asset ${asset.id} must have exactly one baseline revision.`);
  }
  ordered.forEach((revision, index) => {
    const expectedRevision = index + 1;
    if (revision.asset_id !== asset.id) {
      issues.push(`Revision ${revision.id || expectedRevision} does not belong to canonical demo asset ${asset.id}.`);
    }
    if (Number(revision.revision_number) !== expectedRevision) {
      issues.push(`Canonical demo asset revision lineage is not contiguous at revision ${expectedRevision}.`);
    }
  });

  const current = ordered.at(-1);
  if (Number(asset.revision_number) !== Number(current?.revision_number)) {
    issues.push(`Canonical demo asset current revision does not match its latest immutable revision.`);
  }
  for (const field of [
    'home_id',
    'home_room_id',
    'asset_kind',
    'asset_category',
    'asset_type',
    'name',
    'manufacturer',
    'model',
    'install_date',
    'warranty_expires_on',
    'notes',
    'lifecycle_status',
  ]) {
    if ((asset[field] ?? null) !== (current?.[field] ?? null)) {
      issues.push(`Canonical demo asset field ${field} does not match its current immutable revision.`);
    }
  }
  return issues;
}

function assertCanonicalPropertyGraph({ home, room, asset, revisions, homeownerId }) {
  const issues = [];
  if (!home || home.homeowner_user_id !== homeownerId) issues.push('Canonical demo home ownership does not match the approved homeowner.');
  if (home && (home.nickname !== DEMO_PROPERTY.nickname || home.address_line1 !== DEMO_PROPERTY.address_line1 || home.zip_code !== DEMO_PROPERTY.zip_code)) {
    issues.push('Canonical demo home identity markers do not match the approved scenario.');
  }
  if (!room || room.home_id !== home?.id || room.name !== 'Garage utility area' || room.room_type !== 'garage') {
    issues.push('Canonical demo room identity or property linkage is invalid.');
  }
  if (
    !asset ||
    asset.home_id !== home?.id ||
    asset.home_room_id !== room?.id ||
    asset.created_by !== homeownerId ||
    asset.asset_category !== 'plumbing' ||
    asset.asset_kind !== 'plumbing' ||
    asset.asset_type !== 'water_heater' ||
    asset.name !== 'Existing 40-gallon water heater' ||
    asset.manufacturer !== 'DemoHome' ||
    asset.model !== 'WH-40-FICTIONAL' ||
    asset.lifecycle_status !== 'active'
  ) {
    issues.push('Canonical demo asset identity, ownership, lifecycle, or property linkage is invalid.');
  }
  issues.push(...validatePropertyAssetRevisionLineage(asset, revisions));
  if (issues.length > 0) {
    throw new Error(`Revision-aware Demo reset refused: ${issues.join(' ')}`);
  }
}

async function loadCanonicalPropertyGraph(service, homeownerId) {
  const homes = await ensureOk(
    await service
      .from('homes')
      .select('id, homeowner_user_id, nickname, address_line1, zip_code')
      .eq('homeowner_user_id', homeownerId)
      .eq('nickname', DEMO_PROPERTY.nickname)
      .eq('address_line1', DEMO_PROPERTY.address_line1)
      .eq('zip_code', DEMO_PROPERTY.zip_code),
    'Unable to inspect the canonical demo home for revision-aware reset'
  );
  if (homes.length === 0) return null;
  if (homes.length !== 1) throw new Error(`Revision-aware Demo reset refused: expected one canonical demo home, found ${homes.length}.`);

  const home = homes[0];
  const rooms = await ensureOk(
    await service.from('home_rooms').select('id, home_id, name, room_type').eq('home_id', home.id),
    'Unable to inspect the canonical demo room for revision-aware reset'
  );
  const assets = await ensureOk(
    await service
      .from('home_assets')
      .select('id, home_id, home_room_id, asset_kind, asset_category, asset_type, name, manufacturer, model, install_date, warranty_expires_on, notes, lifecycle_status, revision_number, created_by')
      .eq('home_id', home.id),
    'Unable to inspect the canonical demo asset for revision-aware reset'
  );
  if (rooms.length !== 1 || assets.length !== 1) {
    throw new Error(`Revision-aware Demo reset refused: canonical property graph is partial or ambiguous (rooms=${rooms.length}, assets=${assets.length}).`);
  }
  const room = rooms[0];
  const asset = assets[0];
  const revisions = await ensureOk(
    await service
      .from('home_asset_revisions')
      .select('id, asset_id, revision_number, change_kind, home_id, home_room_id, asset_kind, asset_category, asset_type, name, manufacturer, model, install_date, warranty_expires_on, notes, lifecycle_status')
      .eq('asset_id', asset.id)
      .order('revision_number', { ascending: true }),
    'Unable to inspect canonical demo asset revisions'
  );
  assertCanonicalPropertyGraph({ home, room, asset, revisions, homeownerId });
  return { home, room, asset, revisions };
}

async function retainRevisionBackedPropertyGraph(service, run) {
  let graphRecords = run.records.filter((record) => Object.hasOwn(REVISION_RETAINED_RECORD_ROLES, record.table_name));
  if (graphRecords.length === 0) return null;

  const expected = Object.entries(REVISION_RETAINED_RECORD_ROLES);
  const homeownerId = run.metadata?.homeowner_user_id;
  if (!homeownerId) throw new Error('Revision-aware Demo reset refused: run metadata is missing the approved homeowner identity.');
  const graph = await loadCanonicalPropertyGraph(service, homeownerId);
  if (!graph) throw new Error('Revision-aware Demo reset refused: registered canonical property graph is missing.');

  const expectedIds = { homes: graph.home.id, home_rooms: graph.room.id, home_assets: graph.asset.id };
  for (const [tableName, recordRole] of expected) {
    const matches = graphRecords.filter((record) => record.table_name === tableName);
    if (matches.length > 1 || (matches[0] && matches[0].record_role !== recordRole)) {
      throw new Error(`Revision-aware Demo reset refused: registered ${tableName}/${recordRole} ownership is ambiguous or invalid.`);
    }
    if (matches.length === 0) {
      await registerRecord(service, run.id, tableName, expectedIds[tableName], recordRole, 'property_ready', {
        revision_aware_recovery: true,
      });
    }
  }
  graphRecords = (await getRegisteredRecordsForRun(service, run.id)).filter((record) =>
    Object.hasOwn(REVISION_RETAINED_RECORD_ROLES, record.table_name)
  );
  if (graphRecords.length !== expected.length) {
    throw new Error('Revision-aware Demo reset refused: canonical property graph recovery was incomplete.');
  }
  for (const record of graphRecords) {
    if (record.record_id !== expectedIds[record.table_name]) {
      throw new Error(`Revision-aware Demo reset refused: registered ${record.table_name} does not match the canonical property graph.`);
    }
  }

  const registryIds = graphRecords.map((record) => record.id);
  const removedRegistryRows = await ensureOk(
    await service.from('demo_scenario_records').delete().eq('run_id', run.id).in('id', registryIds).select('id'),
    'Unable to detach the retained canonical property graph from the prior demo run'
  );
  if (removedRegistryRows.length !== registryIds.length) {
    throw new Error('Revision-aware Demo reset refused: canonical property graph registry detachment was incomplete.');
  }
  return { homeId: graph.home.id, roomId: graph.room.id, assetId: graph.asset.id, revisionCount: graph.revisions.length };
}

async function inspectNonResetRuns(service, scenarioKey) {
  const runs = await getScenarioRuns(service, scenarioKey);
  const inspected = [];
  for (const run of runs) {
    const records = await getRegisteredRecordsForRun(service, run.id);
    inspected.push({ ...run, records, recordCount: records.length });
  }
  return inspected;
}

export function validateFinalizedReportStoragePath(storagePath, homeownerId, jobId) {
  const path = String(storagePath || '');
  const expectedPrefix = `${homeownerId}/field-work/${jobId}/`;
  const fileName = path.startsWith(expectedPrefix) ? path.slice(expectedPrefix.length) : '';
  if (
    !homeownerId ||
    !jobId ||
    path.includes('..') ||
    !path.startsWith(expectedPrefix) ||
    fileName.includes('/') ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i.test(fileName)
  ) {
    throw new Error('Finalized-report Storage cleanup refused: registered path is outside the canonical homeowner field-work contract.');
  }
  return { bucket: FINALIZED_REPORT_BUCKET, path, folder: expectedPrefix.slice(0, -1), fileName };
}

function exactlyOneRegisteredReportRecord(run, tableName, role) {
  const matches = run.records.filter((record) => record.table_name === tableName && record.record_role === role);
  if (matches.length !== 1) {
    throw new Error(`Finalized-report reset refused: expected exactly one registered ${tableName}/${role}, found ${matches.length}.`);
  }
  return matches[0];
}

export function resolveFinalizedReportRegistryRecords(run) {
  return {
    documentRecord: exactlyOneRegisteredReportRecord(
      run,
      'home_documents',
      FINALIZED_REPORT_RECORD_ROLES.document
    ),
    historyRecord: exactlyOneRegisteredReportRecord(
      run,
      'home_maintenance_log',
      FINALIZED_REPORT_RECORD_ROLES.history
    ),
    notificationRecord: exactlyOneRegisteredReportRecord(
      run,
      'notifications',
      FINALIZED_REPORT_RECORD_ROLES.notification
    ),
  };
}

async function exactStorageObject(service, storage) {
  const objects = await ensureOk(
    await service.storage.from(storage.bucket).list(storage.folder, { limit: 100, search: storage.fileName }),
    'Unable to inspect the registered finalized-report Storage object'
  );
  return (objects || []).filter((object) => object.name === storage.fileName);
}

async function persistStorageCleanupState(service, run, state, storage, extra = {}) {
  const metadata = {
    ...(run.metadata || {}),
    report_storage_cleanup: {
      state,
      bucket: storage.bucket,
      path: storage.path,
      ...extra,
    },
  };
  await ensureOk(
    await service.from('demo_scenario_runs').update({ metadata }).eq('id', run.id),
    'Unable to persist finalized-report Storage cleanup state'
  );
  run.metadata = metadata;
}

async function cleanupRegisteredFinalizedReportStorage(service, run) {
  const checkpoint = run.checkpoint || run.metadata?.selected_checkpoint;
  const finalizedReportRoles = new Set(Object.values(FINALIZED_REPORT_RECORD_ROLES));
  const reportRecords = run.records.filter((record) => finalizedReportRoles.has(record.record_role));
  if (reportRecords.length === 0) {
    if (run.metadata?.report_storage_path || run.metadata?.report_storage_cleanup) {
      throw new Error('Finalized-report reset refused: run metadata claims Storage ownership without registered report artifacts.');
    }
    return null;
  }
  if (checkpoint !== 'home_history_updated') {
    throw new Error('Finalized-report reset refused: registered report artifacts belong to a non-report checkpoint.');
  }

  const { documentRecord, historyRecord, notificationRecord } = resolveFinalizedReportRegistryRecords(run);
  const homeownerId = run.metadata?.homeowner_user_id;
  const jobId = run.metadata?.job_id;
  const requestId = run.metadata?.service_request_id;
  const registeredPath = documentRecord.metadata?.storage_path;
  const registeredBucket = documentRecord.metadata?.storage_bucket;
  if (registeredBucket !== FINALIZED_REPORT_BUCKET) {
    throw new Error('Finalized-report Storage cleanup refused: registered bucket is missing or foreign.');
  }
  const storage = validateFinalizedReportStoragePath(registeredPath, homeownerId, jobId);

  const [documents, historyRows, notifications] = await Promise.all([
    ensureOk(
      await service
        .from('home_documents')
        .select('id, homeowner_user_id, storage_path, content_type, document_type, file_size_bytes')
        .eq('homeowner_user_id', homeownerId)
        .eq('storage_path', storage.path),
      'Unable to inspect the registered finalized-report document'
    ),
    ensureOk(
      await service
        .from('home_maintenance_log')
        .select('id, homeowner_user_id, inspection_id, service_request_id, report_document_id')
        .eq('inspection_id', jobId),
      'Unable to inspect the registered Home History row'
    ),
    ensureOk(
      await service
        .from('notifications')
        .select('id, user_id, type, request_id')
        .eq('user_id', homeownerId)
        .eq('type', 'inspection_report_filed')
        .eq('request_id', requestId),
      'Unable to inspect the registered finalized-report notification'
    ),
  ]);
  if (documents.length !== 1 || documents[0].id !== documentRecord.record_id) {
    throw new Error(`Finalized-report reset refused: expected one exact report document, found ${documents.length}.`);
  }
  if (
    documents[0].content_type !== 'application/pdf' ||
    documents[0].document_type !== 'inspection' ||
    historyRows.length !== 1 ||
    historyRows[0].id !== historyRecord.record_id ||
    historyRows[0].report_document_id !== documentRecord.record_id ||
    historyRows[0].homeowner_user_id !== homeownerId ||
    historyRows[0].service_request_id !== requestId
  ) {
    throw new Error('Finalized-report reset refused: document and Home History ownership lineage is missing or ambiguous.');
  }
  if (notifications.length !== 1 || notifications[0].id !== notificationRecord.record_id) {
    throw new Error(`Finalized-report reset refused: expected one exact notification, found ${notifications.length}.`);
  }

  const cleanup = run.metadata?.report_storage_cleanup;
  if (cleanup && (cleanup.bucket !== storage.bucket || cleanup.path !== storage.path)) {
    throw new Error('Finalized-report Storage cleanup refused: persisted cleanup identity does not match the registered object.');
  }
  let matches = await exactStorageObject(service, storage);
  if (cleanup?.state === 'deleted') {
    if (matches.length !== 0) {
      throw new Error('Finalized-report Storage cleanup refused: an object reappeared after verified deletion.');
    }
    return { ...storage, status: 'already-deleted' };
  }
  if (matches.length === 0 && cleanup?.state !== 'deleting') {
    throw new Error('Finalized-report Storage cleanup refused: the exact registered object is unexpectedly missing.');
  }
  if (matches.length > 1) {
    throw new Error('Finalized-report Storage cleanup refused: Storage ownership is ambiguous.');
  }
  if (matches.length === 1) {
    const downloaded = await ensureOk(
      await service.storage.from(storage.bucket).download(storage.path),
      'Unable to read the exact registered finalized-report object before cleanup'
    );
    const sha256 = createHash('sha256').update(Buffer.from(await downloaded.arrayBuffer())).digest('hex');
    if (documentRecord.metadata?.storage_sha256 !== sha256) {
      throw new Error('Finalized-report Storage cleanup refused: object SHA-256 does not match registered ownership evidence.');
    }
    await persistStorageCleanupState(service, run, 'deleting', storage, { storage_sha256: sha256 });
    await ensureOk(
      await service.storage.from(storage.bucket).remove([storage.path]),
      'Unable to remove the exact registered finalized-report Storage object'
    );
  }
  matches = await exactStorageObject(service, storage);
  if (matches.length !== 0) {
    throw new Error('Finalized-report Storage cleanup refused: the exact registered object remains after deletion.');
  }
  await persistStorageCleanupState(service, run, 'deleted', storage, {
    storage_sha256: documentRecord.metadata?.storage_sha256,
    verified_at: new Date().toISOString(),
  });
  return { ...storage, status: 'deleted' };
}

async function releaseRegisteredInvoiceWorkItemsForReset(service, run) {
  const invoiceIds = new Set(
    run.records.filter((record) => record.table_name === 'invoices').map((record) => record.record_id)
  );
  const workItemIds = run.records
    .filter((record) => record.table_name === 'job_work_items')
    .map((record) => record.record_id);
  if (invoiceIds.size === 0 || workItemIds.length === 0) return [];

  const workItems = await ensureOk(
    await service
      .from('job_work_items')
      .select('id,billing_status,reserved_invoice_id,invoiced_invoice_id')
      .in('id', workItemIds),
    'Unable to inspect registered Invoice-linked work items before Demo reset'
  );
  if (workItems.length !== workItemIds.length) {
    throw new Error('Invoice-aware Demo reset refused: one or more registered work items are missing.');
  }
  for (const item of workItems) {
    for (const linkedInvoiceId of [item.reserved_invoice_id, item.invoiced_invoice_id].filter(Boolean)) {
      if (!invoiceIds.has(linkedInvoiceId)) {
        throw new Error('Invoice-aware Demo reset refused: a registered work item points to an unregistered Invoice.');
      }
    }
  }

  const linkedIds = workItems
    .filter((item) => item.reserved_invoice_id || item.invoiced_invoice_id)
    .map((item) => item.id);
  if (linkedIds.length === 0) return [];
  const released = await ensureOk(
    await service
      .from('job_work_items')
      .update({ billing_status: 'unbilled', reserved_invoice_id: null, invoiced_invoice_id: null })
      .in('id', linkedIds)
      .select('id,billing_status,reserved_invoice_id,invoiced_invoice_id'),
    'Unable to release registered Invoice-linked work items before Demo reset'
  );
  if (
    released.length !== linkedIds.length ||
    released.some((item) => item.billing_status !== 'unbilled' || item.reserved_invoice_id || item.invoiced_invoice_id)
  ) {
    throw new Error('Invoice-aware Demo reset refused: registered work-item billing lineage was not released exactly.');
  }
  return released.map((item) => item.id);
}

async function resetRun(service, run) {
  const finalizedReportStorage = await cleanupRegisteredFinalizedReportStorage(service, run);
  const retainedPropertyGraph = await retainRevisionBackedPropertyGraph(service, run);
  const releasedInvoiceWorkItems = await releaseRegisteredInvoiceWorkItemsForReset(service, run);
  const data = await ensureOk(
    await service.rpc('servsync_demo_reset_registered_run', { p_run_id: run.id }),
    'Unable to reset registered demo records'
  );
  return { removed: data || [], retainedPropertyGraph, finalizedReportStorage, releasedInvoiceWorkItems };
}

async function resetNonResetRuns(service, scenarioKey, reason) {
  const runs = await inspectNonResetRuns(service, scenarioKey);
  const considered = [];
  for (const run of runs) {
    try {
      const reconciledRecordingConnections = await reconcileDiscoveryRecordingConnection(service, run);
      if (reconciledRecordingConnections.length > 0) {
        run.records = await getRegisteredRecordsForRun(service, run.id);
        run.recordCount = run.records.length;
      }
      const resetResult = await resetRun(service, run);
      considered.push({
        runId: run.id,
        previousStatus: run.status,
        registeredRecords: run.recordCount,
        reconciledRecordingConnections,
        removed: resetResult.removed,
        retainedPropertyGraph: resetResult.retainedPropertyGraph,
        finalizedReportStorage: resetResult.finalizedReportStorage,
        releasedInvoiceWorkItems: resetResult.releasedInvoiceWorkItems,
        action: 'reset',
        reason,
      });
    } catch (error) {
      considered.push({
        runId: run.id,
        previousStatus: run.status,
        registeredRecords: run.recordCount,
        action: 'failed',
        reason,
        error: error.message,
      });
      throw new Error(`Unable to reconcile prior demo run ${run.id}: ${error.message}`);
    }
  }
  return { considered, removed: considered.flatMap((item) => item.removed || []) };
}

async function deleteExactCreatedRecord(service, tableName, recordId) {
  const primaryKey = RESETTABLE_PRIMARY_KEYS[tableName];
  if (!primaryKey || !recordId) {
    throw new Error(`No exact compensation path exists for ${tableName}.${recordId || 'unknown'}.`);
  }
  await ensureOk(
    await service.from(tableName).delete().eq(primaryKey, recordId),
    `Unable to compensate just-created demo record ${tableName}.${recordId}`
  );
}

async function registerCreatedRecord(service, runId, tableName, recordId, recordRole, checkpoint = DEFAULT_CHECKPOINT_KEY, metadata = {}) {
  try {
    await registerRecord(service, runId, tableName, recordId, recordRole, checkpoint, metadata);
  } catch (error) {
    try {
      await deleteExactCreatedRecord(service, tableName, recordId);
    } catch (compensationError) {
      throw new Error(
        `${error.message}. Exact compensation failed for orphan candidate ${tableName}.${recordId}: ${compensationError.message}`
      );
    }
    throw new Error(`${error.message}. Exact compensation removed just-created record ${tableName}.${recordId}.`);
  }
}

async function reconcileDiscoveryRecordingConnection(service, run) {
  if ((run.checkpoint || run.metadata?.selected_checkpoint) !== 'contractor_discovery_ready') {
    return [];
  }

  const homeownerId = run.metadata?.homeowner_user_id;
  const contractorId = run.metadata?.contractor_id;
  if (!homeownerId || !contractorId) {
    return [];
  }

  const pendingConnections = await ensureOk(
    await service
      .from('homeowner_contractor_connections')
      .select('id, status, source')
      .eq('homeowner_user_id', homeownerId)
      .eq('contractor_id', contractorId)
      .eq('status', 'pending')
      .eq('source', 'homeowner_request'),
    'Unable to inspect discovery recording connection request residue'
  );

  if (pendingConnections.length > 1) {
    throw new Error(
      `Discovery checkpoint ${run.id} has multiple pending recording-created connection rows and cannot be reset safely.`
    );
  }
  const connection = pendingConnections[0] || null;
  if (!connection) {
    return [];
  }

  await registerRecord(service, run.id, 'homeowner_contractor_connections', connection.id, 'demo_recording_connection_request', 'contractor_discovery_ready', {
    source: 'homeowner_request',
    reconciled_from: 'presentation_recording',
  });

  const permissions = await maybeSingle(
    await service
      .from('connection_permissions')
      .select('connection_id')
      .eq('connection_id', connection.id)
      .maybeSingle(),
    'Unable to inspect discovery recording connection permissions'
  );
  if (permissions?.connection_id) {
    await registerRecord(service, run.id, 'connection_permissions', permissions.connection_id, 'demo_recording_connection_permissions', 'contractor_discovery_ready', {
      source: 'homeowner_request',
      reconciled_from: 'presentation_recording',
    });
  }

  const auditEvents = await ensureOk(
    await service
      .from('connection_audit_events')
      .select('id, event_type')
      .eq('connection_id', connection.id),
    'Unable to inspect discovery recording connection audit events'
  );
  for (const event of auditEvents) {
    await registerRecord(service, run.id, 'connection_audit_events', event.id, 'demo_recording_connection_audit_event', 'contractor_discovery_ready', {
      event_type: event.event_type,
      reconciled_from: 'presentation_recording',
    });
  }

  return [connection.id];
}

async function findRegisteredRecord(service, tableName, recordId) {
  return maybeSingle(
    await service
      .from('demo_scenario_records')
      .select('id, run_id')
      .eq('schema_name', 'public')
      .eq('table_name', tableName)
      .eq('record_id', recordId)
      .limit(1)
      .maybeSingle(),
    `Unable to inspect demo registry for ${tableName}.${recordId}`
  );
}

async function addUnregisteredFindings(service, findings, tableName, records, allowedRecordIds = new Set()) {
  for (const record of records || []) {
    const registered = await findRegisteredRecord(service, tableName, record.id);
    if (!registered && !allowedRecordIds.has(record.id)) {
      findings.push({ tableName, recordId: record.id });
    }
  }
}

async function assertNoLikelyUnregisteredScenarioRecords(service, { homeownerId, contractorId, retainedPropertyGraph = null }) {
  const findings = [];

  const homes = await ensureOk(
    await service
      .from('homes')
      .select('id')
      .eq('homeowner_user_id', homeownerId)
      .eq('nickname', DEMO_PROPERTY.nickname)
      .eq('address_line1', DEMO_PROPERTY.address_line1)
      .eq('zip_code', DEMO_PROPERTY.zip_code),
    'Unable to inspect possible unregistered demo homes'
  );
  await addUnregisteredFindings(
    service,
    findings,
    'homes',
    homes,
    new Set(retainedPropertyGraph ? [retainedPropertyGraph.home.id] : [])
  );

  const connections = await ensureOk(
    await service
      .from('homeowner_contractor_connections')
      .select('id')
      .eq('homeowner_user_id', homeownerId)
      .eq('contractor_id', contractorId),
    'Unable to inspect possible unregistered demo connections'
  );
  await addUnregisteredFindings(service, findings, 'homeowner_contractor_connections', connections);

  const requests = connections?.length
    ? await ensureOk(
        await service
          .from('service_requests')
          .select('id')
          .eq('title', 'Replace leaking water heater')
          .in(
            'connection_id',
            connections.map((connection) => connection.id)
          )
          .eq('homeowner_user_id', homeownerId)
          .eq('contractor_id', contractorId),
        'Unable to inspect possible unregistered demo service requests'
      )
    : [];
  await addUnregisteredFindings(service, findings, 'service_requests', requests);

  const estimates = await ensureOk(
    await service
      .from('estimates')
      .select('id')
      .eq('title', 'Water heater replacement estimate')
      .eq('homeowner_user_id', homeownerId)
      .eq('contractor_id', contractorId),
    'Unable to inspect possible unregistered demo estimates'
  );
  await addUnregisteredFindings(service, findings, 'estimates', estimates);

  const jobs = estimates?.length
    ? await ensureOk(
        await service
          .from('inspections')
          .select('id')
          .in(
            'estimate_id',
            estimates.map((estimate) => estimate.id)
          ),
        'Unable to inspect possible unregistered demo jobs'
      )
    : [];
  await addUnregisteredFindings(service, findings, 'inspections', jobs);

  if (findings.length > 0) {
    const details = findings.map((finding) => `${finding.tableName}.${finding.recordId}`).join(', ');
    throw new Error(`Demo seed refused: likely unregistered scenario-owned records found: ${details}`);
  }
}

async function upsertProfileRecords(service, runId, homeownerUser, contractorUser, dates, env) {
  const homeownerEmail = env.DEMO_HOMEOWNER_EMAIL || DEMO_HOMEOWNER.defaultEmail;
  const contractorEmail = env.DEMO_CONTRACTOR_EMAIL || DEMO_CONTRACTOR.defaultEmail;

  await ensureOk(
    await service.from('profiles').upsert(
      [
        {
          id: homeownerUser.id,
          email: homeownerEmail,
          role: 'homeowner',
          full_name: DEMO_HOMEOWNER.fullName,
          created_at: dates.profileCreatedAt,
          updated_at: dates.profileCreatedAt,
        },
        {
          id: contractorUser.id,
          email: contractorEmail,
          role: 'contractor',
          full_name: DEMO_CONTRACTOR.fullName,
          created_at: dates.profileCreatedAt,
          updated_at: dates.profileCreatedAt,
        },
      ],
      { onConflict: 'id' }
    ),
    'Unable to upsert demo public profiles'
  );

  await ensureOk(
    await service.from('homeowner_profiles').upsert(
      {
        user_id: homeownerUser.id,
        display_name: DEMO_HOMEOWNER.displayName,
        phone: DEMO_HOMEOWNER.phone,
        city: DEMO_PROPERTY.city,
        state: DEMO_PROPERTY.state,
        zip_code: DEMO_PROPERTY.zip_code,
        created_at: dates.profileCreatedAt,
        updated_at: dates.profileCreatedAt,
      },
      { onConflict: 'user_id' }
    ),
    'Unable to upsert demo homeowner profile'
  );

  const contractor = await ensureOk(
    await service
      .from('contractor_profiles')
      .upsert(
        {
          owner_user_id: contractorUser.id,
          business_name: DEMO_CONTRACTOR.businessName,
          slug: DEMO_CONTRACTOR.slug,
          contact_name: DEMO_CONTRACTOR.contactName,
          email: contractorEmail,
          phone: DEMO_CONTRACTOR.phone,
          website_url: 'https://example.test/gulf-coast-home-services',
          city: 'Mobile',
          state: 'AL',
          zip_code: '36602',
          service_categories: ['Plumbing', 'Water heaters', 'Home maintenance'],
          service_zip_codes: ['36532', '36602', '36608'],
          license_number: 'DEMO-LIC-0108',
          insurance_status: 'Demo insured',
          bonded_status: 'Demo bonded',
          business_summary:
            'Fictional demo contractor profile for ServSync screenshots and recordings. No real services are offered from this profile.',
          public_profile_enabled: true,
          account_status: 'active',
          subscription_status: 'trialing',
          created_at: dates.profileCreatedAt,
          updated_at: dates.profileCreatedAt,
        },
        { onConflict: 'owner_user_id' }
      )
      .select('id')
      .single(),
    'Unable to upsert demo contractor profile'
  );

  return { contractorId: contractor.id };
}

async function createProperty(service, homeownerClient, runId, homeownerId, dates, retainedPropertyGraph = null) {
  if (retainedPropertyGraph) {
    await registerRecord(service, runId, 'homes', retainedPropertyGraph.home.id, 'demo_home', 'property_ready', { revision_aware_retained: true });
    await registerRecord(service, runId, 'home_rooms', retainedPropertyGraph.room.id, 'demo_utility_room', 'property_ready', { revision_aware_retained: true });
    await registerRecord(service, runId, 'home_assets', retainedPropertyGraph.asset.id, 'demo_water_heater_asset', 'property_ready', {
      revision_aware_retained: true,
      revision_count: retainedPropertyGraph.revisions.length,
    });
    return { homeId: retainedPropertyGraph.home.id, roomId: retainedPropertyGraph.room.id, assetId: retainedPropertyGraph.asset.id };
  }

  const home = await ensureOk(
    await service
      .from('homes')
      .insert({
        homeowner_user_id: homeownerId,
        ...DEMO_PROPERTY,
        created_at: dates.propertyCreatedAt,
        updated_at: dates.propertyCreatedAt,
      })
      .select('id')
      .single(),
    'Unable to create demo home'
  );
  await registerCreatedRecord(service, runId, 'homes', home.id, 'demo_home', 'property_ready');

  const room = await ensureOk(
    await service
      .from('home_rooms')
      .insert({
        home_id: home.id,
        name: 'Garage utility area',
        room_type: 'garage',
        floor_label: 'Main',
        area_label: 'Utility',
        sort_order: 10,
        notes: 'Demo room used for the fictional water-heater scenario.',
        created_by: homeownerId,
        created_at: dates.propertyCreatedAt,
        updated_at: dates.propertyCreatedAt,
      })
      .select('id')
      .single(),
    'Unable to create demo home room'
  );
  await registerCreatedRecord(service, runId, 'home_rooms', room.id, 'demo_utility_room', 'property_ready');

  const asset = await ensureOk(
    await homeownerClient.rpc('servsync_create_property_asset', {
      p_home_id: home.id,
      p_home_room_id: room.id,
      p_asset_kind: 'plumbing',
      p_asset_type: 'water_heater',
      p_name: 'Existing 40-gallon water heater',
      p_manufacturer: 'DemoHome',
      p_model: 'WH-40-FICTIONAL',
      p_install_date: dates.waterHeaterInstallDate,
      p_warranty_expires_on: dates.waterHeaterWarrantyDate,
      p_notes: 'Fictional asset record for Demo Mode. Serial numbers and real property details are intentionally omitted.',
    }),
    'Unable to create demo home asset'
  );
  // The bridge creates an immutable baseline revision in the same RPC transaction.
  // If registration fails, the exact graph is recoverable on the next run and must not be hard-deleted.
  await registerRecord(service, runId, 'home_assets', asset.id, 'demo_water_heater_asset', 'property_ready');

  return { homeId: home.id, roomId: room.id, assetId: asset.id };
}

async function createConnection(service, runId, homeownerId, contractorId, dates) {
  const connection = await ensureOk(
    await service
      .from('homeowner_contractor_connections')
      .upsert(
        {
          homeowner_user_id: homeownerId,
          contractor_id: contractorId,
          status: 'active',
          source: 'demo_seed',
          created_at: dates.connectionCreatedAt,
          updated_at: dates.connectionCreatedAt,
        },
        { onConflict: 'homeowner_user_id,contractor_id' }
      )
      .select('id')
      .single(),
    'Unable to upsert demo homeowner-contractor connection'
  );
  await registerRecord(service, runId, 'homeowner_contractor_connections', connection.id, 'demo_connection', 'connection_ready');

  await ensureOk(
    await service.from('connection_permissions').upsert(
      {
        connection_id: connection.id,
        share_contact: true,
        share_home_overview: true,
        share_address: true,
        share_preferred_vendors: false,
        share_photos: false,
        updated_at: dates.connectionCreatedAt,
      },
      { onConflict: 'connection_id' }
    ),
    'Unable to upsert demo connection permissions'
  );
  await registerRecord(service, runId, 'connection_permissions', connection.id, 'demo_connection_permissions', 'connection_ready');

  return { connectionId: connection.id };
}

async function createServiceRequest(homeownerClient, service, runId, connectionId, homeId, dates) {
  const result = await ensureOk(
    await homeownerClient.rpc('servsync_create_service_request', {
      p_connection_id: connectionId,
      p_category: requestFixture.category,
      p_urgency: requestFixture.urgency,
      p_title: requestFixture.title,
      p_description: requestFixture.description,
      p_home_id: homeId,
    }),
    'Unable to create demo service request through homeowner RPC'
  );
  const requestId = result.request_id;
  await registerCreatedRecord(service, runId, 'service_requests', requestId, 'demo_service_request', 'request_ready');

  await ensureOk(
    await service
      .from('service_requests')
      .update({ created_at: dates.requestCreatedAt, updated_at: dates.requestCreatedAt })
      .eq('id', requestId),
    'Unable to set demo service request dates'
  );

  const messages = await ensureOk(
    await service.from('service_request_messages').select('id').eq('request_id', requestId),
    'Unable to inspect demo service request messages'
  );
  for (const message of messages || []) {
    await registerRecord(service, runId, 'service_request_messages', message.id, 'demo_request_message', 'request_ready');
    await service
      .from('service_request_messages')
      .update({ created_at: dates.requestCreatedAt })
      .eq('id', message.id);
  }

  return { requestId };
}

function estimateLines() {
  return estimateFixture.lines;
}

function estimatePaymentScheduleRows() {
  return estimateFixture.paymentSchedule;
}

async function createEstimateDraft(contractorClient, service, runId, contractorId, homeownerId, homeId, requestId, dates) {
  const subtotalCents = estimateFixture.subtotalCents;
  const taxCents = estimateFixture.taxCents;
  const totalCents = subtotalCents + taxCents;
  const estimate = await ensureOk(
    await contractorClient
      .from('estimates')
      .insert({
        contractor_id: contractorId,
        homeowner_user_id: homeownerId,
        home_id: homeId,
        service_request_id: requestId,
        title: estimateFixture.title,
        scope: estimateFixture.scope,
        notes: estimateFixture.notes,
        terms: estimateFixture.terms,
        status: 'draft',
        subtotal_cents: subtotalCents,
        total_cents: totalCents,
        labor_mode: 'line_specific',
        material_total_cents: estimateFixture.materialTotalCents,
        labor_total_cents: estimateFixture.laborTotalCents,
        tax_rate_percent: 0,
        tax_cents: taxCents,
        created_at: dates.estimateCreatedAt,
        updated_at: dates.estimateCreatedAt,
      })
      .select('id')
      .single(),
    'Unable to create demo estimate'
  );
  await registerCreatedRecord(service, runId, 'estimates', estimate.id, 'demo_estimate', 'estimate_draft');

  for (const line of estimateLines()) {
    const insertedLine = await ensureOk(
      await contractorClient
        .from('estimate_line_items')
        .insert({
          estimate_id: estimate.id,
          ...line,
          created_at: dates.estimateCreatedAt,
          updated_at: dates.estimateCreatedAt,
        })
        .select('id')
        .single(),
      `Unable to create demo estimate line: ${line.line_title}`
    );
    await registerCreatedRecord(service, runId, 'estimate_line_items', insertedLine.id, 'demo_estimate_line_item', 'estimate_draft');
  }

  for (const row of estimatePaymentScheduleRows()) {
    const insertedSchedule = await ensureOk(
      await contractorClient
        .from('estimate_payment_schedule_items')
        .insert({
          estimate_id: estimate.id,
          ...row,
          created_at: dates.estimateCreatedAt,
          updated_at: dates.estimateCreatedAt,
        })
        .select('id')
        .single(),
      `Unable to create demo estimate payment schedule row: ${row.label}`
    );
    await registerCreatedRecord(
      service,
      runId,
      'estimate_payment_schedule_items',
      insertedSchedule.id,
      'demo_estimate_payment_schedule_item',
      'estimate_draft'
    );
  }

  return { estimateId: estimate.id, totalCents };
}

async function sendEstimate(contractorClient, service, estimateId, dates) {
  await ensureOk(
    await contractorClient.rpc('servsync_send_estimate', { p_estimate_id: estimateId }),
    'Unable to send demo estimate through servsync_send_estimate'
  );
  await ensureOk(
    await service.from('estimates').update({ updated_at: dates.estimateSentAt }).eq('id', estimateId),
    'Unable to normalize the Demo Estimate sent timestamp'
  );
  return { estimateId, sentAt: dates.estimateSentAt };
}

async function acceptEstimate(homeownerClient, service, runId, estimateId, dates) {
  await ensureOk(
    await homeownerClient.rpc('servsync_homeowner_respond_to_estimate', {
      p_estimate_id: estimateId,
      p_action: 'accept',
    }),
    'Unable to accept demo estimate through homeowner RPC'
  );

  const events = await ensureOk(
    await service
      .from('workflow_activity_events')
      .select('id')
      .eq('estimate_id', estimateId)
      .eq('event_type', WORKFLOW_EVENT_TYPES.estimateApproved)
      .is('inspection_id', null),
    'Unable to inspect demo estimate approval workflow event'
  );
  for (const event of events || []) {
    await ensureOk(
      await service.from('workflow_activity_events').update({ created_at: dates.estimateAcceptedAt }).eq('id', event.id),
      'Unable to normalize demo estimate approval workflow event date'
    );
    await registerRecord(service, runId, 'workflow_activity_events', event.id, 'demo_estimate_approved_event', 'estimate_accepted');
  }

  return { estimateId, approvalEventCount: events?.length || 0 };
}

async function createJobFromEstimate(contractorClient, service, runId, estimateId, dates) {
  const result = await ensureOk(
    await contractorClient.rpc('servsync_create_job_from_estimate', { p_estimate_id: estimateId }),
    'Unable to create demo job from accepted estimate through contractor RPC'
  );

  const jobId = result.job_id;
  await ensureOk(
    await service.from('inspections').update({ created_at: dates.jobCreatedAt, updated_at: dates.jobCreatedAt }).eq('id', jobId),
    'Unable to normalize demo job creation date'
  );
  await registerCreatedRecord(service, runId, 'inspections', jobId, 'demo_job', 'job_created');

  const workItems = await ensureOk(
    await service.from('job_work_items').select('id').eq('inspection_id', jobId),
    'Unable to inspect demo job work items'
  );
  for (const item of workItems || []) {
    await registerRecord(service, runId, 'job_work_items', item.id, 'demo_job_work_item', 'job_created');
  }

  const events = await ensureOk(
    await service.from('workflow_activity_events').select('id').eq('inspection_id', jobId),
    'Unable to inspect demo workflow events'
  );
  for (const event of events || []) {
    await ensureOk(
      await service.from('workflow_activity_events').update({ created_at: dates.jobCreatedAt }).eq('id', event.id),
      'Unable to normalize demo job-created workflow event date'
    );
    await registerRecord(service, runId, 'workflow_activity_events', event.id, 'demo_job_created_event', 'job_created');
  }

  return { jobId, workItemCount: workItems?.length || 0 };
}

async function fetchJobWorkItems(service, jobId) {
  return ensureOk(
    await service
      .from('job_work_items')
      .select('id, title, completion_status, completed_at, completed_by, billing_status, billable, unit_price_cents, sort_order, source_estimate_line_item_id')
      .eq('inspection_id', jobId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    'Unable to inspect demo job work items'
  );
}

function inProgressCompletedWorkItemCount(totalCount) {
  if (totalCount <= 1) {
    return totalCount;
  }
  return Math.max(1, Math.min(2, totalCount - 1));
}

async function syncJobRoomsForWorkItems(service, jobId, completedTitles, summary, updatedAt) {
  const job = await fetchOneByPrimaryKey(service, 'inspections', 'id', jobId, 'id, rooms_with_findings');
  const rooms = Array.isArray(job?.rooms_with_findings) ? job.rooms_with_findings : [];
  const completed = new Set(completedTitles);
  const nextRooms = rooms.map((room) => ({
    ...room,
    findings: Array.isArray(room.findings)
      ? room.findings.map((finding) => {
          const title = finding?.title || '';
          if (!completed.has(title)) {
            return {
              ...finding,
              status: finding?.status === 'Fixed On Site' ? 'Monitor' : finding?.status || 'Monitor',
            };
          }
          return {
            ...finding,
            status: 'Fixed On Site',
            action: finding?.action || 'Completed as part of the approved water-heater replacement.',
            notes: finding?.notes || 'Completed and documented during the service visit.',
          };
        })
      : [],
  }));

  await ensureOk(
    await service.from('inspections').update({ rooms_with_findings: nextRooms, summary, updated_at: updatedAt }).eq('id', jobId),
    'Unable to update demo job scope snapshot'
  );

  return nextRooms;
}

async function setJobWorkItemProgress(service, jobId, completedCount, completedAt, completedBy) {
  const workItems = await fetchJobWorkItems(service, jobId);
  const completedIds = workItems.slice(0, completedCount).map((item) => item.id);
  const openIds = workItems.slice(completedCount).map((item) => item.id);
  const completedTitles = workItems.slice(0, completedCount).map((item) => item.title);

  if (completedIds.length > 0) {
    await ensureOk(
      await service
        .from('job_work_items')
        .update({
          completion_status: 'completed',
          completed_at: completedAt,
          completed_by: completedBy,
          billing_status: 'unbilled',
          updated_at: completedAt,
        })
        .in('id', completedIds),
      'Unable to mark demo job work items complete'
    );
  }

  if (openIds.length > 0) {
    await ensureOk(
      await service
        .from('job_work_items')
        .update({
          completion_status: 'open',
          completed_at: null,
          completed_by: null,
          billing_status: 'unbilled',
          updated_at: completedAt,
        })
        .in('id', openIds),
      'Unable to keep demo job work items open'
    );
  }

  return {
    totalCount: workItems.length,
    completedCount: completedIds.length,
    openCount: openIds.length,
    completedTitles,
  };
}

async function scheduleJobVisit(contractorClient, service, runId, jobId, dates) {
  const result = await ensureOk(
    await contractorClient.rpc('servsync_schedule_visit_event', {
      p_inspection_id: jobId,
      p_scheduled_at: dates.visitWindowStart,
      p_notes: 'Demo contractor-only visit for the water-heater replacement workflow.',
      p_share_with_homeowner: false,
    }),
    'Unable to schedule demo job visit through contractor RPC'
  );
  const visitEventId = result?.visit_event_id;
  if (!visitEventId) {
    throw new Error('Demo visit scheduling did not return a visit_event_id.');
  }

  await registerCreatedRecord(
    service,
    runId,
    'contractor_visit_events',
    visitEventId,
    'demo_contractor_visit_event',
    'job_scheduled'
  );

  await ensureOk(
    await service
      .from('contractor_visit_events')
      .update({ scheduled_at: dates.jobScheduledAt, updated_at: dates.jobScheduledAt })
      .eq('id', visitEventId),
    'Unable to set deterministic demo visit event dates'
  );
  await ensureOk(
    await service.from('inspections').update({ job_status: 'scheduled', updated_at: dates.jobScheduledAt }).eq('id', jobId),
    'Unable to set deterministic demo scheduled job date'
  );

  return { visitEventId };
}

async function advanceJobInProgress(service, jobId, contractorUserId, dates) {
  const currentItems = await fetchJobWorkItems(service, jobId);
  const progress = await setJobWorkItemProgress(
    service,
    jobId,
    inProgressCompletedWorkItemCount(currentItems.length),
    dates.jobInProgressAt,
    contractorUserId
  );
  await syncJobRoomsForWorkItems(
    service,
    jobId,
    progress.completedTitles,
    'Demo job in progress. Initial water-heater replacement tasks are underway.',
    dates.jobInProgressAt
  );
  await ensureOk(
    await service
      .from('inspections')
      .update({
        job_status: 'in_progress',
        completed_at: null,
        closed_at: null,
        report_storage_path: null,
        report_file_name: null,
        updated_at: dates.jobInProgressAt,
      })
      .eq('id', jobId),
    'Unable to mark demo job in progress'
  );
  return progress;
}

async function advanceJobReviewReady(service, jobId, contractorUserId, dates) {
  const currentItems = await fetchJobWorkItems(service, jobId);
  const progress = await setJobWorkItemProgress(service, jobId, currentItems.length, dates.jobReviewReadyAt, contractorUserId);
  await syncJobRoomsForWorkItems(
    service,
    jobId,
    progress.completedTitles,
    'Demo job work is complete and ready for contractor review.',
    dates.jobReviewReadyAt
  );
  await ensureOk(
    await service
      .from('inspections')
      .update({
        job_status: 'in_progress',
        completed_at: null,
        closed_at: null,
        report_storage_path: null,
        report_file_name: null,
        updated_at: dates.jobReviewReadyAt,
      })
      .eq('id', jobId),
    'Unable to mark demo job review ready'
  );
  return progress;
}

async function completeDemoJob(contractorClient, service, jobId, contractorUserId, dates) {
  const currentItems = await fetchJobWorkItems(service, jobId);
  const progress = await setJobWorkItemProgress(service, jobId, currentItems.length, dates.jobCompletedAt, contractorUserId);
  await syncJobRoomsForWorkItems(
    service,
    jobId,
    progress.completedTitles,
    'Replaced the water heater and completed the agreed installation work. Final connections and operating checks were documented before completion.',
    dates.jobCompletedAt
  );
  await ensureOk(
    await service
      .from('inspections')
      .update({
        job_status: 'completed',
        completed_at: dates.jobCompletedAt,
        closed_at: null,
        status: 'draft',
        report_storage_path: null,
        report_file_name: null,
        updated_at: dates.jobCompletedAt,
      })
      .eq('id', jobId),
    'Unable to complete demo job'
  );
  await ensureOk(
    await contractorClient.rpc('servsync_complete_visit_event_for_job', { p_inspection_id: jobId }),
    'Unable to complete demo visit event through contractor RPC'
  );
  await ensureOk(
    await service.from('contractor_visit_events').update({ status: 'completed', updated_at: dates.jobCompletedAt }).eq('inspection_id', jobId),
    'Unable to set deterministic demo visit completion date'
  );
  return progress;
}

async function createDemoInvoiceDraft(contractorClient, service, runId, jobId, dates) {
  const workItems = await fetchJobWorkItems(service, jobId);
  const invoiceableIds = workItems
    .filter((item) => item.completion_status === 'completed' && item.billing_status === 'unbilled' && item.unit_price_cents !== null)
    .map((item) => item.id);
  if (invoiceableIds.length !== workItems.length || invoiceableIds.length === 0) {
    throw new Error('Demo Invoice checkpoint requires every completed priced Job work item to be exactly invoiceable.');
  }
  const creation = await ensureOk(
    await contractorClient.rpc('servsync_create_partial_invoice_from_job', {
      p_inspection_id: jobId,
      p_work_item_ids: invoiceableIds,
    }),
    'Unable to create Demo Invoice through the canonical authenticated RPC'
  );
  const invoiceId = creation?.invoice_id;
  if (!invoiceId) throw new Error('Demo Invoice creation did not return an Invoice id.');
  await ensureOk(
    await service.from('invoices').update({ created_at: dates.invoiceCreatedAt, updated_at: dates.invoiceCreatedAt }).eq('id', invoiceId),
    'Unable to normalize Demo Invoice creation time'
  );
  const invoice = await fetchOneByPrimaryKey(
    service,
    'invoices',
    'id',
    invoiceId,
    'id,total_cents,status,contractor_id,homeowner_user_id,home_id,service_request_id,estimate_id,job_id'
  );
  if (!invoice || invoice.status !== 'draft' || invoice.total_cents !== estimateFixture.subtotalCents + estimateFixture.taxCents) {
    throw new Error('Demo Invoice draft does not match the canonical completed Job total.');
  }
  const lines = await ensureOk(
    await service.from('invoice_line_items').select('id,invoice_id').eq('invoice_id', invoiceId),
    'Unable to inspect Demo Invoice line items'
  );
  if (lines.length < 1) throw new Error('Demo Invoice draft must contain canonical line items.');
  for (const line of lines) {
    await registerRecord(service, runId, 'invoice_line_items', line.id, 'demo_invoice_line_item', 'invoice_draft');
  }
  await registerRecord(service, runId, 'invoices', invoiceId, 'demo_invoice', 'invoice_draft');
  return { invoiceId, invoiceLineCount: lines.length, invoiceTotalCents: invoice.total_cents };
}

async function sendDemoInvoice(contractorClient, invoiceId) {
  await ensureOk(
    await contractorClient.rpc('servsync_send_invoice', { p_invoice_id: invoiceId }),
    'Unable to send Demo Invoice through the canonical authenticated RPC'
  );
}

async function viewDemoInvoice(homeownerClient, invoiceId) {
  await ensureOk(
    await homeownerClient.rpc('servsync_homeowner_view_invoice', { p_invoice_id: invoiceId }),
    'Unable to mark Demo Invoice viewed through the canonical homeowner RPC'
  );
}

async function recordDemoOfflinePayment(contractorClient, service, runId, invoiceId, amountCents, dates, role) {
  const plannedPaymentAt = new Date(role === 'demo_invoice_partial_payment' ? dates.invoicePartialPaidAt : dates.invoicePaidAt);
  const paymentDate = new Date(Math.min(plannedPaymentAt.getTime(), Date.now())).toISOString().slice(0, 10);
  const result = await ensureOk(
    await contractorClient.rpc('servsync_record_offline_invoice_payment', {
      p_invoice_id: invoiceId,
      p_idempotency_key: randomUUID(),
      p_amount_cents: amountCents,
      p_payment_date: paymentDate,
      p_payment_method: role === 'demo_invoice_partial_payment' ? 'bank_transfer' : 'check',
      p_reference: role === 'demo_invoice_partial_payment' ? 'DEMO-PARTIAL' : 'DEMO-FINAL',
      p_note: 'Fictional Demo offline payment record. No money was processed.',
    }),
    'Unable to record Demo Invoice offline payment through the canonical authenticated RPC'
  );
  if (!result?.payment_id) throw new Error('Demo Invoice payment did not return an immutable ledger id.');
  const payments = await listDemoInvoiceOfflinePayments(contractorClient, invoiceId);
  const payment = payments.find((candidate) => candidate.id === result.payment_id) || null;
  if (!payment || payment.invoice_id !== invoiceId || payment.amount_cents !== amountCents) {
    throw new Error('Demo Invoice payment ledger does not match the canonical payment result.');
  }
  await registerRecord(service, runId, 'invoice_offline_payment_records', payment.id, role, role === 'demo_invoice_partial_payment' ? 'invoice_partially_paid' : 'invoice_paid');
  return payment.id;
}

async function listDemoInvoiceOfflinePayments(contractorClient, invoiceId) {
  return ensureOk(
    await contractorClient.rpc('servsync_list_invoice_offline_payments', { p_invoice_id: invoiceId }),
    'Unable to inspect Demo Invoice payment ledger through the canonical authenticated RPC'
  );
}

async function fileDemoInvoiceAndCreateReminder(homeownerClient, service, runId, invoiceId, homeownerUserId, homeId, requestId, dates) {
  const filing = await ensureOk(
    await homeownerClient.rpc('servsync_file_invoice_to_home_history', { p_invoice_id: invoiceId }),
    'Unable to file paid Demo Invoice through the canonical homeowner RPC'
  );
  if (!filing?.maintenance_log_id) throw new Error('Demo Invoice filing did not return a Home History id.');
  await registerRecord(
    service,
    runId,
    'home_maintenance_log',
    filing.maintenance_log_id,
    'demo_invoice_home_history_entry',
    'invoice_home_history_updated'
  );
  const reminder = await ensureOk(
    await homeownerClient
      .from('home_reminders')
      .insert({
        homeowner_user_id: homeownerUserId,
        home_id: homeId,
        maintenance_log_id: filing.maintenance_log_id,
        service_request_id: requestId,
        invoice_id: invoiceId,
        title: 'Schedule annual water-heater check',
        notes: 'Fictional Demo follow-up linked to the paid Invoice Home History record.',
        due_on: new Date(new Date(dates.invoiceHomeHistoryAt).getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        status: 'open',
      })
      .select('id')
      .single(),
    'Unable to create the linked Demo Home Reminder through homeowner authority'
  );
  await registerRecord(service, runId, 'home_reminders', reminder.id, 'demo_invoice_home_reminder', 'invoice_home_history_updated');
  return { homeHistoryId: filing.maintenance_log_id, reminderId: reminder.id };
}

function maybeInterruptDemoQa(env, stepKey) {
  if (env.SERVSYNC_DEMO_QA_INTERRUPT_AFTER_STEP !== stepKey) return;
  if (env.SERVSYNC_DEMO_QA_INTERRUPT_ACKNOWLEDGE !== 'interrupt-demo-fixture-run') {
    throw new Error('Demo QA interruption refused without the exact acknowledgement.');
  }
  throw new Error(`Deliberate Demo QA interruption after ${stepKey}. The next seed must reconcile this failed run.`);
}

// Marketing-ready Demo recordings must finalize reports through the normal contractor UI.
// Fixture data may be synthetic; canonical product artifacts may not be.

function notificationHandlingDecision() {
  return 'Slice 1 leaves incidental in-app notifications untouched and does not register them for reset.';
}

function countBy(records, field) {
  return records.reduce((acc, record) => {
    const key = record[field] || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function recordIds(records, tableName, role = null) {
  return records
    .filter((record) => record.table_name === tableName && (!role || record.record_role === role))
    .map((record) => record.record_id);
}

function normalizeRecordId(id) {
  return id == null ? null : String(id);
}

function sortedUniqueRecordIds(ids) {
  return [...new Set((ids || []).map(normalizeRecordId).filter(Boolean))].sort();
}

function duplicateRecordIds(ids) {
  const seen = new Set();
  const duplicates = new Set();
  for (const rawId of ids || []) {
    const id = normalizeRecordId(rawId);
    if (!id) continue;
    if (seen.has(id)) {
      duplicates.add(id);
    } else {
      seen.add(id);
    }
  }
  return [...duplicates].sort();
}

export function compareExactRecordIdSets(actualIds, registeredIds) {
  const actual = sortedUniqueRecordIds(actualIds);
  const registered = sortedUniqueRecordIds(registeredIds);
  const actualSet = new Set(actual);
  const registeredSet = new Set(registered);
  const missingRegistered = actual.filter((id) => !registeredSet.has(id));
  const staleRegistered = registered.filter((id) => !actualSet.has(id));
  const duplicateActual = duplicateRecordIds(actualIds);
  const duplicateRegistered = duplicateRecordIds(registeredIds);

  return {
    actual,
    registered,
    missingRegistered,
    staleRegistered,
    duplicateActual,
    duplicateRegistered,
    ok:
      missingRegistered.length === 0 &&
      staleRegistered.length === 0 &&
      duplicateActual.length === 0 &&
      duplicateRegistered.length === 0,
  };
}

function requireExactlyOneId(issues, records, tableName, role, label) {
  const ids = recordIds(records, tableName, role);
  if (ids.length !== 1) {
    issues.push(`${label} registry count expected 1, found ${ids.length}.`);
    return null;
  }
  return ids[0];
}

async function fetchOneByPrimaryKey(service, tableName, primaryKey, value, select = '*') {
  return maybeSingle(
    await service.from(tableName).select(select).eq(primaryKey, value).maybeSingle(),
    `Unable to inspect ${tableName}.${value}`
  );
}

function assertOrderedTimestamps(issues, label, earlier, later) {
  if (!earlier || !later) {
    issues.push(`${label} timestamp ordering could not be checked because a timestamp is missing.`);
    return;
  }
  if (new Date(earlier).getTime() > new Date(later).getTime()) {
    issues.push(`${label} timestamp ordering is invalid.`);
  }
}

function workflowEventSource(event) {
  return event?.metadata && typeof event.metadata === 'object' ? event.metadata.source_rpc : null;
}

function filterScenarioWorkflowEvents(events, criteria) {
  return (events || []).filter((event) => {
    if (event.event_type !== criteria.eventType) return false;
    if (criteria.estimateId && event.estimate_id !== criteria.estimateId) return false;
    if (criteria.inspectionId !== undefined && event.inspection_id !== criteria.inspectionId) return false;
    if (criteria.sourceRpc && workflowEventSource(event) !== criteria.sourceRpc) return false;
    return true;
  });
}

export function findForbiddenJobCompletedEvents(events, jobId) {
  if (!jobId) return [];
  return (events || []).filter((event) => event?.event_type === WORKFLOW_EVENT_TYPES.jobCompleted && event?.inspection_id === jobId);
}

export function verifyExactVisitEventOwnership(issues, { registeredVisitEventIds = [], visitEvents = [] }) {
  if (registeredVisitEventIds.length !== 1) {
    issues.push(`Expected 1 registered contractor visit event, found ${registeredVisitEventIds.length}.`);
  }
  if (visitEvents.length !== 1) {
    issues.push(`Expected exactly one contractor visit event for the demo job, found ${visitEvents.length}.`);
  }
  if (registeredVisitEventIds.length === 1 && visitEvents.length === 1) {
    const registeredId = normalizeRecordId(registeredVisitEventIds[0]);
    const actualId = normalizeRecordId(visitEvents[0]?.id);
    if (registeredId !== actualId) {
      issues.push(`Demo contractor visit event registry ID ${registeredId || 'missing'} does not match current job visit event ${actualId || 'missing'}.`);
    }
  }
}

export function verifyExactJobWorkItemOwnership(issues, { registeredWorkItemIds = [], jobWorkItems = [] }) {
  const comparison = compareExactRecordIdSets(
    (jobWorkItems || []).map((item) => item.id),
    registeredWorkItemIds
  );

  if (comparison.duplicateActual.length > 0) {
    issues.push(`Duplicate current demo job work item IDs: ${comparison.duplicateActual.join(', ')}.`);
  }
  if (comparison.duplicateRegistered.length > 0) {
    issues.push(`Duplicate registered demo job work item IDs: ${comparison.duplicateRegistered.join(', ')}.`);
  }
  if (comparison.missingRegistered.length > 0) {
    issues.push(`Demo job work item registry is missing current job work item IDs: ${comparison.missingRegistered.join(', ')}.`);
  }
  if (comparison.staleRegistered.length > 0) {
    issues.push(`Demo job work item registry includes stale IDs not attached to the current job: ${comparison.staleRegistered.join(', ')}.`);
  }

  return comparison;
}

function requireExactlyOneWorkflowEvent(issues, events, criteria, label) {
  const matches = filterScenarioWorkflowEvents(events, criteria);
  if (matches.length !== 1) {
    issues.push(`${label} workflow event count expected 1, found ${matches.length}.`);
    return null;
  }
  return matches[0];
}

export function verifyEstimateApprovalWorkflowEvent(issues, { estimate, events }) {
  if (!estimate) {
    issues.push('Estimate approval workflow event verification requires an estimate record.');
    return;
  }
  if (estimate.status !== 'accepted') {
    issues.push('Demo estimate must be accepted before approval workflow event ordering can be verified.');
  }

  const estimateApprovedEvent = requireExactlyOneWorkflowEvent(
    issues,
    events,
    {
      eventType: WORKFLOW_EVENT_TYPES.estimateApproved,
      estimateId: estimate.id,
      inspectionId: null,
      sourceRpc: WORKFLOW_EVENT_SOURCES.estimateResponse,
    },
    'Estimate approval'
  );

  if (estimateApprovedEvent) {
    assertOrderedTimestamps(issues, 'Estimate creation before estimate approval event', estimate.created_at, estimateApprovedEvent.created_at);
  }

  return estimateApprovedEvent;
}

export function verifyAcceptedEstimateWorkflowEvents(issues, { estimate, job, events }) {
  if (!estimate || !job) {
    issues.push('Accepted estimate workflow event verification requires both estimate and job records.');
    return null;
  }

  const estimateApprovedEvent = verifyEstimateApprovalWorkflowEvent(issues, { estimate, events });
  const jobCreatedEvent = requireExactlyOneWorkflowEvent(
    issues,
    events,
    {
      eventType: WORKFLOW_EVENT_TYPES.jobCreated,
      estimateId: estimate.id,
      inspectionId: job.id,
      sourceRpc: WORKFLOW_EVENT_SOURCES.jobFromEstimate,
    },
    'Job creation'
  );

  if (estimateApprovedEvent && jobCreatedEvent) {
    assertOrderedTimestamps(issues, 'Estimate approval event before job creation event', estimateApprovedEvent.created_at, jobCreatedEvent.created_at);
  }
  if (jobCreatedEvent) {
    assertOrderedTimestamps(issues, 'Estimate creation before job creation event', estimate.created_at, jobCreatedEvent.created_at);
  }

  return { estimateApprovedEvent, jobCreatedEvent };
}

export function verifyScheduledVisitTimestampOrdering(issues, { job, visitEvent, jobCreatedEvent = null }) {
  if (!job || !visitEvent) {
    return;
  }

  assertOrderedTimestamps(issues, 'Job creation before scheduled visit', job.created_at, visitEvent.scheduled_at);
  if (jobCreatedEvent) {
    assertOrderedTimestamps(issues, 'Job creation event before scheduled visit', jobCreatedEvent.created_at, visitEvent.scheduled_at);
  }
}

async function verifyAuthUser(service, email, scenarioKey, role, issues) {
  const matches = await findAuthUsersByEmail(service, email);
  if (matches.length !== 1) {
    issues.push(`Auth identity ${email} expected exactly one user, found ${matches.length}.`);
    return null;
  }

  try {
    assertDemoAuthMetadata(matches[0], email, scenarioKey, role);
  } catch (error) {
    issues.push(error.message);
  }
  return matches[0];
}

async function verifyRegistryCompleteness(service, records, issues) {
  const seen = new Set();
  for (const record of records) {
    const primaryKey = RESETTABLE_PRIMARY_KEYS[record.table_name];
    const key = `${record.schema_name}.${record.table_name}.${record.primary_key_column}.${record.record_id}`;
    if (seen.has(key)) {
      issues.push(`Duplicate registry row for ${key}.`);
      continue;
    }
    seen.add(key);

    if (record.schema_name !== 'public') {
      issues.push(`Unsupported registry schema ${record.schema_name} for ${record.table_name}.${record.record_id}.`);
      continue;
    }
    if (!primaryKey) {
      issues.push(`Unsupported registry table ${record.table_name}.`);
      continue;
    }
    if (record.primary_key_column !== primaryKey) {
      issues.push(`Registry primary key mismatch for ${record.table_name}.${record.record_id}.`);
      continue;
    }

    // The immutable offline-payment ledger deliberately grants no direct table
    // access, including to service_role. Its exact registered rows are checked
    // later through the canonical authenticated list RPC.
    if (record.table_name === 'invoice_offline_payment_records') {
      continue;
    }

    const row = await fetchOneByPrimaryKey(service, record.table_name, primaryKey, record.record_id, primaryKey);
    if (!row) {
      issues.push(`Registry points to missing ${record.table_name}.${record.record_id}.`);
    }
  }
}

async function verifyScenario(service, scenarioKey, env = process.env, requestedCheckpointKey = null) {
  const target = assertSafeDemoTarget(env);

  const issues = [];
  const homeownerEmail = env.DEMO_HOMEOWNER_EMAIL || DEMO_HOMEOWNER.defaultEmail;
  const contractorEmail = env.DEMO_CONTRACTOR_EMAIL || DEMO_CONTRACTOR.defaultEmail;
  const runs = await inspectNonResetRuns(service, scenarioKey);
  const unresolvedRuns = runs.filter((run) => ['started', 'failed'].includes(run.status) && run.recordCount > 0);
  const succeededRunsWithRecords = runs.filter((run) => run.status === 'succeeded' && run.recordCount > 0);
  const zeroRecordRuns = runs.filter((run) => run.recordCount === 0);

  if (unresolvedRuns.length > 0) {
    issues.push(`Unresolved started/failed runs still own registered records: ${unresolvedRuns.map((run) => run.id).join(', ')}.`);
  }
  if (succeededRunsWithRecords.length !== 1) {
    issues.push(`Expected exactly one active succeeded scenario run with records, found ${succeededRunsWithRecords.length}.`);
  }
  if (zeroRecordRuns.some((run) => run.status === 'succeeded')) {
    issues.push(`Succeeded runs without records require reset or investigation: ${zeroRecordRuns.map((run) => run.id).join(', ')}.`);
  }

  const run = succeededRunsWithRecords[0] || null;
  if (!run) {
    return {
      ok: false,
      reason: issues[0] || 'No complete succeeded demo scenario run found.',
      issues,
      runs: runs.map(({ id, status, recordCount }) => ({ id, status, recordCount })),
    };
  }
  if (!run.completed_at) {
    issues.push(`Succeeded run ${run.id} is missing completed_at.`);
  }
  if (!run.anchor_timestamp) {
    issues.push(`Succeeded run ${run.id} is missing anchor_timestamp.`);
  }
  const flagshipInvoiceExpected = run.metadata?.recorder_scenario === 'servsync-platform-introduction'
    && Boolean(run.metadata?.invoice_id);

  const activeCheckpointKey = run.checkpoint || run.metadata?.selected_checkpoint || DEFAULT_CHECKPOINT_KEY;
  if (!SUPPORTED_CHECKPOINT_KEYS.includes(activeCheckpointKey)) {
    issues.push(`Active run has unsupported checkpoint ${activeCheckpointKey}.`);
  }
  if (requestedCheckpointKey && activeCheckpointKey !== requestedCheckpointKey) {
    issues.push(`Requested checkpoint ${requestedCheckpointKey} does not match active run checkpoint ${activeCheckpointKey}.`);
  }
  if (run.metadata?.selected_checkpoint && run.metadata.selected_checkpoint !== activeCheckpointKey) {
    issues.push(`Run checkpoint ${activeCheckpointKey} does not match run metadata checkpoint ${run.metadata.selected_checkpoint}.`);
  }

  const checkpointKey = SUPPORTED_CHECKPOINT_KEYS.includes(activeCheckpointKey) ? activeCheckpointKey : DEFAULT_CHECKPOINT_KEY;
  const checkpoint = getCheckpointDefinition(checkpointKey);
  const recorderEstimateCheckpoint =
    checkpointKey === 'estimate_draft'
    && run.metadata?.recorder_source === 'servsync_demo_recorder'
    && run.metadata?.recorder_scenario === 'contractor-create-estimate';
  const requiresEstimate = checkpointRequires(checkpointKey, 'estimateDraft');
  const requiresSent = checkpointRequires(checkpointKey, 'estimateSent');
  const requiresAccepted = checkpointRequires(checkpointKey, 'estimateAccepted');
  const requiresConnection = checkpointRequires(checkpointKey, 'connection');
  const requiresRequest = checkpointRequires(checkpointKey, 'request');
  const requiresJob = checkpointRequires(checkpointKey, 'jobCreated');
  const requiresJobScheduled = checkpointRequires(checkpointKey, 'jobScheduled');
  const requiresJobInProgress = checkpointRequires(checkpointKey, 'jobInProgress');
  const requiresJobReviewReady = checkpointRequires(checkpointKey, 'jobReviewReady');
  const requiresJobCompleted = checkpointRequires(checkpointKey, 'jobCompleted');
  const requiresHomeHistory = checkpointRequires(checkpointKey, 'homeHistoryUpdated');
  const requiresInvoice = checkpointRequires(checkpointKey, 'invoiceDraft');
  const requiresInvoiceSent = checkpointRequires(checkpointKey, 'invoiceSent');
  const requiresInvoiceViewed = checkpointRequires(checkpointKey, 'invoiceViewed');
  const requiresInvoicePartialPayment = checkpointRequires(checkpointKey, 'invoicePartiallyPaid');
  const requiresInvoicePaid = checkpointRequires(checkpointKey, 'invoicePaid');
  const requiresInvoiceHomeHistory = checkpointRequires(checkpointKey, 'invoiceHomeHistoryUpdated');

  const records = run.records;
  const counts = countBy(records, 'table_name');
  let verifiedPropertyGraph = null;
  const requiredTables = REQUIRED_SCENARIO_TABLES.filter((tableName) => {
    if (['homeowner_contractor_connections', 'connection_permissions'].includes(tableName)) {
      return requiresConnection;
    }
    if (tableName === 'service_requests') {
      return requiresRequest;
    }
    if (['estimates', 'estimate_line_items', 'estimate_payment_schedule_items'].includes(tableName)) {
      return requiresEstimate && !(recorderEstimateCheckpoint && tableName === 'estimate_payment_schedule_items');
    }
    if (tableName === 'inspections') {
      return requiresJob;
    }
    if (tableName === 'contractor_visit_events') {
      return requiresJobScheduled;
    }
    return true;
  });
  if (requiresAccepted && !counts.workflow_activity_events) {
    issues.push('Accepted-estimate checkpoints require a registered workflow activity event.');
  }
  if (requiresJob && !counts.job_work_items) {
    issues.push('Job-created checkpoint requires registered job work items.');
  }
  if (requiresJobScheduled && !counts.contractor_visit_events) {
    issues.push('Job-scheduled checkpoint requires a registered contractor visit event.');
  }
  if (requiresHomeHistory) {
    for (const tableName of ['home_maintenance_log', 'home_documents', 'notifications']) {
      if (counts[tableName] !== 1) {
        issues.push(`Home History checkpoint requires exactly one registered ${tableName} record, found ${counts[tableName] || 0}.`);
      }
    }
  }
  if (requiresInvoice) {
    for (const tableName of ['invoices', 'invoice_line_items']) {
      if (!counts[tableName]) issues.push(`Invoice checkpoint requires registered ${tableName} records.`);
    }
  }
  if (requiresInvoicePartialPayment && !counts.invoice_offline_payment_records) {
    issues.push('Paid Invoice checkpoints require registered immutable offline-payment ledger records.');
  }
  if (requiresInvoiceHomeHistory) {
    if (counts.home_maintenance_log !== 1) issues.push('Invoice Home History checkpoint requires one registered maintenance row.');
    if (counts.home_reminders !== 1) issues.push('Invoice Home History checkpoint requires one registered Home Reminder.');
  }
  for (const tableName of requiredTables) {
    if (!counts[tableName]) {
      issues.push(`Required scenario table ${tableName} has no registered records.`);
    }
  }
  await verifyRegistryCompleteness(service, records, issues);

  const homeownerUser = await verifyAuthUser(service, homeownerEmail, scenarioKey, 'homeowner', issues);
  const contractorUser = await verifyAuthUser(service, contractorEmail, scenarioKey, 'contractor_owner', issues);
  if (homeownerUser) {
    try {
      const propertyGraph = await loadCanonicalPropertyGraph(service, homeownerUser.id);
      if (!propertyGraph) {
        issues.push('Canonical revision-backed demo property graph is missing.');
      } else {
        verifiedPropertyGraph = propertyGraph;
        const registeredIds = new Map(
          records
            .filter((record) => Object.hasOwn(REVISION_RETAINED_RECORD_ROLES, record.table_name))
            .map((record) => [record.table_name, record.record_id])
        );
        if (
          registeredIds.get('homes') !== propertyGraph.home.id ||
          registeredIds.get('home_rooms') !== propertyGraph.room.id ||
          registeredIds.get('home_assets') !== propertyGraph.asset.id
        ) {
          issues.push('Canonical revision-backed demo property graph does not match the active run registry.');
        }
      }
    } catch (error) {
      issues.push(error.message);
    }
  }
  if (homeownerUser && contractorUser) {
    if (homeownerUser.id === contractorUser.id) {
      issues.push('Homeowner and contractor auth users resolved to the same ID.');
    }
    if (homeownerEmail.toLowerCase() === contractorEmail.toLowerCase()) {
      issues.push('Homeowner and contractor configured emails must be distinct.');
    }
  }

  const homeownerProfile = homeownerUser
    ? await fetchOneByPrimaryKey(service, 'profiles', 'id', homeownerUser.id, 'id, email, role')
    : null;
  const contractorProfile = contractorUser
    ? await fetchOneByPrimaryKey(service, 'profiles', 'id', contractorUser.id, 'id, email, role')
    : null;
  if (!homeownerProfile || homeownerProfile.role !== 'homeowner') {
    issues.push('Homeowner public profile is missing or has an unexpected role.');
  }
  if (!contractorProfile || contractorProfile.role !== 'contractor') {
    issues.push('Contractor public profile is missing or has an unexpected role.');
  }

  const homeownerDetails = homeownerUser
    ? await fetchOneByPrimaryKey(service, 'homeowner_profiles', 'user_id', homeownerUser.id, 'user_id, display_name')
    : null;
  if (!homeownerDetails) {
    issues.push('Homeowner profile details are missing.');
  }

  const contractorRows = contractorUser
    ? await ensureOk(
        await service
          .from('contractor_profiles')
          .select('id, owner_user_id, business_name, slug, account_status, public_profile_enabled, service_categories, service_zip_codes, zip_code, city, state')
          .eq('owner_user_id', contractorUser.id),
        'Unable to inspect contractor profile'
      )
    : [];
  if (contractorRows.length !== 1) {
    issues.push(`Contractor company/profile expected exactly one row, found ${contractorRows.length}.`);
  }
  const contractor = contractorRows[0] || null;
  if (contractor && (contractor.business_name !== DEMO_CONTRACTOR.businessName || contractor.account_status !== 'active')) {
    issues.push('Contractor company/profile does not match the expected active demo contractor.');
  }
  if (
    contractor &&
    (!contractor.public_profile_enabled ||
      contractor.slug !== DEMO_CONTRACTOR.slug ||
      !contractor.service_categories?.includes('Plumbing') ||
      !contractor.service_categories?.includes('Water heaters') ||
      !contractor.service_zip_codes?.includes(DEMO_PROPERTY.zip_code))
  ) {
    issues.push('Contractor discovery checkpoint requires a public Gulf Coast profile searchable by demo ZIP and plumbing/water-heater trade.');
  }

  const homeId = requireExactlyOneId(issues, records, 'homes', 'demo_home', 'demo home');
  const registeredConnectionIds = records
    .filter((record) => record.table_name === 'homeowner_contractor_connections')
    .map((record) => record.record_id);
  const registeredRequestIds = records
    .filter((record) => record.table_name === 'service_requests')
    .map((record) => record.record_id);
  const connectionId = requiresConnection
    ? requireExactlyOneId(issues, records, 'homeowner_contractor_connections', 'demo_connection', 'demo connection')
    : null;
  const requestId = requiresRequest
    ? requireExactlyOneId(issues, records, 'service_requests', 'demo_service_request', 'demo service request')
    : null;
  if (!requiresConnection && registeredConnectionIds.length !== 0) {
    issues.push(`Checkpoint ${checkpointKey} should not have registered connection records, found ${registeredConnectionIds.length}.`);
  }
  if (!requiresRequest && registeredRequestIds.length !== 0) {
    issues.push(`Checkpoint ${checkpointKey} should not have registered service request records, found ${registeredRequestIds.length}.`);
  }
  const estimateIds = recordIds(records, 'estimates', 'demo_estimate');
  const jobIds = recordIds(records, 'inspections', 'demo_job');
  const visitEventIds = recordIds(records, 'contractor_visit_events', 'demo_contractor_visit_event');
  const jobWorkItemIds = recordIds(records, 'job_work_items', 'demo_job_work_item');
  const reportDocumentId = requiresHomeHistory
    ? requireExactlyOneId(issues, records, 'home_documents', FINALIZED_REPORT_RECORD_ROLES.document, 'finalized report document')
    : null;
  const homeHistoryId = requiresHomeHistory
    ? requireExactlyOneId(issues, records, 'home_maintenance_log', FINALIZED_REPORT_RECORD_ROLES.history, 'Home History entry')
    : null;
  const reportNotificationId = requiresHomeHistory
    ? requireExactlyOneId(issues, records, 'notifications', FINALIZED_REPORT_RECORD_ROLES.notification, 'finalized report notification')
    : null;
  const invoiceIds = recordIds(records, 'invoices', 'demo_invoice');
  const invoicePaymentIds = records
    .filter((record) => record.table_name === 'invoice_offline_payment_records')
    .map((record) => record.record_id);
  const invoiceId = requiresInvoice
    ? requireExactlyOneId(issues, records, 'invoices', 'demo_invoice', 'demo Invoice')
    : null;
  const invoiceHomeHistoryId = requiresInvoiceHomeHistory
    ? requireExactlyOneId(issues, records, 'home_maintenance_log', 'demo_invoice_home_history_entry', 'Invoice Home History entry')
    : null;
  const invoiceReminderId = requiresInvoiceHomeHistory
    ? requireExactlyOneId(issues, records, 'home_reminders', 'demo_invoice_home_reminder', 'Invoice Home Reminder')
    : null;
  let estimateId = null;
  let jobId = null;
  if (requiresEstimate) {
    estimateId = requireExactlyOneId(issues, records, 'estimates', 'demo_estimate', 'demo estimate');
  } else if (estimateIds.length !== 0) {
    issues.push(`Checkpoint ${checkpointKey} should not have an estimate, found ${estimateIds.length}.`);
  }
  if (requiresJob) {
    jobId = requireExactlyOneId(issues, records, 'inspections', 'demo_job', 'demo job');
  } else if (jobIds.length !== 0) {
    issues.push(`Checkpoint ${checkpointKey} should not have a job, found ${jobIds.length}.`);
  }

  const home = homeId ? await fetchOneByPrimaryKey(service, 'homes', 'id', homeId, 'id, homeowner_user_id, nickname, address_line1, zip_code, created_at') : null;
  const connection = connectionId
    ? await fetchOneByPrimaryKey(
        service,
        'homeowner_contractor_connections',
        'id',
        connectionId,
        'id, homeowner_user_id, contractor_id, status, source, created_at'
      )
    : null;
  const permissions = connectionId
    ? await fetchOneByPrimaryKey(
        service,
        'connection_permissions',
        'connection_id',
        connectionId,
        'connection_id, share_contact, share_home_overview, share_address'
      )
    : null;
  const request = requestId
    ? await fetchOneByPrimaryKey(
        service,
        'service_requests',
        'id',
        requestId,
        'id, connection_id, homeowner_user_id, contractor_id, title, status, created_at'
      )
    : null;
  const estimate = estimateId
    ? await fetchOneByPrimaryKey(
        service,
        'estimates',
        'id',
        estimateId,
        'id, contractor_id, homeowner_user_id, home_id, service_request_id, inspection_id, title, status, created_at, updated_at'
      )
    : null;
  const job = jobId
    ? await fetchOneByPrimaryKey(
        service,
        'inspections',
        'id',
        jobId,
        'id, contractor_id, homeowner_user_id, home_id, service_request_id, estimate_id, status, job_status, created_at, updated_at, completed_at, closed_at, report_storage_path, report_file_name'
      )
    : null;
  const workflowEventClauses = [estimateId ? `estimate_id.eq.${estimateId}` : null, jobId ? `inspection_id.eq.${jobId}` : null].filter(Boolean);
  const workflowEvents =
    workflowEventClauses.length > 0
      ? await ensureOk(
          await service
            .from('workflow_activity_events')
            .select('id, event_type, estimate_id, inspection_id, created_at, metadata')
            .in('event_type', [
              WORKFLOW_EVENT_TYPES.estimateApproved,
              WORKFLOW_EVENT_TYPES.jobCreated,
              WORKFLOW_EVENT_TYPES.jobCompleted,
            ])
            .or(workflowEventClauses.join(',')),
          'Unable to inspect demo workflow activity events'
        )
      : [];
  const jobWorkItems = jobId ? await fetchJobWorkItems(service, jobId) : [];
  const visitEvents = jobId
    ? await ensureOk(
        await service
          .from('contractor_visit_events')
          .select('id, inspection_id, service_request_id, homeowner_user_id, scheduled_at, share_with_homeowner, status, homeowner_response_status, updated_at')
          .eq('inspection_id', jobId),
        'Unable to inspect demo contractor visit events'
      )
    : [];
  const appointmentRows = requestId
    ? await ensureOk(
        await service.from('service_request_appointments').select('id, request_id, visit_event_id, status').eq('request_id', requestId),
        'Unable to inspect demo appointment proposals'
      )
    : [];
  const invoiceClauses = [jobId ? `job_id.eq.${jobId}` : null, estimateId ? `estimate_id.eq.${estimateId}` : null, requestId ? `service_request_id.eq.${requestId}` : null].filter(Boolean);
  const scenarioInvoices =
    invoiceClauses.length > 0
      ? await ensureOk(
          await service
            .from('invoices')
            .select('id, contractor_id, homeowner_user_id, home_id, job_id, estimate_id, service_request_id, status, total_cents, amount_paid_cents, paid_at, issued_at, created_at, updated_at')
            .or(invoiceClauses.join(',')),
          'Unable to inspect Demo invoices'
        )
      : [];
  const invoicePayments = invoiceId
    ? await listDemoInvoiceOfflinePayments(
        await signInDemoUser(
          createSupabaseClients(env, target).makeUserClient,
          contractorEmail,
          requireEnv(env, 'DEMO_CONTRACTOR_PASSWORD')
        ),
        invoiceId
      )
    : [];
  const homeHistoryClauses = [
    jobId ? `inspection_id.eq.${jobId}` : null,
    requestId ? `service_request_id.eq.${requestId}` : null,
    invoiceId ? `invoice_id.eq.${invoiceId}` : null,
  ].filter(Boolean);
  const homeHistoryRows =
    homeHistoryClauses.length > 0
      ? await ensureOk(
          await service
            .from('home_maintenance_log')
            .select('id, homeowner_user_id, home_id, inspection_id, service_request_id, invoice_id, report_document_id')
            .or(homeHistoryClauses.join(',')),
          'Unable to inspect deferred demo Home History rows'
        )
      : [];
  const invoiceReminders = invoiceId
    ? await ensureOk(
        await service
          .from('home_reminders')
          .select('id,homeowner_user_id,home_id,maintenance_log_id,service_request_id,invoice_id,title,status,due_on')
          .eq('invoice_id', invoiceId),
        'Unable to inspect Demo Invoice Home Reminders'
      )
    : [];
  const reportDocuments = reportDocumentId
    ? await ensureOk(
        await service
          .from('home_documents')
          .select('id, homeowner_user_id, home_id, storage_path, file_name, file_size_bytes, content_type, document_type')
          .eq('id', reportDocumentId),
        'Unable to inspect the Demo finalized-report document'
      )
    : [];
  const reportNotifications = reportNotificationId
    ? await ensureOk(
        await service.from('notifications').select('id, user_id, type, request_id').eq('id', reportNotificationId),
        'Unable to inspect the Demo finalized-report notification'
      )
    : [];
  const scenarioConnections = homeownerUser && contractor
    ? await ensureOk(
        await service
          .from('homeowner_contractor_connections')
          .select('id, status, source')
          .eq('homeowner_user_id', homeownerUser.id)
          .eq('contractor_id', contractor.id),
        'Unable to inspect direct demo homeowner-contractor connections'
      )
    : [];
  const scenarioRequests = homeownerUser && contractor
    ? await ensureOk(
        await service
          .from('service_requests')
          .select('id, connection_id, title, status')
          .eq('homeowner_user_id', homeownerUser.id)
          .eq('contractor_id', contractor.id)
          .eq('title', 'Replace leaking water heater'),
        'Unable to inspect direct demo service requests'
      )
    : [];
  const scenarioEstimates = homeownerUser && contractor
    ? await ensureOk(
        await service
          .from('estimates')
          .select('id, title, status')
          .eq('homeowner_user_id', homeownerUser.id)
          .eq('contractor_id', contractor.id)
          .eq('title', 'Water heater replacement estimate'),
        'Unable to inspect direct demo estimates'
      )
    : [];

  if (home && homeownerUser && (home.homeowner_user_id !== homeownerUser.id || home.nickname !== DEMO_PROPERTY.nickname)) {
    issues.push('Demo home is not linked to the expected homeowner or property marker.');
  }
  if (!requiresConnection && scenarioConnections.length !== 0) {
    issues.push(`Checkpoint ${checkpointKey} should not have homeowner-to-Gulf Coast connection rows, found ${scenarioConnections.length}.`);
  }
  if (requiresConnection && scenarioConnections.length !== 1) {
    issues.push(`Expected exactly one homeowner-to-Gulf Coast connection row, found ${scenarioConnections.length}.`);
  }
  if (!requiresRequest && scenarioRequests.length !== 0) {
    issues.push(`Checkpoint ${checkpointKey} should not have water-heater service requests, found ${scenarioRequests.length}.`);
  }
  if (!requiresEstimate && scenarioEstimates.length !== 0) {
    issues.push(`Checkpoint ${checkpointKey} should not have water-heater estimates, found ${scenarioEstimates.length}.`);
  }
  if (
    connection &&
    homeownerUser &&
    contractor &&
    (connection.homeowner_user_id !== homeownerUser.id ||
      connection.contractor_id !== contractor.id ||
      connection.status !== 'active' ||
      connection.source !== 'demo_seed')
  ) {
    issues.push('Demo connection does not link the expected homeowner, contractor, and active demo source.');
  }
  if (requiresConnection && (!permissions || !permissions.share_contact || !permissions.share_home_overview || !permissions.share_address)) {
    issues.push('Demo connection permissions are missing required workflow sharing.');
  }
  if (
    request &&
    homeownerUser &&
    contractor &&
    (request.connection_id !== connectionId ||
      request.homeowner_user_id !== homeownerUser.id ||
      request.contractor_id !== contractor.id ||
      request.title !== 'Replace leaking water heater')
  ) {
    issues.push('Demo service request is not linked to the expected homeowner, contractor, connection, and title.');
  }
  if (
    estimate &&
    homeownerUser &&
    contractor &&
    (estimate.service_request_id !== requestId ||
      estimate.homeowner_user_id !== homeownerUser.id ||
      estimate.contractor_id !== contractor.id ||
      estimate.home_id !== homeId ||
      estimate.status !== checkpoint.expected.estimateStatus)
  ) {
    issues.push(`Demo estimate is not ${checkpoint.expected.estimateStatus} or not linked to the expected request/homeowner/contractor/home.`);
  }
  if (
    job &&
    homeownerUser &&
    contractor &&
    (job.estimate_id !== estimateId ||
      job.service_request_id !== requestId ||
      job.homeowner_user_id !== homeownerUser.id ||
      job.contractor_id !== contractor.id ||
      job.home_id !== homeId ||
      job.job_status !== checkpoint.expected.jobStatus)
  ) {
    issues.push(`Demo job is not linked to the accepted estimate and expected scenario records or does not have status ${checkpoint.expected.jobStatus}.`);
  }
  if (estimate && job && estimate.inspection_id !== job.id) {
    issues.push('Accepted estimate does not point to the linked demo job.');
  }
  if (estimate && !requiresJob && estimate.inspection_id) {
    issues.push(`Checkpoint ${checkpointKey} should not have a linked job on the estimate.`);
  }

  if (estimateId) {
    const lineItems = recordIds(records, 'estimate_line_items', 'demo_estimate_line_item');
    const scheduleItems = recordIds(records, 'estimate_payment_schedule_items', 'demo_estimate_payment_schedule_item');
    const expectedLineCount = recorderEstimateCheckpoint ? 1 : estimateLines().length;
    const expectedScheduleCount = recorderEstimateCheckpoint ? 0 : 2;
    if (lineItems.length !== expectedLineCount) {
      issues.push(`Expected ${expectedLineCount} registered estimate line items, found ${lineItems.length}.`);
    }
    if (scheduleItems.length !== expectedScheduleCount) {
      issues.push(`Expected ${expectedScheduleCount} registered estimate payment schedule rows, found ${scheduleItems.length}.`);
    }
    if (checkpointKey === 'estimate_draft' && estimate && estimate.status === 'draft' && estimate.updated_at !== estimate.created_at) {
      issues.push('Draft estimate should not have sent evidence in updated_at.');
    }
    if (requiresSent && estimate && new Date(estimate.updated_at).getTime() <= new Date(estimate.created_at).getTime()) {
      issues.push('Sent or later estimate checkpoint is missing sent timestamp evidence.');
    }
  } else {
    const lineItems = recordIds(records, 'estimate_line_items', 'demo_estimate_line_item');
    const scheduleItems = recordIds(records, 'estimate_payment_schedule_items', 'demo_estimate_payment_schedule_item');
    if (lineItems.length || scheduleItems.length) {
      issues.push(`Checkpoint ${checkpointKey} should not have estimate detail records.`);
    }
  }

  const duplicateJobs = estimateId
    ? await ensureOk(
        await service.from('inspections').select('id').eq('estimate_id', estimateId),
        'Unable to inspect duplicate demo jobs'
      )
    : [];
  if (requiresJob && duplicateJobs.length !== 1) {
    issues.push(`Expected exactly one job linked to the demo estimate, found ${duplicateJobs.length}.`);
  }
  if (!requiresJob && duplicateJobs.length !== 0) {
    issues.push(`Checkpoint ${checkpointKey} should not have a job linked to the demo estimate, found ${duplicateJobs.length}.`);
  }

  if (requiresJob && job) {
    const completedItems = jobWorkItems.filter((item) => item.completion_status === 'completed');
    const openItems = jobWorkItems.filter((item) => item.completion_status === 'open');
    verifyExactJobWorkItemOwnership(issues, { registeredWorkItemIds: jobWorkItemIds, jobWorkItems });
    if (jobWorkItems.length !== estimateLines().length) {
      issues.push(`Expected ${estimateLines().length} demo job work items, found ${jobWorkItems.length}.`);
    }
    if (jobWorkItems.some((item) => !item.source_estimate_line_item_id)) {
      issues.push('Demo job work items must remain estimate-derived; manual work items are not part of Slice 2B.');
    }
    if (checkpoint.expected.completedWorkItemCount !== undefined && completedItems.length !== checkpoint.expected.completedWorkItemCount) {
      issues.push(`Expected ${checkpoint.expected.completedWorkItemCount} completed job work items, found ${completedItems.length}.`);
    }
    if (checkpoint.expected.openWorkItemCount !== undefined && openItems.length !== checkpoint.expected.openWorkItemCount) {
      issues.push(`Expected ${checkpoint.expected.openWorkItemCount} open job work items, found ${openItems.length}.`);
    }
    if ((requiresJobInProgress || requiresJobReviewReady || requiresJobCompleted) && completedItems.some((item) => !item.completed_at || !item.completed_by)) {
      issues.push('Completed demo job work items must include completed_at and completed_by evidence.');
    }
    if (!requiresJobCompleted && job.completed_at) {
      issues.push(`Checkpoint ${checkpointKey} should not have a completed_at value.`);
    }
    if (requiresJobCompleted && !job.completed_at) {
      issues.push('Completed demo job checkpoint requires completed_at.');
    }
    if (job.closed_at) {
      issues.push('Demo job lifecycle checkpoints must not close the job.');
    }
    if (!requiresHomeHistory && (job.report_storage_path || job.report_file_name)) {
      issues.push('Demo job lifecycle checkpoints must not create or attach finalized report files.');
    }
    if (requiresHomeHistory && (!job.report_storage_path || !job.report_file_name || job.status !== 'finalized')) {
      issues.push('Home History checkpoint requires one finalized Job report path and file name.');
    }
  } else if (jobWorkItems.length > 0 || visitEvents.length > 0) {
    issues.push(`Checkpoint ${checkpointKey} should not have job work items or visit events.`);
  }

  if (requiresJobScheduled) {
    verifyExactVisitEventOwnership(issues, { registeredVisitEventIds: visitEventIds, visitEvents });
    const visitEvent = visitEvents[0] || null;
    if (
      visitEvent &&
      (visitEvent.inspection_id !== jobId ||
        visitEvent.service_request_id !== requestId ||
        visitEvent.homeowner_user_id !== homeownerUser?.id ||
        visitEvent.status !== checkpoint.expected.visitEventStatus ||
        visitEvent.share_with_homeowner !== false ||
        visitEvent.homeowner_response_status !== 'not_shared')
    ) {
      issues.push('Demo contractor visit event is not linked, private, or in the expected lifecycle status.');
    }
  } else {
    if (visitEventIds.length !== 0) {
      issues.push(`Checkpoint ${checkpointKey} should not have registered contractor visit events.`);
    }
    if (visitEvents.length !== 0) {
      issues.push(`Checkpoint ${checkpointKey} should not have contractor visit events.`);
    }
  }

  if (appointmentRows.length > 0) {
    issues.push('Demo job scheduling must not create homeowner appointment proposals.');
  }
  if (!flagshipInvoiceExpected && !requiresInvoice && scenarioInvoices.length !== 0) {
    issues.push(`Checkpoint ${checkpointKey} must not create Invoices, found ${scenarioInvoices.length}.`);
  }
  if (flagshipInvoiceExpected) {
    const registeredInvoiceIds = recordIds(records, 'invoices', 'demo_invoice');
    const registeredInvoiceLineIds = recordIds(records, 'invoice_line_items', 'demo_invoice_line_item');
    if (scenarioInvoices.length !== 1 || scenarioInvoices[0]?.id !== run.metadata.invoice_id || scenarioInvoices[0]?.status !== 'draft') {
      issues.push(`Flagship checkpoint expected one exact draft Invoice, found ${scenarioInvoices.length}.`);
    }
    if (registeredInvoiceIds.length !== 1 || registeredInvoiceIds[0] !== run.metadata.invoice_id) {
      issues.push('Flagship Invoice is not owned by one exact registry row.');
    }
    if (registeredInvoiceLineIds.length !== Number(run.metadata?.invoice_line_count || 0) || registeredInvoiceLineIds.length < 1) {
      issues.push('Flagship Invoice line ownership does not match the recorded canonical line count.');
    }
  }
  if (requiresInvoice) {
    const invoice = scenarioInvoices[0] || null;
    const registeredInvoiceLineIds = recordIds(records, 'invoice_line_items', 'demo_invoice_line_item');
    if (
      scenarioInvoices.length !== 1 ||
      invoice?.id !== invoiceId ||
      invoice?.contractor_id !== contractor?.id ||
      invoice?.homeowner_user_id !== homeownerUser?.id ||
      invoice?.home_id !== homeId ||
      invoice?.job_id !== jobId ||
      invoice?.estimate_id !== estimateId ||
      invoice?.service_request_id !== requestId ||
      invoice?.status !== checkpoint.expected.invoiceStatus ||
      invoice?.total_cents !== estimateFixture.subtotalCents + estimateFixture.taxCents ||
      invoice?.amount_paid_cents !== checkpoint.expected.invoiceAmountPaidCents
    ) {
      issues.push(`Invoice checkpoint ${checkpointKey} does not match its exact canonical lineage, status, total, or paid amount.`);
    }
    if (invoiceIds.length !== 1 || invoiceIds[0] !== invoiceId) {
      issues.push('Demo Invoice is not owned by one exact registry row.');
    }
    if (registeredInvoiceLineIds.length !== Number(run.metadata?.invoice_line_count || 0) || registeredInvoiceLineIds.length < 1) {
      issues.push('Demo Invoice line ownership does not match the recorded canonical line count.');
    }
    if (invoicePayments.length !== checkpoint.expected.invoicePaymentCount) {
      issues.push(`Invoice checkpoint ${checkpointKey} expected ${checkpoint.expected.invoicePaymentCount} payment rows, found ${invoicePayments.length}.`);
    }
    const actualPaymentIds = [...invoicePayments.map((payment) => payment.id)].sort();
    const registeredPaymentIds = [...invoicePaymentIds].sort();
    if (JSON.stringify(actualPaymentIds) !== JSON.stringify(registeredPaymentIds)) {
      issues.push('Demo Invoice immutable payment ledger IDs do not exactly match registry ownership.');
    }
    const paymentTotal = invoicePayments.reduce((total, payment) => total + Number(payment.amount_cents || 0), 0);
    if (paymentTotal !== checkpoint.expected.invoiceAmountPaidCents) {
      issues.push(`Invoice payment ledger totals ${paymentTotal}, expected ${checkpoint.expected.invoiceAmountPaidCents}.`);
    }
    if (requiresInvoiceSent && !invoice?.issued_at) issues.push('Sent or later Invoice checkpoint requires issued_at evidence.');
    if (requiresInvoiceViewed && !['viewed', 'partially_paid', 'paid'].includes(invoice?.status || '')) {
      issues.push('Viewed or later Invoice checkpoint lost the homeowner view transition.');
    }
    if (requiresInvoicePaid && !invoice?.paid_at) issues.push('Paid Invoice checkpoint requires paid_at evidence.');
  }
  if (!requiresHomeHistory && !requiresInvoiceHomeHistory && homeHistoryRows.length !== 0) {
    issues.push(`Checkpoint ${checkpointKey} must not file Home History rows, found ${homeHistoryRows.length}.`);
  }
  if (requiresHomeHistory) {
    const history = homeHistoryRows[0] || null;
    const document = reportDocuments[0] || null;
    const notification = reportNotifications[0] || null;
    if (
      homeHistoryRows.length !== 1 ||
      history?.id !== homeHistoryId ||
      history?.home_id !== homeId ||
      history?.inspection_id !== jobId ||
      history?.service_request_id !== requestId
    ) {
      issues.push(`Home History checkpoint expected one exact maintenance row, found ${homeHistoryRows.length}.`);
    }
    if (
      reportDocuments.length !== 1 ||
      document?.id !== reportDocumentId ||
      document?.homeowner_user_id !== homeownerUser?.id ||
      document?.home_id !== homeId ||
      document?.storage_path !== job?.report_storage_path ||
      document?.content_type !== 'application/pdf' ||
      document?.document_type !== 'inspection'
    ) {
      issues.push(`Home History checkpoint expected one exact finalized-report document, found ${reportDocuments.length}.`);
    }
    if (
      reportNotifications.length !== 1 ||
      notification?.id !== reportNotificationId ||
      notification?.user_id !== homeownerUser?.id ||
      notification?.type !== 'inspection_report_filed' ||
      notification?.request_id !== requestId
    ) {
      issues.push(`Home History checkpoint expected one exact finalized-report notification, found ${reportNotifications.length}.`);
    }
    if (history?.report_document_id !== reportDocumentId) {
      issues.push('Home History row does not link to the exact registered finalized-report document.');
    }
    const documentRecord = records.find(
      (record) => record.table_name === 'home_documents' && record.record_role === FINALIZED_REPORT_RECORD_ROLES.document
    );
    try {
      if (document && documentRecord) {
        const storage = validateFinalizedReportStoragePath(document.storage_path, homeownerUser?.id, jobId);
        if (
          documentRecord.metadata?.storage_bucket !== storage.bucket ||
          documentRecord.metadata?.storage_path !== storage.path
        ) {
          issues.push('Finalized-report registry metadata does not match the canonical Storage object identity.');
        } else {
          const objects = await exactStorageObject(service, storage);
          if (objects.length !== 1) {
            issues.push(`Home History checkpoint expected one exact private Storage object, found ${objects.length}.`);
          } else {
            const downloaded = await ensureOk(
              await service.storage.from(storage.bucket).download(storage.path),
              'Unable to read the Demo finalized-report Storage object'
            );
            const sha256 = createHash('sha256').update(Buffer.from(await downloaded.arrayBuffer())).digest('hex');
            if (sha256 !== documentRecord.metadata?.storage_sha256) {
              issues.push('Finalized-report Storage SHA-256 does not match registered ownership evidence.');
            }
          }
        }
      }
    } catch (error) {
      issues.push(error.message);
    }
  }
  if (requiresInvoiceHomeHistory) {
    const history = homeHistoryRows[0] || null;
    const reminder = invoiceReminders[0] || null;
    if (
      homeHistoryRows.length !== 1 ||
      history?.id !== invoiceHomeHistoryId ||
      history?.homeowner_user_id !== homeownerUser?.id ||
      history?.home_id !== homeId ||
      history?.invoice_id !== invoiceId ||
      history?.inspection_id !== null ||
      history?.report_document_id !== null
    ) {
      issues.push('Paid Invoice Home History checkpoint does not have one exact structured Invoice record.');
    }
    if (
      invoiceReminders.length !== 1 ||
      reminder?.id !== invoiceReminderId ||
      reminder?.homeowner_user_id !== homeownerUser?.id ||
      reminder?.home_id !== homeId ||
      reminder?.maintenance_log_id !== invoiceHomeHistoryId ||
      reminder?.service_request_id !== requestId ||
      reminder?.invoice_id !== invoiceId ||
      reminder?.status !== 'open'
    ) {
      issues.push('Paid Invoice Home History checkpoint does not have one exact linked open Home Reminder.');
    }
  } else if (invoiceReminders.length !== 0) {
    issues.push(`Checkpoint ${checkpointKey} must not create Invoice-linked Home Reminders.`);
  }

  const requestEstimates = requestId
    ? await ensureOk(
        await service.from('estimates').select('id').eq('service_request_id', requestId),
        'Unable to inspect duplicate demo estimates for request'
      )
    : [];
  if (requiresEstimate && requestEstimates.length !== 1) {
    issues.push(`Expected exactly one estimate linked to the demo request, found ${requestEstimates.length}.`);
  }
  if (!requiresEstimate && requestEstimates.length !== 0) {
    issues.push(`Checkpoint ${checkpointKey} should not have estimates linked to the demo request, found ${requestEstimates.length}.`);
  }

  if (run.anchor_timestamp && connection && request) {
    assertOrderedTimestamps(issues, 'Connection before request', connection.created_at, request.created_at);
  }
  if (run.anchor_timestamp && request && estimate) {
    assertOrderedTimestamps(issues, 'Request before estimate creation', request.created_at, estimate.created_at);
  }
  if (run.anchor_timestamp && estimate && requiresSent) {
    assertOrderedTimestamps(issues, 'Estimate creation before sent evidence', estimate.created_at, estimate.updated_at);
  }
  if (requiresAccepted && estimate) {
    verifyEstimateApprovalWorkflowEvent(issues, { estimate, events: workflowEvents });
  }
  let acceptedEstimateWorkflowEvidence = null;
  if (requiresJob && estimate && job) {
    acceptedEstimateWorkflowEvidence = verifyAcceptedEstimateWorkflowEvents(issues, { estimate, job, events: workflowEvents });
  }
  if (!requiresAccepted) {
    const approvalEvents = filterScenarioWorkflowEvents(workflowEvents, {
      eventType: WORKFLOW_EVENT_TYPES.estimateApproved,
      estimateId,
      inspectionId: null,
      sourceRpc: WORKFLOW_EVENT_SOURCES.estimateResponse,
    });
    if (approvalEvents.length > 0) {
      issues.push(`Checkpoint ${checkpointKey} should not have estimate approval workflow events.`);
    }
  }
  if (!requiresJob) {
    const jobEvents = filterScenarioWorkflowEvents(workflowEvents, {
      eventType: WORKFLOW_EVENT_TYPES.jobCreated,
      estimateId,
      sourceRpc: WORKFLOW_EVENT_SOURCES.jobFromEstimate,
    });
    if (jobEvents.length > 0) {
      issues.push(`Checkpoint ${checkpointKey} should not have job-created workflow events.`);
    }
  }
  const jobCompletedEvents = findForbiddenJobCompletedEvents(workflowEvents, jobId);
  if (jobCompletedEvents.length > 0) {
    issues.push('Demo Slice 2B must not fabricate job_completed workflow events.');
  }
  if (requiresJobScheduled && job && visitEvents[0]) {
    verifyScheduledVisitTimestampOrdering(issues, {
      job,
      visitEvent: visitEvents[0],
      jobCreatedEvent: acceptedEstimateWorkflowEvidence?.jobCreatedEvent,
    });
  }
  if (requiresJobCompleted && job && visitEvents[0]) {
    assertOrderedTimestamps(issues, 'Scheduled visit before job completion', visitEvents[0].scheduled_at, job.completed_at);
  }

  return {
    ok: issues.length === 0,
    reason: issues[0] || null,
    issues,
    runId: run.id,
    checkpoint: checkpointKey,
    counts,
    categories: {
      runs: {
        activeSucceededRuns: succeededRunsWithRecords.length,
        unresolvedRuns: unresolvedRuns.length,
        zeroRecordRuns: zeroRecordRuns.length,
        activeCheckpoint: checkpointKey,
      },
      auth: {
        homeownerUserId: homeownerUser?.id || null,
        contractorUserId: contractorUser?.id || null,
        distinctUsers: Boolean(homeownerUser && contractorUser && homeownerUser.id !== contractorUser.id),
      },
      profiles: {
        homeownerProfile: Boolean(homeownerProfile && homeownerDetails),
        contractorProfile: Boolean(contractor),
      },
      workflow: {
        homeId,
        connectionId,
        requestId,
        estimateId,
        jobId,
        visitEventId: visitEvents[0]?.id || null,
        estimateStatus: estimate?.status || null,
        jobStatus: job?.job_status || null,
        completedWorkItems: jobWorkItems.filter((item) => item.completion_status === 'completed').length,
        openWorkItems: jobWorkItems.filter((item) => item.completion_status === 'open').length,
        invoices: scenarioInvoices.length,
        invoiceId,
        invoiceStatus: scenarioInvoices[0]?.status || null,
        invoicePayments: invoicePayments.length,
        invoiceAmountPaidCents: scenarioInvoices[0]?.amount_paid_cents || 0,
        homeHistoryRows: homeHistoryRows.length,
        invoiceHomeReminders: invoiceReminders.length,
        reportDocuments: reportDocuments.length,
        reportNotifications: reportNotifications.length,
      },
      propertyAssetBridge: verifiedPropertyGraph
        ? {
            homeId: verifiedPropertyGraph.home.id,
            roomId: verifiedPropertyGraph.room.id,
            assetId: verifiedPropertyGraph.asset.id,
            revisionNumber: verifiedPropertyGraph.asset.revision_number,
            revisionCount: verifiedPropertyGraph.revisions.length,
          }
        : null,
      registry: {
        tables: counts,
        recordsChecked: records.length,
      },
      notifications: requiresHomeHistory
        ? 'Exactly one recorder-owned inspection_report_filed notification is registered and reset with the finalized report.'
        : notificationHandlingDecision(),
    },
  };
}

async function seedScenario(env, target, scenarioKey, checkpointKey = DEFAULT_CHECKPOINT_KEY) {
  if (checkpointKey === 'home_history_updated') {
    throw new Error(
      'Home History seeding refused: canonical report bytes must be generated by the normal contractor UI. Use the homeowner-home-history recorder workflow.'
    );
  }
  const checkpoint = getCheckpointDefinition(checkpointKey);
  const dates = buildDatePlan(env.DEMO_ANCHOR_TIMESTAMP || new Date());
  const { service, anonKey, makeUserClient } = createSupabaseClients(env, target);

  const previousReset = await resetNonResetRuns(service, scenarioKey, 'pre-seed-reconciliation');
  let runId = null;

  try {
    const homeownerEmail = env.DEMO_HOMEOWNER_EMAIL || DEMO_HOMEOWNER.defaultEmail;
    const contractorEmail = env.DEMO_CONTRACTOR_EMAIL || DEMO_CONTRACTOR.defaultEmail;
    const homeownerPassword = requireEnv(env, 'DEMO_HOMEOWNER_PASSWORD');
    const contractorPassword = requireEnv(env, 'DEMO_CONTRACTOR_PASSWORD');

    const homeownerUser = await ensureAuthUser(service, homeownerEmail, homeownerPassword, scenarioKey, 'homeowner');
    const contractorUser = await ensureAuthUser(service, contractorEmail, contractorPassword, scenarioKey, 'contractor_owner');
    assertDistinctDemoIdentities(homeownerEmail, contractorEmail, homeownerUser, contractorUser);
    const homeownerClient = await signInDemoUser(makeUserClient, homeownerEmail, homeownerPassword);
    const contractorClient = await signInDemoUser(makeUserClient, contractorEmail, contractorPassword);

    const { contractorId } = await upsertProfileRecords(service, runId, homeownerUser, contractorUser, dates, env);
    const retainedPropertyGraph = await loadCanonicalPropertyGraph(service, homeownerUser.id);
    await assertNoLikelyUnregisteredScenarioRecords(service, {
      homeownerId: homeownerUser.id,
      contractorId,
      retainedPropertyGraph,
    });

    runId = await startRun(service, scenarioKey, 'seed', target, dates, checkpointKey, {
      homeowner_user_id: homeownerUser.id,
      contractor_user_id: contractorUser.id,
      contractor_id: contractorId,
    });
    const created = {
      contractorId,
      homeId: null,
      connectionId: null,
      requestId: null,
      estimateId: null,
      jobId: null,
      visitEventId: null,
      estimateTotalCents: null,
      jobWorkItemCount: 0,
      completedWorkItemCount: 0,
      openWorkItemCount: 0,
      approvalEventCount: 0,
      reportDocumentId: null,
      homeHistoryId: null,
      notificationId: null,
      reportStorageBucket: null,
      reportStoragePath: null,
      reportStorageSha256: null,
      reportFileName: null,
      reportFileSizeBytes: null,
      invoiceId: null,
      invoiceLineCount: 0,
      invoiceTotalCents: 0,
      invoicePaymentIds: [],
      invoiceHomeHistoryId: null,
      invoiceReminderId: null,
    };
    const executedSteps = ['identities', 'profilesAndCompany'];

    if (checkpointRequires(checkpointKey, 'property')) {
      const { homeId } = await createProperty(service, homeownerClient, runId, homeownerUser.id, dates, retainedPropertyGraph);
      created.homeId = homeId;
      executedSteps.push('property');
    }

    if (checkpointRequires(checkpointKey, 'contractorDiscovery')) {
      executedSteps.push('contractorDiscovery');
    }

    if (checkpointRequires(checkpointKey, 'connection')) {
      const { connectionId } = await createConnection(service, runId, homeownerUser.id, contractorId, dates);
      created.connectionId = connectionId;
      executedSteps.push('connection');
    }

    if (checkpointRequires(checkpointKey, 'request')) {
      const { requestId } = await createServiceRequest(homeownerClient, service, runId, created.connectionId, created.homeId, dates);
      created.requestId = requestId;
      executedSteps.push('request');
    }

    if (checkpointRequires(checkpointKey, 'contractorReview')) {
      executedSteps.push('contractorReview');
    }

    if (checkpointRequires(checkpointKey, 'estimateDraft')) {
      const { estimateId, totalCents } = await createEstimateDraft(
        contractorClient,
        service,
        runId,
        contractorId,
        homeownerUser.id,
        created.homeId,
        created.requestId,
        dates
      );
      created.estimateId = estimateId;
      created.estimateTotalCents = totalCents;
      executedSteps.push('estimateDraft');
    }

    if (checkpointRequires(checkpointKey, 'estimateSent')) {
      await sendEstimate(contractorClient, service, created.estimateId, dates);
      executedSteps.push('estimateSent');
    }

    if (checkpointRequires(checkpointKey, 'estimateAccepted')) {
      const { approvalEventCount } = await acceptEstimate(homeownerClient, service, runId, created.estimateId, dates);
      created.approvalEventCount = approvalEventCount;
      executedSteps.push('estimateAccepted');
    }

    if (checkpointRequires(checkpointKey, 'jobCreated')) {
      const { jobId, workItemCount } = await createJobFromEstimate(contractorClient, service, runId, created.estimateId, dates);
      created.jobId = jobId;
      created.jobWorkItemCount = workItemCount;
      created.openWorkItemCount = workItemCount;
      executedSteps.push('jobCreated');
    }

    if (checkpointRequires(checkpointKey, 'jobScheduled')) {
      const { visitEventId } = await scheduleJobVisit(contractorClient, service, runId, created.jobId, dates);
      created.visitEventId = visitEventId;
      executedSteps.push('jobScheduled');
    }

    if (checkpointRequires(checkpointKey, 'jobInProgress')) {
      const progress = await advanceJobInProgress(service, created.jobId, contractorUser.id, dates);
      created.completedWorkItemCount = progress.completedCount;
      created.openWorkItemCount = progress.openCount;
      executedSteps.push('jobInProgress');
    }

    if (checkpointRequires(checkpointKey, 'jobReviewReady')) {
      const progress = await advanceJobReviewReady(service, created.jobId, contractorUser.id, dates);
      created.completedWorkItemCount = progress.completedCount;
      created.openWorkItemCount = progress.openCount;
      executedSteps.push('jobReviewReady');
    }

    if (checkpointRequires(checkpointKey, 'jobCompleted')) {
      const progress = await completeDemoJob(contractorClient, service, created.jobId, contractorUser.id, dates);
      created.completedWorkItemCount = progress.completedCount;
      created.openWorkItemCount = progress.openCount;
      executedSteps.push('jobCompleted');
    }

    if (checkpointRequires(checkpointKey, 'invoiceDraft')) {
      const invoice = await createDemoInvoiceDraft(contractorClient, service, runId, created.jobId, dates);
      created.invoiceId = invoice.invoiceId;
      created.invoiceLineCount = invoice.invoiceLineCount;
      created.invoiceTotalCents = invoice.invoiceTotalCents;
      executedSteps.push('invoiceDraft');
      maybeInterruptDemoQa(env, 'invoiceDraft');
    }

    if (checkpointRequires(checkpointKey, 'invoiceSent')) {
      await sendDemoInvoice(contractorClient, created.invoiceId);
      executedSteps.push('invoiceSent');
    }

    if (checkpointRequires(checkpointKey, 'invoiceViewed')) {
      await viewDemoInvoice(homeownerClient, created.invoiceId);
      executedSteps.push('invoiceViewed');
    }

    if (checkpointRequires(checkpointKey, 'invoicePartiallyPaid')) {
      const paymentId = await recordDemoOfflinePayment(
        contractorClient,
        service,
        runId,
        created.invoiceId,
        40000,
        dates,
        'demo_invoice_partial_payment'
      );
      created.invoicePaymentIds.push(paymentId);
      executedSteps.push('invoicePartiallyPaid');
    }

    if (checkpointRequires(checkpointKey, 'invoicePaid')) {
      const paymentId = await recordDemoOfflinePayment(
        contractorClient,
        service,
        runId,
        created.invoiceId,
        created.invoiceTotalCents - 40000,
        dates,
        'demo_invoice_final_payment'
      );
      created.invoicePaymentIds.push(paymentId);
      executedSteps.push('invoicePaid');
    }

    if (checkpointRequires(checkpointKey, 'invoiceHomeHistoryUpdated')) {
      const filed = await fileDemoInvoiceAndCreateReminder(
        homeownerClient,
        service,
        runId,
        created.invoiceId,
        homeownerUser.id,
        created.homeId,
        created.requestId,
        dates
      );
      created.invoiceHomeHistoryId = filed.homeHistoryId;
      created.invoiceReminderId = filed.reminderId;
      executedSteps.push('invoiceHomeHistoryUpdated');
    }

    await finishRun(service, runId, 'succeeded', {
      selected_checkpoint: checkpointKey,
      checkpoint_display_name: checkpoint.displayName,
      executed_steps: executedSteps,
      expected_checkpoint_graph: checkpoint.expected,
      homeowner_user_id: homeownerUser.id,
      contractor_user_id: contractorUser.id,
      contractor_id: contractorId,
      home_id: created.homeId,
      connection_id: created.connectionId,
      service_request_id: created.requestId,
      estimate_id: created.estimateId,
      job_id: created.jobId,
      visit_event_id: created.visitEventId,
      estimate_total_cents: created.estimateTotalCents,
      estimate_approval_events_created: created.approvalEventCount,
      job_work_items_created: created.jobWorkItemCount,
      job_work_items_completed: created.completedWorkItemCount,
      job_work_items_open: created.openWorkItemCount,
      report_document_id: created.reportDocumentId,
      home_history_id: created.homeHistoryId,
      report_notification_id: created.notificationId,
      report_storage_bucket: created.reportStorageBucket,
      report_storage_path: created.reportStoragePath,
      report_storage_sha256: created.reportStorageSha256,
      report_file_name: created.reportFileName,
      report_file_size_bytes: created.reportFileSizeBytes,
      invoice_id: created.invoiceId,
      invoice_line_count: created.invoiceLineCount,
      invoice_total_cents: created.invoiceTotalCents,
      invoice_payment_ids: created.invoicePaymentIds,
      invoice_home_history_id: created.invoiceHomeHistoryId,
      invoice_reminder_id: created.invoiceReminderId,
    });

    const verification = await verifyScenario(service, scenarioKey, env, checkpointKey);
    if (!verification.ok) {
      await finishRun(service, runId, 'failed', { verification_issues: verification.issues }).catch(() => {});
      throw new Error(`Demo seed verification failed: ${verification.reason || 'incomplete scenario state'}`);
    }

    return {
      operation: 'seed',
      runId,
      previousReset,
      demoUsers: {
        homeownerEmail,
        contractorEmail,
        homeownerUserId: homeownerUser.id,
        contractorUserId: contractorUser.id,
      },
      records: {
        contractorId,
        homeId: created.homeId,
        connectionId: created.connectionId,
        requestId: created.requestId,
        estimateId: created.estimateId,
        jobId: created.jobId,
        visitEventId: created.visitEventId,
        invoiceId: created.invoiceId,
        invoicePaymentIds: created.invoicePaymentIds,
        invoiceHomeHistoryId: created.invoiceHomeHistoryId,
        invoiceReminderId: created.invoiceReminderId,
        workItemCount: created.jobWorkItemCount,
        completedWorkItemCount: created.completedWorkItemCount,
        openWorkItemCount: created.openWorkItemCount,
      },
      checkpoint: checkpointKey,
      verification,
      externalEffects: checkpointRequires(checkpointKey, 'homeHistoryUpdated')
        ? 'One authenticated private Demo PDF upload and one in-app notification were created by servsync_finalize_field_work. No email, SMS, push, Stripe, webhook, accounting, AI, geocoding, or deployment call was made.'
        : `No email, SMS, push, Stripe, webhook, accounting, AI, geocoding, storage, or deployment calls were made by this runner. ${notificationHandlingDecision()}`,
      anonKeyUsed: Boolean(anonKey),
    };
  } catch (error) {
    if (runId) {
      await finishRun(service, runId, 'failed', { error: error.message }).catch(() => {});
    }
    throw error;
  }
}

async function resetScenario(env, target, scenarioKey) {
  const dates = buildDatePlan(env.DEMO_ANCHOR_TIMESTAMP || new Date());
  const { service } = createSupabaseClients(env, target);
  const resetRunId = await startRun(service, scenarioKey, 'reset', target, dates, DEFAULT_CHECKPOINT_KEY);
  try {
    const resetResult = await resetNonResetRuns(service, scenarioKey, 'explicit-reset');
    await finishRun(service, resetRunId, 'succeeded', {
      considered_runs: resetResult.considered.map(({ runId, previousStatus, registeredRecords, action }) => ({
        runId,
        previousStatus,
        registeredRecords,
        action,
      })),
      removed_count: resetResult.removed.length,
      retained_property_graphs: resetResult.considered
        .map((item) => item.retainedPropertyGraph)
        .filter(Boolean),
    });
    return {
      operation: 'reset',
      runId: null,
      resetRunId,
      removed: resetResult.removed,
      retainedPropertyGraphs: resetResult.considered.map((item) => item.retainedPropertyGraph).filter(Boolean),
      considered: resetResult.considered,
    };
  } catch (error) {
    await finishRun(service, resetRunId, 'failed', { error: error.message }).catch(() => {});
    throw error;
  }
}

async function verifyDemoScenario(env, target, scenarioKey, checkpointKey = null) {
  const { service } = createSupabaseClients(env, target);
  const verification = await verifyScenario(service, scenarioKey, env, checkpointKey);
  if (!verification.ok) {
    throw new Error(`Demo verification failed: ${verification.reason || 'scenario state is incomplete'}`);
  }
  return { operation: 'verify', verification };
}

async function adoptRecorderServiceRequest(env, target, scenarioKey) {
  const { service } = createSupabaseClients(env, target);
  const runs = await inspectNonResetRuns(service, scenarioKey);
  const activeRuns = runs.filter((run) => run.status === 'succeeded' && run.recordCount > 0);

  if (activeRuns.length !== 1) {
    throw new Error(`Recorder adoption refused: expected one active succeeded scenario run, found ${activeRuns.length}.`);
  }

  const run = activeRuns[0];
  if (run.checkpoint !== 'connected_request_ready') {
    throw new Error(`Recorder adoption refused: active checkpoint must be connected_request_ready, found ${run.checkpoint}.`);
  }

  const homeownerId = run.metadata?.homeowner_user_id;
  const contractorId = run.metadata?.contractor_id;
  const homeId =
    run.metadata?.home_id ||
    run.records.find((record) => record.table_name === 'homes' && record.record_role === 'demo_home')?.record_id;
  const connectionId =
    run.metadata?.connection_id ||
    run.records.find(
      (record) => record.table_name === 'homeowner_contractor_connections' && record.record_role === 'demo_connection'
    )?.record_id;
  if (![homeownerId, contractorId, homeId, connectionId].every(Boolean)) {
    throw new Error('Recorder adoption refused: active run is missing exact homeowner, contractor, home, or connection identity.');
  }

  const existingRegisteredRequestIds = new Set(
    run.records.filter((record) => record.table_name === 'service_requests').map((record) => record.record_id)
  );
  if (existingRegisteredRequestIds.size > 0) {
    throw new Error('Recorder adoption refused: connected_request_ready already owns a service request.');
  }

  const candidates = await ensureOk(
    await service
      .from('service_requests')
      .select('id,created_at,connection_id,home_id,homeowner_user_id,contractor_id,category,urgency,title,description')
      .eq('homeowner_user_id', homeownerId)
      .eq('contractor_id', contractorId)
      .eq('connection_id', connectionId)
      .eq('home_id', homeId)
      .eq('category', requestFixture.category)
      .eq('urgency', requestFixture.urgency)
      .eq('title', requestFixture.title)
      .eq('description', requestFixture.description)
      .gt('created_at', run.completed_at)
      .order('created_at', { ascending: false }),
    'Unable to inspect the recorder-created service request'
  );

  if (candidates.length !== 1) {
    throw new Error(`Recorder adoption refused: expected exactly one new matching service request, found ${candidates.length}.`);
  }

  const request = candidates[0];
  const linkedEstimates = await ensureOk(
    await service.from('estimates').select('id').eq('service_request_id', request.id),
    'Unable to inspect recorder request Estimate lineage'
  );
  const linkedJobs = await ensureOk(
    await service.from('inspections').select('id').eq('service_request_id', request.id),
    'Unable to inspect recorder request Job lineage'
  );
  if (linkedEstimates.length > 0 || linkedJobs.length > 0) {
    throw new Error('Recorder adoption refused: the new request already has downstream Estimate or Job records.');
  }

  await registerRecord(service, run.id, 'service_requests', request.id, 'demo_service_request', 'request_ready', {
    source: 'servsync_demo_recorder',
  });
  const messages = await ensureOk(
    await service.from('service_request_messages').select('id').eq('request_id', request.id),
    'Unable to inspect recorder request messages'
  );
  for (const message of messages) {
    await registerRecord(service, run.id, 'service_request_messages', message.id, 'demo_request_message', 'request_ready', {
      source: 'servsync_demo_recorder',
    });
  }

  await ensureOk(
    await service.from('demo_scenario_runs').update({ checkpoint: 'request_ready' }).eq('id', run.id),
    'Unable to advance the recorder scenario checkpoint'
  );
  await finishRun(service, run.id, 'succeeded', {
    selected_checkpoint: 'request_ready',
    executed_steps: ['identities', 'profilesAndCompany', 'property', 'connection', 'request'],
    homeowner_user_id: homeownerId,
    contractor_id: contractorId,
    home_id: homeId,
    connection_id: connectionId,
    service_request_id: request.id,
    recorder_adopted_at: new Date().toISOString(),
    recorder_source: 'servsync_demo_recorder',
  });

  const verification = await verifyScenario(service, scenarioKey, env, 'request_ready');
  if (!verification.ok) {
    throw new Error(`Recorder adoption verification failed: ${verification.reason || 'request_ready state is invalid'}`);
  }

  return {
    operation: 'adopt-request',
    runId: run.id,
    checkpoint: 'request_ready',
    records: { requestId: request.id, messageCount: messages.length },
    verification,
  };
}

async function adoptRecorderEstimateDraft(env, target, scenarioKey) {
  const { service } = createSupabaseClients(env, target);
  const runs = await inspectNonResetRuns(service, scenarioKey);
  const activeRuns = runs.filter((run) => run.status === 'succeeded' && run.recordCount > 0);

  if (activeRuns.length !== 1) {
    throw new Error(`Recorder Estimate adoption refused: expected one active succeeded scenario run, found ${activeRuns.length}.`);
  }

  const run = activeRuns[0];
  if (run.checkpoint !== 'request_ready') {
    throw new Error(`Recorder Estimate adoption refused: active checkpoint must be request_ready, found ${run.checkpoint}.`);
  }

  const homeownerId = run.metadata?.homeowner_user_id;
  const contractorId = run.metadata?.contractor_id;
  const homeId = run.metadata?.home_id;
  const requestId = run.metadata?.service_request_id;
  if (![homeownerId, contractorId, homeId, requestId].every(Boolean)) {
    throw new Error('Recorder Estimate adoption refused: active run is missing exact homeowner, contractor, home, or request identity.');
  }
  if (run.records.some((record) => record.table_name === 'estimates')) {
    throw new Error('Recorder Estimate adoption refused: request_ready already owns an Estimate.');
  }

  const candidates = await ensureOk(
    await service
      .from('estimates')
      .select('id,created_at,updated_at,contractor_id,homeowner_user_id,home_id,service_request_id,inspection_id,title,scope,status,subtotal_cents,total_cents')
      .eq('contractor_id', contractorId)
      .eq('homeowner_user_id', homeownerId)
      .eq('home_id', homeId)
      .eq('service_request_id', requestId)
      .is('inspection_id', null)
      .eq('title', recorderEstimateFixture.title)
      .eq('scope', recorderEstimateFixture.scope)
      .eq('status', 'draft')
      .eq('subtotal_cents', recorderEstimateFixture.line.unit_price_cents)
      .eq('total_cents', recorderEstimateFixture.line.unit_price_cents)
      .gt('created_at', run.completed_at)
      .order('created_at', { ascending: false }),
    'Unable to inspect the recorder-created Estimate draft'
  );
  if (candidates.length !== 1) {
    throw new Error(`Recorder Estimate adoption refused: expected exactly one new matching Estimate draft, found ${candidates.length}.`);
  }

  const estimate = candidates[0];
  const lineItems = await ensureOk(
    await service
      .from('estimate_line_items')
      .select('id,estimate_id,line_type,line_title,description,quantity,unit,unit_price_cents,sort_order')
      .eq('estimate_id', estimate.id)
      .order('sort_order', { ascending: true }),
    'Unable to inspect recorder Estimate lines'
  );
  const line = lineItems[0] || null;
  if (
    lineItems.length !== 1
    || !line
    || line.line_type !== recorderEstimateFixture.line.line_type
    || line.line_title !== recorderEstimateFixture.line.line_title
    || line.description !== recorderEstimateFixture.line.line_title
    || Number(line.quantity) !== recorderEstimateFixture.line.quantity
    || line.unit !== recorderEstimateFixture.line.unit
    || line.unit_price_cents !== recorderEstimateFixture.line.unit_price_cents
  ) {
    throw new Error('Recorder Estimate adoption refused: saved line items do not match the exact scenario contract.');
  }

  const scheduleItems = await ensureOk(
    await service.from('estimate_payment_schedule_items').select('id').eq('estimate_id', estimate.id),
    'Unable to inspect recorder Estimate payment schedule'
  );
  const linkedJobs = await ensureOk(
    await service.from('inspections').select('id').eq('estimate_id', estimate.id),
    'Unable to inspect recorder Estimate Job lineage'
  );
  const linkedInvoices = await ensureOk(
    await service.from('invoices').select('id').eq('estimate_id', estimate.id),
    'Unable to inspect recorder Estimate Invoice lineage'
  );
  if (scheduleItems.length > 0 || linkedJobs.length > 0 || linkedInvoices.length > 0) {
    throw new Error('Recorder Estimate adoption refused: the new draft has payment-schedule, Job, or Invoice records.');
  }

  await registerRecord(service, run.id, 'estimates', estimate.id, 'demo_estimate', 'estimate_draft', {
    source: 'servsync_demo_recorder',
  });
  await registerRecord(service, run.id, 'estimate_line_items', line.id, 'demo_estimate_line_item', 'estimate_draft', {
    source: 'servsync_demo_recorder',
  });
  await ensureOk(
    await service.from('demo_scenario_runs').update({ checkpoint: 'estimate_draft' }).eq('id', run.id),
    'Unable to advance the recorder scenario to estimate_draft'
  );
  await finishRun(service, run.id, 'succeeded', {
    selected_checkpoint: 'estimate_draft',
    executed_steps: ['identities', 'profilesAndCompany', 'property', 'connection', 'request', 'estimateDraft'],
    homeowner_user_id: homeownerId,
    contractor_id: contractorId,
    home_id: homeId,
    connection_id: run.metadata?.connection_id,
    service_request_id: requestId,
    estimate_id: estimate.id,
    recorder_adopted_at: new Date().toISOString(),
    recorder_source: 'servsync_demo_recorder',
    recorder_scenario: 'contractor-create-estimate',
  });

  const verification = await verifyScenario(service, scenarioKey, env, 'estimate_draft');
  if (!verification.ok) {
    throw new Error(`Recorder Estimate adoption verification failed: ${verification.reason || 'estimate_draft state is invalid'}`);
  }

  return {
    operation: 'adopt-estimate',
    runId: run.id,
    checkpoint: 'estimate_draft',
    records: { estimateId: estimate.id, lineItemCount: lineItems.length, paymentScheduleCount: scheduleItems.length },
    verification,
  };
}

async function adoptRecorderJobFromAcceptedEstimate(env, target, scenarioKey) {
  const { service, makeUserClient } = createSupabaseClients(env, target);
  const runs = await inspectNonResetRuns(service, scenarioKey);
  const activeRuns = runs.filter((run) => run.status === 'succeeded' && run.recordCount > 0);
  if (activeRuns.length !== 1) {
    throw new Error(`Recorder Job adoption refused: expected one active succeeded scenario run, found ${activeRuns.length}.`);
  }

  const run = activeRuns[0];
  if (run.checkpoint !== 'estimate_accepted') {
    throw new Error(`Recorder Job adoption refused: active checkpoint must be estimate_accepted, found ${run.checkpoint}.`);
  }
  const homeownerId = run.metadata?.homeowner_user_id;
  const contractorId = run.metadata?.contractor_id;
  const homeId = run.metadata?.home_id;
  const requestId = run.metadata?.service_request_id;
  const estimateId = run.metadata?.estimate_id;
  if (![homeownerId, contractorId, homeId, requestId, estimateId].every(Boolean)) {
    throw new Error('Recorder Job adoption refused: active run is missing exact homeowner, contractor, home, request, or Estimate identity.');
  }
  if (run.records.some((record) => record.table_name === 'inspections')) {
    throw new Error('Recorder Job adoption refused: estimate_accepted already owns a Job.');
  }

  const candidates = await ensureOk(
    await service
      .from('inspections')
      .select('id,name,contractor_id,homeowner_user_id,home_id,service_request_id,estimate_id,status,job_status,created_at,completed_at,closed_at,report_storage_path,report_file_name')
      .eq('contractor_id', contractorId)
      .eq('homeowner_user_id', homeownerId)
      .eq('home_id', homeId)
      .eq('service_request_id', requestId)
      .eq('estimate_id', estimateId)
      .eq('name', estimateFixture.title)
      .eq('status', 'draft')
      .eq('job_status', 'draft')
      .gt('created_at', run.completed_at)
      .order('created_at', { ascending: false }),
    'Unable to inspect the recorder-created Job'
  );
  if (candidates.length !== 1) {
    throw new Error(`Recorder Job adoption refused: expected exactly one new matching Job, found ${candidates.length}.`);
  }
  const job = candidates[0];
  if (job.completed_at || job.closed_at || job.report_storage_path || job.report_file_name) {
    throw new Error('Recorder Job adoption refused: the new Job is already completed, closed, or report-bearing.');
  }

  const estimate = await fetchOneByPrimaryKey(service, 'estimates', 'id', estimateId, 'id,status,inspection_id');
  if (estimate?.status !== 'accepted' || estimate.inspection_id !== job.id) {
    throw new Error('Recorder Job adoption refused: the accepted Estimate does not point to the exact new Job.');
  }
  const registeredEstimateLineIds = new Set(
    run.records
      .filter((record) => record.table_name === 'estimate_line_items' && record.record_role === 'demo_estimate_line_item')
      .map((record) => record.record_id)
  );
  const workItems = await fetchJobWorkItems(service, job.id);
  if (
    workItems.length !== estimateLines().length
    || registeredEstimateLineIds.size !== estimateLines().length
    || workItems.some((item) => !registeredEstimateLineIds.has(item.source_estimate_line_item_id))
    || workItems.some((item) => item.completion_status !== 'open' || item.completed_at || item.completed_by)
  ) {
    throw new Error('Recorder Job adoption refused: estimate-derived work items do not match the exact accepted Estimate contract.');
  }
  const jobEvents = await ensureOk(
    await service
      .from('workflow_activity_events')
      .select('id,event_type,inspection_id,estimate_id,created_at')
      .eq('inspection_id', job.id),
    'Unable to inspect recorder Job workflow events'
  );
  if (
    jobEvents.length !== 1
    || jobEvents[0].event_type !== WORKFLOW_EVENT_TYPES.jobCreated
    || jobEvents[0].estimate_id !== estimateId
  ) {
    throw new Error('Recorder Job adoption refused: expected one exact job_created workflow event.');
  }
  const [visitEvents, invoices, historyRows] = await Promise.all([
    ensureOk(await service.from('contractor_visit_events').select('id').eq('inspection_id', job.id), 'Unable to inspect recorder Job visits'),
    ensureOk(await service.from('invoices').select('id').eq('job_id', job.id), 'Unable to inspect recorder Job Invoices'),
    ensureOk(await service.from('home_maintenance_log').select('id').eq('inspection_id', job.id), 'Unable to inspect recorder Job Home History'),
  ]);
  if (visitEvents.length || invoices.length || historyRows.length) {
    throw new Error('Recorder Job adoption refused: the new Job already has visit, Invoice, or Home History descendants.');
  }

  const dates = buildDatePlan(env.DEMO_ANCHOR_TIMESTAMP || new Date());
  await ensureOk(
    await service.from('inspections').update({ created_at: dates.jobCreatedAt, updated_at: dates.jobCreatedAt }).eq('id', job.id),
    'Unable to normalize recorder Job creation date'
  );
  await ensureOk(
    await service.from('workflow_activity_events').update({ created_at: dates.jobCreatedAt }).eq('id', jobEvents[0].id),
    'Unable to normalize recorder job_created workflow event date'
  );
  await registerRecord(service, run.id, 'inspections', job.id, 'demo_job', 'job_created', { source: 'servsync_demo_recorder' });
  for (const item of workItems) {
    await registerRecord(service, run.id, 'job_work_items', item.id, 'demo_job_work_item', 'job_created', { source: 'servsync_demo_recorder' });
  }
  await registerRecord(service, run.id, 'workflow_activity_events', jobEvents[0].id, 'demo_job_created_event', 'job_created', {
    source: 'servsync_demo_recorder',
  });

  const contractorClient = await signInDemoUser(
    makeUserClient,
    requireEnv(env, 'DEMO_CONTRACTOR_EMAIL'),
    requireEnv(env, 'DEMO_CONTRACTOR_PASSWORD')
  );
  const { visitEventId } = await scheduleJobVisit(contractorClient, service, run.id, job.id, dates);
  await ensureOk(
    await service.from('demo_scenario_runs').update({ checkpoint: 'job_scheduled' }).eq('id', run.id),
    'Unable to advance the recorder scenario to job_scheduled'
  );
  await finishRun(service, run.id, 'succeeded', {
    selected_checkpoint: 'job_scheduled',
    executed_steps: ['identities', 'profilesAndCompany', 'property', 'connection', 'request', 'contractorReview', 'estimateDraft', 'estimateSent', 'estimateAccepted', 'jobCreated', 'jobScheduled'],
    homeowner_user_id: homeownerId,
    contractor_id: contractorId,
    home_id: homeId,
    connection_id: run.metadata?.connection_id,
    service_request_id: requestId,
    estimate_id: estimateId,
    job_id: job.id,
    visit_event_id: visitEventId,
    recorder_adopted_at: new Date().toISOString(),
    recorder_source: 'servsync_demo_recorder',
    recorder_scenario: 'contractor-complete-work',
  });

  const verification = await verifyScenario(service, scenarioKey, env, 'job_scheduled');
  if (!verification.ok) {
    throw new Error(`Recorder Job adoption verification failed: ${verification.reason || 'job_scheduled state is invalid'}`);
  }
  return {
    operation: 'adopt-job',
    runId: run.id,
    checkpoint: 'job_scheduled',
    records: { jobId: job.id, workItemCount: workItems.length, visitEventId },
    verification,
  };
}

async function adoptRecorderCompletedJob(env, target, scenarioKey) {
  const { service } = createSupabaseClients(env, target);
  const runs = await inspectNonResetRuns(service, scenarioKey);
  const activeRuns = runs.filter((run) => run.status === 'succeeded' && run.recordCount > 0);
  if (activeRuns.length !== 1) {
    throw new Error(`Recorder completed-Job adoption refused: expected one active succeeded scenario run, found ${activeRuns.length}.`);
  }
  const run = activeRuns[0];
  if (run.checkpoint !== 'job_scheduled') {
    throw new Error(`Recorder completed-Job adoption refused: active checkpoint must be job_scheduled, found ${run.checkpoint}.`);
  }
  const jobId = run.metadata?.job_id;
  const estimateId = run.metadata?.estimate_id;
  if (!jobId || !estimateId) {
    throw new Error('Recorder completed-Job adoption refused: active run is missing exact Job or Estimate identity.');
  }
  const job = await fetchOneByPrimaryKey(
    service,
    'inspections',
    'id',
    jobId,
    'id,status,job_status,completed_at,closed_at,summary,report_storage_path,report_file_name'
  );
  const workItems = await fetchJobWorkItems(service, jobId);
  const visits = await ensureOk(
    await service.from('contractor_visit_events').select('id,status').eq('inspection_id', jobId),
    'Unable to inspect the recorder-completed visit'
  );
  if (
    job?.status !== 'draft'
    || job.job_status !== 'completed'
    || !job.completed_at
    || job.closed_at
    || job.report_storage_path
    || job.report_file_name
    || workItems.length !== estimateLines().length
    || workItems.some((item) => item.completion_status !== 'completed' || !item.completed_at || !item.completed_by)
    || visits.length !== 1
    || visits[0].status !== 'completed'
  ) {
    throw new Error('Recorder completed-Job adoption refused: Job, work-item, or visit completion does not match the exact scenario contract.');
  }
  const [invoices, historyRows] = await Promise.all([
    ensureOk(await service.from('invoices').select('id').eq('job_id', jobId), 'Unable to inspect completed recorder Job Invoices'),
    ensureOk(await service.from('home_maintenance_log').select('id').eq('inspection_id', jobId), 'Unable to inspect completed recorder Job Home History'),
  ]);
  if (invoices.length || historyRows.length) {
    throw new Error('Recorder completed-Job adoption refused: completion created an Invoice or Home History row.');
  }
  await ensureOk(
    await service.from('demo_scenario_runs').update({ checkpoint: 'job_completed' }).eq('id', run.id),
    'Unable to advance the recorder scenario to job_completed'
  );
  await finishRun(service, run.id, 'succeeded', {
    selected_checkpoint: 'job_completed',
    executed_steps: ['identities', 'profilesAndCompany', 'property', 'connection', 'request', 'contractorReview', 'estimateDraft', 'estimateSent', 'estimateAccepted', 'jobCreated', 'jobScheduled', 'jobInProgress', 'jobReviewReady', 'jobCompleted'],
    homeowner_user_id: run.metadata?.homeowner_user_id,
    contractor_id: run.metadata?.contractor_id,
    home_id: run.metadata?.home_id,
    connection_id: run.metadata?.connection_id,
    service_request_id: run.metadata?.service_request_id,
    estimate_id: estimateId,
    job_id: jobId,
    visit_event_id: run.metadata?.visit_event_id,
    recorder_adopted_at: new Date().toISOString(),
    recorder_source: 'servsync_demo_recorder',
    recorder_scenario: 'contractor-complete-work',
  });
  const verification = await verifyScenario(service, scenarioKey, env, 'job_completed');
  if (!verification.ok) {
    throw new Error(`Recorder completed-Job verification failed: ${verification.reason || 'job_completed state is invalid'}`);
  }
  return {
    operation: 'adopt-job-completion',
    runId: run.id,
    checkpoint: 'job_completed',
    records: { jobId, workItemCount: workItems.length, visitEventId: visits[0].id },
    verification,
  };
}

async function adoptRecorderFinalizedReport(env, target, scenarioKey) {
  const { service } = createSupabaseClients(env, target);
  const runs = await inspectNonResetRuns(service, scenarioKey);
  const activeRuns = runs.filter((run) => run.status === 'succeeded' && run.recordCount > 0);
  if (activeRuns.length !== 1) {
    throw new Error(`Recorder report adoption refused: expected one active succeeded scenario run, found ${activeRuns.length}.`);
  }

  const run = activeRuns[0];
  if (run.checkpoint !== 'job_completed') {
    throw new Error(`Recorder report adoption refused: active checkpoint must be job_completed, found ${run.checkpoint}.`);
  }
  if (run.records.some((record) => ['home_documents', 'home_maintenance_log', 'notifications'].includes(record.table_name))) {
    throw new Error('Recorder report adoption refused: job_completed already owns report, Home History, or notification records.');
  }

  const homeownerId = run.metadata?.homeowner_user_id;
  const requestId = run.metadata?.service_request_id;
  const jobId = run.metadata?.job_id;
  if (![homeownerId, requestId, jobId].every(Boolean)) {
    throw new Error('Recorder report adoption refused: active run is missing exact homeowner, request, or Job identity.');
  }

  const job = await fetchOneByPrimaryKey(
    service,
    'inspections',
    'id',
    jobId,
    'id, homeowner_user_id, home_id, service_request_id, status, job_status, report_storage_path, report_file_name, completed_at'
  );
  if (!job || job.homeowner_user_id !== homeownerId || job.service_request_id !== requestId) {
    throw new Error('Recorder report adoption refused: the exact registered Demo Job lineage is missing or ambiguous.');
  }
  if (
    job.status !== 'finalized'
    || job.job_status !== 'completed'
    || !job.report_storage_path
    || !job.report_file_name
  ) {
    const storageFolder = `${homeownerId}/field-work/${jobId}`;
    const [documents, historyRows, objects] = await Promise.all([
      ensureOk(
        await service
          .from('home_documents')
          .select('id, storage_path')
          .eq('homeowner_user_id', homeownerId)
          .like('storage_path', `${storageFolder}/%`),
        'Unable to inspect canonical-report documents before orphan cleanup'
      ),
      ensureOk(
        await service.from('home_maintenance_log').select('id').eq('inspection_id', jobId),
        'Unable to inspect Home History before orphan cleanup'
      ),
      ensureOk(
        await service.storage.from(FINALIZED_REPORT_BUCKET).list(storageFolder, { limit: 100 }),
        'Unable to inspect the exact recorder-owned Job folder before orphan cleanup'
      ),
    ]);
    if (job.report_storage_path || job.report_file_name || documents.length > 0 || historyRows.length > 0) {
      throw new Error('Recorder report adoption refused: partial durable report lineage exists, so orphan cleanup is unsafe.');
    }
    const orphanPaths = (objects || [])
      .filter((object) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/i.test(object.name))
      .map((object) => `${storageFolder}/${object.name}`);
    if (orphanPaths.length > 0) {
      await ensureOk(
        await service.storage.from(FINALIZED_REPORT_BUCKET).remove(orphanPaths),
        'Unable to remove unregistered canonical-report bytes from the exact recorder-owned Job folder'
      );
    }
    throw new Error('Recorder report adoption refused: the exact Demo Job was not finalized through the supported product workflow.');
  }
  if (!/^[a-z0-9-]+-Field-Work-\d{4}-\d{2}-\d{2}\.pdf$/i.test(job.report_file_name)) {
    throw new Error('Recorder report adoption refused: the report filename does not match the canonical ServSync generator contract.');
  }

  const storage = validateFinalizedReportStoragePath(job.report_storage_path, homeownerId, jobId);
  const [documents, historyRows, notifications, reportBlob] = await Promise.all([
    ensureOk(
      await service
        .from('home_documents')
        .select('id, homeowner_user_id, home_id, storage_path, file_name, content_type, document_type, file_size_bytes')
        .eq('homeowner_user_id', homeownerId)
        .eq('storage_path', storage.path),
      'Unable to inspect the canonical Demo report document'
    ),
    ensureOk(
      await service
        .from('home_maintenance_log')
        .select('id, homeowner_user_id, home_id, inspection_id, service_request_id, report_document_id')
        .eq('inspection_id', jobId),
      'Unable to inspect the canonical Demo Home History row'
    ),
    ensureOk(
      await service
        .from('notifications')
        .select('id, user_id, type, request_id')
        .eq('user_id', homeownerId)
        .eq('type', 'inspection_report_filed')
        .eq('request_id', requestId),
      'Unable to inspect the canonical Demo report notification'
    ),
    ensureOk(
      await service.storage.from(storage.bucket).download(storage.path),
      'Unable to download the canonical Demo report for ownership verification'
    ),
  ]);
  if (documents.length !== 1 || historyRows.length !== 1 || notifications.length !== 1 || !reportBlob) {
    throw new Error(
      `Recorder report adoption refused: expected one document/history/notification and one PDF, found ${documents.length}/${historyRows.length}/${notifications.length}.`
    );
  }

  const document = documents[0];
  const history = historyRows[0];
  const notification = notifications[0];
  const reportBytes = Buffer.from(await reportBlob.arrayBuffer());
  const reportSha256 = createHash('sha256').update(reportBytes).digest('hex');
  if (
    reportBytes.subarray(0, 5).toString('ascii') !== '%PDF-'
    || reportBytes.byteLength !== document.file_size_bytes
    || document.homeowner_user_id !== homeownerId
    || document.home_id !== job.home_id
    || document.storage_path !== storage.path
    || document.file_name !== job.report_file_name
    || document.content_type !== 'application/pdf'
    || document.document_type !== 'inspection'
    || history.homeowner_user_id !== homeownerId
    || history.home_id !== job.home_id
    || history.inspection_id !== jobId
    || history.service_request_id !== requestId
    || history.report_document_id !== document.id
    || notification.user_id !== homeownerId
    || notification.type !== 'inspection_report_filed'
    || notification.request_id !== requestId
  ) {
    throw new Error('Recorder report adoption refused: canonical report artifacts do not have the exact expected lineage or PDF identity.');
  }

  const sourceMetadata = {
    source_ui: 'canonical_contractor_finalize_report',
    source_generator: 'generateInspectionPdf',
    source_rpc: 'servsync_commit_job_report_finalization',
  };
  await registerRecord(
    service,
    run.id,
    'home_maintenance_log',
    history.id,
    FINALIZED_REPORT_RECORD_ROLES.history,
    'home_history_updated',
    { ...sourceMetadata, inspection_id: jobId, report_document_id: document.id }
  );
  await registerRecord(
    service,
    run.id,
    'home_documents',
    document.id,
    FINALIZED_REPORT_RECORD_ROLES.document,
    'home_history_updated',
    {
      ...sourceMetadata,
      storage_bucket: storage.bucket,
      storage_path: storage.path,
      storage_sha256: reportSha256,
    }
  );
  await registerRecord(
    service,
    run.id,
    'notifications',
    notification.id,
    FINALIZED_REPORT_RECORD_ROLES.notification,
    'home_history_updated',
    { ...sourceMetadata, inspection_id: jobId, request_id: requestId }
  );
  await ensureOk(
    await service.from('demo_scenario_runs').update({ checkpoint: 'home_history_updated' }).eq('id', run.id),
    'Unable to advance the recorder scenario to home_history_updated'
  );
  await finishRun(service, run.id, 'succeeded', {
    selected_checkpoint: 'home_history_updated',
    executed_steps: [...(run.metadata?.executed_steps || []), 'canonicalProductReportFinalization'],
    report_document_id: document.id,
    home_history_id: history.id,
    report_notification_id: notification.id,
    report_storage_bucket: storage.bucket,
    report_storage_path: storage.path,
    report_storage_sha256: reportSha256,
    report_file_name: document.file_name,
    report_file_size_bytes: reportBytes.byteLength,
    recorder_adopted_at: new Date().toISOString(),
    recorder_source: 'servsync_demo_recorder',
    recorder_scenario: run.metadata?.recorder_scenario || 'homeowner-home-history',
    report_origin: 'canonical_product_ui',
    report_generator: 'generateInspectionPdf',
  });

  const verification = await verifyScenario(service, scenarioKey, env, 'home_history_updated');
  if (!verification.ok) {
    throw new Error(`Recorder report adoption verification failed: ${verification.reason || 'home_history_updated state is invalid'}`);
  }
  return {
    operation: 'adopt-report',
    runId: run.id,
    checkpoint: 'home_history_updated',
    records: {
      jobId,
      reportDocumentId: document.id,
      homeHistoryId: history.id,
      notificationId: notification.id,
      reportFileName: document.file_name,
      reportFileSizeBytes: reportBytes.byteLength,
      reportSha256,
    },
    verification,
  };
}

async function prepareFlagshipDiscover(env, target, scenarioKey) {
  const { service } = createSupabaseClients(env, target);
  const runs = await inspectNonResetRuns(service, scenarioKey);
  const activeRuns = runs.filter((run) => run.status === 'succeeded' && run.recordCount > 0);
  if (activeRuns.length !== 1) {
    throw new Error(`Flagship Discover preparation refused: expected one active succeeded scenario run, found ${activeRuns.length}.`);
  }
  const run = activeRuns[0];
  if (run.checkpoint !== 'contractor_discovery_ready') {
    throw new Error(`Flagship Discover preparation refused: active checkpoint must be contractor_discovery_ready, found ${run.checkpoint}.`);
  }
  if (run.records.some((record) => record.table_name === 'contractor_posts')) {
    throw new Error('Flagship Discover preparation refused: the active run already owns contractor posts.');
  }

  const primaryContractorId = run.metadata?.contractor_id;
  if (!primaryContractorId) throw new Error('Flagship Discover preparation refused: primary contractor identity is missing.');
  const createdAt = new Date(run.anchor_timestamp || Date.now());
  const postRows = [];

  for (const [index, fixture] of FLAGSHIP_DISCOVER_CONTRACTORS.entries()) {
    const user = await ensureAuthUser(
      service,
      fixture.email,
      `Flagship-${randomUUID()}-A9!`,
      scenarioKey,
      `flagship_${fixture.key}`
    );
    await ensureOk(
      await service.from('profiles').upsert({
        id: user.id,
        email: fixture.email,
        role: 'contractor',
        full_name: fixture.fullName,
      }, { onConflict: 'id' }),
      `Unable to upsert ${fixture.businessName} Demo profile`
    );
    const contractor = await ensureOk(
      await service.from('contractor_profiles').upsert({
        owner_user_id: user.id,
        business_name: fixture.businessName,
        slug: fixture.slug,
        contact_name: fixture.fullName,
        email: fixture.email,
        phone: '251-555-01' + String(index + 20).padStart(2, '0'),
        website_url: `https://example.test/${fixture.slug}`,
        city: 'Fairhope',
        state: 'AL',
        zip_code: '36532',
        service_categories: fixture.categories,
        service_zip_codes: ['36532', '36526'],
        business_summary: `Fictional Demo contractor profile for ${fixture.businessName}. No real services are offered.`,
        public_profile_enabled: true,
        account_status: 'active',
        subscription_status: 'trialing',
      }, { onConflict: 'owner_user_id' }).select('id').single(),
      `Unable to upsert ${fixture.businessName} Demo contractor profile`
    );
    postRows.push({
      contractor_id: contractor.id,
      category: fixture.category,
      title: fixture.title,
      description: fixture.description,
      photos: [],
      city: 'Fairhope',
      state: 'AL',
      created_at: new Date(createdAt.getTime() - (index + 1) * 60 * 60 * 1000).toISOString(),
      updated_at: createdAt.toISOString(),
    });
  }

  postRows.push({
    contractor_id: primaryContractorId,
    ...FLAGSHIP_PRIMARY_POST,
    photos: [],
    city: 'Mobile',
    state: 'AL',
    created_at: createdAt.toISOString(),
    updated_at: createdAt.toISOString(),
  });

  const posts = await ensureOk(
    await service.from('contractor_posts').insert(postRows).select('id,contractor_id,category,title'),
    'Unable to create registered flagship Discover posts'
  );
  for (const post of posts) {
    await registerRecord(service, run.id, 'contractor_posts', post.id, 'demo_flagship_discover_post', 'contractor_discovery_ready', {
      source: 'servsync_demo_flagship_recorder',
      contractor_id: post.contractor_id,
      category: post.category,
    });
  }
  await finishRun(service, run.id, 'succeeded', {
    flagship_discover_post_ids: posts.map((post) => post.id),
    flagship_discover_post_count: posts.length,
    flagship_discover_prepared_at: new Date().toISOString(),
    recorder_scenario: 'servsync-platform-introduction',
  });

  return {
    operation: 'prepare-flagship-discover',
    runId: run.id,
    checkpoint: run.checkpoint,
    records: { postCount: posts.length, postIds: posts.map((post) => post.id) },
    verification: { ok: true, checkpoint: run.checkpoint },
  };
}

async function createAndAdoptFlagshipInvoice(env, target, scenarioKey) {
  const { service, makeUserClient } = createSupabaseClients(env, target);
  const runs = await inspectNonResetRuns(service, scenarioKey);
  const activeRuns = runs.filter((run) => run.status === 'succeeded' && run.recordCount > 0);
  if (activeRuns.length !== 1) {
    throw new Error(`Flagship Invoice creation refused: expected one active succeeded scenario run, found ${activeRuns.length}.`);
  }
  const run = activeRuns[0];
  if (run.checkpoint !== 'job_completed') {
    throw new Error(`Flagship Invoice creation refused: active checkpoint must be job_completed, found ${run.checkpoint}.`);
  }
  if (run.records.some((record) => record.table_name === 'invoices')) {
    throw new Error('Flagship Invoice creation refused: job_completed already owns an Invoice.');
  }
  const workItems = await ensureOk(
    await service.from('job_work_items')
      .select('id,completion_status,billing_status,billable,unit_price_cents')
      .eq('inspection_id', run.metadata?.job_id)
      .eq('completion_status', 'completed')
      .eq('billable', true),
    'Unable to inspect completed flagship Job work items'
  );
  const invoiceableIds = workItems
    .filter((item) => item.billing_status === 'unbilled' && item.unit_price_cents !== null)
    .map((item) => item.id);
  if (invoiceableIds.length < 1) throw new Error('Flagship Invoice creation refused: no completed priced work item is invoiceable.');
  const contractorClient = await signInDemoUser(
    makeUserClient,
    requireEnv(env, 'DEMO_CONTRACTOR_EMAIL'),
    requireEnv(env, 'DEMO_CONTRACTOR_PASSWORD')
  );
  const creation = await ensureOk(
    await contractorClient.rpc('servsync_create_partial_invoice_from_job', {
      p_inspection_id: run.metadata?.job_id,
      p_work_item_ids: invoiceableIds,
    }),
    'Unable to create the flagship Invoice through the canonical authenticated RPC'
  );
  const invoiceId = creation?.invoice_id;
  if (!invoiceId) throw new Error('Flagship Invoice creation did not return an Invoice id.');
  const invoices = await ensureOk(
    await service.from('invoices')
      .select('id,contractor_id,homeowner_user_id,service_request_id,job_id,estimate_id,status,title,total_cents,created_at')
      .eq('id', invoiceId)
      .eq('contractor_id', run.metadata?.contractor_id)
      .eq('homeowner_user_id', run.metadata?.homeowner_user_id)
      .eq('service_request_id', run.metadata?.service_request_id)
      .eq('job_id', run.metadata?.job_id)
      .eq('estimate_id', run.metadata?.estimate_id)
      .eq('status', 'draft'),
    'Unable to inspect the canonical flagship Invoice draft'
  );
  if (invoices.length !== 1) {
    throw new Error(`Flagship Invoice creation refused: expected exactly one new canonical draft, found ${invoices.length}.`);
  }
  const invoice = invoices[0];
  const lines = await ensureOk(
    await service.from('invoice_line_items').select('id,invoice_id,quantity,unit,unit_price_cents').eq('invoice_id', invoice.id),
    'Unable to inspect recorder Invoice lines'
  );
  if (lines.length < 1 || invoice.total_cents !== estimateFixture.subtotalCents + estimateFixture.taxCents) {
    throw new Error('Flagship Invoice creation refused: Invoice lines or total do not match the canonical accepted Estimate.');
  }
  for (const line of lines) {
    await registerRecord(service, run.id, 'invoice_line_items', line.id, 'demo_invoice_line_item', run.checkpoint, { source: 'servsync_create_invoice_from_job' });
  }
  await registerRecord(service, run.id, 'invoices', invoice.id, 'demo_invoice', run.checkpoint, { source: 'servsync_create_invoice_from_job' });
  await finishRun(service, run.id, 'succeeded', {
    invoice_id: invoice.id,
    invoice_line_count: lines.length,
    invoice_total_cents: invoice.total_cents,
    recorder_invoice_adopted_at: new Date().toISOString(),
    recorder_scenario: 'servsync-platform-introduction',
  });
  return {
    operation: 'create-flagship-invoice',
    runId: run.id,
    checkpoint: run.checkpoint,
    records: { invoiceId: invoice.id, lineItemCount: lines.length, totalCents: invoice.total_cents },
    verification: { ok: true, checkpoint: run.checkpoint },
  };
}

function summarize(result, target, scenarioKey) {
  return {
    targetProjectRef: target.expectedRef,
    targetHost: target.host,
    scenario: scenarioKey,
    operation: result.operation,
    runId: result.runId || result.verification?.runId || null,
    checkpoint: result.checkpoint || result.verification?.checkpoint || null,
    demoUsers: result.demoUsers
      ? {
          homeownerEmail: result.demoUsers.homeownerEmail,
          contractorEmail: result.demoUsers.contractorEmail,
          homeownerUserId: result.demoUsers.homeownerUserId,
          contractorUserId: result.demoUsers.contractorUserId,
        }
      : undefined,
    records: result.records,
    removedCount: result.removed?.length || result.previousReset?.removed?.length || 0,
    retainedPropertyGraphs: result.retainedPropertyGraphs,
    verification: result.verification,
    externalEffects: result.externalEffects || 'No external effects were triggered by this runner.',
    success: true,
  };
}

export async function runDemoCommand(argv = process.argv.slice(2), env = process.env) {
  const [operation, scenarioKey, ...optionArgs] = argv;
  if (operation === 'checkpoints') {
    return {
      operation: 'checkpoints',
      scenario: WATER_HEATER_SCENARIO_KEY,
      defaultCheckpoint: DEFAULT_CHECKPOINT_KEY,
      supported: listCheckpoints(),
      deferred: DEFERRED_CHECKPOINT_KEYS,
      success: true,
    };
  }
  if (!['seed', 'reset', 'verify', 'prepare-flagship-discover', 'adopt-request', 'adopt-estimate', 'adopt-job', 'adopt-job-completion', 'create-flagship-invoice', 'adopt-report'].includes(operation)) {
    throw new Error(
      'Usage: node scripts/demo/seed-demo-scenario.mjs <seed|reset|verify|prepare-flagship-discover|adopt-request|adopt-estimate|adopt-job|adopt-job-completion|create-flagship-invoice|adopt-report> water_heater_core_loop [--checkpoint=<key>]'
    );
  }

  if (!SCENARIOS[scenarioKey]) {
    throw new Error(`Unsupported demo scenario: ${scenarioKey}`);
  }

  if (['prepare-flagship-discover', 'adopt-request', 'adopt-estimate', 'adopt-job', 'adopt-job-completion', 'create-flagship-invoice', 'adopt-report'].includes(operation) && optionArgs.length > 0) {
    throw new Error('Recorder adoption does not accept checkpoint options.');
  }
  const checkpointSelection = parseCheckpointSelection(optionArgs, DEFAULT_CHECKPOINT_KEY);
  const checkpointKey = checkpointSelection.checkpointKey;
  const target = assertSafeDemoTarget(env);
  requireResetAcknowledgement(operation, scenarioKey, env);

  if (operation === 'seed') {
    return summarize(await seedScenario(env, target, scenarioKey, checkpointKey), target, scenarioKey);
  }

  if (operation === 'reset') {
    return summarize(await resetScenario(env, target, scenarioKey), target, scenarioKey);
  }

  if (operation === 'prepare-flagship-discover') {
    return summarize(await prepareFlagshipDiscover(env, target, scenarioKey), target, scenarioKey);
  }

  if (operation === 'adopt-request') {
    return summarize(await adoptRecorderServiceRequest(env, target, scenarioKey), target, scenarioKey);
  }

  if (operation === 'adopt-estimate') {
    return summarize(await adoptRecorderEstimateDraft(env, target, scenarioKey), target, scenarioKey);
  }

  if (operation === 'adopt-job') {
    return summarize(await adoptRecorderJobFromAcceptedEstimate(env, target, scenarioKey), target, scenarioKey);
  }

  if (operation === 'adopt-job-completion') {
    return summarize(await adoptRecorderCompletedJob(env, target, scenarioKey), target, scenarioKey);
  }

  if (operation === 'create-flagship-invoice') {
    return summarize(await createAndAdoptFlagshipInvoice(env, target, scenarioKey), target, scenarioKey);
  }

  if (operation === 'adopt-report') {
    return summarize(await adoptRecorderFinalizedReport(env, target, scenarioKey), target, scenarioKey);
  }

  return summarize(
    await verifyDemoScenario(env, target, scenarioKey, checkpointSelection.supplied ? checkpointKey : null),
    target,
    scenarioKey
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDemoCommand()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
    })
    .catch((error) => {
      console.error(
        JSON.stringify(
          {
            success: false,
            error: error.message,
            note: 'No secrets were printed. Check dedicated demo environment variables and SQL foundation state.',
          },
          null,
          2
        )
      );
      process.exitCode = 1;
    });
}
