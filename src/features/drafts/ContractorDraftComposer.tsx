import { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Plus, Save, X } from 'lucide-react';
import { ActionFeedback, type ActionFeedbackMessage, type ActionFeedbackTone } from '../feedback/ActionFeedback';
import { DraftPriceBookPicker } from '../price-book/DraftPriceBookPicker';
import type { PriceBookLoadState } from '../price-book/priceBookView';
import { WorkComposerLineItemRow } from '../work-composer/WorkComposerLineItemRow';
import { WorkComposerTotalsPanel } from '../work-composer/WorkComposerTotals';
import type { WorkComposerLineDraft } from '../work-composer/types';
import { createWorkComposerLineDraft, workComposerDraftFinancialBreakdown } from '../work-composer/workComposerDrafts';
import { draftJobTotalsRows } from '../jobs/draftJobMappings';
import {
  createDraftChecklistSnapshot,
  draftChecklistSourceMatchesDraftSubject,
  type DraftChecklistSourceOption,
} from './checklistDraftScope';
import { DraftOutcomeSelector } from './DraftOutcomeSelector';
import type { DraftIntendedOutput, SharedDraftComposerDraft } from './draftComposerTypes';
import {
  applyEstimateTemplateToSharedDraft,
  draftHasMeaningfulSavedWorkTemplateContent,
  type SavedWorkTemplateApplyMode,
} from './savedWorkTemplateDraftIntegration';
import type { ContractorPriceBookItem, EstimateLaborMode, EstimateTemplate } from '../../types';
import {
  applyDraftCustomerSelection,
  clearDraftCustomerSelection,
  draftCustomerOptionLabel,
  selectedDraftCustomerKey,
  type DraftCustomerOption,
} from './draftCustomerOptions';

