import type { EstimateLineType, JobWorkItem } from '../../types';
import { cleanHumanLabelText, cleanHumanWrittenText } from '../../textCleanup';
import { normalizeWorkComposerLineType } from '../work-composer/workComposerDrafts';

export type ManualJobWorkItemDraft = {
  title: string;
  customer_description: string;
  internal_notes: string;
  line_type: EstimateLineType;
  quantity: string;
  unit: string;
  unit_price: string;
  labor_hours: string;
  billable: boolean;
  completion_status: 'open' | 'completed' | 'removed';
};

export type ManualJobWorkItemRpcPayload = {
  p_title: string;
  p_customer_description: string;
  p_internal_notes: string;
  p_line_type: EstimateLineType;
  p_quantity: number;
  p_unit: string;
  p_unit_price_cents: number | null;
  p_labor_hours: number | null;
  p_billable: boolean;
  p_completion_status: 'open' | 'completed';
};

export type ManualJobWorkItemPayloadResult =
  | { payload: ManualJobWorkItemRpcPayload }
  | { error: string };

export function createBlankManualJobWorkItemDraft(
  overrides: Partial<ManualJobWorkItemDraft> = {},
): ManualJobWorkItemDraft {
  return {
    title: '',
    customer_description: '',
    internal_notes: '',
    line_type: 'other',
    quantity: '1',
    unit: 'each',
    unit_price: '',
    labor_hours: '',
    billable: true,
    completion_status: 'open',
    ...overrides,
  };
}

export function manualJobWorkItemDraftFromRecord(item: JobWorkItem): ManualJobWorkItemDraft {
  return createBlankManualJobWorkItemDraft({
    title: item.title || '',
    customer_description: item.customer_description || item.description || '',
    internal_notes: item.internal_notes || '',
    line_type: normalizeWorkComposerLineType(item.line_type),
    quantity: String(Number(item.quantity || 0)),
    unit: item.unit || 'each',
    unit_price: item.unit_price_cents === null || item.unit_price_cents === undefined
      ? ''
      : (item.unit_price_cents / 100).toFixed(2),
    labor_hours: item.labor_hours === null || item.labor_hours === undefined
      ? ''
      : String(Number(item.labor_hours)),
    billable: item.billable && item.billing_status !== 'not_billable',
    completion_status: item.completion_status === 'completed'
      ? 'completed'
      : item.completion_status === 'removed'
        ? 'removed'
        : 'open',
  });
}

function parseDollarPrice(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return { cents: null as number | null };
  const cleaned = trimmed.replace(/\$/g, '').replace(/,/g, '').trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { cents: null, error: 'Unit price must be blank, 0, or a positive dollar amount.' };
  }
  const amount = Number(cleaned);
  if (!Number.isFinite(amount)) return { cents: null, error: 'Unit price is not a valid number.' };
  if (amount < 0) return { cents: null, error: 'Unit price cannot be negative.' };
  return { cents: Math.round(amount * 100) };
}

function parseNumber(value: string, label: string, options: { required?: boolean } = {}) {
  const trimmed = value.trim();
  if (!trimmed) {
    return options.required
      ? { value: null as number | null, error: `${label} is required.` }
      : { value: null as number | null };
  }
  const cleaned = trimmed.replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return { value: null, error: `${label} must be a positive number or 0.` };
  }
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return { value: null, error: `${label} is not a valid number.` };
  if (parsed < 0) return { value: null, error: `${label} cannot be negative.` };
  return { value: Number(parsed.toFixed(2)) };
}

export function manualJobWorkItemRpcPayload(
  draft: ManualJobWorkItemDraft,
): ManualJobWorkItemPayloadResult {
  const title = cleanHumanLabelText(draft.title);
  if (!title) return { error: 'Enter a work item title.' };

  const quantity = parseNumber(draft.quantity, 'Quantity', { required: true });
  if (quantity.error || quantity.value === null) {
    return { error: quantity.error || 'Quantity is required.' };
  }

  const unitPrice = parseDollarPrice(draft.unit_price);
  if (unitPrice.error) return { error: unitPrice.error };

  const laborHours = parseNumber(draft.labor_hours, 'Labor hours');
  if (laborHours.error) return { error: laborHours.error };

  return {
    payload: {
      p_title: title,
      p_customer_description: cleanHumanWrittenText(draft.customer_description),
      p_internal_notes: cleanHumanWrittenText(draft.internal_notes),
      p_line_type: normalizeWorkComposerLineType(draft.line_type),
      p_quantity: quantity.value,
      p_unit: draft.unit.trim() || 'each',
      p_unit_price_cents: unitPrice.cents,
      p_labor_hours: laborHours.value,
      p_billable: draft.billable,
      p_completion_status: draft.completion_status === 'completed' ? 'completed' : 'open',
    },
  };
}
