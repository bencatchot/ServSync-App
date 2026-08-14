import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  RoleSmokeFailure,
  createRoleSmokeReport,
  preflightRoleSmoke,
  requireSmokeInvariant,
  roleSmokeTrigger,
  safeErrorSummary,
  validateBackupHealth,
  type ContractorSmokeRole,
  type RoleSmokePreflight,
  type SmokeCheckResult,
  type SmokeFailureCategory,
  type SmokeRole,
} from './roleSmokeContract.ts';

type AuthenticatedAccount = { client: SupabaseClient; userId: string };
type CapabilityExpectations = { customer: boolean; billing: boolean; jobs: boolean; cost: boolean };

const EXPECTED_CAPABILITIES: Record<Exclude<ContractorSmokeRole, 'contractorB'>, CapabilityExpectations> = {
  owner: { customer: true, billing: true, jobs: true, cost: true },
  admin: { customer: true, billing: true, jobs: true, cost: true },
  office: { customer: true, billing: true, jobs: true, cost: true },
  field_tech: { customer: false, billing: false, jobs: true, cost: false },
  viewer: { customer: false, billing: false, jobs: false, cost: false },
};

function firstRow(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === 'object' ? row as Record<string, unknown> : null;
}

const assert: typeof requireSmokeInvariant = requireSmokeInvariant;

function assertPermissionDenied(
  error: { code?: string; message?: string } | null,
  check: string,
  message: string,
  expectedCustomMessage?: string,
) {
  assert(Boolean(error), 'AUTHORIZATION FAILURE', check, message);
  const isStandardDenial = error?.code === '42501';
  const isExpectedCustomDenial = error?.code === 'P0001' && error.message === expectedCustomMessage;
  assert(isStandardDenial || isExpectedCustomDenial, 'PROVIDER/EXTERNAL FAILURE', check, 'A denial probe failed for a reason other than authorization.');
}

async function addCheck(
  checks: SmokeCheckResult[],
  name: string,
  category: SmokeFailureCategory,
  operation: () => Promise<void> | void,
) {
  try {
    await operation();
    checks.push({ name, status: 'pass', summary: 'Verified.' });
  } catch (error) {
    const resolvedCategory = error instanceof RoleSmokeFailure ? error.category : category;
    checks.push({ name, status: 'fail', category: resolvedCategory, summary: safeErrorSummary(error) });
  }
}

