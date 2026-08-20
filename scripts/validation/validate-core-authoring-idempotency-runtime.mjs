import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const TARGETS = {
  sandbox: 'zpzdkoaubyjtsomccxya',
  demo: 'bdytwgejqnlblhrnqxkp',
};

const target = process.argv[2];
const projectRef = TARGETS[target];
if (!projectRef) {
  throw new Error('Usage: validate-core-authoring-idempotency-runtime.mjs <sandbox|demo>');
}

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required validation configuration: ${name}`);
  return value;
};

const supabaseUrl = `https://${projectRef}.supabase.co`;
const anonKey = required('SERVSYNC_VALIDATION_ANON_KEY');
const serviceRoleKey = required('SERVSYNC_VALIDATION_SERVICE_ROLE_KEY');
const managementToken = required('SERVSYNC_VALIDATION_MANAGEMENT_TOKEN');
const marker = `FB039E1-${target}-${new Date().toISOString().replace(/[-:.TZ]/g, '')}-${crypto.randomUUID().slice(0, 8)}`;

const credentialNames = target === 'sandbox'
  ? {
      owner: ['TEST_CONTRACTOR_EMAIL', 'TEST_CONTRACTOR_PASSWORD'],
      contractorB: ['TEST_CONTRACTOR_B_EMAIL', 'TEST_CONTRACTOR_B_PASSWORD'],
      homeowner: ['TEST_HOMEOWNER_EMAIL', 'TEST_HOMEOWNER_PASSWORD'],
      homeownerB: ['TEST_HOMEOWNER_B_EMAIL', 'TEST_HOMEOWNER_B_PASSWORD'],
      admin: ['TEST_CONTRACTOR_ADMIN_EMAIL', 'TEST_CONTRACTOR_ADMIN_PASSWORD'],
      office: ['TEST_CONTRACTOR_OFFICE_EMAIL', 'TEST_CONTRACTOR_OFFICE_PASSWORD'],
      field: ['TEST_CONTRACTOR_FIELD_TECH_EMAIL', 'TEST_CONTRACTOR_FIELD_TECH_PASSWORD'],
      viewer: ['TEST_CONTRACTOR_VIEWER_EMAIL', 'TEST_CONTRACTOR_VIEWER_PASSWORD'],
    }
  : {
      owner: ['DEMO_CONTRACTOR_EMAIL', 'DEMO_CONTRACTOR_PASSWORD'],
      contractorB: ['DEMO_CONTRACTOR_B_EMAIL', 'DEMO_CONTRACTOR_B_PASSWORD'],
      homeowner: ['DEMO_HOMEOWNER_EMAIL', 'DEMO_HOMEOWNER_PASSWORD'],
      homeownerB: ['DEMO_HOMEOWNER_B_EMAIL', 'DEMO_HOMEOWNER_B_PASSWORD'],
    };

function client(key) {
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

const service = client(serviceRoleKey);
const actors = {};
const operationKeys = [];
const createdRequestIds = [];
const createdEstimateIds = [];
const createdInvoiceIds = [];
const uploadedPaths = [];
const createdConnectionIds = [];
const createdLocalContactIds = [];

async function signIn(name) {
  const names = credentialNames[name];
  if (!names) return null;
  const email = required(names[0]);
  const password = required(names[1]);
  const actor = client(anonKey);
  const { data, error } = await actor.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`${name} validation sign-in failed.`);
  actors[name] = actor;
  return { client: actor, user: data.user };
}

async function rpcOk(actor, name, args) {
  const { data, error } = await actor.rpc(name, args);
  if (error) throw new Error(`${name} failed: ${error.message}`);
  return data;
}

async function rpcDenied(actor, name, args, label) {
  const { error } = await actor.rpc(name, args);
  assert.ok(error, `${label} must be denied`);
}

async function managementQuery(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${managementToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) throw new Error(`Management validation query failed with HTTP ${response.status}.`);
  return response.json();
}

function uuid() {
  const value = crypto.randomUUID();
  operationKeys.push(value);
  return value;
}

