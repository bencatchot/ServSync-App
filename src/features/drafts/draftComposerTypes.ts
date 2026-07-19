import type { DraftJobComposerDraft } from '../jobs/draftJobMappings';

export type DraftIntendedOutput = 'estimate' | 'job';
export type DraftWorkFormat = 'standard';

export type DraftOutcomeSessionState = {
  visited: boolean;
};

export type SharedDraftComposerDraft = DraftJobComposerDraft & {
  intended_output: DraftIntendedOutput | null;
  work_format: DraftWorkFormat;
  estimate_session: DraftOutcomeSessionState;
  job_session: DraftOutcomeSessionState;
};
