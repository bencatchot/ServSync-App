import type { FocusEventHandler, KeyboardEventHandler } from 'react';
import { ChevronDown, ChevronUp, Copy, Trash2 } from 'lucide-react';
import type { EstimateLaborMode } from '../../types';
import { formatMoney } from '../../utils/format';
import type { WorkComposerLineDraft } from './types';
import {
  normalizeWorkComposerLineSupplyStatus,
  WORK_COMPOSER_LINE_SUPPLY_STATUS_LABELS,
  WORK_COMPOSER_LINE_TYPE_LABELS,
  WORK_COMPOSER_LINE_TYPE_OPTIONS,
  workComposerLineCanTrackLaborHours,
  workComposerLineIsUnpriced,
  workComposerLineTotalCents,
} from './workComposerDrafts';

type WritingAssistInputProps = {
  spellCheck?: boolean;
  autoCapitalize?: string;
  autoCorrect?: string;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onKeyUp?: KeyboardEventHandler<HTMLInputElement>;
};

type WorkComposerLineItemRowProps = {
  line: WorkComposerLineDraft;
  index: number;
  itemLabel: 'estimate' | 'invoice' | 'draft job';
  laborMode?: EstimateLaborMode;
  compactAdvanced?: boolean;
  advancedDetailsOpen?: boolean;
  onAdvancedDetailsOpenChange?: (open: boolean) => void;
  onChange: (updates: Partial<WorkComposerLineDraft>) => void;
  onRemove: () => void;
  onDuplicate?: () => void;
  writingAssistProps?: WritingAssistInputProps;
};

const INPUT_CLASS = 'w-full rounded-xl border border-[#E1E3E7] bg-white px-3 py-2 text-base text-[#02132D] placeholder:text-slate-400 outline-none transition focus:border-[#0078FF] focus:ring-2 focus:ring-[#0078FF]/15 md:text-sm';

function WorkComposerField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#223D67]/75">{label}</span>
      {children}
    </label>
  );
}

function workComposerLineTotalLabel(line: WorkComposerLineDraft) {
  return workComposerLineIsUnpriced(line) ? 'Price Required' : formatMoney(workComposerLineTotalCents(line));
}