function estimatePayload(subject, title, suffix = '') {
  return {
    homeowner_user_id: subject.homeownerUserId ?? null,
    local_contact_id: subject.localContactId ?? null,
    service_request_id: null,
    inspection_id: null,
    home_id: subject.homeId ?? null,
    local_home_id: subject.localHomeId ?? null,
    title,
    scope: `${marker} estimate scope${suffix}`,
    notes: `${marker} estimate notes${suffix}`,
    terms: 'Due on completion.',
    subtotal_cents: 12500,
    total_cents: 12500,
    labor_mode: 'line_specific',
    labor_rate_cents: 7500,
    job_labor_hours: null,
    material_total_cents: 5000,
    labor_total_cents: 7500,
    fee_total_cents: 0,
    other_total_cents: 0,
    tax_rate_percent: null,
    tax_cents: 0,
    line_items: [
      { line_type: 'material', description: `${marker} part${suffix}`, line_title: 'Part', customer_description: 'Replacement part', model_spec: null, supply_status: 'contractor_supplied', quantity: 1, unit: 'each', unit_price_cents: 5000, labor_hours: null, sort_order: 0 },
      { line_type: 'labor', description: `${marker} labor${suffix}`, line_title: 'Labor', customer_description: 'Installation labor', model_spec: null, supply_status: null, quantity: 1, unit: 'hour', unit_price_cents: 7500, labor_hours: 1, sort_order: 1 },
    ],
    payment_schedule_items: [
      { invoice_type: 'deposit', label: 'Deposit', amount_type: 'percentage', amount_value: 40, calculated_amount_cents: 5000, due_trigger: 'Due on approval', sort_order: 0 },
      { invoice_type: 'final', label: 'Final payment', amount_type: 'fixed', amount_value: 7500, calculated_amount_cents: 7500, due_trigger: 'Due on completion', sort_order: 1 },
    ],
  };
}

function invoicePayload(subject, title, suffix = '') {
  return {
    homeowner_user_id: subject.homeownerUserId ?? null,
    local_contact_id: subject.localContactId ?? null,
    service_request_id: null,
    job_id: null,
    estimate_id: null,
    home_id: subject.homeId ?? null,
    local_home_id: subject.localHomeId ?? null,
    invoice_number: `${marker.slice(-8)}${suffix}`,
    title,
    scope: `${marker} invoice scope${suffix}`,
    notes: `${marker} invoice notes${suffix}`,
    terms: 'Due on receipt.',
    subtotal_cents: 12500,
    labor_mode: 'line_specific',
    labor_rate_cents: 7500,
    job_labor_hours: null,
    material_total_cents: 5000,
    labor_total_cents: 7500,
    fee_total_cents: 0,
    other_total_cents: 0,
    tax_cents: 0,
    tax_rate_percent: 0,
    discount_cents: 0,
    discount_type: 'amount',
    discount_value: 0,
    discount_reason: '',
    total_cents: 12500,
    due_at: null,
    line_items: [
      { job_work_item_id: null, line_type: 'material', description: `${marker} invoice part${suffix}`, line_title: 'Part', customer_description: 'Replacement part', model_spec: null, supply_status: 'contractor_supplied', quantity: 1, unit: 'each', unit_price_cents: 5000, labor_hours: null, sort_order: 0 },
      { job_work_item_id: null, line_type: 'labor', description: `${marker} invoice labor${suffix}`, line_title: 'Labor', customer_description: 'Installation labor', model_spec: null, supply_status: null, quantity: 1, unit: 'hour', unit_price_cents: 7500, labor_hours: 1, sort_order: 1 },
    ],
  };
}

async function countRows(table, column, value) {
  const { count, error } = await service.from(table).select('*', { count: 'exact', head: true }).eq(column, value);
  if (error) throw new Error(`Could not count ${table}: ${error.message}`);
  return count ?? 0;
}

