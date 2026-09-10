import { useEffect, useState, type ReactNode } from 'react';
import type { Profile } from '../../types';
import { ProspectFields } from './ProspectFields';
import { type ClaimReview, blankProspect, prospectButton, prospectError, prospectRpc, prospectUnavailable } from './prospect';

export function ContractorClaimPage({ token, profile, authentication, onClaimed }: {
  token: string; profile: Profile | null; authentication: ReactNode; onClaimed: () => void;
}) {
  const [review, setReview] = useState<ClaimReview | null>(null);
  const [details, setDetails] = useState(blankProspect);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setReview(null); setError(''); setAccepted(false);
    void prospectRpc<ClaimReview>('servsync_review_contractor_claim', { p_token: token }).then(result => {
      if (active) { setReview(result); setDetails({ ...blankProspect(), ...result.details }); }
    }).catch(err => { if (active) setError(prospectUnavailable(err) ? 'Business profile claiming is not available yet. Please contact ServSync for help.' : prospectError(err)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, profile?.id, retry]);
  const claim = async () => {
    if (!review || !accepted || busy) return;
    setBusy(true); setError('');
    try {
      await prospectRpc('servsync_accept_contractor_claim', { p_token: token, p_revision: review.revision, p_details: details });
      // Remove the bearer token from browser history once consumed.
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/contractor`);
      onClaimed();
    } catch (err) { setError(prospectError(err)); } finally { setBusy(false); }
  };
  return <section className="mx-auto max-w-3xl space-y-4 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
    <h1 className="text-2xl font-bold">Claim your business profile</h1>
    {loading && <p role="status">Checking your claim link…</p>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error} <button type="button" className="underline" disabled={busy} onClick={() => setRetry(v => v + 1)}>Check again</button></p>}
    {!profile && review && <><p>ServSync prepared a profile for <strong>{review.details.business_name}</strong>. Create an account or sign in using the email that received this invitation.</p>
      <p className="text-sm text-slate-600">After verifying your email, reopen this private claim link to review and claim your profile.</p>{authentication}</>}
    {profile && profile.role !== 'contractor' && <p>Use a contractor account to claim this business. Sign out, then reopen the invitation with the invited account.</p>}
    {profile?.role === 'contractor' && review && <form className="space-y-4" onSubmit={event => { event.preventDefault(); void claim(); }}>
      <p className="text-sm text-slate-600">Review and correct the prepared information. Claiming makes you the profile owner and enables the normal homeowner connection and service-request workflow.</p>
      <ProspectFields value={details} onChange={setDetails} disabled={busy} />
      <p className="text-sm text-slate-600">Your profile will remain {review.published ? 'public at its current address' : 'hidden'}. Manage its visibility and contact details in your contractor profile after claiming.</p>
      <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={accepted} disabled={busy} onChange={event => setAccepted(event.target.checked)} />I am authorized to manage this business and want to claim this profile.</label>
      <button className={prospectButton} disabled={busy || !accepted}>{busy ? 'Claiming…' : 'Claim business profile'}</button>
    </form>}
  </section>;
}
