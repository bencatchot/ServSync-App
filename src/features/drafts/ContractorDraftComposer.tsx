import { useEffect, useState } from 'react';
import { Plus, Save, X } from 'lucide-react';
import { ActionFeedback, type ActionFeedbackMessage, type ActionFeedbackTone } from '../feedback/ActionFeedback';
import type { DraftJobCustomerOption } from '../jobs/DraftJobComposer';
import { WorkComposerLineItemRow } from '../work-composer/WorkComposerLineItemRow';
import { WorkComposerTotalsPanel } from '../work-composer/WorkComposerTotals';
import type { WorkComposerLineDraft } from '../work-composer/types';
import { createWorkComposerLineDraft, workComposerDraftFinancialBreakdown } from '../work-composer/workComposerDrafts';
import { draftJobTotalsRows } from '../jobs/draftJobMappings';
import { DraftOutcomeSelector } from './DraftOutcomeSelector';
import type { DraftIntendedOutput, SharedDraftComposerDraft } from './draftComposerTypes';

type ContractorDraftComposerProps = {
  draft: SharedDraftComposerDraft;
  connectedOptions: DraftJobCustomerOption[];
  localOptions: DraftJobCustomerOption[];
  currentDraftId?: string | null;
  canSave: boolean;
  saving: boolean;
  feedback?: (ActionFeedbackMessage & { tone: ActionFeedbackTone }) | null;
  onChange: (draft: SharedDraftComposerDraft) => void;
  onSave: () => void;
  onBack: () => void;
  onRemovePersistedLine: (id: string) => void;
};

function fieldClass() {
  return 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-950 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:text-sm';
}

