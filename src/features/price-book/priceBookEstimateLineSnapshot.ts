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

export function priceBookItemToEstimateLineDraft(
  item: ContractorPriceBookItem,
): WorkComposerLineDraft {
  return createWorkComposerLineDraft({
    line_type: normalizeWorkComposerLineType(item.line_type),
    description: item.title,
    line_title: item.title,
    customer_description: item.customer_description || '',
    quantity: '1',
    unit: item.unit || 'each',
    unit_price: centsToPriceInput(item.default_unit_price_cents),
    labor_hours: laborHoursToInput(item.labor_hours),
    editor_source_note: `Added from Price Book: ${item.title}. Review quantity, price, and scope before sending.`,
  });
}
