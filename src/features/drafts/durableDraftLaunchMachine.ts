import type {
  ContractorWorkDraftLaunchOutput,
  ContractorWorkDraftLaunchResult,
} from './durableDraftLaunchTypes';

export type DurableDraftLaunchPhase =
  | 'idle'
  | 'confirming'
  | 'saving'
  | 'preparing'
  | 'launching'
  | 'validating'
  | 'reconciling_consumed'
  | 'reconciling_lifecycle'
  | 'reconciliation_failed'
  | 'lifecycle_unavailable'
  | 'consumed'
  | 'discarded'
  | 'fixable_failure'
  | 'permission_denied'
  | 'ambiguous'
  | 'already_consumed'
  | 'storage_unavailable';

export type DurableDraftLaunchMachineState = {
  phase: DurableDraftLaunchPhase;
  outputType: ContractorWorkDraftLaunchOutput | null;
  operationToken: symbol | null;
  draftId: string | null;
  idempotencyKey: string | null;
  consumedProof: ContractorWorkDraftLaunchResult | null;
  recoveryLocked: boolean;
  message: string;
};

type FailurePhase = Extract<DurableDraftLaunchPhase,
  'fixable_failure' | 'permission_denied' | 'ambiguous' | 'storage_unavailable'>;

export type DurableDraftLaunchMachineEvent =
  | { type: 'OPEN_CONFIRMATION'; outputType: ContractorWorkDraftLaunchOutput }
  | { type: 'CANCEL_CONFIRMATION' }
  | { type: 'START'; outputType: ContractorWorkDraftLaunchOutput; operationToken: symbol; draftId: string | null; needsSave: boolean }
  | { type: 'SAVED'; operationToken: symbol; draftId: string }
  | { type: 'ATTEMPT_READY'; operationToken: symbol; draftId: string; idempotencyKey: string }
  | { type: 'RPC_STARTED'; operationToken: symbol }
  | { type: 'RESPONSE_RECEIVED'; operationToken: symbol }
  | { type: 'CONSUMED_PROOF'; operationToken: symbol; result: ContractorWorkDraftLaunchResult }
  | { type: 'BEGIN_LIFECYCLE_RECONCILIATION'; operationToken: symbol; draftId: string; message: string }
  | { type: 'LIFECYCLE_RESOLVED'; operationToken: symbol; status: 'consumed' | 'discarded' }
  | { type: 'LIFECYCLE_UNAVAILABLE'; operationToken: symbol; message: string }
  | { type: 'RECONCILE_RETRY'; outputType: ContractorWorkDraftLaunchOutput; operationToken: symbol; draftId: string; idempotencyKey: string | null; consumedProof?: ContractorWorkDraftLaunchResult | null; lifecycle?: boolean }
  | { type: 'RECONCILE_FAILED'; operationToken: symbol; message: string }
  | { type: 'CONSUMED'; operationToken: symbol; draftId: string; outputType: ContractorWorkDraftLaunchOutput }
  | { type: 'FAIL'; operationToken: symbol; phase: FailurePhase; message: string; idempotencyKey?: string | null; recoveryLocked?: boolean }
  | { type: 'RECOVER'; outputType: ContractorWorkDraftLaunchOutput; phase: 'preparing' | 'ambiguous' | 'storage_unavailable'; draftId?: string | null; idempotencyKey?: string | null; message?: string; recoveryLocked?: boolean }
  | { type: 'RECOVERY_CONFLICT'; outputType: ContractorWorkDraftLaunchOutput; draftId: string; idempotencyKey: string; message: string }
  | { type: 'EXTERNAL_ATTEMPT'; outputType: ContractorWorkDraftLaunchOutput; phase: 'preparing' | 'launching' | 'ambiguous'; draftId: string; idempotencyKey: string; message: string }
  | { type: 'EXTERNAL_SUCCEEDED'; outputType: ContractorWorkDraftLaunchOutput; operationToken: symbol; draftId: string; idempotencyKey: string; result: ContractorWorkDraftLaunchResult }
  | { type: 'STORAGE_INCONSISTENT'; outputType: ContractorWorkDraftLaunchOutput; message: string; idempotencyKey?: string | null; recoveryLocked: boolean }
  | { type: 'RESET' };

export type DurableDraftLaunchTransitionDecision = {
  accepted: boolean;
  nextState: DurableDraftLaunchMachineState;
  ownershipEffect: 'preserve' | 'invalidate';
};

