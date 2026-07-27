import type {
  Estimate,
  EstimateLineItem,
  EstimatePaymentScheduleItem,
  Inspection,
  InspectionRoomData,
  InspectionRoomFinding,
  Invoice,
  InvoiceBacklogItem,
  InvoiceLineItem,
} from '../../types';
import { isDurableDraftTimestamp, isDurableDraftUuid } from './durableDraftLaunchApi';

export type DurableDraftOutputValidationFailure =
  | 'wrong_family'
  | 'identity_mismatch'
  | 'contractor_mismatch'
  | 'invalid_record';

export type DurableDraftOutputValidationResult<T> =
  | { ok: true; record: T }
  | { ok: false; reason: DurableDraftOutputValidationFailure };

type LoadedOutputLike = {
  type?: unknown;
  id?: unknown;
  record?: unknown;
};

const ESTIMATE_STATUSES = new Set(['draft', 'sent', 'accepted', 'declined', 'expired', 'revised']);
const ESTIMATE_LINE_TYPES = new Set(['labor', 'material', 'fee', 'other', 'equipment']);
const ESTIMATE_SUPPLY_STATUSES = new Set(['contractor_supplied', 'customer_supplied', 'to_be_confirmed']);
const ESTIMATE_LABOR_MODES = new Set(['job_total', 'line_specific']);
const PAYMENT_INVOICE_TYPES = new Set(['total', 'deposit', 'progress', 'final']);
const PAYMENT_AMOUNT_TYPES = new Set(['fixed', 'percentage']);
const INSPECTION_STATUSES = new Set(['draft', 'finalized']);
const JOB_TYPES = new Set(['service_visit', 'repair', 'install', 'estimate_visit', 'inspection', 'maintenance_visit']);
const JOB_STATUSES = new Set(['draft', 'scheduled', 'in_progress', 'completed', 'closed', 'cancelled']);
const JOB_ORIGINS = new Set(['direct', 'estimate', 'draft_composer', 'invoice_direct', 'imported', 'other']);
const FINDING_STATUSES = new Set(['Not Recorded', 'Pass', 'Monitor', 'Fixed On Site', 'Needs Repair', 'Urgent']);
const INVOICE_STATUSES = new Set(['draft', 'sent', 'viewed', 'paid', 'partially_paid', 'void', 'overdue']);
const INVOICE_TYPES = new Set(['total', 'deposit', 'progress', 'final']);
const INVOICE_DISCOUNT_TYPES = new Set(['amount', 'percentage']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNonemptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isDurableDraftUuid(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isOptionalNullableUuid(value: unknown): value is string | null | undefined {
  return value === undefined || isNullableUuid(value);
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || isNullableString(value);
}

function isOptionalNullableTimestamp(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || isDurableDraftTimestamp(value);
}

function isOptionalNullableFiniteNumber(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || isFiniteNumber(value);
}

function hasValidSubject(record: Record<string, unknown>) {
  const connected = isDurableDraftUuid(record.homeowner_user_id);
  const local = isDurableDraftUuid(record.local_contact_id);
  return connected !== local;
}

function isEstimateLineItem(value: unknown): value is EstimateLineItem {
  if (!isRecord(value)) return false;
  return isDurableDraftUuid(value.id)
    && isDurableDraftUuid(value.estimate_id)
    && isString(value.line_type) && ESTIMATE_LINE_TYPES.has(value.line_type)
    && isString(value.description)
    && isOptionalNullableString(value.line_title)
    && isOptionalNullableString(value.customer_description)
    && isOptionalNullableString(value.model_spec)
    && (value.supply_status === undefined || value.supply_status === null
      || (isString(value.supply_status) && ESTIMATE_SUPPLY_STATUSES.has(value.supply_status)))
    && isFiniteNumber(value.quantity) && value.quantity > 0
    && isString(value.unit)
    && (value.unit_price_cents === null || isSafeInteger(value.unit_price_cents))
    && isOptionalNullableFiniteNumber(value.labor_hours)
    && isSafeInteger(value.sort_order)
    && isDurableDraftTimestamp(value.created_at)
    && isDurableDraftTimestamp(value.updated_at);
}

function isEstimatePaymentScheduleItem(value: unknown): value is EstimatePaymentScheduleItem {
  if (!isRecord(value)) return false;
  return isDurableDraftUuid(value.id)
    && isDurableDraftUuid(value.estimate_id)
    && isString(value.invoice_type) && PAYMENT_INVOICE_TYPES.has(value.invoice_type)
    && isString(value.label)
    && isString(value.amount_type) && PAYMENT_AMOUNT_TYPES.has(value.amount_type)
    && isFiniteNumber(value.amount_value)
    && isSafeInteger(value.calculated_amount_cents)
    && isString(value.due_trigger)
    && isSafeInteger(value.sort_order)
    && isOptionalNullableUuid(value.linked_invoice_id)
    && isDurableDraftTimestamp(value.created_at)
    && isDurableDraftTimestamp(value.updated_at);
}

function isInvoiceLineItem(value: unknown): value is InvoiceLineItem {
  if (!isRecord(value)) return false;
  return isDurableDraftUuid(value.id)
    && isDurableDraftUuid(value.invoice_id)
    && isOptionalNullableUuid(value.job_work_item_id)
    && isString(value.line_type) && ESTIMATE_LINE_TYPES.has(value.line_type)
    && isString(value.description)
    && isOptionalNullableString(value.line_title)
    && isOptionalNullableString(value.customer_description)
    && isOptionalNullableString(value.model_spec)
    && (value.supply_status === undefined || value.supply_status === null
      || (isString(value.supply_status) && ESTIMATE_SUPPLY_STATUSES.has(value.supply_status)))
    && isFiniteNumber(value.quantity) && value.quantity > 0
    && isString(value.unit)
    && (value.unit_price_cents === null || isSafeInteger(value.unit_price_cents))
    && isOptionalNullableFiniteNumber(value.labor_hours)
    && isSafeInteger(value.sort_order)
    && isDurableDraftTimestamp(value.created_at)
    && isDurableDraftTimestamp(value.updated_at);
}

function isInvoiceBacklogItem(value: unknown): value is InvoiceBacklogItem {
  if (!isRecord(value)) return false;
  return isDurableDraftUuid(value.id)
    && isDurableDraftUuid(value.invoice_id)
    && isOptionalNullableUuid(value.job_work_item_id)
    && isNonemptyString(value.title)
    && isString(value.description)
    && isString(value.completion_status)
    && isString(value.billing_status)
    && isString(value.not_included_reason)
    && isSafeInteger(value.sort_order)
    && isDurableDraftTimestamp(value.created_at)
    && isDurableDraftTimestamp(value.updated_at);
}

export function validateDurableDraftEstimateRecord(value: unknown): DurableDraftOutputValidationResult<Estimate> {
  if (!isRecord(value)) return { ok: false, reason: 'invalid_record' };
  const valid = isDurableDraftUuid(value.id)
    && isDurableDraftUuid(value.contractor_id)
    && isNullableUuid(value.homeowner_user_id)
    && isNullableUuid(value.local_contact_id)
    && hasValidSubject(value)
    && isNullableUuid(value.service_request_id)
    && isNullableUuid(value.inspection_id)
    && isOptionalNullableUuid(value.home_id)
    && isOptionalNullableUuid(value.local_home_id)
    && isOptionalNullableString(value.home_label)
    && isOptionalNullableString(value.home_address)
    && isNonemptyString(value.title)
    && isString(value.scope)
    && isString(value.notes)
    && isString(value.terms)
    && isString(value.status) && ESTIMATE_STATUSES.has(value.status)
    && isSafeInteger(value.subtotal_cents)
    && isSafeInteger(value.total_cents)
    && (value.labor_mode === undefined || value.labor_mode === null
      || (isString(value.labor_mode) && ESTIMATE_LABOR_MODES.has(value.labor_mode)))
    && isOptionalNullableFiniteNumber(value.labor_rate_cents)
    && isOptionalNullableFiniteNumber(value.job_labor_hours)
    && isOptionalNullableFiniteNumber(value.material_total_cents)
    && isOptionalNullableFiniteNumber(value.labor_total_cents)
    && isOptionalNullableFiniteNumber(value.fee_total_cents)
    && isOptionalNullableFiniteNumber(value.other_total_cents)
    && isOptionalNullableFiniteNumber(value.tax_rate_percent)
    && isOptionalNullableFiniteNumber(value.tax_cents)
    && isDurableDraftTimestamp(value.created_at)
    && isDurableDraftTimestamp(value.updated_at)
    && Array.isArray(value.line_items) && value.line_items.every(isEstimateLineItem)
    && Array.isArray(value.payment_schedule_items) && value.payment_schedule_items.every(isEstimatePaymentScheduleItem);
  return valid
    ? { ok: true, record: value as unknown as Estimate }
    : { ok: false, reason: 'invalid_record' };
}

function isInspectionRoomFinding(value: unknown): value is InspectionRoomFinding {
  if (!isRecord(value)) return false;
  return isOptionalNullableString(value.source_key)
    && isOptionalNullableString(value.source_type)
    && isOptionalNullableString(value.source_room_id)
    && isOptionalNullableString(value.source_finding_id)
    && isNonemptyString(value.title)
    && isString(value.status) && FINDING_STATUSES.has(value.status)
    && isString(value.notes)
    && isString(value.action)
    && isString(value.due)
    && Array.isArray(value.photos) && value.photos.every(isString);
}

function isInspectionRoom(value: unknown): value is InspectionRoomData {
  if (!isRecord(value)) return false;
  return isNonemptyString(value.room)
    && isOptionalNullableString(value.room_id)
    && isOptionalNullableString(value.display_name)
    && isOptionalNullableString(value.room_type)
    && isOptionalNullableString(value.location_note)
    && isOptionalNullableString(value.reference_photo_storage_path)
    && (value.sort_order === undefined || isSafeInteger(value.sort_order))
    && isOptionalNullableUuid(value.last_edited_by)
    && isOptionalNullableTimestamp(value.last_edited_at)
    && Array.isArray(value.findings) && value.findings.every(isInspectionRoomFinding);
}

export function validateDurableDraftJobRecord(value: unknown): DurableDraftOutputValidationResult<Inspection> {
  if (!isRecord(value)) return { ok: false, reason: 'invalid_record' };
  const valid = isDurableDraftUuid(value.id)
    && isDurableDraftUuid(value.contractor_id)
    && isNullableUuid(value.homeowner_user_id)
    && isNullableUuid(value.local_contact_id)
    && hasValidSubject(value)
    && isOptionalNullableUuid(value.home_id)
    && isNullableUuid(value.local_home_id)
    && isNullableUuid(value.service_request_id)
    && isNullableUuid(value.template_id)
    && isNonemptyString(value.name)
    && isString(value.summary)
    && isString(value.status) && INSPECTION_STATUSES.has(value.status)
    && isString(value.job_type) && JOB_TYPES.has(value.job_type)
    && isString(value.job_status) && JOB_STATUSES.has(value.job_status)
    && isString(value.job_origin) && JOB_ORIGINS.has(value.job_origin)
    && isOptionalNullableUuid(value.estimate_id)
    && isOptionalNullableUuid(value.draft_created_by)
    && isOptionalNullableUuid(value.draft_updated_by)
    && isOptionalNullableTimestamp(value.draft_saved_at)
    && isOptionalNullableTimestamp(value.activated_at)
    && isOptionalNullableUuid(value.activated_by)
    && isOptionalNullableUuid(value.project_id)
    && isOptionalNullableTimestamp(value.completed_at)
    && isOptionalNullableTimestamp(value.closed_at)
    && Array.isArray(value.rooms_with_findings) && value.rooms_with_findings.every(isInspectionRoom)
    && isNullableString(value.report_storage_path)
    && isNullableString(value.report_file_name)
    && isDurableDraftTimestamp(value.created_at)
    && isDurableDraftTimestamp(value.updated_at);
  return valid
    ? { ok: true, record: value as unknown as Inspection }
    : { ok: false, reason: 'invalid_record' };
}

export function validateDurableDraftInvoiceRecord(value: unknown): DurableDraftOutputValidationResult<Invoice> {
  if (!isRecord(value)) return { ok: false, reason: 'invalid_record' };
  const valid = isDurableDraftUuid(value.id)
    && isDurableDraftUuid(value.contractor_id)
    && isNullableUuid(value.homeowner_user_id)
    && isNullableUuid(value.local_contact_id)
    && hasValidSubject(value)
    && isNullableUuid(value.service_request_id)
    && isNullableUuid(value.job_id)
    && isNullableUuid(value.estimate_id)
    && isOptionalNullableUuid(value.home_id)
    && isOptionalNullableUuid(value.local_home_id)
    && isOptionalNullableString(value.home_label)
    && isOptionalNullableString(value.home_address)
    && isString(value.invoice_number)
    && isString(value.invoice_type) && INVOICE_TYPES.has(value.invoice_type)
    && (value.invoice_sequence === undefined || value.invoice_sequence === null || isSafeInteger(value.invoice_sequence))
    && isNonemptyString(value.title)
    && isString(value.scope)
    && isString(value.notes)
    && isString(value.terms)
    && isString(value.status) && INVOICE_STATUSES.has(value.status)
    && isSafeInteger(value.subtotal_cents)
    && (value.labor_mode === undefined || value.labor_mode === null
      || (isString(value.labor_mode) && ESTIMATE_LABOR_MODES.has(value.labor_mode)))
    && isOptionalNullableFiniteNumber(value.labor_rate_cents)
    && isOptionalNullableFiniteNumber(value.job_labor_hours)
    && isOptionalNullableFiniteNumber(value.material_total_cents)
    && isOptionalNullableFiniteNumber(value.labor_total_cents)
    && isOptionalNullableFiniteNumber(value.fee_total_cents)
    && isOptionalNullableFiniteNumber(value.other_total_cents)
    && isSafeInteger(value.tax_cents)
    && isOptionalNullableFiniteNumber(value.tax_rate_percent)
    && isSafeInteger(value.discount_cents)
    && (value.discount_type === undefined || (isString(value.discount_type) && INVOICE_DISCOUNT_TYPES.has(value.discount_type)))
    && (value.discount_value === undefined || isFiniteNumber(value.discount_value))
    && (value.discount_reason === undefined || isString(value.discount_reason))
    && isSafeInteger(value.total_cents)
    && isSafeInteger(value.amount_paid_cents)
    && isOptionalNullableTimestamp(value.issued_at)
    && isOptionalNullableTimestamp(value.due_at)
    && isOptionalNullableTimestamp(value.paid_at)
    && isOptionalNullableTimestamp(value.voided_at)
    && isDurableDraftTimestamp(value.created_at)
    && isDurableDraftTimestamp(value.updated_at)
    && Array.isArray(value.line_items) && value.line_items.every(isInvoiceLineItem)
    && Array.isArray(value.backlog_items) && value.backlog_items.every(isInvoiceBacklogItem);
  return valid
    ? { ok: true, record: value as unknown as Invoice }
    : { ok: false, reason: 'invalid_record' };
}

export function validateDurableDraftLoadedOutput(
  value: unknown,
  expected: { outputType: 'estimate' | 'job' | 'invoice'; outputId: string; contractorId: string },
): DurableDraftOutputValidationResult<Estimate | Inspection | Invoice> {
  if (!isRecord(value)) return { ok: false, reason: 'invalid_record' };
  const loaded = value as LoadedOutputLike;
  if (loaded.type !== expected.outputType) return { ok: false, reason: 'wrong_family' };
  if (loaded.id !== expected.outputId || !isRecord(loaded.record) || loaded.record.id !== expected.outputId) {
    return { ok: false, reason: 'identity_mismatch' };
  }
  if (loaded.record.contractor_id !== expected.contractorId) return { ok: false, reason: 'contractor_mismatch' };
  return expected.outputType === 'estimate'
    ? validateDurableDraftEstimateRecord(loaded.record)
    : expected.outputType === 'job'
      ? validateDurableDraftJobRecord(loaded.record)
      : validateDurableDraftInvoiceRecord(loaded.record);
}
