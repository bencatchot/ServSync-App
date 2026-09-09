import { useCallback, useEffect, useState } from 'react';
import { contractorClaimUrl, contractorProfileUrl } from '../../appLinks';
import { ProspectFields } from './ProspectFields';
import { type AdminProspect, blankProspect, prospectButton, prospectError, prospectInput, prospectRpc, prospectUnavailable } from './prospect';

export function AdminContractorProspects() {
  const [rows, setRows] = useState<AdminProspect[]>([]);
  const [selected, setSelected] = useState<AdminProspect | null>(null);
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState(blankProspect);
  const [slug, setSlug] = useState('');
  const [customAddress, setCustomAddress] = useState(false);
  const [published, setPublished] = useState(true);
  const [email, setEmail] = useState('');
  const [claimLink, setClaimLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [available, setAvailable] = useState(true);
  const [dirty, setDirty] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setRows(await prospectRpc<AdminProspect[]>('servsync_admin_contractor_prospects')); setAvailable(true); }
    catch (err) { setAvailable(!prospectUnavailable(err)); setError(prospectUnavailable(err) ? 'Prospect profiles are awaiting backend installation in this environment.' : prospectError(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const choose = (row: AdminProspect | null) => {
    setSelected(row); setDetails(row?.details || blankProspect()); setSlug(row?.slug || ''); setPublished(row?.published ?? true);
    setCustomAddress(Boolean(row)); setEmail(row?.invited_email || row?.details.email || ''); setClaimLink(''); setEditing(true); setError(''); setNotice(''); setDirty(false);
  };
  const apply = (row: AdminProspect) => {
    setRows(current => [row, ...current.filter(item => item.id !== row.id)]);
    setSelected(row); setDetails(row.details); setSlug(row.slug); setPublished(row.published); setDirty(false);
  };
  const act = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (err) { setError(prospectError(err)); } finally { setBusy(false); }
  };
  const save = () => act(async () => {
    const row = await prospectRpc<AdminProspect>('servsync_admin_save_contractor_prospect', {
      p_id: selected?.id || null, p_revision: selected?.revision || null, p_slug: slug, p_details: details, p_published: published,
    });
    apply(row); if (!email) setEmail(row.details.email); setClaimLink(''); setNotice('Profile saved. Previous claim links have been revoked.');
  });
  const issue = () => act(async () => {
    if (!selected || dirty) return;
    const result = await prospectRpc<{ token: string; profile: AdminProspect }>('servsync_admin_issue_contractor_claim', {
      p_id: selected.id, p_revision: selected.revision, p_email: email,
    });
    apply(result.profile); setClaimLink(contractorClaimUrl(result.token)); setNotice('Claim link created. Copy it and send it to the recipient. It expires in 14 days and replaces any previous link.');
  });
  return <section className="mb-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 sm:p-5" aria-label="Prospect contractor profiles">
    <div className="flex flex-wrap items-start justify-between gap-3"><div>
      <h2 className="text-lg font-bold">Prospect contractor profiles</h2>
      <p className="mt-1 text-sm text-slate-600">Prepare a Discover profile, then invite the business to claim it.</p>
    </div><button type="button" className={prospectButton} disabled={busy || loading || !available || editing} onClick={() => choose(null)}>Create prospect profile</button></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error} <button type="button" disabled={busy} className="underline" onClick={() => { setEditing(false); setClaimLink(''); void load(); }}>Reload profiles</button></p>}
    {notice && <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">{notice}</p>}
    {loading ? <p role="status">Loading prospect profiles…</p> : !editing && <div className="space-y-2">
      {rows.length === 0 && available && <p className="text-sm text-slate-500">No prospect profiles yet.</p>}
      {rows.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
        <div className="min-w-0"><p className="break-words font-semibold">{row.details.business_name}</p><p className="text-sm capitalize text-slate-500">{row.status} · {row.published ? 'Public' : 'Hidden'}</p></div>
        <div className="flex gap-2">{row.published && <a className={prospectButton} href={contractorProfileUrl(row.slug)}>View profile</a>}
        {!row.claimed_at && <button type="button" disabled={busy} className={prospectButton} onClick={() => choose(row)}>Manage</button>}</div>
      </div>)}
    </div>}
    {editing && <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
      <label className="block text-sm font-semibold">Profile address
        <input className={`${prospectInput} mt-1`} required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={100} disabled={busy || Boolean(selected)}
          value={slug} placeholder="example-plumbing" onChange={event => { setSlug(event.target.value); setCustomAddress(true); setDirty(true); }} />
      </label>
      <ProspectFields value={details} disabled={busy} onChange={value => { setDetails(value); if (!selected && !customAddress) setSlug(value.business_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100)); setDirty(true); }} />
      <p className="text-xs text-slate-500">Contact details and website links stay private until claiming. Use an HTTPS logo URL you have permission to publish.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={published} disabled={busy} onChange={event => { setPublished(event.target.checked); setDirty(true); }} />Visible in Discover as an unclaimed profile</label>
      <p className="text-sm text-slate-600">Saving edits revokes existing claim links. Homeowners cannot connect or send requests until the business claims this profile.</p>
      <div className="flex flex-wrap gap-2"><button className={prospectButton} disabled={busy}>{busy ? 'Working…' : 'Save profile'}</button>
        <button type="button" className={prospectButton} disabled={busy} onClick={() => { setEditing(false); setClaimLink(''); setNotice(''); }}>Close editor</button></div>
      {selected && <div className="space-y-3 border-t border-slate-200 pt-4">
        <h3 className="font-bold">Invite the business owner</h3>
        <label className="block text-sm font-semibold">Claim recipient email<input className={`${prospectInput} mt-1`} type="email" value={email} disabled={busy} onChange={event => { setEmail(event.target.value); setClaimLink(''); }} /></label>
        <p className="text-sm text-slate-500">Only a contractor account with this verified email can claim the profile. No email is sent automatically.</p>
        {dirty && <p className="text-sm text-amber-800">Save your changes before creating a claim link.</p>}
        <div className="flex flex-wrap gap-2"><button type="button" className={prospectButton} disabled={busy || dirty || !email.trim()} onClick={() => void issue()}>Create new claim link</button>
          {['pending', 'expired'].includes(selected.status) && <button type="button" className={prospectButton} disabled={busy || dirty} onClick={() => void act(async () => {
            apply(await prospectRpc<AdminProspect>('servsync_admin_revoke_contractor_claim', { p_id: selected.id, p_revision: selected.revision })); setClaimLink(''); setNotice('Claim link revoked.');
          })}>Revoke claim link</button>}
        </div>
        {selected.expires_at && <p className="text-sm text-slate-500">Expires {new Date(selected.expires_at).toLocaleString()}</p>}
        {claimLink && <div className="space-y-2"><label className="block text-sm font-semibold">Private claim link<input readOnly className={`${prospectInput} mt-1`} value={claimLink} onFocus={event => event.target.select()} /></label>
          <button type="button" className={prospectButton} onClick={() => void act(async () => { await navigator.clipboard.writeText(claimLink); setNotice('Claim link copied.'); })}>Copy claim link</button></div>}
      </div>}
    </form>}
  </section>;
}
