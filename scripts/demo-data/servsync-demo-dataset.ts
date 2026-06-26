import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { demoRecords, type DemoLineItem } from './demoRecords.ts';

type DemoMode = 'dry-run' | 'apply' | 'check-production-blocks';

const PRODUCTION_APP_HOSTS = new Set(['servsync.app', 'www.servsync.app']);
const PRODUCTION_SUPABASE_REF = 'uqgtheclhxqlnjpfmheq';
const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const REQUIRED_CONFIRMATION = 'SERVSYNC_ALLOW_DEMO_DATA_SETUP';

type SetupContext = {
  dryRun: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  homeownerCredentials: DemoCredentials;
  contractorCredentials: DemoCredentials;
};

type DemoCredentials = {
  email: string;
  password: string;
};

type ContractorContext = {
  user: User;
  client: SupabaseClient;
  contractorId: string;
  localContactId: string | null;
};

loadLocalEnvFiles();

main().catch(error => {
  console.error(`Demo data setup failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

async function main() {
  const mode = parseMode();

  if (mode === 'check-production-blocks') {
    runProductionGuardSelfCheck();
    return;
  }

  const context = readSetupContext(mode);
  printPlan(context);

  if (context.dryRun) {
    console.log('Dry run complete. No records were created or updated.');
    return;
  }

  const homeowner = await signInDemoUser(context, context.homeownerCredentials, 'homeowner');
  const contractor = await signInDemoUser(context, context.contractorCredentials, 'contractor');

  await prepareHomeownerRecords(homeowner.client, homeowner.user.id);
  const contractorContext = await prepareContractorRecords(contractor.client, contractor.user);
  await prepareDemoEstimate(contractorContext);
  await prepareDemoInvoice(contractorContext);
  await tryPrepareServiceRequest(homeowner.client, homeowner.user.id);

  console.log('Demo data setup complete for the configured non-production demo accounts.');
  console.log('Skipped by design: auth user creation, file/media uploads, Discover posts, payment data, and production-only workflows.');
}

function parseMode(): DemoMode {
  const args = new Set(process.argv.slice(2));
  if (args.has('--check-production-blocks')) return 'check-production-blocks';
  if (args.has('--apply')) return 'apply';
  return 'dry-run';
}

function loadLocalEnvFiles() {
  for (const fileName of ['.env', '.env.local', '.env.test.local']) {
    const path = resolve(process.cwd(), fileName);
    if (!existsSync(path)) continue;

    const contents = readFileSync(path, 'utf8');
    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
    }
  }
}

function readSetupContext(mode: DemoMode): SetupContext {
  const testAppUrl = requiredEnv('TEST_APP_URL');
  const supabaseUrl = requiredEnv('VITE_SUPABASE_URL');
  const supabaseAnonKey = requiredEnv('VITE_SUPABASE_ANON_KEY');
  assertAllowedToRun(testAppUrl, supabaseUrl);

  const confirmed = process.env[REQUIRED_CONFIRMATION]?.trim() === 'true';
  if (!confirmed) {
    throw new Error(`Missing ${REQUIRED_CONFIRMATION}=true. This confirmation is required even for dry runs.`);
  }

  const dryRun = mode !== 'apply';
  const homeownerCredentials = readDemoCredentials(
    'MARKETING_DEMO_HOMEOWNER_EMAIL',
    'MARKETING_DEMO_HOMEOWNER_PASSWORD',
    dryRun,
  );
  const contractorCredentials = readDemoCredentials(
    'MARKETING_DEMO_CONTRACTOR_EMAIL',
    'MARKETING_DEMO_CONTRACTOR_PASSWORD',
    dryRun,
  );

  return {
    dryRun,
    supabaseUrl,
    supabaseAnonKey,
    homeownerCredentials,
    contractorCredentials,
  };
}

function readDemoCredentials(emailName: string, passwordName: string, dryRun: boolean): DemoCredentials {
  const email = process.env[emailName]?.trim() || '';
  const password = process.env[passwordName]?.trim() || '';

  if (!email || !password) {
    if (dryRun) {
      return { email: email || `${emailName.toLowerCase()}@example.com`, password: '' };
    }
    throw new Error(`Missing ${emailName} or ${passwordName}. Use manually created non-production demo accounts only.`);
  }

  assertDemoEmail(email, emailName);
  return { email, password };
}

function assertAllowedToRun(testAppUrl: string, supabaseUrl: string) {
  const parsedAppUrl = parseUrl(testAppUrl, 'TEST_APP_URL');
  if (PRODUCTION_APP_HOSTS.has(parsedAppUrl.hostname.toLowerCase())) {
    throw new Error('Refusing to run demo data setup against the ServSync production app host.');
  }

  const parsedSupabaseUrl = parseUrl(supabaseUrl, 'VITE_SUPABASE_URL');
  const host = parsedSupabaseUrl.hostname.toLowerCase();
  if (host.includes(PRODUCTION_SUPABASE_REF)) {
    throw new Error('Refusing to run demo data setup against the production Supabase project.');
  }

  if (!host.includes(SANDBOX_SUPABASE_REF)) {
    console.warn(
      'Warning: Supabase URL is not the known sandbox project ref. Continue only if this is a non-production preview/staging project.',
    );
  }
}

function assertDemoEmail(email: string, envName: string) {
  if (!email.toLowerCase().endsWith('@example.com')) {
    throw new Error(`${envName} must use an example.com demo email address.`);
  }
}

function parseUrl(value: string, name: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new Error(`Invalid ${name}.`);
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}.`);
  return value;
}

function printPlan(context: SetupContext) {
  console.log(context.dryRun ? 'ServSync marketing demo data dry run' : 'ServSync marketing demo data setup');
  console.log('- Target app URL: non-production URL accepted');
  console.log(`- Target Supabase: ${new URL(context.supabaseUrl).hostname}`);
  console.log(`- Homeowner demo email env present: ${Boolean(process.env.MARKETING_DEMO_HOMEOWNER_EMAIL?.trim())}`);
  console.log(`- Contractor demo email env present: ${Boolean(process.env.MARKETING_DEMO_CONTRACTOR_EMAIL?.trim())}`);
  console.log('- Will not create Supabase auth users.');
  console.log('- Will not upload files/media.');
  console.log('- Will not apply SQL or use service-role access.');
}

async function signInDemoUser(context: SetupContext, credentials: DemoCredentials, label: string) {
  assertDemoEmail(credentials.email, `${label} email`);
  const client = createClient(context.supabaseUrl, context.supabaseAnonKey);
  const { data, error } = await client.auth.signInWithPassword(credentials);
  if (error || !data.user) {
    throw new Error(`Unable to sign in as ${label}. Confirm the manual non-production demo account exists.`);
  }
  return { client, user: data.user };
}

async function prepareHomeownerRecords(client: SupabaseClient, homeownerUserId: string) {
  await upsertBySingleKey(client, 'homeowner_profiles', 'user_id', homeownerUserId, {
    user_id: homeownerUserId,
    ...demoRecords.homeowner.profile,
  });

  const existingHome = await selectSingleByKeys(client, 'homes', {
    homeowner_user_id: homeownerUserId,
    nickname: demoRecords.homeowner.home.nickname,
  });

  if (existingHome?.id) {
    await updateById(client, 'homes', existingHome.id as string, demoRecords.homeowner.home);
  } else {
    await insertRow(client, 'homes', {
      homeowner_user_id: homeownerUserId,
      ...demoRecords.homeowner.home,
    });
  }
}

async function prepareContractorRecords(client: SupabaseClient, user: User): Promise<ContractorContext> {
  const contractorPayload = {
    owner_user_id: user.id,
    ...demoRecords.contractor.profile,
  };

  const contractorProfile = await upsertBySingleKey(
    client,
    'contractor_profiles',
    'owner_user_id',
    user.id,
    contractorPayload,
  );
  const contractorId = contractorProfile?.id as string | undefined;
  if (!contractorId) throw new Error('Unable to prepare contractor profile.');

  await replaceContractorServiceAreas(client, contractorId);
  const localContactId = await prepareLocalCustomer(client, contractorId);

  return { client, user, contractorId, localContactId };
}

async function replaceContractorServiceAreas(client: SupabaseClient, contractorId: string) {
  const { error: deleteError } = await client.from('contractor_service_areas').delete().eq('contractor_id', contractorId);
  if (deleteError) {
    console.warn('Skipped contractor service-area replacement. The current sandbox may not have service-area writes available.');
    return;
  }

  const rows = demoRecords.contractor.serviceAreas.map(area => ({ contractor_id: contractorId, ...area }));
  const { error: insertError } = await client.from('contractor_service_areas').insert(rows);
  if (insertError) {
    console.warn('Skipped contractor service-area insert. The current sandbox may not have service-area writes available.');
  }
}

async function prepareLocalCustomer(client: SupabaseClient, contractorId: string): Promise<string | null> {
  const existing = await selectSingleByKeys(client, 'contractor_local_contacts', {
    contractor_id: contractorId,
    email: demoRecords.localCustomer.email,
  });

  if (existing?.id) {
    await updateById(client, 'contractor_local_contacts', existing.id as string, {
      display_name: demoRecords.localCustomer.display_name,
      phone: demoRecords.localCustomer.phone,
      notes: demoRecords.localCustomer.notes,
    });
    await ensureLocalHome(client, contractorId, existing.id as string);
    return existing.id as string;
  }

  const { data, error } = await client.rpc('servsync_create_local_contact', {
    p_display_name: demoRecords.localCustomer.display_name,
    p_phone: demoRecords.localCustomer.phone,
    p_email: demoRecords.localCustomer.email,
    p_notes: demoRecords.localCustomer.notes,
    p_home_nickname: demoRecords.localCustomer.home_nickname,
    p_address_line1: demoRecords.localCustomer.address_line1,
    p_address_line2: demoRecords.localCustomer.address_line2,
    p_city: demoRecords.localCustomer.city,
    p_state: demoRecords.localCustomer.state,
    p_zip_code: demoRecords.localCustomer.zip_code,
    p_home_type: demoRecords.localCustomer.home_type,
    p_year_built: demoRecords.localCustomer.year_built,
    p_square_feet: demoRecords.localCustomer.square_feet,
    p_home_notes: demoRecords.localCustomer.home_notes,
  });
  if (error) {
    console.warn('Skipped local customer creation because the RPC is unavailable or denied in this environment.');
    return null;
  }

  const created = data as { contact?: { id?: string } } | null;
  return created?.contact?.id ?? null;
}

async function ensureLocalHome(client: SupabaseClient, contractorId: string, localContactId: string) {
  const existing = await selectSingleByKeys(client, 'contractor_local_homes', {
    contractor_id: contractorId,
    local_contact_id: localContactId,
    nickname: demoRecords.localCustomer.home_nickname,
  });
  const payload = {
    contractor_id: contractorId,
    local_contact_id: localContactId,
    nickname: demoRecords.localCustomer.home_nickname,
    address_line1: demoRecords.localCustomer.address_line1,
    address_line2: demoRecords.localCustomer.address_line2,
    city: demoRecords.localCustomer.city,
    state: demoRecords.localCustomer.state,
    zip_code: demoRecords.localCustomer.zip_code,
    home_type: demoRecords.localCustomer.home_type,
    year_built: demoRecords.localCustomer.year_built,
    square_feet: demoRecords.localCustomer.square_feet,
    notes: demoRecords.localCustomer.home_notes,
  };

  if (existing?.id) {
    await updateById(client, 'contractor_local_homes', existing.id as string, payload);
  } else {
    await insertRow(client, 'contractor_local_homes', payload);
  }
}

async function prepareDemoEstimate(context: ContractorContext) {
  if (!context.localContactId) {
    console.warn('Skipped estimate setup because no local demo customer is available.');
    return;
  }

  const existing = await selectSingleByKeys(context.client, 'estimates', {
    contractor_id: context.contractorId,
    local_contact_id: context.localContactId,
    title: demoRecords.estimate.title,
  });
  const totalCents = totalForLines(demoRecords.estimate.lineItems);
  const payload = {
    contractor_id: context.contractorId,
    local_contact_id: context.localContactId,
    title: demoRecords.estimate.title,
    scope: demoRecords.estimate.scope,
    notes: demoRecords.estimate.notes,
    terms: demoRecords.estimate.terms,
    status: 'sent',
    subtotal_cents: totalCents,
    total_cents: totalCents,
  };
  const estimate = existing?.id
    ? await updateById(context.client, 'estimates', existing.id as string, payload)
    : await insertRow(context.client, 'estimates', payload);

  if (estimate?.id) {
    await replaceLineItems(context.client, 'estimate_line_items', 'estimate_id', estimate.id as string, demoRecords.estimate.lineItems);
  }
}

async function prepareDemoInvoice(context: ContractorContext) {
  if (!context.localContactId) {
    console.warn('Skipped invoice setup because no local demo customer is available.');
    return;
  }

  const existing = await selectSingleByKeys(context.client, 'invoices', {
    contractor_id: context.contractorId,
    local_contact_id: context.localContactId,
    title: demoRecords.invoice.title,
  });
  const totalCents = totalForLines(demoRecords.invoice.lineItems);
  const payload = {
    contractor_id: context.contractorId,
    local_contact_id: context.localContactId,
    invoice_number: 'HV-1007',
    title: demoRecords.invoice.title,
    scope: demoRecords.invoice.scope,
    notes: demoRecords.invoice.notes,
    terms: demoRecords.invoice.terms,
    status: 'sent',
    subtotal_cents: totalCents,
    tax_cents: 0,
    discount_cents: 0,
    total_cents: totalCents,
    amount_paid_cents: 0,
  };
  const invoice = existing?.id
    ? await updateById(context.client, 'invoices', existing.id as string, payload)
    : await insertRow(context.client, 'invoices', payload);

  if (invoice?.id) {
    await replaceLineItems(context.client, 'invoice_line_items', 'invoice_id', invoice.id as string, demoRecords.invoice.lineItems);
  }
}

async function tryPrepareServiceRequest(client: SupabaseClient, homeownerUserId: string) {
  const connection = await selectSingleByKeys(client, 'homeowner_contractor_connections', {
    homeowner_user_id: homeownerUserId,
    status: 'active',
  });
  const home = await selectSingleByKeys(client, 'homes', {
    homeowner_user_id: homeownerUserId,
    nickname: demoRecords.homeowner.home.nickname,
  });

  if (!connection?.id || !home?.id) {
    console.warn('Skipped service request setup because no active demo homeowner-contractor connection is available.');
    return;
  }

  const existing = await selectSingleByKeys(client, 'service_requests', {
    homeowner_user_id: homeownerUserId,
    connection_id: connection.id as string,
    title: demoRecords.serviceRequest.title,
  });
  if (existing?.id) {
    await updateById(client, 'service_requests', existing.id as string, {
      category: demoRecords.serviceRequest.category,
      urgency: demoRecords.serviceRequest.urgency,
      description: demoRecords.serviceRequest.description,
    });
    return;
  }

  const { error } = await client.rpc('servsync_create_service_request', {
    p_connection_id: connection.id,
    p_category: demoRecords.serviceRequest.category,
    p_urgency: demoRecords.serviceRequest.urgency,
    p_title: demoRecords.serviceRequest.title,
    p_description: demoRecords.serviceRequest.description,
    p_home_id: home.id,
  });
  if (error) {
    console.warn('Skipped service request setup because the request RPC was unavailable or denied.');
  }
}

async function upsertBySingleKey(client: SupabaseClient, table: string, key: string, value: string, payload: Record<string, unknown>) {
  const existing = await selectSingleByKeys(client, table, { [key]: value });
  return existing?.id || existing?.[key]
    ? updateByKey(client, table, key, value, payload)
    : insertRow(client, table, payload);
}

async function selectSingleByKeys(client: SupabaseClient, table: string, keys: Record<string, string>) {
  let query = client.from(table).select('*').limit(1);
  for (const [key, value] of Object.entries(keys)) {
    query = query.eq(key, value);
  }
  const { data, error } = await query.maybeSingle();
  if (error) return null;
  return data as Record<string, unknown> | null;
}

async function updateByKey(client: SupabaseClient, table: string, key: string, value: string, payload: Record<string, unknown>) {
  const { data, error } = await client.from(table).update(payload).eq(key, value).select('*').single();
  if (error) throw new Error(`Unable to update ${table}: ${error.message}`);
  return data as Record<string, unknown>;
}

async function updateById(client: SupabaseClient, table: string, id: string, payload: Record<string, unknown>) {
  return updateByKey(client, table, 'id', id, payload);
}

async function insertRow(client: SupabaseClient, table: string, payload: Record<string, unknown>) {
  const { data, error } = await client.from(table).insert(payload).select('*').single();
  if (error) throw new Error(`Unable to insert ${table}: ${error.message}`);
  return data as Record<string, unknown>;
}

async function replaceLineItems(
  client: SupabaseClient,
  table: string,
  parentKey: string,
  parentId: string,
  lines: readonly DemoLineItem[],
) {
  const { error: deleteError } = await client.from(table).delete().eq(parentKey, parentId);
  if (deleteError) throw new Error(`Unable to replace ${table}: ${deleteError.message}`);

  const rows = lines.map((line, index) => ({
    [parentKey]: parentId,
    ...line,
    sort_order: index,
  }));
  const { error: insertError } = await client.from(table).insert(rows);
  if (insertError) throw new Error(`Unable to insert ${table}: ${insertError.message}`);
}

function totalForLines(lines: readonly DemoLineItem[]) {
  return lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unit_price_cents), 0);
}

function runProductionGuardSelfCheck() {
  const checks = [
    () => assertAllowedToRun('https://servsync.app', `https://${SANDBOX_SUPABASE_REF}.supabase.co`),
    () => assertAllowedToRun('https://preview.example.com', `https://${PRODUCTION_SUPABASE_REF}.supabase.co`),
  ];

  for (const check of checks) {
    let blocked = false;
    try {
      check();
    } catch {
      blocked = true;
    }
    if (!blocked) throw new Error('Production guard self-check failed.');
  }

  console.log('Production URL and production Supabase guard checks passed.');
}
