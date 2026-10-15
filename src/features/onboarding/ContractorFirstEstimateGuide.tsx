import { useState } from 'react';
import { ContractorDraftComposer } from '../drafts/ContractorDraftComposer';
import { createBlankSharedDraftComposerDraft } from '../drafts/draftComposerMappings';
import type { SharedDraftComposerDraft } from '../drafts/draftComposerTypes';
import { createWorkComposerLineDraft } from '../work-composer/workComposerDrafts';

const button = 'min-h-11 rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 disabled:opacity-50';
const samples = {
  general: ['Small repair visit', 'Complete the agreed small repair, protect the work area and clean up.', 'Repair labor'],
  plumbing: ['Replace a faucet', 'Remove the old faucet, install the replacement and check for leaks.', 'Installation labor'],
  electrical: ['Replace a light fixture', 'Replace the agreed fixture and check operation. Confirm site conditions and applicable requirements.', 'Installation labor'],
} as const;
type Progress = { dismissed: boolean; previewed: boolean; startedReal: boolean; sampleOpen: boolean; trade: keyof typeof samples };
const initial: Progress = { dismissed: false, previewed: false, startedReal: false, sampleOpen: false, trade: 'general' };
function readProgress(key: string): Progress {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return { dismissed: value.dismissed === true, previewed: value.previewed === true, startedReal: value.startedReal === true, sampleOpen: value.sampleOpen === true, trade: Object.prototype.hasOwnProperty.call(samples, value.trade) ? value.trade : 'general' };
  } catch { return initial; }
}
function sampleDraft(trade: keyof typeof samples) {
  const [title, scope, line] = samples[trade];
  return createBlankSharedDraftComposerDraft({
    title: `SAMPLE — ${title}`, scope, intended_output: 'estimate', subject_type: 'local',
    local_contact_id: 'sample-customer', local_home_id: 'sample-property',
    line_items: [createWorkComposerLineDraft({ line_title: line, description: line, quantity: '2', unit: 'hour', unit_price: '75' }), createWorkComposerLineDraft({ line_type: 'material', line_title: 'Sample materials', description: 'Sample materials', unit: 'job', unit_price: '45' })],
  });
}
function readSample(key: string, trade: keyof typeof samples) {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || 'null');
    const baseline = sampleDraft(trade);
    // Validate local browser data before handing it to the shared editor.
    if (!value || !['job_total', 'line_specific'].includes(value.labor_mode) || Object.entries(baseline).some(([field, base]) => typeof base === 'string' && typeof value[field] !== 'string') || !Array.isArray(value.line_items) || value.line_items.length > 100) return baseline;
    const lineShape = createWorkComposerLineDraft();
    if (value.line_items.some((line: Record<string, unknown>) => !line || Object.keys(lineShape).some(field => typeof line[field] !== 'string'))) return baseline;
    return { ...baseline, ...value, subject_type: 'local', local_contact_id: 'sample-customer', local_home_id: 'sample-property', homeowner_user_id: '', home_id: '', service_request_id: '', intended_output: 'estimate', work_format: 'standard', checklist_source: null } as SharedDraftComposerDraft;
  } catch { return sampleDraft(trade); }
}

type Props = {
  identity: string;
  businessName: string;
  hasEstimates: boolean;
  canStartReal: boolean;
  onStartReal: () => void;
  onResumeReal: () => void;
  onBusiness: () => void;
  onPrices: () => void;
  onCustomers: () => void;
};

