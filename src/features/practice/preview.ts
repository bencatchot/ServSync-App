import type { Estimate } from "../../types";
import { workComposerDraftFinancialBreakdown } from "../work-composer/workComposerDrafts";
import { validatePracticePreview } from "./contracts";

export function practiceEstimate(input: unknown, now = new Date()): Estimate {
  const { draft, totalCents } = validatePracticePreview(input);
  const totals = workComposerDraftFinancialBreakdown(draft);
  return {
    id: "practice-preview-only",
    contractor_id: "",
    homeowner_user_id: null,
    local_contact_id: null,
    service_request_id: null,
    inspection_id: null,
    title: draft.title,
    scope: draft.scope,
    notes: "",
    terms: "",
    status: "draft",
    subtotal_cents: totalCents,
    total_cents: totalCents,
    tax_cents: 0,
    tax_rate_percent: 0,
    labor_mode: draft.labor_mode,
    labor_rate_cents: Math.round(Number(draft.labor_rate || 0) * 100),
    job_labor_hours: Number(draft.job_labor_hours || 0),
    material_total_cents: totals.materialTotalCents,
    labor_total_cents: totals.laborTotalCents,
    fee_total_cents: totals.feeTotalCents,
    other_total_cents: totals.otherTotalCents,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    line_items: draft.line_items.map((line, i) => ({
      id: line.id,
      estimate_id: "practice-preview-only",
      line_type: line.line_type,
      description: line.line_title,
      line_title: line.line_title,
      customer_description: line.customer_description,
      quantity: Number(line.quantity),
      unit: line.unit,
      unit_price_cents: Math.round(Number(line.unit_price) * 100),
      labor_hours: line.labor_hours ? Number(line.labor_hours) : null,
      sort_order: i,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    })),
  };
}
