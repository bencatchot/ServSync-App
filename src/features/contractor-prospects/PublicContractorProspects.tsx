import { useEffect, useState } from 'react';
import { appRouteUrl, contractorProfileUrl } from '../../appLinks';
import { type PublicProspect, prospectButton, prospectError, prospectInput, prospectRpc, prospectUnavailable, UNCLAIMED_COPY } from './prospect';

export function UnclaimedProfileCard({ profile, full = false }: { profile: PublicProspect; full?: boolean }) {
  const d = profile.details;
  const unclaimed = profile.claim_status !== 'claimed';
  return <article className="min-w-0 space-y-3 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
    {unclaimed && <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">Unclaimed profile</span>}
    <div className="flex items-start gap-3">
      {d.logo_url?.startsWith('https://') && <img src={d.logo_url} alt="" referrerPolicy="no-referrer" className="h-16 w-16 shrink-0 rounded-xl object-contain" />}
      <div className="min-w-0"><h2 className="break-words text-xl font-bold">{d.business_name}</h2><p className="text-sm text-slate-500">{[d.city, d.state, d.zip_code].filter(Boolean).join(', ')}</p></div>
    </div>
    <div className="flex flex-wrap gap-2">{d.service_categories?.map(category => <span key={category} className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-800">{category}</span>)}</div>
    {full && <><p className="whitespace-pre-line break-words text-sm leading-6 text-slate-700">{d.business_summary}</p>
      {Boolean(d.service_zip_codes?.length) && <p className="break-words text-sm text-slate-600">Service ZIP codes: {d.service_zip_codes?.join(', ')}</p>}</>}
    {unclaimed && <p className="text-xs text-slate-500">Profile prepared by ServSync. Business details have not yet been confirmed by the owner.</p>}
    {unclaimed && <div className="space-y-3 rounded-xl bg-slate-50 p-3"><p className="text-sm text-slate-600">{UNCLAIMED_COPY}</p>
      <div className="flex flex-wrap gap-2"><button type="button" disabled className={prospectButton}>Request connection</button><button type="button" disabled className={prospectButton}>Request service</button></div>
    </div>}
    {!full && <a className={prospectButton} href={contractorProfileUrl(profile.slug)}>View profile</a>}
  </article>;
}

export function PublicContractorProspect({ slug }: { slug: string }) {
  const [row, setRow] = useState<PublicProspect | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setRow(null); setError('');
    void prospectRpc<PublicProspect[]>('servsync_public_contractor_prospects', { p_slug: slug }).then(rows => {
      if (active) setRow(rows[0] || null);
    }).catch(err => { if (active && !prospectUnavailable(err)) setError(prospectError(err)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [slug, retry]);
  if (loading) return <p role="status" className="p-6 text-center">Loading profile…</p>;
  if (error) return <div role="alert" className="p-6">{error} <button type="button" className={prospectButton} onClick={() => setRetry(v => v + 1)}>Retry</button></div>;
  if (!row) return <div className="rounded-2xl border bg-white p-8 text-center"><h1 className="font-bold">Contractor not found</h1><p>This profile is unavailable or no longer public.</p><a href={appRouteUrl('home')} className={`${prospectButton} mt-4`}>Back to home</a></div>;
  return <div className="mx-auto max-w-3xl"><UnclaimedProfileCard profile={row} full /></div>;
}

export function DiscoverContractorProspects() {
  const [rows, setRows] = useState<PublicProspect[]>([]);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [available, setAvailable] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    void prospectRpc<PublicProspect[]>('servsync_public_contractor_prospects', { p_search: search, p_offset: offset }).then(result => {
      if (active) { setRows(current => offset === 0 ? result : [...current, ...result]); setMore(result.length === 24); setAvailable(true); }
    }).catch(err => { if (active) { setAvailable(!prospectUnavailable(err)); if (!prospectUnavailable(err)) setError(prospectError(err)); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, offset, retry]);
  if (!available || (!loading && !error && rows.length === 0 && !search)) return null;
  return <section className="space-y-3" aria-label="Business profiles">
    <div><h2 className="text-lg font-bold text-slate-950">Local business profiles</h2><p className="text-sm text-slate-600">Browse business profiles. Unclaimed businesses cannot receive connections or requests yet.</p></div>
    <form className="flex gap-2" onSubmit={event => { event.preventDefault(); setRows([]); setSearch(query.trim()); setOffset(0); setRetry(v => v + 1); }}>
      <input aria-label="Search business profiles" className={prospectInput} value={query} onChange={event => setQuery(event.target.value)} placeholder="Business, service, city, or ZIP" maxLength={100} />
      <button className={prospectButton} disabled={loading}>Search businesses</button>
    </form>
    {error && <p role="alert">{error} <button type="button" className={prospectButton} onClick={() => setRetry(v => v + 1)}>Retry</button></p>}
    <div className="grid gap-3 lg:grid-cols-2">{rows.map(row => <UnclaimedProfileCard key={row.id} profile={row} />)}</div>
    {loading && <p role="status">Loading business profiles…</p>}
    {!loading && !error && rows.length === 0 && <p className="text-sm text-slate-500">No matching business profiles.</p>}
    {more && !error && <button type="button" className={prospectButton} disabled={loading} onClick={() => setOffset(v => v + 24)}>Load more businesses</button>}
  </section>;
}
