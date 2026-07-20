import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { ArrowRight, FileText, Loader2, Plus } from 'lucide-react';
import type { Estimate, Inspection } from '../../types';
import type { DraftJobCustomerOption } from '../jobs/DraftJobComposer';
import { draftJobOptionsWithSavedSelection } from '../jobs/draftJobMappings';
import { isComposerDraftJob } from '../jobs/jobRecordSelectors';
import { ContractorDraftComposer } from './ContractorDraftComposer';
import {
  getContractorWorkDraft,
  importLegacyContractorWorkDraft,
  launchContractorWorkDraft,
  listContractorWorkDrafts,
  normalizeDurableDraftError,
  saveContractorWorkDraft,
  DurableDraftError,
  type DurableDraftSupabaseClient,
} from './durableDraftLaunchApi';
import type {
  ContractorWorkDraftLaunchOutput,
  ContractorWorkDraftLaunchResult,
  DurableDraftCompatibilityCapabilities,
  DurableDraftLaunchAttemptRecord,
} from './durableDraftLaunchTypes';
import {
  durableDraftListRowsToPresentation,
  reconcileCanonicalSaveResponse,
  type DurableDraftCanonicalState,
  type DurableDraftListPresentation,
} from './durableDraftMappings';
import {
  canonicalStateFromEnvelope,
  durableCanonicalStateToComposer,
  durableDraftSafeMessage,
  legacyDraftsWithoutDurableMatches,
  prepareDurableDraftSave,
  type DurableDraftOpenTarget,
} from './durableDraftComposerIntegration';
import { validateSharedDraftComposerDraftForSave } from './draftComposerMappings';
import type { SharedDraftComposerDraft } from './draftComposerTypes';
import { DurableDraftLaunchConfirmation } from './DurableDraftLaunchConfirmation';
import {
  clearDefinitiveFailedDurableDraftLaunchAttempt,
  createDurableDraftLaunchAttempt,
  durableDraftLaunchAttemptKey,
  readDurableDraftLaunchAttempt,
  recordDurableDraftLaunchSuccess,
  retainAmbiguousDurableDraftLaunchAttempt,
  updateDurableDraftLaunchAttemptPhase,
  type DurableDraftLaunchAttemptStorage,
} from './durableDraftLaunchAttempt';
import {
  durableDraftLaunchAllowsEditing,
  durableDraftLaunchCanRetry,
  durableDraftLaunchIsBusy,
  durableDraftLaunchReducer,
  decideDurableDraftLaunchTransition,
  INITIAL_DURABLE_DRAFT_LAUNCH_STATE,
  type DurableDraftLaunchMachineEvent,
} from './durableDraftLaunchMachine';
import {
  classifyDurableDraftLaunchFailure,
  durableDraftStorageUnavailableCopy,
} from './durableDraftLaunchErrorCopy';
import {
  createPostLaunchNavigationEligibility,
  INITIAL_POST_LAUNCH_NAVIGATION_STATE,
  postLaunchNavigationContextMatches,
  postLaunchNavigationReducer,
  resolvePostLaunchNavigationIntent,
  type PostLaunchNavigationEligibility,
  type PostLaunchNavigationIntent,
  type PostLaunchNavigationSource,
} from './durableDraftPostLaunchNavigation';
import { validateDurableDraftLoadedOutput } from './durableDraftOutputValidation';

type DurableDraftWorkspaceProps = {
  client: DurableDraftSupabaseClient;
  mode: 'list' | 'editor';
  capabilities: DurableDraftCompatibilityCapabilities;
  capabilityLoading?: boolean;
  capabilityError?: string;
  target?: DurableDraftOpenTarget | null;
  legacyDrafts: Inspection[];
  connectedOptions: DraftJobCustomerOption[];
  localOptions: DraftJobCustomerOption[];
  customerLabel: (draft: Inspection) => string;
  propertyLabel: (draft: Inspection) => string;
  onStartNew: () => void;
  onOpenTarget: (target: DurableDraftOpenTarget) => void;
  onBack: () => void;
  launchEnabled: boolean;
  onRefreshCapabilities: () => Promise<DurableDraftCompatibilityCapabilities>;
  onLoadOutput: (type: 'estimate' | 'job', id: string) => Promise<DurableDraftLoadedOutput>;
  onAdoptOutput: (output: DurableDraftLoadedOutput, focusToken: symbol) => void;
};

type DurableDraftLaunchOperation = {
  token: symbol;
  client: DurableDraftSupabaseClient;
  contractorId: string;
  draftId: string | null;
  targetKey: string | null;
  outputType: ContractorWorkDraftLaunchOutput;
  editorGeneration: number;
  rpcStarted: boolean;
  idempotencyKey: string | null;
  navigationSource: PostLaunchNavigationSource | null;
  navigationEligibilityToken: symbol | null;
};

type DurableDraftOutputOperation = {
  key: string;
  token: symbol;
  source: 'automatic' | 'manual';
  intentToken: symbol | null;
  client: DurableDraftSupabaseClient;
  mode: 'list' | 'editor';
  contractorId: string;
  draftId: string;
  target: DurableDraftOpenTarget | null;
  targetKey: string | null;
  outputType: ContractorWorkDraftLaunchOutput;
  outputId: string;
  editorGeneration: number;
  workspaceGeneration: number;
  clientGeneration: number;
};

export type DurableDraftLoadedOutput =
  | { type: 'estimate'; id: string; record: Estimate }
  | { type: 'job'; id: string; record: Inspection };

