import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Check, ChevronLeft, ChevronRight, Globe2, Link2, Loader2, PencilLine, RefreshCw, RotateCcw, ShieldCheck, Unplug, Upload, Video, X, XCircle } from 'lucide-react';
import type { MarketingContentItem } from './marketingContent';
import {
  pairingForContent,
  parseMarketingMediaUploadMetadata,
  type MarketingMediaUploadMetadata,
  type MarketingMediaState,
} from './marketingMedia';
import {
  eligibleFacebookPreviewContent,
  marketingProviderPreview,
  marketingPublicationSnapshotForContent,
} from './marketingPublicationPreview';
import type {
  MarketingProvider,
  MarketingProviderConnection,
  MarketingPublication,
  MarketingPublicationMode,
  MarketingPublishingState,
} from './marketingPublishing';

const PROVIDER_LABELS: Record<MarketingProvider, string> = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok' };
const STATUS_LABELS: Record<MarketingPublication['status'], string> = {
  scheduled: 'Scheduled', publishing: 'Publishing', published: 'Published', failed: 'Failed', cancelled: 'Cancelled',
};
const READINESS_LABELS: Record<MarketingProviderConnection['readinessStatus'], string> = {
  setup_required: 'Not connected',
  authorization_pending: 'Authorization pending',
  page_selection_required: 'Choose Page',
  ready_except_live_post_verification: 'Ready except live post verification',
  reconnect_required: 'Reconnect required',
  disconnected: 'Disconnected',
  error: 'Setup error',
};

const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value)) : 'Not recorded';

const AUDIENCE_LABELS: Record<NonNullable<MarketingContentItem['intendedAudience']>, string> = {
  small_contractors: 'Small contractors', hvac_contractors: 'HVAC contractors', plumbers: 'Plumbers',
  electricians: 'Electricians', carpentry_contractors: 'Carpentry contractors',
  lawn_landscaping_contractors: 'Lawn care and landscaping contractors',
  pressure_washing_contractors: 'Pressure washing contractors',
  handyman_contractors: 'Handyman and general maintenance contractors', homeowners: 'Homeowners',
};

