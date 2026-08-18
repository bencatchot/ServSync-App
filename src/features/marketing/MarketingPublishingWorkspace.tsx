import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CalendarClock, Check, ExternalLink, Eye, Facebook,
  Image as ImageIcon, Link2, Loader2, PencilLine, RefreshCw, RotateCcw,
  Send, ShieldCheck, Unplug, Video, X,
} from 'lucide-react';
import type { MarketingContentItem } from './marketingContent';
import type {
  MarketingPublication,
  MarketingPublicationMode,
  MarketingPublicationPackage,
  MarketingPublishingState,
  MarketingQueueAsset,
  MarketingQueuePairing,
} from './marketingPublishing';

const PACKAGE_LABELS: Record<MarketingPublicationPackage['status'], string> = {
  needs_review: 'Needs Review', ready: 'Ready', scheduled: 'Scheduled', publishing: 'Publishing',
  published: 'Published', needs_attention: 'Needs Attention', retired: 'Retired',
};

const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value)) : 'Not recorded';

const mediaAssetId = (item: { mediaSnapshot: Record<string, unknown> | null }) => (
  typeof item.mediaSnapshot?.asset_id === 'string' ? item.mediaSnapshot.asset_id : null
);

const assetLabel = (asset: MarketingQueueAsset) => {
  if (asset.source === 'demo_recorder') return asset.type === 'video' ? 'ServSync product demo video' : 'ServSync product image';
  if (asset.source === 'job_media_derivative') return asset.type === 'video' ? 'Completed Job video' : 'Completed Job photo';
  return asset.type === 'video' ? 'Uploaded video' : 'Uploaded image';
};

function QueueThumbnail({ asset }: { asset: MarketingQueueAsset | null }) {
  return (
    <div className="flex aspect-video w-28 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100 sm:w-36">
      {asset?.posterUrl
        ? <img src={asset.posterUrl} alt="" className="h-full w-full object-cover" />
        : asset?.type === 'video' ? <Video size={22} className="text-slate-400" /> : <ImageIcon size={22} className="text-slate-400" />}
    </div>
  );
}

function StatusPill({ status }: { status: MarketingPublicationPackage['status'] }) {
  const tone = status === 'ready' || status === 'published'
    ? 'bg-emerald-100 text-emerald-800'
    : status === 'needs_attention' ? 'bg-rose-100 text-rose-800'
      : status === 'scheduled' || status === 'publishing' ? 'bg-blue-100 text-blue-800'
        : 'bg-amber-100 text-amber-800';
  return <span className={`rounded-full px-2 py-1 text-xs font-bold ${tone}`}>{PACKAGE_LABELS[status]}</span>;
}

