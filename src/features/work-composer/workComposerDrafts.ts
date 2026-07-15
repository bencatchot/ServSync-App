import type { EstimateLineSupplyStatus, EstimateLineType, LegacyEstimateLineType } from '../../types';
import type {
  WorkComposerDraft,
  WorkComposerFinancialBreakdown,
  WorkComposerLineDraft,
  WorkComposerLineGroupKey,
  WorkComposerLineVisualGroup,
} from './types';

export const WORK_COMPOSER_LINE_TYPE_OPTIONS: EstimateLineType[] = ['labor', 'material', 'fee', 'other'];

export const WORK_COMPOSER_LINE_TYPE_LABELS: Record<EstimateLineType, string> = {
  labor: 'Labor',
  material: 'Material',
  fee: 'Fee',
  other: 'Other',
};

export const WORK_COMPOSER_LINE_VISUAL_GROUPS: Array<{ key: WorkComposerLineGroupKey; label: string }> = [
  { key: 'labor', label: 'Labor' },
  { key: 'materials_other', label: 'Materials / Other' },
  { key: 'fees', label: 'Fees' },
];

export const WORK_COMPOSER_LINE_SUPPLY_STATUS_LABELS: Record<EstimateLineSupplyStatus, string> = {
  contractor_supplied: 'Contractor supplied',
  customer_supplied: 'Customer supplied',
  to_be_confirmed: 'Supply status to be confirmed',
};

export function normalizeWorkComposerLineType(lineType: LegacyEstimateLineType | string | null | undefined): EstimateLineType {
  if (lineType === 'labor' || lineType === 'material' || lineType === 'fee' || lineType === 'other') return lineType;
  if (lineType === 'equipment') return 'material';
  return 'other';
}

export function normalizeWorkComposerLineSupplyStatus(value: string | null | undefined): EstimateLineSupplyStatus | '' {
  if (value === 'contractor_supplied' || value === 'customer_supplied' || value === 'to_be_confirmed') return value;
  return '';
}

function dollarsToCents(value: string) {
  const numeric = Number(value.replace(/[$,]/g, '').trim());
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.round(numeric * 100);
}

export function workComposerPriceInputIsBlank(value: string) {
  return value.replace(/[$,]/g, '').trim() === '';
}

export function workComposerLineIsUnpriced(line: Pick<WorkComposerLineDraft, 'unit_price'>) {
  return workComposerPriceInputIsBlank(line.unit_price);
}

export function parseWorkComposerLaborHours(value: string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const cleaned = typeof value === 'number' ? value : String(value).replace(/,/g, '').trim();
  if (cleaned === '') return null;
  const numeric = typeof cleaned === 'number' ? cleaned : Number(cleaned);
  if (!Number.isFinite(numeric) || numeric < 0) return null;
  return numeric;
}

export function workComposerLineCanTrackLaborHours(line: Pick<WorkComposerLineDraft, 'line_type'>) {
  const type = normalizeWorkComposerLineType(line.line_type);
  return type === 'material' || type === 'other';
}

export function workComposerLineTotalCents(line: WorkComposerLineDraft) {
  if (workComposerLineIsUnpriced(line)) return 0;
  const quantity = Number(line.quantity);
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  return Math.round(safeQuantity * dollarsToCents(line.unit_price));
}

export function workComposerTotalCents(lines: WorkComposerLineDraft[] = []) {
  return lines.reduce((sum, line) => sum + workComposerLineTotalCents(line), 0);
}

export function workComposerLineBucket(lineType: LegacyEstimateLineType | EstimateLineType | string | null | undefined) {
  const type = normalizeWorkComposerLineType(lineType);
  if (type === 'fee') return 'fee';
  if (type === 'labor') return 'labor';
  if (type === 'material' || type === 'other') return 'material';
  return 'other';
}

export function workComposerLineBucketTotal(lines: WorkComposerLineDraft[], bucket: 'material' | 'labor' | 'fee') {
  return lines.reduce((sum, line) => workComposerLineBucket(line.line_type) === bucket ? sum + workComposerLineTotalCents(line) : sum, 0);
}

export function workComposerOtherLineTotal(lines: WorkComposerLineDraft[]) {
  const lineSubtotal = workComposerTotalCents(lines);
  return Math.max(0, lineSubtotal - workComposerLineBucketTotal(lines, 'material') - workComposerLineBucketTotal(lines, 'labor') - workComposerLineBucketTotal(lines, 'fee'));
}

export function workComposerLineVisualGroup(line: Pick<WorkComposerLineDraft, 'line_type'>): WorkComposerLineGroupKey {
  const type = normalizeWorkComposerLineType(line.line_type);
  if (type === 'labor') return 'labor';
  if (type === 'fee') return 'fees';
  return 'materials_other';
}

