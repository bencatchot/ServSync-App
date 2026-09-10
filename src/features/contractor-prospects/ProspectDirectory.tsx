import { useState } from 'react';
import { contractorProfileUrl } from '../../appLinks';
import { type AdminProspect, prospectButton, prospectInput } from './prospect';

const invitationLabels = { draft: 'Not invited', pending: 'Invitation pending', expired: 'Invitation expired', revoked: 'Invitation revoked', claimed: 'Claimed' };
const PAGE_SIZE = 10;

export function ProspectDirectory({ rows, busy, onManage, onVisibility }: {
  rows: AdminProspect[]; busy: boolean; onManage: (row: AdminProspect) => void;
  onVisibility: (row: AdminProspect) => void;
}) {
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [invitation, setInvitation] = useState('all');
  const [page, setPage] = useState(0);
  const unclaimed = rows.filter(row => !row.claimed_at);
  const search = query.trim().toLowerCase();
  const filtered = unclaimed.filter(row => (visibility === 'all' || row.published === (visibility === 'public'))
    && (invitation === 'all' || row.status === invitation)
    && [row.details.business_name, row.details.contact_name, row.details.email, row.invited_email, row.details.city, row.details.state, row.slug].join(' ').toLowerCase().includes(search));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visibleRows = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  return <div className="space-y-4">
    <p className="text-sm text-slate-600">{unclaimed.filter(row => row.published).length} public · {unclaimed.filter(row => !row.published).length} hidden. Claimed businesses are managed in Contractors.</p>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="block text-sm font-semibold">Search unclaimed profiles<input className={`${prospectInput} mt-1`} value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Business, contact, email, or city" /></label>
      <label className="block text-sm font-semibold">Visibility<select className={`${prospectInput} mt-1`} value={visibility} onChange={event => { setVisibility(event.target.value); setPage(0); }}>
        <option value="public">Public in Discover</option><option value="hidden">Hidden from Discover</option><option value="all">All unclaimed profiles</option>
      </select></label>
      <label className="block text-sm font-semibold">Invitation status<select className={`${prospectInput} mt-1`} value={invitation} onChange={event => { setInvitation(event.target.value); setPage(0); }}>
        <option value="all">All invitations</option><option value="draft">Not invited</option><option value="pending">Pending</option><option value="expired">Expired</option><option value="revoked">Revoked</option>
      </select></label>
    </div>
    <p className="text-sm text-slate-500">Profiles stay here until claimed. Hide a profile to remove it from Discover and the default list; find it again under Hidden from Discover. Changing visibility revokes existing claim links.</p>
    {visibleRows.length === 0 && <p className="py-4 text-sm text-slate-500">No unclaimed profiles match these filters.</p>}
    {visibleRows.map(row => <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3" aria-label={row.details.business_name}>
      <div className="min-w-0"><h3 className="break-words font-semibold">{row.details.business_name}</h3>
        <p className="text-sm text-slate-500">{invitationLabels[row.status]} · {row.published ? 'Public' : 'Hidden'}</p>
        {(row.invited_email || row.details.email) && <p className="break-all text-sm text-slate-500">{row.invited_email || row.details.email}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{row.published && <a className={prospectButton} href={contractorProfileUrl(row.slug)}>View profile</a>}
        <button type="button" disabled={busy} className={prospectButton} onClick={() => onManage(row)}>Manage</button>
        <button type="button" disabled={busy} className={prospectButton} onClick={() => onVisibility(row)}>{row.published ? 'Hide from Discover' : 'Show in Discover'}</button>
      </div>
    </article>)}
    {pages > 1 && <nav className="flex flex-wrap items-center gap-3" aria-label="Unclaimed profile pages">
      <button className={prospectButton} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
      <span className="text-sm">Page {currentPage + 1} of {pages}</span>
      <button className={prospectButton} disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next</button>
    </nav>}
  </div>;
}