export const INITIAL_DURABLE_DRAFT_LAUNCH_STATE: DurableDraftLaunchMachineState = {
  phase: 'idle',
  outputType: null,
  operationToken: null,
  draftId: null,
  idempotencyKey: null,
  consumedProof: null,
  recoveryLocked: false,
  message: '',
};

function owned(state: DurableDraftLaunchMachineState, operationToken: symbol) {
  return state.operationToken === operationToken;
}

function sameResultIdentity(state: DurableDraftLaunchMachineState, result: ContractorWorkDraftLaunchResult) {
  return Boolean(state.draftId
    && state.outputType
    && state.draftId === result.draft_id
    && state.outputType === result.output_type
    && result.output_id_snapshot);
}

const TERMINAL_PHASES = new Set<DurableDraftLaunchPhase>(['consumed', 'discarded']);
const RECONCILIATION_LOCK_PHASES = new Set<DurableDraftLaunchPhase>([
  'validating',
  'reconciling_consumed',
  'already_consumed',
  'reconciling_lifecycle',
  'reconciliation_failed',
  'lifecycle_unavailable',
]);

function externalAttemptMatches(
  state: DurableDraftLaunchMachineState,
  event: Extract<DurableDraftLaunchMachineEvent, { type: 'EXTERNAL_ATTEMPT' }>,
) {
  return (!state.draftId || state.draftId === event.draftId)
    && (!state.outputType || state.outputType === event.outputType)
    && (!state.idempotencyKey || state.idempotencyKey === event.idempotencyKey);
}

function applyExternalAttempt(
  state: DurableDraftLaunchMachineState,
  event: Extract<DurableDraftLaunchMachineEvent, { type: 'EXTERNAL_ATTEMPT' }>,
): DurableDraftLaunchMachineState {
  if (TERMINAL_PHASES.has(state.phase)
    || RECONCILIATION_LOCK_PHASES.has(state.phase)
    || state.operationToken
    || !externalAttemptMatches(state, event)) return state;

  if (event.phase === 'preparing') {
    const acceptsPrepared = state.phase === 'idle'
      || state.phase === 'confirming'
      || state.phase === 'fixable_failure'
      || state.phase === 'storage_unavailable'
      || state.phase === 'preparing';
    if (!acceptsPrepared || state.phase === 'ambiguous' || state.phase === 'permission_denied') return state;
    return {
      ...INITIAL_DURABLE_DRAFT_LAUNCH_STATE,
      phase: 'preparing',
      outputType: event.outputType,
      draftId: event.draftId,
      idempotencyKey: event.idempotencyKey,
      recoveryLocked: true,
      message: event.message,
    };
  }

  const acceptsUncertain = state.phase === 'idle'
    || state.phase === 'confirming'
    || state.phase === 'fixable_failure'
    || state.phase === 'permission_denied'
    || state.phase === 'storage_unavailable'
    || state.phase === 'preparing'
    || state.phase === 'ambiguous';
  if (!acceptsUncertain) return state;
  return {
    ...INITIAL_DURABLE_DRAFT_LAUNCH_STATE,
    phase: 'ambiguous',
    outputType: event.outputType,
    draftId: event.draftId,
    idempotencyKey: event.idempotencyKey,
    recoveryLocked: true,
    message: event.message,
  };
}