function formatDraftTime(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function outputLabel(draft: DurableDraftListPresentation) {
  return draft.launchedOutputType === 'estimate' ? 'Estimate' : draft.launchedOutputType === 'job' ? 'Job' : 'Output';
}

function openTargetKey(target: DurableDraftOpenTarget | null) {
  if (!target) return null;
  if (target.kind === 'new') return `new:${target.initialDraft.line_items.map(item => item.id).join(',')}`;
  return `${target.kind}:${target.kind === 'durable' ? target.draftId : target.inspectionId}`;
}

function browserLaunchAttemptStorage(): DurableDraftLaunchAttemptStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function launchCapability(capabilities: DurableDraftCompatibilityCapabilities, outputType: ContractorWorkDraftLaunchOutput) {
  return outputType === 'estimate' ? capabilities.canLaunchEstimate : capabilities.canLaunchJob;
}

function outputLoadWasNotFound(error: unknown) {
  if (!error || typeof error !== 'object') return error instanceof Error && /not found/i.test(error.message);
  const value = error as { code?: unknown; status?: unknown; message?: unknown };
  return value.code === 'PGRST116'
    || value.status === 404
    || (typeof value.message === 'string' && /not found|no rows/i.test(value.message));
}

function validateDraftForLaunch(form: SharedDraftComposerDraft, canonical: DurableDraftCanonicalState | null) {
  const saveValidation = validateSharedDraftComposerDraftForSave(form);
  if (saveValidation) return saveValidation;
  if (!form.intended_output) return 'Choose Estimate or Job before creating work from this Draft.';
  if (!form.line_items.length) return 'Add at least one work item before creating work from this Draft.';
  if (canonical && canonical.draft.status !== 'active') return 'This Draft is read-only and can no longer create work.';
  const persistedIds = form.line_items.flatMap(item => item.job_work_item_id ? [item.job_work_item_id] : []);
  if (new Set(persistedIds).size !== persistedIds.length) return 'This Draft contains duplicate saved work items. Refresh before trying again.';
  return '';
}

function canonicalListPresentation(state: DurableDraftCanonicalState): DurableDraftListPresentation {
  const { draft } = state;
  if (!draft.draftId || !draft.contractorId || !draft.createdAt || !draft.updatedAt) {
    throw normalizeDurableDraftError({ message: 'DRAFT_RESPONSE_INVALID' }, 'get');
  }
  const liveOutputId = draft.launchedOutputType === 'estimate'
    ? draft.launchedEstimateId
    : draft.launchedOutputType === 'job'
      ? draft.launchedJobId
      : null;
  const outputIdSnapshot = draft.launchedOutputType === 'estimate'
    ? draft.launchedEstimateIdSnapshot
    : draft.launchedOutputType === 'job'
      ? draft.launchedJobIdSnapshot
      : null;
  return {
    draftId: draft.draftId,
    contractorId: draft.contractorId,
    status: draft.status,
    intendedOutput: draft.intendedOutput,
    title: draft.title,
    subjectType: draft.subject.type,
    subjectLabel: draft.subjectDisplayNameSnapshot,
    propertyLabel: draft.propertyDisplaySnapshot,
    legacyInspectionId: draft.legacyInspectionId,
    launchedOutputType: draft.launchedOutputType,
    liveOutputId,
    outputIdSnapshot,
    outputAvailable: Boolean(liveOutputId),
    launchedAt: draft.launchedAt,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  };
}

export function DurableDraftWorkspace({
  client,
  mode,
  capabilities,
  capabilityLoading = false,
  capabilityError = '',
  target = null,
  legacyDrafts,
  connectedOptions,
  localOptions,
  customerLabel,
  propertyLabel,
  onStartNew,
  onOpenTarget,
  onBack,
  launchEnabled,
  onRefreshCapabilities,
  onLoadOutput,
  onAdoptOutput,
}: DurableDraftWorkspaceProps) {
  const [rows, setRows] = useState<DurableDraftListPresentation[]>([]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const [rowsOwner, setRowsOwner] = useState<{ client: DurableDraftSupabaseClient; contractorId: string | null } | null>(null);
  const rowsOwnerRef = useRef(rowsOwner);
  rowsOwnerRef.current = rowsOwner;
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [listError, setListError] = useState('');
  const [canonical, setCanonical] = useState<DurableDraftCanonicalState | null>(null);
  const canonicalRef = useRef(canonical);
  canonicalRef.current = canonical;
  const [form, setForm] = useState<SharedDraftComposerDraft | null>(null);
  const [removedItemIds, setRemovedItemIds] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'clean' | 'dirty' | 'saving' | 'saved' | 'failed'>('clean');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error' | 'info'; title: string; body?: string; testId?: string } | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('Loading Draft…');
  const [editorLoading, setEditorLoading] = useState(mode === 'editor');
  const [outputError, setOutputError] = useState('');
  const [openingTargetKey, setOpeningTargetKey] = useState<string | null>(null);
  const [openingOutputKey, setOpeningOutputKey] = useState<string | null>(null);
  const [launchState, dispatchLaunch] = useReducer(durableDraftLaunchReducer, INITIAL_DURABLE_DRAFT_LAUNCH_STATE);
  const launchStateRef = useRef(launchState);
  launchStateRef.current = launchState;
  const [launchProof, setLaunchProof] = useState<ContractorWorkDraftLaunchResult | null>(null);
  const [, dispatchPostLaunchNavigation] = useReducer(
    postLaunchNavigationReducer,
    INITIAL_POST_LAUNCH_NAVIGATION_STATE,
  );
  const postLaunchEligibility = useRef<PostLaunchNavigationEligibility | null>(null);
  const postLaunchIntent = useRef<PostLaunchNavigationIntent | null>(null);
  const openingTargetLocks = useRef(new Set<string>());
  const openingOutputOperation = useRef<DurableDraftOutputOperation | null>(null);
  const launchOperation = useRef<DurableDraftLaunchOperation | null>(null);
  const reconcileRecoveredAttempt = useRef<(attempt: DurableDraftLaunchAttemptRecord, replacePending?: boolean) => void>(() => undefined);
  const saveLock = useRef(false);
  const saveOperation = useRef<symbol | null>(null);
  const listGeneration = useRef(0);
  const listOperation = useRef<symbol | null>(null);
  const editorGeneration = useRef(0);
  const workspaceGeneration = useRef(0);
  const clientGeneration = useRef(0);
  const priorClient = useRef(client);
  if (priorClient.current !== client) {
    priorClient.current = client;
    clientGeneration.current += 1;
  }
  const priorWorkspaceContext = useRef({ mode, targetKey: openTargetKey(target), contractorId: capabilities.contractorId });
  const nextWorkspaceContext = { mode, targetKey: openTargetKey(target), contractorId: capabilities.contractorId };
  if (priorWorkspaceContext.current.mode !== nextWorkspaceContext.mode
    || priorWorkspaceContext.current.targetKey !== nextWorkspaceContext.targetKey
    || priorWorkspaceContext.current.contractorId !== nextWorkspaceContext.contractorId) {
    priorWorkspaceContext.current = nextWorkspaceContext;
    workspaceGeneration.current += 1;
  }
  const mounted = useRef(false);
  const targetlessNormalized = useRef(false);
  const adoptedDraftId = useRef<string | null>(null);
  const recoveredAttemptKey = useRef<string | null>(null);
  const context = useRef({ client, contractorId: capabilities.contractorId, mode, target, targetKey: openTargetKey(target), launchEnabled });
  const errorSummaryRef = useRef<HTMLDivElement | null>(null);
  const targetKey = openTargetKey(target);
  context.current = { client, contractorId: capabilities.contractorId, mode, target, targetKey, launchEnabled };

  const cancelPostLaunchNavigation = (token?: symbol) => {
    if (token
      && postLaunchEligibility.current?.token !== token
      && postLaunchIntent.current?.token !== token) return;
    postLaunchEligibility.current = null;
    postLaunchIntent.current = null;
    dispatchPostLaunchNavigation({ type: 'CANCEL_STALE', token });
  };

  const applyExternalLaunchTransition = (
    event: Extract<DurableDraftLaunchMachineEvent, { type: 'EXTERNAL_ATTEMPT' | 'EXTERNAL_SUCCEEDED' }>,
    acceptedOwner: DurableDraftLaunchOperation | null = null,
  ) => {
    const decision = decideDurableDraftLaunchTransition(launchStateRef.current, event);
    if (!decision.accepted) return false;
    if (event.type === 'EXTERNAL_SUCCEEDED') cancelPostLaunchNavigation();
    launchStateRef.current = decision.nextState;
    if (decision.ownershipEffect === 'invalidate') launchOperation.current = acceptedOwner;
    dispatchLaunch(event);
    return true;
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      listGeneration.current += 1;
      editorGeneration.current += 1;
      listOperation.current = null;
      saveOperation.current = null;
      saveLock.current = false;
      openingTargetLocks.current.clear();
      openingOutputOperation.current = null;
      launchOperation.current = null;
      postLaunchEligibility.current = null;
      postLaunchIntent.current = null;
    };
  }, []);

  useEffect(() => {
    openingTargetLocks.current.clear();
    openingOutputOperation.current = null;
    setOpeningTargetKey(null);
    setOpeningOutputKey(null);
    const operation = launchOperation.current;
    const preservesCanonicalizedTarget = operation
      && launchEnabled
      && mode === 'editor'
      && target?.kind === 'durable'
      && target.draftId === operation.draftId
      && client === operation.client
      && capabilities.contractorId === operation.contractorId;
    if (!preservesCanonicalizedTarget) {
      cancelPostLaunchNavigation();
      launchOperation.current = null;
      recoveredAttemptKey.current = null;
      setLaunchProof(null);
      dispatchLaunch({ type: 'RESET' });
    }
  }, [mode, client, capabilities.contractorId, target, launchEnabled]);

  const loadList = useCallback(async () => {
    const contractorId = capabilities.contractorId;
    const operation = Symbol('durable-draft-list');
    if (listOperation.current) return;
    listOperation.current = operation;
    const generation = ++listGeneration.current;
    if (!capabilities.canReadDrafts) {
      setRows([]);
      setRowsOwner({ client, contractorId });
      setListState('ready');
      listOperation.current = null;
      return;
    }
    if (rowsOwnerRef.current?.client === client && rowsOwnerRef.current.contractorId === contractorId) {
      setListState('ready');
    } else {
      setListState('loading');
    }
    setListError('');
    try {
      const listRows = await listContractorWorkDrafts(client, { statuses: ['active', 'consumed'] });
      const current = context.current;
      if (!mounted.current
        || generation !== listGeneration.current
        || current.mode !== 'list'
        || current.client !== client
        || current.contractorId !== contractorId) return;
      setRows(durableDraftListRowsToPresentation(listRows));
      setRowsOwner({ client, contractorId });
      setListState('ready');
    } catch (error) {
      const current = context.current;
      if (!mounted.current
        || generation !== listGeneration.current
        || current.mode !== 'list'
        || current.client !== client
        || current.contractorId !== contractorId) return;
      setListError(durableDraftSafeMessage(error, 'list'));
      setListState('error');
    } finally {
      if (listOperation.current === operation) listOperation.current = null;
    }
  }, [capabilities.canReadDrafts, capabilities.contractorId, client]);

  useEffect(() => {
    listGeneration.current += 1;
    listOperation.current = null;
    const ownerMatches = rowsOwnerRef.current?.client === client
      && rowsOwnerRef.current.contractorId === capabilities.contractorId;
    if (!ownerMatches) {
      setRows([]);
      setRowsOwner(null);
    }
    setListError('');
    if (mode !== 'list' || capabilityLoading) return;
    void loadList();
    return () => {
      listGeneration.current += 1;
      listOperation.current = null;
    };
  }, [mode, capabilityLoading, capabilities.contractorId, client, loadList]);

  useEffect(() => {
    if (mode !== 'editor' || capabilityLoading || target) {
      targetlessNormalized.current = false;
      return;
    }
    if (targetlessNormalized.current) return;
    targetlessNormalized.current = true;
    editorGeneration.current += 1;
    saveOperation.current = null;
    saveLock.current = false;
    setEditorLoading(false);
    setFeedback(null);
    setOutputError('');
    setCanonical(null);
    setForm(null);
    setRemovedItemIds([]);
    onBack();
  }, [mode, capabilityLoading, target, onBack]);

  useEffect(() => {
    if (mode !== 'editor' || !target || capabilityLoading) return;
    if (target.kind === 'durable' && adoptedDraftId.current === target.draftId) {
      adoptedDraftId.current = null;
      setEditorLoading(false);
      return;
    }
    const generation = ++editorGeneration.current;
    const contractorId = capabilities.contractorId;
    const capturedTarget = target;
    const capturedTargetKey = targetKey;
    const isCurrent = () => {
      const current = context.current;
      return mounted.current
        && generation === editorGeneration.current
        && current.mode === 'editor'
        && current.client === client
        && current.contractorId === contractorId
        && current.target === capturedTarget
        && current.targetKey === capturedTargetKey;
    };
    const open = async () => {
      setEditorLoading(true);
      setFeedback(null);
      setOutputError('');
      try {
        if (target.kind === 'new') {
          if (!capabilities.canPersistDraft) throw new Error('DRAFT_PERMISSION_DENIED');
          if (!isCurrent()) return;
          setCanonical(null);
          setForm(target.initialDraft);
          setRemovedItemIds([]);
          setDirty(false);
          setSaveState('clean');
          return;
        }
        let draftId = target.kind === 'durable' ? target.draftId : null;
        if (target.kind === 'legacy') {
          if (!capabilities.canImportLegacyDraft) throw new Error('DRAFT_PERMISSION_DENIED');
          setLoadingMessage('Preparing Draft…');
          const imported = await importLegacyContractorWorkDraft(client, {
            inspection_id: target.inspectionId,
            intended_output: null,
          });
          if (!isCurrent()) return;
          draftId = imported.draft_id;
        }
        if (!draftId) throw new Error('DRAFT_RESPONSE_INVALID');
        setLoadingMessage('Loading Draft…');
        const envelope = await getContractorWorkDraft(client, draftId);
        if (!isCurrent()) return;
        const nextCanonical = canonicalStateFromEnvelope(envelope);
        const canonicalDraftId = nextCanonical.draft.draftId;
        if (!canonicalDraftId) throw new Error('DRAFT_RESPONSE_INVALID');
        setCanonical(nextCanonical);
        setForm(durableCanonicalStateToComposer(nextCanonical));
        setRemovedItemIds([]);
        setDirty(false);
        setSaveState('clean');
        if (target.kind === 'legacy') {
          adoptedDraftId.current = canonicalDraftId;
          onOpenTarget({ kind: 'durable', draftId: canonicalDraftId });
        }
      } catch (error) {
        if (!isCurrent()) return;
        const phase = target.kind === 'legacy' ? 'import' : 'get';
        setFeedback({ tone: 'error', title: durableDraftSafeMessage(error, phase), testId: 'durable-draft-open-error' });
        setForm(null);
        queueMicrotask(() => errorSummaryRef.current?.focus());
      } finally {
        if (isCurrent()) setEditorLoading(false);
      }
    };
    void open();
    return () => {
      if (generation === editorGeneration.current) editorGeneration.current += 1;
    };
  }, [mode, target, targetKey, capabilityLoading, capabilities.canImportLegacyDraft, capabilities.canPersistDraft, capabilities.contractorId, client, onOpenTarget]);

  useEffect(() => {
    const draftId = canonical?.draft.draftId;
    const contractorId = capabilities.contractorId;
    if (!launchEnabled || mode !== 'editor' || target?.kind !== 'durable' || !draftId || !contractorId || canonical.draft.status !== 'active') return;
    const recoveryKey = `${contractorId}:${draftId}:${client === context.current.client ? 'current' : 'stale'}`;
    if (recoveredAttemptKey.current === recoveryKey || launchOperation.current) return;
    recoveredAttemptKey.current = recoveryKey;
    const storage = browserLaunchAttemptStorage();
    const fallbackOutput = canonical.draft.intendedOutput ?? 'job';
    if (!storage) {
      dispatchLaunch({ type: 'RECOVER', outputType: fallbackOutput, phase: 'storage_unavailable', draftId, recoveryLocked: false, message: durableDraftStorageUnavailableCopy(fallbackOutput) });
      return;
    }
    const result = readDurableDraftLaunchAttempt(storage, contractorId, draftId);
    if (result.status === 'absent') return;
    if (result.status === 'unavailable' || result.status === 'invalid') {
      dispatchLaunch({ type: 'RECOVER', outputType: fallbackOutput, phase: 'storage_unavailable', draftId, recoveryLocked: result.status === 'invalid', message: 'ServSync could not safely read the saved launch recovery state.' });
      return;
    }
    const attempt = result.attempt;
    if (canonical.draft.intendedOutput && attempt.outputType !== canonical.draft.intendedOutput) {
      dispatchLaunch({
        type: 'RECOVERY_CONFLICT',
        outputType: attempt.outputType,
        draftId,
        idempotencyKey: attempt.idempotencyKey,
        message: 'ServSync found a saved output attempt that does not match this Draft. Reload the canonical Draft status before continuing.',
      });
      return;
    }
    if (attempt.phase === 'prepared') {
      dispatchLaunch({ type: 'RECOVER', outputType: attempt.outputType, phase: 'preparing', draftId, idempotencyKey: attempt.idempotencyKey, message: 'An unused launch attempt is ready to continue.' });
      return;
    }
    if (attempt.phase === 'launching') {
      retainAmbiguousDurableDraftLaunchAttempt(storage, contractorId, draftId);
    }
    if (attempt.phase === 'succeeded') {
      reconcileRecoveredAttempt.current(attempt);
      return;
    }
    if (attempt.phase === 'launching' || attempt.phase === 'ambiguous') {
      dispatchLaunch({
        type: 'RECOVER',
        outputType: attempt.outputType,
        phase: 'ambiguous',
        draftId,
        idempotencyKey: attempt.idempotencyKey,
        message: 'ServSync could not confirm whether the output was created.',
      });
    }
  }, [launchEnabled, mode, target, canonical, capabilities.contractorId, client]);

  useEffect(() => {
    const draftId = canonical?.draft.draftId;
    const contractorId = capabilities.contractorId;
    if (!launchEnabled || mode !== 'editor' || target?.kind !== 'durable' || !draftId || !contractorId) return;
    const storage = browserLaunchAttemptStorage();
    if (!storage) return;
    const scopedKey = durableDraftLaunchAttemptKey(contractorId, draftId);
    const capturedClient = client;
    const capturedGeneration = editorGeneration.current;
    const capturedTargetKey = targetKey;
    const handleStorage = (event: StorageEvent) => {
      const current = context.current;
      if (!current.launchEnabled
        || event.key !== scopedKey
        || current.client !== capturedClient
        || current.contractorId !== contractorId
        || current.targetKey !== capturedTargetKey
        || editorGeneration.current !== capturedGeneration) return;
      const result = readDurableDraftLaunchAttempt(storage, contractorId, draftId);
      const prior = launchStateRef.current;
      if (result.status === 'absent') {
        if (prior.idempotencyKey || prior.recoveryLocked) {
          launchOperation.current = null;
          dispatchLaunch({ type: 'STORAGE_INCONSISTENT', outputType: prior.outputType ?? canonical.draft.intendedOutput ?? 'job', idempotencyKey: prior.idempotencyKey, recoveryLocked: true, message: 'ServSync could not verify the saved launch attempt. Recheck retry protection before continuing.' });
          setFeedback({ tone: 'error', title: 'ServSync could not verify the saved launch attempt.', testId: 'durable-draft-launch-storage-error' });
        }
        return;
      }
      if (result.status === 'invalid' || result.status === 'unavailable') {
        launchOperation.current = null;
        dispatchLaunch({ type: 'STORAGE_INCONSISTENT', outputType: prior.outputType ?? canonical.draft.intendedOutput ?? 'job', idempotencyKey: prior.idempotencyKey, recoveryLocked: true, message: 'ServSync could not safely read the saved launch recovery state.' });
        setFeedback({ tone: 'error', title: 'ServSync could not safely read the saved launch recovery state.', testId: 'durable-draft-launch-storage-error' });
        return;
      }
      if (result.attempt.phase === 'succeeded') {
        reconcileRecoveredAttempt.current(result.attempt, true);
        return;
      }
      const externalEvent = {
        type: 'EXTERNAL_ATTEMPT' as const,
        outputType: result.attempt.outputType,
        phase: result.attempt.phase === 'prepared' ? 'preparing' as const : result.attempt.phase,
        draftId,
        idempotencyKey: result.attempt.idempotencyKey,
        message: result.attempt.phase === 'prepared'
          ? 'Another ServSync tab prepared this output attempt.'
          : 'Another ServSync tab may be creating this output.',
      };
      const accepted = applyExternalLaunchTransition(externalEvent);
      if (!accepted) return;
      if (canonical.draft.intendedOutput && canonical.draft.intendedOutput !== result.attempt.outputType) {
        dispatchLaunch({ type: 'RECOVERY_CONFLICT', outputType: prior.outputType ?? canonical.draft.intendedOutput, draftId, idempotencyKey: prior.idempotencyKey ?? result.attempt.idempotencyKey, message: 'ServSync found a conflicting output attempt. Reload the canonical Draft status before continuing.' });
        setFeedback({ tone: 'error', title: 'ServSync found a conflicting output attempt.', testId: 'durable-draft-launch-storage-error' });
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [launchEnabled, mode, target, targetKey, canonical?.draft.draftId, canonical?.draft.intendedOutput, capabilities.contractorId, client]);

  const handleChange = (next: SharedDraftComposerDraft) => {
    if ((canonical?.draft.status && canonical.draft.status !== 'active') || !durableDraftLaunchAllowsEditing(launchState)) return;
    setForm(next);
    setDirty(true);
    setSaveState('dirty');
    setFeedback(null);
  };

  const handleSave = async () => {
    if (!form || !capabilities.contractorId || !capabilities.canPersistDraft || saveLock.current || launchOperation.current) return;
    const validation = validateSharedDraftComposerDraftForSave(form);
    if (validation) {
      setFeedback({ tone: 'error', title: validation, testId: 'durable-draft-save-error' });
      setSaveState('failed');
      queueMicrotask(() => errorSummaryRef.current?.focus());
      return;
    }
    saveLock.current = true;
    const operation = Symbol('durable-draft-save');
    saveOperation.current = operation;
    const generation = editorGeneration.current;
    const contractorId = capabilities.contractorId;
    const capturedTarget = context.current.target;
    const capturedTargetKey = context.current.targetKey;
    const isCurrent = () => {
      const current = context.current;
      return mounted.current
        && saveOperation.current === operation
        && generation === editorGeneration.current
        && current.mode === 'editor'
        && current.client === client
        && current.contractorId === contractorId
        && current.target === capturedTarget
        && current.targetKey === capturedTargetKey;
    };
    setSaveState('saving');
    setFeedback(null);
    try {
      const prepared = prepareDurableDraftSave({
        form,
        current: canonical,
        contractorId: capabilities.contractorId,
        removedDurableItemIds: removedItemIds,
      });
      const response = await saveContractorWorkDraft(client, prepared.payload);
      const reconciled = reconcileCanonicalSaveResponse(prepared.submitted, response, removedItemIds);
      if (!isCurrent()) return;
      const canonicalDraftId = reconciled.draft.draftId;
      if (!canonicalDraftId) throw new Error('DRAFT_RESPONSE_INVALID');
      setCanonical(reconciled);
      setForm(durableCanonicalStateToComposer(reconciled));
      setRemovedItemIds([]);
      setDirty(false);
      setSaveState('saved');
      if (target?.kind === 'new') {
        adoptedDraftId.current = canonicalDraftId;
        onOpenTarget({ kind: 'durable', draftId: canonicalDraftId });
      }
      setFeedback({
        tone: 'success',
        title: 'Draft saved.',
        body: 'Your contractor-only planning details are up to date.',
        testId: 'durable-draft-save-success',
      });
    } catch (error) {
      if (!isCurrent()) return;
      setSaveState('failed');
      setFeedback({ tone: 'error', title: durableDraftSafeMessage(error, 'save'), testId: 'durable-draft-save-error' });
      queueMicrotask(() => errorSummaryRef.current?.focus());
    } finally {
      if (saveOperation.current === operation) {
        saveOperation.current = null;
        saveLock.current = false;
      }
    }
  };

  const launchOperationIsCurrent = (operation: DurableDraftLaunchOperation) => {
    const current = context.current;
    const expectedTarget = operation.draftId ? `durable:${operation.draftId}` : operation.targetKey;
    return mounted.current
      && launchOperation.current === operation
      && current.launchEnabled
      && current.mode === 'editor'
      && current.client === operation.client
      && current.contractorId === operation.contractorId
      && current.targetKey === expectedTarget
      && editorGeneration.current === operation.editorGeneration;
  };

  const refreshRowsAfterLaunch = async (
    operation: DurableDraftLaunchOperation,
    canonicalState: DurableDraftCanonicalState,
  ) => {
    const localRow = canonicalListPresentation(canonicalState);
    setRows(previous => [localRow, ...previous.filter(row => row.draftId !== localRow.draftId)]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.draftId.localeCompare(right.draftId)));
    setRowsOwner({ client: operation.client, contractorId: operation.contractorId });
    setListState('ready');
    const generation = ++listGeneration.current;
    try {
      const listRows = await listContractorWorkDrafts(operation.client, { statuses: ['active', 'consumed'] });
      const current = context.current;
      if (!mounted.current
        || generation !== listGeneration.current
        || current.client !== operation.client
        || current.contractorId !== operation.contractorId) return;
      const refreshed = durableDraftListRowsToPresentation(listRows);
      setRows([localRow, ...refreshed.filter(row => row.draftId !== localRow.draftId)]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.draftId.localeCompare(right.draftId)));
      setRowsOwner({ client: operation.client, contractorId: operation.contractorId });
    } catch {
      // The canonical consumed row remains authoritative until a later list refresh succeeds.
    }
  };

  const adoptCanonicalConsumed = async (
    operation: DurableDraftLaunchOperation,
    result: ContractorWorkDraftLaunchResult,
  ) => {
    if (!operation.draftId) throw normalizeDurableDraftError({ message: 'DRAFT_RESPONSE_INVALID' }, 'get');
    setLaunchProof(result);
    setDirty(false);
    setRemovedItemIds([]);
    setSaveState('clean');
    saveOperation.current = null;
    saveLock.current = false;
    operation.editorGeneration = ++editorGeneration.current;
    const currentEligibility = postLaunchEligibility.current;
    if (operation.navigationEligibilityToken && currentEligibility?.token === operation.navigationEligibilityToken) {
      const refreshedEligibility = {
        ...currentEligibility,
        targetKey: `durable:${operation.draftId}`,
        editorGeneration: operation.editorGeneration,
        workspaceGeneration: workspaceGeneration.current,
        clientGeneration: clientGeneration.current,
      };
      postLaunchEligibility.current = refreshedEligibility;
      dispatchPostLaunchNavigation({ type: 'ELIGIBLE', eligibility: refreshedEligibility });
    }
    setEditorLoading(false);
    listGeneration.current += 1;
    dispatchLaunch({ type: 'CONSUMED_PROOF', operationToken: operation.token, result });
    const envelope = await getContractorWorkDraft(operation.client, operation.draftId);
    const nextCanonical = canonicalStateFromEnvelope(envelope);
    if (nextCanonical.draft.status !== 'consumed'
      || nextCanonical.draft.draftId !== operation.draftId
      || nextCanonical.draft.contractorId !== operation.contractorId
      || nextCanonical.draft.launchedOutputType !== result.output_type
      || (result.output_type === 'estimate' && nextCanonical.draft.launchedEstimateIdSnapshot !== result.output_id_snapshot)
      || (result.output_type === 'job' && nextCanonical.draft.launchedJobIdSnapshot !== result.output_id_snapshot)) {
      throw normalizeDurableDraftError({ message: 'DRAFT_RESPONSE_INVALID' }, 'get');
    }
    if (!launchOperationIsCurrent(operation)) return;
    canonicalRef.current = nextCanonical;
    setCanonical(nextCanonical);
    setForm(durableCanonicalStateToComposer(nextCanonical));
    const outputId = result.output_type === 'estimate'
      ? nextCanonical.draft.launchedEstimateId
      : nextCanonical.draft.launchedJobId;
    const outputIdSnapshot = result.output_type === 'estimate'
      ? nextCanonical.draft.launchedEstimateIdSnapshot
      : nextCanonical.draft.launchedJobIdSnapshot;
    const eligibility = postLaunchEligibility.current;
    const navigationIntent = eligibility && operation.navigationEligibilityToken === eligibility.token
      ? resolvePostLaunchNavigationIntent({
          eligibility,
          result,
          draftId: operation.draftId,
          contractorId: operation.contractorId,
          outputType: result.output_type,
          outputId,
          outputIdSnapshot,
          outputAvailable: Boolean(outputId),
        })
      : null;
    const navigationContextMatches = navigationIntent
      ? postLaunchNavigationContextMatches(navigationIntent, {
          contractorId: context.current.contractorId,
          targetKey: context.current.targetKey,
          editorGeneration: editorGeneration.current,
          workspaceGeneration: workspaceGeneration.current,
          clientGeneration: clientGeneration.current,
          launchEnabled: context.current.launchEnabled,
        })
      : false;
    if (navigationIntent && navigationContextMatches) {
      postLaunchIntent.current = navigationIntent;
      dispatchPostLaunchNavigation({ type: 'CANONICAL_READY', intent: navigationIntent });
    } else {
      postLaunchEligibility.current = null;
      postLaunchIntent.current = null;
      dispatchPostLaunchNavigation({ type: 'RESET' });
    }
    setFeedback({
      tone: 'success',
      title: navigationIntent && navigationContextMatches
        ? `${result.output_type === 'estimate' ? 'Estimate' : 'Job'} created. Opening ${result.output_type === 'estimate' ? 'Estimate' : 'Job'}…`
        : `${nextCanonical.draft.launchedOutputType === 'estimate' ? 'Estimate' : 'Job'} created.`,
      body: navigationIntent && navigationContextMatches ? 'The Draft is consumed and read-only.' : 'The Draft is now consumed and read-only.',
      testId: 'durable-draft-launch-success',
    });
    dispatchLaunch({ type: 'CONSUMED', operationToken: operation.token, draftId: operation.draftId, outputType: operation.outputType });
    launchOperation.current = null;
    void refreshRowsAfterLaunch(operation, nextCanonical);
    if (navigationIntent && navigationContextMatches) {
      window.requestAnimationFrame(() => {
        if (postLaunchIntent.current?.token !== navigationIntent.token) return;
        void openConsumedDraftOutput({
          source: 'automatic',
          intent: navigationIntent,
          canonicalState: nextCanonical,
          outputType: navigationIntent.outputType,
          outputId: navigationIntent.outputId,
        });
      });
    }
  };

  const reconcileCanonicalLifecycle = async (
    operation: DurableDraftLaunchOperation,
    lifecycleCode: 'DRAFT_NOT_ACTIVE' | 'DRAFT_NOT_FOUND' | 'DRAFT_ALREADY_CONSUMED',
  ) => {
    if (!operation.draftId) return;
    const message = lifecycleCode === 'DRAFT_NOT_FOUND'
      ? 'This Draft is unavailable. Reload its status or return to Work.'
      : 'ServSync is checking this Draft’s current status.';
    dispatchLaunch({ type: 'BEGIN_LIFECYCLE_RECONCILIATION', operationToken: operation.token, draftId: operation.draftId, message });
    setFeedback({ tone: 'info', title: message, testId: 'durable-draft-lifecycle-reconciling' });
    try {
      const envelope = await getContractorWorkDraft(operation.client, operation.draftId);
      const nextCanonical = canonicalStateFromEnvelope(envelope);
      if (!launchOperationIsCurrent(operation)) return;
      if (nextCanonical.draft.draftId !== operation.draftId
        || nextCanonical.draft.contractorId !== operation.contractorId) {
        throw normalizeDurableDraftError({ message: 'DRAFT_RESPONSE_INVALID' }, 'get');
      }
      if (nextCanonical.draft.status === 'consumed') {
        operation.editorGeneration = ++editorGeneration.current;
        setEditorLoading(false);
        setCanonical(nextCanonical);
        setForm(durableCanonicalStateToComposer(nextCanonical));
        setDirty(false);
        setRemovedItemIds([]);
        setSaveState('clean');
        dispatchLaunch({ type: 'LIFECYCLE_RESOLVED', operationToken: operation.token, status: 'consumed' });
        launchOperation.current = null;
        void refreshRowsAfterLaunch(operation, nextCanonical);
        return;
      }
      if (nextCanonical.draft.status === 'discarded') {
        operation.editorGeneration = ++editorGeneration.current;
        setEditorLoading(false);
        setCanonical(nextCanonical);
        setForm(durableCanonicalStateToComposer(nextCanonical));
        setDirty(false);
        setRemovedItemIds([]);
        setSaveState('clean');
        dispatchLaunch({ type: 'LIFECYCLE_RESOLVED', operationToken: operation.token, status: 'discarded' });
        setFeedback({ tone: 'info', title: 'This Draft was discarded and is read-only.', testId: 'durable-draft-lifecycle-discarded' });
        launchOperation.current = null;
        void refreshRowsAfterLaunch(operation, nextCanonical);
        return;
      }
      const contradiction = 'ServSync could not confirm this Draft’s current status.';
      dispatchLaunch({ type: 'LIFECYCLE_UNAVAILABLE', operationToken: operation.token, message: contradiction });
      setFeedback({ tone: 'error', title: contradiction, body: 'Reload the canonical Draft status before making changes.', testId: 'durable-draft-lifecycle-error' });
      launchOperation.current = null;
    } catch {
      if (!launchOperationIsCurrent(operation)) return;
      const unavailable = lifecycleCode === 'DRAFT_NOT_FOUND'
        ? 'This Draft could not be found. Return to Work or retry its status.'
        : 'ServSync could not confirm this Draft’s current status.';
      dispatchLaunch({ type: 'LIFECYCLE_UNAVAILABLE', operationToken: operation.token, message: unavailable });
      setFeedback({ tone: 'error', title: unavailable, body: 'The Draft remains read-only until its canonical status is available.', testId: 'durable-draft-lifecycle-error' });
      launchOperation.current = null;
    }
  };

  const handleLaunchFailure = async (
    operation: DurableDraftLaunchOperation,
    error: unknown,
  ) => {
    if (!launchOperationIsCurrent(operation)) return;
    if (operation.navigationEligibilityToken) cancelPostLaunchNavigation(operation.navigationEligibilityToken);
    const storage = browserLaunchAttemptStorage();
    const failure = classifyDurableDraftLaunchFailure(error);
    const normalized = error instanceof DurableDraftError ? error : normalizeDurableDraftError(error, 'launch');
    const preLaunchMessage = !operation.rpcStarted && failure.kind === 'ambiguous'
      ? error instanceof DurableDraftError && error.phase === 'capability'
        ? 'ServSync could not verify your current access. No output was created.'
        : 'ServSync could not safely prepare this Draft. No output was created.'
      : failure.message;
    if (failure.kind === 'reconcile' && operation.draftId) {
      await reconcileCanonicalLifecycle(
        operation,
        normalized.applicationCode === 'DRAFT_NOT_FOUND'
          ? 'DRAFT_NOT_FOUND'
          : normalized.applicationCode === 'DRAFT_ALREADY_CONSUMED'
            ? 'DRAFT_ALREADY_CONSUMED'
            : 'DRAFT_NOT_ACTIVE',
      );
      return;
    }
    if (operation.rpcStarted && (failure.kind === 'ambiguous' || failure.kind === 'unknown')) {
      if (storage && operation.draftId) retainAmbiguousDurableDraftLaunchAttempt(storage, operation.contractorId, operation.draftId);
      dispatchLaunch({
        type: 'FAIL',
        operationToken: operation.token,
        phase: 'ambiguous',
        message: failure.message,
        idempotencyKey: operation.idempotencyKey,
      });
      setFeedback({ tone: 'error', title: failure.message, body: 'Retry uses the same protected attempt.', testId: 'durable-draft-launch-ambiguous' });
    } else {
      const preserveRecoveredKey = Boolean(operation.idempotencyKey && !operation.rpcStarted);
      const cleared = !preserveRecoveredKey && storage && operation.draftId
        ? clearDefinitiveFailedDurableDraftLaunchAttempt(storage, operation.contractorId, operation.draftId)
        : null;
      if (cleared?.status === 'unavailable') {
        const storageMessage = 'ServSync could not verify launch recovery cleanup. Recheck retry protection before continuing.';
        dispatchLaunch({ type: 'STORAGE_INCONSISTENT', outputType: operation.outputType, idempotencyKey: operation.idempotencyKey, recoveryLocked: true, message: storageMessage });
        setFeedback({ tone: 'error', title: storageMessage, testId: 'durable-draft-launch-storage-error' });
        launchOperation.current = null;
        queueMicrotask(() => errorSummaryRef.current?.focus());
        return;
      }
      dispatchLaunch({
        type: 'FAIL',
        operationToken: operation.token,
        phase: failure.kind === 'denied' ? 'permission_denied' : 'fixable_failure',
        message: preLaunchMessage,
        idempotencyKey: preserveRecoveredKey ? operation.idempotencyKey : null,
      });
      setFeedback({ tone: 'error', title: preLaunchMessage, testId: 'durable-draft-launch-error' });
    }
    launchOperation.current = null;
    queueMicrotask(() => errorSummaryRef.current?.focus());
  };

  const handleOpenLaunchConfirmation = () => {
    if (!launchEnabled || capabilityLoading || saveLock.current || saveState === 'saving' || !form || !capabilities.contractorId || !capabilities.canPersistDraft) return;
    const outputType = form.intended_output;
    if (!outputType) return;
    const validation = validateDraftForLaunch(form, canonical);
    if (validation) {
      setFeedback({ tone: 'error', title: validation, testId: 'durable-draft-launch-error' });
      queueMicrotask(() => errorSummaryRef.current?.focus());
      return;
    }
    if (!launchCapability(capabilities, outputType)) {
      setFeedback({ tone: 'error', title: `Your current access does not allow creating this ${outputType === 'estimate' ? 'Estimate' : 'Job'}.`, testId: 'durable-draft-launch-error' });
      return;
    }
    const storage = browserLaunchAttemptStorage();
    try {
      if (!storage) throw new Error('unavailable');
      void storage.length;
      if (canonical?.draft.draftId) {
        const existing = readDurableDraftLaunchAttempt(storage, capabilities.contractorId, canonical.draft.draftId);
        if (existing.status === 'unavailable' || existing.status === 'invalid') throw new Error('unavailable');
        if (existing.status === 'found' && existing.attempt.outputType !== outputType) {
          setFeedback({ tone: 'error', title: 'ServSync must resolve the existing output attempt before the intended output can change.', testId: 'durable-draft-launch-error' });
          return;
        }
      }
    } catch {
      const message = durableDraftStorageUnavailableCopy(outputType);
      dispatchLaunch({ type: 'RECOVER', outputType, phase: 'storage_unavailable', draftId: canonical?.draft.draftId ?? null, recoveryLocked: false, message });
      setFeedback({ tone: 'error', title: message, testId: 'durable-draft-launch-storage-error' });
      return;
    }
    dispatchLaunch({ type: 'OPEN_CONFIRMATION', outputType });
  };

  const handleConfirmLaunch = async () => {
    if (!launchEnabled || saveLock.current || launchOperation.current || launchState.phase !== 'confirming' || !launchState.outputType || !form || !capabilities.contractorId) return;
    if (!targetKey) return;
    const navigationSource: PostLaunchNavigationSource = launchState.idempotencyKey ? 'explicit_retry' : 'confirmed_create';
    const eligibility = createPostLaunchNavigationEligibility({
      source: navigationSource,
      contractorId: capabilities.contractorId,
      outputType: launchState.outputType,
      targetKey,
      editorGeneration: editorGeneration.current,
      workspaceGeneration: workspaceGeneration.current,
      clientGeneration: clientGeneration.current,
    });
    postLaunchEligibility.current = eligibility;
    postLaunchIntent.current = null;
    dispatchPostLaunchNavigation({ type: 'ELIGIBLE', eligibility });
    const operation: DurableDraftLaunchOperation = {
      token: Symbol('durable-draft-launch'),
      client,
      contractorId: capabilities.contractorId,
      draftId: canonical?.draft.draftId ?? null,
      targetKey,
      outputType: launchState.outputType,
      editorGeneration: editorGeneration.current,
      rpcStarted: false,
      idempotencyKey: null,
      navigationSource,
      navigationEligibilityToken: eligibility.token,
    };
    launchOperation.current = operation;
    const needsSave = !canonical?.draft.draftId || dirty;
    dispatchLaunch({ type: 'START', outputType: operation.outputType, operationToken: operation.token, draftId: operation.draftId, needsSave });
    setFeedback(null);
    try {
      let currentCanonical = canonical;
      if (needsSave) {
        const prepared = prepareDurableDraftSave({
          form,
          current: canonical,
          contractorId: operation.contractorId,
          removedDurableItemIds: removedItemIds,
        });
        const response = await saveContractorWorkDraft(operation.client, prepared.payload);
        const reconciled = reconcileCanonicalSaveResponse(prepared.submitted, response, removedItemIds);
        if (!launchOperationIsCurrent(operation)) return;
        const draftId = reconciled.draft.draftId;
        if (!draftId || reconciled.draft.contractorId !== operation.contractorId || reconciled.draft.status !== 'active') {
          throw normalizeDurableDraftError({ message: 'DRAFT_RESPONSE_INVALID' }, 'save');
        }
        currentCanonical = reconciled;
        operation.draftId = draftId;
        operation.targetKey = `durable:${draftId}`;
        setCanonical(reconciled);
        setForm(durableCanonicalStateToComposer(reconciled));
        setRemovedItemIds([]);
        setDirty(false);
        setSaveState('saved');
        if (target?.kind === 'new') {
          adoptedDraftId.current = draftId;
          onOpenTarget({ kind: 'durable', draftId });
          await new Promise(resolve => setTimeout(resolve, 0));
          operation.editorGeneration = editorGeneration.current;
          const currentEligibility = postLaunchEligibility.current;
          if (currentEligibility?.token === operation.navigationEligibilityToken) {
            const canonicalizedEligibility = {
              ...currentEligibility,
              targetKey: `durable:${draftId}`,
              editorGeneration: editorGeneration.current,
              workspaceGeneration: workspaceGeneration.current,
              clientGeneration: clientGeneration.current,
            };
            postLaunchEligibility.current = canonicalizedEligibility;
            dispatchPostLaunchNavigation({ type: 'ELIGIBLE', eligibility: canonicalizedEligibility });
          }
        }
        if (!launchOperationIsCurrent(operation)) return;
        dispatchLaunch({ type: 'SAVED', operationToken: operation.token, draftId });
      }
      if (!operation.draftId || currentCanonical?.draft.status !== 'active' || currentCanonical.draft.intendedOutput !== operation.outputType) {
        throw normalizeDurableDraftError({ message: 'DRAFT_NOT_ACTIVE' }, 'launch');
      }
      const refreshedCapabilities = await onRefreshCapabilities();
      if (!launchOperationIsCurrent(operation)) return;
      if (refreshedCapabilities.contractorId !== operation.contractorId
        || !refreshedCapabilities.canPersistDraft
        || !launchCapability(refreshedCapabilities, operation.outputType)) {
        throw normalizeDurableDraftError({ message: 'DRAFT_PERMISSION_DENIED' }, 'launch');
      }
      const storage = browserLaunchAttemptStorage();
      if (!storage) throw new Error('DRAFT_LAUNCH_STORAGE_UNAVAILABLE');
      const existing = readDurableDraftLaunchAttempt(storage, operation.contractorId, operation.draftId);
      if (existing.status === 'unavailable' || existing.status === 'invalid') throw new Error('DRAFT_LAUNCH_STORAGE_UNAVAILABLE');
      const preparedAttempt = existing.status === 'found'
        ? existing.attempt.outputType === operation.outputType ? { status: 'success' as const, attempt: existing.attempt } : { status: 'invalid' as const }
        : createDurableDraftLaunchAttempt(storage, {
            contractorId: operation.contractorId,
            draftId: operation.draftId,
            outputType: operation.outputType,
          });
      if (preparedAttempt.status !== 'success') throw new Error('DRAFT_LAUNCH_STORAGE_UNAVAILABLE');
      dispatchLaunch({ type: 'ATTEMPT_READY', operationToken: operation.token, draftId: operation.draftId, idempotencyKey: preparedAttempt.attempt.idempotencyKey });
      operation.idempotencyKey = preparedAttempt.attempt.idempotencyKey;
      const launchingAttempt = updateDurableDraftLaunchAttemptPhase(storage, operation.contractorId, operation.draftId, 'launching');
      if (launchingAttempt.status !== 'success' || launchingAttempt.attempt.idempotencyKey !== preparedAttempt.attempt.idempotencyKey) {
        throw new Error('DRAFT_LAUNCH_STORAGE_UNAVAILABLE');
      }
      if (!launchOperationIsCurrent(operation)) return;
      operation.rpcStarted = true;
      dispatchLaunch({ type: 'RPC_STARTED', operationToken: operation.token });
      const result = await launchContractorWorkDraft(operation.client, {
        draft_id: operation.draftId,
        intended_output: operation.outputType,
        idempotency_key: launchingAttempt.attempt.idempotencyKey,
      });
      if (!launchOperationIsCurrent(operation)) return;
      dispatchLaunch({ type: 'RESPONSE_RECEIVED', operationToken: operation.token });
      const recorded = recordDurableDraftLaunchSuccess(storage, operation.contractorId, operation.draftId, result);
      if (recorded.status !== 'success') {
        setFeedback({ tone: 'info', title: 'The output was created, but browser recovery state could not be updated.', testId: 'durable-draft-launch-storage-warning' });
      }
      try {
        await adoptCanonicalConsumed(operation, result);
      } catch {
        if (!launchOperationIsCurrent(operation)) return;
        const message = 'The output was created, but ServSync could not refresh the Draft details.';
        dispatchLaunch({ type: 'RECONCILE_FAILED', operationToken: operation.token, message });
        setFeedback({ tone: 'error', title: message, body: 'Retry refreshing the Draft. Do not create it again.', testId: 'durable-draft-reconcile-error' });
        launchOperation.current = null;
      }
    } catch (error) {
      if (error instanceof Error && (
        error.message === 'DRAFT_LAUNCH_STORAGE_UNAVAILABLE'
        || error.message.startsWith('DRAFT_IDEMPOTENCY_')
        || error.message.startsWith('DRAFT_LAUNCH_ATTEMPT_')
      )) {
        if (!launchOperationIsCurrent(operation)) return;
        if (operation.navigationEligibilityToken) cancelPostLaunchNavigation(operation.navigationEligibilityToken);
        const message = durableDraftStorageUnavailableCopy(operation.outputType);
        dispatchLaunch({ type: 'FAIL', operationToken: operation.token, phase: 'storage_unavailable', message, idempotencyKey: operation.idempotencyKey, recoveryLocked: Boolean(operation.idempotencyKey) });
        setFeedback({ tone: 'error', title: message, testId: 'durable-draft-launch-storage-error' });
        launchOperation.current = null;
        return;
      }
      await handleLaunchFailure(operation, error);
    }
  };

  const handleDiscardPreparedLaunch = () => {
    if (!launchEnabled || launchState.phase !== 'preparing' || !canonical?.draft.draftId || !capabilities.contractorId) return;
    const storage = browserLaunchAttemptStorage();
    if (!storage) return;
    const cleared = clearDefinitiveFailedDurableDraftLaunchAttempt(storage, capabilities.contractorId, canonical.draft.draftId);
    if (cleared.status === 'success' && cleared.removed) {
      dispatchLaunch({ type: 'RESET' });
      setFeedback({ tone: 'info', title: 'The unused launch attempt was discarded.' });
    } else if (cleared.status === 'unavailable') {
      dispatchLaunch({ type: 'STORAGE_INCONSISTENT', outputType: launchState.outputType ?? canonical.draft.intendedOutput ?? 'job', idempotencyKey: launchState.idempotencyKey, recoveryLocked: true, message: 'ServSync could not verify that the unused launch attempt was removed.' });
      setFeedback({ tone: 'error', title: 'ServSync could not verify that the unused launch attempt was removed.', testId: 'durable-draft-launch-storage-error' });
    }
  };

  const handleRetryConsumedReconciliation = async () => {
    if (!launchEnabled || launchOperation.current || !launchProof || !canonical?.draft.draftId || !capabilities.contractorId) return;
    const operation: DurableDraftLaunchOperation = {
      token: Symbol('durable-draft-reconcile'),
      client,
      contractorId: capabilities.contractorId,
      draftId: canonical.draft.draftId,
      targetKey,
      outputType: launchProof.output_type,
      editorGeneration: editorGeneration.current,
      rpcStarted: true,
      idempotencyKey: launchState.idempotencyKey,
      navigationSource: postLaunchEligibility.current?.source ?? null,
      navigationEligibilityToken: postLaunchEligibility.current?.token ?? null,
    };
    launchOperation.current = operation;
    dispatchLaunch({ type: 'RECONCILE_RETRY', outputType: operation.outputType, operationToken: operation.token, draftId: operation.draftId as string, idempotencyKey: operation.idempotencyKey, consumedProof: launchProof });
    try {
      await adoptCanonicalConsumed(operation, launchProof);
    } catch {
      if (!launchOperationIsCurrent(operation)) return;
      const message = 'The output was created, but ServSync still could not refresh the Draft details.';
      dispatchLaunch({ type: 'RECONCILE_FAILED', operationToken: operation.token, message });
      setFeedback({ tone: 'error', title: message, body: 'Try refreshing the Draft again. Do not create it again.', testId: 'durable-draft-reconcile-error' });
      launchOperation.current = null;
    }
  };

  reconcileRecoveredAttempt.current = (attempt, replacePending = false) => {
    if (!launchEnabled || (!replacePending && launchOperation.current) || !canonical?.draft.draftId || !capabilities.contractorId) return;
    if (attempt.contractorId !== capabilities.contractorId || attempt.draftId !== canonical.draft.draftId) return;
    const recoveredResult: ContractorWorkDraftLaunchResult = attempt.outputType === 'estimate'
      ? {
          draft_id: attempt.draftId,
          status: 'succeeded',
          output_type: 'estimate',
          estimate_id: attempt.estimateId ?? null,
          job_id: null,
          output_id_snapshot: attempt.outputIdSnapshot as string,
          output_available: attempt.outputAvailable as boolean,
          launch_id: attempt.launchId ?? null,
          idempotent: true,
        }
      : {
          draft_id: attempt.draftId,
          status: 'succeeded',
          output_type: 'job',
          estimate_id: null,
          job_id: attempt.jobId ?? null,
          output_id_snapshot: attempt.outputIdSnapshot as string,
          output_available: attempt.outputAvailable as boolean,
          launch_id: attempt.launchId ?? null,
          idempotent: true,
        };
    if (!attempt.outputIdSnapshot || attempt.outputAvailable === undefined) return;
    const operation: DurableDraftLaunchOperation = {
      token: Symbol('durable-draft-recovered-success'),
      client,
      contractorId: attempt.contractorId,
      draftId: attempt.draftId,
      targetKey,
      outputType: attempt.outputType,
      editorGeneration: editorGeneration.current,
      rpcStarted: true,
      idempotencyKey: attempt.idempotencyKey,
      navigationSource: null,
      navigationEligibilityToken: null,
    };
    const externalSuccessEvent = {
      type: 'EXTERNAL_SUCCEEDED',
      outputType: attempt.outputType,
      operationToken: operation.token,
      draftId: attempt.draftId,
      idempotencyKey: attempt.idempotencyKey,
      result: recoveredResult,
    } as const;
    if (!applyExternalLaunchTransition(externalSuccessEvent, operation)) return;
    setLaunchProof(recoveredResult);
    void adoptCanonicalConsumed(operation, recoveredResult).catch(() => {
      if (!launchOperationIsCurrent(operation)) return;
      const message = 'ServSync could not refresh the completed Draft. Retry with the same protected attempt.';
      dispatchLaunch({
        type: 'FAIL',
        operationToken: operation.token,
        phase: 'ambiguous',
        message,
        idempotencyKey: attempt.idempotencyKey,
      });
      setFeedback({ tone: 'error', title: message, testId: 'durable-draft-launch-ambiguous' });
      launchOperation.current = null;
    });
  };

  const handleRetryLifecycleReconciliation = async () => {
    if (!launchEnabled || launchOperation.current || !canonical?.draft.draftId || !capabilities.contractorId || !launchState.outputType) return;
    const operation: DurableDraftLaunchOperation = {
      token: Symbol('durable-draft-lifecycle-reconcile'),
      client,
      contractorId: capabilities.contractorId,
      draftId: canonical.draft.draftId,
      targetKey,
      outputType: launchState.outputType,
      editorGeneration: editorGeneration.current,
      rpcStarted: true,
      idempotencyKey: launchState.idempotencyKey,
      navigationSource: null,
      navigationEligibilityToken: null,
    };
    launchOperation.current = operation;
    dispatchLaunch({ type: 'RECONCILE_RETRY', outputType: operation.outputType, operationToken: operation.token, draftId: operation.draftId as string, idempotencyKey: operation.idempotencyKey, lifecycle: true });
    await reconcileCanonicalLifecycle(operation, 'DRAFT_NOT_ACTIVE');
  };

  const handleBack = () => {
    if ((durableDraftLaunchIsBusy(launchState) || launchState.phase === 'ambiguous')
      && !window.confirm('This action may still complete. Leave this Draft and check its status when you return?')) return;
    if (dirty && !window.confirm('Discard unsaved local changes and return to Work? The last saved Draft will remain available.')) return;
    cancelPostLaunchNavigation();
    openingOutputOperation.current = null;
    setOpeningOutputKey(null);
    onBack();
  };

  const openConsumedDraftOutput = async (request: {
    source: 'automatic' | 'manual';
    intent?: PostLaunchNavigationIntent;
    canonicalState?: DurableDraftCanonicalState;
    listDraft?: DurableDraftListPresentation;
    outputType: ContractorWorkDraftLaunchOutput;
    outputId: string;
  }) => {
    const { source, intent, canonicalState, listDraft, outputType, outputId } = request;
    const draftId = canonicalState?.draft.draftId ?? listDraft?.draftId ?? null;
    const contractorId = canonicalState?.draft.contractorId ?? listDraft?.contractorId ?? null;
    const current = context.current;
    const editorContextMatches = current.mode === 'editor'
      && current.target?.kind === 'durable'
      && current.target.draftId === draftId
      && canonicalState?.draft.status === 'consumed'
      && canonicalState.draft.launchedOutputType === outputType;
    const listContextMatches = source === 'manual'
      && current.mode === 'list'
      && current.target === null
      && listDraft?.status === 'consumed'
      && listDraft.launchedOutputType === outputType
      && listDraft.liveOutputId === outputId
      && listDraft.outputAvailable;
    if (openingOutputOperation.current
      || !draftId
      || !contractorId
      || !outputId
      || !current.launchEnabled
      || (!editorContextMatches && !listContextMatches)) return;
    if (source === 'automatic' && (!intent || postLaunchIntent.current?.token !== intent.token)) return;
    const key = `${outputType}:${outputId}`;
    const operation: DurableDraftOutputOperation = {
      key,
      token: Symbol(`durable-draft-output-${source}`),
      source,
      intentToken: intent?.token ?? null,
      client,
      mode: current.mode,
      contractorId,
      draftId,
      target: current.target,
      targetKey: current.targetKey as string,
      outputType,
      outputId,
      editorGeneration: editorGeneration.current,
      workspaceGeneration: workspaceGeneration.current,
      clientGeneration: clientGeneration.current,
    };
    openingOutputOperation.current = operation;
    const isCurrent = () => {
      const latest = context.current;
      const baseCurrent = mounted.current
        && openingOutputOperation.current === operation
        && operation.editorGeneration === editorGeneration.current
        && operation.workspaceGeneration === workspaceGeneration.current
        && operation.clientGeneration === clientGeneration.current
        && latest.launchEnabled
        && latest.mode === operation.mode
        && latest.client === operation.client
        && latest.contractorId === operation.contractorId
        && latest.target === operation.target
        && latest.targetKey === operation.targetKey;
      if (!baseCurrent) return false;
      if (operation.mode === 'editor') {
        const currentCanonical = canonicalRef.current;
        return latest.target?.kind === 'durable'
          && latest.target.draftId === operation.draftId
          && currentCanonical?.draft.draftId === operation.draftId
          && currentCanonical.draft.contractorId === operation.contractorId
          && currentCanonical.draft.status === 'consumed'
          && currentCanonical.draft.launchedOutputType === operation.outputType;
      }
      const currentRow = rowsRef.current.find(row => row.draftId === operation.draftId);
      return latest.target === null
        && currentRow?.contractorId === operation.contractorId
        && currentRow.status === 'consumed'
        && currentRow.launchedOutputType === operation.outputType
        && currentRow.liveOutputId === operation.outputId
        && currentRow.outputAvailable;
    };
    setOpeningOutputKey(key);
    setOutputError('');
    try {
      const loaded = await onLoadOutput(outputType, outputId);
      if (!isCurrent()) return;
      const validated = validateDurableDraftLoadedOutput(loaded, { outputType, outputId, contractorId });
      if (!validated.ok) throw new Error('DRAFT_RESPONSE_INVALID');
      if (source === 'automatic' && intent) {
        dispatchPostLaunchNavigation({ type: 'START_ADOPTION', token: intent.token });
      }
      onAdoptOutput(loaded, operation.token);
      if (source === 'automatic' && intent) {
        postLaunchEligibility.current = null;
        postLaunchIntent.current = null;
        dispatchPostLaunchNavigation({ type: 'NAVIGATED', token: intent.token });
      }
    } catch (error) {
      if (!isCurrent()) return;
      const label = outputType === 'estimate' ? 'Estimate' : 'Job';
      let unavailable = false;
      if (outputLoadWasNotFound(error)) {
        try {
          const envelope = await getContractorWorkDraft(operation.client, operation.draftId);
          const refreshed = canonicalStateFromEnvelope(envelope);
          if (!isCurrent()) return;
          const liveOutputId = outputType === 'estimate'
            ? refreshed.draft.launchedEstimateId
            : refreshed.draft.launchedJobId;
          const snapshot = outputType === 'estimate'
            ? refreshed.draft.launchedEstimateIdSnapshot
            : refreshed.draft.launchedJobIdSnapshot;
          if (refreshed.draft.draftId !== operation.draftId
            || refreshed.draft.contractorId !== operation.contractorId
            || refreshed.draft.status !== 'consumed'
            || refreshed.draft.launchedOutputType !== outputType
            || !snapshot) throw new Error('DRAFT_RESPONSE_INVALID');
          if (!liveOutputId) {
            unavailable = true;
            canonicalRef.current = refreshed;
            setCanonical(refreshed);
            setForm(durableCanonicalStateToComposer(refreshed));
            const localRow = canonicalListPresentation(refreshed);
            setRows(previous => [localRow, ...previous.filter(row => row.draftId !== localRow.draftId)]
              .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.draftId.localeCompare(right.draftId)));
          }
        } catch {
          // Keep the consumed envelope and explicit retry when deletion cannot be proven canonically.
        }
      }
      const message = unavailable
        ? `The created ${label} is no longer available.`
        : `${label} created, but it could not be opened. Open ${label} to try again.`;
      setFeedback({ tone: 'success', title: `${label} created.`, body: 'The Draft is consumed and read-only.', testId: 'durable-draft-launch-success' });
      setOutputError(message);
      if (source === 'automatic' && intent) {
        postLaunchEligibility.current = null;
        postLaunchIntent.current = null;
        dispatchPostLaunchNavigation({ type: unavailable ? 'UNAVAILABLE' : 'FAILED', token: intent.token, message });
      }
    } finally {
      if (openingOutputOperation.current === operation) {
        openingOutputOperation.current = null;
        if (mounted.current) setOpeningOutputKey(previous => previous === key ? null : previous);
      }
    }
  };

  const handleOpenOutput = async (type: 'estimate' | 'job', id: string, listDraft?: DurableDraftListPresentation) => {
    if (!canonical && !listDraft) return;
    await openConsumedDraftOutput({
      source: 'manual',
      canonicalState: listDraft ? undefined : canonical ?? undefined,
      listDraft,
      outputType: type,
      outputId: id,
    });
  };

  const handleOpenTarget = (nextTarget: DurableDraftOpenTarget) => {
    const key = openTargetKey(nextTarget);
    if (!key || openingTargetLocks.current.has(key)) return;
    openingTargetLocks.current.add(key);
    setOpeningTargetKey(key);
    onOpenTarget(nextTarget);
  };

  if (mode === 'list') {
    const currentRows = rowsOwner?.client === client && rowsOwner.contractorId === capabilities.contractorId ? rows : [];
    const visibleLegacy = legacyDraftsWithoutDurableMatches(legacyDrafts.filter(isComposerDraftJob), currentRows)
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at) || left.id.localeCompare(right.id));
    const active = currentRows.filter(row => row.status === 'active');
    const consumed = currentRows.filter(row => row.status === 'consumed');
    return (
      <section className="space-y-3" aria-label="Drafts" data-testid="durable-draft-list">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-950">Drafts</h3>
            <p className="mt-1 text-sm text-slate-500">Continue active planning or review recently consumed Drafts.</p>
          </div>
          {capabilities.canPersistDraft ? (
            <button type="button" onClick={onStartNew} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">
              <Plus size={16} /> Start New Draft
            </button>
          ) : null}
        </div>
        <div aria-live="polite" className="sr-only">{listState === 'loading' ? 'Loading Drafts' : ''}</div>
        {capabilityLoading || listState === 'loading' ? (
          <div className="flex min-h-24 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600"><Loader2 className="animate-spin" size={17} /> Loading Drafts…</div>
        ) : capabilityError || listError ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            <span>{capabilityError || listError}</span>
            {!capabilityError ? <button type="button" onClick={() => void loadList()} className="min-h-11 rounded-lg border border-red-300 bg-white px-4 py-2 font-bold text-red-800 hover:bg-red-100">Try Again</button> : null}
          </div>
        ) : active.length + consumed.length + visibleLegacy.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-600">No Drafts yet.</div>
        ) : (
          <div className="space-y-2">
            {active.map(draft => <DurableDraftRow key={draft.draftId} draft={draft} opening={openingTargetKey === `durable:${draft.draftId}`} onOpen={() => handleOpenTarget({ kind: 'durable', draftId: draft.draftId })} onOpenOutput={handleOpenOutput} openingOutputKey={openingOutputKey} />)}
            {visibleLegacy.map(draft => (
              <div key={draft.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between" data-testid="legacy-draft-row">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-950">{draft.name || 'Untitled Draft'}</p><span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">Earlier Draft</span></div>
                  <p className="mt-1 text-sm text-slate-600">{customerLabel(draft)}{propertyLabel(draft) ? ` · ${propertyLabel(draft)}` : ''}</p>
                  <p className="mt-1 text-xs text-slate-500">Updated {formatDraftTime(draft.updated_at)}</p>
                </div>
                <button type="button" disabled={!capabilities.canImportLegacyDraft || openingTargetKey === `legacy:${draft.id}`} title={!capabilities.canImportLegacyDraft ? 'You can view this earlier Draft, but cannot prepare it for editing.' : undefined} onClick={() => handleOpenTarget({ kind: 'legacy', inspectionId: draft.id })} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">{openingTargetKey === `legacy:${draft.id}` ? <><Loader2 className="animate-spin" size={15} /> Preparing Draft…</> : <>Continue Draft <ArrowRight size={15} /></>}</button>
              </div>
            ))}
            {consumed.map(draft => <DurableDraftRow key={draft.draftId} draft={draft} opening={openingTargetKey === `durable:${draft.draftId}`} onOpen={() => handleOpenTarget({ kind: 'durable', draftId: draft.draftId })} onOpenOutput={handleOpenOutput} openingOutputKey={openingOutputKey} />)}
          </div>
        )}
      </section>
    );
  }

  if (editorLoading || capabilityLoading) {
    return <div className="flex min-h-40 items-center justify-center gap-2" aria-live="polite"><Loader2 className="animate-spin" size={18} /> {loadingMessage}</div>;
  }
  if (!form) {
    return <div ref={errorSummaryRef} tabIndex={-1} className="space-y-3 outline-none">{feedback ? <div role="alert" data-testid={feedback.testId} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{feedback.title}</div> : null}<button type="button" onClick={onBack} className="min-h-11 rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold">Back to Work</button></div>;
  }
  if ((launchState.phase === 'lifecycle_unavailable' || launchState.phase === 'reconciling_lifecycle') && canonical?.draft.status === 'active') {
    return (
      <section className="space-y-4" data-testid="durable-draft-lifecycle-unavailable">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4" role="alert">
          <h2 className="text-lg font-bold text-slate-950">Draft status needs confirmation</h2>
          <p className="mt-2 text-sm text-amber-900">{launchState.message || 'ServSync is checking this Draft’s current status.'}</p>
          <p className="mt-1 text-sm text-amber-900">Editing and creation stay unavailable until the canonical Draft status is confirmed.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void handleRetryLifecycleReconciliation()} disabled={durableDraftLaunchIsBusy(launchState)} className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Reload Draft status</button>
          <button type="button" onClick={onBack} className="min-h-11 rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">Back to Work</button>
        </div>
      </section>
    );
  }
  if (launchProof && canonical?.draft.status === 'active') {
    const label = launchProof.output_type === 'estimate' ? 'Estimate' : 'Job';
    return (
      <section className="space-y-4" data-testid="durable-draft-consumed-reconciliation">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h2 className="text-xl font-bold text-slate-950">{label} created</h2>
          <p className="mt-2 text-sm text-slate-700">The Draft is consumed and read-only. ServSync is refreshing its canonical details.</p>
        </div>
        {feedback ? <div role="alert" data-testid={feedback.testId} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p className="font-semibold">{feedback.title}</p>{feedback.body ? <p className="mt-1">{feedback.body}</p> : null}</div> : null}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void handleRetryConsumedReconciliation()} disabled={durableDraftLaunchIsBusy(launchState)} className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Refresh Draft status</button>
          <button type="button" onClick={onBack} className="min-h-11 rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">Back to Work</button>
        </div>
      </section>
    );
  }
  if (canonical && (canonical.draft.status !== 'active' || !capabilities.canPersistDraft)) {
    const outputType = canonical.draft.launchedOutputType;
    const liveOutputId = outputType === 'estimate' ? canonical.draft.launchedEstimateId : canonical.draft.launchedJobId;
    const unavailable = canonical.draft.status === 'consumed' && (!liveOutputId || !outputType);
    const statusLabel = canonical.draft.status === 'consumed'
      ? 'Consumed'
      : canonical.draft.status === 'discarded'
        ? 'Discarded'
        : 'Active Draft · Read only';
    return (
      <section className="space-y-4" data-testid="durable-draft-read-only-summary">
        {feedback ? <div role={feedback.tone === 'error' ? 'alert' : 'status'} data-testid={feedback.testId} className={`rounded-lg border p-3 text-sm ${feedback.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-900'}`}><p className="font-semibold">{feedback.title}</p>{feedback.body ? <p className="mt-1">{feedback.body}</p> : null}</div> : null}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold text-slate-950">{canonical.draft.title || 'Untitled Draft'}</h2><span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-bold text-slate-700">{statusLabel}</span></div>
          <p className="mt-2 text-sm text-slate-600">{canonical.draft.subjectDisplayNameSnapshot}{canonical.draft.propertyDisplaySnapshot ? ` · ${canonical.draft.propertyDisplaySnapshot}` : ''}</p>
          {canonical.draft.launchedAt ? <p className="mt-1 text-xs text-slate-500">Created {outputType === 'estimate' ? 'Estimate' : 'Job'} {formatDraftTime(canonical.draft.launchedAt)}</p> : null}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4"><h3 className="text-sm font-bold text-slate-950">Scope</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{canonical.draft.scopeDescription || 'No scope description saved.'}</p></div>
          <div className="rounded-lg border border-slate-200 p-4"><h3 className="text-sm font-bold text-slate-950">Private notes</h3><p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{canonical.draft.privateNotes || 'No private notes saved.'}</p></div>
        </div>
        <div className="rounded-lg border border-slate-200 p-4"><h3 className="text-sm font-bold text-slate-950">Work items</h3>{canonical.items.length ? <ul className="mt-2 divide-y divide-slate-100">{canonical.items.map(item => <li key={item.rowId} className="py-2 text-sm text-slate-700">{item.title || item.description}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No work items saved.</p>}</div>
        {unavailable ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This Draft created an {outputType === 'estimate' ? 'Estimate' : 'Job'} that is no longer available.</div> : null}
        {outputError ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{outputError}</div> : null}
        <div className="flex flex-wrap gap-2">
          {canonical.draft.status === 'consumed' && outputType && liveOutputId ? (
            <button type="button" disabled={openingOutputKey !== null} onClick={() => void handleOpenOutput(outputType, liveOutputId)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
              {openingOutputKey === `${outputType}:${liveOutputId}` ? <><Loader2 className="animate-spin" size={16} /> Opening…</> : <><FileText size={16} /> Open {outputType === 'estimate' ? 'Estimate' : 'Job'}</>}
            </button>
          ) : null}
          <button type="button" onClick={onBack} className="min-h-11 rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">Back to Work</button>
        </div>
      </section>
    );
  }

  const connectedOptionsWithSavedSelection = draftJobOptionsWithSavedSelection(
    connectedOptions,
    form.homeowner_user_id,
    form.home_id,
    {
      customer: canonical?.draft.subjectDisplayNameSnapshot || 'Saved connected homeowner',
      helper: 'Saved on this Draft; not in the active selector list',
      property: canonical?.draft.propertyDisplaySnapshot || 'Saved property on this Draft',
    },
  );
  const localOptionsWithSavedSelection = draftJobOptionsWithSavedSelection(
    localOptions,
    form.local_contact_id,
    form.local_home_id,
    {
      customer: canonical?.draft.subjectDisplayNameSnapshot || 'Saved local customer',
      helper: 'Saved on this Draft; not in the current selector list',
      property: canonical?.draft.propertyDisplaySnapshot || 'Saved property on this Draft',
    },
  );
  const outputType = form.intended_output;
  const outputAuthority = outputType ? launchCapability(capabilities, outputType) : false;
  const launchBusy = durableDraftLaunchIsBusy(launchState);
  const launchFrozen = !durableDraftLaunchAllowsEditing(launchState);
  const launchLabel = launchEnabled && capabilities.canPersistDraft && outputType
    ? `Create ${outputType === 'estimate' ? 'Estimate' : 'Job'}`
    : null;
  const recoveryLabel = durableDraftLaunchCanRetry(launchState) && outputType
    ? `Retry Create ${outputType === 'estimate' ? 'Estimate' : 'Job'}`
    : launchState.phase === 'preparing' && launchState.idempotencyKey && outputType
      ? `Continue Create ${outputType === 'estimate' ? 'Estimate' : 'Job'}`
      : null;
  const launchDisabledReason = outputType && launchEnabled && capabilities.canPersistDraft && !outputAuthority
    ? `Your current access does not allow creating this ${outputType === 'estimate' ? 'Estimate' : 'Job'}. You can still save the Draft.`
    : launchState.phase === 'permission_denied'
      ? launchState.message
    : launchState.phase === 'storage_unavailable'
      ? launchState.message
    : launchState.phase === 'ambiguous'
      ? launchState.message
      : launchState.phase === 'lifecycle_unavailable' || launchState.phase === 'reconciliation_failed'
        ? launchState.message
        : '';
  const selectedOptions = form.subject_type === 'connected' ? connectedOptionsWithSavedSelection : localOptionsWithSavedSelection;
  const selectedCustomerId = form.subject_type === 'connected' ? form.homeowner_user_id : form.local_contact_id;
  const selectedPropertyId = form.subject_type === 'connected' ? form.home_id : form.local_home_id;
  const confirmationCustomer = selectedOptions.find(option => option.id === selectedCustomerId);
  const confirmationProperty = confirmationCustomer?.properties.find(property => property.id === selectedPropertyId);

  return (
    <div className="space-y-3">
      <div ref={errorSummaryRef} tabIndex={-1} className="outline-none" />
      <div aria-live="polite" className="sr-only">{saveState === 'saving' ? 'Saving Draft' : launchState.phase === 'preparing' ? 'Preparing launch protection' : launchState.phase === 'launching' ? `Creating ${outputType === 'estimate' ? 'Estimate' : 'Job'}` : launchState.phase === 'reconciling_consumed' || launchState.phase === 'reconciling_lifecycle' ? 'Refreshing canonical Draft status' : saveState === 'saved' ? 'Draft saved' : saveState === 'failed' ? 'Draft save failed' : ''}</div>
      <ContractorDraftComposer
        draft={form}
        connectedOptions={connectedOptionsWithSavedSelection}
        localOptions={localOptionsWithSavedSelection}
        currentDraftId={canonical?.draft.draftId ?? null}
        canSave={capabilities.canPersistDraft && saveState !== 'saving'}
        saving={saveState === 'saving'}
        interactionDisabled={launchFrozen}
        launchLabel={launchLabel}
        launchDisabled={!outputAuthority || launchBusy || saveState === 'saving' || launchState.phase === 'permission_denied' || launchState.phase === 'storage_unavailable'}
        launchDisabledReason={launchDisabledReason}
        launchBusy={launchBusy}
        launchRecoveryLabel={recoveryLabel}
        feedback={feedback}
        onChange={handleChange}
        onSave={() => void handleSave()}
        onLaunch={handleOpenLaunchConfirmation}
        onDiscardPreparedLaunch={launchState.phase === 'preparing' && launchState.idempotencyKey ? handleDiscardPreparedLaunch : undefined}
        onBack={handleBack}
        onRemovePersistedLine={id => setRemovedItemIds(previous => previous.includes(id) ? previous : [...previous, id])}
      />
      {launchState.phase === 'storage_unavailable' ? <button type="button" onClick={() => {
        if (!canonical?.draft.draftId || !capabilities.contractorId) return;
        const storage = browserLaunchAttemptStorage();
        if (!storage) return;
        const result = readDurableDraftLaunchAttempt(storage, capabilities.contractorId, canonical.draft.draftId);
        if (result.status === 'absent' && !launchState.recoveryLocked) {
          recoveredAttemptKey.current = null;
          dispatchLaunch({ type: 'RESET' });
          setFeedback(null);
        } else if (result.status === 'found' && result.attempt.phase === 'succeeded') {
          reconcileRecoveredAttempt.current(result.attempt, true);
        } else if (result.status === 'found') {
          if (canonical.draft.intendedOutput && result.attempt.outputType !== canonical.draft.intendedOutput) {
            dispatchLaunch({ type: 'RECOVERY_CONFLICT', outputType: result.attempt.outputType, draftId: result.attempt.draftId, idempotencyKey: result.attempt.idempotencyKey, message: 'ServSync found a saved output attempt that does not match this Draft. Reload the canonical Draft status before continuing.' });
          } else {
            applyExternalLaunchTransition({
              type: 'EXTERNAL_ATTEMPT',
              outputType: result.attempt.outputType,
              phase: result.attempt.phase === 'prepared' ? 'preparing' : result.attempt.phase === 'launching' ? 'launching' : 'ambiguous',
              draftId: result.attempt.draftId,
              idempotencyKey: result.attempt.idempotencyKey,
              message: result.attempt.phase === 'prepared' ? 'An unused launch attempt is ready to continue.' : 'ServSync could not confirm whether the output was created.',
            });
          }
        }
      }} className="min-h-11 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-900">Recheck retry protection</button> : null}
      <DurableDraftLaunchConfirmation
        open={launchState.phase === 'confirming'}
        outputType={launchState.outputType}
        title={form.title}
        customer={confirmationCustomer?.label ?? canonical?.draft.subjectDisplayNameSnapshot ?? ''}
        property={confirmationProperty?.label ?? canonical?.draft.propertyDisplaySnapshot ?? ''}
        itemCount={form.line_items.length}
        busy={Boolean(launchOperation.current)}
        onCancel={() => dispatchLaunch({ type: 'CANCEL_CONFIRMATION' })}
        onConfirm={() => void handleConfirmLaunch()}
      />
    </div>
  );
}

function DurableDraftRow({ draft, opening, onOpen, onOpenOutput, openingOutputKey }: {
  draft: DurableDraftListPresentation;
  opening: boolean;
  onOpen: () => void;
  onOpenOutput: (type: 'estimate' | 'job', id: string, draft: DurableDraftListPresentation) => Promise<void>;
  openingOutputKey: string | null;
}) {
  const consumed = draft.status === 'consumed';
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between" data-testid={`durable-draft-row-${draft.status}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-950">{draft.title || 'Untitled Draft'}</p><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${consumed ? 'bg-slate-100 text-slate-700' : 'bg-blue-50 text-blue-700'}`}>{consumed ? 'Consumed' : 'Active Draft'}</span>{draft.intendedOutput ? <span className="text-xs font-semibold text-slate-500">{draft.intendedOutput === 'estimate' ? 'Estimate' : 'Job'} planned</span> : null}</div>
        <p className="mt-1 text-sm text-slate-600">{draft.subjectLabel || 'Customer'}{draft.propertyLabel ? ` · ${draft.propertyLabel}` : ''}</p>
        <p className="mt-1 text-xs text-slate-500">{consumed ? `${outputLabel(draft)} created ${formatDraftTime(draft.launchedAt)}` : `Updated ${formatDraftTime(draft.updatedAt)}`}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={opening} onClick={onOpen} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">{opening ? <><Loader2 className="animate-spin" size={15} /> Opening Draft…</> : <>{consumed ? 'View Draft' : 'Continue Draft'} <ArrowRight size={15} /></>}</button>
        {consumed && draft.outputAvailable && draft.launchedOutputType && draft.liveOutputId ? (
          <button type="button" disabled={openingOutputKey !== null} onClick={() => void onOpenOutput(draft.launchedOutputType as 'estimate' | 'job', draft.liveOutputId as string, draft)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">{openingOutputKey === `${draft.launchedOutputType}:${draft.liveOutputId}` ? 'Opening…' : `Open ${outputLabel(draft)}`}</button>
        ) : consumed ? <span className="self-center text-xs font-semibold text-amber-700">Output unavailable</span> : null}
      </div>
    </div>
  );
}
