import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Briefcase, FileUp, Loader2, MessageSquareText, Sparkles, X } from 'lucide-react';
import { createMarketingCreationAdapter, type MarketingCreationClient, type MarketingCreationContext } from './marketingCreation';

type Mode = 'job' | 'upload' | 'simple';

export function MarketingCreatePost({ client, contractorId, onCreated }: {
  client: MarketingCreationClient;
  contractorId: string | null;
  onCreated: (contentId: string) => Promise<void> | void;
}) {
  const adapter = useMemo(() => createMarketingCreationAdapter(client, contractorId), [client, contractorId]);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('simple');
  const [context, setContext] = useState<MarketingCreationContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [brief, setBrief] = useState('');
  const [jobId, setJobId] = useState('');
  const [mediaPath, setMediaPath] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [rights, setRights] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    adapter.context().then(setContext).catch(reason => setError(reason instanceof Error ? reason.message : 'Marketing creation is unavailable.')).finally(() => setLoading(false));
  }, [adapter, open]);

  const selectedJob = context?.jobs.find(job => job.id === jobId) ?? null;
  const selectedMedia = selectedJob?.media.find(media => media.path === mediaPath) ?? null;

  const reset = () => {
    setOpen(false); setMode('simple'); setBrief(''); setJobId(''); setMediaPath(''); setFile(null); setRights(false); setError(null);
  };

  const create = async () => {
    if (busyRef.current) return;
    if (brief.trim().length < 3) { setError('Add a short note about what this post should say.'); return; }
    if (mode === 'job' && (!selectedJob || !selectedMedia || !rights)) { setError('Choose Job media and confirm you have permission to use it.'); return; }
    if (mode === 'upload' && (!file || !rights)) { setError('Choose media and confirm you have permission to use it.'); return; }
    busyRef.current = true; setLoading(true); setError(null);
    try {
      let assetId: string | null = null;
      if (mode === 'job' && selectedJob && selectedMedia) assetId = await adapter.selectJobMedia(selectedJob.id, selectedMedia, rights);
      if (mode === 'upload' && file) {
        const uploaded = await adapter.upload(file, rights);
        if (!uploaded || typeof uploaded !== 'object' || !('asset_id' in uploaded) || typeof uploaded.asset_id !== 'string') throw new Error('ServSync could not confirm the uploaded media.');
        assetId = uploaded.asset_id;
      }
      const contentId = await adapter.generate({
        sourceKind: mode === 'upload' ? 'marketing_upload' : mode,
        jobId: mode === 'job' ? selectedJob?.id ?? null : null,
        assetId,
        brief: brief.trim(),
      });
      await onCreated(contentId);
      reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ServSync could not prepare this post.');
    } finally { busyRef.current = false; setLoading(false); }
  };

  if (!open) return (
    <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800">
      <Sparkles size={17} aria-hidden="true" /> Create post
    </button>
  );

  return (
    <section data-testid="marketing-create-post" className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-base font-bold text-slate-950">Create post</h2><p className="mt-1 text-sm text-slate-600">Choose a source, add your direction, then review the draft.</p></div>
        <button type="button" onClick={reset} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-white" aria-label="Close create post"><X size={19} /></button>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3" role="group" aria-label="Post source">
        {contractorId && <ModeButton active={mode === 'job'} onClick={() => setMode('job')} icon={<Briefcase size={18} />} label="From a Job" />}
        <ModeButton active={mode === 'upload'} onClick={() => setMode('upload')} icon={<FileUp size={18} />} label="Upload media" />
        <ModeButton active={mode === 'simple'} onClick={() => setMode('simple')} icon={<MessageSquareText size={18} />} label="Simple post" />
      </div>
      {mode === 'job' && <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">Completed Job<select value={jobId} onChange={event => { setJobId(event.target.value); setMediaPath(''); }} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"><option value="">Choose a Job</option>{context?.jobs.map(job => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
        <label className="text-sm font-semibold text-slate-700">Photo or video<select value={mediaPath} onChange={event => setMediaPath(event.target.value)} disabled={!selectedJob} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 disabled:bg-slate-100"><option value="">Choose media</option>{selectedJob?.media.map((media, index) => <option key={media.path} value={media.path}>{media.mimeType.startsWith('video/') ? 'Video' : 'Photo'} {index + 1}</option>)}</select></label>
        {selectedJob && <div className="sm:col-span-2 rounded-lg bg-white p-3 text-sm text-slate-700"><p className="font-semibold">{selectedJob.title}</p>{selectedJob.summary && <p className="mt-1">{selectedJob.summary}</p>}<p className="mt-1 text-xs text-slate-500">Only customer-safe completed-work context is used. Pricing, contact details, addresses, and private notes stay out.</p></div>}
      </div>}
      {mode === 'upload' && <label className="mt-4 block text-sm font-semibold text-slate-700">Photo or MP4<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" onChange={event => setFile(event.target.files?.[0] ?? null)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm" /></label>}
      {(mode === 'job' || mode === 'upload') && <label className="mt-3 flex min-h-11 items-start gap-3 rounded-lg bg-white p-3 text-sm text-slate-700"><input type="checkbox" checked={rights} onChange={event => setRights(event.target.checked)} className="mt-0.5 h-5 w-5" /><span>I have permission to use this media for Marketing.</span></label>}
      <label className="mt-4 block text-sm font-semibold text-slate-700">What should this post say?<textarea value={brief} onChange={event => setBrief(event.target.value)} maxLength={1000} rows={4} placeholder="Share the main point in your own words." className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm" /></label>
      {context?.profile && <p className="mt-2 text-xs text-slate-500">Drafts use {context.profile.name || 'your business'}'s saved Marketing profile and do not count against the video-generation allowance.</p>}
      {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      <button type="button" onClick={() => void create()} disabled={loading || !context?.profile?.generationReady} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400">
        {loading ? <Loader2 size={17} className="animate-spin" /> : <Sparkles size={17} />} Prepare draft
      </button>
    </section>
  );
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return <button type="button" onClick={onClick} aria-pressed={active} className={`flex min-h-12 items-center gap-2 rounded-lg border px-3 text-sm font-bold ${active ? 'border-blue-700 bg-white text-blue-800' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>{icon}{label}</button>;
}