export function ContractorFirstEstimateGuide({ identity, businessName, hasEstimates, canStartReal, onStartReal, onResumeReal, onBusiness, onPrices, onCustomers }: Props) {
  const key = `servsync.firstEstimate.v1:${identity}`;
  const [progress, setProgress] = useState(() => readProgress(key));
  const [draft, setDraft] = useState(() => readSample(key, progress.trade));
  const [storageError, setStorageError] = useState('');
  const update = (patch: Partial<Progress>) => {
    const next = { ...progress, ...patch };
    setProgress(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { setStorageError('This browser cannot save guide progress. You can continue now; save real work with Save Draft.'); }
  };
  const changeSample = (next: SharedDraftComposerDraft) => {
    // Keep practice in the estimate path even if a different shared-editor outcome is selected.
    const safe = { ...next, intended_output: 'estimate' as const, work_format: 'standard' as const, checklist_source: null };
    setDraft(safe);
    try { sessionStorage.setItem(key, JSON.stringify(safe)); } catch { setStorageError('Practice changes could not be saved in this tab. Keep this page open or try another browser.'); }
  };
  const previewed = () => update({ previewed: true });
  if (progress.dismissed || (hasEstimates && !progress.startedReal && !progress.previewed && !progress.sampleOpen)) return <button type="button" className={`${button} mb-4`} onClick={() => update({ dismissed: false, startedReal: true })}>Open first-estimate guide</button>;
  return <section className="mb-5 space-y-4 rounded-2xl border border-blue-200 bg-white p-4 shadow-sm md:p-6" aria-label="First estimate guide">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">Guided setup</p><h1 className="mt-1 text-xl font-bold text-slate-950">Build your first estimate</h1><p className="mt-2 max-w-3xl text-sm text-slate-600">Start with a practice job or your own work. A logo, price library, imported contacts and teammates can wait.</p></div>
      <button type="button" className={button} onClick={() => update({ dismissed: true })}>Skip for now</button>
    </div>
    {storageError && <p role="status" className="text-sm text-amber-800">{storageError}</p>}
    <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><strong className="text-slate-900">Your business on customer documents</strong><p className="mt-1">Estimates show your business name and any saved logo, customer/property details, scope, pricing and terms. Private Draft notes are excluded. {businessName ? `Current business name: ${businessName}.` : 'Set your business name before preparing a real customer document.'} Review your existing business details; optional branding can wait.</p><button type="button" className={`${button} mt-2`} onClick={onBusiness}>Review business details</button></div>
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-slate-200 p-4"><h2 className="font-bold">Try an isolated sample</h2><p className="my-2 text-sm text-slate-600">Synthetic customer and example prices, not trade advice or recommended rates. Practice stays in this tab; it cannot contact customers, save business records or charge payments. Use fictional details only.</p>
        {!progress.sampleOpen && <label className="mb-3 block text-sm font-medium">Example service (optional)<select className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 p-2" value={progress.trade} onChange={event => { const trade = event.target.value as keyof typeof samples; update({ trade }); changeSample(sampleDraft(trade)); }}><option value="general">General service / small repair</option><option value="plumbing">Plumbing</option><option value="electrical">Electrical</option></select></label>}
        <button type="button" className={button} onClick={() => update({ sampleOpen: !progress.sampleOpen })}>{progress.sampleOpen ? 'Close practice editor' : 'Try sample estimate'}</button>
      </div>
      <div className="rounded-xl border border-slate-200 p-4"><h2 className="font-bold">Use your own work</h2><p className="my-2 text-sm text-slate-600">Describe the scope, add prices, then preview. Save Draft before leaving and resume it from Work → Drafts. Select the real customer and property before creating the Estimate. Sending is a separate, explicit action.</p><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={!canStartReal || !businessName.trim()} onClick={() => { update({ startedReal: true, sampleOpen: false }); onStartReal(); }}>Start a real estimate</button><button type="button" className={button} disabled={!canStartReal} onClick={onResumeReal}>Resume saved Drafts</button></div>{!canStartReal && <p className="mt-2 text-sm">Real estimates are available when your existing account permissions and Draft access allow them.</p>}</div>
    </div>
    {progress.sampleOpen && <div className="space-y-3 border-t border-amber-200 pt-4"><p className="rounded-xl bg-amber-100 p-3 font-bold text-amber-950">SAMPLE — isolated practice, nothing is sent</p><ContractorDraftComposer draft={draft} customerOptions={[{ key: 'local:sample-customer', subjectType: 'local', customerId: 'sample-customer', label: 'Sample Customer (fictional)', status: 'not_connected', statusLabel: 'Sample only', properties: [{ id: 'sample-property', label: 'Sample property (fictional)' }] }]} canSave saving={false} practiceMode onChange={changeSample} onSave={() => changeSample(draft)} onBack={() => update({ sampleOpen: false })} onRemovePersistedLine={() => undefined} previewBusinessName="Sample Service Company" onEstimatePreview={previewed} /></div>}
    {(progress.previewed || hasEstimates) && <div className="space-y-2 rounded-xl bg-emerald-50 p-4"><h2 className="font-bold text-emerald-950">Keep going when you’re ready</h2><p className="text-sm text-emerald-900">Review your service prices or add real customers next. Teammates and any available payment setup are optional business settings, not prerequisites for trying an estimate.</p><div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={onPrices}>Service prices</button><button type="button" className={button} onClick={onCustomers}>Customers</button><button type="button" className={button} onClick={() => update({ dismissed: true, sampleOpen: false })}>Skip optional setup</button></div></div>}
    <p className="text-xs text-slate-500">Guide choices are remembered in this browser. Practice edits survive refresh in this tab. Real Drafts use ServSync’s existing Save Draft workflow.</p>
  </section>;
}
