import { createBlankSharedDraftComposerDraft } from "../drafts/draftComposerMappings";
import type { SharedDraftComposerDraft } from "../drafts/draftComposerTypes";
import {
  createWorkComposerLineDraft,
  workComposerDraftFinancialBreakdown,
} from "../work-composer/workComposerDrafts";
import type { ContractorPriceBookItem, EstimateTemplate } from "../../types";

export const PRACTICE_LIMITS = Object.freeze({
  cycleDays: 30,
  warningDays: 7,
  urgentDays: 1,
  maxDrafts: 50,
  maxLines: 100,
  maxPrices: 500,
  maxTemplates: 50,
  maxFiles: 10,
  maxFileBytes: 5 * 1024 * 1024,
  maxTotalFileBytes: 20 * 1024 * 1024,
  maxPayloadBytes: 1024 * 1024,
  reviewMinutes: 10,
  maxTransfers: 20,
  receiptDays: 90,
});
export type PracticeSnapshot = {
  business: { name: string; laborRate: string };
  prices: Array<
    Pick<
      ContractorPriceBookItem,
      | "id"
      | "title"
      | "customer_description"
      | "line_type"
      | "unit"
      | "default_unit_price_cents"
      | "labor_hours"
    >
  >;
  templates: Array<
    Pick<EstimateTemplate, "id" | "name" | "scope" | "line_items">
  >;
};
export type PracticeWorkspace = {
  id: string;
  created_at: string;
  expires_at: string;
  snapshot: PracticeSnapshot;
  revision: number;
};
export type PracticeDraft = {
  id: string;
  workspace_id: string;
  revision: number;
  payload: SharedDraftComposerDraft;
};
export type PracticeReview = {
  id: string;
  draft_id: string;
  draft_revision: number;
  package_hash: string;
  expires_at: string;
  status: string;
  total_cents: number;
  payload: SharedDraftComposerDraft | null;
};
export type PracticeReceipt = {
  operation_id: string;
  destination_id: string;
  package_hash: string;
  created_at: string;
  expires_at: string;
};

export function retentionNotice(expiresAt: string, now = Date.now()) {
  const remaining = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(remaining)) throw new Error("Invalid Practice expiry.");
  return remaining <= 0
    ? "expired"
    : remaining <= 86400000
      ? "one_day"
      : remaining <= 7 * 86400000
        ? "seven_days"
        : "active";
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected an object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 2000): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    value.includes("\u0000")
  )
    throw new Error("Invalid or oversized text.");
  return value;
}
function numberInput(value: unknown, { blank = false, positive = false } = {}) {
  const input = text(value, 24).trim();
  if (blank && input === "") return "";
  if (!/^\d+(\.\d{1,4})?$/.test(input))
    throw new Error(
      "Use a non-negative number with at most four decimal places.",
    );
  const n = Number(input);
  if (!Number.isFinite(n) || n > 1000000 || (positive && n <= 0))
    throw new Error("Number is outside the supported range.");
  return input;
}
function lineType(value: unknown): ContractorPriceBookItem["line_type"] {
  if (
    value !== "labor" &&
    value !== "material" &&
    value !== "fee" &&
    value !== "other"
  )
    throw new Error("Unsupported line type.");
  return value;
}