async function cleanup() {
  for (const path of uploadedPaths) {
    const { error } = await service.storage.from('service-request-media').remove([path]);
    if (error) throw new Error(`Could not remove validation Storage object: ${error.message}`);
  }
  const requestIds = createdRequestIds.map(value => `'${value}'::uuid`).join(',') || 'null::uuid';
  const estimateIds = createdEstimateIds.map(value => `'${value}'::uuid`).join(',') || 'null::uuid';
  const invoiceIds = createdInvoiceIds.map(value => `'${value}'::uuid`).join(',') || 'null::uuid';
  const keys = operationKeys.map(value => `'${value}'::uuid`).join(',') || 'null::uuid';
  const connectionIds = createdConnectionIds.map(value => `'${value}'::uuid`).join(',') || 'null::uuid';
  const localContactIds = createdLocalContactIds.map(value => `'${value}'::uuid`).join(',') || 'null::uuid';
  await managementQuery(`
    begin;
    delete from public.workflow_activity_events
     where service_request_id in (${requestIds})
        or estimate_id in (${estimateIds})
        or invoice_id in (${invoiceIds});
    delete from public.service_requests where id in (${requestIds});
    delete from public.estimates where id in (${estimateIds});
    delete from public.invoices where id in (${invoiceIds});
    delete from public.homeowner_contractor_connections where id in (${connectionIds});
    delete from public.contractor_local_contacts where id in (${localContactIds});
    delete from public.servsync_core_authoring_operations where operation_key in (${keys});
    commit;
  `);
  const residue = await managementQuery(`
    select
      (select count(*) from public.service_requests where id in (${requestIds}))
      + (select count(*) from public.estimates where id in (${estimateIds}))
      + (select count(*) from public.invoices where id in (${invoiceIds}))
      + (select count(*) from public.homeowner_contractor_connections where id in (${connectionIds}))
      + (select count(*) from public.contractor_local_contacts where id in (${localContactIds}))
      + (select count(*) from public.servsync_core_authoring_operations where operation_key in (${keys}))
      as remaining;
  `);
  assert.equal(Number(residue[0]?.remaining ?? -1), 0, 'validation database fixtures must be removed');
  await Promise.all(Object.values(actors).map(actor => actor.auth.signOut().catch(() => undefined)));
}

