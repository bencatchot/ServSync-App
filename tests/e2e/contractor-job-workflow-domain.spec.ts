import { expect, test } from '@playwright/test';
import type { Inspection } from '../../src/types';
import {
  initialFindingStatusForJob,
  isChecklistJob,
  isSimpleServiceJob,
  jobHasChecklistStructure,
  jobTypeFromWorkflowKind,
  jobTypeHelperCopy,
  jobTypeLabel,
  roomIsApprovedScope,
  roomIsSimpleWorkItems,
  serviceTasksFromScope,
} from '../../src/features/work/contractorJobWorkflow';
import { sourceFile } from '../helpers/source-contract.mjs';

type JobWorkflowRecord = Pick<
  Inspection,
  'job_type' | 'template_id' | 'name' | 'summary' | 'rooms_with_findings'
>;

function job(overrides: Partial<JobWorkflowRecord> = {}): JobWorkflowRecord {
  return {
    job_type: 'service_visit',
    template_id: null,
    name: 'Service job',
    summary: '',
    rooms_with_findings: [],
    ...overrides,
  };
}

function checklistRoom(room = 'Kitchen') {
  return {
    room,
    findings: [{ title: 'Check sink', status: 'Not Recorded', notes: '', action: '', due: '', photos: [] }],
  } as NonNullable<Inspection['rooms_with_findings']>[number];
}

test.describe('Contractor Job workflow domain', () => {
  test('keeps Job classification and task derivation outside the App shell', () => {
    const appSource = sourceFile('src/App.tsx');
    const domainSource = sourceFile('src/features/work/contractorJobWorkflow.ts');

    expect(appSource).toContain("from './features/work/contractorJobWorkflow'");
    expect(appSource).not.toContain('function isChecklistJob(');
    expect(appSource).not.toContain('function serviceTasksFromScope(');
    expect(domainSource).toContain('export function isChecklistJob(');
    expect(domainSource).toContain('export function serviceTasksFromScope(');
  });

  test('derives stable service tasks from contractor scope without duplicates or title echoes', () => {
    expect(serviceTasksFromScope(
      'Replace filter; clean drain, test system and verify airflow\nReplace filter.',
      'Seasonal service',
    )).toEqual(['Replace filter', 'Clean drain', 'Test system', 'Verify airflow']);

    expect(serviceTasksFromScope('Repair leaking faucet.', 'Plumbing repair')).toEqual(['Repair leaking faucet']);
    expect(serviceTasksFromScope('Plumbing repair', 'Plumbing repair')).toEqual([]);
  });

  test('maps the existing workflow-kind and mode contract without changing lifecycle semantics', () => {
    expect(jobTypeFromWorkflowKind('work_order', 'simple')).toBe('service_visit');
    expect(jobTypeFromWorkflowKind('maintenance')).toBe('maintenance_visit');
    expect(jobTypeFromWorkflowKind('inspection')).toBe('inspection');
    expect(jobTypeFromWorkflowKind('assessment')).toBe('inspection');
    expect(jobTypeFromWorkflowKind('work_order')).toBe('service_visit');
  });

  test('recognizes only real checklist structure and ignores approved-scope compatibility rooms', () => {
    expect(jobHasChecklistStructure(job({ rooms_with_findings: [checklistRoom()] }))).toBe(true);
    expect(jobHasChecklistStructure(job({ rooms_with_findings: [checklistRoom('Approved Scope')] }))).toBe(false);
    expect(jobHasChecklistStructure(job({ rooms_with_findings: [] }))).toBe(false);
    expect(roomIsApprovedScope(' Approved-work ')).toBe(true);
    expect(roomIsSimpleWorkItems('work-items')).toBe(true);
  });

  test('lets explicit Job types win before legacy template and text inference', () => {
    const structure = [checklistRoom()];
    expect(isChecklistJob(job({ job_type: 'inspection', rooms_with_findings: [] }))).toBe(true);
    expect(isChecklistJob(job({ job_type: 'maintenance_visit', rooms_with_findings: [] }))).toBe(true);
    expect(isChecklistJob(job({ job_type: 'repair', name: 'Inspection repair', template_id: 'template-1', rooms_with_findings: structure }))).toBe(false);
    expect(isChecklistJob(job({ job_type: '', template_id: 'template-1', rooms_with_findings: structure }))).toBe(true);
    expect(isChecklistJob(job({ job_type: '', name: 'Home assessment report', rooms_with_findings: structure }))).toBe(true);
    expect(isSimpleServiceJob(job({ job_type: '', name: 'General service', rooms_with_findings: structure }))).toBe(true);
  });

  test('preserves default finding status, labels, and helper copy for every workflow family', () => {
    const inspection = job({ job_type: 'inspection' });
    const maintenance = job({ job_type: 'maintenance_visit' });
    const repair = job({ job_type: 'repair' });

    expect(initialFindingStatusForJob(inspection)).toBe('Not Recorded');
    expect(initialFindingStatusForJob(repair)).toBe('Pass');
    expect(jobTypeLabel(inspection)).toBe('Inspection / checklist job');
    expect(jobTypeLabel(maintenance)).toBe('Maintenance / checklist job');
    expect(jobTypeLabel(repair)).toBe('Repair job');
    expect(jobTypeHelperCopy(inspection)).toBe('Use checklist items and notes to document conditions.');
    expect(jobTypeHelperCopy(maintenance)).toBe('Record completed maintenance tasks and future recommendations.');
    expect(jobTypeHelperCopy(repair)).toBe('Document the problem, repair performed, parts used, and follow-up needs.');
  });
});
