import type {
  ContractorWorkDraft,
  ContractorWorkDraftEnvelope,
  ContractorWorkDraftIntendedOutput,
  ContractorWorkDraftItem,
  ContractorWorkDraftItemInput,
  ContractorWorkDraftLaborMode,
  ContractorWorkDraftLaunch,
  ContractorWorkDraftLaunchOutput,
  ContractorWorkDraftLegacyImportResponse,
  ContractorWorkDraftLineType,
  ContractorWorkDraftListRow,
  ContractorWorkDraftMetadataInput,
  ContractorWorkDraftStatus,
  ContractorWorkDraftSubjectType,
  ContractorWorkDraftWorkFormat,
} from './durableDraftLaunchTypes';

export type DurableDraftSubject =
  | {
      type: 'connected_homeowner';
      homeownerUserId: string | null;
      homeId: string | null;
      serviceRequestId: string | null;
    }
  | {
      type: 'local_contact';
      localContactId: string | null;
      localHomeId: string | null;
    };

export type DurableDraftCanonicalModel = {
  draftId: string | null;
  contractorId: string | null;
  createdByUserId: string | null;
  subject: DurableDraftSubject;
  subjectDisplayNameSnapshot: string;
  propertyDisplaySnapshot: string;
  title: string;
  scopeDescription: string;
  privateNotes: string;
  intendedOutput: ContractorWorkDraftIntendedOutput | null;
  workFormat: ContractorWorkDraftWorkFormat;
  laborMode: ContractorWorkDraftLaborMode;
  laborRateCents: number | null;
  jobLaborHours: number | null;
  status: ContractorWorkDraftStatus;
  legacyInspectionId: string | null;
  launchedOutputType: ContractorWorkDraftLaunchOutput | null;
  launchedEstimateId: string | null;
  launchedJobId: string | null;
  launchedEstimateIdSnapshot: string | null;
  launchedJobIdSnapshot: string | null;
  launchedAt: string | null;
  launchedByUserId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type DurableDraftCanonicalItem = {
  rowId: string;
  durableItemId: string | null;
  sourceDraftId: string | null;
  title: string;
  description: string;
  customerDescription: string;
  internalNotes: string;
  lineType: ContractorWorkDraftLineType;
  quantity: number;
  unit: string;
  unitPriceCents: number | null;
  laborHours: number | null;
  roomId: string | null;
  roomLabel: string | null;
  locationLabel: string | null;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type DurableDraftCanonicalState = {
  draft: DurableDraftCanonicalModel;
  items: DurableDraftCanonicalItem[];
  launches: ContractorWorkDraftLaunch[];
};

export type DurableDraftListPresentation = {
  draftId: string;
  contractorId: string;
  status: ContractorWorkDraftStatus;
  intendedOutput: ContractorWorkDraftIntendedOutput | null;
  title: string;
  subjectType: ContractorWorkDraftSubjectType;
  subjectLabel: string;
  propertyLabel: string;
  legacyInspectionId: string | null;
  launchedOutputType: ContractorWorkDraftLaunchOutput | null;
  liveOutputId: string | null;
  outputIdSnapshot: string | null;
  outputAvailable: boolean;
  launchedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DurableDraftResumeRequest = {
  draftId: string;
};

function subjectFromDraft(draft: ContractorWorkDraft): DurableDraftSubject {
  if (draft.subject_type === 'local_contact') {
    return {
      type: 'local_contact',
      localContactId: draft.local_contact_id,
      localHomeId: draft.local_home_id,
    };
  }
  return {
    type: 'connected_homeowner',
    homeownerUserId: draft.homeowner_user_id,
    homeId: draft.home_id,
    serviceRequestId: draft.service_request_id,
  };
}

export function durableDraftFromRpc(draft: ContractorWorkDraft): DurableDraftCanonicalModel {
  return {
    draftId: draft.id,
    contractorId: draft.contractor_id,
    createdByUserId: draft.created_by_user_id,
    subject: subjectFromDraft(draft),
    subjectDisplayNameSnapshot: draft.subject_display_name_snapshot,
    propertyDisplaySnapshot: draft.property_display_snapshot,
    title: draft.title,
    scopeDescription: draft.scope_description,
    privateNotes: draft.private_notes,
    intendedOutput: draft.intended_output,
    workFormat: draft.work_format,
    laborMode: draft.labor_mode,
    laborRateCents: draft.labor_rate_cents,
    jobLaborHours: draft.job_labor_hours,
    status: draft.status,
    legacyInspectionId: draft.legacy_inspection_id,
    launchedOutputType: draft.launched_output_type,
    launchedEstimateId: draft.launched_estimate_id,
    launchedJobId: draft.launched_job_id,
    launchedEstimateIdSnapshot: draft.launched_estimate_id_snapshot,
    launchedJobIdSnapshot: draft.launched_job_id_snapshot,
    launchedAt: draft.launched_at,
    launchedByUserId: draft.launched_by_user_id,
    createdAt: draft.created_at,
    updatedAt: draft.updated_at,
  };
}

export function durableDraftItemsFromRpc(items: readonly ContractorWorkDraftItem[]): DurableDraftCanonicalItem[] {
  return [...items]
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map(item => ({
      rowId: item.id,
      durableItemId: item.id,
      sourceDraftId: item.draft_id,
      title: item.title,
      description: item.description,
      customerDescription: item.customer_description,
      internalNotes: item.internal_notes,
      lineType: item.line_type,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceCents: item.unit_price_cents,
      laborHours: item.labor_hours,
      roomId: item.room_id,
      roomLabel: item.room_label,
      locationLabel: item.location_label,
      sortOrder: item.sort_order,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }));
}

export function durableDraftEnvelopeFromRpc(envelope: ContractorWorkDraftEnvelope): DurableDraftCanonicalState {
  return {
    draft: durableDraftFromRpc(envelope.draft),
    items: durableDraftItemsFromRpc(envelope.items),
    launches: [...envelope.launches],
  };
}

export function canonicalDraftToSaveMetadata(draft: DurableDraftCanonicalModel): ContractorWorkDraftMetadataInput {
  const subjectFields = draft.subject.type === 'connected_homeowner'
    ? {
        homeowner_user_id: draft.subject.homeownerUserId,
        home_id: draft.subject.homeId,
        local_contact_id: null,
        local_home_id: null,
        service_request_id: draft.subject.serviceRequestId,
      }
    : {
        homeowner_user_id: null,
        home_id: null,
        local_contact_id: draft.subject.localContactId,
        local_home_id: draft.subject.localHomeId,
        service_request_id: null,
      };
  return {
    ...subjectFields,
    title: draft.title,
    scope_description: draft.scopeDescription,
    private_notes: draft.privateNotes,
    intended_output: draft.intendedOutput,
    work_format: draft.workFormat,
    labor_mode: draft.laborMode,
    labor_rate_cents: draft.laborRateCents,
    job_labor_hours: draft.jobLaborHours,
    legacy_inspection_id: draft.legacyInspectionId,
  };
}

function assertPersistedItemOwnership(items: readonly DurableDraftCanonicalItem[], draftId: string | null) {
  const durableIds = new Set<string>();
  for (const item of items) {
    if (!item.durableItemId) continue;
    if (!draftId || item.sourceDraftId !== draftId) {
      throw new Error('DURABLE_ITEM_DRAFT_MISMATCH');
    }
    if (durableIds.has(item.durableItemId)) throw new Error('DUPLICATE_DURABLE_ITEM_ID');
    durableIds.add(item.durableItemId);
  }
}

export function canonicalItemsToSaveItems(
  items: readonly DurableDraftCanonicalItem[],
  draftId: string | null,
): ContractorWorkDraftItemInput[] {
  assertPersistedItemOwnership(items, draftId);
  return items.map((item, index) => ({
    id: item.durableItemId,
    title: item.title,
    description: item.description,
    customer_description: item.customerDescription,
    internal_notes: item.internalNotes,
    line_type: item.lineType,
    quantity: item.quantity,
    unit: item.unit,
    unit_price_cents: item.unitPriceCents,
    labor_hours: item.laborHours,
    room_id: item.roomId,
    room_label: item.roomLabel,
    location_label: item.locationLabel,
    sort_order: index,
  }));
}

export function reconcileRemovedDurableItemIds(
  previousItems: readonly DurableDraftCanonicalItem[],
  currentItems: readonly DurableDraftCanonicalItem[],
): string[] {
  const retained = new Set(currentItems.flatMap(item => item.durableItemId ? [item.durableItemId] : []));
  return [...new Set(previousItems.flatMap(item =>
    item.durableItemId && !retained.has(item.durableItemId) ? [item.durableItemId] : []
  ))].sort();
}

export function reconcileCanonicalSaveResponse(
  previous: Pick<DurableDraftCanonicalState, 'items'>,
  response: ContractorWorkDraftEnvelope,
): DurableDraftCanonicalState {
  const persistedRowsById = new Map(
    previous.items.flatMap(item => item.durableItemId ? [[item.durableItemId, item] as const] : []),
  );
  const unsavedRows = previous.items.filter(item => !item.durableItemId);
  let unsavedIndex = 0;

  const items = durableDraftItemsFromRpc(response.items).map(serverItem => {
    const previousItem = serverItem.durableItemId
      ? persistedRowsById.get(serverItem.durableItemId)
      : undefined;
    const matchedItem = previousItem ?? unsavedRows[unsavedIndex++];
    return matchedItem ? { ...serverItem, rowId: matchedItem.rowId } : serverItem;
  });

  return {
    draft: durableDraftFromRpc(response.draft),
    items,
    launches: [...response.launches],
  };
}

export function durableDraftListRowsToPresentation(
  rows: readonly ContractorWorkDraftListRow[],
): DurableDraftListPresentation[] {
  return [...rows]
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id))
    .map(row => {
      const estimate = row.launched_output_type === 'estimate';
      const liveOutputId = estimate ? row.launched_estimate_id : row.launched_job_id;
      const outputIdSnapshot = estimate
        ? row.launched_estimate_id_snapshot
        : row.launched_job_id_snapshot;
      return {
        draftId: row.id,
        contractorId: row.contractor_id,
        status: row.status,
        intendedOutput: row.intended_output,
        title: row.title,
        subjectType: row.subject_type,
        subjectLabel: row.subject_display_name_snapshot,
        propertyLabel: row.property_display_snapshot,
        legacyInspectionId: row.legacy_inspection_id,
        launchedOutputType: row.launched_output_type,
        liveOutputId: row.launched_output_type ? liveOutputId : null,
        outputIdSnapshot: row.launched_output_type ? outputIdSnapshot : null,
        outputAvailable: Boolean(row.launched_output_type && liveOutputId),
        launchedAt: row.launched_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });
}

export function legacyImportResultToResumeRequest(
  result: ContractorWorkDraftLegacyImportResponse,
): DurableDraftResumeRequest {
  return { draftId: result.draft_id };
}