async function authenticate(config: RoleSmokePreflight, role: SmokeRole): Promise<AuthenticatedAccount> {
  const client = createClient(config.supabaseUrl, config.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const result = await client.auth.signInWithPassword(config.credentials[role]);
  assert(!result.error && result.data.user?.id, 'CREDENTIAL FAILURE', `${role}_auth`, `${role} authentication was rejected.`);
  return { client, userId: result.data.user.id };
}

async function contractorProfile(account: AuthenticatedAccount, role: string) {
  const result = await account.client.rpc('servsync_current_contractor_profile');
  assert(!result.error, 'PROVIDER/EXTERNAL FAILURE', `${role}_identity`, `${role} contractor profile lookup failed.`);
  const profile = firstRow(result.data);
  assert(typeof profile?.id === 'string' && typeof profile.owner_user_id === 'string', 'IDENTITY FAILURE', `${role}_identity`, `${role} contractor profile is missing.`);
  return profile as { id: string; owner_user_id: string };
}

async function verifyContractorIdentity(
  account: AuthenticatedAccount,
  role: ContractorSmokeRole,
  expectedContractorId?: string,
) {
  const profileResult = await account.client.from('profiles').select('role').eq('id', account.userId).maybeSingle();
  assert(!profileResult.error, 'PROVIDER/EXTERNAL FAILURE', `${role}_identity`, `${role} ServSync profile lookup failed.`);
  assert(profileResult.data?.role === 'contractor', 'IDENTITY FAILURE', `${role}_identity`, `${role} ServSync profile role is not contractor.`);
  const profile = await contractorProfile(account, role);
  if (expectedContractorId) {
    assert(profile.id === expectedContractorId, 'IDENTITY FAILURE', `${role}_identity`, `${role} resolved to the wrong contractor tenant.`);
  }
  if (role === 'owner' || role === 'contractorB') {
    assert(profile.owner_user_id === account.userId, 'IDENTITY FAILURE', `${role}_identity`, `${role} is not the contractor owner.`);
  } else {
    const membership = await account.client
      .from('contractor_team_members')
      .select('role,status,contractor_id,user_id')
      .eq('contractor_id', profile.id)
      .eq('user_id', account.userId)
      .maybeSingle();
    assert(!membership.error, 'PROVIDER/EXTERNAL FAILURE', `${role}_identity`, `${role} membership lookup failed.`);
    assert(membership.data?.role === role && membership.data.status === 'active', 'IDENTITY FAILURE', `${role}_identity`, `${role} active membership does not match the expected role.`);
  }
  return profile;
}

async function capability(account: AuthenticatedAccount, name: string, contractorId: string) {
  const result = await account.client.rpc(name, { p_contractor_id: contractorId });
  assert(!result.error, 'PROVIDER/EXTERNAL FAILURE', 'role_capabilities', `${name} could not be evaluated.`);
  return result.data === true;
}

async function verifyCapabilities(account: AuthenticatedAccount, role: Exclude<ContractorSmokeRole, 'contractorB'>, contractorId: string) {
  const expected = EXPECTED_CAPABILITIES[role];
  const [customer, billing, jobs, cost] = await Promise.all([
    capability(account, 'current_user_can_manage_contractor_customers', contractorId),
    capability(account, 'current_user_can_manage_contractor_billing', contractorId),
    capability(account, 'current_user_can_write_contractor_jobs', contractorId),
    account.client.rpc('servsync_list_price_book_internal_costs'),
  ]);
  assert(customer === expected.customer, 'AUTHORIZATION FAILURE', `${role}_authorization`, `${role} customer-management authority drifted.`);
  assert(billing === expected.billing, 'AUTHORIZATION FAILURE', `${role}_authorization`, `${role} billing authority drifted.`);
  assert(jobs === expected.jobs, 'AUTHORIZATION FAILURE', `${role}_authorization`, `${role} Job-write authority drifted.`);
  if (expected.cost) {
    assert(!cost.error, 'AUTHORIZATION FAILURE', `${role}_authorization`, `${role} private-cost authority drifted.`);
  } else {
    assertPermissionDenied(
      cost.error,
      `${role}_authorization`,
      `${role} unexpectedly received private-cost authority.`,
      'Price Book internal cost is unavailable for this account.',
    );
  }
}

async function verifyHomeownerIdentity(account: AuthenticatedAccount, role: 'homeowner' | 'homeownerB') {
  const profile = await account.client.from('profiles').select('role').eq('id', account.userId).maybeSingle();
  assert(!profile.error, 'PROVIDER/EXTERNAL FAILURE', `${role}_identity`, `${role} ServSync profile lookup failed.`);
  assert(profile.data?.role === 'homeowner', 'IDENTITY FAILURE', `${role}_identity`, `${role} ServSync profile role is not homeowner.`);
  const homeowner = await account.client.from('homeowner_profiles').select('user_id').eq('user_id', account.userId).maybeSingle();
  assert(!homeowner.error && homeowner.data?.user_id === account.userId, 'IDENTITY FAILURE', `${role}_identity`, `${role} homeowner profile is missing.`);
  const homes = await account.client.from('homes').select('id').eq('homeowner_user_id', account.userId).order('created_at').limit(1);
  assert(!homes.error, 'PROVIDER/EXTERNAL FAILURE', `${role}_fixture`, `${role} home fixture lookup failed.`);
  assert(homes.data?.[0]?.id, 'FIXTURE FAILURE', `${role}_fixture`, `${role} has no stable home fixture.`);
  return homes.data[0].id as string;
}

async function verifyContractorFixtures(owner: AuthenticatedAccount) {
  const [customers, jobs, invoices, priceBook] = await Promise.all([
    owner.client.rpc('servsync_list_local_customer_summaries'),
    owner.client.from('inspections').select('id').limit(1),
    owner.client.from('invoices').select('id').limit(1),
    owner.client.from('contractor_price_book_items').select('id').eq('active', true).limit(1),
  ]);
  assert(!customers.error && Array.isArray(customers.data) && customers.data.length > 0, 'FIXTURE FAILURE', 'contractor_fixtures', 'Stable Customer fixture is missing.');
  assert(!jobs.error && jobs.data?.[0]?.id, 'FIXTURE FAILURE', 'contractor_fixtures', 'Stable Job fixture is missing.');
  assert(!invoices.error && invoices.data?.[0]?.id, 'FIXTURE FAILURE', 'contractor_fixtures', 'Stable Invoice fixture is missing.');
  assert(!priceBook.error && priceBook.data?.[0]?.id, 'FIXTURE FAILURE', 'contractor_fixtures', 'Stable Price Book fixture is missing.');
  const customer = firstRow(customers.data[0]);
  assert(typeof customer?.id === 'string', 'FIXTURE FAILURE', 'contractor_fixtures', 'Stable Customer fixture identity is missing.');
  return {
    customerId: customer.id,
    invoiceId: invoices.data[0].id as string,
    priceBookItemId: priceBook.data[0].id as string,
  };
}

async function verifyCrossTenant(
  owner: AuthenticatedAccount,
  contractorB: AuthenticatedAccount,
  ownerContractorId: string,
  contractorBId: string,
  homeowner: AuthenticatedAccount,
  homeownerB: AuthenticatedAccount,
  homeownerHomeId: string,
  homeownerBHomeId: string,
  ownerCustomerId: string,
  ownerInvoiceId: string,
  ownerPriceBookItemId: string,
) {
  const [ownerReadsB, bReadsOwner, foreignCustomer, foreignInvoice, foreignPriceBook, homeownerReadsB, homeownerBReadsA] = await Promise.all([
    owner.client.from('contractor_team_members').select('id').eq('contractor_id', contractorBId),
    contractorB.client.from('contractor_team_members').select('id').eq('contractor_id', ownerContractorId),
    contractorB.client.rpc('servsync_get_local_customer_management_detail', { p_local_contact_id: ownerCustomerId }),
    contractorB.client.from('invoices').select('id').eq('id', ownerInvoiceId),
    contractorB.client.from('contractor_price_book_items').select('id').eq('id', ownerPriceBookItemId),
    homeowner.client.from('homes').select('id').eq('id', homeownerBHomeId),
    homeownerB.client.from('homes').select('id').eq('id', homeownerHomeId),
  ]);
  for (const result of [ownerReadsB, bReadsOwner, foreignInvoice, foreignPriceBook, homeownerReadsB, homeownerBReadsA]) {
    assert(!result.error, 'PROVIDER/EXTERNAL FAILURE', 'cross_tenant_denial', 'Cross-tenant read probe could not be evaluated.');
    assert(result.data.length === 0, 'AUTHORIZATION FAILURE', 'cross_tenant_denial', 'A private cross-tenant record was unexpectedly visible.');
  }
  assertPermissionDenied(foreignCustomer.error, 'cross_tenant_denial', 'Cross-tenant Customer management detail was unexpectedly visible.');
}

async function verifyBackupHealth() {
  const url = process.env.ROLE_SMOKE_BACKUP_HEALTH_URL?.trim();
  const token = process.env.ROLE_SMOKE_BACKUP_HEALTH_TOKEN?.trim();
  if (!url || !token) throw new RoleSmokeFailure('CREDENTIAL FAILURE', 'storage_backup_health', 'Backup-health observer configuration is missing.');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => null);
  assert(response.ok && body, response.status >= 500 ? 'PROVIDER/EXTERNAL FAILURE' : 'BACKUP HEALTH FAILURE', 'storage_backup_health', 'Backup-health endpoint did not return a healthy response.');
  validateBackupHealth(body);
}

