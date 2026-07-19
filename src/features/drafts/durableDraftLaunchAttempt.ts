import {
  isDurableDraftTimestamp,
  isDurableDraftUuid,
  parseContractorWorkDraftLaunchResult,
} from './durableDraftLaunchApi';
import type {
  ContractorWorkDraftLaunchOutput,
  ContractorWorkDraftLaunchResult,
  DurableDraftLaunchAttemptClearAllResult,
  DurableDraftLaunchAttemptClearResult,
  DurableDraftLaunchAttemptPhase,
  DurableDraftLaunchAttemptReadResult,
  DurableDraftLaunchAttemptRecord,
  DurableDraftLaunchAttemptWriteResult,
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
  const value = generator();
  if (!isDurableDraftUuid(value)) throw new Error('DRAFT_IDEMPOTENCY_UUID_INVALID');
  return value;
}

export function durableDraftLaunchAttemptKey(contractorId: string, draftId: string) {
  return `${DURABLE_DRAFT_LAUNCH_ATTEMPT_PREFIX}${contractorId}:${draftId}`;
}

function isLaunchAttemptPhase(value: unknown): value is DurableDraftLaunchAttemptPhase {
  return value === 'prepared' || value === 'launching' || value === 'succeeded' || value === 'ambiguous';
}

function optionalNullableUuid(value: unknown) {
  return value === undefined || value === null || isDurableDraftUuid(value);
}

function parseAttempt(value: string | null): DurableDraftLaunchAttemptRecord | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    if (record.schemaVersion !== 1
      || !isDurableDraftUuid(record.contractorId)
      || !isDurableDraftUuid(record.draftId)
      || (record.outputType !== 'estimate' && record.outputType !== 'job')
      || !isDurableDraftUuid(record.idempotencyKey)
      || !isLaunchAttemptPhase(record.phase)
      || !isDurableDraftTimestamp(record.createdAt)
      || !isDurableDraftTimestamp(record.updatedAt)
      || Date.parse(record.updatedAt) < Date.parse(record.createdAt)
      || !optionalNullableUuid(record.launchId)
      || !optionalNullableUuid(record.estimateId)
      || !optionalNullableUuid(record.jobId)
      || !optionalNullableUuid(record.outputIdSnapshot)
      || (record.outputAvailable !== undefined && typeof record.outputAvailable !== 'boolean')) return null;

    const successFieldsPresent = record.launchId !== undefined
      || record.estimateId !== undefined
      || record.jobId !== undefined
      || record.outputIdSnapshot !== undefined
      || record.outputAvailable !== undefined;
    if (record.phase !== 'succeeded' && successFieldsPresent) return null;
    if (record.phase === 'succeeded') {
      if (record.launchId === undefined
        || record.estimateId === undefined
        || record.jobId === undefined
        || !isDurableDraftUuid(record.outputIdSnapshot)
        || typeof record.outputAvailable !== 'boolean') return null;
      const liveId = record.outputType === 'estimate' ? record.estimateId : record.jobId;
      const wrongId = record.outputType === 'estimate' ? record.jobId : record.estimateId;
      if (wrongId !== null || (liveId !== null && !isDurableDraftUuid(liveId))) return null;
      if (record.outputAvailable !== (liveId !== null)) return null;
      if (liveId !== null && liveId !== record.outputIdSnapshot) return null;
    }

    return {
      schemaVersion: 1,
      contractorId: record.contractorId,
      draftId: record.draftId,
      outputType: record.outputType,
      idempotencyKey: record.idempotencyKey,
      phase: record.phase,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      ...(record.launchId !== undefined ? { launchId: record.launchId as string | null } : {}),
      ...(record.estimateId !== undefined ? { estimateId: record.estimateId as string | null } : {}),
      ...(record.jobId !== undefined ? { jobId: record.jobId as string | null } : {}),
      ...(record.outputIdSnapshot !== undefined ? { outputIdSnapshot: record.outputIdSnapshot as string } : {}),
      ...(record.outputAvailable !== undefined ? { outputAvailable: record.outputAvailable } : {}),
    };
  } catch {
    return null;
  }
}

