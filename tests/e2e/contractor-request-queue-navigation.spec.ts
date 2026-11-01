import { expect, test } from '@playwright/test';
import { contractorRequestQueueRecords, sortContractorRequestRecords } from '../../src/features/requests/contractorQueue';
import type { ServiceRequestSummary } from '../../src/types';

test('an explicit request link remains reachable after job creation without reopening other job requests', () => {
  const records = [{ id: 'intake' }, { id: 'scheduled-job' }, { id: 'other-job' }];
  const jobs = new Set(['scheduled-job', 'other-job']);
  expect(contractorRequestQueueRecords(records, jobs, null)).toEqual([records[0]]);
  expect(contractorRequestQueueRecords(records, jobs, 'scheduled-job')).toEqual([records[0], records[1]]);
  expect(contractorRequestQueueRecords(records, jobs, 'missing-or-inaccessible')).toEqual([records[0]]);
  expect(contractorRequestQueueRecords(records, jobs, 'intake')).toEqual([records[0]]);
});

test('request priorities remain attention, urgency, appointment, then most recently updated', () => {
  const row = (id: string, overrides = {}) => ({ id, urgency: 'normal', updated_at: '2026-10-01', appointment: null, ...overrides } as ServiceRequestSummary);
  const records = [row('old'), row('new', { updated_at: '2026-10-02' }), row('appointment', { appointment: {} }), row('urgent', { urgency: 'urgent' }), row('attention')];
  expect(sortContractorRequestRecords(records, request => request.id === 'attention').map(request => request.id))
    .toEqual(['attention', 'urgent', 'appointment', 'new', 'old']);
  expect(records[0].id).toBe('old');
});
