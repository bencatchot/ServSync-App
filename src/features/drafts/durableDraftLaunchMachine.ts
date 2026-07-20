import type { ContractorWorkDraftLaunchOutput } from './durableDraftLaunchTypes';

export type DurableDraftLaunchPhase =
  | 'idle'
  | 'confirming'
  | 'saving'
  | 'preparing'
  | 'launching'
  | 'validating'
  | 'reconciling_consumed'
  | 'consumed'
  | 'fixable_failure'
  | 'permission_denied'
  | 'ambiguous'
  | 'already_consumed'
  | 'storage_unavailable';

export type DurableDraftLaunchMachineState = {
  phase: DurableDraftLaunchPhase;
  outputType: ContractorWorkDraftLaunchOutput | null;
  operationToken: symbol | null;
  idempotencyKey: string | null;
  message: string;
};

export type DurableDraftLaunchMachineEvent =
  | { type: 'OPEN_CONFIRMATION'; outputType: ContractorWorkDraftLaunchOutput }
  | { type: 'CANCEL_CONFIRMATION' }
  | { type: 'START'; outputType: ContractorWorkDraftLaunchOutput; operationToken: symbol; needsSave: boolean }
  | { type: 'SAVED'; operationToken: symbol }
  | { type: 'ATTEMPT_READY'; operationToken: symbol; idempotencyKey: string }
  | { type: 'RPC_STARTED'; operationToken: symbol }
  | { type: 'RESPONSE_RECEIVED'; operationToken: symbol }
  | { type: 'CONSUMED_PROOF'; operationToken: symbol; alreadyConsumed: boolean }
  | { type: 'RECONCILE_RETRY'; outputType: ContractorWorkDraftLaunchOutput; operationToken: symbol; idempotencyKey: string | null }
  | { type: 'RECONCILE_FAILED'; operationToken: symbol; message: string }
  | { type: 'CONSUMED'; operationToken: symbol }
  | { type: 'FAIL'; operationToken: symbol; phase: Extract<DurableDraftLaunchPhase, 'fixable_failure' | 'permission_denied' | 'ambiguous' | 'storage_unavailable'>; message: string; idempotencyKey?: string | null }
  | { type: 'RECOVER'; outputType: ContractorWorkDraftLaunchOutput; phase: 'preparing' | 'ambiguous' | 'consumed' | 'storage_unavailable'; idempotencyKey?: string | null; message?: string }
  | { type: 'RESET' };

export const INITIAL_DURABLE_DRAFT_LAUNCH_STATE: DurableDraftLaunchMachineState = {
  phase: 'idle',
  outputType: null,
  operationToken: null,
  idempotencyKey: null,
  message: '',
};

function owned(state: DurableDraftLaunchMachineState, operationToken: symbol) {
  return state.operationToken === operationToken;
}

export function durableDraftLaunchReducer(
  state: DurableDraftLaunchMachineState,
  event: DurableDraftLaunchMachineEvent,
): DurableDraftLaunchMachineState {
  switch (event.type) {
    case 'OPEN_CONFIRMATION':
      if (state.operationToken) return state;
      return { ...INITIAL_DURABLE_DRAFT_LAUNCH_STATE, phase: 'confirming', outputType: event.outputType };
    case 'CANCEL_CONFIRMATION':
      return state.phase === 'confirming' ? INITIAL_DURABLE_DRAFT_LAUNCH_STATE : state;
    case 'START':
      if (state.operationToken) return state;
      return {
        phase: event.needsSave ? 'saving' : 'preparing',
        outputType: event.outputType,
        operationToken: event.operationToken,
        idempotencyKey: state.idempotencyKey,
        message: '',
      };
    case 'SAVED':
      return owned(state, event.operationToken) ? { ...state, phase: 'preparing' } : state;
    case 'ATTEMPT_READY':
      return owned(state, event.operationToken)
        ? { ...state, phase: 'preparing', idempotencyKey: event.idempotencyKey }
        : state;
    case 'RPC_STARTED':
      return owned(state, event.operationToken) ? { ...state, phase: 'launching' } : state;
    case 'RESPONSE_RECEIVED':
      return owned(state, event.operationToken) ? { ...state, phase: 'validating' } : state;
    case 'CONSUMED_PROOF':
      return owned(state, event.operationToken)
        ? { ...state, phase: event.alreadyConsumed ? 'already_consumed' : 'reconciling_consumed' }
        : state;
    case 'RECONCILE_RETRY':
      if (state.operationToken) return state;
      return {
        phase: 'reconciling_consumed',
        outputType: event.outputType,
        operationToken: event.operationToken,
        idempotencyKey: event.idempotencyKey,
        message: '',
      };
    case 'RECONCILE_FAILED':
      return owned(state, event.operationToken)
        ? { ...state, phase: 'reconciling_consumed', operationToken: null, message: event.message }
        : state;
    case 'CONSUMED':
      return owned(state, event.operationToken)
        ? { ...state, phase: 'consumed', operationToken: null, message: '' }
        : state;
    case 'FAIL':
      return owned(state, event.operationToken)
        ? {
            ...state,
            phase: event.phase,
            operationToken: null,
            idempotencyKey: event.idempotencyKey === undefined ? state.idempotencyKey : event.idempotencyKey,
            message: event.message,
          }
        : state;
    case 'RECOVER':
      if (state.operationToken) return state;
      return {
        phase: event.phase,
        outputType: event.outputType,
        operationToken: null,
        idempotencyKey: event.idempotencyKey ?? null,
        message: event.message ?? '',
      };
    case 'RESET':
      return INITIAL_DURABLE_DRAFT_LAUNCH_STATE;
  }
}

export function durableDraftLaunchIsBusy(state: DurableDraftLaunchMachineState) {
  return state.operationToken !== null;
}

export function durableDraftLaunchAllowsEditing(state: DurableDraftLaunchMachineState) {
  return !durableDraftLaunchIsBusy(state)
    && state.phase !== 'ambiguous'
    && state.phase !== 'preparing'
    && state.phase !== 'reconciling_consumed'
    && state.phase !== 'already_consumed'
    && state.phase !== 'consumed';
}

export function durableDraftLaunchCanRetry(state: DurableDraftLaunchMachineState) {
  return state.phase === 'ambiguous' && Boolean(state.outputType && state.idempotencyKey);
}
