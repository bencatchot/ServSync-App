import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { requireValidationTarget } from './validationTarget';

const SANDBOX_SUPABASE_REF = 'zpzdkoaubyjtsomccxya';
const MANIFEST_PATH = resolve(process.cwd(), 'local-ops/phase-0-6/core-loop-runs.json');

type CoreLoopRun = {
  prefix: string;
  createdAt: string;
};

type CoreLoopManifest = {
  schemaVersion: 1;
  targetProjectRef: typeof SANDBOX_SUPABASE_REF;
  pending: CoreLoopRun[];
};

function assertPrefix(value: string) {
  if (!/^E2E (?:Core Loop|Partial Payment) \d{14}$/.test(value)) {
    throw new Error(`Refusing core-loop fixture operation for unexpected record prefix "${value}".`);
  }
}

function emptyManifest(): CoreLoopManifest {
  return { schemaVersion: 1, targetProjectRef: SANDBOX_SUPABASE_REF, pending: [] };
}

function readManifest(): CoreLoopManifest {
  if (!existsSync(MANIFEST_PATH)) return emptyManifest();
  const parsed = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as CoreLoopManifest;
  if (parsed.schemaVersion !== 1 || parsed.targetProjectRef !== SANDBOX_SUPABASE_REF || !Array.isArray(parsed.pending)) {
    throw new Error('Refusing Sandbox core-loop recovery because the local run manifest is malformed or targets another project.');
  }
  for (const run of parsed.pending) assertPrefix(run.prefix);
  return parsed;
}

function writeManifest(manifest: CoreLoopManifest) {
  mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
  const temporaryPath = `${MANIFEST_PATH}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporaryPath, MANIFEST_PATH);
}

function quoteSqlText(value: string) {
  assertPrefix(value);
  return `'${value.replaceAll("'", "''")}%'`;
}

export function requireLinkedSandboxCleanup() {
  requireValidationTarget({
    requireAppUrl: true,
    requireSupabaseEnv: true,
    requireLinkedProjectRef: true,
  });
  const linkedProject = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
  if (linkedProject !== SANDBOX_SUPABASE_REF) {
    throw new Error(`Refusing core-loop mutation outside linked Sandbox ${SANDBOX_SUPABASE_REF}.`);
  }
}

export function recordCoreLoopFixturePrefix(prefix: string) {
  assertPrefix(prefix);
  requireLinkedSandboxCleanup();
  const manifest = readManifest();
  if (!manifest.pending.some((run) => run.prefix === prefix)) {
    manifest.pending.push({ prefix, createdAt: new Date().toISOString() });
    writeManifest(manifest);
  }
}

export function pendingCoreLoopFixturePrefixes() {
  return readManifest().pending.map((run) => run.prefix);
}

