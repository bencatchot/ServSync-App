import type {
  EstimateLineType,
  Inspection,
  JobWorkItem,
  JobWorkItemWorkState,
} from '../../types';
import type { WorkComposerDraft } from '../work-composer/types';
import {
  createWorkComposerLineDraft,
  normalizeWorkComposerLineType,
  workComposerDraftFinancialBreakdown,
} from '../work-composer/workComposerDrafts';

export type DraftJobSubjectType = 'connected' | 'local';

export type DraftJobComposerDraft = WorkComposerDraft & {
  subject_type: DraftJobSubjectType;
  homeowner_user_id: string;
  home_id: string;
  local_contact_id: string;
  local_home_id: string;
  service_request_id: string;
};

export type DraftJobMetadataPayload = {
  p_homeowner_user_id: string | null;
  p_home_id: string | null;
  p_local_contact_id: string | null;
  p_local_home_id: string | null;
  p_service_request_id: string | null;
  p_name: string;
  p_summary: string;
};

export type DraftJobScopePayloadItem = {
  id?: string;
  remove?: boolean;
  source_type?: 'draft_job_scope';
  source_key?: string;
  title?: string;
  description?: string;
  customer_description?: string;
  internal_notes?: string;
  line_type?: EstimateLineType;
  quantity?: number;
  unit?: string;
  unit_price_cents?: number | null;
  labor_hours?: number | null;
  billable?: boolean;
  completion_status?: 'open';
  work_state?: JobWorkItemWorkState;
  approval_required?: false;
  approval_status?: 'not_required';
  room_id?: string | null;
  room_label?: string | null;
  location_label?: string | null;
  sort_order?: number;
};

export type DraftJobScopeUpsertResult = {
  inspection_id?: string;
  updated_item_ids?: string[];
  removed_item_ids?: string[];
};

export function isComposerDraftJob(inspection: Pick<Inspection, 'job_origin' | 'status' | 'job_status'> | null | undefined) {
  return inspection?.job_origin === 'draft_composer'
    && inspection.status === 'draft'
    && inspection.job_status === 'draft';
}

export function createBlankDraftJobComposerDraft(overrides: Partial<DraftJobComposerDraft> = {}): DraftJobComposerDraft {
  return {
    subject_type: 'connected',
    homeowner_user_id: '',
    home_id: '',
    local_contact_id: '',
    local_home_id: '',
    service_request_id: '',
    title: '',
    scope: '',
    notes: '',
    labor_mode: 'line_specific',
    labor_rate: '',
    job_labor_hours: '',
    line_items: [],
    ...overrides,
  };
}

function centsToMoneyInput(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return '';
  return (cents / 100).toFixed(2);
}

function moneyInputToCents(value: string) {
  const trimmed = value.replace(/[$,]/g, '').trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return Math.round(numeric * 100);
}

