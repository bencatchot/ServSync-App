#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
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
  'STRIPE_ENABLED',
  'SMS_ENABLED',
  'PUSH_NOTIFICATIONS_ENABLED',
  'WEBHOOK_DELIVERY_ENABLED',
  'QUICKBOOKS_ENABLED',
  'ACCOUNTING_SYNC_ENABLED',
  'AI_ENABLED',
  'GEOCODING_ENABLED',
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
  workflow_activity_events: 'id',
  notifications: 'id',
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
      .select('id, run_id, schema_name, table_name, primary_key_column, record_id, record_role, checkpoint, reset_order')
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

async function resetRun(service, run) {
  const retainedPropertyGraph = await retainRevisionBackedPropertyGraph(service, run);
  const data = await ensureOk(
    await service.rpc('servsync_demo_reset_registered_run', { p_run_id: run.id }),
    'Unable to reset registered demo records'
  );
  return { removed: data || [], retainedPropertyGraph };
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

async function sendEstimate(contractorClient, estimateId) {
  const result = await ensureOk(
    await contractorClient.rpc('servsync_send_estimate', { p_estimate_id: estimateId }),
    'Unable to send demo estimate through the server-authoritative RPC'
  );
  if (result?.estimate_id !== estimateId || result?.status !== 'sent') {
    throw new Error('Demo Estimate send returned an unexpected identity or status.');
  }
  return { estimateId, status: result.status };
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
      .select('id, title, completion_status, completed_at, completed_by, billing_status, sort_order, source_estimate_line_item_id')
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
            action: finding?.action || 'Completed as part of the demo water-heater replacement.',
            notes: finding?.notes || 'Demo checkpoint progress note.',
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
    'Demo job completed. Invoice and Home History steps are intentionally deferred to a later Demo Mode slice.',
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

    const row = await fetchOneByPrimaryKey(service, record.table_name, primaryKey, record.record_id, primaryKey);
    if (!row) {
      issues.push(`Registry points to missing ${record.table_name}.${record.record_id}.`);
    }
  }
}

async function verifyScenario(service, scenarioKey, env = process.env, requestedCheckpointKey = null) {
  assertSafeDemoTarget(env);

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
          await service.from('invoices').select('id, job_id, estimate_id, service_request_id, status').or(invoiceClauses.join(',')),
          'Unable to inspect deferred demo invoices'
        )
      : [];
  const homeHistoryClauses = [jobId ? `inspection_id.eq.${jobId}` : null, requestId ? `service_request_id.eq.${requestId}` : null].filter(Boolean);
  const homeHistoryRows =
    homeHistoryClauses.length > 0
      ? await ensureOk(
          await service.from('home_maintenance_log').select('id, inspection_id, service_request_id').or(homeHistoryClauses.join(',')),
          'Unable to inspect deferred demo Home History rows'
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
    if (job.report_storage_path || job.report_file_name) {
      issues.push('Demo job lifecycle checkpoints must not create or attach finalized report files.');
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
  if (scenarioInvoices.length !== 0) {
    issues.push(`Demo Slice 2B must not create invoices, found ${scenarioInvoices.length}.`);
  }
  if (homeHistoryRows.length !== 0) {
    issues.push(`Demo Slice 2B must not file Home History rows, found ${homeHistoryRows.length}.`);
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
        homeHistoryRows: homeHistoryRows.length,
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
      notifications: notificationHandlingDecision(),
    },
  };
}

async function seedScenario(env, target, scenarioKey, checkpointKey = DEFAULT_CHECKPOINT_KEY) {
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
      await sendEstimate(contractorClient, created.estimateId);
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
        workItemCount: created.jobWorkItemCount,
        completedWorkItemCount: created.completedWorkItemCount,
        openWorkItemCount: created.openWorkItemCount,
      },
      checkpoint: checkpointKey,
      verification,
      externalEffects: `No email, SMS, push, Stripe, webhook, accounting, AI, geocoding, storage, or deployment calls were made by this runner. ${notificationHandlingDecision()}`,
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

