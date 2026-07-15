import type { EstimateLaborMode, EstimateLineSupplyStatus, EstimateLineType, JobWorkItemWorkState } from '../../types';

export type WorkComposerLineDraft = {
  id: string;
  job_work_item_id?: string | null;
  line_type: EstimateLineType;
  description: string;
  line_title: string;
  customer_description: string;
  model_spec: string;
  supply_status: EstimateLineSupplyStatus | '';
  quantity: string;
  unit: string;
  unit_price: string;
  labor_hours: string;
  work_state?: JobWorkItemWorkState;
  room_id?: string | null;
  room_label?: string;
  location_label?: string;
  internal_notes?: string;
  builderGenerated?: boolean;
  editor_source_note?: string;
};

export type WorkComposerDraft = {
  title: string;
  scope: string;
  notes: string;
  labor_mode: EstimateLaborMode;
  labor_rate: string;
  job_labor_hours: string;
  line_items: WorkComposerLineDraft[];
};

export type WorkComposerLineGroupKey = 'labor' | 'materials_other' | 'fees';

export type GroupedWorkComposerDraftLine = {
  line: WorkComposerLineDraft;
  index: number;
};

export type WorkComposerLineVisualGroup = {
  key: WorkComposerLineGroupKey;
  label: string;
  lines: GroupedWorkComposerDraftLine[];
};

export type WorkComposerFinancialBreakdown = {
  materialTotalCents: number;
  laborLineTotalCents: number;
  schemaLaborTotalCents: number;
  laborTotalCents: number;
  feeTotalCents: number;
  otherTotalCents: number;
  subtotalCents: number;
  laborHours: number;
  missingLaborRate: boolean;
};