export function cleanupCoreLoopFixtures(recordPrefixes: string[]) {
  if (recordPrefixes.length === 0) return;
  requireLinkedSandboxCleanup();
  const prefixes = [...new Set(recordPrefixes)];
  const patterns = prefixes.map(quoteSqlText).join(', ');
  const sql = `
begin;
create temporary table audit_request_ids on commit drop as
  select id from public.service_requests where title like any (array[${patterns}]);
create temporary table audit_estimate_ids on commit drop as
  select id from public.estimates where title like any (array[${patterns}]);
create temporary table audit_job_ids on commit drop as
  select id from public.inspections where name like any (array[${patterns}]);
create temporary table audit_invoice_ids on commit drop as
  select id from public.invoices where title like any (array[${patterns}]);
delete from public.home_reminders where title like any (array[${patterns}]);
delete from public.workflow_thread_reads where service_request_id in (select id from audit_request_ids) or inspection_id in (select id from audit_job_ids);
delete from public.workflow_activity_events where service_request_id in (select id from audit_request_ids) or estimate_id in (select id from audit_estimate_ids) or inspection_id in (select id from audit_job_ids) or invoice_id in (select id from audit_invoice_ids);
delete from public.workflow_messages where service_request_id in (select id from audit_request_ids) or inspection_id in (select id from audit_job_ids);
delete from public.notifications where request_id in (select id from audit_request_ids) or estimate_id in (select id from audit_estimate_ids) or invoice_id in (select id from audit_invoice_ids);
alter table public.invoice_offline_payment_records disable trigger invoice_offline_payment_records_immutable;
delete from public.invoice_offline_payment_records where invoice_id in (select id from audit_invoice_ids);
alter table public.invoice_offline_payment_records enable trigger invoice_offline_payment_records_immutable;
delete from public.invoice_backlog_items where invoice_id in (select id from audit_invoice_ids);
delete from public.invoice_line_items where invoice_id in (select id from audit_invoice_ids);
update public.job_work_items set billing_status = case when billing_status = 'not_billable' then 'not_billable' else 'unbilled' end, reserved_invoice_id = null, invoiced_invoice_id = null, updated_at = now()
 where reserved_invoice_id in (select id from audit_invoice_ids) or invoiced_invoice_id in (select id from audit_invoice_ids);
delete from public.invoices where id in (select id from audit_invoice_ids);
delete from public.job_work_items where inspection_id in (select id from audit_job_ids);
delete from public.estimate_line_items where estimate_id in (select id from audit_estimate_ids);
delete from public.inspections where id in (select id from audit_job_ids);
delete from public.estimates where id in (select id from audit_estimate_ids);
delete from public.service_request_media where request_id in (select id from audit_request_ids);
delete from public.service_request_messages where request_id in (select id from audit_request_ids);
delete from public.service_requests where id in (select id from audit_request_ids);
do $$
begin
  if exists (select 1 from public.service_requests where title like any (array[${patterns}]))
     or exists (select 1 from public.estimates where title like any (array[${patterns}]))
     or exists (select 1 from public.inspections where name like any (array[${patterns}]))
     or exists (select 1 from public.invoices where title like any (array[${patterns}]))
     or exists (select 1 from public.home_reminders where title like any (array[${patterns}]))
     or exists (select 1 from public.workflow_thread_reads where service_request_id in (select id from audit_request_ids) or inspection_id in (select id from audit_job_ids))
     or exists (select 1 from public.workflow_activity_events where service_request_id in (select id from audit_request_ids) or estimate_id in (select id from audit_estimate_ids) or inspection_id in (select id from audit_job_ids) or invoice_id in (select id from audit_invoice_ids))
     or exists (select 1 from public.workflow_messages where service_request_id in (select id from audit_request_ids) or inspection_id in (select id from audit_job_ids))
     or exists (select 1 from public.notifications where request_id in (select id from audit_request_ids) or estimate_id in (select id from audit_estimate_ids) or invoice_id in (select id from audit_invoice_ids))
     or exists (select 1 from public.invoice_offline_payment_records where invoice_id in (select id from audit_invoice_ids))
     or exists (select 1 from public.invoice_backlog_items where invoice_id in (select id from audit_invoice_ids))
     or exists (select 1 from public.invoice_line_items where invoice_id in (select id from audit_invoice_ids))
     or exists (select 1 from public.job_work_items where inspection_id in (select id from audit_job_ids) or reserved_invoice_id in (select id from audit_invoice_ids) or invoiced_invoice_id in (select id from audit_invoice_ids))
     or exists (select 1 from public.estimate_line_items where estimate_id in (select id from audit_estimate_ids))
     or exists (select 1 from public.service_request_media where request_id in (select id from audit_request_ids))
     or exists (select 1 from public.service_request_messages where request_id in (select id from audit_request_ids)) then
    raise exception 'Core-loop fixture cleanup left residue';
  end if;
end $$;
commit;`.trim();

  execFileSync('supabase', ['db', 'query', '--linked', sql], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe',
  });

  const cleaned = new Set(prefixes);
  const manifest = readManifest();
  manifest.pending = manifest.pending.filter((run) => !cleaned.has(run.prefix));
  writeManifest(manifest);
}

export const coreLoopFixtureManifestPath = MANIFEST_PATH;
