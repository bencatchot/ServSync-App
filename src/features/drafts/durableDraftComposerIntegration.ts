import type { Inspection } from '../../types';
import { createWorkComposerLineDraft } from '../work-composer/workComposerDrafts';
import type { SharedDraftComposerDraft } from './draftComposerTypes';
import {
  canonicalDraftToSaveMetadata,
  canonicalItemsToSaveItems,
  durableDraftEnvelopeFromRpc,
  type DurableDraftCanonicalItem,
  type DurableDraftCanonicalState,
  type DurableDraftListPresentation,
} from './durableDraftMappings';
import {
  DurableDraftError,
  normalizeDurableDraftError,
} from './durableDraftLaunchApi';
import type {
  ContractorWorkDraftEnvelope,
  ContractorWorkDraftSavePayload,
  DurableDraftOperationPhase,
} from './durableDraftLaunchTypes';

export type DurableDraftOpenTarget =
  | { kind: 'new'; initialDraft: SharedDraftComposerDraft }
  | { kind: 'durable'; draftId: string }
  | { kind: 'legacy'; inspectionId: string };

export type DurableDraftSavePreparation = {
  submitted: DurableDraftCanonicalState;
  payload: ContractorWorkDraftSavePayload;
};

export function isDurableDraftComposerPathEnabled(input: {
  sharedDraftEnabled: boolean;
  draftJobEnabled: boolean;
  demoPresentationMode: boolean;
}) {
  return input.sharedDraftEnabled && input.draftJobEnabled && !input.demoPresentationMode;
}

function centsToInput(value: number | null) {
  return value === null ? '' : (value / 100).toFixed(2);
}

function numberToInput(value: number | null) {
  return value === null ? '' : String(value);
}

