#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

export const WATER_HEATER_SCENARIO_KEY = 'water_heater_core_loop';
export const KNOWN_PRODUCTION_REF = 'uqgtheclhxqlnjpfmheq';
export const KNOWN_SHARED_SANDBOX_REF = 'zpzdkoaubyjtsomccxya';
export const REQUIRED_ENABLE_VALUE = 'true';
export const RESET_ACKNOWLEDGEMENT_PREFIX = 'reset-';

const SCENARIOS = {
  [WATER_HEATER_SCENARIO_KEY]: {
    displayName: 'Water Heater Core Loop Demo',
    description:
      'Dedicated demo scenario for homeowner request, contractor estimate, homeowner approval, and job creation.',
    checkpoint: 'job_ready',
  },
};

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
const WORKFLOW_EVENT_TYPES = {
  estimateApproved: 'estimate_approved',
  jobCreated: 'job_created',
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
];

const DEMO_HOMEOWNER = {
  emailEnv: 'DEMO_HOMEOWNER_EMAIL',
  passwordEnv: 'DEMO_HOMEOWNER_PASSWORD',
  defaultEmail: 'sarah.homeowner@example.test',
  fullName: 'Sarah Johnson',
  displayName: 'Sarah Johnson',
  phone: '251-555-0104',
};

const DEMO_CONTRACTOR = {
  emailEnv: 'DEMO_CONTRACTOR_EMAIL',
  passwordEnv: 'DEMO_CONTRACTOR_PASSWORD',
  defaultEmail: 'marcus.owner@example.test',
  fullName: 'Marcus Bennett',
  contactName: 'Marcus Bennett',
  phone: '251-555-0118',
  businessName: 'Gulf Coast Home Services',
  slug: 'gulf-coast-home-services-demo',
};

const DEMO_PROPERTY = {
  nickname: 'Demo Bay Home',
  address_line1: '1200 Demo Bay Lane',
  address_line2: '',
  city: 'Fairhope',
  state: 'AL',
  zip_code: '36532',
  home_type: 'Single-family home',
  year_built: '2006',
  square_feet: '2180',
  notes:
    'Fictional South Alabama demo property for ServSync recordings. No real customer address or service history.',
};

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

