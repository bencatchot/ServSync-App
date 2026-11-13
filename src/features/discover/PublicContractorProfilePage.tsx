import { useState, useRef, useEffect } from 'react';
import type { ComponentType } from 'react';
import { Link2, MapPin } from 'lucide-react';
import { supabase, configuredSupabaseUrl } from '../../supabaseClient';
import { configuredSupabasePublicStorageUrl } from '../../storageUrls';
import { appHashRoute } from '../../appLinks';
import { STORAGE_KEYS } from '../../utils/localStorage';
import type { Profile, ContextualConnectionContractorTarget, HomeProfile, ContextualConnectionPropertyPermission } from '../../types';
import { usePublicContractorProfile } from './usePublicContractorProfile';
import { SaveContractor } from './ContractorDiscovery';
import { PublicProfileEvidence } from './PublicProfileEvidence';
import { PublicContractorProspect } from '../contractor-prospects/PublicContractorProspects';
import { useProjectInquiry } from './useProjectInquiry';
import { ProjectReference } from './ProjectReference';
import { appendPublicProject } from './projectInquiry';
import { buttonClass } from '../../ui/buttonClass';
import { userFacingError as readableError } from '../../features/reliability/userFacingError';

type ConnectionDraft = { message: string; share_contact: boolean; properties: ContextualConnectionPropertyPermission[] };
type PublicContractorProfilePageProps = {
  slug: string;
  currentProfile: Profile | null;
  onAuthed: () => void;
  AuthPage: ComponentType<{ role: 'homeowner'; inviteCode: string; referralCode: string; initialMode: 'signin' | 'signup'; onAuthed: () => void }>;
  ConnectionModal: ComponentType<{ contractor: ContextualConnectionContractorTarget; homes: HomeProfile[]; submitting: boolean; error?: string; onSubmit: (draft: ConnectionDraft) => Promise<void>; onClose: () => void; projectReference?: React.ReactNode }>;
};
const contractorLogoUrl = (value: string | null | undefined) => configuredSupabasePublicStorageUrl(value, configuredSupabaseUrl, 'contractor-assets');
const updateRoute = (route: 'homeowner', query = '') => { window.location.hash = `#/${route}${query ? `?${query}` : ''}`; };