export function groupWorkComposerDraftLines(lines: WorkComposerLineDraft[]): WorkComposerLineVisualGroup[] {
  const groupedLines: Record<WorkComposerLineGroupKey, Array<{ line: WorkComposerLineDraft; index: number }>> = {
    labor: [],
    materials_other: [],
    fees: [],
  };
  lines.forEach((line, index) => {
    groupedLines[workComposerLineVisualGroup(line)].push({ line, index });
  });
  return WORK_COMPOSER_LINE_VISUAL_GROUPS
    .map(group => ({ ...group, lines: groupedLines[group.key] }))
    .filter(group => group.lines.length > 0);
}

export function workComposerLineGroupSubtotalCents(lines: WorkComposerLineDraft[]) {
  return lines.reduce((sum, line) => sum + workComposerLineTotalCents(line), 0);
}

export function workComposerLineGroupUnpricedCount(lines: WorkComposerLineDraft[]) {
  return lines.filter(workComposerLineIsUnpriced).length;
}

export function workComposerDraftSchemaLaborHours(draft: Pick<WorkComposerDraft, 'labor_mode' | 'job_labor_hours' | 'line_items'>) {
  if (draft.labor_mode === 'line_specific') {
    return (draft.line_items ?? []).reduce((sum, line) => {
      if (!workComposerLineCanTrackLaborHours(line)) return sum;
      return sum + (parseWorkComposerLaborHours(line.labor_hours) ?? 0);
    }, 0);
  }
  return parseWorkComposerLaborHours(draft.job_labor_hours) ?? 0;
}

export function workComposerDraftHasLaborHoursWithoutRate(draft: Pick<WorkComposerDraft, 'labor_mode' | 'labor_rate' | 'job_labor_hours' | 'line_items'>) {
  return workComposerPriceInputIsBlank(draft.labor_rate) && workComposerDraftSchemaLaborHours(draft) > 0;
}

function workComposerDraftSchemaLaborTotalCents(draft: Pick<WorkComposerDraft, 'labor_mode' | 'labor_rate' | 'job_labor_hours' | 'line_items'>) {
  if (workComposerDraftHasLaborHoursWithoutRate(draft)) return 0;
  return Math.round(workComposerDraftSchemaLaborHours(draft) * dollarsToCents(draft.labor_rate));
}

export function workComposerDraftFinancialBreakdown(draft: Pick<WorkComposerDraft, 'labor_mode' | 'labor_rate' | 'job_labor_hours' | 'line_items'>): WorkComposerFinancialBreakdown {
  const lines = draft.line_items ?? [];
  const materialTotalCents = workComposerLineBucketTotal(lines, 'material');
  const laborLineTotalCents = workComposerLineBucketTotal(lines, 'labor');
  const schemaLaborTotalCents = workComposerDraftSchemaLaborTotalCents(draft);
  const laborTotalCents = laborLineTotalCents + schemaLaborTotalCents;
  const feeTotalCents = workComposerLineBucketTotal(lines, 'fee');
  const otherTotalCents = workComposerOtherLineTotal(lines);
  const subtotalCents = materialTotalCents + laborTotalCents + feeTotalCents + otherTotalCents;
  return {
    materialTotalCents,
    laborLineTotalCents,
    schemaLaborTotalCents,
    laborTotalCents,
    feeTotalCents,
    otherTotalCents,
    subtotalCents,
    laborHours: workComposerDraftSchemaLaborHours(draft),
    missingLaborRate: workComposerDraftHasLaborHoursWithoutRate(draft),
  };
}

export function createWorkComposerLineDraft(overrides: Partial<WorkComposerLineDraft> = {}): WorkComposerLineDraft {
  const draft: WorkComposerLineDraft = {
    id: crypto.randomUUID(),
    line_type: 'labor',
    description: '',
    line_title: '',
    customer_description: '',
    model_spec: '',
    supply_status: '',
    quantity: '1',
    unit: 'each',
    unit_price: '',
    labor_hours: '',
    ...overrides,
  };
  draft.line_type = normalizeWorkComposerLineType(draft.line_type);
  draft.supply_status = normalizeWorkComposerLineSupplyStatus(draft.supply_status);
  return draft;
}

export function duplicateWorkComposerLineDraft(line: WorkComposerLineDraft): WorkComposerLineDraft {
  return createWorkComposerLineDraft({
    line_type: normalizeWorkComposerLineType(line.line_type),
    description: line.description,
    line_title: line.line_title,
    customer_description: line.customer_description,
    model_spec: line.model_spec,
    supply_status: normalizeWorkComposerLineSupplyStatus(line.supply_status),
    quantity: line.quantity,
    unit: line.unit,
    unit_price: line.unit_price,
    labor_hours: line.labor_hours,
    builderGenerated: false,
  });
}

export function workComposerDraftForEstimate(draft: WorkComposerDraft): WorkComposerDraft {
  return draft;
}

export function workComposerDraftForInvoice(draft: WorkComposerDraft): WorkComposerDraft {
  return draft;
}