function inputToNonNegativeNumber(value: string, fallback: number | null) {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return fallback;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function moneyInputToCents(value: string) {
  const normalized = value.replace(/[$,]/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

export function durableCanonicalStateToComposer(state: DurableDraftCanonicalState): SharedDraftComposerDraft {
  const { draft } = state;
  return {
    subject_type: draft.subject.type === 'local_contact' ? 'local' : 'connected',
    homeowner_user_id: draft.subject.type === 'connected_homeowner' ? draft.subject.homeownerUserId ?? '' : '',
    home_id: draft.subject.type === 'connected_homeowner' ? draft.subject.homeId ?? '' : '',
    local_contact_id: draft.subject.type === 'local_contact' ? draft.subject.localContactId ?? '' : '',
    local_home_id: draft.subject.type === 'local_contact' ? draft.subject.localHomeId ?? '' : '',
    service_request_id: draft.subject.type === 'connected_homeowner' ? draft.subject.serviceRequestId ?? '' : '',
    title: draft.title,
    scope: draft.scopeDescription,
    notes: draft.privateNotes,
    intended_output: draft.intendedOutput,
    work_format: draft.workFormat,
    checklist_source: draft.checklistSource,
    labor_mode: draft.laborMode ?? 'line_specific',
    labor_rate: centsToInput(draft.laborRateCents),
    job_labor_hours: numberToInput(draft.jobLaborHours),
    estimate_session: { visited: draft.intendedOutput === 'estimate' },
    job_session: { visited: draft.intendedOutput === 'job' },
    line_items: state.items.map(item => createWorkComposerLineDraft({
      id: item.rowId,
      job_work_item_id: item.durableItemId,
      line_type: item.lineType,
      line_title: item.title,
      description: item.description,
      customer_description: item.customerDescription,
      internal_notes: item.internalNotes,
      quantity: String(item.quantity),
      unit: item.unit,
      unit_price: centsToInput(item.unitPriceCents),
      labor_hours: numberToInput(item.laborHours),
      room_id: item.roomId,
      room_label: item.roomLabel ?? '',
      location_label: item.locationLabel ?? '',
    })),
  };
}

function canonicalItemsFromComposer(
  draft: SharedDraftComposerDraft,
  currentDraftId: string | null,
): DurableDraftCanonicalItem[] {
  return draft.line_items.map((line, sortOrder) => ({
    rowId: line.id,
    durableItemId: line.job_work_item_id ?? null,
    sourceDraftId: line.job_work_item_id ? currentDraftId : null,
    title: line.line_title.trim() || line.description.trim(),
    description: line.description,
    customerDescription: line.customer_description,
    internalNotes: line.internal_notes ?? '',
    lineType: line.line_type,
    quantity: inputToNonNegativeNumber(line.quantity, 1) ?? 1,
    unit: line.unit,
    unitPriceCents: moneyInputToCents(line.unit_price),
    laborHours: inputToNonNegativeNumber(line.labor_hours, null),
    roomId: line.room_id ?? null,
    roomLabel: line.room_label?.trim() || null,
    locationLabel: line.location_label?.trim() || null,
    sortOrder,
    createdAt: null,
    updatedAt: null,
  }));
}

export function prepareDurableDraftSave(input: {
  form: SharedDraftComposerDraft;
  current: DurableDraftCanonicalState | null;
  contractorId: string;
  removedDurableItemIds: readonly string[];
}): DurableDraftSavePreparation {
  const currentDraft = input.current?.draft ?? null;
  const draftId = currentDraft?.draftId ?? null;
  const submitted: DurableDraftCanonicalState = {
    draft: {
      draftId,
      contractorId: currentDraft?.contractorId ?? input.contractorId,
      createdByUserId: currentDraft?.createdByUserId ?? null,
      subject: input.form.subject_type === 'local'
        ? {
            type: 'local_contact',
            localContactId: input.form.local_contact_id || null,
            localHomeId: input.form.local_home_id || null,
          }
        : {
            type: 'connected_homeowner',
            homeownerUserId: input.form.homeowner_user_id || null,
            homeId: input.form.home_id || null,
            serviceRequestId: input.form.service_request_id || null,
          },
      subjectDisplayNameSnapshot: currentDraft?.subjectDisplayNameSnapshot ?? '',
      propertyDisplaySnapshot: currentDraft?.propertyDisplaySnapshot ?? '',
      title: input.form.title,
      scopeDescription: input.form.scope,
      privateNotes: input.form.notes,
      intendedOutput: input.form.work_format === 'inspection_checklist' ? 'job' : input.form.intended_output,
      workFormat: input.form.work_format,
      laborMode: input.form.labor_mode,
      laborRateCents: moneyInputToCents(input.form.labor_rate),
      jobLaborHours: inputToNonNegativeNumber(input.form.job_labor_hours, null),
      status: currentDraft?.status ?? 'active',
      legacyInspectionId: currentDraft?.legacyInspectionId ?? null,
      launchedOutputType: currentDraft?.launchedOutputType ?? null,
      launchedEstimateId: currentDraft?.launchedEstimateId ?? null,
      launchedJobId: currentDraft?.launchedJobId ?? null,
      launchedEstimateIdSnapshot: currentDraft?.launchedEstimateIdSnapshot ?? null,
      launchedJobIdSnapshot: currentDraft?.launchedJobIdSnapshot ?? null,
      launchedAt: currentDraft?.launchedAt ?? null,
      launchedByUserId: currentDraft?.launchedByUserId ?? null,
      createdAt: currentDraft?.createdAt ?? null,
      updatedAt: currentDraft?.updatedAt ?? null,
      checklistSource: input.form.work_format === 'inspection_checklist' ? input.form.checklist_source : null,
    },
    items: canonicalItemsFromComposer(input.form, draftId),
    launches: input.current?.launches ? [...input.current.launches] : [],
  };

  return {
    submitted,
    payload: {
      draft_id: draftId,
      metadata: canonicalDraftToSaveMetadata(submitted.draft),
      items: canonicalItemsToSaveItems(submitted.items, draftId),
      removed_item_ids: [...input.removedDurableItemIds],
    },
  };
}

export function canonicalStateFromEnvelope(envelope: ContractorWorkDraftEnvelope) {
  return durableDraftEnvelopeFromRpc(envelope);
}

export function legacyDraftsWithoutDurableMatches<T extends Pick<Inspection, 'id'>>(
  legacyDrafts: readonly T[],
  durableDrafts: readonly DurableDraftListPresentation[],
) {
  const importedInspectionIds = new Set(durableDrafts.flatMap(draft => draft.legacyInspectionId ? [draft.legacyInspectionId] : []));
  return legacyDrafts.filter(draft => !importedInspectionIds.has(draft.id));
}

export function durableDraftSafeMessage(error: unknown, phase: DurableDraftOperationPhase) {
  const normalized = error instanceof DurableDraftError ? error : normalizeDurableDraftError(error, phase);
  const messages: Record<string, string> = {
    DRAFT_PERMISSION_DENIED: 'You do not have access to change this Draft.',
    DRAFT_NOT_FOUND: 'This Draft is no longer available.',
    DRAFT_NOT_ACTIVE: 'This Draft is read-only and can no longer be changed.',
    DRAFT_INVALID: 'Review the Draft details and try again.',
    DRAFT_RESPONSE_INVALID: 'ServSync could not safely read the saved Draft. Try again.',
    CUSTOMER_INVALID: 'Choose an available customer and try again.',
    PROPERTY_INVALID: 'Choose an available property and try again.',
    PROPERTY_NOT_SHARED: 'That property is no longer shared for this work.',
    SERVICE_REQUEST_INVALID: 'The selected service request is no longer available.',
    LEGACY_DRAFT_INCOMPATIBLE: 'This earlier Draft cannot be prepared for the new Composer.',
    network: 'The network connection was interrupted. Your local edits are still here.',
    timeout: 'The request timed out. Your local edits are still here.',
    offline: 'You appear to be offline. Your local edits are still here.',
  };
  return messages[normalized.applicationCode ?? normalized.transportClassification ?? '']
    ?? (phase === 'list'
      ? 'Drafts could not be loaded. Try again.'
      : phase === 'import'
        ? 'This earlier Draft could not be prepared. It has not been changed.'
        : phase === 'get'
          ? 'This Draft could not be opened. Try again.'
          : 'This Draft could not be saved. Your local edits are still here.');
}
