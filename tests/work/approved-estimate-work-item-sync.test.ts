import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { approvedEstimateWorkItemCompletionPlan } from '../../src/features/work/contractorJobWorkflow';
import type { Inspection, JobWorkItem } from '../../src/types';

const job = {
  id: 'job-1',
  rooms_with_findings: [{
    room: 'Approved Scope',
    findings: [
      { title: 'Replace water heater', status: 'Fixed On Site' },
      { title: 'Replace water heater', status: 'Monitor' },
      { title: 'Test system', status: 'Fixed On Site' },
    ],
  }],
} as Pick<Inspection, 'id' | 'rooms_with_findings'>;

const item = (overrides: Partial<JobWorkItem>): JobWorkItem => ({
  id: 'item-1',
  inspection_id: 'job-1',
  contractor_id: 'contractor-1',
  source_estimate_line_item_id: 'estimate-line-1',
  title: 'Replace water heater',
  description: '',
  customer_description: '',
  internal_notes: '',
  line_type: 'other',
  quantity: 1,
  unit: 'each',
  unit_price_cents: 100,
  billable: true,
  completion_status: 'open',
  billing_status: 'unbilled',
  work_state: 'open',
  approval_required: false,
  approval_status: 'not_required',
  sort_order: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

test('approved Estimate findings update their exact durable work items in stable duplicate-title order', () => {
  const updates = approvedEstimateWorkItemCompletionPlan(job, [
    item({ id: 'first', source_estimate_line_item_id: 'line-1', sort_order: 1 }),
    item({ id: 'second', source_estimate_line_item_id: 'line-2', sort_order: 2 }),
    item({ id: 'third', source_estimate_line_item_id: 'line-3', title: 'Test system', sort_order: 3 }),
  ], 'contractor-user', '2026-08-28T10:00:00.000Z');

  assert.deepEqual(updates, [
    { id: 'first', completion_status: 'completed', completed_at: '2026-08-28T10:00:00.000Z', completed_by: 'contractor-user' },
    { id: 'second', completion_status: 'open', completed_at: null, completed_by: null },
    { id: 'third', completion_status: 'completed', completed_at: '2026-08-28T10:00:00.000Z', completed_by: 'contractor-user' },
  ]);
});

test('sync plan preserves completion provenance and ignores drafted, unrelated, and simple-task items', () => {
  const updates = approvedEstimateWorkItemCompletionPlan(job, [
    item({ id: 'preserved', completed_at: '2026-08-27T09:00:00.000Z', completed_by: 'original-user' }),
    item({ id: 'drafted', source_estimate_line_item_id: 'line-2', billing_status: 'drafted', sort_order: 2 }),
    item({ id: 'other-job', inspection_id: 'job-2', source_estimate_line_item_id: 'line-3', title: 'Test system', sort_order: 3 }),
    item({ id: 'simple', source_estimate_line_item_id: null, source_type: 'simple_task', title: 'Test system', sort_order: 4 }),
  ], 'contractor-user', '2026-08-28T10:00:00.000Z');

  assert.deepEqual(updates, [
    { id: 'preserved', completion_status: 'completed', completed_at: '2026-08-27T09:00:00.000Z', completed_by: 'original-user' },
  ]);
});

test('Job completion synchronizes approved Estimate items before the simple-job-only return', () => {
  const source = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  const syncSource = source.slice(
    source.indexOf('const syncJobWorkItemsForWorkflow = async'),
    source.indexOf('const buildInspectionRoomsSnapshot ='),
  );

  assert.ok(syncSource.indexOf('await syncApprovedEstimateJobWorkItems(') > -1);
  assert.ok(syncSource.indexOf('await syncApprovedEstimateJobWorkItems(') < syncSource.indexOf('if (!isSimpleServiceJob(insp))'));
  assert.ok(source.includes('const syncedWorkItems = await syncJobWorkItemsForWorkflow(completedJob);'));
});

test('field-work autosave retries a skipped overlapping save instead of marking it persisted', () => {
  const source = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  const saveSource = source.slice(
    source.indexOf('const saveInspectionProgress = async'),
    source.indexOf('const finalizeInspection = async'),
  );
  const autoSaveSource = source.slice(
    source.indexOf('const signature = JSON.stringify({', source.indexOf('const saveInspectionProgress = async')),
    source.indexOf('const handleInspectionPhotoUpload = async'),
  );

  assert.match(saveSource, /contractorActionGuard\.begin\(actionKey\)[\s\S]*return false;/);
  assert.match(saveSource, /await persistInspectionRooms\([\s\S]*return true;/);
  assert.match(autoSaveSource, /\.then\(saved => \{ if \(saved\) autoSaveStateRef\.current\.lastSignature = signature; else [\s\S]*setAutoSaveRetryNonce/);
  assert.match(autoSaveSource, /canManageJobOperations, autoSaveRetryNonce\]/);
});
