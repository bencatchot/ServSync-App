import type { Estimate } from '../../types';
import type { SharedDraftComposerDraft } from '../drafts/draftComposerTypes';
import { validateSharedDraftComposerDraftForSave } from '../drafts/draftComposerMappings';
import { workComposerDraftFinancialBreakdown, workComposerPriceInputIsBlank } from '../work-composer/workComposerDrafts';

export function estimatePreviewError(draft: SharedDraftComposerDraft) {
  const error = validateSharedDraftComposerDraftForSave({ ...draft, subject_type: 'local', local_contact_id: 'preview-only' });
  if (error) return error;
  for (const value of [draft.labor_rate, draft.job_labor_hours]) {
    if (value.trim() && (!Number.isFinite(Number(value.replace(/[$,]/g, '').trim())) || Number(value.replace(/[$,]/g, '').trim()) < 0)) return 'Review labor hours and rate before previewing.';
  }
  if (!draft.scope.trim()) return 'Describe the scope your customer will review.';
  if (!draft.line_items.length) return 'Add at least one priced line item.';
  if (draft.line_items.some(line => workComposerPriceInputIsBlank(line.unit_price))) return 'Price every line before previewing the total. Use 0 for an included item.';
  if (workComposerDraftFinancialBreakdown(draft).missingLaborRate) return 'Add a labor rate before previewing the total.';
  return '';
}

// Presentation only. Never pass this synthetic record to a persistence API.
export function draftEstimatePreview(draft: SharedDraftComposerDraft): Estimate {
  const totals = workComposerDraftFinancialBreakdown(draft);
  const cents = (value: string) => Math.round(Number(value.replace(/[$,]/g, '').trim()) * 100);
  return {
    id: 'preview-only', contractor_id: '', homeowner_user_id: null, local_contact_id: null,
    service_request_id: null, inspection_id: null, title: draft.title, scope: draft.scope,
    notes: '', terms: '', status: 'draft', created_at: '', updated_at: '',
    subtotal_cents: totals.subtotalCents, total_cents: totals.subtotalCents,
    material_total_cents: totals.materialTotalCents, labor_total_cents: totals.laborTotalCents,
    fee_total_cents: totals.feeTotalCents, other_total_cents: totals.otherTotalCents,
    labor_mode: draft.labor_mode, labor_rate_cents: cents(draft.labor_rate || '0'),
    job_labor_hours: Number(draft.job_labor_hours || '0'), tax_cents: 0, tax_rate_percent: 0,
    line_items: draft.line_items.map((line, index) => ({
      id: `preview-${index}`, estimate_id: 'preview-only', line_type: line.line_type,
      description: line.line_title || line.description, line_title: line.line_title,
      customer_description: line.customer_description, model_spec: line.model_spec,
      supply_status: line.supply_status || null, quantity: Number(line.quantity), unit: line.unit,
      unit_price_cents: cents(line.unit_price), labor_hours: line.labor_hours ? Number(line.labor_hours) : null,
      sort_order: index, created_at: '', updated_at: '',
    })),
  };
}
