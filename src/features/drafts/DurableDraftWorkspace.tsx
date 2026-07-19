import { useEffect, useRef, useState } from 'react';
import { ArrowRight, FileText, Loader2, Plus } from 'lucide-react';
import type { Inspection } from '../../types';
import type { DraftJobCustomerOption } from '../jobs/DraftJobComposer';
import { draftJobOptionsWithSavedSelection } from '../jobs/draftJobMappings';
import { isComposerDraftJob } from '../jobs/jobRecordSelectors';
import { ContractorDraftComposer } from './ContractorDraftComposer';
import {
  getContractorWorkDraft,
  importLegacyContractorWorkDraft,
  listContractorWorkDrafts,
  saveContractorWorkDraft,
  type DurableDraftSupabaseClient,
} from './durableDraftLaunchApi';
import type { DurableDraftCompatibilityCapabilities } from './durableDraftLaunchTypes';
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
  onOpenOutput: (type: 'estimate' | 'job', id: string) => Promise<void>;
};

function formatDraftTime(value: string | null) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function outputLabel(draft: DurableDraftListPresentation) {
  return draft.launchedOutputType === 'estimate' ? 'Estimate' : draft.launchedOutputType === 'job' ? 'Job' : 'Output';
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
  onOpenOutput,
}: DurableDraftWorkspaceProps) {
  const [rows, setRows] = useState<DurableDraftListPresentation[]>([]);
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [listError, setListError] = useState('');
  const [canonical, setCanonical] = useState<DurableDraftCanonicalState | null>(null);
  const [form, setForm] = useState<SharedDraftComposerDraft | null>(null);
  const [removedItemIds, setRemovedItemIds] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<'clean' | 'dirty' | 'saving' | 'saved' | 'failed'>('clean');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error' | 'info'; title: string; body?: string; testId?: string } | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('Loading Draft…');
  const [editorLoading, setEditorLoading] = useState(mode === 'editor');
  const [outputError, setOutputError] = useState('');
  const saveLock = useRef(false);
  const errorSummaryRef = useRef<HTMLDivElement | null>(null);

  const loadList = async () => {
    if (!capabilities.canReadDrafts) {
      setRows([]);
      setListState('ready');
      return;
    }
    setListState('loading');
    setListError('');
    try {
      const listRows = await listContractorWorkDrafts(client, { statuses: ['active', 'consumed'] });
      setRows(durableDraftListRowsToPresentation(listRows));
      setListState('ready');
    } catch (error) {
      setListError(durableDraftSafeMessage(error, 'list'));
      setListState('error');
    }
  };

  useEffect(() => {
    if (mode !== 'list' || capabilityLoading) return;
    void loadList();
  }, [mode, capabilityLoading, capabilities.canReadDrafts]);

  useEffect(() => {
    if (mode !== 'editor' || !target || capabilityLoading) return;
    let cancelled = false;
    const open = async () => {
      setEditorLoading(true);
      setFeedback(null);
      setOutputError('');
      try {
        if (target.kind === 'new') {
          if (!capabilities.canPersistDraft) throw new Error('DRAFT_PERMISSION_DENIED');
          if (cancelled) return;
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
          draftId = imported.draft_id;
        }
        if (!draftId) throw new Error('DRAFT_RESPONSE_INVALID');
        setLoadingMessage('Loading Draft…');
        const envelope = await getContractorWorkDraft(client, draftId);
        if (cancelled) return;
        const nextCanonical = canonicalStateFromEnvelope(envelope);
        setCanonical(nextCanonical);
        setForm(durableCanonicalStateToComposer(nextCanonical));
        setRemovedItemIds([]);
        setDirty(false);
        setSaveState('clean');
      } catch (error) {
        if (cancelled) return;
        const phase = target.kind === 'legacy' ? 'import' : 'get';
        setFeedback({ tone: 'error', title: durableDraftSafeMessage(error, phase), testId: 'durable-draft-open-error' });
        setForm(null);
        queueMicrotask(() => errorSummaryRef.current?.focus());
      } finally {
        if (!cancelled) setEditorLoading(false);
      }
    };
    void open();
    return () => { cancelled = true; };
  }, [mode, target, capabilityLoading, capabilities.canImportLegacyDraft, capabilities.canPersistDraft]);

  const handleChange = (next: SharedDraftComposerDraft) => {
    if (canonical?.draft.status && canonical.draft.status !== 'active') return;
    setForm(next);
    setDirty(true);
    setSaveState('dirty');
    setFeedback(null);
  };

  const handleSave = async () => {
    if (!form || !capabilities.contractorId || !capabilities.canPersistDraft || saveLock.current) return;
    const validation = validateSharedDraftComposerDraftForSave(form);
    if (validation) {
      setFeedback({ tone: 'error', title: validation, testId: 'durable-draft-save-error' });
      setSaveState('failed');
      queueMicrotask(() => errorSummaryRef.current?.focus());
      return;
    }
    saveLock.current = true;
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
      setCanonical(reconciled);
      setForm(durableCanonicalStateToComposer(reconciled));
      setRemovedItemIds([]);
      setDirty(false);
      setSaveState('saved');
      setFeedback({
        tone: 'success',
        title: 'Draft saved.',
        body: 'Your contractor-only planning details are up to date.',
        testId: 'durable-draft-save-success',
      });
    } catch (error) {
      setSaveState('failed');
      setFeedback({ tone: 'error', title: durableDraftSafeMessage(error, 'save'), testId: 'durable-draft-save-error' });
      queueMicrotask(() => errorSummaryRef.current?.focus());
    } finally {
      saveLock.current = false;
    }
  };

  const handleBack = () => {
    if (dirty && !window.confirm('Discard unsaved local changes and return to Work? The last saved Draft will remain available.')) return;
    onBack();
  };

  const handleOpenOutput = async (type: 'estimate' | 'job', id: string) => {
    setOutputError('');
    try {
      await onOpenOutput(type, id);
    } catch {
      setOutputError(`The ${type === 'estimate' ? 'Estimate' : 'Job'} could not be opened. Try again.`);
    }
  };

  if (mode === 'list') {
    const visibleLegacy = legacyDraftsWithoutDurableMatches(legacyDrafts.filter(isComposerDraftJob), rows)
      .sort((left, right) => right.updated_at.localeCompare(left.updated_at) || left.id.localeCompare(right.id));
    const active = rows.filter(row => row.status === 'active');
    const consumed = rows.filter(row => row.status === 'consumed');
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
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{capabilityError || listError}</div>
        ) : active.length + consumed.length + visibleLegacy.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-600">No Drafts yet.</div>
        ) : (
          <div className="space-y-2">
            {active.map(draft => <DurableDraftRow key={draft.draftId} draft={draft} onOpen={() => onOpenTarget({ kind: 'durable', draftId: draft.draftId })} onOpenOutput={handleOpenOutput} />)}
            {visibleLegacy.map(draft => (
              <div key={draft.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between" data-testid="legacy-draft-row">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-950">{draft.name || 'Untitled Draft'}</p><span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">Earlier Draft</span></div>
                  <p className="mt-1 text-sm text-slate-600">{customerLabel(draft)}{propertyLabel(draft) ? ` · ${propertyLabel(draft)}` : ''}</p>
                  <p className="mt-1 text-xs text-slate-500">Updated {formatDraftTime(draft.updated_at)}</p>
                </div>
                <button type="button" disabled={!capabilities.canImportLegacyDraft} title={!capabilities.canImportLegacyDraft ? 'You can view this earlier Draft, but cannot prepare it for editing.' : undefined} onClick={() => onOpenTarget({ kind: 'legacy', inspectionId: draft.id })} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Continue Draft <ArrowRight size={15} /></button>
              </div>
            ))}
            {consumed.map(draft => <DurableDraftRow key={draft.draftId} draft={draft} onOpen={() => onOpenTarget({ kind: 'durable', draftId: draft.draftId })} onOpenOutput={handleOpenOutput} />)}
          </div>
        )}
      </section>
    );
  }

  if (editorLoading || capabilityLoading) {
    return <div className="flex min-h-40 items-center justify-center gap-2" aria-live="polite"><Loader2 className="animate-spin" size={18} /> {loadingMessage}</div>;
  }
  if (!form) {
    return <div ref={errorSummaryRef} tabIndex={-1} className="space-y-3 outline-none">{feedback ? <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{feedback.title}</div> : null}<button type="button" onClick={onBack} className="min-h-11 rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold">Back to Work</button></div>;
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
          {canonical.draft.status === 'consumed' && outputType && liveOutputId ? <button type="button" onClick={() => void handleOpenOutput(outputType, liveOutputId)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white"><FileText size={16} /> Open {outputType === 'estimate' ? 'Estimate' : 'Job'}</button> : null}
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

  return (
    <div className="space-y-3">
      <div ref={errorSummaryRef} tabIndex={-1} className="outline-none" />
      <div aria-live="polite" className="sr-only">{saveState === 'saving' ? 'Saving Draft' : saveState === 'saved' ? 'Draft saved' : saveState === 'failed' ? 'Draft save failed' : ''}</div>
      <ContractorDraftComposer
        draft={form}
        connectedOptions={connectedOptionsWithSavedSelection}
        localOptions={localOptionsWithSavedSelection}
        currentDraftId={canonical?.draft.draftId ?? null}
        canSave={capabilities.canPersistDraft && saveState !== 'saving'}
        saving={saveState === 'saving'}
        feedback={feedback}
        onChange={handleChange}
        onSave={() => void handleSave()}
        onBack={handleBack}
        onRemovePersistedLine={id => setRemovedItemIds(previous => previous.includes(id) ? previous : [...previous, id])}
      />
    </div>
  );
}

function DurableDraftRow({ draft, onOpen, onOpenOutput }: {
  draft: DurableDraftListPresentation;
  onOpen: () => void;
  onOpenOutput: (type: 'estimate' | 'job', id: string) => Promise<void>;
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
        <button type="button" onClick={onOpen} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">{consumed ? 'View Draft' : 'Continue Draft'} <ArrowRight size={15} /></button>
        {consumed && draft.outputAvailable && draft.launchedOutputType && draft.liveOutputId ? (
          <button type="button" onClick={() => void onOpenOutput(draft.launchedOutputType as 'estimate' | 'job', draft.liveOutputId as string)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700">Open {outputLabel(draft)}</button>
        ) : consumed ? <span className="self-center text-xs font-semibold text-amber-700">Output unavailable</span> : null}
      </div>
    </div>
  );
}
