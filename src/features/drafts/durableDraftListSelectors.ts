import type { Inspection } from '../../types';
import { isComposerDraftJob } from '../jobs/jobRecordSelectors';
import { legacyDraftsWithoutDurableMatches } from './durableDraftComposerIntegration';
import type { DurableDraftListPresentation } from './durableDraftMappings';

function durableDraftRowBelongsInPrimaryList(row: DurableDraftListPresentation) {
  return row.status !== 'consumed' || !row.outputAvailable;
}

export function durableDraftPrimaryListRows(rows: DurableDraftListPresentation[]) {
  return rows
    .filter(durableDraftRowBelongsInPrimaryList)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.draftId.localeCompare(right.draftId));
}

export function durableDraftPrimaryListCount(
  durableDrafts: DurableDraftListPresentation[],
  legacyDrafts: Inspection[],
) {
  const currentRows = durableDraftPrimaryListRows(durableDrafts);
  const visibleLegacy = legacyDraftsWithoutDurableMatches(
    legacyDrafts.filter(isComposerDraftJob),
    currentRows,
  );
  return currentRows.length + visibleLegacy.length;
}