async function emitReport(report: ReturnType<typeof createRoleSmokeReport>) {
  const reportPath = process.env.ROLE_SMOKE_REPORT_PATH?.trim();
  if (reportPath) {
    const absolute = resolve(reportPath);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  }
  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  const startedAt = new Date().toISOString();
  const runId = process.env.GITHUB_RUN_ID?.trim()
    ? `github-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`
    : `local-${randomUUID()}`;
  const checks: SmokeCheckResult[] = [];
  let trigger: ReturnType<typeof roleSmokeTrigger>;
  try {
    trigger = roleSmokeTrigger();
  } catch (error) {
    const failure = error instanceof RoleSmokeFailure
      ? error
      : new RoleSmokeFailure('ENVIRONMENT FAILURE', 'scheduler_provenance', safeErrorSummary(error));
    const report = createRoleSmokeReport({
      runId,
      startedAt,
      completedAt: new Date().toISOString(),
      environment: process.env.SERVSYNC_ROLE_SMOKE_TARGET === 'demo' ? 'demo' : 'sandbox',
      trigger: 'local',
      checks: [{ name: failure.check, status: 'fail', category: failure.category, summary: safeErrorSummary(failure) }],
    });
    await emitReport(report);
    process.exitCode = 1;
    return;
  }
  let config: RoleSmokePreflight;
  try {
    config = preflightRoleSmoke();
    checks.push({ name: 'preflight', status: 'pass', summary: 'Environment identity and credential presence matched.' });
  } catch (error) {
    const failure = error instanceof RoleSmokeFailure ? error : new RoleSmokeFailure('ENVIRONMENT FAILURE', 'preflight', safeErrorSummary(error));
    const target = process.env.SERVSYNC_ROLE_SMOKE_TARGET === 'demo' ? 'demo' : 'sandbox';
    const report = createRoleSmokeReport({
      runId,
      startedAt,
      completedAt: new Date().toISOString(),
      environment: target,
      trigger,
      checks: [{ name: failure.check, status: 'fail', category: failure.category, summary: safeErrorSummary(failure) }],
    });
    await emitReport(report);
    process.exitCode = 1;
    return;
  }

  const accounts = new Map<SmokeRole, AuthenticatedAccount>();
  try {
    for (const role of config.roles) {
      await addCheck(checks, `${role}_auth`, 'CREDENTIAL FAILURE', async () => {
        accounts.set(role, await authenticate(config, role));
      });
    }

    const owner = accounts.get('owner');
    const contractorB = accounts.get('contractorB');
    const homeowner = accounts.get('homeowner');
    const homeownerB = accounts.get('homeownerB');
    let ownerContractorId = '';
    let contractorBId = '';
    let homeownerHomeId = '';
    let homeownerBHomeId = '';
    let ownerCustomerId = '';
    let ownerInvoiceId = '';
    let ownerPriceBookItemId = '';

    if (owner) await addCheck(checks, 'owner_identity', 'IDENTITY FAILURE', async () => {
      ownerContractorId = (await verifyContractorIdentity(owner, 'owner')).id;
    });
    for (const role of ['admin', 'office', 'field_tech', 'viewer'] as const) {
      const account = accounts.get(role);
      if (account && ownerContractorId) {
        await addCheck(checks, `${role}_identity`, 'IDENTITY FAILURE', async () => {
          await verifyContractorIdentity(account, role, ownerContractorId);
        });
        await addCheck(checks, `${role}_authorization`, 'AUTHORIZATION FAILURE', () => verifyCapabilities(account, role, ownerContractorId));
      }
    }
    if (owner && ownerContractorId) {
      await addCheck(checks, 'owner_authorization', 'AUTHORIZATION FAILURE', () => verifyCapabilities(owner, 'owner', ownerContractorId));
      await addCheck(checks, 'contractor_fixtures', 'FIXTURE FAILURE', async () => {
        const fixtures = await verifyContractorFixtures(owner);
        ownerCustomerId = fixtures.customerId;
        ownerInvoiceId = fixtures.invoiceId;
        ownerPriceBookItemId = fixtures.priceBookItemId;
      });
    }
    if (contractorB) await addCheck(checks, 'contractorB_identity', 'IDENTITY FAILURE', async () => {
      contractorBId = (await verifyContractorIdentity(contractorB, 'contractorB')).id;
      assert(contractorBId !== ownerContractorId, 'IDENTITY FAILURE', 'contractorB_identity', 'Secondary contractor resolved to the primary tenant.');
    });
    if (homeowner) await addCheck(checks, 'homeowner_identity_fixture', 'IDENTITY FAILURE', async () => {
      homeownerHomeId = await verifyHomeownerIdentity(homeowner, 'homeowner');
    });
    if (homeownerB) await addCheck(checks, 'homeownerB_identity_fixture', 'IDENTITY FAILURE', async () => {
      homeownerBHomeId = await verifyHomeownerIdentity(homeownerB, 'homeownerB');
    });
    if (owner && contractorB && homeowner && homeownerB && ownerContractorId && contractorBId && homeownerHomeId && homeownerBHomeId
      && ownerCustomerId && ownerInvoiceId && ownerPriceBookItemId) {
      await addCheck(checks, 'cross_tenant_denial', 'AUTHORIZATION FAILURE', () => verifyCrossTenant(
        owner, contractorB, ownerContractorId, contractorBId, homeowner, homeownerB, homeownerHomeId, homeownerBHomeId,
        ownerCustomerId, ownerInvoiceId, ownerPriceBookItemId,
      ));
    }
    if (process.env.ROLE_SMOKE_INCLUDE_BACKUP_HEALTH === 'true') {
      await addCheck(checks, 'storage_backup_health', 'BACKUP HEALTH FAILURE', verifyBackupHealth);
    }
  } finally {
    await Promise.all([...accounts.values()].map(account => account.client.auth.signOut().catch(() => undefined)));
  }

  const report = createRoleSmokeReport({
    runId,
    startedAt,
    completedAt: new Date().toISOString(),
    environment: config.target,
    trigger,
    checks,
  });
  await emitReport(report);
  if (report.status !== 'pass') process.exitCode = 1;
}

await main();