export function WorkComposerLineItemRow({
  line,
  index,
  itemLabel,
  laborMode,
  compactAdvanced = false,
  advancedDetailsOpen = !compactAdvanced,
  onAdvancedDetailsOpenChange,
  onChange,
  onRemove,
  onDuplicate,
  writingAssistProps,
}: WorkComposerLineItemRowProps) {
  const supportsCatalogDetails = itemLabel !== 'draft job';
  const showModelSpec = supportsCatalogDetails && (line.line_type === 'material' || Boolean(line.model_spec.trim()));
  const showSupplyStatus = supportsCatalogDetails && Boolean(line.supply_status);
  const sourceNote = line.editor_source_note?.trim();
  const hasSecondaryRow = showModelSpec || showSupplyStatus;
  const showLaborHours = laborMode === 'line_specific' && workComposerLineCanTrackLaborHours(line);
  const priceColumnClass = showLaborHours ? 'lg:grid-cols-[8rem_1fr_5rem_5rem_7rem_6rem_6rem_auto]' : 'lg:grid-cols-[8rem_1fr_5rem_5rem_7rem_6rem_auto]';
  const inputPrefix = itemLabel === 'invoice' ? 'Invoice' : itemLabel === 'draft job' ? 'Draft job' : 'Estimate';
  const moreDetailsLabel = itemLabel;
  const setAdvancedDetailsOpen = (open: boolean) => {
    onAdvancedDetailsOpenChange?.(open);
  };
  const descriptionField = (
    <WorkComposerField label="Description">
      <div className="space-y-2">
        <input
          aria-label={`${inputPrefix} line item ${index + 1} description`}
          data-estimate-line-description-id={line.id}
          className={INPUT_CLASS}
          {...writingAssistProps}
          value={line.line_title}
          onChange={event => onChange({ line_title: event.target.value, description: event.target.value })}
          placeholder="Labor, material, trip fee..."
        />
        {!compactAdvanced && sourceNote ? (
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">
            {sourceNote}
          </p>
        ) : null}
      </div>
    </WorkComposerField>
  );
  const quantityField = (
    <WorkComposerField label="Qty">
      <input
        aria-label={`${inputPrefix} line item ${index + 1} quantity`}
        className={INPUT_CLASS}
        type="number"
        min="0"
        step="0.01"
        value={line.quantity}
        onChange={event => onChange({ quantity: event.target.value })}
      />
    </WorkComposerField>
  );
  const unitField = (
    <WorkComposerField label="Unit">
      <input
        className={INPUT_CLASS}
        value={line.unit}
        onChange={event => onChange({ unit: event.target.value })}
      />
    </WorkComposerField>
  );
  const unitPriceField = (
    <WorkComposerField label="Unit price">
      <input
        aria-label={`${inputPrefix} line item ${index + 1} unit price`}
        className={INPUT_CLASS}
        value={line.unit_price}
        onChange={event => onChange({ unit_price: event.target.value })}
        placeholder="$0.00"
      />
    </WorkComposerField>
  );
  const totalBlock = (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Total</p>
      <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-950">
        {workComposerLineTotalLabel(line)}
      </p>
    </div>
  );
  const removeButton = (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:text-red-600"
      aria-label={`Remove ${itemLabel} line ${index + 1}`}
    >
      <Trash2 size={15} />
    </button>
  );
  const duplicateButton = itemLabel === 'estimate' && onDuplicate ? (
    <button
      type="button"
      onClick={onDuplicate}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-blue-200 bg-white text-blue-600 hover:border-blue-300 hover:bg-blue-50"
      aria-label={`Duplicate estimate line item ${index + 1}`}
    >
      <Copy size={15} />
    </button>
  ) : null;
  const actionButtons = (
    <div className="flex items-center gap-2">
      {duplicateButton}
      {removeButton}
    </div>
  );
  const lineTypeField = (
    <WorkComposerField label="Type">
      <select
        className={INPUT_CLASS}
        value={line.line_type}
        onChange={event => onChange({ line_type: event.target.value as WorkComposerLineDraft['line_type'] })}
      >
        {WORK_COMPOSER_LINE_TYPE_OPTIONS.map(type => (
          <option key={type} value={type}>{WORK_COMPOSER_LINE_TYPE_LABELS[type]}</option>
        ))}
      </select>
    </WorkComposerField>
  );
  const laborHoursField = showLaborHours ? (
    <WorkComposerField label="Labor hrs">
      <input
        aria-label={`${inputPrefix} line item ${index + 1} labor hours`}
        className={INPUT_CLASS}
        type="number"
        min="0"
        step="0.25"
        value={line.labor_hours}
        onChange={event => onChange({ labor_hours: event.target.value })}
        placeholder="0"
      />
    </WorkComposerField>
  ) : null;
  const modelSpecField = (
    <WorkComposerField label="Model/spec">
      <input
        aria-label={`${inputPrefix} line item ${index + 1} model or specification`}
        className={INPUT_CLASS}
        value={line.model_spec}
        onChange={event => onChange({ model_spec: event.target.value })}
        placeholder="Optional model, size, brand, or spec"
      />
    </WorkComposerField>
  );
  const supplyStatusField = (
    <WorkComposerField label="Supply status">
      <select
        className={INPUT_CLASS}
        value={line.supply_status}
        onChange={event => onChange({ supply_status: normalizeWorkComposerLineSupplyStatus(event.target.value) })}
      >
        <option value="">Not specified</option>
        {Object.entries(WORK_COMPOSER_LINE_SUPPLY_STATUS_LABELS).map(([value, label]) => (
          <option key={value} value={value}>{label}</option>
        ))}
      </select>
    </WorkComposerField>
  );
  const roomField = itemLabel === 'draft job' ? (
    <WorkComposerField label="Room">
      <input
        aria-label={`${inputPrefix} line item ${index + 1} room`}
        className={INPUT_CLASS}
        value={line.room_label ?? ''}
        onChange={event => onChange({ room_label: event.target.value })}
        placeholder="Kitchen, hallway, exterior..."
      />
    </WorkComposerField>
  ) : null;
  const locationField = itemLabel === 'draft job' ? (
    <WorkComposerField label="Location">
      <input
        aria-label={`${inputPrefix} line item ${index + 1} location`}
        className={INPUT_CLASS}
        value={line.location_label ?? ''}
        onChange={event => onChange({ location_label: event.target.value })}
        placeholder="Optional detail"
      />
    </WorkComposerField>
  ) : null;
  const internalNotesField = itemLabel === 'draft job' ? (
    <div className="lg:col-span-2">
      <WorkComposerField label="Internal notes">
        <input
          aria-label={`${inputPrefix} line item ${index + 1} internal notes`}
          className={INPUT_CLASS}
          value={line.internal_notes ?? ''}
          onChange={event => onChange({ internal_notes: event.target.value })}
          placeholder="Private notes for your team"
        />
      </WorkComposerField>
    </div>
  ) : null;

  if (compactAdvanced) {
    return (
      <div key={line.id} className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_5rem_5rem_7rem_6rem_auto] lg:items-end">
          {descriptionField}
          {quantityField}
          {unitField}
          {unitPriceField}
          {totalBlock}
          {actionButtons}
        </div>
        <div className="mt-3 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setAdvancedDetailsOpen(!advancedDetailsOpen)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-blue-200 hover:bg-blue-50"
            aria-expanded={advancedDetailsOpen}
            aria-label={`${advancedDetailsOpen ? 'Hide' : 'Show'} ${moreDetailsLabel} line item ${index + 1} more details`}
          >
            {advancedDetailsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            More details
          </button>
          {advancedDetailsOpen && (
            <div className="mt-3 grid gap-3 lg:grid-cols-4">
              {lineTypeField}
              {laborHoursField}
              {modelSpecField}
              {supplyStatusField}
              {roomField}
              {locationField}
              {internalNotesField}
              {sourceNote ? (
                <div className="lg:col-span-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Source note</p>
                  <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-medium text-blue-800">
                    {sourceNote}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div key={line.id} className="rounded-xl border border-slate-200 bg-white p-3">
      <div className={`grid gap-3 ${priceColumnClass} lg:items-end`}>
        {lineTypeField}
        {descriptionField}
        {quantityField}
        {unitField}
        {unitPriceField}
        {totalBlock}
        {laborHoursField}
        {actionButtons}
      </div>
      {hasSecondaryRow || itemLabel === 'draft job' ? (
        <div className={`mt-3 grid gap-3 border-t border-slate-100 pt-3 ${itemLabel === 'draft job' ? 'lg:grid-cols-4' : 'lg:grid-cols-[minmax(0,1fr)_14rem]'}`}>
          {itemLabel === 'draft job' ? (
            <>
              {showModelSpec ? modelSpecField : null}
              {showSupplyStatus ? supplyStatusField : null}
              {roomField}
              {locationField}
              {internalNotesField}
            </>
          ) : (
            <>
              <div className="space-y-2">
                {showModelSpec ? modelSpecField : null}
              </div>
              {showSupplyStatus ? supplyStatusField : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
