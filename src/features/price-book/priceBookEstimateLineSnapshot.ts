import type { ContractorPriceBookItem } from '../../types';
import { createWorkComposerLineDraft, normalizeWorkComposerLineType } from '../work-composer/workComposerDrafts';
import type { WorkComposerLineDraft } from '../work-composer/types';

function centsToPriceInput(value: number | null | undefined) {
  if (value === null || value === undefined) return '';
  if (value === 0) return '0.00';
  return (value / 100).toFixed(2);
}

function laborHoursToInput(value: number | null | undefined) {
  return value === null || value === undefined ? '' : String(Number(value));
}

export function priceBookItemToDraftLineSnapshot(
  item: ContractorPriceBookItem,
  quantity = '1',
): WorkComposerLineDraft {
  return createWorkComposerLineDraft({
    line_type: normalizeWorkComposerLineType(item.line_type),
    description: item.title,
    line_title: item.title,
    customer_description: item.customer_description || '',
    quantity,
    unit: item.unit || 'each',
    unit_price: centsToPriceInput(item.default_unit_price_cents),
    labor_hours: laborHoursToInput(item.labor_hours),
    editor_source_note: `Added from Price Book: ${item.title}. Review quantity, price, and scope before sending.`,
  });
}

export const priceBookItemToEstimateLineDraft = priceBookItemToDraftLineSnapshot;

export function priceBookStagedQuantityError(value: string) {
  const normalized = value.trim();
  if (!normalized) return 'Enter a quantity greater than zero.';
  const quantity = Number(normalized);
  if (!Number.isFinite(quantity) || quantity <= 0) return 'Enter a quantity greater than zero.';
  return '';
}
