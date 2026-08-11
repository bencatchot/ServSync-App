import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, RefreshCw, Save } from 'lucide-react';
import type { MarketingDirection, MarketingDirectionsState } from './marketingDirections';

const inputClass = 'min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100';
const textareaClass = `${inputClass} min-h-24 resize-y`;

function lines(value: string[]) {
  return value.join('\n');
}

function splitLines(value: string) {
  return Array.from(new Set(value.split('\n').map(item => item.trim()).filter(Boolean)));
}

function editableFingerprint(direction: MarketingDirection) {
  return JSON.stringify({
    objective: direction.objective,
    statement: direction.statement,
    centralMessage: direction.centralMessage,
    supportingPoints: direction.supportingPoints,
    cautions: direction.cautions,
    correctedAssumptions: direction.correctedAssumptions,
    recommendationRationale: direction.recommendationRationale,
  });
}

function DirectionDetail({
  direction,
  saving,
  onUpdate,
  onApprove,
}: {
  direction: MarketingDirection;
  saving: boolean;
  onUpdate: (direction: MarketingDirection) => Promise<void>;
  onApprove: (direction: MarketingDirection) => Promise<void>;
}) {
  const [draft, setDraft] = useState(direction);
  const [notice, setNotice] = useState<string | null>(null);
  const readOnly = direction.status === 'approved';
  const dirty = editableFingerprint(draft) !== editableFingerprint(direction);

  useEffect(() => {
    setDraft(direction);
    setNotice(null);
  }, [direction]);

  const update = <K extends keyof MarketingDirection>(key: K, value: MarketingDirection[K]) => {
    setNotice(null);
    setDraft(current => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setNotice(null);
    try {
      await onUpdate(draft);
      setNotice('Marketing Direction saved.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'ServSync could not save this Marketing Direction.');
    }
  };

  const approve = async () => {
    setNotice(null);
    try {
      await onApprove(draft);
      setNotice('Marketing Direction approved. No content was created.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'ServSync could not approve this Marketing Direction.');
    }
  };

  return (
    <section data-testid="marketing-direction-detail" className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase text-slate-500">Plan item {direction.sourcePlanItemIndex}</p>
          <h3 className="mt-1 text-base font-bold text-slate-950">{direction.sourcePlanItem.audience} · {direction.topic}</h3>
          <p className="mt-1 text-sm text-slate-500">{direction.contentRole.replace(/_/g, ' ')} · Revision {direction.revisionNumber}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${readOnly ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
          {readOnly ? 'Approved' : 'Draft'}
        </span>
      </div>

      <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-bold uppercase text-slate-500">Accepted Plan intent</p>
        <p className="mt-1 text-sm leading-6 text-slate-700">{direction.sourcePlanItem.direction}</p>
        {direction.ownerInput && (
          <><p className="mt-3 text-xs font-bold uppercase text-slate-500">Owner input</p><p className="mt-1 text-sm leading-6 text-slate-700">{direction.ownerInput}</p></>
        )}
        {direction.correctedAssumptions.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-bold uppercase text-slate-500">Recorded assumption corrections</p>
            <ul className="mt-1 space-y-1 text-sm leading-6 text-slate-700">
              {direction.correctedAssumptions.map(correction => <li key={correction.code}>{correction.correction}</li>)}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-4">
        <label>
          <span className="text-sm font-semibold text-slate-800">Objective</span>
          <textarea disabled={readOnly} value={draft.objective} onChange={event => update('objective', event.target.value)} className={textareaClass} maxLength={240} />
        </label>
        <label>
          <span className="text-sm font-semibold text-slate-800">Direction</span>
          <textarea disabled={readOnly} value={draft.statement} onChange={event => update('statement', event.target.value)} className={`${textareaClass} min-h-32`} maxLength={500} />
        </label>
        <label>
          <span className="text-sm font-semibold text-slate-800">Central message</span>
          <textarea disabled={readOnly} value={draft.centralMessage} onChange={event => update('centralMessage', event.target.value)} className={textareaClass} maxLength={500} />
        </label>
        <div className="grid gap-4 lg:grid-cols-2">
          <label>
            <span className="text-sm font-semibold text-slate-800">Supporting points</span>
            <textarea disabled={readOnly} value={lines(draft.supportingPoints)} onChange={event => update('supportingPoints', splitLines(event.target.value))} className={textareaClass} placeholder="One point per line" />
          </label>
          <label>
            <span className="text-sm font-semibold text-slate-800">Cautions</span>
            <textarea disabled={readOnly} value={lines(draft.cautions)} onChange={event => update('cautions', splitLines(event.target.value))} className={textareaClass} placeholder="One caution per line" />
          </label>
        </div>
        {draft.recommendationRationale !== null && (
          <label>
            <span className="text-sm font-semibold text-slate-800">Why this Direction</span>
            <textarea disabled={readOnly} value={draft.recommendationRationale} onChange={event => update('recommendationRationale', event.target.value)} className={textareaClass} maxLength={500} />
          </label>
        )}
      </div>

      <dl className="mt-5 grid gap-3 border-y border-slate-200 py-4 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold text-slate-500">Truth Pack</dt><dd className="mt-1 break-words text-slate-800">{direction.truthPackVersion}</dd></div>
        <div><dt className="font-semibold text-slate-500">Prepared through</dt><dd className="mt-1 text-slate-800">{direction.preparationSource.replace(/_/g, ' ')}</dd></div>
        <div className="sm:col-span-2"><dt className="font-semibold text-slate-500">Grounded capabilities</dt><dd className="mt-1 break-words text-slate-800">{direction.truthCapabilityKeys.join(', ').replace(/_/g, ' ')}</dd></div>
      </dl>

      {!readOnly && (
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            <Save size={16} aria-hidden="true" /> Save draft
          </button>
          <button type="button" onClick={() => void approve()} disabled={saving || dirty} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
            <Check size={16} aria-hidden="true" /> Approve Direction
          </button>
        </div>
      )}
      {!readOnly && dirty && <p className="mt-2 text-xs text-slate-500">Save this draft before approving it.</p>}
      {notice && <p role="status" className="mt-3 text-sm text-slate-600">{notice}</p>}
    </section>
  );
}

export function MarketingDirectionsWorkspace({
  state,
  loading,
  error,
  saving,
  onReload,
  onUpdate,
  onApprove,
}: {
  state: MarketingDirectionsState | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  onReload: () => Promise<void>;
  onUpdate: (direction: MarketingDirection) => Promise<void>;
  onApprove: (direction: MarketingDirection) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const directions = state?.directions ?? [];
  const selected = useMemo(
    () => directions.find(direction => direction.id === selectedId) ?? directions[0] ?? null,
    [directions, selectedId],
  );

  useEffect(() => {
    if (selectedId && !directions.some(direction => direction.id === selectedId)) setSelectedId(null);
  }, [directions, selectedId]);

  if (loading) return <div data-testid="marketing-directions-loading" className="p-6 text-sm text-slate-500">Loading Marketing Directions...</div>;
  if (error || !state) {
    return (
      <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
        <p>{error ?? 'Marketing Directions are unavailable.'}</p>
        <button type="button" onClick={() => void onReload()} className="mt-3 inline-flex min-h-10 items-center gap-2 font-bold text-rose-900"><RefreshCw size={16} aria-hidden="true" /> Try again</button>
      </div>
    );
  }
  if (!state.acceptedPlan) {
    return (
      <div data-testid="marketing-directions-no-plan" className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <p className="font-semibold text-slate-800">No accepted Marketing Plan</p>
        <p className="mt-1 text-sm text-slate-500">Accept a plan before preparing Marketing Directions.</p>
      </div>
    );
  }
  if (directions.length === 0) {
    return (
      <div data-testid="marketing-directions-empty" className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <p className="font-semibold text-slate-800">No Directions prepared</p>
        <p className="mt-1 text-sm text-slate-500">The accepted plan is ready for the reviewed Codex-assisted Direction preparation workflow.</p>
        <p className="mt-3 text-xs text-slate-500">{state.acceptedPlan.title} · {state.acceptedPlan.itemCount} items</p>
      </div>
    );
  }

  return (
    <div data-testid="marketing-directions-workspace" className="grid min-w-0 gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="min-w-0 border-b border-slate-200 pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">
        <div className="mb-3">
          <h2 className="text-base font-bold text-slate-950">Marketing Directions</h2>
          <p className="mt-1 text-sm text-slate-500">{directions.filter(direction => direction.status === 'approved').length} of {directions.length} approved</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {directions.map(direction => {
            const active = selected?.id === direction.id;
            return (
              <button
                key={direction.id}
                type="button"
                onClick={() => setSelectedId(direction.id)}
                data-testid={`marketing-direction-item-${direction.sourcePlanItemIndex}`}
                className={`flex min-h-16 min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-left ${active ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold uppercase text-slate-500">Item {direction.sourcePlanItemIndex} · {direction.status}</span>
                  <span className="mt-1 block truncate text-sm font-semibold text-slate-900">{direction.topic}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
      {selected && <DirectionDetail direction={selected} saving={saving} onUpdate={onUpdate} onApprove={onApprove} />}
    </div>
  );
}
