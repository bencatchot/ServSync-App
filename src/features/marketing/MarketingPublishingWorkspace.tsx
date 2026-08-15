import { useMemo, useState } from 'react';
import { CalendarClock, Loader2, RefreshCw, RotateCcw, XCircle } from 'lucide-react';
import type { MarketingContentItem } from './marketingContent';
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

const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value)) : 'Not recorded';

export function MarketingPublicationComposer({
  content,
  providers,
  busy,
  onClose,
  onCreate,
}: {
  content: MarketingContentItem;
  providers: MarketingProviderConnection[];
  busy: boolean;
  onClose: () => void;
  onCreate: (input: { connection: MarketingProviderConnection; mode: MarketingPublicationMode; scheduledAt: string | null }) => Promise<void>;
}) {
  const [providerId, setProviderId] = useState(providers[0]?.id ?? '');
  const [mode, setMode] = useState<MarketingPublicationMode>('publish_now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const selected = providers.find(provider => provider.id === providerId) ?? null;
  const enabled = selected?.status === 'connected' && selected.capabilities.text;
  const submit = async () => {
    if (!selected) return;
    setSubmitError(null);
    try {
      await onCreate({
        connection: selected,
        mode,
        scheduledAt: mode === 'scheduled' ? new Date(scheduledAt).toISOString() : null,
      });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'ServSync could not create the publication.');
    }
  };
  return (
    <section data-testid="marketing-publication-composer" className="space-y-4 rounded-md border border-blue-200 bg-blue-50 p-4">
      <div><h4 className="text-sm font-bold text-slate-950">Publish / Schedule</h4><p className="mt-1 text-sm text-slate-600">A separate owner decision is required after approval.</p></div>
      <div className="rounded-md border border-slate-200 bg-white p-3">
        <p className="text-xs font-bold uppercase text-slate-500">Approved revision {content.revisionNumber}</p>
        <p className="mt-2 text-sm font-bold text-slate-900">{content.title}</p>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-slate-700">{content.body}</p>
      </div>
      <fieldset className="grid gap-2"><legend className="text-sm font-bold text-slate-800">Provider destination</legend>
        {providers.map(provider => (
          <label key={provider.id} className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-3">
            <input type="radio" name="marketing-provider" checked={providerId === provider.id} onChange={() => setProviderId(provider.id)} className="mt-1" />
            <span className="min-w-0"><span className="block text-sm font-bold text-slate-900">{PROVIDER_LABELS[provider.provider]}</span>
              <span className="block text-xs leading-5 text-slate-500">{provider.status === 'connected' ? provider.destinationLabel : provider.readinessNote}</span>
              <span className="block text-xs font-semibold text-slate-600">{provider.capabilities.text ? 'Text publishing' : 'Media required'} · {provider.status === 'connected' ? 'Connected' : 'Setup required'}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {enabled && <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-bold text-slate-800">Timing<select value={mode} onChange={event => setMode(event.target.value as MarketingPublicationMode)} className="mt-1.5 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"><option value="publish_now">Publish now</option><option value="scheduled">Schedule</option></select></label>
        {mode === 'scheduled' && <label className="text-sm font-bold text-slate-800">Scheduled time<input type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} className="mt-1.5 h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" /></label>}
      </div>}
      {enabled && <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1" /><span>I authorize this exact approved revision for {PROVIDER_LABELS[selected.provider]}.</span></label>}
      {submitError && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{submitError}</p>}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={onClose} className="min-h-11 rounded-md px-4 text-sm font-bold text-slate-600 hover:bg-white">Close</button>
        <button type="button" disabled={!enabled || !confirmed || busy || (mode === 'scheduled' && !scheduledAt)} onClick={() => void submit()} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" />}Confirm publication</button>
      </div>
    </section>
  );
}

export function MarketingPublishingWorkspace({ state, loading, error, saving, onReload, onCancel, onRetry }: {
  state: MarketingPublishingState | null; loading: boolean; error: string | null; saving: boolean;
  onReload: () => Promise<void>; onCancel: (publication: MarketingPublication) => Promise<void>; onRetry: (publication: MarketingPublication) => Promise<void>;
}) {
  const publications = useMemo(() => state?.publications ?? [], [state]);
  return <section data-testid="marketing-publishing-workspace" className="space-y-4">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-950">Publishing</h2><p className="mt-1 text-sm text-slate-500">Provider readiness, scheduled work, and publication history.</p></div><button type="button" aria-label="Reload publishing" onClick={() => void onReload()} disabled={loading || saving} className="flex h-11 w-11 items-center justify-center rounded-md border border-slate-300 bg-white"><RefreshCw size={17} /></button></div>
    {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-3">{state?.providers.map(provider => <article key={provider.id} className="rounded-md border border-slate-200 bg-white p-3"><p className="text-sm font-bold text-slate-950">{PROVIDER_LABELS[provider.provider]}</p><p className="mt-1 text-xs font-bold uppercase text-slate-500">{provider.status === 'connected' ? 'Connected' : 'Setup required'}</p><p className="mt-2 text-sm leading-5 text-slate-600">{provider.readinessNote}</p></article>)}</div>
    {loading ? <p className="py-10 text-center text-sm text-slate-500">Loading publication history...</p> : publications.length === 0 ? <div className="border-y border-dashed border-slate-200 py-10 text-center"><CalendarClock className="mx-auto text-slate-400" size={22} /><p className="mt-2 text-sm font-bold text-slate-700">No publication history yet</p><p className="mt-1 text-sm text-slate-500">Approval alone never creates or schedules a publication.</p></div> : <div className="divide-y divide-slate-200 border-y border-slate-200">{publications.map(publication => <article key={publication.id} className="py-4"><div className="flex flex-wrap justify-between gap-3"><div className="min-w-0"><p className="text-sm font-bold text-slate-900">{publication.snapshot.title}</p><p className="mt-1 text-xs text-slate-500">{PROVIDER_LABELS[publication.provider]} · {publication.destinationLabel} · Revision {publication.contentRevision}</p><p className="mt-1 text-xs text-slate-500">{publication.status === 'published' ? formatDate(publication.publishedAt) : formatDate(publication.scheduledAt)}</p>{publication.failureMessage && <p className="mt-2 text-sm text-rose-700">{publication.failureMessage}</p>}</div><div className="flex items-start gap-2"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{STATUS_LABELS[publication.status]}</span>{publication.status === 'scheduled' && <button type="button" title="Cancel publication" aria-label={`Cancel ${publication.snapshot.title}`} disabled={saving} onClick={() => void onCancel(publication)} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300"><XCircle size={16} /></button>}{publication.status === 'failed' && publication.retryEligible && <button type="button" title="Retry publication" aria-label={`Retry ${publication.snapshot.title}`} disabled={saving} onClick={() => void onRetry(publication)} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-300"><RotateCcw size={16} /></button>}</div></div></article>)}</div>}
  </section>;
}