export function durableDraftLaunchReducer(
  state: DurableDraftLaunchMachineState,
  event: DurableDraftLaunchMachineEvent,
): DurableDraftLaunchMachineState {
  switch (event.type) {
    case 'OPEN_CONFIRMATION':
      if ((state.phase === 'ambiguous' || state.phase === 'preparing')
        && state.outputType === event.outputType
        && state.draftId
        && state.idempotencyKey) {
        return { ...state, phase: 'confirming', operationToken: null, message: '' };
      }
      if (state.phase !== 'idle' && state.phase !== 'fixable_failure' && state.phase !== 'permission_denied' && state.phase !== 'storage_unavailable') return state;
      if (state.recoveryLocked || state.idempotencyKey) return state;
      return { ...INITIAL_DURABLE_DRAFT_LAUNCH_STATE, phase: 'confirming', outputType: event.outputType };
    case 'CANCEL_CONFIRMATION':
      if (state.phase !== 'confirming') return state;
      return state.idempotencyKey
        ? { ...state, phase: 'ambiguous', operationToken: null, recoveryLocked: true, message: 'ServSync could not confirm whether the output was created.' }
        : INITIAL_DURABLE_DRAFT_LAUNCH_STATE;
    case 'START':
      if (state.phase !== 'confirming' || state.operationToken || state.outputType !== event.outputType || (!event.needsSave && !event.draftId)) return state;
      return {
        ...state,
        phase: event.needsSave ? 'saving' : 'preparing',
        outputType: event.outputType,
        operationToken: event.operationToken,
        draftId: event.draftId ?? state.draftId,
        recoveryLocked: true,
        message: '',
      };
    case 'SAVED':
      return owned(state, event.operationToken) && state.phase === 'saving' && Boolean(event.draftId)
        ? { ...state, phase: 'preparing', draftId: event.draftId }
        : state;
    case 'ATTEMPT_READY':
      return owned(state, event.operationToken)
        && state.phase === 'preparing'
        && state.draftId === event.draftId
        && (!state.idempotencyKey || state.idempotencyKey === event.idempotencyKey)
        && Boolean(event.idempotencyKey)
        ? { ...state, idempotencyKey: event.idempotencyKey, recoveryLocked: true }
        : state;
    case 'RPC_STARTED':
      return owned(state, event.operationToken)
        && state.phase === 'preparing'
        && Boolean(state.draftId && state.outputType && state.idempotencyKey)
        ? { ...state, phase: 'launching', recoveryLocked: true }
        : state;
    case 'RESPONSE_RECEIVED':
      return owned(state, event.operationToken) && state.phase === 'launching'
        ? { ...state, phase: 'validating' }
        : state;
    case 'CONSUMED_PROOF':
      return owned(state, event.operationToken)
        && state.phase === 'validating'
        && sameResultIdentity(state, event.result)
        ? {
            ...state,
            phase: event.result.status === 'already_consumed' ? 'already_consumed' : 'reconciling_consumed',
            consumedProof: event.result,
            recoveryLocked: true,
          }
        : state;
    case 'BEGIN_LIFECYCLE_RECONCILIATION':
      return owned(state, event.operationToken)
        && (state.phase === 'saving' || state.phase === 'preparing' || state.phase === 'launching' || state.phase === 'validating')
        && state.draftId === event.draftId
        ? { ...state, phase: 'reconciling_lifecycle', recoveryLocked: true, message: event.message }
        : state;
    case 'LIFECYCLE_RESOLVED':
      return owned(state, event.operationToken) && state.phase === 'reconciling_lifecycle'
        ? { ...state, phase: event.status, operationToken: null, recoveryLocked: true, message: '' }
        : state;
    case 'LIFECYCLE_UNAVAILABLE':
      return owned(state, event.operationToken) && state.phase === 'reconciling_lifecycle'
        ? { ...state, phase: 'lifecycle_unavailable', operationToken: null, recoveryLocked: true, message: event.message }
        : state;
    case 'RECONCILE_RETRY':
      if (state.operationToken || !event.draftId) return state;
      if (event.lifecycle) {
        if (state.phase !== 'lifecycle_unavailable' && state.phase !== 'reconciliation_failed') return state;
        return { ...state, phase: 'reconciling_lifecycle', operationToken: event.operationToken, draftId: event.draftId, recoveryLocked: true, message: '' };
      }
      if (state.phase !== 'reconciliation_failed' && state.phase !== 'consumed' && state.phase !== 'already_consumed' && state.phase !== 'ambiguous') return state;
      return {
        ...state,
        phase: 'reconciling_consumed',
        outputType: event.outputType,
        operationToken: event.operationToken,
        draftId: event.draftId,
        idempotencyKey: event.idempotencyKey,
        consumedProof: event.consumedProof ?? state.consumedProof,
        recoveryLocked: true,
        message: '',
      };
    case 'RECONCILE_FAILED':
      return owned(state, event.operationToken)
        && (state.phase === 'reconciling_consumed' || state.phase === 'already_consumed')
        ? { ...state, phase: 'reconciliation_failed', operationToken: null, recoveryLocked: true, message: event.message }
        : state;
    case 'CONSUMED':
      return owned(state, event.operationToken)
        && (state.phase === 'reconciling_consumed' || state.phase === 'already_consumed')
        && state.draftId === event.draftId
        && state.outputType === event.outputType
        && Boolean(state.consumedProof)
        ? { ...state, phase: 'consumed', operationToken: null, recoveryLocked: true, message: '' }
        : state;
    case 'FAIL': {
      if (!owned(state, event.operationToken)) return state;
      const ambiguous = event.phase === 'ambiguous';
      if (ambiguous && (!state.draftId || !state.outputType || !(event.idempotencyKey ?? state.idempotencyKey))) return state;
      return {
        ...state,
        phase: event.phase,
        operationToken: null,
        idempotencyKey: event.idempotencyKey === undefined ? state.idempotencyKey : event.idempotencyKey,
        recoveryLocked: event.recoveryLocked ?? ambiguous,
        message: event.message,
      };
    }
    case 'RECOVER':
      if (state.operationToken || state.phase === 'consumed' || state.phase === 'discarded') return state;
      if ((event.phase === 'preparing' || event.phase === 'ambiguous') && (!event.draftId || !event.idempotencyKey)) return state;
      return {
        ...INITIAL_DURABLE_DRAFT_LAUNCH_STATE,
        phase: event.phase,
        outputType: event.outputType,
        draftId: event.draftId ?? null,
        idempotencyKey: event.idempotencyKey ?? null,
        recoveryLocked: event.recoveryLocked ?? (event.phase === 'preparing' || event.phase === 'ambiguous'),
        message: event.message ?? '',
      };
    case 'RECOVERY_CONFLICT':
      if (TERMINAL_PHASES.has(state.phase) || state.operationToken) return state;
      return {
        ...state,
        phase: 'lifecycle_unavailable',
        operationToken: null,
        outputType: event.outputType,
        draftId: event.draftId,
        idempotencyKey: event.idempotencyKey,
        recoveryLocked: true,
        message: event.message,
      };
    case 'EXTERNAL_ATTEMPT':
      return applyExternalAttempt(state, event);
    case 'EXTERNAL_SUCCEEDED':
      if (state.phase === 'consumed' || state.phase === 'discarded') return state;
      if (event.result.draft_id !== event.draftId || event.result.output_type !== event.outputType || !event.result.output_id_snapshot) return state;
      return {
        ...INITIAL_DURABLE_DRAFT_LAUNCH_STATE,
        phase: 'reconciling_consumed',
        outputType: event.outputType,
        operationToken: event.operationToken,
        draftId: event.draftId,
        idempotencyKey: event.idempotencyKey,
        consumedProof: event.result,
        recoveryLocked: true,
      };
    case 'STORAGE_INCONSISTENT':
      if (state.phase === 'consumed' || state.phase === 'discarded') return state;
      return {
        ...state,
        phase: 'storage_unavailable',
        operationToken: null,
        outputType: event.outputType,
        idempotencyKey: event.idempotencyKey === undefined ? state.idempotencyKey : event.idempotencyKey,
        recoveryLocked: event.recoveryLocked,
        message: event.message,
      };
    case 'RESET':
      return INITIAL_DURABLE_DRAFT_LAUNCH_STATE;
  }
}

export function decideDurableDraftLaunchTransition(
  state: DurableDraftLaunchMachineState,
  event: DurableDraftLaunchMachineEvent,
): DurableDraftLaunchTransitionDecision {
  const nextState = durableDraftLaunchReducer(state, event);
  const accepted = nextState !== state;
  return {
    accepted,
    nextState,
    ownershipEffect: accepted && (event.type === 'EXTERNAL_ATTEMPT' || event.type === 'EXTERNAL_SUCCEEDED')
      ? 'invalidate'
      : 'preserve',
  };
}

export function durableDraftLaunchIsBusy(state: DurableDraftLaunchMachineState) {
  return state.operationToken !== null;
}

export function durableDraftLaunchAllowsEditing(state: DurableDraftLaunchMachineState) {
  if (state.recoveryLocked || durableDraftLaunchIsBusy(state)) return false;
  return state.phase === 'idle'
    || state.phase === 'confirming'
    || state.phase === 'fixable_failure'
    || state.phase === 'permission_denied'
    || state.phase === 'storage_unavailable';
}

export function durableDraftLaunchCanRetry(state: DurableDraftLaunchMachineState) {
  return state.phase === 'ambiguous' && Boolean(state.draftId && state.outputType && state.idempotencyKey);
}
