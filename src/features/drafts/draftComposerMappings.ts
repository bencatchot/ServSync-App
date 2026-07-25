import type { Inspection, JobWorkItem } from '../../types';
import {
  createBlankDraftJobComposerDraft,
  draftJobComposerDraftFromRecords,
  validateDraftJobComposerDraft,
  type DraftJobComposerDraft,
} from '../jobs/draftJobMappings';
import type {
  DraftIntendedOutput,
  DraftOutcomeSessionState,
  SharedDraftComposerDraft,
} from './draftComposerTypes';

type SharedDraftOptions = {
  intendedOutput?: DraftIntendedOutput | null;
  estimateSession?: DraftOutcomeSessionState;
  jobSession?: DraftOutcomeSessionState;
};

const EMPTY_OUTCOME_SESSION: DraftOutcomeSessionState = { visited: false };

export function createBlankSharedDraftComposerDraft(
  overrides: Partial<SharedDraftComposerDraft> = {},
): SharedDraftComposerDraft {
  const base = createBlankDraftJobComposerDraft(overrides);
  return {
    ...base,
    intended_output: overrides.work_format === 'inspection_checklist' ? 'job' : overrides.intended_output ?? null,
    work_format: overrides.work_format ?? 'standard',
    checklist_source: overrides.checklist_source ?? null,
    estimate_session: overrides.estimate_session ?? EMPTY_OUTCOME_SESSION,
    job_session: overrides.job_session ?? EMPTY_OUTCOME_SESSION,
  };
}

export function sharedDraftComposerDraftFromDraftJob(
  draft: DraftJobComposerDraft,
  options: SharedDraftOptions = {},
): SharedDraftComposerDraft {
  return {
    ...draft,
    intended_output: options.intendedOutput ?? null,
    work_format: 'standard',
    checklist_source: null,
    estimate_session: options.estimateSession ?? EMPTY_OUTCOME_SESSION,
    job_session: options.jobSession ?? EMPTY_OUTCOME_SESSION,
  };
}

export function sharedDraftComposerDraftFromRecords(
  inspection: Inspection,
  workItems: JobWorkItem[] = [],
): SharedDraftComposerDraft {
  return sharedDraftComposerDraftFromDraftJob(
    draftJobComposerDraftFromRecords(inspection, workItems),
    { intendedOutput: 'job' },
  );
}

export function sharedDraftComposerDraftToDraftJobDraft(
  draft: SharedDraftComposerDraft,
): DraftJobComposerDraft {
  const {
    intended_output: _intendedOutput,
    work_format: _workFormat,
    checklist_source: _checklistSource,
    estimate_session: _estimateSession,
    job_session: _jobSession,
    ...draftJob
  } = draft;
  return draftJob;
}

export function validateSharedDraftComposerDraftForSave(draft: SharedDraftComposerDraft) {
  const baseValidation = validateDraftJobComposerDraft(sharedDraftComposerDraftToDraftJobDraft(draft)).replace(/Draft Job/g, 'Draft');
  if (baseValidation) return baseValidation;
  if (draft.work_format === 'inspection_checklist') {
    if (draft.intended_output !== 'job') return 'Inspection Checklist Drafts can only create a Job.';
    if (!draft.checklist_source) return 'Choose an Inspection Checklist before saving this Draft.';
    if (draft.checklist_source.rooms.length === 0) return 'Choose an Inspection Checklist with at least one checklist item.';
  }
  return '';
}