async function run() {
  const owner = await signIn('owner');
  const homeowner = await signIn('homeowner');
  const contractorB = await signIn('contractorB');
  const homeownerB = await signIn('homeownerB');

  const ownerProfile = await rpcOk(owner.client, 'servsync_current_contractor_profile', {});
  const contractorId = ownerProfile?.[0]?.id;
  assert.ok(contractorId, 'Owner contractor context is required');

  const { data: connections, error: connectionError } = await homeowner.client
    .from('homeowner_contractor_connections')
    .select('id, contractor_id, homeowner_user_id, status')
    .eq('contractor_id', contractorId)
    .eq('status', 'active');
  if (connectionError) throw connectionError;
  let connection = connections?.[0];
  if (!connection) {
    const { data, error } = await service.from('homeowner_contractor_connections').insert({
      homeowner_user_id: homeowner.user.id,
      contractor_id: contractorId,
      status: 'active',
      source: 'fb039e1_validation',
    }).select('id, contractor_id, homeowner_user_id, status').single();
    if (error) throw new Error(`Could not create the isolated connection fixture: ${error.message}`);
    connection = data;
    createdConnectionIds.push(data.id);
  }
  assert.ok(connection, 'The homeowner fixture needs an active connection to the owner fixture');
  const { data: homes, error: homeError } = await homeowner.client.from('homes').select('id').limit(1);
  if (homeError) throw homeError;
  assert.ok(homes?.[0]?.id, 'The homeowner fixture needs one owned home');
  const subject = { homeownerUserId: connection.homeowner_user_id, homeId: homes[0].id };
  const localFixture = await rpcOk(owner.client, 'servsync_create_local_contact', {
    p_display_name: `${marker} Local Customer`,
    p_phone: '',
    p_email: '',
    p_notes: `${marker} controlled local-subject parity fixture`,
    p_home_nickname: `${marker} Local Property`,
    p_address_line1: '1 Validation Lane',
    p_address_line2: '',
    p_city: 'Testville',
    p_state: 'AL',
    p_zip_code: '36532',
    p_home_type: 'Single family',
    p_year_built: '',
    p_square_feet: '',
    p_home_notes: '',
  });
  assert.ok(localFixture?.contact?.id && localFixture?.home?.id, 'The local customer/property fixture must be created atomically');
  createdLocalContactIds.push(localFixture.contact.id);
  const localSubject = {
    localContactId: localFixture.contact.id,
    localHomeId: localFixture.home.id,
  };

  const requestKey = uuid();
  const requestPayload = {
    connection_id: connection.id,
    home_id: subject.homeId,
    category: 'General Maintenance',
    urgency: 'normal',
    title: `${marker} Request`,
    description: `${marker} durable Request replay validation.`,
    media: [],
  };
  const prepared = await Promise.all([
    rpcOk(homeowner.client, 'servsync_prepare_service_request_creation', { p_operation_key: requestKey, p_payload: requestPayload }),
    rpcOk(homeowner.client, 'servsync_prepare_service_request_creation', { p_operation_key: requestKey, p_payload: requestPayload }),
  ]);
  assert.equal(prepared[0].operation_key, prepared[1].operation_key);
  const committed = await Promise.all([
    rpcOk(homeowner.client, 'servsync_commit_service_request_creation', { p_operation_key: requestKey, p_payload: requestPayload }),
    rpcOk(homeowner.client, 'servsync_commit_service_request_creation', { p_operation_key: requestKey, p_payload: requestPayload }),
  ]);
  assert.equal(committed[0].request_id, committed[1].request_id);
  createdRequestIds.push(committed[0].request_id);
  const lostRequest = await rpcOk(homeowner.client, 'servsync_commit_service_request_creation', { p_operation_key: requestKey, p_payload: requestPayload });
  assert.equal(lostRequest.request_id, committed[0].request_id);
  assert.equal(await countRows('service_requests', 'id', committed[0].request_id), 1);
  assert.equal(await countRows('service_request_messages', 'request_id', committed[0].request_id), 1);
  assert.equal(await countRows('service_request_media', 'request_id', committed[0].request_id), 0);
  await rpcDenied(homeowner.client, 'servsync_prepare_service_request_creation', {
    p_operation_key: requestKey,
    p_payload: { ...requestPayload, title: `${marker} conflicting Request` },
  }, 'Request same-key/different-payload replay');

  const mediaKey = uuid();
  const bytes = Uint8Array.from(Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415408d763f8cfc0f01f00050001ff89993d1d0000000049454e44ae426082', 'hex'));
  const mediaSha = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
  const mediaPayload = {
    ...requestPayload,
    title: `${marker} Request with media`,
    media: [{ file_name: 'fixture.png', content_type: 'image/png', file_size_bytes: bytes.byteLength, extension: 'png', sha256: mediaSha }],
  };
  const mediaPreparation = await rpcOk(homeowner.client, 'servsync_prepare_service_request_creation', { p_operation_key: mediaKey, p_payload: mediaPayload });
  const mediaPath = mediaPreparation.media_manifest?.[0]?.storage_path;
  assert.ok(mediaPath);
  uploadedPaths.push(mediaPath);
  const { error: uploadError } = await homeowner.client.storage.from('service-request-media').upload(mediaPath, bytes, {
    contentType: 'image/png',
    upsert: false,
    metadata: { servsync_sha256: mediaSha, servsync_operation_key: mediaKey },
  });
  if (uploadError) throw new Error(`Prepared Request media upload failed: ${uploadError.message}`);
  const mediaResult = await rpcOk(homeowner.client, 'servsync_commit_service_request_creation', { p_operation_key: mediaKey, p_payload: mediaPayload });
  createdRequestIds.push(mediaResult.request_id);
  const mediaReplay = await rpcOk(homeowner.client, 'servsync_commit_service_request_creation', { p_operation_key: mediaKey, p_payload: mediaPayload });
  assert.equal(mediaReplay.request_id, mediaResult.request_id);
  assert.equal(await countRows('service_request_media', 'request_id', mediaResult.request_id), 1);

  const estimateKey = uuid();
  const estimate = estimatePayload(subject, `${marker} Estimate`);
  const estimateResults = await Promise.all([
    rpcOk(owner.client, 'servsync_save_estimate_draft_idempotent', { p_operation_key: estimateKey, p_estimate_id: null, p_payload: estimate }),
    rpcOk(owner.client, 'servsync_save_estimate_draft_idempotent', { p_operation_key: estimateKey, p_estimate_id: null, p_payload: estimate }),
  ]);
  const estimateId = estimateResults[0].estimate.id;
  createdEstimateIds.push(estimateId);
  assert.equal(estimateResults[1].estimate.id, estimateId);
  assert.equal((await rpcOk(owner.client, 'servsync_save_estimate_draft_idempotent', { p_operation_key: estimateKey, p_estimate_id: null, p_payload: estimate })).estimate.id, estimateId);
  assert.equal(await countRows('estimates', 'id', estimateId), 1);
  assert.equal(await countRows('estimate_line_items', 'estimate_id', estimateId), 2);
  assert.equal(await countRows('estimate_payment_schedule_items', 'estimate_id', estimateId), 2);
  await rpcDenied(owner.client, 'servsync_save_estimate_draft_idempotent', { p_operation_key: estimateKey, p_estimate_id: null, p_payload: { ...estimate, title: `${marker} conflict` } }, 'Estimate same-key/different-payload replay');

  const estimateUpdateKey = uuid();
  const estimateUpdate = estimatePayload(subject, `${marker} Estimate updated`, ' updated');
  const estimateUpdates = await Promise.all([
    rpcOk(owner.client, 'servsync_save_estimate_draft_idempotent', { p_operation_key: estimateUpdateKey, p_estimate_id: estimateId, p_payload: estimateUpdate }),
    rpcOk(owner.client, 'servsync_save_estimate_draft_idempotent', { p_operation_key: estimateUpdateKey, p_estimate_id: estimateId, p_payload: estimateUpdate }),
  ]);
  assert.equal(estimateUpdates[0].estimate.id, estimateUpdates[1].estimate.id);
  assert.equal(await countRows('estimate_line_items', 'estimate_id', estimateId), 2);
  assert.equal(await countRows('estimate_payment_schedule_items', 'estimate_id', estimateId), 2);
  const invalidEstimateKey = uuid();
  await rpcDenied(owner.client, 'servsync_save_estimate_draft_idempotent', {
    p_operation_key: invalidEstimateKey,
    p_estimate_id: estimateId,
    p_payload: { ...estimateUpdate, payment_schedule_items: [{ ...estimateUpdate.payment_schedule_items[0], amount_value: -1 }] },
  }, 'invalid Estimate replacement');
  assert.equal(await countRows('estimate_line_items', 'estimate_id', estimateId), 2);
  assert.equal(await countRows('estimate_payment_schedule_items', 'estimate_id', estimateId), 2);

  const invoiceKey = uuid();
  const invoice = invoicePayload(subject, `${marker} Invoice`);
  const invoiceResults = await Promise.all([
    rpcOk(owner.client, 'servsync_save_invoice_draft_idempotent', { p_operation_key: invoiceKey, p_invoice_id: null, p_payload: invoice }),
    rpcOk(owner.client, 'servsync_save_invoice_draft_idempotent', { p_operation_key: invoiceKey, p_invoice_id: null, p_payload: invoice }),
  ]);
  const invoiceId = invoiceResults[0].invoice.id;
  createdInvoiceIds.push(invoiceId);
  assert.equal(invoiceResults[1].invoice.id, invoiceId);
  assert.equal((await rpcOk(owner.client, 'servsync_save_invoice_draft_idempotent', { p_operation_key: invoiceKey, p_invoice_id: null, p_payload: invoice })).invoice.id, invoiceId);
  assert.equal(await countRows('invoices', 'id', invoiceId), 1);
  assert.equal(await countRows('invoice_line_items', 'invoice_id', invoiceId), 2);

  const localEstimateKey = uuid();
  const localEstimate = await rpcOk(owner.client, 'servsync_save_estimate_draft_idempotent', {
    p_operation_key: localEstimateKey,
    p_estimate_id: null,
    p_payload: estimatePayload(localSubject, `${marker} Local Estimate`, ' local'),
  });
  createdEstimateIds.push(localEstimate.estimate.id);
  assert.equal(await countRows('estimate_line_items', 'estimate_id', localEstimate.estimate.id), 2);

  const localInvoiceKey = uuid();
  const localInvoice = await rpcOk(owner.client, 'servsync_save_invoice_draft_idempotent', {
    p_operation_key: localInvoiceKey,
    p_invoice_id: null,
    p_payload: invoicePayload(localSubject, `${marker} Local Invoice`, 'L'),
  });
  createdInvoiceIds.push(localInvoice.invoice.id);
  assert.equal(await countRows('invoice_line_items', 'invoice_id', localInvoice.invoice.id), 2);
  await rpcDenied(owner.client, 'servsync_save_invoice_draft_idempotent', { p_operation_key: invoiceKey, p_invoice_id: null, p_payload: { ...invoice, title: `${marker} conflict` } }, 'Invoice same-key/different-payload replay');

  const invoiceUpdateKey = uuid();
  const invoiceUpdate = invoicePayload(subject, `${marker} Invoice updated`, 'U');
  const invoiceUpdates = await Promise.all([
    rpcOk(owner.client, 'servsync_save_invoice_draft_idempotent', { p_operation_key: invoiceUpdateKey, p_invoice_id: invoiceId, p_payload: invoiceUpdate }),
    rpcOk(owner.client, 'servsync_save_invoice_draft_idempotent', { p_operation_key: invoiceUpdateKey, p_invoice_id: invoiceId, p_payload: invoiceUpdate }),
  ]);
  assert.equal(invoiceUpdates[0].invoice.id, invoiceUpdates[1].invoice.id);
  assert.equal(await countRows('invoice_line_items', 'invoice_id', invoiceId), 2);
  const invalidInvoiceKey = uuid();
  await rpcDenied(owner.client, 'servsync_save_invoice_draft_idempotent', {
    p_operation_key: invalidInvoiceKey,
    p_invoice_id: invoiceId,
    p_payload: { ...invoiceUpdate, line_items: [{ ...invoiceUpdate.line_items[0], quantity: 0 }] },
  }, 'invalid Invoice replacement');
  assert.equal(await countRows('invoice_line_items', 'invoice_id', invoiceId), 2);

  const foreignEstimateKey = uuid();
  await rpcDenied(contractorB.client, 'servsync_save_estimate_draft_idempotent', { p_operation_key: foreignEstimateKey, p_estimate_id: estimateId, p_payload: estimateUpdate }, 'cross-tenant Estimate update');
  const foreignInvoiceKey = uuid();
  await rpcDenied(contractorB.client, 'servsync_save_invoice_draft_idempotent', { p_operation_key: foreignInvoiceKey, p_invoice_id: invoiceId, p_payload: invoiceUpdate }, 'cross-tenant Invoice update');
  const homeownerEstimateKey = uuid();
  await rpcDenied(homeowner.client, 'servsync_save_estimate_draft_idempotent', { p_operation_key: homeownerEstimateKey, p_estimate_id: null, p_payload: estimate }, 'homeowner Estimate create');
  const homeownerInvoiceKey = uuid();
  await rpcDenied(homeowner.client, 'servsync_save_invoice_draft_idempotent', { p_operation_key: homeownerInvoiceKey, p_invoice_id: null, p_payload: invoice }, 'homeowner Invoice create');
  const wrongRequestKey = uuid();
  await rpcDenied(homeownerB.client, 'servsync_prepare_service_request_creation', { p_operation_key: wrongRequestKey, p_payload: requestPayload }, 'cross-homeowner Request create');

  if (target === 'sandbox') {
    const roleResults = {};
    for (const role of ['admin', 'office', 'field', 'viewer']) {
      const signed = await signIn(role);
      const estimateRoleKey = uuid();
      const invoiceRoleKey = uuid();
      if (role === 'admin' || role === 'office') {
        const estimateRole = await rpcOk(signed.client, 'servsync_save_estimate_draft_idempotent', { p_operation_key: estimateRoleKey, p_estimate_id: null, p_payload: estimatePayload(subject, `${marker} ${role} Estimate`) });
        const invoiceRole = await rpcOk(signed.client, 'servsync_save_invoice_draft_idempotent', { p_operation_key: invoiceRoleKey, p_invoice_id: null, p_payload: invoicePayload(subject, `${marker} ${role} Invoice`, role[0]) });
        createdEstimateIds.push(estimateRole.estimate.id);
        createdInvoiceIds.push(invoiceRole.invoice.id);
        roleResults[role] = 'Estimate+Invoice allowed';
      } else {
        await rpcDenied(signed.client, 'servsync_save_estimate_draft_idempotent', { p_operation_key: estimateRoleKey, p_estimate_id: null, p_payload: estimatePayload(subject, `${marker} ${role} Estimate`) }, `${role} Estimate create`);
        await rpcDenied(signed.client, 'servsync_save_invoice_draft_idempotent', { p_operation_key: invoiceRoleKey, p_invoice_id: null, p_payload: invoicePayload(subject, `${marker} ${role} Invoice`, role[0]) }, `${role} Invoice create`);
        roleResults[role] = 'Estimate+Invoice denied';
      }
    }
    assert.deepEqual(roleResults, {
      admin: 'Estimate+Invoice allowed',
      office: 'Estimate+Invoice allowed',
      field: 'Estimate+Invoice denied',
      viewer: 'Estimate+Invoice denied',
    });
  }

  const { error: sentError } = await service.from('estimates').update({ status: 'sent' }).eq('id', estimateId);
  if (sentError) throw sentError;
  const sentEstimateKey = uuid();
  await rpcDenied(owner.client, 'servsync_save_estimate_draft_idempotent', { p_operation_key: sentEstimateKey, p_estimate_id: estimateId, p_payload: estimateUpdate }, 'sent Estimate update');
  assert.equal(await countRows('estimate_line_items', 'estimate_id', estimateId), 2);

  const { error: sentInvoiceError } = await service.from('invoices').update({ status: 'sent', issued_at: new Date().toISOString() }).eq('id', invoiceId);
  if (sentInvoiceError) throw sentInvoiceError;
  const sentInvoiceKey = uuid();
  await rpcDenied(owner.client, 'servsync_save_invoice_draft_idempotent', { p_operation_key: sentInvoiceKey, p_invoice_id: invoiceId, p_payload: invoiceUpdate }, 'non-Draft Invoice update');
  assert.equal(await countRows('invoice_line_items', 'invoice_id', invoiceId), 2);

  const receiptRows = await managementQuery(`select operation_type, count(*)::integer as count from public.servsync_core_authoring_operations where operation_key in (${operationKeys.map(value => `'${value}'::uuid`).join(',')}) group by operation_type order by operation_type;`);
  const receiptCounts = Object.fromEntries(receiptRows.map(row => [row.operation_type, row.count]));
  assert.equal(receiptCounts.service_request_create, 2);
  assert.equal(receiptCounts.estimate_draft_save, target === 'sandbox' ? 5 : 3);
  assert.equal(receiptCounts.invoice_draft_save, target === 'sandbox' ? 5 : 3);

  console.log(JSON.stringify({
    target,
    projectRef,
    marker,
    request: { sequentialReplay: 'PASS', concurrentReplay: 'PASS', lostResponseReplay: 'PASS', conflict: 'PASS', media: 'PASS' },
    estimate: { createReplay: 'PASS', updateReplay: 'PASS', replacementAtomicity: 'PASS', lifecycleDenial: 'PASS', connectedLocalParity: 'PASS' },
    invoice: { createReplay: 'PASS', updateReplay: 'PASS', replacementAtomicity: 'PASS', lifecycleDenial: 'PASS', connectedLocalParity: 'PASS' },
    security: { crossTenant: 'PASS', homeownerAuthoringDenial: 'PASS', roleMatrix: target === 'sandbox' ? 'PASS' : 'bounded-owner-smoke' },
  }, null, 2));
}

try {
  await run();
} finally {
  await cleanup();
}
