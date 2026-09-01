type LocalCustomerCreationDraft = {
  display_name: string;
  phone: string;
  email: string;
  notes: string;
  home_nickname: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip_code: string;
  home_type: string;
  year_built: string;
  square_feet: string;
  home_notes: string;
};

type LocalCustomerCreationPanelProps = {
  draft: LocalCustomerCreationDraft;
  saving: boolean;
  workspaceReady: boolean;
  title?: string;
  description: string;
  saveLabel: string;
  stateOptions: string[];
  onChange: (draft: LocalCustomerCreationDraft) => void;
  onSave: () => void;
  onCancel: () => void;
};

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-950 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 md:text-sm';
const field = (label: string, control: React.ReactNode) => <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>{control}</label>;

export function LocalCustomerCreationPanel({
  draft,
  saving,
  workspaceReady,
  title = 'Add new customer',
  description,
  saveLabel,
  stateOptions,
  onChange,
  onSave,
  onCancel,
}: LocalCustomerCreationPanelProps) {
  const update = (changes: Partial<LocalCustomerCreationDraft>) => onChange({ ...draft, ...changes });
  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4" data-testid="local-customer-creation-form">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-700">Customer</p>
          <h3 className="mt-1 text-lg font-bold text-blue-950">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-blue-900">{description}</p>
          <p className="mt-2 rounded-xl border border-blue-200 bg-white/80 px-3 py-2 text-xs font-semibold leading-5 text-blue-900">This creates a contractor-only customer record. It does not invite the customer or create a ServSync account.</p>
        </div>
        <button type="button" onClick={onCancel} disabled={saving} className="text-xs font-semibold text-blue-700 hover:text-blue-900 disabled:cursor-not-allowed disabled:opacity-50">Cancel</button>
      </div>
      <fieldset disabled={saving} className="space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          {field('Customer name', <input className={inputClass} value={draft.display_name} onChange={event => update({ display_name: event.target.value })} placeholder="e.g. Becky Thomas" />)}
          {field('Phone', <input className={inputClass} type="tel" autoComplete="tel" spellCheck={false} value={draft.phone} onChange={event => update({ phone: event.target.value })} placeholder="(555) 555-5555" />)}
          {field('Email', <input className={inputClass} type="email" autoComplete="email" spellCheck={false} value={draft.email} onChange={event => update({ email: event.target.value })} placeholder="customer@example.com" />)}
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {field('Service address', <input className={inputClass} value={draft.address_line1} onChange={event => update({ address_line1: event.target.value })} placeholder="Street address" />)}
          {field('City', <input className={inputClass} value={draft.city} onChange={event => update({ city: event.target.value })} />)}
          {field('State', <><input className={inputClass} list="local-customer-state-options" value={draft.state} onChange={event => update({ state: event.target.value })} placeholder="Start typing a state..." /><datalist id="local-customer-state-options">{stateOptions.map(state => <option key={state} value={state} />)}</datalist></>)}
          {field('ZIP', <input className={inputClass} autoComplete="postal-code" spellCheck={false} value={draft.zip_code} onChange={event => update({ zip_code: event.target.value })} />)}
        </div>
        {field('Customer notes', <textarea className={`${inputClass} min-h-[80px] resize-y`} value={draft.notes} onChange={event => update({ notes: event.target.value })} placeholder="Gate code, preferred contact method, or other useful details." />)}
      </fieldset>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button type="button" onClick={onSave} disabled={saving || !workspaceReady || !draft.display_name.trim()} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto" data-testid="save-local-customer">
          {saving ? 'Saving...' : workspaceReady ? saveLabel : 'Loading workspace...'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">Cancel</button>
      </div>
    </div>
  );
}

export type { LocalCustomerCreationDraft };
