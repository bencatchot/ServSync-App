import type { Inspection } from '../../types';

type JobClassificationFields = Pick<Inspection, 'job_origin' | 'status' | 'job_status'>;

export function isComposerDraftJob(inspection: JobClassificationFields | null | undefined) {
  return inspection?.job_origin === 'draft_composer'
    && inspection.status === 'draft'
    && inspection.job_status === 'draft';
}

export function isOperationalJob(inspection: JobClassificationFields | null | undefined) {
  return Boolean(inspection) && !isComposerDraftJob(inspection);
}

export function composerDraftJobsFrom<T extends JobClassificationFields & { draft_saved_at?: string | null; updated_at: string }>(inspections: T[]) {
  return inspections
    .filter(isComposerDraftJob)
    .sort((a, b) => new Date(b.draft_saved_at || b.updated_at).getTime() - new Date(a.draft_saved_at || a.updated_at).getTime());
}

export function operationalJobsFrom<T extends JobClassificationFields>(inspections: T[]) {
  return inspections.filter(isOperationalJob);
}
