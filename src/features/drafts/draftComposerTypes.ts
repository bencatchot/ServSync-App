import type { DraftJobComposerDraft } from '../jobs/draftJobMappings';
import type { DraftChecklistSourceSnapshot } from './checklistDraftScope';

export type DraftIntendedOutput = 'estimate' | 'job';
export type DraftWorkFormat = 'standard' | 'inspection_checklist';

export type DraftOutcomeSessionState = {
  visited: boolean;
};

export type SharedDraftComposerDraft = DraftJobComposerDraft & {
  intended_output: DraftIntendedOutput | null;
  work_format: DraftWorkFormat;
  checklist_source: DraftChecklistSourceSnapshot | null;
  estimate_session: DraftOutcomeSessionState;
  job_session: DraftOutcomeSessionState;
};