async function adoptRecorderEstimateResponse(env, target, scenarioKey) {
  const { service } = createSupabaseClients(env, target);
  const runs = await inspectNonResetRuns(service, scenarioKey);
  const activeRuns = runs.filter((run) => run.status === 'succeeded' && run.recordCount > 0);

  if (activeRuns.length !== 1) {
    throw new Error(`Recorder Estimate response adoption refused: expected one active succeeded scenario run, found ${activeRuns.length}.`);
  }

  const run = activeRuns[0];
  if (run.checkpoint !== 'estimate_sent') {
    throw new Error(`Recorder Estimate response adoption refused: active checkpoint must be estimate_sent, found ${run.checkpoint}.`);
  }

  const homeownerId = run.metadata?.homeowner_user_id;
  const contractorId = run.metadata?.contractor_id;
  const homeId = run.metadata?.home_id;
  const requestId = run.metadata?.service_request_id;
  const estimateId = run.metadata?.estimate_id;
  if (![homeownerId, contractorId, homeId, requestId, estimateId].every(Boolean)) {
    throw new Error('Recorder Estimate response adoption refused: active run is missing exact homeowner, contractor, home, request, or Estimate identity.');
  }

  const estimate = await ensureOk(
    await service
      .from('estimates')
      .select('id,contractor_id,homeowner_user_id,home_id,service_request_id,inspection_id,title,scope,status,subtotal_cents,total_cents,created_at,updated_at')
      .eq('id', estimateId)
      .eq('contractor_id', contractorId)
      .eq('homeowner_user_id', homeownerId)
      .eq('home_id', homeId)
      .eq('service_request_id', requestId)
      .is('inspection_id', null)
      .eq('title', estimateFixture.title)
      .eq('scope', estimateFixture.scope)
      .eq('status', 'accepted')
      .eq('subtotal_cents', estimateFixture.subtotalCents)
      .eq('total_cents', estimateFixture.subtotalCents + estimateFixture.taxCents)
      .single(),
    'Unable to inspect the homeowner-accepted Demo Estimate'
  );

  const lineItems = await ensureOk(
    await service.from('estimate_line_items').select('id').eq('estimate_id', estimate.id),
    'Unable to inspect accepted Demo Estimate lines'
  );
  const scheduleItems = await ensureOk(
    await service.from('estimate_payment_schedule_items').select('id').eq('estimate_id', estimate.id),
    'Unable to inspect accepted Demo Estimate payment schedule'
  );
  if (lineItems.length !== estimateLines().length || scheduleItems.length !== estimatePaymentScheduleRows().length) {
    throw new Error('Recorder Estimate response adoption refused: line or payment-schedule count changed during homeowner response.');
  }

  const approvalEvents = await ensureOk(
    await service
      .from('workflow_activity_events')
      .select('id,event_type,estimate_id,inspection_id,created_at,metadata')
      .eq('estimate_id', estimate.id)
      .eq('event_type', WORKFLOW_EVENT_TYPES.estimateApproved)
      .is('inspection_id', null)
      .gt('created_at', run.completed_at),
    'Unable to inspect the homeowner Estimate approval event'
  );
  if (
    approvalEvents.length !== 1
    || approvalEvents[0]?.metadata?.source_rpc !== WORKFLOW_EVENT_SOURCES.estimateResponse
  ) {
    throw new Error(`Recorder Estimate response adoption refused: expected one exact approval event, found ${approvalEvents.length}.`);
  }

  const linkedJobs = await ensureOk(
    await service.from('inspections').select('id').eq('estimate_id', estimate.id),
    'Unable to inspect accepted Demo Estimate Job lineage'
  );
  const linkedInvoices = await ensureOk(
    await service.from('invoices').select('id').eq('estimate_id', estimate.id),
    'Unable to inspect accepted Demo Estimate Invoice lineage'
  );
  if (linkedJobs.length > 0 || linkedInvoices.length > 0) {
    throw new Error('Recorder Estimate response adoption refused: accepting the Estimate created a Job or Invoice.');
  }

  await registerRecord(
    service,
    run.id,
    'workflow_activity_events',
    approvalEvents[0].id,
    'demo_estimate_approved_event',
    'estimate_accepted',
    { source: 'servsync_demo_recorder' }
  );
  await ensureOk(
    await service.from('demo_scenario_runs').update({ checkpoint: 'estimate_accepted' }).eq('id', run.id),
    'Unable to advance the recorder scenario to estimate_accepted'
  );
  await finishRun(service, run.id, 'succeeded', {
    selected_checkpoint: 'estimate_accepted',
    executed_steps: [
      'identities',
      'profilesAndCompany',
      'property',
      'connection',
      'request',
      'contractorReview',
      'estimateDraft',
      'estimateSent',
      'estimateAccepted',
    ],
    homeowner_user_id: homeownerId,
    contractor_id: contractorId,
    home_id: homeId,
    connection_id: run.metadata?.connection_id,
    service_request_id: requestId,
    estimate_id: estimate.id,
    recorder_adopted_at: new Date().toISOString(),
    recorder_source: 'servsync_demo_recorder',
    recorder_scenario: 'homeowner-review-estimate',
    recorder_response_action: 'accept',
  });

  const verification = await verifyScenario(service, scenarioKey, env, 'estimate_accepted');
  if (!verification.ok) {
    throw new Error(`Recorder Estimate response verification failed: ${verification.reason || 'estimate_accepted state is invalid'}`);
  }

  return {
    operation: 'adopt-estimate-response',
    runId: run.id,
    checkpoint: 'estimate_accepted',
    records: {
      estimateId: estimate.id,
      estimateStatus: estimate.status,
      approvalEventCount: approvalEvents.length,
      lineItemCount: lineItems.length,
      paymentScheduleCount: scheduleItems.length,
      jobCount: linkedJobs.length,
      invoiceCount: linkedInvoices.length,
    },
    verification,
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
  if (!['seed', 'reset', 'verify', 'adopt-request', 'adopt-estimate', 'adopt-estimate-response'].includes(operation)) {
    throw new Error(
      'Usage: node scripts/demo/seed-demo-scenario.mjs <seed|reset|verify|adopt-request|adopt-estimate|adopt-estimate-response> water_heater_core_loop [--checkpoint=<key>]'
    );
  }

  if (!SCENARIOS[scenarioKey]) {
    throw new Error(`Unsupported demo scenario: ${scenarioKey}`);
  }

  if (['adopt-request', 'adopt-estimate', 'adopt-estimate-response'].includes(operation) && optionArgs.length > 0) {
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

  if (operation === 'adopt-request') {
    return summarize(await adoptRecorderServiceRequest(env, target, scenarioKey), target, scenarioKey);
  }

  if (operation === 'adopt-estimate') {
    return summarize(await adoptRecorderEstimateDraft(env, target, scenarioKey), target, scenarioKey);
  }

  if (operation === 'adopt-estimate-response') {
    return summarize(await adoptRecorderEstimateResponse(env, target, scenarioKey), target, scenarioKey);
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
