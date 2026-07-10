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
    if (String(env[flag] || '').toLowerCase() === 'true') {
      throw new Error(`Demo runner refused: ${flag} must not be true for Demo Mode seeding.`);
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

async function findAuthUserByEmail(service, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 100 });
    if (error) {
      throw new Error(`Unable to inspect demo auth users: ${error.message}`);
    }

    const user = data.users.find((item) => item.email?.toLowerCase() === email.toLowerCase());
    if (user) {
      return user;
    }

    if (data.users.length < 100) {
      return null;
    }
  }

  throw new Error('Unable to reconcile demo auth users within the expected page limit.');
}

async function ensureAuthUser(service, email, password, userMetadata) {
  const existing = await findAuthUserByEmail(service, email);
  if (existing) {
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

async function getLatestSucceededRun(service, scenarioKey) {
  const run = await maybeSingle(
    await service
      .from('demo_scenario_runs')
      .select('id, scenario_key, status, started_at')
      .eq('scenario_key', scenarioKey)
      .eq('status', 'succeeded')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    'Unable to inspect latest demo run'
  );
  return run;
}

async function resetRun(service, runId) {
  const data = await ensureOk(
    await service.rpc('servsync_demo_reset_registered_run', { p_run_id: runId }),
    'Unable to reset registered demo records'
  );
  return data || [];
}

async function resetLatestIfPresent(service, scenarioKey) {
  const run = await getLatestSucceededRun(service, scenarioKey);
  if (!run) {
    return { runId: null, removed: [] };
  }

  return {
    runId: run.id,
    removed: await resetRun(service, run.id),
  };
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
  await registerRecord(service, runId, 'homes', home.id, 'demo_home', 'property_ready');

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
  await registerRecord(service, runId, 'home_rooms', room.id, 'demo_utility_room', 'property_ready');

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
  await registerRecord(service, runId, 'service_requests', requestId, 'demo_service_request', 'request_ready');

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
  await registerRecord(service, runId, 'estimates', estimate.id, 'demo_estimate', 'estimate_ready');

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
    await registerRecord(service, runId, 'estimate_line_items', insertedLine.id, 'demo_estimate_line_item', 'estimate_ready');
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
    await registerRecord(
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

  await ensureOk(
    await service.from('estimates').update({ updated_at: dates.estimateAcceptedAt }).eq('id', estimate.id),
    'Unable to set demo estimate accepted date'
  );

  return { estimateId: estimate.id, totalCents };
}

async function createJobFromEstimate(contractorClient, service, runId, estimateId, dates) {
  const result = await ensureOk(
    await contractorClient.rpc('servsync_create_job_from_estimate', { p_estimate_id: estimateId }),
    'Unable to create demo job from accepted estimate through contractor RPC'
  );

  const jobId = result.job_id;
  await registerRecord(service, runId, 'inspections', jobId, 'demo_job', 'job_ready');

  await ensureOk(
    await service.from('inspections').update({ created_at: dates.jobCreatedAt, updated_at: dates.jobCreatedAt }).eq('id', jobId),
    'Unable to set demo job date'
  );

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

async function registerRecentNotifications(service, runId, homeownerId, contractorId, dates) {
  const notifications = await ensureOk(
    await service
      .from('notifications')
      .select('id')
      .in('user_id', [homeownerId, contractorId])
      .gte('created_at', dates.requestCreatedAt),
    'Unable to inspect demo notifications'
  );

  for (const notification of notifications || []) {
    await registerRecord(service, runId, 'notifications', notification.id, 'demo_notification', 'job_ready');
  }
}

async function verifyScenario(service, scenarioKey) {
  const run = await getLatestSucceededRun(service, scenarioKey);
  if (!run) {
    return { ok: false, reason: 'No succeeded demo scenario run found.' };
  }

  const records = await ensureOk(
    await service.from('demo_scenario_records').select('table_name, record_role').eq('run_id', run.id),
    'Unable to inspect registered demo records'
  );

  const counts = records.reduce((acc, record) => {
    acc[record.table_name] = (acc[record.table_name] || 0) + 1;
    return acc;
  }, {});

  const hasRequest = (counts.service_requests || 0) >= 1;
  const hasEstimate = (counts.estimates || 0) >= 1;
  const hasJob = (counts.inspections || 0) >= 1;

  return {
    ok: hasRequest && hasEstimate && hasJob,
    runId: run.id,
    counts,
  };
}

async function seedScenario(env, target, scenarioKey) {
  const dates = buildDatePlan(env.DEMO_ANCHOR_TIMESTAMP || new Date());
  const { service, anonKey, makeUserClient } = createSupabaseClients(env, target);

  const previousReset = await resetLatestIfPresent(service, scenarioKey);
  const runId = await startRun(service, scenarioKey, 'seed', target, dates);

  try {
    const homeownerEmail = env.DEMO_HOMEOWNER_EMAIL || DEMO_HOMEOWNER.defaultEmail;
    const contractorEmail = env.DEMO_CONTRACTOR_EMAIL || DEMO_CONTRACTOR.defaultEmail;
    const homeownerPassword = requireEnv(env, 'DEMO_HOMEOWNER_PASSWORD');
    const contractorPassword = requireEnv(env, 'DEMO_CONTRACTOR_PASSWORD');

    const homeownerUser = await ensureAuthUser(service, homeownerEmail, homeownerPassword, {
      demo_scenario: scenarioKey,
      demo_role: 'homeowner',
    });
    const contractorUser = await ensureAuthUser(service, contractorEmail, contractorPassword, {
      demo_scenario: scenarioKey,
      demo_role: 'contractor_owner',
    });

    const { contractorId } = await upsertProfileRecords(service, runId, homeownerUser, contractorUser, dates, env);
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
    const { jobId, workItemCount } = await createJobFromEstimate(contractorClient, service, runId, estimateId, dates);
    await registerRecentNotifications(service, runId, homeownerUser.id, contractorUser.id, dates);

    const verification = await verifyScenario(service, scenarioKey);
    if (!verification.ok) {
      throw new Error(`Demo seed verification failed: ${verification.reason || 'missing registered records'}`);
    }

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
      externalEffects: 'No email, SMS, push, Stripe, webhook, accounting, AI, geocoding, storage, or deployment calls were made by this runner.',
      anonKeyUsed: Boolean(anonKey),
    };
  } catch (error) {
    await finishRun(service, runId, 'failed', { error: error.message }).catch(() => {});
    throw error;
  }
}

async function resetScenario(env, target, scenarioKey) {
  const dates = buildDatePlan(env.DEMO_ANCHOR_TIMESTAMP || new Date());
  const { service } = createSupabaseClients(env, target);
  const run = await getLatestSucceededRun(service, scenarioKey);
  if (!run) {
    return { operation: 'reset', removed: [], runId: null, message: 'No succeeded demo run found.' };
  }

  const resetRunId = await startRun(service, scenarioKey, 'reset', target, dates);
  const removed = await resetRun(service, run.id);
  await finishRun(service, resetRunId, 'succeeded', { reset_source_run_id: run.id, removed_count: removed.length });
  return { operation: 'reset', runId: run.id, resetRunId, removed };
}

async function verifyDemoScenario(env, target, scenarioKey) {
  const { service } = createSupabaseClients(env, target);
  return { operation: 'verify', verification: await verifyScenario(service, scenarioKey) };
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
