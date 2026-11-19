import type { ContractorConnectedHomeowner, ContractorLocalContact } from '../../types';

export function InvoicePropertyField({ homeId, localHomeId, connection, local, linked, disabled, onChange }: {
  homeId?: string; localHomeId?: string;
  connection: ContractorConnectedHomeowner | null; local: ContractorLocalContact | null;
  linked: boolean; disabled: boolean;
  onChange: (homeId: string, localHomeId: string) => void;
}) {
  const homes = connection
    ? connection.status === 'active' ? connection.homes?.length ? connection.homes : connection.home ? [connection.home] : [] : []
    : local?.homes?.filter(home => !home.archived_at && home.local_contact_id === local.id && home.contractor_id === local.contractor_id) || [];
  const selected = (connection ? homeId : localHomeId) || '';
  const known = homes.some(home => home.id === selected);
  return <div className="mt-3 mb-4">
    <label className="block text-xs font-semibold text-slate-600">Service property
      <select aria-label="Invoice service property" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        disabled={disabled || linked} value={selected} onChange={event => onChange(connection ? event.target.value : '', connection ? '' : event.target.value)}>
        <option value="">No property selected</option>
        {selected && !known && <option value={selected}>Linked property unavailable</option>}
        {homes.filter(home => home.id).map((home, index) => <option key={home.id} value={home.id}>{home.nickname || home.address_line1 || `Property ${index + 1}`}</option>)}
      </select>
    </label>
    <p className="mt-1 text-xs text-slate-500">{linked ? 'Uses the linked work property. ' : 'Choose the property this invoice covers. '}The PDF includes only available, authorized address details. A property name is not a street address.</p>
  </div>;
}
