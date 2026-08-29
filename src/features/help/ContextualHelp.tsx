import { useEffect, useRef, useState } from 'react';
import { HelpCircle, Loader2, Play, X } from 'lucide-react';
import {
  findHelp,
  helpPlaybackUrl,
  loadHelpCaptionTrack,
  type HelpCaptionTrack,
  type HelpSearchResult,
  type HelpStudioClient,
} from './helpStudio';
import { contextualHelpLookupReady } from './contextualHelpPolicy';

type ContextualHelpProps = {
  client: HelpStudioClient;
  contextKey: string;
  contractorId?: string | null;
  label?: string;
};

function useCaptionUrl(captionsVtt: string | null | undefined) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!captionsVtt) { setUrl(''); return; }
    const next = URL.createObjectURL(new Blob([captionsVtt], { type: 'text/vtt' }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [captionsVtt]);
  return url;
}

export function HelpWalkthroughDialog({
  client,
  walkthrough,
  contractorId,
  onClose,
}: {
  client: HelpStudioClient;
  walkthrough: HelpSearchResult;
  contractorId?: string | null;
  onClose: () => void;
}) {
  const [url, setUrl] = useState('');
  const [captionTrack, setCaptionTrack] = useState<HelpCaptionTrack | null>(null);
  const [error, setError] = useState('');
  const closeButton = useRef<HTMLButtonElement>(null);
  const captionUrl = useCaptionUrl(captionTrack?.captionsVtt);

  useEffect(() => {
    let active = true;
    const captionRequest = loadHelpCaptionTrack(client, walkthrough.id, contractorId).catch(() => null);
    void Promise.all([helpPlaybackUrl(client, walkthrough.id, contractorId), captionRequest]).then(([value, captions]) => {
      if (active) { setUrl(value); setCaptionTrack(captions); }
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : 'Unable to open this walkthrough.');
    });
    return () => { active = false; };
  }, [client, contractorId, walkthrough.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    closeButton.current?.focus();
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="help-walkthrough-title">
      <section className="max-h-[92vh] w-full overflow-y-auto bg-white shadow-2xl sm:max-w-3xl sm:rounded-lg">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-blue-700">How-to</p>
            <h2 id="help-walkthrough-title" className="mt-0.5 text-lg font-bold text-slate-950">{walkthrough.title}</h2>
          </div>
          <button ref={closeButton} type="button" onClick={onClose} aria-label="Close walkthrough" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100">
            <X size={20} />
          </button>
        </header>
        <div className="space-y-4 p-4 sm:p-5">
          <p className="text-sm leading-6 text-slate-600">{walkthrough.summary}</p>
          <div className="aspect-video w-full overflow-hidden rounded-md bg-slate-950">
            {url ? (
              <video className="help-caption-video h-full w-full" src={url} controls playsInline preload="metadata" aria-label={walkthrough.title}>
                {captionUrl && <track kind="captions" src={captionUrl} srcLang={captionTrack?.captionLanguage ?? 'en'} label="English" default />}
              </video>
            ) : error ? (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-rose-200">{error}</div>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-200"><Loader2 className="animate-spin" size={24} aria-label="Loading walkthrough" /></div>
            )}
          </div>
          <section aria-labelledby="help-walkthrough-steps">
            <h3 id="help-walkthrough-steps" className="text-sm font-bold text-slate-950">Steps</h3>
            <ol className="mt-2 space-y-2">
              {walkthrough.steps.map((step, index) => (
                <li key={`${index}-${step}`} className="flex gap-3 text-sm leading-5 text-slate-700">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{index + 1}</span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </section>
          {captionTrack?.transcript && (
            <details className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-bold text-slate-800">Read transcript</summary>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{captionTrack.transcript}</p>
            </details>
          )}
          {(captionTrack?.narrationDisclosure ?? walkthrough.narrationDisclosure) && (
            <p className="border-t border-slate-200 pt-3 text-xs text-slate-500">
              {captionTrack?.narrationDisclosure ?? walkthrough.narrationDisclosure}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

export function ContextualHelp({ client, contextKey, contractorId, label = 'How-to' }: ContextualHelpProps) {
  const [walkthroughs, setWalkthroughs] = useState<HelpSearchResult[]>([]);
  const [selected, setSelected] = useState<HelpSearchResult | null>(null);

  useEffect(() => {
    if (!contextualHelpLookupReady(contextKey, contractorId)) {
      setWalkthroughs([]);
      return;
    }
    let active = true;
    void findHelp(client, { routeContext: contextKey, contractorId, limit: 3 }).then(items => {
      if (active) setWalkthroughs(items);
    }).catch(() => {
      if (active) setWalkthroughs([]);
    });
    return () => { active = false; };
  }, [client, contextKey, contractorId]);

  if (!walkthroughs.length) return null;
  const walkthrough = walkthroughs[0];
  return (
    <>
      <button
        type="button"
        onClick={() => setSelected(walkthrough)}
        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-800 hover:bg-blue-100"
        data-testid={`contextual-help-${contextKey}`}
      >
        <HelpCircle size={17} aria-hidden="true" />
        {label}
        <Play size={14} aria-hidden="true" />
      </button>
      {selected && <HelpWalkthroughDialog client={client} walkthrough={selected} contractorId={contractorId} onClose={() => setSelected(null)} />}
    </>
  );
}
