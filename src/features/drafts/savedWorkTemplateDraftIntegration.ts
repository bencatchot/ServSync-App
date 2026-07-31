import type { EstimateTemplate, EstimateTemplateLineItem } from '../../types';
import { createWorkComposerLineDraft, normalizeWorkComposerLineType } from '../work-composer/workComposerDrafts';
import type { WorkComposerLineDraft } from '../work-composer/types';
import type { SharedDraftComposerDraft } from './draftComposerTypes';

export type SavedWorkTemplateApplyMode = 'replace' | 'add';

function priceInputFromCents(value: number | null | undefined) {
  return value === null || value === undefined ? '' : (value / 100).toFixed(2);
}

function laborHoursInputFromValue(value: number | null | undefined) {
  return value === null || value === undefined ? '' : String(Number(value));
}

function appendDraftText(existing: string, incoming: string) {
  const current = existing.trim();
  const next = incoming.trim();
  if (!current) return next;
  if (!next) return current;
  return `${current}\n\n${next}`;
}

function templateLineHasContent(line: WorkComposerLineDraft) {
  return Boolean(
    line.description.trim()
    || line.line_title.trim()
    || line.customer_description.trim()
    || line.quantity.trim() !== '1'
    || line.unit.trim() !== 'each'
    || line.unit_price.trim()
    || line.labor_hours.trim()
    || line.room_label?.trim()
    || line.location_label?.trim()
    || line.internal_notes?.trim(),
  );
}

export function draftHasMeaningfulSavedWorkTemplateContent(draft: Pick<SharedDraftComposerDraft, 'scope' | 'notes' | 'line_items'>) {
  return Boolean(
    draft.scope.trim()
    || draft.notes.trim()
    || draft.line_items.some(templateLineHasContent),
  );
}

export function estimateTemplateLineToDraftLine(line: EstimateTemplateLineItem, templateName: string) {
  return createWorkComposerLineDraft({
    line_type: normalizeWorkComposerLineType(line.line_type),
    description: line.description ?? '',
    line_title: line.line_title || line.description || '',
    customer_description: line.customer_description ?? '',
    quantity: String(line.quantity ?? 1),
    unit: line.unit || 'each',
    unit_price: priceInputFromCents(line.unit_price_cents),
    labor_hours: laborHoursInputFromValue(line.labor_hours),
    editor_source_note: `Suggested by saved work template: ${templateName}.`,
  });
}

export function estimateTemplateReusableDraftContent(template: EstimateTemplate) {
  return {
    scope: template.scope ?? '',
    notes: template.notes ?? '',
    line_items: [...(template.line_items ?? [])]
      .sort((left, right) => left.sort_order - right.sort_order)
      .map(line => estimateTemplateLineToDraftLine(line, template.name)),
  };
}

export function applyEstimateTemplateToSharedDraft(
  draft: SharedDraftComposerDraft,
  template: EstimateTemplate,
  mode: SavedWorkTemplateApplyMode,
): SharedDraftComposerDraft {
  const templateContent = estimateTemplateReusableDraftContent(template);
  return {
    ...draft,
    work_format: 'standard',
    checklist_source: null,
    scope: mode === 'replace' ? templateContent.scope : appendDraftText(draft.scope, templateContent.scope),
    notes: mode === 'replace' ? templateContent.notes : appendDraftText(draft.notes, templateContent.notes),
    line_items: mode === 'replace' ? templateContent.line_items : [...draft.line_items, ...templateContent.line_items],
  };
}