function numericInput(value: string, fallback = 0) {
  const trimmed = value.replace(/,/g, '').trim();
  if (!trimmed) return fallback;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function nullableNumericInput(value: string) {
  const trimmed = value.replace(/,/g, '').trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

export function draftJobComposerDraftFromRecords(
  inspection: Inspection,
  workItems: JobWorkItem[] = [],
): DraftJobComposerDraft {
  const sortedItems = [...workItems].sort((a, b) =>
    a.sort_order - b.sort_order || new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  return createBlankDraftJobComposerDraft({
    subject_type: inspection.local_contact_id ? 'local' : 'connected',
    homeowner_user_id: inspection.homeowner_user_id ?? '',
    home_id: inspection.home_id ?? '',
    local_contact_id: inspection.local_contact_id ?? '',
    local_home_id: inspection.local_home_id ?? '',
    service_request_id: inspection.service_request_id ?? '',
    title: inspection.name ?? '',
    scope: inspection.summary ?? '',
    notes: '',
    line_items: sortedItems
      .filter(item => item.completion_status !== 'removed' && item.work_state !== 'removed')
      .map(item => createWorkComposerLineDraft({
        id: item.id,
        job_work_item_id: item.id,
        line_type: normalizeWorkComposerLineType(item.line_type),
        description: item.description || item.title || '',
        line_title: item.title || item.description || '',
        customer_description: item.customer_description || '',
        quantity: String(item.quantity ?? 1),
        unit: item.unit || 'each',
        unit_price: centsToMoneyInput(item.unit_price_cents),
        labor_hours: item.labor_hours === null || item.labor_hours === undefined ? '' : String(item.labor_hours),
        work_state: item.work_state || 'open',
        room_id: item.room_id ?? null,
        room_label: item.room_label ?? '',
        location_label: item.location_label ?? '',
        internal_notes: item.internal_notes ?? '',
      })),
  });
}

export function draftJobMetadataPayload(draft: DraftJobComposerDraft): DraftJobMetadataPayload {
  const connected = draft.subject_type === 'connected';
  return {
    p_homeowner_user_id: connected ? draft.homeowner_user_id || null : null,
    p_home_id: connected ? draft.home_id || null : null,
    p_local_contact_id: connected ? null : draft.local_contact_id || null,
    p_local_home_id: connected ? null : draft.local_home_id || null,
    p_service_request_id: connected ? draft.service_request_id || null : null,
    p_name: draft.title.trim(),
    p_summary: draft.scope.trim(),
  };
}

export function draftJobScopePayload(
  draft: DraftJobComposerDraft,
  removedItemIds: string[] = [],
): DraftJobScopePayloadItem[] {
  const activeItems = draft.line_items.map((line, index): DraftJobScopePayloadItem => ({
    ...(line.job_work_item_id ? { id: line.job_work_item_id } : {}),
    source_type: 'draft_job_scope',
    source_key: line.job_work_item_id ? `draft-job-scope:${line.job_work_item_id}` : `draft-job-scope-client:${line.id}`,
    title: (line.line_title || line.description || 'Untitled work item').trim(),
    description: (line.description || line.line_title || '').trim(),
    customer_description: line.customer_description.trim(),
    internal_notes: (line.internal_notes ?? '').trim(),
    line_type: normalizeWorkComposerLineType(line.line_type),
    quantity: numericInput(line.quantity, 1),
    unit: line.unit.trim() || 'each',
    unit_price_cents: moneyInputToCents(line.unit_price),
    labor_hours: nullableNumericInput(line.labor_hours),
    billable: true,
    completion_status: 'open',
    work_state: line.work_state ?? 'open',
    approval_required: false,
    approval_status: 'not_required',
    room_id: line.room_id || null,
    room_label: (line.room_label ?? '').trim() || null,
    location_label: (line.location_label ?? '').trim() || null,
    sort_order: index,
  }));
  const removedItems = removedItemIds.map(id => ({ id, remove: true }));
  return [...activeItems, ...removedItems];
}

export function applyDraftJobScopeResult(
  draft: DraftJobComposerDraft,
  result: DraftJobScopeUpsertResult | null | undefined,
): DraftJobComposerDraft {
  const changedIds = Array.isArray(result?.updated_item_ids) ? result.updated_item_ids : [];
  if (changedIds.length === 0) return draft;
  let changedIndex = 0;
  return {
    ...draft,
    line_items: draft.line_items.map(line => {
      const nextId = changedIds[changedIndex++];
      if (!nextId) return line;
      return {
        ...line,
        id: nextId,
        job_work_item_id: nextId,
      };
    }),
  };
}

export function validateDraftJobComposerDraft(draft: DraftJobComposerDraft): string {
  if (!draft.title.trim()) return 'Enter a Draft Job title before saving.';
  if (draft.subject_type === 'connected' && !draft.homeowner_user_id) return 'Choose a homeowner before saving this Draft Job.';
  if (draft.subject_type === 'local' && !draft.local_contact_id) return 'Choose a local customer before saving this Draft Job.';
  const invalidLine = draft.line_items.find(line => {
    const quantity = numericInput(line.quantity, Number.NaN);
    const unitPrice = moneyInputToCents(line.unit_price);
    const laborHours = nullableNumericInput(line.labor_hours);
    return !line.line_title.trim()
      || !Number.isFinite(quantity)
      || quantity < 0
      || (line.unit_price.trim() !== '' && unitPrice === null)
      || (line.labor_hours.trim() !== '' && laborHours === null);
  });
  if (invalidLine) return 'Review scope line descriptions, quantities, prices, and labor hours before saving.';
  return '';
}

export function draftJobTotalsRows(draft: DraftJobComposerDraft) {
  const totals = workComposerDraftFinancialBreakdown(draft);
  return [
    { label: 'Materials / Other', amount: totals.materialTotalCents + totals.otherTotalCents },
    { label: 'Labor', amount: totals.laborTotalCents },
    { label: 'Fees', amount: totals.feeTotalCents },
    { label: 'Total', amount: totals.subtotalCents, bold: true },
  ];
}

export function draftJobUserFacingError(error: unknown, fallback = 'This draft could not be saved. Try again.') {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const normalized = message.toLowerCase();
  if (normalized.includes('uuid') || normalized.includes('invalid input syntax')) {
    return 'This draft could not be saved because some information is invalid. Refresh and try again.';
  }
  if (normalized.includes('permission')) return 'You do not have permission to save this Draft Job.';
  if (normalized.includes('not found')) return 'This Draft Job is no longer available. Refresh and try again.';
  if (normalized.includes('homeowner') || normalized.includes('local customer') || normalized.includes('property')) return message;
  if (normalized.includes('scope') || normalized.includes('quantity') || normalized.includes('price') || normalized.includes('labor')) return message;
  return fallback;
}
