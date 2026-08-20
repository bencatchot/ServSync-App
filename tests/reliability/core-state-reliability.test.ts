import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createActionGuard } from '../../src/features/reliability/actionGuard';
import { userFacingError } from '../../src/features/reliability/userFacingError';

const appSource = await readFile(new URL('../../src/App.tsx', import.meta.url), 'utf8');
const durableDraftSql = await readFile(new URL('../../servsync-durable-draft-launch-foundation.sql', import.meta.url), 'utf8');
const estimateJobSql = await readFile(new URL('../../servsync-estimate-job-support.sql', import.meta.url), 'utf8');
const invoiceSourceSql = await readFile(new URL('../../servsync-invoice-from-source.sql', import.meta.url), 'utf8');
const paymentSql = await readFile(new URL('../../servsync-draft-invoice-mark-paid.sql', import.meta.url), 'utf8');
const reportSql = await readFile(new URL('../../servsync-finalized-report-home-lineage.sql', import.meta.url), 'utf8');

test('action guard rejects duplicate work synchronously and releases exact keys', () => {
  const guard = createActionGuard();
  assert.equal(guard.begin('invoice-payment:one'), true);
  assert.equal(guard.begin('invoice-payment:one'), false);
  assert.equal(guard.begin('invoice-payment:two'), true);
  assert.equal(guard.isActive('invoice-payment:one'), true);
  guard.end('invoice-payment:one');
  assert.equal(guard.begin('invoice-payment:one'), true);
});

test('ordinary user errors preserve concise guidance but hide backend details', () => {
  assert.equal(userFacingError(new Error('Choose a connected customer before sending.'), 'Fallback'), 'Choose a connected customer before sending.');
  assert.equal(
    userFacingError({ message: 'Could not find public.servsync_send_estimate in the schema cache', details: 'RPC lookup', code: 'PGRST202' }, 'Try again later.'),
    'Try again later.',
  );
  assert.equal(
    userFacingError(new Error('Request failed at saveEstimate (App.tsx:241:10)'), 'Your changes remain in the form.'),
    'Your changes remain in the form.',
  );
});

test('canonical workspaces use one stable initial loading and retry boundary', () => {
  assert.match(appSource, /label="homeowner workspace"[\s\S]*onRetry=\{\(\) => void loadHomeowner\(\)\}/);
  assert.match(appSource, /label="contractor workspace"[\s\S]*onRetry=\{\(\) => void loadContractor\(\)\}/);
  assert.match(appSource, /setWorkspaceLoadPhase\('initial'\)/);
  assert.match(appSource, /setWorkspaceLoadPhase\('error'\)/);
});

test('highest-risk client mutations acquire synchronous operation keys', () => {
  for (const key of [
    'service-request:create',
    'home-history:create',
    'estimate-response:',
    'estimate-file:',
    'invoice-file:',
    'estimate-save:',
    'invoice-save:',
    'invoice-payment:',
    'invoice-from-job:',
    'invoice-from-job-items:',
    'estimate-send:',
    'invoice-send:',
    'job-finalize:',
    'job-report-send:',
    'job-complete:',
  ]) {
    assert.ok(appSource.includes(key), `missing guarded action ${key}`);
  }
});

test('finalized report retry reconciles canonical Job state before another upload', () => {
  const handler = appSource.slice(appSource.indexOf('const finalizeInspection = async'), appSource.indexOf('const downloadFinalizedInspectionReport'));
  assert.match(handler, /select\('id, status, job_status, report_storage_path, report_file_name'\)/);
  assert.match(handler, /currentJob\?\.status === 'finalized'/);
  assert.match(handler, /Report already finalized/);
  assert.ok(handler.indexOf(".from('inspections')") < handler.indexOf('generateInspectionPdf'));
});

test('payment history recovery keeps the selected Invoice and exposes retry', () => {
  assert.match(appSource, /onRetryHistory=\{\(\) => void loadInvoiceOfflinePaymentHistory\(recordPaymentInvoice\)\}/);
});

test('existing backend contracts provide durable idempotency for Draft launch, lineage conversion, and payment recording', () => {
  assert.match(durableDraftSql, /contractor_work_draft_launches_idempotency_idx/);
  assert.match(durableDraftSql, /p_idempotency_key uuid/);
  assert.match(durableDraftSql, /pg_advisory_xact_lock/);

  assert.match(estimateJobSql, /create unique index if not exists inspections_unique_estimate_job_idx/);
  assert.match(invoiceSourceSql, /pg_advisory_xact_lock\(hashtext\('servsync-invoice-estimate-/);
  assert.match(invoiceSourceSql, /pg_advisory_xact_lock\(hashtext\('servsync-invoice-job-/);
  assert.match(invoiceSourceSql, /'created', false/);

  assert.match(paymentSql, /p_idempotency_key uuid/);
  assert.match(paymentSql, /pg_advisory_xact_lock/);
  assert.match(paymentSql, /'created', false/);
});

test('final report client reconciliation does not overstate the current backend document guarantee', () => {
  assert.match(reportSql, /insert into public\.home_documents/);
  assert.doesNotMatch(reportSql, /p_idempotency_key/);
  assert.doesNotMatch(reportSql, /on conflict[\s\S]{0,240}home_documents/i);
});
