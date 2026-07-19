import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ContractorWorkDraft,
  ContractorWorkDraftEnvelope,
  ContractorWorkDraftGetResponse,
  ContractorWorkDraftItem,
  ContractorWorkDraftLaunch,
  ContractorWorkDraftLaunchRequest,
  ContractorWorkDraftLaunchResult,
  ContractorWorkDraftLegacyImportRequest,
  ContractorWorkDraftLegacyImportResponse,
  ContractorWorkDraftListOptions,
  ContractorWorkDraftListRow,
  ContractorWorkDraftSavePayload,
  ContractorWorkDraftSaveResponse,
  ContractorWorkDraftStatus,
  DurableDraftApplicationErrorCode,
  DurableDraftNormalizedError,
  DurableDraftOperationPhase,
} from './durableDraftLaunchTypes';

export type DurableDraftSupabaseClient = Pick<SupabaseClient, 'rpc' | 'from'>;

const APPLICATION_ERROR_CODES: readonly DurableDraftApplicationErrorCode[] = [
  'DRAFT_PERMISSION_DENIED',
  'DRAFT_NOT_FOUND',
  'DRAFT_NOT_ACTIVE',
  'DRAFT_ALREADY_CONSUMED',
  'DRAFT_INVALID',
  'DRAFT_RESPONSE_INVALID',
  'INTENDED_OUTPUT_REQUIRED',
  'INTENDED_OUTPUT_MISMATCH',
  'UNSUPPORTED_OUTPUT',
  'IDEMPOTENCY_CONFLICT',
  'LAUNCH_CONFLICT',
  'CUSTOMER_INVALID',
  'PROPERTY_INVALID',
  'PROPERTY_NOT_SHARED',
  'SERVICE_REQUEST_INVALID',
  'JOB_SERVICE_REQUEST_CONFLICT',
  'LEGACY_DRAFT_INCOMPATIBLE',
];

const PHASE_FALLBACKS: Record<DurableDraftOperationPhase, string> = {
  save: 'DRAFT_SAVE_FAILED',
  get: 'DRAFT_LOAD_FAILED',
  list: 'DRAFT_LIST_FAILED',
  import: 'DRAFT_IMPORT_FAILED',
  launch: 'DRAFT_LAUNCH_FAILED',
  capability: 'DRAFT_CAPABILITY_CHECK_FAILED',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDurableDraftUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

export function isDurableDraftTimestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T/.test(value)
    && Number.isFinite(Date.parse(value));
}

