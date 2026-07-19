import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ContractorWorkDraftEnvelope,
  ContractorWorkDraftGetResponse,
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
  if (!isRecord(value) || !isRecord(value.draft) || !Array.isArray(value.items) || !Array.isArray(value.launches)) {
    throw normalizeDurableDraftError(new Error('Unexpected durable Draft response shape'), phase);
  }
  return value as ContractorWorkDraftEnvelope;
}

function asLaunchResult(value: unknown): ContractorWorkDraftLaunchResult {
  if (!isRecord(value) || (value.output_type !== 'estimate' && value.output_type !== 'job')) {
    throw normalizeDurableDraftError(new Error('Unexpected durable Draft launch response shape'), 'launch');
  }
  return value as ContractorWorkDraftLaunchResult;
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
  return asDraftEnvelope(data, 'save');
}

export async function getContractorWorkDraft(
  client: DurableDraftSupabaseClient,
  draftId: string,
): Promise<ContractorWorkDraftGetResponse> {
  const data = await runRpc(client, 'get', 'servsync_get_work_draft', {
    p_draft_id: draftId,
  });
  return asDraftEnvelope(data, 'get');
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
  if (typeof data !== 'string') throw normalizeDurableDraftError(new Error('Unexpected durable Draft import response shape'), 'import');
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
  return asLaunchResult(data);
}

export function isContractorWorkDraftStatus(value: string): value is ContractorWorkDraftStatus {
  return value === 'active' || value === 'consumed' || value === 'discarded';
}
