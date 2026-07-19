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
    intended_output: overrides.intended_output ?? null,
    work_format: 'standard',
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
    estimate_session: _estimateSession,
    job_session: _jobSession,
    ...draftJob
  } = draft;
  return draftJob;
}

export function validateSharedDraftComposerDraftForSave(draft: SharedDraftComposerDraft) {
  return validateDraftJobComposerDraft(sharedDraftComposerDraftToDraftJobDraft(draft)).replace(/Draft Job/g, 'Draft');
}
