import type {
  ContractorWorkDraftLaunchOutput,
  ContractorWorkDraftLaunchResult,
  DurableDraftLaunchAttemptPhase,
  DurableDraftLaunchAttemptRecord,
} from './durableDraftLaunchTypes';

export const DURABLE_DRAFT_LAUNCH_ATTEMPT_PREFIX = 'servsync.workDraftLaunch:';

export type DurableDraftLaunchAttemptStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export type CreateDurableDraftLaunchAttemptInput = {
  contractorId: string;
  draftId: string;
  outputType: ContractorWorkDraftLaunchOutput;
};

type LaunchAttemptDependencies = {
  now?: () => Date;
  randomUUID?: () => string;
};

function isoNow(now?: () => Date) {
  return (now?.() ?? new Date()).toISOString();
}

function generatedUuid(randomUUID?: () => string) {
  const generator = randomUUID ?? globalThis.crypto?.randomUUID?.bind(globalThis.crypto);
  if (!generator) throw new Error('DRAFT_IDEMPOTENCY_UUID_UNAVAILABLE');
  return generator();
}

export function durableDraftLaunchAttemptKey(contractorId: string, draftId: string) {
  return `${DURABLE_DRAFT_LAUNCH_ATTEMPT_PREFIX}${contractorId}:${draftId}`;
}

function isNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

function isLaunchAttemptPhase(value: unknown): value is DurableDraftLaunchAttemptPhase {
  return value === 'prepared' || value === 'launching' || value === 'succeeded' || value === 'ambiguous';
}

function parseAttempt(value: string | null): DurableDraftLaunchAttemptRecord | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    const allowedKeys = new Set([
      'schemaVersion',
      'contractorId',
      'draftId',
      'outputType',
      'idempotencyKey',
      'phase',
      'createdAt',
      'updatedAt',
      'launchId',
      'estimateId',
      'jobId',
      'outputIdSnapshot',
      'outputAvailable',
    ]);
    if (
      Object.keys(record).some(key => !allowedKeys.has(key))
      ||
      record.schemaVersion !== 1
      || typeof record.contractorId !== 'string'
      || typeof record.draftId !== 'string'
      || (record.outputType !== 'estimate' && record.outputType !== 'job')
      || typeof record.idempotencyKey !== 'string'
      || !isLaunchAttemptPhase(record.phase)
      || typeof record.createdAt !== 'string'
      || typeof record.updatedAt !== 'string'
      || !isNullableString(record.launchId)
      || !isNullableString(record.estimateId)
      || !isNullableString(record.jobId)
      || !isNullableString(record.outputIdSnapshot)
      || (record.outputAvailable !== undefined && typeof record.outputAvailable !== 'boolean')
    ) return null;
    return parsed as DurableDraftLaunchAttemptRecord;
  } catch {
    return null;
  }
}

function persistAttempt(storage: DurableDraftLaunchAttemptStorage, attempt: DurableDraftLaunchAttemptRecord) {
  const safeRecord: DurableDraftLaunchAttemptRecord = {
    schemaVersion: 1,
    contractorId: attempt.contractorId,
    draftId: attempt.draftId,
    outputType: attempt.outputType,
    idempotencyKey: attempt.idempotencyKey,
    phase: attempt.phase,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
    ...(attempt.launchId !== undefined ? { launchId: attempt.launchId } : {}),
    ...(attempt.estimateId !== undefined ? { estimateId: attempt.estimateId } : {}),
    ...(attempt.jobId !== undefined ? { jobId: attempt.jobId } : {}),
    ...(attempt.outputIdSnapshot !== undefined ? { outputIdSnapshot: attempt.outputIdSnapshot } : {}),
    ...(attempt.outputAvailable !== undefined ? { outputAvailable: attempt.outputAvailable } : {}),
  };
  storage.setItem(durableDraftLaunchAttemptKey(attempt.contractorId, attempt.draftId), JSON.stringify(safeRecord));
  return safeRecord;
}