function isNullableUuid(value: unknown): value is string | null {
  return value === null || isDurableDraftUuid(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isNullableSafeInteger(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value));
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function hasValidDraftOutputState(draft: Record<string, unknown>) {
  const outputType = draft.launched_output_type;
  if (outputType === null) {
    return draft.status !== 'consumed'
      && draft.launched_estimate_id === null
      && draft.launched_job_id === null
      && draft.launched_estimate_id_snapshot === null
      && draft.launched_job_id_snapshot === null
      && draft.launched_at === null;
  }
  if (draft.status !== 'consumed' || !isDurableDraftTimestamp(draft.launched_at)) return false;
  if (outputType === 'estimate') {
    return draft.intended_output === 'estimate'
      && isNullableUuid(draft.launched_estimate_id)
      && isDurableDraftUuid(draft.launched_estimate_id_snapshot)
      && (draft.launched_estimate_id === null || draft.launched_estimate_id === draft.launched_estimate_id_snapshot)
      && draft.launched_job_id === null
      && draft.launched_job_id_snapshot === null;
  }
  if (outputType === 'job') {
    return draft.intended_output === 'job'
      && isNullableUuid(draft.launched_job_id)
      && isDurableDraftUuid(draft.launched_job_id_snapshot)
      && (draft.launched_job_id === null || draft.launched_job_id === draft.launched_job_id_snapshot)
      && draft.launched_estimate_id === null
      && draft.launched_estimate_id_snapshot === null;
  }
  return false;
}

function parseDraft(value: unknown): ContractorWorkDraft | null {
  if (!isRecord(value)) return null;
  const status = value.status;
  const intendedOutput = value.intended_output;
  const subjectType = value.subject_type;
  if (
    !isDurableDraftUuid(value.id)
    || !isDurableDraftUuid(value.contractor_id)
    || !isNullableUuid(value.created_by_user_id)
    || !isNullableUuid(value.homeowner_user_id)
    || !isNullableUuid(value.home_id)
    || !isNullableUuid(value.local_contact_id)
    || !isNullableUuid(value.local_home_id)
    || !isNullableUuid(value.service_request_id)
    || (subjectType !== 'connected_homeowner' && subjectType !== 'local_contact')
    || !isString(value.subject_display_name_snapshot)
    || !isString(value.property_display_snapshot)
    || !isString(value.title)
    || !isString(value.scope_description)
    || !isString(value.private_notes)
    || (intendedOutput !== null && intendedOutput !== 'estimate' && intendedOutput !== 'job')
    || value.work_format !== 'standard'
    || (value.labor_mode !== null && value.labor_mode !== 'job_total' && value.labor_mode !== 'line_specific')
    || !isNullableSafeInteger(value.labor_rate_cents)
    || !isNullableFiniteNumber(value.job_labor_hours)
    || (status !== 'active' && status !== 'consumed' && status !== 'discarded')
    || !isNullableUuid(value.legacy_inspection_id)
    || !isNullableUuid(value.launched_estimate_id)
    || !isNullableUuid(value.launched_job_id)
    || !isNullableUuid(value.launched_estimate_id_snapshot)
    || !isNullableUuid(value.launched_job_id_snapshot)
    || !isNullableUuid(value.launched_by_user_id)
    || !isDurableDraftTimestamp(value.created_at)
    || !isDurableDraftTimestamp(value.updated_at)
    || Date.parse(value.updated_at) < Date.parse(value.created_at)
    || !hasValidDraftOutputState(value)
  ) return null;
  if (subjectType === 'connected_homeowner') {
    if (!isDurableDraftUuid(value.homeowner_user_id) || value.local_contact_id !== null || value.local_home_id !== null) return null;
  } else if (!isDurableDraftUuid(value.local_contact_id)
    || value.homeowner_user_id !== null
    || value.home_id !== null
    || value.service_request_id !== null) return null;
  return value as ContractorWorkDraft;
}

function parseItem(value: unknown): ContractorWorkDraftItem | null {
  if (!isRecord(value)
    || !isDurableDraftUuid(value.id)
    || !isDurableDraftUuid(value.draft_id)
    || !isDurableDraftUuid(value.contractor_id)
    || !isString(value.title)
    || !isString(value.description)
    || !isString(value.customer_description)
    || !isString(value.internal_notes)
    || !['labor', 'material', 'fee', 'other'].includes(String(value.line_type))
    || typeof value.quantity !== 'number' || !Number.isFinite(value.quantity)
    || !isString(value.unit)
    || !isNullableSafeInteger(value.unit_price_cents)
    || !isNullableFiniteNumber(value.labor_hours)
    || !isNullableUuid(value.room_id)
    || (value.room_label !== null && !isString(value.room_label))
    || (value.location_label !== null && !isString(value.location_label))
    || typeof value.sort_order !== 'number' || !Number.isSafeInteger(value.sort_order) || value.sort_order < 0
    || !isDurableDraftTimestamp(value.created_at)
    || !isDurableDraftTimestamp(value.updated_at)
    || Date.parse(value.updated_at) < Date.parse(value.created_at)) return null;
  return value as ContractorWorkDraftItem;
}

function parseLaunch(value: unknown): ContractorWorkDraftLaunch | null {
  if (!isRecord(value)
    || !isDurableDraftUuid(value.id)
    || !isDurableDraftUuid(value.draft_id)
    || !isDurableDraftUuid(value.contractor_id)
    || !isDurableDraftUuid(value.idempotency_key)
    || (value.requested_output !== 'estimate' && value.requested_output !== 'job')
    || value.status !== 'succeeded'
    || !isNullableUuid(value.launched_estimate_id)
    || !isNullableUuid(value.launched_job_id)
    || !isNullableUuid(value.launched_estimate_id_snapshot)
    || !isNullableUuid(value.launched_job_id_snapshot)
    || !isNullableUuid(value.requested_by_user_id)
    || !isDurableDraftTimestamp(value.created_at)
    || !isDurableDraftTimestamp(value.completed_at)
    || Date.parse(value.completed_at) < Date.parse(value.created_at)) return null;
  if (value.requested_output === 'estimate') {
    if (!isDurableDraftUuid(value.launched_estimate_id_snapshot)
      || (value.launched_estimate_id !== null && value.launched_estimate_id !== value.launched_estimate_id_snapshot)
      || value.launched_job_id !== null || value.launched_job_id_snapshot !== null) return null;
  } else if (!isDurableDraftUuid(value.launched_job_id_snapshot)
    || (value.launched_job_id !== null && value.launched_job_id !== value.launched_job_id_snapshot)
    || value.launched_estimate_id !== null || value.launched_estimate_id_snapshot !== null) return null;
  return value as ContractorWorkDraftLaunch;
}

export function parseContractorWorkDraftEnvelope(value: unknown): ContractorWorkDraftEnvelope | null {
  if (!isRecord(value) || !Array.isArray(value.items) || !Array.isArray(value.launches)) return null;
  const draft = parseDraft(value.draft);
  const items = value.items.map(parseItem);
  const launches = value.launches.map(parseLaunch);
  if (!draft || items.some(item => item === null) || launches.some(launch => launch === null)) return null;
  const validItems = items as ContractorWorkDraftItem[];
  const validLaunches = launches as ContractorWorkDraftLaunch[];
  if (validItems.some(item => item.draft_id !== draft.id || item.contractor_id !== draft.contractor_id)
    || validLaunches.some(launch => launch.draft_id !== draft.id || launch.contractor_id !== draft.contractor_id)
    || new Set(validItems.map(item => item.id)).size !== validItems.length
    || new Set(validItems.map(item => item.sort_order)).size !== validItems.length
    || new Set(validLaunches.map(launch => launch.id)).size !== validLaunches.length) return null;
  return { draft, items: validItems, launches: validLaunches };
}

export function parseContractorWorkDraftLaunchResult(value: unknown): ContractorWorkDraftLaunchResult | null {
  if (!isRecord(value)
    || !isDurableDraftUuid(value.draft_id)
    || (value.status !== 'succeeded' && value.status !== 'already_consumed')
    || (value.output_type !== 'estimate' && value.output_type !== 'job')
    || typeof value.output_available !== 'boolean'
    || !isNullableUuid(value.launch_id)
    || typeof value.idempotent !== 'boolean'
    || !isNullableUuid(value.estimate_id)
    || !isNullableUuid(value.job_id)
    || !isDurableDraftUuid(value.output_id_snapshot)) return null;
  if (value.status === 'succeeded' && value.launch_id === null) return null;
  const liveId = value.output_type === 'estimate' ? value.estimate_id : value.job_id;
  if (value.output_type === 'estimate' ? value.job_id !== null : value.estimate_id !== null) return null;
  if (value.output_available !== (liveId !== null)) return null;
  if (liveId !== null && liveId !== value.output_id_snapshot) return null;
  return value as ContractorWorkDraftLaunchResult;
}

function stringField(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberField(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function applicationCodeFrom(source: Record<string, unknown>): DurableDraftApplicationErrorCode | null {
  const searchable = [stringField(source, 'message'), stringField(source, 'details'), stringField(source, 'hint')]
    .filter((value): value is string => Boolean(value))
    .join(' ');
  return APPLICATION_ERROR_CODES.find(code => new RegExp(`(?:^|[^A-Z_])${code}(?:$|[^A-Z_])`).test(searchable)) ?? null;
}

function transportClassification(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (error instanceof TypeError || message.includes('failed to fetch') || message.includes('network')) return 'network' as const;
  if (message.includes('timeout') || message.includes('timed out')) return 'timeout' as const;
  if (message.includes('offline')) return 'offline' as const;
  return null;
}

export class DurableDraftError extends Error implements DurableDraftNormalizedError {
  readonly name = 'DurableDraftError' as const;
  readonly phase: DurableDraftOperationPhase;
  readonly kind: DurableDraftNormalizedError['kind'];
  readonly applicationCode: DurableDraftApplicationErrorCode | null;
  readonly postgresCode: string | null;
  readonly details: string | null;
  readonly hint: string | null;
  readonly httpStatus: number | null;
  readonly transportClassification: DurableDraftNormalizedError['transportClassification'];
  readonly safeMessage: string;

  constructor(normalized: DurableDraftNormalizedError) {
    super(normalized.safeMessage);
    this.phase = normalized.phase;
    this.kind = normalized.kind;
    this.applicationCode = normalized.applicationCode;
    this.postgresCode = normalized.postgresCode;
    this.details = normalized.details;
    this.hint = normalized.hint;
    this.httpStatus = normalized.httpStatus;
    this.transportClassification = normalized.transportClassification;
    this.safeMessage = normalized.safeMessage;
  }
}

export function normalizeDurableDraftError(
  error: unknown,
  phase: DurableDraftOperationPhase,
  responseStatus?: number,
): DurableDraftError {
  if (error instanceof DurableDraftError) return error;

  const source = isRecord(error) ? error : {};
  const applicationCode = applicationCodeFrom(source);
  const postgresCode = stringField(source, 'code');
  const transport = transportClassification(error);
  const httpStatus = numberField(source, 'status') ?? responseStatus ?? null;
  const kind = applicationCode
    ? 'application'
    : transport
      ? 'transport'
      : postgresCode
        ? 'database'
        : 'unknown';

  return new DurableDraftError({
    name: 'DurableDraftError',
    phase,
    kind,
    applicationCode,
    postgresCode,
    details: stringField(source, 'details'),
    hint: stringField(source, 'hint'),
    httpStatus,
    transportClassification: transport,
    safeMessage: applicationCode ?? (postgresCode === '22P02' ? 'DRAFT_INVALID' : PHASE_FALLBACKS[phase]),
  });
}

async function runRpc(
  client: DurableDraftSupabaseClient,
  phase: DurableDraftOperationPhase,
  functionName: string,
  args?: Record<string, unknown>,
): Promise<unknown> {
  try {
    const result = await client.rpc(functionName, args);
    if (result.error) throw normalizeDurableDraftError(result.error, phase, result.status);
    return result.data;
  } catch (error) {
    throw normalizeDurableDraftError(error, phase);
  }
}

function asDraftEnvelope(
  value: unknown,
  phase: Extract<DurableDraftOperationPhase, 'save' | 'get'>,
): ContractorWorkDraftEnvelope {
  const parsed = parseContractorWorkDraftEnvelope(value);
  if (!parsed) throw normalizeDurableDraftError({ message: 'DRAFT_RESPONSE_INVALID' }, phase);
  return parsed;
}

function asLaunchResult(value: unknown): ContractorWorkDraftLaunchResult {
  const parsed = parseContractorWorkDraftLaunchResult(value);
  if (!parsed) throw normalizeDurableDraftError({ message: 'DRAFT_RESPONSE_INVALID' }, 'launch');
  return parsed;
}

export async function saveContractorWorkDraft(
  client: DurableDraftSupabaseClient,
  payload: ContractorWorkDraftSavePayload,
): Promise<ContractorWorkDraftSaveResponse> {
  const persistedIds = payload.items.flatMap(item => item.id ? [item.id] : []);
  if (new Set(persistedIds).size !== persistedIds.length) {
    throw normalizeDurableDraftError({ message: 'DRAFT_INVALID' }, 'save');
  }
  const metadata = { ...payload.metadata };
  const items = payload.items.map(item => ({ ...item }));
  const removedItemIds = [...payload.removed_item_ids];
  const data = await runRpc(client, 'save', 'servsync_save_work_draft', {
    p_draft_id: payload.draft_id,
    p_metadata: metadata,
    p_items: items,
    p_removed_item_ids: removedItemIds,
  });
  const response = asDraftEnvelope(data, 'save');
  if (payload.draft_id !== null && response.draft.id !== payload.draft_id) {
    throw normalizeDurableDraftError({ message: 'DRAFT_RESPONSE_INVALID' }, 'save');
  }
  return response;
}

export async function getContractorWorkDraft(
  client: DurableDraftSupabaseClient,
  draftId: string,
): Promise<ContractorWorkDraftGetResponse> {
  const data = await runRpc(client, 'get', 'servsync_get_work_draft', {
    p_draft_id: draftId,
  });
  const response = asDraftEnvelope(data, 'get');
  if (response.draft.id !== draftId) throw normalizeDurableDraftError({ message: 'DRAFT_RESPONSE_INVALID' }, 'get');
  return response;
}

// This adapter is read-only and relies on the dedicated tables' authenticated RLS policies.
const DRAFT_LIST_COLUMNS = [
  'id',
  'contractor_id',
  'subject_type',
  'subject_display_name_snapshot',
  'property_display_snapshot',
  'title',
  'intended_output',
  'work_format',
  'status',
  'legacy_inspection_id',
  'launched_output_type',
  'launched_estimate_id',
  'launched_job_id',
  'launched_estimate_id_snapshot',
  'launched_job_id_snapshot',
  'launched_at',
  'created_at',
  'updated_at',
].join(',');

export async function listContractorWorkDrafts(
  client: DurableDraftSupabaseClient,
  options: ContractorWorkDraftListOptions = {},
): Promise<ContractorWorkDraftListRow[]> {
  const statuses = options.statuses ? [...new Set(options.statuses)] : null;
  if (statuses?.length === 0) return [];

  try {
    let query = client
      .from('contractor_work_drafts')
      .select(DRAFT_LIST_COLUMNS);
    if (statuses) query = query.in('status', statuses);
    const result = await query
      .order('updated_at', { ascending: false })
      .order('id', { ascending: true });
    if (result.error) throw normalizeDurableDraftError(result.error, 'list', result.status);
    if (!Array.isArray(result.data)) throw new Error('Unexpected durable Draft list response shape');
    return result.data as unknown as ContractorWorkDraftListRow[];
  } catch (error) {
    throw normalizeDurableDraftError(error, 'list');
  }
}

export async function importLegacyContractorWorkDraft(
  client: DurableDraftSupabaseClient,
  request: ContractorWorkDraftLegacyImportRequest,
): Promise<ContractorWorkDraftLegacyImportResponse> {
  const data = await runRpc(client, 'import', 'servsync_import_legacy_draft_job', {
    p_inspection_id: request.inspection_id,
    p_intended_output: request.intended_output ?? null,
  });
  if (!isDurableDraftUuid(data)) throw normalizeDurableDraftError({ message: 'DRAFT_RESPONSE_INVALID' }, 'import');
  return { draft_id: data };
}

export async function launchContractorWorkDraft(
  client: DurableDraftSupabaseClient,
  request: ContractorWorkDraftLaunchRequest,
): Promise<ContractorWorkDraftLaunchResult> {
  const data = await runRpc(client, 'launch', 'servsync_launch_work_draft', {
    p_draft_id: request.draft_id,
    p_intended_output: request.intended_output,
    p_idempotency_key: request.idempotency_key,
  });
  const response = asLaunchResult(data);
  if (response.draft_id !== request.draft_id || response.output_type !== request.intended_output) {
    throw normalizeDurableDraftError({ message: 'DRAFT_RESPONSE_INVALID' }, 'launch');
  }
  return response;
}

export function isContractorWorkDraftStatus(value: string): value is ContractorWorkDraftStatus {
  return value === 'active' || value === 'consumed' || value === 'discarded';
}
