import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, Plus, RefreshCw, Save } from 'lucide-react';
import {
  createTradeSectionAdapter,
  TradeSectionAdapterError,
  type TradeSectionRpcClient,
} from './tradeSectionAdapter';
import {
  emptyTradeSectionForm,
  formValuesFromPersisted,
  persistedValuesFromForm,
  type TradeSectionDefinition,
  type TradeSectionField,
  type TradeSectionFormValue,
  type TradeSectionInstance,
  type TradeSectionWorkType,
} from './tradeSectionContracts';
import {
  shouldMountTradeSectionJobPanel,
  tradeSectionRoleAccess,
  type TradeSectionContractorRole,
} from './tradeSectionAvailability';

type LoadState = 'loading' | 'ready' | 'error' | 'unauthorized';
type MutationState = { kind: 'error' | 'stale' | 'ambiguous'; message: string } | null;

type Props = {
  client: TradeSectionRpcClient;
  contractorId: string;
  jobId: string;
  jobStatus: string | null | undefined;
  recordStatus: string | null | undefined;
  role: TradeSectionContractorRole;
  enabled: boolean;
};

function errorState(error: unknown): { load: LoadState; message: string } {
  if (error instanceof TradeSectionAdapterError && error.kind === 'unauthorized') {
    return { load: 'unauthorized', message: error.message };
  }
  return {
    load: 'error',
    message: error instanceof Error ? error.message : 'ServSync could not load Trade Sections.',
  };
}

function mutationState(error: unknown): MutationState {
  if (error instanceof TradeSectionAdapterError) {
    if (error.kind === 'stale') return { kind: 'stale', message: error.message };
    if (error.kind === 'ambiguous') return { kind: 'ambiguous', message: error.message };
    return { kind: 'error', message: error.message };
  }
  return { kind: 'error', message: error instanceof Error ? error.message : 'ServSync could not save this Trade Section.' };
}

