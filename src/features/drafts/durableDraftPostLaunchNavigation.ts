import type {
  ContractorWorkDraftLaunchOutput,
  ContractorWorkDraftLaunchResult,
} from './durableDraftLaunchTypes';

export type PostLaunchNavigationSource = 'confirmed_create' | 'explicit_retry';

export type PostLaunchNavigationPhase =
  | 'not_eligible'
  | 'waiting_for_canonical'
  | 'loading_output'
  | 'adopting_output'
  | 'navigated'
  | 'navigation_failed'
  | 'cancelled_stale'
  | 'output_unavailable';

export type PostLaunchNavigationEligibility = {
  token: symbol;
  source: PostLaunchNavigationSource;
  contractorId: string;
  outputType: ContractorWorkDraftLaunchOutput;
  targetKey: string;
  editorGeneration: number;
  workspaceGeneration: number;
  clientGeneration: number;
  createdAt: number;
};

export type PostLaunchNavigationIntent = PostLaunchNavigationEligibility & {
  draftId: string;
  outputId: string;
};

export type PostLaunchNavigationState = {
  phase: PostLaunchNavigationPhase;
  eligibility: PostLaunchNavigationEligibility | null;
  intent: PostLaunchNavigationIntent | null;
  message: string;
};

export type PostLaunchNavigationEvent =
  | { type: 'ELIGIBLE'; eligibility: PostLaunchNavigationEligibility }
  | { type: 'CANONICAL_READY'; intent: PostLaunchNavigationIntent }
  | { type: 'START_ADOPTION'; token: symbol }
  | { type: 'NAVIGATED'; token: symbol }
  | { type: 'FAILED'; token: symbol; message: string }
  | { type: 'UNAVAILABLE'; token: symbol; message: string }
  | { type: 'CANCEL_STALE'; token?: symbol }
  | { type: 'RESET' };

export const INITIAL_POST_LAUNCH_NAVIGATION_STATE: PostLaunchNavigationState = {
  phase: 'not_eligible',
  eligibility: null,
  intent: null,
  message: '',
};

export function createPostLaunchNavigationEligibility(input: Omit<PostLaunchNavigationEligibility, 'token' | 'createdAt'> & {
  token?: symbol;
  createdAt?: number;
}): PostLaunchNavigationEligibility {
  return {
    ...input,
    token: input.token ?? Symbol('durable-draft-post-launch-navigation'),
    createdAt: input.createdAt ?? Date.now(),
  };
}

export function resolvePostLaunchNavigationIntent(input: {
  eligibility: PostLaunchNavigationEligibility;
  result: ContractorWorkDraftLaunchResult;
  draftId: string;
  contractorId: string;
  outputType: ContractorWorkDraftLaunchOutput;
  outputId: string | null;
  outputIdSnapshot: string | null;
  outputAvailable: boolean;
}): PostLaunchNavigationIntent | null {
  const { eligibility, result } = input;
  const eligibleResult = eligibility.source === 'confirmed_create'
    ? result.status === 'succeeded' && result.idempotent === false
    : (result.status === 'succeeded' && result.idempotent === true)
      || (result.status === 'already_consumed' && result.idempotent === false);
  if (!eligibleResult
    || !input.outputAvailable
    || !input.outputId
    || !input.outputIdSnapshot
    || input.outputId !== input.outputIdSnapshot
    || result.output_available !== true
    || result.output_id_snapshot !== input.outputId
    || eligibility.contractorId !== input.contractorId
    || eligibility.outputType !== input.outputType
    || result.draft_id !== input.draftId
    || result.output_type !== input.outputType) return null;
  return {
    ...eligibility,
    draftId: input.draftId,
    outputId: input.outputId,
  };
}

export function postLaunchNavigationContextMatches(
  intent: PostLaunchNavigationIntent,
  context: {
    contractorId: string | null;
    targetKey: string | null;
    editorGeneration: number;
    workspaceGeneration: number;
    clientGeneration: number;
    launchEnabled: boolean;
  },
) {
  return context.launchEnabled
    && context.contractorId === intent.contractorId
    && context.targetKey === intent.targetKey
    && context.editorGeneration === intent.editorGeneration
    && context.workspaceGeneration === intent.workspaceGeneration
    && context.clientGeneration === intent.clientGeneration;
}

export function postLaunchNavigationReducer(
  state: PostLaunchNavigationState,
  event: PostLaunchNavigationEvent,
): PostLaunchNavigationState {
  switch (event.type) {
    case 'ELIGIBLE':
      if (state.phase === 'loading_output' || state.phase === 'adopting_output') return state;
      return { phase: 'waiting_for_canonical', eligibility: event.eligibility, intent: null, message: '' };
    case 'CANONICAL_READY':
      if (state.phase !== 'waiting_for_canonical'
        || state.eligibility?.token !== event.intent.token) return state;
      return { phase: 'loading_output', eligibility: state.eligibility, intent: event.intent, message: '' };
    case 'START_ADOPTION':
      return state.phase === 'loading_output' && state.intent?.token === event.token
        ? { ...state, phase: 'adopting_output' }
        : state;
    case 'NAVIGATED':
      return state.phase === 'adopting_output' && state.intent?.token === event.token
        ? { ...state, phase: 'navigated', eligibility: null, intent: null, message: '' }
        : state;
    case 'FAILED':
      return (state.phase === 'loading_output' || state.phase === 'adopting_output') && state.intent?.token === event.token
        ? { ...state, phase: 'navigation_failed', eligibility: null, intent: null, message: event.message }
        : state;
    case 'UNAVAILABLE':
      return (state.phase === 'loading_output' || state.phase === 'adopting_output') && state.intent?.token === event.token
        ? { ...state, phase: 'output_unavailable', eligibility: null, intent: null, message: event.message }
        : state;
    case 'CANCEL_STALE':
      if (event.token && state.intent?.token !== event.token && state.eligibility?.token !== event.token) return state;
      return { phase: 'cancelled_stale', eligibility: null, intent: null, message: '' };
    case 'RESET':
      return INITIAL_POST_LAUNCH_NAVIGATION_STATE;
  }
}