function composerField(label: string, children: React.ReactNode) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function ContractorDraftComposer({
  draft,
  connectedOptions,
  localOptions,
  currentDraftId,
  canSave,
  saving,
  feedback,
  onChange,
  onSave,
  onBack,
  onRemovePersistedLine,
}: ContractorDraftComposerProps) {
  const [expandedLineIds, setExpandedLineIds] = useState<Set<string>>(() => new Set());
  const customerOptions = draft.subject_type === 'connected' ? connectedOptions : localOptions;
  const selectedCustomerId = draft.subject_type === 'connected' ? draft.homeowner_user_id : draft.local_contact_id;
  const selectedCustomer = customerOptions.find(option => option.id === selectedCustomerId) ?? null;
  const selectedPropertyId = draft.subject_type === 'connected' ? draft.home_id : draft.local_home_id;
  const totals = workComposerDraftFinancialBreakdown(draft);
  const subjectTypeLocked = Boolean(currentDraftId);

  useEffect(() => {
    setExpandedLineIds(prev => {
      const next = new Set(prev);
      let changed = false;
      draft.line_items.forEach(line => {
        if ((line.room_label?.trim() || line.location_label?.trim() || line.internal_notes?.trim()) && !next.has(line.id)) {
          next.add(line.id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [draft.line_items]);

  const updateLine = (index: number, updates: Partial<WorkComposerLineDraft>) => {
    onChange({
      ...draft,
      line_items: draft.line_items.map((line, lineIndex) => lineIndex === index ? { ...line, ...updates } : line),
    });
  };

  const addLine = () => {
    onChange({
      ...draft,
      line_items: [...draft.line_items, createWorkComposerLineDraft()],
    });
  };

  const removeLine = (index: number) => {
    const line = draft.line_items[index];
    if (line?.job_work_item_id) onRemovePersistedLine(line.job_work_item_id);
    onChange({
      ...draft,
      line_items: draft.line_items.filter((_, lineIndex) => lineIndex !== index),
    });
  };

  const updateIntent = (intendedOutput: DraftIntendedOutput) => {
    onChange({
      ...draft,
      intended_output: intendedOutput,
      estimate_session: intendedOutput === 'estimate' ? { ...draft.estimate_session, visited: true } : draft.estimate_session,
      job_session: intendedOutput === 'job' ? { ...draft.job_session, visited: true } : draft.job_session,
    });
  };

  return (
    <div className="space-y-4" data-testid="shared-draft-composer">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Start New Draft</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">{currentDraftId ? 'Continue Draft' : 'Draft composer'}</h2>
            <p className="mt-1 text-sm leading-6 text-blue-950">
              Save contractor-only planning details before this Draft becomes an Estimate or Job in a later launch slice.
            </p>
          </div>
          <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-bold text-blue-700 shadow-sm">Hidden foundation</span>
        </div>
      </div>

      {feedback && <ActionFeedback title={feedback.title} body={feedback.body} tone={feedback.tone} testId={feedback.testId} />}

      <DraftOutcomeSelector value={draft.intended_output} onChange={updateIntent} />

      <div className="grid gap-3 lg:grid-cols-3">
        {composerField('Customer type', (
          <select
            className={fieldClass()}
            value={draft.subject_type}
            disabled={subjectTypeLocked}
            onChange={event => onChange({
              ...draft,
              subject_type: event.target.value as SharedDraftComposerDraft['subject_type'],
              homeowner_user_id: '',
              home_id: '',
              local_contact_id: '',
              local_home_id: '',
              service_request_id: '',
            })}
          >
            <option value="connected">Connected homeowner</option>
            <option value="local">Local customer</option>
          </select>
        ))}
        {composerField('Customer', (
          <select
            className={fieldClass()}
            value={selectedCustomerId}
            onChange={event => {
              const option = customerOptions.find(item => item.id === event.target.value) ?? null;
              onChange({
                ...draft,
                homeowner_user_id: draft.subject_type === 'connected' ? event.target.value : '',
                home_id: draft.subject_type === 'connected' ? option?.properties[0]?.id ?? '' : '',
                local_contact_id: draft.subject_type === 'local' ? event.target.value : '',
                local_home_id: draft.subject_type === 'local' ? option?.properties[0]?.id ?? '' : '',
                service_request_id: draft.subject_type === 'connected' ? draft.service_request_id : '',
              });
            }}
          >
            <option value="">Choose customer...</option>
            {customerOptions.map(option => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        ))}
        {composerField('Property', (
          <select
            className={fieldClass()}
            value={selectedPropertyId}
            onChange={event => onChange({
              ...draft,
              home_id: draft.subject_type === 'connected' ? event.target.value : '',
              local_home_id: draft.subject_type === 'local' ? event.target.value : '',
            })}
            disabled={!selectedCustomer}
          >
            <option value="">Choose property...</option>
            {(selectedCustomer?.properties ?? []).map(property => (
              <option key={property.id} value={property.id}>{property.label}</option>
            ))}
          </select>
        ))}
      </div>
      {subjectTypeLocked ? (
        <p className="text-xs font-medium text-slate-500">
          Customer type is fixed after the first save so retries update the same Draft safely.
        </p>
      ) : null}

      <div className="grid gap-3">
        {composerField('Draft title', (
          <input
            className={fieldClass()}
            value={draft.title}
            onChange={event => onChange({ ...draft, title: event.target.value })}
            placeholder="e.g. Kitchen faucet replacement"
          />
        ))}
      </div>

      {composerField('Scope / description', (
        <textarea
          className={`${fieldClass()} min-h-[110px] resize-y`}
          value={draft.scope}
          onChange={event => onChange({ ...draft, scope: event.target.value })}
          placeholder="Describe the work to perform, materials to use, or customer expectations."
        />
      ))}

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-950">Work items</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">Pricing stays visible and editable for both Estimate and Job intent.</p>
          </div>
          <button type="button" onClick={addLine} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50">
            <Plus size={15} />
            Add line
          </button>
        </div>
        {draft.line_items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
            No work items yet. Add labor, materials, or fees before saving detailed scope.
          </div>
        ) : (
          <div className="space-y-3">
            {draft.line_items.map((line, index) => (
              <WorkComposerLineItemRow
                key={line.id}
                line={line}
                index={index}
                itemLabel="draft"
                laborMode={draft.labor_mode}
                compactAdvanced
                advancedDetailsOpen={expandedLineIds.has(line.id)}
                onAdvancedDetailsOpenChange={open => setExpandedLineIds(prev => {
                  const next = new Set(prev);
                  if (open) next.add(line.id);
                  else next.delete(line.id);
                  return next;
                })}
                onChange={updates => updateLine(index, updates)}
                onRemove={() => removeLine(index)}
              />
            ))}
          </div>
        )}
      </div>

      <WorkComposerTotalsPanel
        title="Draft work total"
        totalLabel={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totals.subtotalCents / 100)}
        rows={draftJobTotalsRows(draft)}
        priceRequired={draft.line_items.some(line => !line.unit_price.trim())}
      />

      {draft.intended_output === 'estimate' ? <section aria-label="Estimate outcome details" data-testid="shared-draft-estimate-outcome-panel" /> : null}
      {draft.intended_output === 'job' ? <section aria-label="Job outcome details" data-testid="shared-draft-job-outcome-panel" /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onSave} disabled={!canSave || saving} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Draft'}
        </button>
        <button type="button" onClick={onBack} disabled={saving} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
          <X size={16} />
          Back to Work
        </button>
      </div>
    </div>
  );
}