function FieldControl(props: {
  field: TradeSectionField;
  value: TradeSectionFormValue;
  disabled: boolean;
  onChange: (value: TradeSectionFormValue) => void;
}) {
  const { field, value, disabled, onChange } = props;
  const label = `${field.label}${field.required ? ' *' : ''}`;
  if (field.valueType === 'boolean') {
    return (
      <label className="flex min-h-11 items-center gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800">
        <input
          type="checkbox"
          checked={value === true}
          disabled={disabled}
          onChange={event => onChange(event.target.checked)}
          className="h-4 w-4 accent-blue-600"
        />
        <span className="min-w-0">
          <span className="font-semibold">{label}</span>
          {field.description && <span className="mt-0.5 block text-xs text-slate-500">{field.description}</span>}
        </span>
      </label>
    );
  }

  return (
    <label className="block min-w-0 text-sm font-semibold text-slate-800">
      <span>{label}</span>
      {field.description && <span className="mt-0.5 block text-xs font-normal text-slate-500">{field.description}</span>}
      <div className="mt-1.5 flex min-w-0 items-center gap-2">
        {field.valueType === 'choice' ? (
          <select
            value={typeof value === 'string' ? value : ''}
            disabled={disabled}
            onChange={event => onChange(event.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm disabled:bg-slate-50"
          >
            <option value="">Select an option</option>
            {field.options.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        ) : (
          <input
            type={field.valueType === 'number' ? 'number' : 'text'}
            inputMode={field.valueType === 'number' ? 'decimal' : undefined}
            value={typeof value === 'string' ? value : ''}
            disabled={disabled}
            maxLength={field.valueType === 'text' ? 2000 : undefined}
            onChange={event => onChange(event.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm disabled:bg-slate-50"
          />
        )}
        {field.unit && <span className="shrink-0 text-xs font-medium text-slate-500">{field.unit}</span>}
      </div>
    </label>
  );
}

function TradeSectionFields(props: {
  definition: TradeSectionDefinition;
  values: Record<string, TradeSectionFormValue>;
  disabled: boolean;
  onChange: (key: string, value: TradeSectionFormValue) => void;
}) {
  if (props.definition.fields.length === 0) {
    return <p className="text-sm text-slate-500">This section has no reading or test fields.</p>;
  }
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      {props.definition.fields.map(field => (
        <FieldControl
          key={field.key}
          field={field}
          value={props.values[field.key] ?? (field.valueType === 'boolean' ? false : '')}
          disabled={props.disabled}
          onChange={value => props.onChange(field.key, value)}
        />
      ))}
    </div>
  );
}

export function TradeSectionJobPanel(props: Props) {
  const access = tradeSectionRoleAccess(props.role);
  const mountAllowed = shouldMountTradeSectionJobPanel({
    enabled: props.enabled,
    role: props.role,
    jobStatus: props.jobStatus,
    recordStatus: props.recordStatus,
  });
  const adapter = useMemo(() => createTradeSectionAdapter(props.client), [props.client]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadMessage, setLoadMessage] = useState('');
  const [workTypes, setWorkTypes] = useState<TradeSectionWorkType[]>([]);
  const [instances, setInstances] = useState<TradeSectionInstance[]>([]);
  const [forms, setForms] = useState<Record<string, Record<string, TradeSectionFormValue>>>({});
  const [selectedWorkTypeKey, setSelectedWorkTypeKey] = useState('');
  const [createForm, setCreateForm] = useState<Record<string, TradeSectionFormValue>>({});
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [createMutation, setCreateMutation] = useState<MutationState>(null);
  const [instanceMutations, setInstanceMutations] = useState<Record<string, MutationState>>({});
  const [reconciliationRequired, setReconciliationRequired] = useState(false);
  const generation = useRef(0);
  const createAttempt = useRef<{ signature: string; idempotencyKey: string; sectionOrder: number } | null>(null);

  const supportedWorkTypes = useMemo(
    () => workTypes.filter(workType => workType.definition.supported),
    [workTypes],
  );
  const unsupportedWorkTypes = useMemo(
    () => workTypes.filter(workType => !workType.definition.supported),
    [workTypes],
  );
  const selectedWorkType = supportedWorkTypes.find(workType => workType.workTypeKey === selectedWorkTypeKey) ?? null;

  const load = useCallback(async (replaceForms: boolean) => {
    const requestGeneration = ++generation.current;
    setLoadState('loading');
    setLoadMessage('');
    try {
      const [nextInstances, nextWorkTypes] = await Promise.all([
        adapter.listJobInstances(props.contractorId, props.jobId),
        access.canMutate ? adapter.listAvailableWorkTypes(props.contractorId) : Promise.resolve([]),
      ]);
      if (requestGeneration !== generation.current) return;
      setInstances(nextInstances);
      setWorkTypes(nextWorkTypes);
      setForms(previous => {
        const next = { ...previous };
        for (const instance of nextInstances) {
          if (replaceForms || !next[instance.id]) next[instance.id] = formValuesFromPersisted(instance);
        }
        return next;
      });
      setInstanceMutations({});
      setCreateMutation(null);
      setReconciliationRequired(false);
      setLoadState('ready');
    } catch (error) {
      if (requestGeneration !== generation.current) return;
      const next = errorState(error);
      setLoadState(next.load);
      setLoadMessage(next.message);
    }
  }, [access.canMutate, adapter, props.contractorId, props.jobId]);

  useEffect(() => {
    if (!mountAllowed) return undefined;
    void load(true);
    return () => { generation.current += 1; };
  }, [load, mountAllowed]);

  useEffect(() => {
    if (supportedWorkTypes.length === 0) {
      setSelectedWorkTypeKey('');
      setCreateForm({});
      return;
    }
    if (!supportedWorkTypes.some(workType => workType.workTypeKey === selectedWorkTypeKey)) {
      const first = supportedWorkTypes[0];
      setSelectedWorkTypeKey(first.workTypeKey);
      setCreateForm(emptyTradeSectionForm(first.definition));
    }
  }, [selectedWorkTypeKey, supportedWorkTypes]);

  if (!mountAllowed) return null;

  const selectWorkType = (workTypeKey: string) => {
    const workType = supportedWorkTypes.find(candidate => candidate.workTypeKey === workTypeKey) ?? null;
    setSelectedWorkTypeKey(workTypeKey);
    setCreateForm(workType ? emptyTradeSectionForm(workType.definition) : {});
    setCreateMutation(null);
    createAttempt.current = null;
  };

  const createSection = async () => {
    if (!selectedWorkType || creating || reconciliationRequired) return;
    let values: Record<string, unknown>;
    try {
      values = persistedValuesFromForm(selectedWorkType.definition, createForm);
    } catch (error) {
      setCreateMutation({ kind: 'error', message: error instanceof Error ? error.message : 'Check this section before saving.' });
      return;
    }
    const signature = JSON.stringify({
      jobId: props.jobId,
      workTypeKey: selectedWorkType.workTypeKey,
      versionNumber: selectedWorkType.versionNumber,
      values,
    });
    if (!createAttempt.current || createAttempt.current.signature !== signature) {
      createAttempt.current = {
        signature,
        idempotencyKey: crypto.randomUUID(),
        sectionOrder: Math.min(999, instances.reduce((max, instance) => Math.max(max, instance.sectionOrder), -1) + 1),
      };
    }
    setCreating(true);
    setCreateMutation(null);
    try {
      const created = await adapter.createJobInstance({
        contractorId: props.contractorId,
        jobId: props.jobId,
        workTypeKey: selectedWorkType.workTypeKey,
        versionNumber: selectedWorkType.versionNumber,
        values,
        sectionOrder: createAttempt.current.sectionOrder,
        idempotencyKey: createAttempt.current.idempotencyKey,
      });
      setInstances(previous => [
        ...previous.filter(instance => instance.id !== created.id),
        created,
      ].sort((a, b) => a.sectionOrder - b.sectionOrder));
      setForms(previous => ({ ...previous, [created.id]: formValuesFromPersisted(created) }));
      setCreateForm(emptyTradeSectionForm(selectedWorkType.definition));
      createAttempt.current = null;
    } catch (error) {
      const next = mutationState(error);
      setCreateMutation(next);
      if (next?.kind === 'ambiguous'
        || next?.kind === 'stale'
        || (error instanceof TradeSectionAdapterError && error.kind === 'unauthorized')) {
        setReconciliationRequired(true);
      }
    } finally {
      setCreating(false);
    }
  };

  const saveInstance = async (instance: TradeSectionInstance) => {
    if (savingId || reconciliationRequired || instance.lifecycleStatus !== 'active') return;
    let values: Record<string, unknown>;
    try {
      values = persistedValuesFromForm(instance.definition, forms[instance.id] ?? {});
    } catch (error) {
      setInstanceMutations(previous => ({
        ...previous,
        [instance.id]: { kind: 'error', message: error instanceof Error ? error.message : 'Check this section before saving.' },
      }));
      return;
    }
    setSavingId(instance.id);
    setInstanceMutations(previous => ({ ...previous, [instance.id]: null }));
    try {
      const updated = await adapter.updateValues({
        contractorId: props.contractorId,
        jobId: props.jobId,
        instanceId: instance.id,
        expectedRevision: instance.revisionNumber,
        values,
      });
      setInstances(previous => previous.map(item => item.id === updated.id ? updated : item));
      setForms(previous => ({ ...previous, [updated.id]: formValuesFromPersisted(updated) }));
    } catch (error) {
      const next = mutationState(error);
      setInstanceMutations(previous => ({ ...previous, [instance.id]: next }));
      if (next?.kind === 'ambiguous'
        || next?.kind === 'stale'
        || (error instanceof TradeSectionAdapterError && error.kind === 'unauthorized')) {
        setReconciliationRequired(true);
      }
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section data-testid="trade-section-job-panel" className="min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-950">Trade Sections</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">Structured readings and tests for this Job.</p>
        </div>
        {access.canMutate ? (
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Contractor private</span>
        ) : (
          <span data-testid="trade-section-read-only" className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Read only</span>
        )}
      </div>

      <div className="min-w-0 space-y-4 p-4 sm:p-5">
        {loadState === 'loading' && (
          <div data-testid="trade-section-loading" className="min-h-20 rounded-md bg-slate-50 p-4 text-sm text-slate-500">Loading Trade Sections...</div>
        )}
        {(loadState === 'error' || loadState === 'unauthorized') && (
          <div data-testid={loadState === 'unauthorized' ? 'trade-section-unauthorized' : 'trade-section-load-error'} role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p>{loadMessage}</p>
            <button type="button" onClick={() => void load(true)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold">
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        )}

        {loadState === 'ready' && (
          <>
            {reconciliationRequired && (
              <div data-testid="trade-section-reconciliation-required" role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                <div className="flex items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><p>Reload the latest Trade Sections before making another change. Unsaved input remains here until you reload.</p></div>
                <button type="button" onClick={() => void load(true)} className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-md border border-amber-300 bg-white px-3 font-semibold">
                  <RefreshCw size={14} /> Reload latest
                </button>
              </div>
            )}

            {instances.length === 0 && supportedWorkTypes.length === 0 && unsupportedWorkTypes.length === 0 && (
              <div data-testid="trade-section-empty" className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                {access.canMutate ? 'No Trade Section work types are available for this contractor.' : 'No Trade Sections are recorded for this Job.'}
              </div>
            )}
            {unsupportedWorkTypes.length > 0 && supportedWorkTypes.length === 0 && (
              <div data-testid="trade-section-unsupported-schema" role="status" className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                Available Trade Sections use content that this runtime slice does not support.
              </div>
            )}

            {instances.map(instance => {
              const state = instanceMutations[instance.id];
              const editable = access.canMutate && instance.lifecycleStatus === 'active' && instance.definition.supported && !reconciliationRequired;
              return (
                <div key={instance.id} data-testid="trade-section-instance" className="min-w-0 border-t border-slate-200 pt-4 first:border-t-0 first:pt-0">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="break-words text-sm font-bold text-slate-900">{instance.definition.label}</h4>
                      {instance.definition.description && <p className="mt-1 text-xs leading-5 text-slate-500">{instance.definition.description}</p>}
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold capitalize text-slate-600">{instance.lifecycleStatus}</span>
                  </div>
                  {!instance.definition.supported ? (
                    <p data-testid="trade-section-instance-unsupported" className="rounded-md bg-amber-50 p-3 text-sm text-amber-950">{instance.definition.unsupportedReason}</p>
                  ) : (
                    <TradeSectionFields
                      definition={instance.definition}
                      values={forms[instance.id] ?? formValuesFromPersisted(instance)}
                      disabled={!editable}
                      onChange={(key, value) => setForms(previous => ({
                        ...previous,
                        [instance.id]: { ...(previous[instance.id] ?? formValuesFromPersisted(instance)), [key]: value },
                      }))}
                    />
                  )}
                  {state && <p data-testid={`trade-section-${state.kind}`} role="alert" className="mt-3 text-sm font-medium text-amber-800">{state.message}</p>}
                  {editable && (
                    <button type="button" onClick={() => void saveInstance(instance)} disabled={savingId !== null} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto">
                      <Save size={15} /> {savingId === instance.id ? 'Saving...' : 'Save section'}
                    </button>
                  )}
                  {!editable && access.canMutate && instance.lifecycleStatus !== 'active' && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-500"><Check size={13} /> This section is no longer editable.</p>
                  )}
                </div>
              );
            })}

            {access.canMutate && supportedWorkTypes.length > 0 && (
              <div data-testid="trade-section-create" className="min-w-0 border-t border-slate-200 pt-4">
                <div className="mb-4 flex flex-wrap items-end gap-3">
                  <label className="min-w-0 flex-1 text-sm font-semibold text-slate-800">
                    Add a Trade Section
                    <select value={selectedWorkTypeKey} onChange={event => selectWorkType(event.target.value)} disabled={creating || reconciliationRequired} className="mt-1.5 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
                      {supportedWorkTypes.map(workType => <option key={workType.workTypeKey} value={workType.workTypeKey}>{workType.displayName}</option>)}
                    </select>
                  </label>
                </div>
                {selectedWorkType && (
                  <TradeSectionFields
                    definition={selectedWorkType.definition}
                    values={createForm}
                    disabled={creating || reconciliationRequired}
                    onChange={(key, value) => setCreateForm(previous => ({ ...previous, [key]: value }))}
                  />
                )}
                {createMutation && <p data-testid={`trade-section-create-${createMutation.kind}`} role="alert" className="mt-3 text-sm font-medium text-amber-800">{createMutation.message}</p>}
                <button type="button" onClick={() => void createSection()} disabled={!selectedWorkType || creating || reconciliationRequired} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto">
                  <Plus size={15} /> {creating ? 'Adding...' : 'Add section'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