function safeRecord(attempt: DurableDraftLaunchAttemptRecord): DurableDraftLaunchAttemptRecord {
  return {
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
}

function persistAttempt(
  storage: DurableDraftLaunchAttemptStorage,
  attempt: DurableDraftLaunchAttemptRecord,
): DurableDraftLaunchAttemptWriteResult {
  const candidate = safeRecord(attempt);
  const serialized = JSON.stringify(candidate);
  const key = durableDraftLaunchAttemptKey(candidate.contractorId, candidate.draftId);
  try {
    storage.setItem(key, serialized);
  } catch {
    return { status: 'unavailable', operation: 'write' };
  }
  try {
    const verified = parseAttempt(storage.getItem(key));
    if (!verified || JSON.stringify(verified) !== serialized) {
      return { status: 'unavailable', operation: 'verify' };
    }
    return { status: 'success', attempt: verified };
  } catch {
    return { status: 'unavailable', operation: 'verify' };
  }
}

export function readDurableDraftLaunchAttempt(
  storage: DurableDraftLaunchAttemptStorage,
  contractorId: string,
  draftId: string,
): DurableDraftLaunchAttemptReadResult {
  let value: string | null;
  try {
    value = storage.getItem(durableDraftLaunchAttemptKey(contractorId, draftId));
  } catch {
    return { status: 'unavailable', operation: 'read' };
  }
  if (value === null) return { status: 'absent' };
  const attempt = parseAttempt(value);
  if (!attempt || attempt.contractorId !== contractorId || attempt.draftId !== draftId) return { status: 'invalid' };
  return { status: 'found', attempt };
}

export function createDurableDraftLaunchAttempt(
  storage: DurableDraftLaunchAttemptStorage,
  input: CreateDurableDraftLaunchAttemptInput,
  dependencies: LaunchAttemptDependencies = {},
): DurableDraftLaunchAttemptWriteResult {
  if (!isDurableDraftUuid(input.contractorId) || !isDurableDraftUuid(input.draftId)) {
    throw new Error('DRAFT_LAUNCH_ATTEMPT_ID_INVALID');
  }
  const existing = readDurableDraftLaunchAttempt(storage, input.contractorId, input.draftId);
  if (existing.status === 'unavailable') return existing;
  if (existing.status === 'found') {
    if (existing.attempt.outputType !== input.outputType) throw new Error('DRAFT_LAUNCH_ATTEMPT_OUTPUT_MISMATCH');
    return { status: 'success', attempt: existing.attempt };
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
): DurableDraftLaunchAttemptWriteResult {
  const result = readDurableDraftLaunchAttempt(storage, contractorId, draftId);
  if (result.status === 'unavailable') return result;
  if (result.status !== 'found') return { status: 'unavailable', operation: 'verify' };
  if (result.attempt.phase === 'succeeded') return { status: 'success', attempt: result.attempt };
  return persistAttempt(storage, { ...result.attempt, phase, updatedAt: isoNow(now) });
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
): DurableDraftLaunchAttemptWriteResult {
  const canonicalResult = parseContractorWorkDraftLaunchResult(result);
  if (!canonicalResult) throw new Error('DRAFT_LAUNCH_ATTEMPT_RESULT_INVALID');
  const readResult = readDurableDraftLaunchAttempt(storage, contractorId, draftId);
  if (readResult.status === 'unavailable') return readResult;
  if (readResult.status !== 'found'
    || readResult.attempt.outputType !== canonicalResult.output_type
    || canonicalResult.draft_id !== draftId) throw new Error('DRAFT_LAUNCH_ATTEMPT_RESULT_MISMATCH');
  return persistAttempt(storage, {
    ...readResult.attempt,
    phase: 'succeeded',
    updatedAt: isoNow(now),
    launchId: canonicalResult.launch_id,
    estimateId: canonicalResult.estimate_id,
    jobId: canonicalResult.job_id,
    outputIdSnapshot: canonicalResult.output_id_snapshot,
    outputAvailable: canonicalResult.output_available,
  });
}

export function clearDurableDraftLaunchAttempt(
  storage: DurableDraftLaunchAttemptStorage,
  contractorId: string,
  draftId: string,
): DurableDraftLaunchAttemptClearResult {
  try {
    storage.removeItem(durableDraftLaunchAttemptKey(contractorId, draftId));
    return { status: 'success', removed: true };
  } catch {
    return { status: 'unavailable', operation: 'remove' };
  }
}

export function clearDefinitiveFailedDurableDraftLaunchAttempt(
  storage: DurableDraftLaunchAttemptStorage,
  contractorId: string,
  draftId: string,
): DurableDraftLaunchAttemptClearResult {
  const result = readDurableDraftLaunchAttempt(storage, contractorId, draftId);
  if (result.status === 'unavailable') return result;
  if (result.status === 'found' && (result.attempt.phase === 'succeeded' || result.attempt.phase === 'ambiguous')) {
    return { status: 'success', removed: false };
  }
  if (result.status === 'absent') return { status: 'success', removed: false };
  return clearDurableDraftLaunchAttempt(storage, contractorId, draftId);
}

export function clearAllDurableDraftLaunchAttempts(
  storage: DurableDraftLaunchAttemptStorage,
): DurableDraftLaunchAttemptClearAllResult {
  const keys: string[] = [];
  try {
    const length = storage.length;
    for (let index = 0; index < length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(DURABLE_DRAFT_LAUNCH_ATTEMPT_PREFIX)) keys.push(key);
    }
  } catch {
    return { status: 'unavailable', operation: 'enumerate', removedCount: 0, failedCount: 0 };
  }
  let removedCount = 0;
  let failedCount = 0;
  keys.forEach(key => {
    try {
      storage.removeItem(key);
      removedCount += 1;
    } catch {
      failedCount += 1;
    }
  });
  return failedCount
    ? { status: 'partial', removedCount, failedCount }
    : { status: 'success', removedCount, failedCount: 0 };
}
