import assert from 'node:assert/strict';
import test from 'node:test';
import { eligibleVisitJobs, visitAttention, visitCompleted, visitProgress, visitStatus, type PlanVisit } from '../../src/features/serviceAgreements/visits';
import type { Inspection, ServiceAgreement } from '../../src/types';

const visit = (status: string | null, due = '2026-11-13') => ({ id: 'v', job_status: status, due_on: due } as PlanVisit);
test('only completed and closed Jobs consume a visit; reopen and cancel do not', () => {
  for (const status of [null, 'draft', 'scheduled', 'in_progress', 'cancelled']) assert.equal(visitCompleted(visit(status)), false);
  for (const status of ['completed', 'closed']) assert.equal(visitCompleted(visit(status)), true);
  assert.match(visitStatus(visit('cancelled')), /not completed/);
});
test('date-only due attention is separate from scheduled status and excludes completed work', () => {
  assert.equal(visitAttention(visit('scheduled', '2026-11-12'), '2026-11-13'), 'Overdue');
  assert.equal(visitAttention(visit(null), '2026-11-13'), 'Due soon');
  assert.equal(visitAttention(visit(null, '2026-12-13'), '2026-11-13'), 'Due soon');
  assert.equal(visitAttention(visit(null, '2026-12-14'), '2026-11-13'), null);
  assert.equal(visitAttention(visit('completed', '2026-11-01'), '2026-11-13'), null);
});
test('unknown allowance never becomes the count of tracked visits; partial shared progress is labeled', () => {
  const plan = { included_visit_count: null } as ServiceAgreement;
  assert.match(visitProgress(plan, [visit('completed')]), /No visit allowance specified/);
  assert.equal(visitProgress({ ...plan, included_visit_count: 2 }, [visit('completed'), visit('cancelled')]), '1 of 2 included visits completed');
  assert.match(visitProgress(plan, [visit('completed')], true), /1 shared visit completed/);
});
test('eligible Jobs must match contractor, homeowner and exact property, excluding private Drafts', () => {
  const plan = { contractor_id: 'c', homeowner_user_id: 'h', home_id: 'p' } as ServiceAgreement;
  const job = { id: 'good', ...plan, status: 'draft', job_status: 'scheduled' } as Inspection;
  const jobs = [job, { ...job, id: 'foreign', contractor_id: 'other' }, { ...job, id: 'other-home', home_id: 'other' },
    { ...job, id: 'other-user', homeowner_user_id: 'other' }, { ...job, id: 'draft', job_origin: 'draft_composer', job_status: 'draft' } as Inspection];
  assert.deepEqual(eligibleVisitJobs(plan, jobs).map(j => j.id), ['good']);
});