type ContractorDraftComposerProps = {
  draft: SharedDraftComposerDraft;
  customerOptions: DraftCustomerOption[];
  checklistOptions?: DraftChecklistSourceOption[];
  savedWorkTemplates?: EstimateTemplate[];
  priceBookItems?: ContractorPriceBookItem[];
  priceBookLoadState?: PriceBookLoadState;
  priceBookLoadError?: string;
  canViewPriceBook?: boolean;
  currentDraftId?: string | null;
  canSave: boolean;
  saving: boolean;
  interactionDisabled?: boolean;
  invoiceOutputAvailable?: boolean;
  invoiceOutputUnavailableReason?: string;
  launchLabel?: string | null;
  launchDisabled?: boolean;
  launchDisabledReason?: string;
  launchBusy?: boolean;
  launchRecoveryLabel?: string | null;
  feedback?: (ActionFeedbackMessage & { tone: ActionFeedbackTone }) | null;
  onChange: (draft: SharedDraftComposerDraft) => void;
  onSave: () => void;
  onLaunch?: () => void;
  onDiscardPreparedLaunch?: () => void;
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

function formatDraftLaborHours(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function ContractorDraftComposer({
  draft,
  customerOptions,
  checklistOptions = [],
  savedWorkTemplates = [],
  priceBookItems = [],
  priceBookLoadState = 'idle',
  priceBookLoadError = '',
  canViewPriceBook = false,
  currentDraftId,
  canSave,
  saving,
  interactionDisabled = false,
  invoiceOutputAvailable = false,
  invoiceOutputUnavailableReason = '',
  launchLabel = null,
  launchDisabled = false,
  launchDisabledReason = '',
  launchBusy = false,
  launchRecoveryLabel = null,
  feedback,
  onChange,
  onSave,
  onLaunch,
  onDiscardPreparedLaunch,
  onBack,
  onRemovePersistedLine,
}: ContractorDraftComposerProps) {
  const [expandedLineIds, setExpandedLineIds] = useState<Set<string>>(() => new Set());
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<EstimateTemplate | null>(null);
  const [templateFeedback, setTemplateFeedback] = useState<{ tone: ActionFeedbackTone; title: string; body: string } | null>(null);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);
  const templateApplyResetTimer = useRef<number | null>(null);
  const selectedCustomerKey = selectedDraftCustomerKey(draft);
  const selectedCustomer = customerOptions.find(option => option.key === selectedCustomerKey) ?? null;
  const selectedPropertyId = draft.subject_type === 'connected' ? draft.home_id : draft.local_home_id;
  const totals = workComposerDraftFinancialBreakdown(draft);
  const subjectTypeLocked = Boolean(currentDraftId);
  const isChecklistDraft = draft.work_format === 'inspection_checklist';
  const selectedChecklistKey = draft.checklist_source
    ? `${draft.checklist_source.source_kind}:${draft.checklist_source.source_id}`
    : '';
  const eligibleChecklistOptions = checklistOptions.filter(option => draftChecklistSourceMatchesDraftSubject(option, draft));
  const selectedChecklist = eligibleChecklistOptions.find(option => `${option.source_kind}:${option.source_id}` === selectedChecklistKey) ?? null;
  const isEstimateIntent = draft.intended_output === 'estimate';
  const isInvoiceIntent = draft.intended_output === 'invoice';
  const showEstimateLaborControls = !isChecklistDraft && isEstimateIntent;
  const workItemsHeading = isEstimateIntent ? 'Estimate line items' : isInvoiceIntent ? 'Draft Invoice line items' : 'Job work scope';
  const workItemsDescription = isEstimateIntent
    ? 'Plan the customer-facing estimate lines now; this structure carries into the launched Estimate.'
    : isInvoiceIntent
      ? 'Plan the draft Invoice lines now; launch creates a draft only and does not send it.'
      : 'Plan the work scope that can carry into the launched Job.';
  const addLineLabel = isEstimateIntent ? 'Add estimate line' : isInvoiceIntent ? 'Add invoice line' : 'Add work line';
  const emptyLinesLabel = isEstimateIntent
    ? 'No estimate line items yet. Add labor, materials, or fees before saving detailed pricing.'
    : isInvoiceIntent
      ? 'No draft Invoice line items yet. Add labor, materials, or fees before creating the draft Invoice.'
      : 'No work scope yet. Add labor, materials, or fees before saving detailed scope.';
  const totalsTitle = isEstimateIntent ? 'Draft Estimate total' : isInvoiceIntent ? 'Draft Invoice total' : 'Draft Job total';
  const savedTemplateCount = savedWorkTemplates.length;
  const templateSelectionDisabled = interactionDisabled || isChecklistDraft;

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

  useEffect(() => {
    return () => {
      if (templateApplyResetTimer.current !== null) {
        window.clearTimeout(templateApplyResetTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isChecklistDraft) return;
    setTemplatePickerOpen(false);
    setPendingTemplate(null);
  }, [isChecklistDraft]);

  useEffect(() => {
    if (!pendingTemplate) return;
    if (!savedWorkTemplates.some(template => template.id === pendingTemplate.id)) {
      setPendingTemplate(null);
    }
  }, [pendingTemplate, savedWorkTemplates]);

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

  const addPriceBookLines = (lines: WorkComposerLineDraft[]) => {
    if (lines.length === 0) return;
    onChange({
      ...draft,
      line_items: [...draft.line_items, ...lines],
    });
  };

  const resetTemplateApplyGuard = () => {
    if (templateApplyResetTimer.current !== null) {
      window.clearTimeout(templateApplyResetTimer.current);
    }
    templateApplyResetTimer.current = window.setTimeout(() => {
      setApplyingTemplateId(null);
      templateApplyResetTimer.current = null;
    }, 250);
  };

  const applyTemplate = (template: EstimateTemplate, mode: SavedWorkTemplateApplyMode) => {
    if (applyingTemplateId || templateSelectionDisabled) return;
    setApplyingTemplateId(template.id);
    const nextDraft = applyEstimateTemplateToSharedDraft(draft, template, mode);
    onChange(nextDraft);
    setTemplatePickerOpen(false);
    setPendingTemplate(null);
    setTemplateFeedback({
      tone: 'success',
      title: mode === 'replace' ? 'Template applied' : 'Template added',
      body: mode === 'replace'
        ? `${template.name} replaced the reusable work content. Customer, property, and output stay unchanged.`
        : `${template.name} was added to the current Draft content.`,
    });
    resetTemplateApplyGuard();
  };

  const chooseTemplate = (template: EstimateTemplate) => {
    setTemplateFeedback(null);
    if (templateSelectionDisabled) return;
    if (draftHasMeaningfulSavedWorkTemplateContent(draft)) {
      setPendingTemplate(template);
      return;
    }
    applyTemplate(template, 'replace');
  };

  const removeLine = (index: number) => {
    const line = draft.line_items[index];
    if (line?.job_work_item_id) onRemovePersistedLine(line.job_work_item_id);
    onChange({
      ...draft,
      line_items: draft.line_items.filter((_, lineIndex) => lineIndex !== index),
    });
  };

  const updateIntent = (intendedOutput: DraftIntendedOutput | null) => {
    onChange({
      ...draft,
      intended_output: intendedOutput,
      estimate_session: intendedOutput === 'estimate' ? { ...draft.estimate_session, visited: true } : draft.estimate_session,
      job_session: intendedOutput === 'job' ? { ...draft.job_session, visited: true } : draft.job_session,
      invoice_session: intendedOutput === 'invoice' ? { ...draft.invoice_session, visited: true } : draft.invoice_session,
    });
  };

  const updateLaborMode = (laborMode: EstimateLaborMode) => {
    onChange({ ...draft, labor_mode: laborMode });
  };

  const updateWorkFormat = (workFormat: SharedDraftComposerDraft['work_format']) => {
    onChange({
      ...draft,
      work_format: workFormat,
      intended_output: workFormat === 'inspection_checklist' ? 'job' : draft.intended_output,
      checklist_source: workFormat === 'inspection_checklist' ? draft.checklist_source : null,
      estimate_session: workFormat === 'inspection_checklist' ? draft.estimate_session : draft.estimate_session,
      job_session: workFormat === 'inspection_checklist' ? { ...draft.job_session, visited: true } : draft.job_session,
      invoice_session: draft.invoice_session,
    });
  };

  const updateChecklistSource = (value: string) => {
    const option = eligibleChecklistOptions.find(item => `${item.source_kind}:${item.source_id}` === value) ?? null;
    onChange({
      ...draft,
      work_format: 'inspection_checklist',
      intended_output: 'job',
      checklist_source: option ? createDraftChecklistSnapshot(option) : null,
      job_session: { ...draft.job_session, visited: true },
    });
  };

  const updateDraftSubject = (nextDraft: SharedDraftComposerDraft) => {
    const selectedOption = checklistOptions.find(option => `${option.source_kind}:${option.source_id}` === selectedChecklistKey) ?? null;
    onChange(selectedOption && !draftChecklistSourceMatchesDraftSubject(selectedOption, nextDraft)
      ? { ...nextDraft, checklist_source: null }
      : nextDraft);
  };

  return (
    <div className="space-y-4" data-testid="shared-draft-composer">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Start New Draft</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">{currentDraftId ? 'Continue Draft' : 'Draft composer'}</h2>
            <p className="mt-1 text-sm leading-6 text-blue-950">Save contractor-only planning details, then create one Estimate, Job, or draft Invoice when the Draft is ready.</p>
          </div>
          <span className="w-fit rounded-full bg-white px-3 py-1 text-xs font-bold text-blue-700 shadow-sm">Draft planning</span>
        </div>
      </div>

      {feedback && <ActionFeedback title={feedback.title} body={feedback.body} tone={feedback.tone} testId={feedback.testId} />}

      <fieldset disabled={interactionDisabled} className="contents" aria-label="Draft planning fields">
      <div className="grid gap-3 md:grid-cols-2">
        {composerField('Work format', (
          <select
            data-testid="durable-draft-work-format"
            className={fieldClass()}
            value={draft.work_format}
            onChange={event => updateWorkFormat(event.target.value as SharedDraftComposerDraft['work_format'])}
          >
            <option value="standard">Standard work scope</option>
            <option value="inspection_checklist">Inspection Checklist</option>
          </select>
        ))}
        {isChecklistDraft ? (
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-700">Output</p>
            <p className="mt-1 text-sm font-semibold text-blue-950">Creates one Job with checklist/report structure</p>
          </div>
        ) : (
          <DraftOutcomeSelector
            value={draft.intended_output}
            onChange={updateIntent}
            disabled={interactionDisabled}
            invoiceAvailable={invoiceOutputAvailable}
            invoiceUnavailableReason={invoiceOutputUnavailableReason}
          />
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {composerField('Customer', (
          <select
            data-testid="durable-draft-customer"
            className={fieldClass()}
            value={selectedCustomerKey}
            onChange={event => {
              const option = customerOptions.find(item => item.key === event.target.value) ?? null;
              updateDraftSubject(option
                ? applyDraftCustomerSelection(draft, option)
                : clearDraftCustomerSelection(draft));
            }}
          >
            <option value="">Choose customer...</option>
            {customerOptions.map(option => (
              <option key={option.key} value={option.key}>{draftCustomerOptionLabel(option)}</option>
            ))}
          </select>
        ))}
        {composerField('Property', (
          <select
            data-testid="durable-draft-property"
            className={fieldClass()}
            value={selectedPropertyId}
            onChange={event => updateDraftSubject({
              ...draft,
              home_id: draft.subject_type === 'connected' ? event.target.value : '',
              local_home_id: draft.subject_type === 'local' ? event.target.value : '',
              service_request_id: '',
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
          This saved Draft keeps its original customer connection category so retries update the same Draft safely.
        </p>
      ) : null}

      {!isChecklistDraft ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4" data-testid="durable-draft-template-guidance">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-950">Saved Work Templates</h3>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {savedTemplateCount === 0
                  ? 'No saved templates yet.'
                  : `${savedTemplateCount} saved template${savedTemplateCount === 1 ? '' : 's'} available.`}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              data-testid="durable-draft-template-picker-toggle"
              disabled={templateSelectionDisabled}
              onClick={() => {
                setTemplatePickerOpen(open => !open);
                setPendingTemplate(null);
                setTemplateFeedback(null);
              }}
            >
              <FileText size={15} />
              Choose template
            </button>
          </div>
          {templateFeedback ? (
            <ActionFeedback
              tone={templateFeedback.tone}
              title={templateFeedback.title}
              body={templateFeedback.body}
              testId="durable-draft-template-feedback"
            />
          ) : null}
          {templatePickerOpen ? (
            <div className="mt-3 rounded-xl border border-blue-100 bg-white p-3" data-testid="durable-draft-template-picker">
              {savedWorkTemplates.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500" data-testid="durable-draft-template-empty">
                  Saved estimate templates from Templates will appear here when available.
                </div>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {savedWorkTemplates.map(template => (
                    <button
                      key={template.id}
                      type="button"
                      className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                      data-testid="durable-draft-template-option"
                      disabled={Boolean(applyingTemplateId)}
                      onClick={() => chooseTemplate(template)}
                    >
                      <span className="block text-sm font-bold text-slate-950">{template.name}</span>
                      <span className="mt-1 block text-xs font-medium text-slate-500">
                        {template.trade || 'Saved work'} / {template.line_items.length} line{template.line_items.length === 1 ? '' : 's'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {pendingTemplate ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3" data-testid="durable-draft-template-confirmation">
                  <p className="text-sm font-bold text-amber-950">Apply {pendingTemplate.name}?</p>
                  <p className="mt-1 text-xs leading-5 text-amber-900">
                    This Draft already has reusable scope, notes, or line items. Replace that work content or add the template below it.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      data-testid="durable-draft-template-replace"
                      disabled={Boolean(applyingTemplateId)}
                      onClick={() => applyTemplate(pendingTemplate, 'replace')}
                    >
                      <FileText size={15} />
                      Replace
                    </button>
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                      data-testid="durable-draft-template-add"
                      disabled={Boolean(applyingTemplateId)}
                      onClick={() => applyTemplate(pendingTemplate, 'add')}
                    >
                      <Plus size={15} />
                      Add
                    </button>
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                      data-testid="durable-draft-template-cancel"
                      onClick={() => setPendingTemplate(null)}
                    >
                      <X size={15} />
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
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

      {composerField('Private notes', (
        <textarea
          className={`${fieldClass()} min-h-[96px] resize-y`}
          value={draft.notes}
          onChange={event => onChange({ ...draft, notes: event.target.value })}
          placeholder="Visible only to your company and not copied to the customer-facing Estimate, Job, or Invoice."
          aria-describedby="durable-draft-private-notes-help"
        />
      ))}
      <p id="durable-draft-private-notes-help" className="text-xs leading-5 text-slate-500">
        Contractor-only planning notes. These are not copied to the customer-facing Estimate, Job, or Invoice.
      </p>

      {showEstimateLaborControls ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4" data-testid="durable-draft-estimate-labor-model">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-950">Estimate labor model</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">Choose how labor should carry into the launched Estimate.</p>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Estimate labor model">
              <button
                type="button"
                onClick={() => updateLaborMode('job_total')}
                aria-pressed={draft.labor_mode === 'job_total'}
                data-testid="durable-draft-labor-mode-job-total"
                className={`min-h-11 rounded-lg px-3 py-2 text-sm font-bold transition ${
                  draft.labor_mode === 'job_total'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'
                }`}
              >
                Job total labor
              </button>
              <button
                type="button"
                onClick={() => updateLaborMode('line_specific')}
                aria-pressed={draft.labor_mode === 'line_specific'}
                data-testid="durable-draft-labor-mode-line-specific"
                className={`min-h-11 rounded-lg px-3 py-2 text-sm font-bold transition ${
                  draft.labor_mode === 'line_specific'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'
                }`}
              >
                Line-specific labor
              </button>
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {composerField('Labor rate', (
              <input
                aria-label="Draft Estimate labor rate"
                data-testid="durable-draft-labor-rate"
                className={fieldClass()}
                value={draft.labor_rate}
                onChange={event => onChange({ ...draft, labor_rate: event.target.value })}
                placeholder="$0.00"
              />
            ))}
            {draft.labor_mode === 'job_total' ? (
              composerField('Total labor hours', (
                <input
                  aria-label="Draft Estimate total labor hours"
                  data-testid="durable-draft-job-labor-hours"
                  className={fieldClass()}
                  type="number"
                  min="0"
                  step="0.25"
                  value={draft.job_labor_hours}
                  onChange={event => onChange({ ...draft, job_labor_hours: event.target.value })}
                  placeholder="0"
                />
              ))
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2" data-testid="durable-draft-line-labor-summary">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Line labor hours</p>
                <p className="mt-1 text-sm font-bold text-slate-950">{formatDraftLaborHours(totals.laborHours)} hrs entered</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Use line Type to keep Labor rows distinct from Material, Fee, and Other rows. Material and Other rows can track Labor hrs in More details.
                </p>
              </div>
            )}
          </div>
          {totals.missingLaborRate ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              Labor hours are entered without a labor rate. Labor price is excluded until a rate is added.
            </p>
          ) : null}
        </div>
      ) : null}

      {!isChecklistDraft && isEstimateIntent && canViewPriceBook ? (
        <DraftPriceBookPicker
          items={priceBookItems}
          loadState={priceBookLoadState}
          loadError={priceBookLoadError}
          disabled={interactionDisabled || !canSave}
          onAddLines={addPriceBookLines}
        />
      ) : null}

      {isChecklistDraft ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4" data-testid="durable-draft-checklist-scope">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-slate-950">Inspection Checklist</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">The selected checklist is the primary planned scope for this Draft. Findings and report answers start only after the Job is created.</p>
          </div>
          {composerField('Start from', (
            <select
              data-testid="durable-draft-checklist-source"
              className={fieldClass()}
              value={selectedChecklistKey}
              onChange={event => updateChecklistSource(event.target.value)}
            >
              <option value="">Choose an Inspection Checklist...</option>
              {['Home-specific Inspection Checklists', 'Your Inspection Checklists', 'Starter Inspection Checklists'].map(group => {
                const groupOptions = eligibleChecklistOptions.filter(option => option.group_label === group);
                return groupOptions.length > 0 ? (
                  <optgroup key={group} label={group}>
                    {groupOptions.map(option => (
                      <option key={`${option.source_kind}:${option.source_id}`} value={`${option.source_kind}:${option.source_id}`}>
                        {option.source_label}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </select>
          ))}
          {draft.checklist_source ? (
            <div className="mt-3 rounded-xl border border-white bg-white p-3" data-testid="durable-draft-checklist-summary">
              <p className="text-sm font-bold text-slate-900">{draft.checklist_source.source_label}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {draft.checklist_source.rooms.length} section{draft.checklist_source.rooms.length === 1 ? '' : 's'} / {draft.checklist_source.rooms.reduce((count, room) => count + room.items.length, 0)} checklist item{draft.checklist_source.rooms.reduce((count, room) => count + room.items.length, 0) === 1 ? '' : 's'}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {draft.checklist_source.rooms.slice(0, 4).map(room => (
                  <div key={`${room.room_id}:${room.sort_order}`} className="rounded-lg border border-slate-100 bg-slate-50 p-2">
                    <p className="text-xs font-bold text-slate-800">{room.display_name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{room.items.length} item{room.items.length === 1 ? '' : 's'}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
              Choose a starter, company, or eligible home-specific Inspection Checklist.
            </div>
          )}
          {selectedChecklist && selectedChecklist.source_updated_at && draft.checklist_source?.source_updated_at !== selectedChecklist.source_updated_at ? (
            <p className="mt-2 text-xs font-semibold text-amber-800">This checklist changed since the Draft snapshot was selected. Review and reselect it before launch.</p>
          ) : null}
        </div>
      ) : (
      <>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4" data-testid="durable-draft-work-items">
        <div className="mb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-950">{workItemsHeading}</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">{workItemsDescription}</p>
          </div>
        </div>
        {draft.line_items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
            {emptyLinesLabel}
          </div>
        ) : (
          <div className="space-y-3">
            {draft.line_items.map((line, index) => (
              <WorkComposerLineItemRow
                key={line.id}
                line={line}
                index={index}
                itemLabel={isEstimateIntent ? 'draft estimate' : isInvoiceIntent ? 'invoice' : 'draft'}
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
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={addLine}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 sm:w-auto"
            data-testid="durable-draft-add-line"
          >
            <Plus size={15} />
            {addLineLabel}
          </button>
        </div>
      </div>

      <WorkComposerTotalsPanel
        title={totalsTitle}
        totalLabel={new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totals.subtotalCents / 100)}
        rows={draftJobTotalsRows(draft)}
        priceRequired={draft.line_items.some(line => !line.unit_price.trim())}
      />
      </>
      )}

      {draft.intended_output === 'estimate' ? <section aria-label="Estimate outcome details" data-testid="shared-draft-estimate-outcome-panel" /> : null}
      {draft.intended_output === 'job' ? <section aria-label="Job outcome details" data-testid="shared-draft-job-outcome-panel" /> : null}
      {draft.intended_output === 'invoice' ? (
        <section aria-label="Draft Invoice outcome details" data-testid="shared-draft-invoice-outcome-panel" className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Creating the Invoice makes a draft only and does not send it to the customer.
        </section>
      ) : null}
      </fieldset>

      {!draft.intended_output ? (
        <p className="text-sm font-medium text-slate-600" data-testid="durable-draft-launch-guidance">Choose Estimate, Job, or draft Invoice before creating work from this Draft.</p>
      ) : null}
      {launchDisabledReason ? <p className="text-sm font-medium text-amber-800" data-testid="durable-draft-launch-disabled-reason">{launchDisabledReason}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        {launchLabel && onLaunch ? (
          <button type="button" onClick={onLaunch} disabled={launchDisabled || launchBusy} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50" data-testid="durable-draft-create-output">
            {launchBusy ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
            {launchBusy ? 'Working…' : launchRecoveryLabel ?? launchLabel}
          </button>
        ) : null}
        <button type="button" onClick={onSave} disabled={!canSave || saving || interactionDisabled} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 shadow-sm hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Draft'}
        </button>
        {onDiscardPreparedLaunch ? <button type="button" onClick={onDiscardPreparedLaunch} disabled={launchBusy} className="min-h-11 rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-900 disabled:opacity-50">Discard unused attempt</button> : null}
        <button type="button" onClick={onBack} disabled={saving} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
          <X size={16} />
          Back to Jobs
        </button>
      </div>
    </div>
  );
}
