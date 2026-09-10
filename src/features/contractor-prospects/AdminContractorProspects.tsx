import { useCallback, useEffect, useState } from 'react';
import { contractorClaimUrl, contractorProfileUrl } from '../../appLinks';
import { ProspectDirectory } from './ProspectDirectory';
import { ProspectFields } from './ProspectFields';
import { type AdminProspect, blankProspect, prospectButton, prospectError, prospectInput, prospectRpc, prospectUnavailable } from './prospect';

export function AdminContractorProspects() {
  const [rows, setRows] = useState<AdminProspect[]>([]);
  const [selected, setSelected] = useState<AdminProspect | null>(null);
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState(blankProspect);
  const [linkSuffix, setLinkSuffix] = useState('');
  const businessLinkName = details.business_name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80).replace(/^-|-$/g, '') || 'business';
  const slug = selected?.slug || `${businessLinkName}-${linkSuffix}`;
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
    setSelected(row); setDetails(row?.details || blankProspect()); setPublished(row?.published ?? true);
    if (!row) setLinkSuffix(crypto.randomUUID().replace(/-/g, '').slice(0, 12));
    setEmail(row?.invited_email || row?.details.email || ''); setClaimLink(''); setEditing(true); setError(''); setNotice(''); setDirty(false);
  };
  const apply = (row: AdminProspect) => {
    setRows(current => [row, ...current.filter(item => item.id !== row.id)]);
    setSelected(row); setDetails(row.details); setPublished(row.published); setDirty(false);
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
  return <section className="mb-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 sm:p-5" aria-label="Unclaimed profiles">
    <div className="flex flex-wrap items-start justify-between gap-3"><div>
      <h2 className="text-lg font-bold">Unclaimed profiles</h2>
      <p className="mt-1 text-sm text-slate-600">Prepare a Discover profile, then invite the business to claim it.</p>
    </div><div className="flex flex-wrap gap-2"><button type="button" className={prospectButton} disabled={busy || loading || editing} onClick={() => void load()}>Refresh list</button><button type="button" className={prospectButton} disabled={busy || loading || !available || editing} onClick={() => choose(null)}>Create contractor profile</button></div></div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error} <button type="button" disabled={busy} className="underline" onClick={() => { setEditing(false); setClaimLink(''); void load(); }}>Reload profiles</button></p>}
    {notice && <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">{notice}</p>}
    {loading ? <p role="status">Loading unclaimed profiles…</p> : !editing && available && <ProspectDirectory rows={rows} busy={busy} onManage={choose} onVisibility={row => void act(async () => {
      const updated = await prospectRpc<AdminProspect>('servsync_admin_save_contractor_prospect', {
        p_id: row.id, p_revision: row.revision, p_slug: row.slug, p_details: row.details, p_published: !row.published,
      });
      setRows(current => current.map(item => item.id === updated.id ? updated : item));
      setNotice(updated.published ? 'Profile is visible in Discover. Create a new claim link when you are ready to invite the owner.' : 'Profile hidden from Discover. You can manage it under Hidden from Discover. Previous claim links have been revoked.');
    })} />}
    {editing && <form className="space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
      <ProspectFields value={details} disabled={busy} onChange={value => { setDetails(value); setDirty(true); }} />
      <div className="rounded-xl bg-slate-50 p-3">
        <p className="text-sm font-semibold">Public profile link</p>
        <p className="mt-1 text-sm text-slate-600">Created automatically from the business name. This web link stays the same after saving.</p>
        {(selected || details.business_name.trim()) && <p className="mt-2 break-all text-sm text-blue-800" data-testid="public-profile-link">{contractorProfileUrl(slug)}</p>}
      </div>
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