// Reconstruct the allowlist. Never carry customer IDs, private notes, costs or lifecycle state.
export function sanitizePracticeDraft(
  input: unknown,
): SharedDraftComposerDraft {
  const v = record(input);
  if (
    !Array.isArray(v.line_items) ||
    v.line_items.length > PRACTICE_LIMITS.maxLines
  )
    throw new Error("At most 100 work lines are supported.");
  if (!["job_total", "line_specific"].includes(String(v.labor_mode)))
    throw new Error("Unsupported labor mode.");
  const draft = createBlankSharedDraftComposerDraft({
    title: text(v.title, 200),
    scope: text(v.scope, 10000),
    notes: "",
    intended_output: "estimate",
    subject_type: "local",
    local_contact_id: "practice-customer",
    local_home_id: "practice-property",
    labor_mode: v.labor_mode as SharedDraftComposerDraft["labor_mode"],
    labor_rate: numberInput(v.labor_rate, { blank: true }),
    job_labor_hours: numberInput(v.job_labor_hours, { blank: true }),
    line_items: v.line_items.map((inputLine, i) => {
      const line = record(inputLine);
      return createWorkComposerLineDraft({
        id: `practice-line-${i}`,
        line_type: lineType(line.line_type),
        description: text(line.line_title || line.description, 500),
        line_title: text(line.line_title || line.description, 500),
        customer_description: text(line.customer_description ?? "", 2000),
        quantity: numberInput(line.quantity, { positive: true }),
        unit: text(line.unit, 40),
        unit_price: numberInput(line.unit_price, { blank: true }),
        labor_hours: numberInput(line.labor_hours ?? "", { blank: true }),
      });
    }),
  });
  if (
    new TextEncoder().encode(JSON.stringify(draft)).length >
    PRACTICE_LIMITS.maxPayloadBytes
  )
    throw new Error("Practice payload is too large.");
  return draft;
}
export function validatePracticePreview(input: unknown) {
  const draft = sanitizePracticeDraft(input);
  if (!draft.title.trim() || !draft.scope.trim() || !draft.line_items.length)
    throw new Error("Add a title, scope and at least one priced line.");
  if (draft.line_items.some((line) => line.unit_price === ""))
    throw new Error("Price every line. Use 0 for an included item.");
  const totals = workComposerDraftFinancialBreakdown(draft);
  if (
    totals.missingLaborRate ||
    !Number.isSafeInteger(totals.subtotalCents) ||
    totals.subtotalCents > 100000000
  )
    throw new Error("Review the labor rate and total (maximum $1,000,000).");
  return { draft, totalCents: totals.subtotalCents };
}
export function sanitizeSnapshot(input: unknown): PracticeSnapshot {
  const v = record(input);
  const business = record(v.business);
  if (
    !Array.isArray(v.prices) ||
    v.prices.length > PRACTICE_LIMITS.maxPrices ||
    !Array.isArray(v.templates) ||
    v.templates.length > PRACTICE_LIMITS.maxTemplates
  )
    throw new Error("Snapshot exceeds catalog/template limits.");
  const prices = v.prices.map((item) => {
    const p = record(item);
    const cents = p.default_unit_price_cents;
    if (
      cents !== null &&
      (typeof cents !== "number" ||
        !Number.isSafeInteger(cents) ||
        cents < 0 ||
        cents > 100000000)
    )
      throw new Error("Invalid selling price.");
    if (
      p.labor_hours !== null &&
      (typeof p.labor_hours !== "number" ||
        !Number.isFinite(p.labor_hours) ||
        p.labor_hours < 0 ||
        p.labor_hours > 1000000)
    )
      throw new Error("Invalid labor hours.");
    return {
      id: text(p.id, 100),
      title: text(p.title, 500),
      customer_description: text(p.customer_description, 2000),
      line_type: lineType(p.line_type),
      unit: text(p.unit, 40),
      default_unit_price_cents: cents as number | null,
      labor_hours: p.labor_hours as number | null,
    };
  });
  const templates = v.templates.map((inputTemplate) => {
    const t = record(inputTemplate);
    if (
      !Array.isArray(t.line_items) ||
      t.line_items.length > PRACTICE_LIMITS.maxLines
    )
      throw new Error("Template has too many lines.");
    const lines = t.line_items.map((inputLine, i) => {
      const l = record(inputLine);
      const cents = l.unit_price_cents;
      if (
        cents !== null &&
        (typeof cents !== "number" ||
          !Number.isSafeInteger(cents) ||
          cents < 0 ||
          cents > 100000000)
      )
        throw new Error("Invalid template price.");
      return {
        line_type: lineType(l.line_type),
        description: text(l.description, 500),
        customer_description: text(l.customer_description ?? "", 2000),
        quantity: Number(numberInput(String(l.quantity), { positive: true })),
        unit: text(l.unit, 40),
        unit_price_cents: cents as number | null,
        sort_order: i,
      };
    });
    return {
      id: text(t.id, 100),
      name: text(t.name, 200),
      scope: text(t.scope, 10000),
      line_items: lines,
    };
  });
  const snapshot = {
    business: {
      name: text(business.name, 200),
      laborRate: numberInput(business.laborRate, { blank: true }),
    },
    prices,
    templates,
  };
  if (
    new TextEncoder().encode(JSON.stringify(snapshot)).length >
    PRACTICE_LIMITS.maxPayloadBytes
  )
    throw new Error("Snapshot exceeds 1 MiB.");
  return snapshot;
}