export function buildDatePlan(anchorInput = new Date()) {
  const anchor = new Date(anchorInput);
  if (Number.isNaN(anchor.getTime())) {
    throw new Error('Invalid demo anchor timestamp.');
  }

  const hours = (value) => new Date(anchor.getTime() + value * 60 * 60 * 1000).toISOString();
  const days = (value) => new Date(anchor.getTime() + value * 24 * 60 * 60 * 1000).toISOString();

  return {
    anchor: anchor.toISOString(),
    profileCreatedAt: days(-90),
    propertyCreatedAt: days(-75),
    connectionCreatedAt: days(-21),
    requestCreatedAt: days(-1),
    estimateCreatedAt: hours(-6),
    estimateSentAt: hours(-4),
    estimateAcceptedAt: hours(-2),
    jobCreatedAt: hours(-1),
    visitWindowStart: days(1),
    waterHeaterInstallDate: days(-2555).slice(0, 10),
    waterHeaterWarrantyDate: days(1095).slice(0, 10),
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

async function startRun(service, scenarioKey, operation, target, dates) {
  const scenario = SCENARIOS[scenarioKey];
  const runId = await ensureOk(
    await service.rpc('servsync_demo_start_run', {
      p_scenario_key: scenarioKey,
      p_display_name: scenario.displayName,
      p_description: scenario.description,
      p_operation: operation,
      p_checkpoint: scenario.checkpoint,
      p_anchor_timestamp: dates.anchor,
      p_target_project_ref: target.expectedRef,
      p_metadata: {
        script: 'scripts/demo/seed-demo-scenario.mjs',
        external_effects_disabled: true,
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

async function registerRecord(service, runId, tableName, recordId, recordRole, checkpoint = 'job_ready', metadata = {}) {
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
      .select('id, scenario_key, operation, status, started_at, completed_at, anchor_timestamp, metadata')
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

async function inspectNonResetRuns(service, scenarioKey) {
  const runs = await getScenarioRuns(service, scenarioKey);
  const inspected = [];
  for (const run of runs) {
    const records = await getRegisteredRecordsForRun(service, run.id);
    inspected.push({ ...run, records, recordCount: records.length });
  }
  return inspected;
}

async function resetRun(service, runId) {
  const data = await ensureOk(
    await service.rpc('servsync_demo_reset_registered_run', { p_run_id: runId }),
    'Unable to reset registered demo records'
  );
  return data || [];
}

async function resetNonResetRuns(service, scenarioKey, reason) {
  const runs = await inspectNonResetRuns(service, scenarioKey);
  const considered = [];
  for (const run of runs) {
    try {
      const removed = await resetRun(service, run.id);
      considered.push({
        runId: run.id,
        previousStatus: run.status,
        registeredRecords: run.recordCount,
        removed,
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

async function registerCreatedRecord(service, runId, tableName, recordId, recordRole, checkpoint = 'job_ready', metadata = {}) {
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

async function addUnregisteredFindings(service, findings, tableName, records) {
  for (const record of records || []) {
    const registered = await findRegisteredRecord(service, tableName, record.id);
    if (!registered) {
      findings.push({ tableName, recordId: record.id });
    }
  }
}

async function assertNoLikelyUnregisteredScenarioRecords(service, { homeownerId, contractorId }) {
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
  await addUnregisteredFindings(service, findings, 'homes', homes);

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

async function createProperty(service, runId, homeownerId, dates) {
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
    await service
      .from('home_assets')
      .insert({
        home_id: home.id,
        home_room_id: room.id,
        asset_category: 'plumbing',
        asset_type: 'water_heater',
        name: 'Existing 40-gallon water heater',
        manufacturer: 'DemoHome',
        model: 'WH-40-FICTIONAL',
        install_date: dates.waterHeaterInstallDate,
        warranty_expires_on: dates.waterHeaterWarrantyDate,
        notes: 'Fictional asset record for Demo Mode. Serial numbers and real property details are intentionally omitted.',
        created_by: homeownerId,
        created_at: dates.propertyCreatedAt,
        updated_at: dates.propertyCreatedAt,
      })
      .select('id')
      .single(),
    'Unable to create demo home asset'
  );
  await registerCreatedRecord(service, runId, 'home_assets', asset.id, 'demo_water_heater_asset', 'property_ready');

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
      p_category: 'Plumbing',
      p_urgency: 'normal',
      p_title: 'Replace leaking water heater',
      p_description:
        'The existing 40-gallon water heater is leaking near the base. We would like inspection and replacement options. Access is through the garage utility area, and an appointment within the next few days would be helpful.',
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
  return [
    {
      line_type: 'labor',
      line_title: 'Remove and dispose of existing 40-gallon water heater',
      description: 'Remove the leaking unit and haul away from the demo property.',
      customer_description: 'Remove existing leaking water heater and dispose of it properly.',
      quantity: 1,
      unit: 'job',
      unit_price_cents: 27500,
      sort_order: 10,
      labor_hours: 2,
    },
    {
      line_type: 'material',
      line_title: 'Supply and install new 40-gallon water heater',
      description: 'Demo-grade replacement water heater and normal installation materials.',
      customer_description: 'Supply and install a fictional 40-gallon replacement water heater for demo purposes.',
      quantity: 1,
      unit: 'each',
      unit_price_cents: 137500,
      sort_order: 20,
      supply_status: 'contractor_supplied',
    },
    {
      line_type: 'material',
      line_title: 'Replace water connections as required',
      description: 'Demo flexible water connectors and fittings.',
      customer_description: 'Replace water connections needed for the new unit.',
      quantity: 1,
      unit: 'allowance',
      unit_price_cents: 16500,
      sort_order: 30,
      supply_status: 'contractor_supplied',
    },
    {
      line_type: 'material',
      line_title: 'Install drain pan',
      description: 'Demo drain pan installed under replacement unit.',
      customer_description: 'Install or replace a drain pan under the new water heater.',
      quantity: 1,
      unit: 'each',
      unit_price_cents: 12500,
      sort_order: 40,
      supply_status: 'contractor_supplied',
    },
    {
      line_type: 'labor',
      line_title: 'Test system and clean work area',
      description: 'Fill, test, verify basic operation, and clean the garage utility area.',
      customer_description: 'Test the replacement water heater and leave the work area clean.',
      quantity: 1,
      unit: 'job',
      unit_price_cents: 22500,
      sort_order: 50,
      labor_hours: 1.5,
    },
  ];
}

async function createAcceptedEstimate(contractorClient, homeownerClient, service, runId, contractorId, homeownerId, homeId, requestId, dates) {
  const subtotalCents = 216500;
  const taxCents = 0;
  const totalCents = subtotalCents + taxCents;
  const estimate = await ensureOk(
    await contractorClient
      .from('estimates')
      .insert({
        contractor_id: contractorId,
        homeowner_user_id: homeownerId,
        home_id: homeId,
        service_request_id: requestId,
        title: 'Water heater replacement estimate',
        scope:
          'Replace the leaking 40-gallon water heater in the garage utility area using fictional demo materials and normal demo installation steps.',
        notes:
          'Demo estimate for presentation only. Pricing is fictional and should not be used as market guidance.',
        terms:
          'Demo terms: work may begin after approval. Final balance is due when the demo job is complete. No payment collection is enabled in Demo Mode.',
        status: 'draft',
        subtotal_cents: subtotalCents,
        total_cents: totalCents,
        labor_mode: 'line_specific',
        material_total_cents: 166500,
        labor_total_cents: 50000,
        tax_rate_percent: 0,
        tax_cents: taxCents,
        created_at: dates.estimateCreatedAt,
        updated_at: dates.estimateCreatedAt,
      })
      .select('id')
      .single(),
    'Unable to create demo estimate'
  );
  await registerCreatedRecord(service, runId, 'estimates', estimate.id, 'demo_estimate', 'estimate_ready');

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
    await registerCreatedRecord(service, runId, 'estimate_line_items', insertedLine.id, 'demo_estimate_line_item', 'estimate_ready');
  }

  const scheduleRows = [
    {
      invoice_type: 'deposit',
      label: 'Deposit',
      amount_type: 'fixed',
      amount_value: 350,
      calculated_amount_cents: 35000,
      due_trigger: 'Due on approval',
      sort_order: 10,
    },
    {
      invoice_type: 'final',
      label: 'Final payment',
      amount_type: 'fixed',
      amount_value: 1815,
      calculated_amount_cents: 181500,
      due_trigger: 'Due on completion',
      sort_order: 20,
    },
  ];

  for (const row of scheduleRows) {
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
      'homeowner_approval_ready'
    );
  }

  await ensureOk(
    await contractorClient
      .from('estimates')
      .update({ status: 'sent', updated_at: dates.estimateSentAt })
      .eq('id', estimate.id),
    'Unable to send demo estimate'
  );

  await ensureOk(
    await homeownerClient.rpc('servsync_homeowner_respond_to_estimate', {
      p_estimate_id: estimate.id,
      p_action: 'accept',
    }),
    'Unable to accept demo estimate through homeowner RPC'
  );

  return { estimateId: estimate.id, totalCents };
}

async function createJobFromEstimate(contractorClient, service, runId, estimateId) {
  const result = await ensureOk(
    await contractorClient.rpc('servsync_create_job_from_estimate', { p_estimate_id: estimateId }),
    'Unable to create demo job from accepted estimate through contractor RPC'
  );

  const jobId = result.job_id;
  await registerCreatedRecord(service, runId, 'inspections', jobId, 'demo_job', 'job_ready');

  const workItems = await ensureOk(
    await service.from('job_work_items').select('id').eq('inspection_id', jobId),
    'Unable to inspect demo job work items'
  );
  for (const item of workItems || []) {
    await registerRecord(service, runId, 'job_work_items', item.id, 'demo_job_work_item', 'job_ready');
  }

  const events = await ensureOk(
    await service.from('workflow_activity_events').select('id').eq('inspection_id', jobId),
    'Unable to inspect demo workflow events'
  );
  for (const event of events || []) {
    await registerRecord(service, runId, 'workflow_activity_events', event.id, 'demo_workflow_activity_event', 'job_ready');
  }

  return { jobId, workItemCount: workItems?.length || 0 };
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

function requireExactlyOneWorkflowEvent(issues, events, criteria, label) {
  const matches = filterScenarioWorkflowEvents(events, criteria);
  if (matches.length !== 1) {
    issues.push(`${label} workflow event count expected 1, found ${matches.length}.`);
    return null;
  }
  return matches[0];
}

export function verifyAcceptedEstimateWorkflowEvents(issues, { estimate, job, events }) {
  if (!estimate || !job) {
    issues.push('Accepted estimate workflow event verification requires both estimate and job records.');
    return;
  }
  if (estimate.status !== 'accepted') {
    issues.push('Demo estimate must be accepted before workflow event ordering can be verified.');
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

  if (estimateApprovedEvent) {
    assertOrderedTimestamps(issues, 'Estimate creation before estimate approval event', estimate.created_at, estimateApprovedEvent.created_at);
  }
  if (estimateApprovedEvent && jobCreatedEvent) {
    assertOrderedTimestamps(issues, 'Estimate approval event before job creation event', estimateApprovedEvent.created_at, jobCreatedEvent.created_at);
  }
  if (jobCreatedEvent) {
    assertOrderedTimestamps(issues, 'Estimate creation before job creation event', estimate.created_at, jobCreatedEvent.created_at);
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

async function verifyScenario(service, scenarioKey, env = process.env) {
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

  const records = run.records;
  const counts = countBy(records, 'table_name');
  for (const tableName of REQUIRED_SCENARIO_TABLES) {
    if (!counts[tableName]) {
      issues.push(`Required scenario table ${tableName} has no registered records.`);
    }
  }
  await verifyRegistryCompleteness(service, records, issues);

  const homeownerUser = await verifyAuthUser(service, homeownerEmail, scenarioKey, 'homeowner', issues);
  const contractorUser = await verifyAuthUser(service, contractorEmail, scenarioKey, 'contractor_owner', issues);
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
          .select('id, owner_user_id, business_name, slug, account_status')
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

  const homeId = requireExactlyOneId(issues, records, 'homes', 'demo_home', 'demo home');
  const connectionId = requireExactlyOneId(issues, records, 'homeowner_contractor_connections', 'demo_connection', 'demo connection');
  const requestId = requireExactlyOneId(issues, records, 'service_requests', 'demo_service_request', 'demo service request');
  const estimateId = requireExactlyOneId(issues, records, 'estimates', 'demo_estimate', 'demo estimate');
  const jobId = requireExactlyOneId(issues, records, 'inspections', 'demo_job', 'demo job');

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
        'id, contractor_id, homeowner_user_id, home_id, service_request_id, estimate_id, status, job_status, created_at'
      )
    : null;
  const workflowEvents =
    estimateId && jobId
      ? await ensureOk(
          await service
            .from('workflow_activity_events')
            .select('id, event_type, estimate_id, inspection_id, created_at, metadata')
            .eq('estimate_id', estimateId)
            .in('event_type', [WORKFLOW_EVENT_TYPES.estimateApproved, WORKFLOW_EVENT_TYPES.jobCreated]),
          'Unable to inspect demo workflow activity events'
        )
      : [];

  if (home && homeownerUser && (home.homeowner_user_id !== homeownerUser.id || home.nickname !== DEMO_PROPERTY.nickname)) {
    issues.push('Demo home is not linked to the expected homeowner or property marker.');
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
  if (!permissions || !permissions.share_contact || !permissions.share_home_overview || !permissions.share_address) {
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
      estimate.status !== 'accepted')
  ) {
    issues.push('Demo estimate is not accepted or not linked to the expected request/homeowner/contractor/home.');
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
      !['draft', 'scheduled'].includes(job.job_status))
  ) {
    issues.push('Demo job is not linked to the accepted estimate and expected scenario records.');
  }
  if (estimate && job && estimate.inspection_id !== job.id) {
    issues.push('Accepted estimate does not point to the linked demo job.');
  }

  if (estimateId) {
    const lineItems = recordIds(records, 'estimate_line_items', 'demo_estimate_line_item');
    const scheduleItems = recordIds(records, 'estimate_payment_schedule_items', 'demo_estimate_payment_schedule_item');
    if (lineItems.length !== estimateLines().length) {
      issues.push(`Expected ${estimateLines().length} registered estimate line items, found ${lineItems.length}.`);
    }
    if (scheduleItems.length !== 2) {
      issues.push(`Expected 2 registered estimate payment schedule rows, found ${scheduleItems.length}.`);
    }
  }

  const duplicateJobs = estimateId
    ? await ensureOk(
        await service.from('inspections').select('id').eq('estimate_id', estimateId),
        'Unable to inspect duplicate demo jobs'
      )
    : [];
  if (duplicateJobs.length !== 1) {
    issues.push(`Expected exactly one job linked to the demo estimate, found ${duplicateJobs.length}.`);
  }

  if (run.anchor_timestamp && connection && request && estimate && job) {
    assertOrderedTimestamps(issues, 'Connection before request', connection.created_at, request.created_at);
    assertOrderedTimestamps(issues, 'Request before estimate creation', request.created_at, estimate.created_at);
    verifyAcceptedEstimateWorkflowEvents(issues, { estimate, job, events: workflowEvents });
  }

  return {
    ok: issues.length === 0,
    reason: issues[0] || null,
    issues,
    runId: run.id,
    counts,
    categories: {
      runs: {
        activeSucceededRuns: succeededRunsWithRecords.length,
        unresolvedRuns: unresolvedRuns.length,
        zeroRecordRuns: zeroRecordRuns.length,
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
        estimateStatus: estimate?.status || null,
        jobStatus: job?.job_status || null,
      },
      registry: {
        tables: counts,
        recordsChecked: records.length,
      },
      notifications: notificationHandlingDecision(),
    },
  };
}

async function seedScenario(env, target, scenarioKey) {
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

    const { contractorId } = await upsertProfileRecords(service, runId, homeownerUser, contractorUser, dates, env);
    await assertNoLikelyUnregisteredScenarioRecords(service, {
      homeownerId: homeownerUser.id,
      contractorId,
    });

    runId = await startRun(service, scenarioKey, 'seed', target, dates);
    const { homeId } = await createProperty(service, runId, homeownerUser.id, dates);
    const { connectionId } = await createConnection(service, runId, homeownerUser.id, contractorId, dates);

    const homeownerClient = await signInDemoUser(makeUserClient, homeownerEmail, homeownerPassword);
    const contractorClient = await signInDemoUser(makeUserClient, contractorEmail, contractorPassword);

    const { requestId } = await createServiceRequest(homeownerClient, service, runId, connectionId, homeId, dates);
    const { estimateId, totalCents } = await createAcceptedEstimate(
      contractorClient,
      homeownerClient,
      service,
      runId,
      contractorId,
      homeownerUser.id,
      homeId,
      requestId,
      dates
    );
    const { jobId, workItemCount } = await createJobFromEstimate(contractorClient, service, runId, estimateId);

    await finishRun(service, runId, 'succeeded', {
      homeowner_user_id: homeownerUser.id,
      contractor_user_id: contractorUser.id,
      contractor_id: contractorId,
      home_id: homeId,
      service_request_id: requestId,
      estimate_id: estimateId,
      job_id: jobId,
      estimate_total_cents: totalCents,
      job_work_items_created: workItemCount,
    });

    const verification = await verifyScenario(service, scenarioKey, env);
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
        homeId,
        connectionId,
        requestId,
        estimateId,
        jobId,
        workItemCount,
      },
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
  const resetRunId = await startRun(service, scenarioKey, 'reset', target, dates);
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
    });
    return { operation: 'reset', runId: null, resetRunId, removed: resetResult.removed, considered: resetResult.considered };
  } catch (error) {
    await finishRun(service, resetRunId, 'failed', { error: error.message }).catch(() => {});
    throw error;
  }
}

async function verifyDemoScenario(env, target, scenarioKey) {
  const { service } = createSupabaseClients(env, target);
  const verification = await verifyScenario(service, scenarioKey, env);
  if (!verification.ok) {
    throw new Error(`Demo verification failed: ${verification.reason || 'scenario state is incomplete'}`);
  }
  return { operation: 'verify', verification };
}

function summarize(result, target, scenarioKey) {
  return {
    targetProjectRef: target.expectedRef,
    targetHost: target.host,
    scenario: scenarioKey,
    operation: result.operation,
    runId: result.runId || result.verification?.runId || null,
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
    verification: result.verification,
    externalEffects: result.externalEffects || 'No external effects were triggered by this runner.',
    success: true,
  };
}

export async function runDemoCommand(argv = process.argv.slice(2), env = process.env) {
  const [operation, scenarioKey] = argv;
  if (!['seed', 'reset', 'verify'].includes(operation)) {
    throw new Error('Usage: node scripts/demo/seed-demo-scenario.mjs <seed|reset|verify> water_heater_core_loop');
  }

  if (!SCENARIOS[scenarioKey]) {
    throw new Error(`Unsupported demo scenario: ${scenarioKey}`);
  }

  const target = assertSafeDemoTarget(env);
  requireResetAcknowledgement(operation, scenarioKey, env);

  if (operation === 'seed') {
    return summarize(await seedScenario(env, target, scenarioKey), target, scenarioKey);
  }

  if (operation === 'reset') {
    return summarize(await resetScenario(env, target, scenarioKey), target, scenarioKey);
  }

  return summarize(await verifyDemoScenario(env, target, scenarioKey), target, scenarioKey);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
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
