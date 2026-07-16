import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  composerDraftJobsFrom,
  isComposerDraftJob,
  isOperationalJob,
  operationalJobsFrom,
} from '../../src/features/jobs/jobRecordSelectors';
import {
  inspectionIsClosedJob,
  inspectionIsOpenJob,
} from '../../src/features/jobs/status';

const sourceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  expect(startIndex, `Expected source marker: ${start}`).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex, `Expected source end marker: ${end}`).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

function inspection(overrides: Record<string, unknown>) {
  return {
    id: 'job-1',
    name: 'Service job',
    status: 'draft',
    job_status: 'draft',
    job_origin: 'direct',
    updated_at: '2026-07-15T12:00:00.000Z',
    created_at: '2026-07-15T12:00:00.000Z',
    ...overrides,
  } as any;
}

test.describe('Draft Job operational filtering', () => {
  test('classifies exact composer Draft Jobs separately from operational jobs', () => {
    const composerDraft = inspection({
      id: 'composer-draft',
      name: 'Composer Draft',
      job_origin: 'draft_composer',
      status: 'draft',
      job_status: 'draft',
    });
    const legacyGenericDraft = inspection({
      id: 'legacy-draft',
      name: 'Legacy Draft',
      job_origin: null,
      status: 'draft',
      job_status: 'draft',
    });
    const estimateOriginDraft = inspection({
      id: 'estimate-draft',
      name: 'Estimate Origin Draft',
      job_origin: 'estimate',
      status: 'draft',
      job_status: 'draft',
    });
    const activatedFormerComposerJob = inspection({
      id: 'activated-composer-job',
      name: 'Activated Composer Job',
      job_origin: 'draft_composer',
      status: 'draft',
      job_status: 'in_progress',
    });
    const finalizedComposerOriginRecord = inspection({
      id: 'finalized-composer-record',
      name: 'Finalized Composer Record',
      job_origin: 'draft_composer',
      status: 'finalized',
      job_status: 'completed',
    });

    expect(isComposerDraftJob(composerDraft)).toBe(true);
    expect(isOperationalJob(composerDraft)).toBe(false);
    expect(isComposerDraftJob(legacyGenericDraft)).toBe(false);
    expect(isOperationalJob(legacyGenericDraft)).toBe(true);
    expect(isComposerDraftJob(estimateOriginDraft)).toBe(false);
    expect(isOperationalJob(estimateOriginDraft)).toBe(true);
    expect(isComposerDraftJob(activatedFormerComposerJob)).toBe(false);
    expect(isOperationalJob(activatedFormerComposerJob)).toBe(true);
    expect(isComposerDraftJob(finalizedComposerOriginRecord)).toBe(false);
    expect(isOperationalJob(finalizedComposerOriginRecord)).toBe(true);
  });

  test('excludes composer Draft Jobs before operational recent lists, counts, status groups, and customer filters are derived', () => {
    const normalOpenJob = inspection({
      id: 'normal-open',
      name: 'Normal open job',
      job_origin: 'direct',
      status: 'draft',
      job_status: 'in_progress',
      local_contact_id: 'local-1',
      updated_at: '2026-07-15T12:10:00.000Z',
    });
    const normalClosedJob = inspection({
      id: 'normal-closed',
      name: 'Normal closed job',
      job_origin: 'estimate',
      status: 'finalized',
      job_status: 'completed',
      local_contact_id: 'local-1',
      updated_at: '2026-07-15T12:05:00.000Z',
    });
    const composerDraft = inspection({
      id: 'composer-draft',
      name: 'PROD QA Draft Job UI Gate',
      job_origin: 'draft_composer',
      status: 'draft',
      job_status: 'draft',
      local_contact_id: 'local-1',
      updated_at: '2026-07-15T12:15:00.000Z',
      draft_saved_at: '2026-07-15T12:15:00.000Z',
    });
    const activatedFormerComposerJob = inspection({
      id: 'activated-composer-job',
      name: 'Activated composer job',
      job_origin: 'draft_composer',
      status: 'draft',
      job_status: 'scheduled',
      local_contact_id: 'local-1',
      updated_at: '2026-07-15T12:20:00.000Z',
    });

    const allJobs = [composerDraft, activatedFormerComposerJob, normalOpenJob, normalClosedJob];
    const operationalJobs = operationalJobsFrom(allJobs);
    const recentJobs = operationalJobs.slice(0, 5);
    const openJobs = operationalJobs.filter(inspectionIsOpenJob);
    const closedJobs = operationalJobs.filter(inspectionIsClosedJob);
    const selectedCustomerWork = operationalJobs.filter(job => job.local_contact_id === 'local-1');
    const searchResults = operationalJobs.filter(job => `${job.name} ${job.summary ?? ''}`.toLowerCase().includes('job'));

    expect(composerDraftJobsFrom(allJobs).map(job => job.id)).toEqual(['composer-draft']);
    expect(operationalJobs.map(job => job.id)).toEqual(['activated-composer-job', 'normal-open', 'normal-closed']);
    expect(recentJobs.map(job => job.id)).not.toContain('composer-draft');
    expect(openJobs.map(job => job.id)).toEqual(['activated-composer-job', 'normal-open']);
    expect(closedJobs.map(job => job.id)).toEqual(['normal-closed']);
    expect(selectedCustomerWork.map(job => job.id)).not.toContain('composer-draft');
    expect(searchResults.map(job => job.id)).not.toContain('composer-draft');
  });

  test('keeps the Jobs overview incident path on operational records only', () => {
    const appSource = sourceFile('src/App.tsx');
    const overviewRecentJobs = sourceBetween(
      appSource,
      '<Card title="Recent jobs" icon={<ClipboardCheck size={18} />}>',
      '{/* ── DRAFT JOB COMPOSER VIEW ── */}',
    );
    const focusedJobsList = sourceBetween(
      appSource,
      'const baseRecords = contractorJobsView ===',
      'const jobTypeFilterOptions = [',
    );

    expect(appSource).toContain('const composerDraftJobs = composerDraftJobsFrom(inspections);');
    expect(appSource).toContain('const operationalInspections = operationalJobsFrom(inspections);');
    expect(overviewRecentJobs).toContain('operationalInspections.length === 0');
    expect(overviewRecentJobs).toContain('operationalInspections.slice(0, 5).map');
    expect(overviewRecentJobs).not.toContain('inspections.slice(0, 5)');
    expect(focusedJobsList).toContain('jobsCustomerFilterSubjectId ? openJobsForSelectedCustomer : openJobs');
    expect(focusedJobsList).toContain('jobsCustomerFilterSubjectId ? closedJobsForSelectedCustomer : closedJobs');
  });

  test('prevents composer Draft Jobs from receiving ordinary operational actions defensively', () => {
    const appSource = sourceFile('src/App.tsx');
    const deleteSource = sourceBetween(appSource, 'const deleteInspection = async', 'const openInspection =');
    const openSource = sourceBetween(appSource, 'const openInspection =', 'const reopenJobFromInvoice =');
    const overviewRecentJobs = sourceBetween(
      appSource,
      '<Card title="Recent jobs" icon={<ClipboardCheck size={18} />}>',
      '{/* ── DRAFT JOB COMPOSER VIEW ── */}',
    );

    expect(deleteSource).toContain('if (isComposerDraftJob(insp))');
    expect(deleteSource).toContain('Draft Jobs can only be managed from the Drafts section.');
    expect(deleteSource).toContain('if (deletingInspectionId) return;');
    expect(openSource).toContain('if (isComposerDraftJob(insp))');
    expect(openSource).toContain('void continueDraftJob(insp);');
    expect(openSource).toContain('Draft Job UI is not enabled in this environment.');
    expect(overviewRecentJobs).not.toContain('Continue Draft');
    expect(overviewRecentJobs).toContain('Continue Job');
    expect(overviewRecentJobs).toContain('disabled={Boolean(deletingInspectionId)}');
  });
});