export function PublicContractorProfilePage({ slug, currentProfile, onAuthed, AuthPage, ConnectionModal }: PublicContractorProfilePageProps) {
  const { data, loading, notFound, error: profileError, connectionStatus, setConnectionStatus, homeownerHomes, retry } = usePublicContractorProfile(slug, currentProfile);
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | null>(() => { const params = new URLSearchParams(window.location.hash.split('?')[1]); return params.get('intent') === 'connect' ? params.get('mode') === 'signup' ? 'signup' : 'signin' : null; });
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestDone, setRequestDone] = useState(false);
  const [requestError, setRequestError] = useState('');
  const submitInFlight = useRef(false);
  const nextStep = useRef<HTMLDivElement>(null);
  const [selectedAction, setSelectedAction] = useState<{ postId: string; contractorId: string } | null>(null);
  const inquiry = useProjectInquiry(slug, data?.contractor_id);
  const reference = inquiry.postId ? <ProjectReference focusOnSelection project={inquiry.project} loading={inquiry.loading} error={inquiry.error} onRemove={inquiry.remove} onRetry={inquiry.retry} disabled={requesting} /> : null;

  // Only a deliberate post-button click advances the flow. Restored links still
  // allow inspection, and every send/accept action remains explicit.
  useEffect(() => {
    if (!selectedAction || loading) return;
    if (inquiry.error || selectedAction.contractorId !== data?.contractor_id || selectedAction.postId !== inquiry.postId) {
      setSelectedAction(null);
      return;
    }
    if (!inquiry.ready) return;
    setSelectedAction(null);
    if (currentProfile?.role === 'homeowner' && connectionStatus === 'active') {
      updateRoute('homeowner', new URLSearchParams({ request_contractor: data.contractor_id, request_post: selectedAction.postId, request_profile: slug }).toString());
    } else if (currentProfile?.role === 'homeowner' && homeownerHomes.length > 0 && (!connectionStatus || ['declined', 'revoked', 'dismissed'].includes(connectionStatus))) {
      setConnectionModalOpen(true);
    } else {
      // Pending relationships, property setup and sign-in have a visible next
      // step instead of silently selecting an already-selected reference.
      nextStep.current?.focus();
      nextStep.current?.scrollIntoView({ block: 'center' });
    }
  }, [selectedAction, loading, inquiry.ready, inquiry.error, inquiry.postId, data?.contractor_id, currentProfile?.role, connectionStatus, homeownerHomes.length, slug]);

  const publicContractorTarget = data ? {
    id: data.contractor_id,
    business_name: data.business_name,
    city: data.city,
    state: data.state,
    logo_url: contractorLogoUrl(data.logo_url),
    service_categories: data.categories,
  } satisfies ContextualConnectionContractorTarget : null;

  const submitConnectionRequest = async (draft: ConnectionDraft) => {
    if (!supabase || !data || !currentProfile || submitInFlight.current) return;
    if (!inquiry.ready) { setRequestError('Check or remove the public post reference before sending.'); return; }
    submitInFlight.current = true;
    setRequesting(true);
    setRequestError('');
    try {
      const { error } = await supabase.rpc('servsync_submit_contextual_connection_request', {
        p_contractor_id: data.contractor_id,
        p_request_message: await appendPublicProject(supabase, draft.message, inquiry.project ?? undefined, data.contractor_id),
        p_share_contact: draft.share_contact,
        p_property_permissions: draft.properties.map(property => ({
          home_id: property.home_id,
          share_home_overview: property.share_home_overview,
          share_address: property.share_address,
          share_preferred_vendors: property.share_preferred_vendors,
          share_photos: false,
        })),
      });
      if (error) throw error;
      setConnectionModalOpen(false);
      setConnectionStatus('pending');
      setRequestDone(true);
      inquiry.remove();
    } catch (err) {
      setRequestError(readableError(err, 'Unable to request contractor connection.'));
    } finally {
      setRequesting(false);
      submitInFlight.current = false;
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500 shadow-sm">
        Loading profile…
      </div>
    );
  }

  if (profileError) return <div role="alert">{profileError} <button className={buttonClass('secondary')} onClick={retry}>Retry profile</button></div>;
  if (notFound || !data) return <PublicContractorProspect slug={slug} />;

  const location = [data.city, data.state].filter(Boolean).join(', ');
  const returnToHomeownerDiscover = () => {
    window.localStorage.setItem(STORAGE_KEYS.homeownerTab, 'discover');
    updateRoute('homeowner');
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {currentProfile?.role === 'homeowner' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-sm text-slate-500">Viewing a public contractor profile from ServSync.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={returnToHomeownerDiscover} className={buttonClass('secondary')}>
              Back to Discover
            </button>
            <button type="button" onClick={() => updateRoute('homeowner')} className={buttonClass('secondary')}>
              Go to my portal
            </button>
          </div>
        </div>
      )}

      {/* Header card */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 gap-4">
            {data.logo_url && (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#E1E3E7] bg-white shadow-sm">
                <img src={contractorLogoUrl(data.logo_url)} alt={`${data.business_name} logo`} className="h-full w-full object-contain p-2" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Contractor profile</p>
              <h1 className="mt-2 text-3xl font-bold text-slate-950">{data.business_name}</h1>
              {location && (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                  <MapPin size={14} />
                  {location}
                </p>
              )}
              {data.categories.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {data.categories.map(c => (
                    <span key={c} className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">{c}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>

        {!connectionModalOpen && reference}
        {/* CTA */}
        <div ref={nextStep} tabIndex={-1} role="region" aria-label="Project inquiry next step" className="mt-5 border-t border-slate-200 pt-5">
          {inquiry.postId && connectionStatus === 'pending' && <p className="mb-3 text-sm" role="status">Your connection request is already pending. This post has not been added to that request. After the contractor accepts, you can return to this post and request service.</p>}
          {!currentProfile && <div className="space-y-3">
            <p className="font-semibold">Connect with {data.business_name}</p><p className="text-sm text-slate-600">Sign in or create a homeowner account, then choose what to share. Nothing is sent automatically.</p>
            <div className="flex flex-wrap gap-2">{(['signin', 'signup'] as const).map(mode => <button key={mode} className={buttonClass(mode === 'signin' ? 'primary' : 'secondary')} onClick={() => { window.history.replaceState(null, '', appHashRoute('profile', { slug, intent: 'connect', mode, post: inquiry.postId })); setAuthMode(mode); }}>{mode === 'signin' ? 'Sign in to connect' : 'Create homeowner account'}</button>)}</div>
            {authMode && <AuthPage key={authMode} role="homeowner" inviteCode="" referralCode="" initialMode={authMode} onAuthed={onAuthed} />}
          </div>}
          {currentProfile?.role === 'homeowner' && <SaveContractor key={currentProfile.id} homeownerId={currentProfile.id} contractorId={data.contractor_id} />}
          {currentProfile?.role === 'homeowner' && (!connectionStatus || ['declined', 'revoked', 'dismissed'].includes(connectionStatus)) && !requestDone && (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-semibold text-blue-950">Connect before requesting service</p>
              <p className="mt-1 text-sm text-blue-800">
                Send a connection request first. Choose the properties and service-relevant details this contractor may see if they accept.
              </p>
              {requestError && <div className="mt-3"><p role="alert">{requestError}</p></div>}
              {homeownerHomes.length === 0 && <div className="mt-3 text-sm"><p>Add a property before sending a connection request. Then return here to choose what to share.</p><button className={buttonClass('secondary')} onClick={() => { window.localStorage.setItem(STORAGE_KEYS.homeownerTab, 'home'); updateRoute('homeowner', new URLSearchParams({ return_profile: slug, ...(inquiry.postId ? { return_post: inquiry.postId } : {}) }).toString()); }}>Set up my property</button></div>}
              <button type="button" onClick={() => setConnectionModalOpen(true)} disabled={requesting || !inquiry.ready} className={`${buttonClass('primary')} mt-3`}>
                <Link2 size={16} />
                {requesting ? 'Sending request…' : connectionStatus ? `Request again with ${data.business_name}` : `Request connection with ${data.business_name}`}
              </button>
            </div>
          )}
          {currentProfile?.role === 'homeowner' && ((connectionStatus && !['declined', 'revoked', 'dismissed'].includes(connectionStatus)) || requestDone) && (
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${
                connectionStatus === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
              }`}>
                {connectionStatus === 'active' ? 'Connected' : 'Connection request sent'}
              </span>
              {connectionStatus === 'active' && <button className={buttonClass('primary')} disabled={!inquiry.ready} onClick={() => updateRoute('homeowner', new URLSearchParams({ request_contractor: data.contractor_id, ...(inquiry.postId ? { request_post: inquiry.postId, request_profile: slug } : {}) }).toString())}>Request service</button>}
              <button type="button" onClick={returnToHomeownerDiscover} className={buttonClass('secondary')}>
                Back to Discover
              </button>
              <button type="button" onClick={() => updateRoute('homeowner')} className={buttonClass('secondary')}>
                Go to my portal
              </button>
            </div>
          )}
          {currentProfile?.role === 'contractor' && (
            <p className="text-xs text-slate-500">You're viewing this as a contractor. Homeowners can request a connection from this page.</p>
          )}
        </div>
      </section>

      {publicContractorTarget && connectionModalOpen && (
        <ConnectionModal
          key={`connection-${publicContractorTarget.id}`}
          contractor={publicContractorTarget}
          homes={homeownerHomes}
          submitting={requesting}
          error={requestError}
          projectReference={reference}
          onSubmit={submitConnectionRequest}
          onClose={() => {
            if (requesting) return;
            setConnectionModalOpen(false);
            inquiry.remove();
            setRequestError('');
          }}
        />
      )}

      <PublicProfileEvidence key={`evidence-${data.contractor_id}`} profile={data} onAskAboutPost={currentProfile && currentProfile.role !== 'homeowner' ? undefined : postId => { inquiry.select(postId); setRequestError(''); if (!currentProfile) setAuthMode(mode => mode ?? 'signin'); setSelectedAction({ postId, contractorId: data.contractor_id }); }} />
    </div>
  );
}

