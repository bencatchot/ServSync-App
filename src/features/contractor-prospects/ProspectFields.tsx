import { type ProspectDetails, prospectInput } from './prospect';

const fields: Array<[keyof ProspectDetails, string, string?]> = [
  ['business_name', 'Business name'], ['contact_name', 'Contact name'], ['email', 'Business email', 'email'],
  ['phone', 'Phone', 'tel'], ['website_url', 'Website URL', 'url'], ['logo_url', 'Logo URL', 'url'],
  ['city', 'City'], ['state', 'State'], ['zip_code', 'ZIP code'],
];
export function ProspectFields({ value, onChange, disabled = false }: {
  value: ProspectDetails; onChange: (value: ProspectDetails) => void; disabled?: boolean;
}) {
  return <fieldset disabled={disabled} className="grid min-w-0 gap-3 sm:grid-cols-2">
    {fields.map(([key, label, type]) => <label key={key} className="block min-w-0 text-sm font-semibold text-slate-700">
      {label}<input className={`${prospectInput} mt-1`} type={type || 'text'} required={key === 'business_name'}
        maxLength={500} value={String(value[key])} onChange={event => onChange({ ...value, [key]: event.target.value })} />
    </label>)}
    <label className="text-sm font-semibold text-slate-700">Services (one per line)
      <textarea className={`${prospectInput} mt-1`} rows={3} value={value.service_categories.join('\n')}
        onChange={event => onChange({ ...value, service_categories: event.target.value.split('\n') })} />
    </label>
    <label className="text-sm font-semibold text-slate-700">Service ZIP codes (one per line)
      <textarea className={`${prospectInput} mt-1`} rows={3} value={value.service_zip_codes.join('\n')}
        onChange={event => onChange({ ...value, service_zip_codes: event.target.value.split('\n') })} />
    </label>
    <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Business description
      <textarea className={`${prospectInput} mt-1`} rows={4} maxLength={4000} value={value.business_summary}
        onChange={event => onChange({ ...value, business_summary: event.target.value })} />
    </label>
  </fieldset>;
}