export function MarketingPublicationComposer({
  contentItems,
  selectedContentId,
  facebook,
  busy,
  onSelectContent,
  onReturnForRevision,
  onCreate,
  mediaState,
  onUploadMedia,
  onReviewMedia,
}: {
  contentItems: MarketingContentItem[];
  selectedContentId: string | null;
  facebook: MarketingProviderConnection | null;
  busy: boolean;
  onSelectContent: (content: MarketingContentItem) => void;
  onReturnForRevision: (content: MarketingContentItem) => void;
  onCreate: (input: { connection: MarketingProviderConnection; mode: MarketingPublicationMode; scheduledAt: string | null }) => Promise<void>;
  mediaState: MarketingMediaState | null;
  onUploadMedia: (input: { content: MarketingContentItem; mp4: File; metadata: MarketingMediaUploadMetadata; claimDemonstrated: string }) => Promise<void>;
  onReviewMedia: (pairingId: string, decision: 'approved' | 'rejected') => Promise<void>;
}) {
  const candidates = useMemo(() => eligibleFacebookPreviewContent(contentItems), [contentItems]);
  const selected = candidates.find(content => content.id === selectedContentId) ?? candidates[0] ?? null;
  const selectedIndex = selected ? candidates.findIndex(content => content.id === selected.id) : -1;
  const [mode, setMode] = useState<MarketingPublicationMode>('publish_now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [mp4File, setMp4File] = useState<File | null>(null);
  const [metadataFile, setMetadataFile] = useState<File | null>(null);
  const [claimDemonstrated, setClaimDemonstrated] = useState('');
  const [mediaError, setMediaError] = useState<string | null>(null);
  const mediaPairing = pairingForContent(mediaState, selected);
  const mediaAsset = mediaPairing ? mediaState?.assets.find(asset => asset.id === mediaPairing.assetId) ?? null : null;
  const snapshot = selected ? marketingPublicationSnapshotForContent(selected, mediaPairing, mediaAsset) : null;
  const preview = snapshot ? marketingProviderPreview('facebook', snapshot) : null;
  const connectionReady = facebook?.status === 'connected'
    && facebook.readinessStatus === 'ready_except_live_post_verification'
    && facebook.capabilities.text;
  const pairedMediaPublishingUnavailable = Boolean(mediaPairing) && facebook?.capabilities.media !== true;
  const publishingEnabled = connectionReady && facebook.capabilities.publishingEnabled && !pairedMediaPublishingUnavailable;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time';
  const parsedSchedule = scheduledAt ? new Date(scheduledAt) : null;
  const scheduledIso = parsedSchedule && Number.isFinite(parsedSchedule.getTime()) ? parsedSchedule.toISOString() : null;

  useEffect(() => {
    setShowConfirmation(false);
    setSubmitError(null);
  }, [selected?.id, mode, scheduledAt]);

  useEffect(() => {
    setMediaError(null);
    setMp4File(null);
    setMetadataFile(null);
    setClaimDemonstrated('');
  }, [selected?.id]);

  const uploadMedia = async () => {
    if (!selected || !mp4File || !metadataFile) return;
    setMediaError(null);
    try {
      const metadata = parseMarketingMediaUploadMetadata(JSON.parse(await metadataFile.text()));
      await onUploadMedia({ content: selected, mp4: mp4File, metadata, claimDemonstrated });
      setMp4File(null);
      setMetadataFile(null);
      setClaimDemonstrated('');
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : 'ServSync could not add the Marketing video.');
    }
  };

  const submit = async () => {
    if (!facebook || !publishingEnabled) return;
    setSubmitError(null);
    try {
      await onCreate({
        connection: facebook,
        mode,
        scheduledAt: mode === 'scheduled' ? scheduledIso : null,
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'ServSync could not create the publication.');
    }
  };

  if (!selected || !preview) {
    return <section data-testid="marketing-publication-composer" className="border-y border-dashed border-slate-200 py-8 text-center"><p className="text-sm font-bold text-slate-700">No Facebook posts ready for review</p><p className="mt-1 text-sm text-slate-500">Submitted and approved social posts will appear here for owner review.</p></section>;
  }

  const move = (offset: number) => {
    const nextIndex = (selectedIndex + offset + candidates.length) % candidates.length;
    onSelectContent(candidates[nextIndex]);
  };

  return (
    <section data-testid="marketing-publication-composer" className="space-y-5 border-y border-slate-200 py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase text-blue-700">Owner publication preview</p><h3 className="mt-1 text-base font-bold text-slate-950">Facebook post review</h3><p className="mt-1 text-sm text-slate-500">Review the exact public message and managed media before any publication is created.</p></div><div className="flex items-center gap-2"><button type="button" aria-label="Previous reviewable post" onClick={() => move(-1)} className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white"><ChevronLeft size={17} /></button><span className="min-w-16 text-center text-sm font-bold text-slate-700">{selectedIndex + 1} of {candidates.length}</span><button type="button" aria-label="Next reviewable post" onClick={() => move(1)} className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 bg-white"><ChevronRight size={17} /></button></div></div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(13rem,0.65fr)_minmax(0,1.35fr)]">
        <div className="min-w-0 space-y-4">
          <div aria-label="Facebook posts ready for review" className="max-h-72 divide-y divide-slate-200 overflow-y-auto border-y border-slate-200">{candidates.map((content, index) => <button key={content.id} type="button" onClick={() => onSelectContent(content)} className={`w-full px-2 py-3 text-left ${content.id === selected.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}><span className="block text-xs font-bold text-slate-500">{index + 1} · {content.status === 'approved' ? 'Approved' : 'Awaiting text approval'}</span><span className="mt-0.5 block text-sm font-bold text-slate-900">{content.title}</span></button>)}</div>
          <div data-testid="marketing-preview-internal-metadata" className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase text-slate-500">Internal ServSync metadata</p>
            <div><p className="text-sm font-bold text-slate-950">{selected.title}</p><p className="mt-1 text-xs text-slate-600">{selected.status === 'approved' ? 'Approved' : 'Awaiting text approval'} · revision {selected.revisionNumber} · Social post</p></div>
            <dl className="grid gap-2 text-xs"><div><dt className="font-bold text-slate-500">Audience</dt><dd className="mt-0.5 text-slate-800">{selected.intendedAudience ? AUDIENCE_LABELS[selected.intendedAudience] : 'Not specified'}</dd></div><div><dt className="font-bold text-slate-500">Marketing Direction</dt><dd className="mt-0.5 text-slate-800">{selected.sourceDirectionTopic ?? 'Historical approved content'}</dd></div><div><dt className="font-bold text-slate-500">Grounding</dt><dd className="mt-0.5 text-slate-800">{selected.strategicSource === 'approved_direction' ? `First-class approved Direction lineage · Direction revision ${selected.sourceDirectionRevision}` : 'Historical approved item · confirm current product truth before publishing'}</dd></div></dl>
            <button type="button" onClick={() => onReturnForRevision(selected)} className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-blue-700"><PencilLine size={15} />Return for revision</button>
            <p className="text-xs leading-5 text-slate-500">Copy changes stay in the normal Content review lifecycle. Media approval does not approve the text.</p>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div><p className="text-xs font-bold uppercase text-slate-500">Public Facebook content</p><p className="mt-1 text-xs text-slate-500">Facebook preview. Facebook may render spacing and layout differently.</p></div>
          <article data-testid="facebook-public-preview" className="mx-auto w-full max-w-[34rem] overflow-hidden rounded-md border border-slate-300 bg-white shadow-sm">
            <div className="flex items-start gap-3 p-4"><img src="/servsync-pwa-192.png" alt="ServSync Page" className="h-11 w-11 rounded-full border border-slate-200 object-cover" /><div className="min-w-0 flex-1"><p className="text-[15px] font-bold text-slate-950">{facebook?.destinationLabel ?? 'ServSync'}</p><p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">Facebook preview <Globe2 size={12} aria-hidden="true" /></p></div></div>
            <p className="whitespace-pre-wrap break-words px-4 pb-5 text-[15px] leading-6 text-slate-900">{preview.publicMessage}</p>
            {mediaAsset && <video data-testid="facebook-public-preview-video" controls preload="metadata" src={mediaAsset.signedUrl} className="aspect-video w-full bg-black object-contain"><track kind="captions" /></video>}
            <div className="border-t border-slate-200 px-4 py-3 text-xs font-semibold text-slate-500">Media: {mediaPairing ? `${mediaPairing.status === 'approved' ? 'Approved' : 'Candidate'} product demo video` : preview.mediaLabel}</div>
          </article>

          {mediaPairing && mediaAsset ? <section data-testid="marketing-media-review" className="space-y-3 border-y border-slate-200 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold text-slate-950">Product-demo pairing</p><p className="mt-1 text-sm text-slate-600">{mediaPairing.claimDemonstrated}</p></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${mediaPairing.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{mediaPairing.status === 'approved' ? 'Media approved' : 'Awaiting media approval'}</span></div>
            <dl className="grid gap-2 text-xs sm:grid-cols-2"><div><dt className="font-bold text-slate-500">Recorder scenario</dt><dd className="mt-0.5 text-slate-800">{mediaAsset.recorderScenario}</dd></div><div><dt className="font-bold text-slate-500">Recording</dt><dd className="mt-0.5 text-slate-800">{mediaAsset.durationSeconds.toFixed(1)} seconds · {mediaAsset.width}×{mediaAsset.height}</dd></div><div><dt className="font-bold text-slate-500">Media kind</dt><dd className="mt-0.5 text-slate-800">{mediaAsset.mediaVariant === 'narrated_marketing_derivative' ? 'Narrated marketing derivative' : 'Silent product demo master'}</dd></div><div><dt className="font-bold text-slate-500">Voice</dt><dd className="mt-0.5 text-slate-800">{mediaAsset.narrationVoice ? `${mediaAsset.narrationVoice} · ${mediaAsset.narrationModel}` : 'No narration'}</dd></div><div><dt className="font-bold text-slate-500">Pacing review</dt><dd className="mt-0.5 text-emerald-700">Passed at normal speed</dd></div><div><dt className="font-bold text-slate-500">Sensitive-data check</dt><dd className="mt-0.5 text-emerald-700">Passed</dd></div><div><dt className="font-bold text-slate-500">Text approval</dt><dd className="mt-0.5 text-slate-800">{selected.status === 'approved' ? 'Approved' : 'Pending owner decision'}</dd></div><div><dt className="font-bold text-slate-500">Checksum</dt><dd className="mt-0.5 break-all font-mono text-slate-800">{mediaAsset.sha256}</dd></div></dl>
            {mediaPairing.status === 'candidate' && <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={() => void onReviewMedia(mediaPairing.id, 'rejected')} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-rose-300 px-3 text-sm font-bold text-rose-700"><X size={16} />Reject video</button><button type="button" disabled={busy} onClick={() => void onReviewMedia(mediaPairing.id, 'approved')} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-bold text-white"><Check size={16} />Approve video pairing</button></div>}
            {mediaPairing.status === 'approved' && <button type="button" disabled={busy} onClick={() => void onReviewMedia(mediaPairing.id, 'rejected')} className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-rose-700"><X size={16} />Retire this video pairing</button>}
          </section> : <section data-testid="marketing-media-upload" className="space-y-3 border-y border-dashed border-slate-200 py-4">
            <div className="flex items-center gap-2"><Video size={17} className="text-blue-700" /><div><p className="text-sm font-bold text-slate-950">Pair a validated Demo recording</p><p className="text-xs text-slate-500">Requires the reviewed MP4 and its matching silent or narrated metadata manifest.</p></div></div>
            <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold text-slate-800">Demo MP4<input type="file" accept="video/mp4,.mp4" onChange={event => setMp4File(event.target.files?.[0] ?? null)} className="mt-1.5 block w-full text-xs font-normal" /></label><label className="text-sm font-bold text-slate-800">Recorder metadata<input type="file" accept="application/json,.json" onChange={event => setMetadataFile(event.target.files?.[0] ?? null)} className="mt-1.5 block w-full text-xs font-normal" /></label></div>
            <label className="block text-sm font-bold text-slate-800">Claim demonstrated<textarea value={claimDemonstrated} onChange={event => setClaimDemonstrated(event.target.value)} maxLength={500} rows={2} placeholder="Describe exactly what the recording proves." className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
            {mediaError && <p role="alert" className="text-sm text-rose-700">{mediaError}</p>}
            <div className="flex justify-end"><button type="button" disabled={busy || !mp4File || !metadataFile || claimDemonstrated.trim().length < 10} onClick={() => void uploadMedia()} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50"><Upload size={16} />Upload private video candidate</button></div>
          </section>}

          {!connectionReady && <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">A valid connected Facebook Page is required before this preview can advance.</p>}
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold text-slate-800">Timing<select value={mode} onChange={event => setMode(event.target.value as MarketingPublicationMode)} className="mt-1.5 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="publish_now">Publish now</option><option value="scheduled">Schedule for later</option></select></label>{mode === 'scheduled' && <label className="text-sm font-bold text-slate-800">Scheduled time<input type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} className="mt-1.5 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" /><span className="mt-1 block text-xs font-normal text-slate-500">{timezone}{scheduledIso ? ` · ${scheduledIso}` : ''}</span></label>}</div>
          {selected.status !== 'approved' && <p role="status" className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">This exact post is ready for owner text review. Approving the media does not approve or publish the copy.</p>}
          <div className="flex justify-end"><button type="button" disabled={selected.status !== 'approved' || !connectionReady || (mode === 'scheduled' && !scheduledIso)} onClick={() => setShowConfirmation(true)} className="min-h-11 rounded-md bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50">Review publication</button></div>
        </div>
      </div>

      {showConfirmation && <section data-testid="marketing-publication-confirmation" className="space-y-4 rounded-md border border-blue-200 bg-blue-50 p-4"><div><p className="text-xs font-bold uppercase text-blue-700">Final confirmation</p><h4 className="mt-1 text-sm font-bold text-slate-950">{mode === 'scheduled' ? 'Schedule Facebook Post' : 'Publish to Facebook'}</h4></div><dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs font-bold uppercase text-slate-500">Destination</dt><dd className="mt-1 font-semibold text-slate-900">Facebook<br />Page: {facebook?.destinationLabel ?? 'ServSync'}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-500">Media</dt><dd className="mt-1 text-slate-900">{mediaPairing ? `${mediaPairing.status === 'approved' ? 'Approved' : 'Candidate'} product demo video` : preview.mediaLabel}</dd></div><div className="sm:col-span-2"><dt className="text-xs font-bold uppercase text-slate-500">Public content</dt><dd className="mt-1 whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-3 text-slate-900">{preview.publicMessage}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-500">Source</dt><dd className="mt-1 text-slate-900">{selected.title}<br />Approved revision {selected.revisionNumber}</dd></div><div><dt className="text-xs font-bold uppercase text-slate-500">Timing</dt><dd className="mt-1 text-slate-900">{mode === 'publish_now' ? 'Publish now' : `${formatDate(scheduledIso)} · ${timezone}`}</dd></div></dl>{pairedMediaPublishingUnavailable && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Provider media publishing is not enabled. ServSync will not silently publish this approved text without its paired video.</p>}{!publishingEnabled && !pairedMediaPublishingUnavailable && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Public posting is disabled. This preview cannot create or schedule a publication.</p>}<div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setShowConfirmation(false)} className="min-h-11 px-4 text-sm font-bold text-slate-600">Back to preview</button><button type="button" disabled={!publishingEnabled || busy} onClick={() => void submit()} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" />}{mode === 'scheduled' ? 'Schedule Facebook Post' : 'Publish to Facebook'}</button></div></section>}
      {submitError && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{submitError}</p>}
    </section>
  );
}

export function MarketingPublishingWorkspace({ state, contentItems, selectedContentId, loading, error, saving, onSelectContent, onReturnForRevision, onCreate, onReload, onCancel, onRetry, onConnectFacebook, onSelectFacebookPage, onRecheckFacebook, onDisconnectFacebook, mediaState, onUploadMedia, onReviewMedia }: {
  state: MarketingPublishingState | null; loading: boolean; error: string | null; saving: boolean;
  contentItems: MarketingContentItem[]; selectedContentId: string | null;
  onSelectContent: (content: MarketingContentItem) => void;
  onReturnForRevision: (content: MarketingContentItem) => void;
  onCreate: Parameters<typeof MarketingPublicationComposer>[0]['onCreate'];
  onReload: () => Promise<void>; onCancel: (publication: MarketingPublication) => Promise<void>; onRetry: (publication: MarketingPublication) => Promise<void>;
  onConnectFacebook: () => Promise<void>;
  onSelectFacebookPage: (sessionId: string, pageId: string) => Promise<void>;
  onRecheckFacebook: () => Promise<void>;
  onDisconnectFacebook: () => Promise<void>;
  mediaState: MarketingMediaState | null;
  onUploadMedia: Parameters<typeof MarketingPublicationComposer>[0]['onUploadMedia'];
  onReviewMedia: Parameters<typeof MarketingPublicationComposer>[0]['onReviewMedia'];
}) {
  const publications = useMemo(() => state?.publications ?? [], [state]);
  const facebook = state?.providers.find(provider => provider.provider === 'facebook') ?? null;
  return <section data-testid="marketing-publishing-workspace" className="space-y-4">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">Publishing</h2><p className="mt-1 text-sm text-slate-500">Provider readiness, scheduled work, and publication history.</p></div><button type="button" aria-label="Reload publishing" onClick={() => void onReload()} disabled={loading || saving} className="flex h-11 w-11 items-center justify-center rounded-md border border-slate-300 bg-white"><RefreshCw size={17} /></button></div>
    {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-3">{state?.providers.map(provider => <article key={provider.id} className="rounded-md border border-slate-200 bg-white p-3"><p className="text-sm font-bold text-slate-950">{PROVIDER_LABELS[provider.provider]}</p><p className="mt-1 text-xs font-bold uppercase text-slate-500">{READINESS_LABELS[provider.readinessStatus]}</p><p className="mt-2 text-sm leading-5 text-slate-600">{provider.readinessNote}</p>{provider.lastValidatedAt && <p className="mt-2 text-xs text-slate-500">Last checked: {formatDate(provider.lastValidatedAt)}</p>}</article>)}</div>
    {facebook && <section data-testid="marketing-facebook-connection" className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-blue-700" /><h3 className="text-sm font-bold text-slate-950">Facebook Page connection</h3></div><p className="mt-1 text-sm text-slate-600">{facebook.destinationLabel ? `Page: ${facebook.destinationLabel}` : facebook.readinessNote}</p></div>
        {facebook.status === 'connected' ? <div className="flex gap-2"><button type="button" disabled={saving} onClick={() => void onRecheckFacebook()} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-bold"><RefreshCw size={16} />Recheck</button><button type="button" disabled={saving} onClick={() => void onDisconnectFacebook()} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-rose-300 px-3 text-sm font-bold text-rose-700"><Unplug size={16} />Disconnect</button></div>
          : <button type="button" disabled={saving} onClick={() => void onConnectFacebook()} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-50"><Link2 size={16} />{facebook.readinessStatus === 'authorization_pending' ? 'Restart authorization' : 'Connect Facebook'}</button>}
      </div>
      {facebook.status === 'connected' && <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">Connection readiness is validated without posting. Public posting remains disabled until a separate owner-authorized live-post task.</p>}
      {state?.facebookSetup && <fieldset className="mt-4 space-y-2"><legend className="text-sm font-bold text-slate-900">Choose the ServSync Page</legend>{state.facebookSetup.candidatePages.length === 0 ? <p className="text-sm text-slate-600">Facebook returned no Pages available for this connection.</p> : state.facebookSetup.candidatePages.map(page => <div key={page.pageId} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-3"><div><p className="text-sm font-bold text-slate-900">{page.pageName}</p><p className="text-xs text-slate-500">{page.eligible ? 'Eligible for Page publishing readiness' : 'Required Page authority is missing'}</p></div><button type="button" disabled={saving || !page.eligible} onClick={() => void onSelectFacebookPage(state.facebookSetup!.sessionId, page.pageId)} className="min-h-11 rounded-md border border-blue-300 px-3 text-sm font-bold text-blue-700 disabled:opacity-50">Connect this Page</button></div>)}</fieldset>}
    </section>}
    <MarketingPublicationComposer contentItems={contentItems} selectedContentId={selectedContentId} facebook={facebook} busy={saving} onSelectContent={onSelectContent} onReturnForRevision={onReturnForRevision} onCreate={onCreate} mediaState={mediaState} onUploadMedia={onUploadMedia} onReviewMedia={onReviewMedia} />
    {loading ? <p className="py-10 text-center text-sm text-slate-500">Loading publication history...</p> : publications.length === 0 ? <div className="border-y border-dashed border-slate-200 py-10 text-center"><CalendarClock className="mx-auto text-slate-400" size={22} /><p className="mt-2 text-sm font-bold text-slate-700">No publication history yet</p><p className="mt-1 text-sm text-slate-500">Approval alone never creates or schedules a publication.</p></div> : <div className="divide-y divide-slate-200 border-y border-slate-200">{publications.map(publication => <article key={publication.id} className="py-4"><div className="flex flex-wrap justify-between gap-3"><div className="min-w-0"><p className="text-sm font-bold text-slate-900">{publication.snapshot.title}</p><p className="mt-1 text-xs text-slate-500">{PROVIDER_LABELS[publication.provider]} · {publication.destinationLabel} · Revision {publication.contentRevision}</p><p className="mt-1 text-xs text-slate-500">{publication.status === 'published' ? formatDate(publication.publishedAt) : formatDate(publication.scheduledAt)}</p>{publication.failureMessage && <p className="mt-2 text-sm text-rose-700">{publication.failureMessage}</p>}</div><div className="flex items-start gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{STATUS_LABELS[publication.status]}</span>{publication.status === 'scheduled' && <button type="button" title="Cancel publication" aria-label={`Cancel ${publication.snapshot.title}`} disabled={saving} onClick={() => void onCancel(publication)} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300"><XCircle size={16} /></button>}{publication.status === 'failed' && publication.retryEligible && <button type="button" title="Retry publication" aria-label={`Retry ${publication.snapshot.title}`} disabled={saving} onClick={() => void onRetry(publication)} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300"><RotateCcw size={16} /></button>}</div></div></article>)}</div>}
  </section>;
}