export function readDurableDraftLaunchAttempt(
  storage: DurableDraftLaunchAttemptStorage,
  contractorId: string,
  draftId: string,
): DurableDraftLaunchAttemptRecord | null {
  const attempt = parseAttempt(storage.getItem(durableDraftLaunchAttemptKey(contractorId, draftId)));
  return attempt?.contractorId === contractorId && attempt.draftId === draftId ? attempt : null;
}

export function createDurableDraftLaunchAttempt(
  storage: DurableDraftLaunchAttemptStorage,
  input: CreateDurableDraftLaunchAttemptInput,
  dependencies: LaunchAttemptDependencies = {},
): DurableDraftLaunchAttemptRecord {
  const existing = readDurableDraftLaunchAttempt(storage, input.contractorId, input.draftId);
  if (existing) {
    if (existing.outputType !== input.outputType) throw new Error('DRAFT_LAUNCH_ATTEMPT_OUTPUT_MISMATCH');
    return existing;
  }
  const timestamp = isoNow(dependencies.now);
  return persistAttempt(storage, {
    schemaVersion: 1,
    contractorId: input.contractorId,
    draftId: input.draftId,
    outputType: input.outputType,
    idempotencyKey: generatedUuid(dependencies.randomUUID),
    phase: 'prepared',
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

export function updateDurableDraftLaunchAttemptPhase(
  storage: DurableDraftLaunchAttemptStorage,
  contractorId: string,
  draftId: string,
  phase: Exclude<DurableDraftLaunchAttemptPhase, 'succeeded'>,
  now?: () => Date,
): DurableDraftLaunchAttemptRecord | null {
  const attempt = readDurableDraftLaunchAttempt(storage, contractorId, draftId);
  if (!attempt || attempt.phase === 'succeeded') return attempt;
  return persistAttempt(storage, { ...attempt, phase, updatedAt: isoNow(now) });
}

export function retainAmbiguousDurableDraftLaunchAttempt(
  storage: DurableDraftLaunchAttemptStorage,
  contractorId: string,
  draftId: string,
  now?: () => Date,
) {
  return updateDurableDraftLaunchAttemptPhase(storage, contractorId, draftId, 'ambiguous', now);
}

export function recordDurableDraftLaunchSuccess(
  storage: DurableDraftLaunchAttemptStorage,
  contractorId: string,
  draftId: string,
  result: ContractorWorkDraftLaunchResult,
  now?: () => Date,
): DurableDraftLaunchAttemptRecord {
  const attempt = readDurableDraftLaunchAttempt(storage, contractorId, draftId);
  if (!attempt || attempt.outputType !== result.output_type || result.draft_id !== draftId) {
    throw new Error('DRAFT_LAUNCH_ATTEMPT_RESULT_MISMATCH');
  }
  return persistAttempt(storage, {
    ...attempt,
    phase: 'succeeded',
    updatedAt: isoNow(now),
    launchId: result.launch_id,
    estimateId: result.estimate_id,
    jobId: result.job_id,
    outputIdSnapshot: result.output_id_snapshot,
    outputAvailable: result.output_available,
  });
}

export function clearDurableDraftLaunchAttempt(
  storage: DurableDraftLaunchAttemptStorage,
  contractorId: string,
  draftId: string,
) {
  storage.removeItem(durableDraftLaunchAttemptKey(contractorId, draftId));
}

export function clearDefinitiveFailedDurableDraftLaunchAttempt(
  storage: DurableDraftLaunchAttemptStorage,
  contractorId: string,
  draftId: string,
) {
  const attempt = readDurableDraftLaunchAttempt(storage, contractorId, draftId);
  if (attempt?.phase === 'succeeded' || attempt?.phase === 'ambiguous') return false;
  clearDurableDraftLaunchAttempt(storage, contractorId, draftId);
  return true;
}

export function clearAllDurableDraftLaunchAttempts(storage: DurableDraftLaunchAttemptStorage) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(DURABLE_DRAFT_LAUNCH_ATTEMPT_PREFIX)) keys.push(key);
  }
  keys.forEach(key => storage.removeItem(key));
}