function ScheduleEditor({ publication, busy, onReschedule }: {
  publication: MarketingPublication;
  busy: boolean;
  onReschedule: (scheduledAt: string, timezone: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const parsed = value ? new Date(value) : null;
  const scheduledAt = parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  if (!editing) return <button type="button" disabled={busy} onClick={() => setEditing(true)} className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-bold">Change</button>;
  return <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-64">
    <label className="text-xs font-bold text-slate-700">New date and time
      <input aria-label={`New scheduled time for ${publication.snapshot.title}`} type="datetime-local" value={value} onChange={event => setValue(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal" />
    </label>
    <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(false)} className="min-h-9 px-2 text-xs font-bold text-slate-600">Back</button><button type="button" disabled={busy || !scheduledAt || parsed!.getTime() <= Date.now()} onClick={() => void onReschedule(scheduledAt!, timezone)} className="min-h-9 rounded-md bg-blue-700 px-3 text-xs font-bold text-white disabled:opacity-50">Save schedule</button></div>
  </div>;
}

function PreviewDialog({ item, asset, mediaUrl, busy, operationAvailable, onClose, onApprove, onAuthorize }: {
  item: MarketingPublicationPackage;
  asset: MarketingQueueAsset | null;
  mediaUrl: string | null;
  busy: boolean;
  operationAvailable: boolean;
  onClose: () => void;
  onApprove: () => Promise<void>;
  onAuthorize: (mode: MarketingPublicationMode, scheduledAt: string | null, timezone: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<MarketingPublicationMode>('publish_now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [confirming, setConfirming] = useState(false);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const parsed = scheduledAt ? new Date(scheduledAt) : null;
  const scheduledIso = parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  const canAuthorize = item.status === 'ready' && operationAvailable
    && (mode === 'publish_now' || (scheduledIso !== null && parsed!.getTime() > Date.now()));

  return (
    <div role="dialog" aria-modal="true" aria-label={`Preview ${item.snapshot.title}`} className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-3 sm:p-8">
      <div className="mx-auto max-w-3xl rounded-md bg-white shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
          <div className="min-w-0"><p className="text-xs font-bold uppercase text-blue-700">Exact publication preview</p><h2 className="mt-1 truncate text-lg font-bold text-slate-950">{item.snapshot.title}</h2><p className="mt-1 text-xs text-slate-500">Approved copy · {item.destinationLabel} · {item.mediaPairingId ? 'Media post' : 'Text post'}</p></div>
          <button type="button" aria-label="Close preview" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-300"><X size={18} /></button>
        </header>

        <div className="p-4 sm:p-6">
          <article data-testid="exact-publication-preview" className="mx-auto max-w-[36rem] overflow-hidden rounded-md border border-slate-300 bg-white">
            <div className="flex items-center gap-3 p-4"><img src="/servsync-pwa-192.png" alt="" className="h-10 w-10 rounded-full" /><div><p className="text-sm font-bold text-slate-950">{item.destinationLabel}</p><p className="text-xs text-slate-500">Facebook</p></div></div>
            <p className="whitespace-pre-wrap break-words px-4 pb-5 text-[15px] leading-6 text-slate-900">{item.snapshot.body}</p>
            {asset && mediaUrl && (asset.type === 'video'
              ? <video controls preload="metadata" src={mediaUrl} className="aspect-video w-full bg-black object-contain"><track kind="captions" /></video>
              : <img src={mediaUrl} alt="Selected publication media" className="max-h-[32rem] w-full object-contain" />)}
            {asset && !mediaUrl && <div className="flex aspect-video items-center justify-center bg-slate-100 text-sm text-slate-500">Media preview is unavailable.</div>}
          </article>

          {item.requiredDisclosures.length > 0 && <div className="mx-auto mt-4 flex max-w-[36rem] items-start gap-2 text-xs text-slate-600"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-600" /><p>Required disclosure verified in the exact public message.</p></div>}

          {item.status === 'needs_review' && <div className="mt-5 flex justify-end"><button type="button" disabled={busy} onClick={() => void onApprove()} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-700 px-4 text-sm font-bold text-white disabled:opacity-50"><Check size={16} />Approve exact post</button></div>}

          {item.status === 'ready' && <section className="mt-5 border-t border-slate-200 pt-5">
            <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <label className="text-sm font-bold text-slate-700">Timing<select aria-label="Timing" value={mode} onChange={event => { setMode(event.target.value as MarketingPublicationMode); setConfirming(false); }} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal"><option value="publish_now">Publish now</option><option value="scheduled">Schedule</option></select></label>
              {mode === 'scheduled' && <label className="text-sm font-bold text-slate-700">Date and time<input aria-label="Scheduled time" type="datetime-local" value={scheduledAt} onChange={event => { setScheduledAt(event.target.value); setConfirming(false); }} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal" /><span className="mt-1 block text-xs font-normal text-slate-500">{timezone}</span></label>}
            </div>
            {!operationAvailable && <p role="status" className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Publishing authorization is prepared, but live provider execution remains paused during the beta operational transition.</p>}
            <div className="mt-4 flex justify-end">
              {!confirming
                ? <button type="button" disabled={!canAuthorize || busy} onClick={() => setConfirming(true)} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-50">{mode === 'publish_now' ? <Send size={16} /> : <CalendarClock size={16} />}{mode === 'publish_now' ? 'Publish Now' : 'Review Schedule'}</button>
                : <div data-testid="publication-authorization-confirmation" className="w-full rounded-md border border-blue-200 bg-blue-50 p-4"><p className="text-sm font-bold text-slate-950">{mode === 'publish_now' ? `Publish this post to ${item.destinationLabel} now?` : `Schedule this post for ${formatDate(scheduledIso)} (${timezone})?`}</p><p className="mt-1 text-xs text-slate-600">This authorizes only the exact copy, media, and destination shown above.</p><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setConfirming(false)} className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-bold">Back</button><button type="button" disabled={busy} onClick={() => void onAuthorize(mode, mode === 'scheduled' ? scheduledIso : null, timezone)} className="min-h-10 rounded-md bg-blue-700 px-4 text-sm font-bold text-white">{mode === 'publish_now' ? 'Publish' : 'Schedule'}</button></div></div>}
            </div>
          </section>}
        </div>
      </div>
    </div>
  );
}

export type MarketingPublishingWorkspaceProps = {
  state: MarketingPublishingState | null;
  contentItems: MarketingContentItem[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  selectedContentId: string | null;
  onSelectContent: (content: MarketingContentItem) => void;
  onReturnForRevision: (content: MarketingContentItem) => void;
  onReload: () => Promise<void>;
  onPrepare: (content: MarketingContentItem, pairingId: string | null) => Promise<string>;
  onPreview: (item: MarketingPublicationPackage) => Promise<string | null>;
  onApprove: (item: MarketingPublicationPackage) => Promise<void>;
  onAuthorize: (item: MarketingPublicationPackage, mode: MarketingPublicationMode, scheduledAt: string | null, timezone: string) => Promise<void>;
  onPairMedia: (content: MarketingContentItem, asset: MarketingQueueAsset) => Promise<void>;
  onReviewMedia: (pairing: MarketingQueuePairing, decision: 'approved' | 'rejected') => Promise<void>;
  onCancel: (publication: MarketingPublication) => Promise<void>;
  onReschedule: (publication: MarketingPublication, scheduledAt: string, timezone: string) => Promise<void>;
  onRetry: (publication: MarketingPublication) => Promise<void>;
  onConnectFacebook: () => Promise<void>;
  onSelectFacebookPage: (sessionId: string, pageId: string) => Promise<void>;
  onRecheckFacebook: () => Promise<void>;
  onDisconnectFacebook: () => Promise<void>;
};

export function MarketingPublishingWorkspace(props: MarketingPublishingWorkspaceProps) {
  const { state, contentItems, loading, error, saving } = props;
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pendingPreviewId, setPendingPreviewId] = useState<string | null>(null);
  const [previewMediaUrl, setPreviewMediaUrl] = useState<string | null>(null);
  const [mediaChoice, setMediaChoice] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const facebook = state?.providers.find(item => item.provider === 'facebook') ?? null;
  const selectedContent = contentItems.find(item => item.id === props.selectedContentId) ?? null;
  const preview = state?.packages.find(item => item.id === previewId) ?? null;
  const previewAsset = preview ? state?.assets.find(asset => asset.id === mediaAssetId(preview)) ?? null : null;
  const currentPairing = selectedContent ? state?.pairings.find(pairing => pairing.contentId === selectedContent.id
    && pairing.contentRevision === selectedContent.revisionNumber && pairing.status !== 'rejected') ?? null : null;
  const selectedPackage = selectedContent ? state?.packages.find(item => item.contentId === selectedContent.id
    && item.contentRevision === selectedContent.revisionNumber && item.status !== 'retired') ?? null : null;
  const actionableContent = useMemo(() => contentItems.filter(item => item.contentType === 'social_post'
    && item.channelCategory === 'social' && ['needs_approval', 'approved'].includes(item.status)), [contentItems]);
  const activePublications = state?.publications.filter(item => ['scheduled', 'publishing', 'failed'].includes(item.status)) ?? [];
  const history = state?.publications.filter(item => item.status === 'published') ?? [];

  const openPreview = useCallback(async (item: MarketingPublicationPackage) => {
    setActionError(null);
    try { setPreviewMediaUrl(await props.onPreview(item)); setPreviewId(item.id); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'ServSync could not open the preview.'); }
  }, [props.onPreview]);

  useEffect(() => {
    if (!pendingPreviewId) return;
    const item = state?.packages.find(candidate => candidate.id === pendingPreviewId);
    if (!item) return;
    setPendingPreviewId(null);
    void openPreview(item);
  }, [openPreview, pendingPreviewId, state?.packages]);

  const prepareSelected = async () => {
    if (!selectedContent || !facebook) return;
    setActionError(null);
    try {
      const packageId = await props.onPrepare(selectedContent, currentPairing?.id ?? null);
      setPendingPreviewId(packageId);
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'ServSync could not prepare this post.'); }
  };

  return (
    <section data-testid="marketing-publishing-workspace" className="space-y-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-lg font-bold text-slate-950">Publishing Queue</h2><span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-800">Beta</span></div><p className="mt-1 text-sm text-slate-500">Preview and authorize one exact post at a time.</p></div><button type="button" aria-label="Refresh publishing queue" disabled={loading} onClick={() => void props.onReload()} className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-300"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /></button></header>

      {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {actionError && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{actionError}</p>}

      <section aria-label="Prepared post allowance" className="flex flex-wrap items-center justify-between gap-2 border-y border-slate-200 py-3"><div><p className="text-sm font-bold text-slate-900">Prepared / scheduled</p><p className="text-xs text-slate-500">Published history does not count toward this limit.</p></div><p className="text-sm font-bold text-slate-800">{state?.preparedCount ?? 0} of {state?.preparedLimit ?? 5}</p></section>

      {facebook && <section data-testid="marketing-facebook-connection" className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-700"><Facebook size={19} /></span><div className="min-w-0"><p className="font-bold text-slate-950">Facebook</p><p className="truncate text-sm text-slate-600">{facebook.status === 'connected' ? `${facebook.destinationLabel} · Ready` : facebook.readinessNote}</p></div></div><div className="flex flex-wrap gap-2">{facebook.status === 'connected' ? <><button type="button" disabled={saving} onClick={() => void props.onRecheckFacebook()} className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-bold">Recheck</button><button type="button" disabled={saving} onClick={() => void props.onDisconnectFacebook()} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-bold"><Unplug size={15} />Disconnect</button></> : <button type="button" disabled={saving} onClick={() => void props.onConnectFacebook()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-bold text-white"><Link2 size={15} />Connect Facebook</button>}</div></section>}

      {state?.facebookSetup && <fieldset className="space-y-2 border-b border-slate-200 pb-5"><legend className="mb-2 text-sm font-bold text-slate-900">Choose a Facebook Page</legend>{state.facebookSetup.candidatePages.map(page => <div key={page.pageId} className="flex flex-wrap items-center justify-between gap-3 border-y border-slate-200 py-3"><div><p className="text-sm font-bold">{page.pageName}</p><p className="text-xs text-slate-500">{page.eligible ? 'Ready to connect' : 'Publishing authority is missing'}</p></div><button type="button" disabled={saving || !page.eligible} onClick={() => void props.onSelectFacebookPage(state.facebookSetup!.sessionId, page.pageId)} className="min-h-10 rounded-md border border-blue-300 px-3 text-sm font-bold text-blue-700 disabled:opacity-50">Connect this Page</button></div>)}</fieldset>}

      <section aria-labelledby="queue-heading" className="space-y-3"><div className="flex items-center justify-between gap-3"><h3 id="queue-heading" className="text-sm font-bold text-slate-950">Needs Review / Ready</h3><span className="text-xs text-slate-500">{actionableContent.length} content items</span></div>
        {actionableContent.length === 0 ? <div className="border-y border-dashed border-slate-200 py-8 text-center"><p className="text-sm font-bold text-slate-700">No posts waiting</p><p className="mt-1 text-sm text-slate-500">Create a social post, then submit it for review.</p></div> : <div className="divide-y divide-slate-200 border-y border-slate-200">{actionableContent.map(content => {
          const item = state?.packages.find(pack => pack.contentId === content.id && pack.contentRevision === content.revisionNumber && pack.status !== 'retired') ?? null;
          const pairing = state?.pairings.find(candidate => candidate.contentId === content.id && candidate.contentRevision === content.revisionNumber && candidate.status !== 'rejected') ?? null;
          const asset = pairing ? state?.assets.find(candidate => candidate.id === pairing.assetId) ?? null : null;
          const status = item?.status ?? 'needs_review';
          return <article key={content.id} data-testid={`publishing-queue-card-${content.id}`} className={`py-4 ${props.selectedContentId === content.id ? 'bg-blue-50/60' : ''}`}><div className="flex min-w-0 flex-col gap-3 px-2 sm:flex-row sm:items-center"><QueueThumbnail asset={asset} /><button type="button" onClick={() => props.onSelectContent(content)} className="min-w-0 flex-1 text-left"><span className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-bold text-slate-950">{content.title}</span><StatusPill status={status} /></span><span className="mt-1 block line-clamp-2 text-sm text-slate-600">{content.body}</span><span className="mt-1 block text-xs text-slate-500">{facebook?.destinationLabel ?? 'Facebook not connected'} · {asset ? assetLabel(asset) : 'Text only'}</span></button><button type="button" onClick={() => item ? void openPreview(item) : (props.onSelectContent(content), undefined)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-bold"><Eye size={15} />{item ? 'Preview' : 'Select'}</button></div></article>;
        })}</div>}
      </section>

      {selectedContent && <section data-testid="selected-publishing-package" data-package-content-id={selectedContent.id} className="border-y border-slate-200 py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-blue-700">Selected post</p><h3 className="mt-1 font-bold text-slate-950">{selectedContent.title}</h3><p className="mt-1 text-xs text-slate-500">Current approved copy</p></div><button type="button" onClick={() => props.onReturnForRevision(selectedContent)} className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-blue-700"><PencilLine size={15} />Revise</button></div>
        {!currentPairing && state && state.assets.filter(asset => !['purging', 'purged', 'abandoned'].includes(asset.lifecycleState)).length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="text-sm font-bold text-slate-700">Optional media<select aria-label="Optional media" value={mediaChoice} onChange={event => setMediaChoice(event.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal"><option value="">Text only</option>{state.assets.filter(asset => !['purging', 'purged', 'abandoned'].includes(asset.lifecycleState)).map(asset => <option key={asset.id} value={asset.id}>{assetLabel(asset)}</option>)}</select></label><button type="button" disabled={!mediaChoice || saving} onClick={() => { const asset = state.assets.find(item => item.id === mediaChoice); if (asset) void props.onPairMedia(selectedContent, asset); }} className="self-end min-h-10 rounded-md border border-blue-300 px-3 text-sm font-bold text-blue-700 disabled:opacity-50">Use selected media</button></div>}
        {currentPairing?.status === 'candidate' && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 p-3"><p className="text-sm text-amber-900">Review the selected media before preparing the exact post.</p><div className="flex gap-2"><button type="button" disabled={saving} onClick={() => void props.onReviewMedia(currentPairing, 'rejected')} className="min-h-10 rounded-md border border-rose-300 px-3 text-sm font-bold text-rose-700">Remove</button><button type="button" disabled={saving} onClick={() => void props.onReviewMedia(currentPairing, 'approved')} className="min-h-10 rounded-md bg-emerald-700 px-3 text-sm font-bold text-white">Approve media</button></div></div>}
        {currentPairing?.status === 'approved' && !selectedPackage && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3"><p className="text-sm text-emerald-900">Selected media is approved for this post.</p><button type="button" disabled={saving} onClick={() => void props.onReviewMedia(currentPairing, 'rejected')} className="min-h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700">Remove media</button></div>}
        <div className="mt-4 flex justify-end"><button type="button" disabled={saving || selectedContent.status !== 'approved' || currentPairing?.status === 'candidate' || !facebook || facebook.readinessStatus !== 'ready'} onClick={() => selectedPackage ? void openPreview(selectedPackage) : void prepareSelected()} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin" /> : <Eye size={16} />}{selectedPackage ? 'Open exact preview' : 'Prepare exact preview'}</button></div>
      </section>}

      <section aria-labelledby="active-heading"><h3 id="active-heading" className="text-sm font-bold text-slate-950">Scheduled / Publishing / Needs Attention</h3>{activePublications.length === 0 ? <p className="mt-3 border-y border-dashed border-slate-200 py-7 text-center text-sm text-slate-500">No active publications.</p> : <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">{activePublications.map(publication => {
        const asset = state?.assets.find(item => item.id === mediaAssetId(publication)) ?? null;
        return <article key={publication.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"><QueueThumbnail asset={asset} /><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-950">{publication.snapshot.title}</p><p className="mt-1 text-xs text-slate-500">{publication.destinationLabel} · {publication.status === 'failed' ? 'Needs Attention' : publication.status === 'publishing' ? 'Publishing' : `Scheduled ${formatDate(publication.scheduledAt)} (${publication.timezone})`}</p>{publication.failureMessage && <p className="mt-2 text-sm text-rose-700">{publication.failureMessage}</p>}</div><div className="flex flex-wrap items-end gap-2">{publication.status === 'scheduled' && <><ScheduleEditor publication={publication} busy={saving} onReschedule={(scheduledAt, timezone) => props.onReschedule(publication, scheduledAt, timezone)} /><button type="button" aria-label={`Cancel ${publication.snapshot.title}`} disabled={saving} onClick={() => void props.onCancel(publication)} className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-300"><X size={16} /></button></>}{publication.status === 'failed' && publication.retryEligible && <button type="button" disabled={saving} onClick={() => void props.onRetry(publication)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-bold"><RotateCcw size={15} />Retry</button>}</div></article>;
      })}</div>}</section>

      <section aria-labelledby="history-heading"><h3 id="history-heading" className="text-sm font-bold text-slate-950">Published</h3>{history.length === 0 ? <p className="mt-3 border-y border-dashed border-slate-200 py-7 text-center text-sm text-slate-500">No published history yet.</p> : <div className="mt-3 divide-y divide-slate-200 border-y border-slate-200">{history.map(publication => {
        const asset = state?.assets.find(item => item.id === mediaAssetId(publication)) ?? null;
        return <article key={publication.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"><QueueThumbnail asset={asset} /><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-950">{publication.snapshot.title}</p><p className="mt-1 text-xs text-slate-500">Published to {publication.destinationLabel} · {formatDate(publication.publishedAt)}</p>{asset?.purgedAt && <p className="mt-1 text-xs text-slate-500">Full Marketing media removed from ServSync after publication.</p>}</div>{publication.providerPermalink ? <a href={publication.providerPermalink} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-blue-700">View on Facebook<ExternalLink size={14} /></a> : <span className="text-xs text-slate-500">Provider ID {publication.providerPublicationId}</span>}</article>;
      })}</div>}</section>

      {!state?.operationAvailable && <div className="flex items-start gap-2 rounded-md bg-slate-50 p-3 text-xs leading-5 text-slate-600"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><p>The shared queue is operational in non-publishing mode. Existing history and previews remain available while new provider submissions are stopped.</p></div>}

      {preview && <PreviewDialog item={preview} asset={previewAsset} mediaUrl={previewMediaUrl} busy={saving} operationAvailable={state?.operationAvailable === true} onClose={() => { setPreviewId(null); setPreviewMediaUrl(null); }} onApprove={async () => { await props.onApprove(preview); setPreviewId(null); }} onAuthorize={async (mode, scheduledAt, timezone) => { await props.onAuthorize(preview, mode, scheduledAt, timezone); setPreviewId(null); }} />}
    </section>
  );
}
