import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Clapperboard,
  Download,
  HelpCircle,
  FileVideo,
  Loader2,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  Upload,
} from 'lucide-react';
import {
  buildHelpRecordingExport,
  createHelpRecordingJob,
  createHelpWalkthrough,
  draftFromWalkthrough,
  emptyHelpRecordingSpecDraft,
  emptyHelpWalkthroughDraft,
  formatHelpBytes,
  helpRecordingPlaybackUrl,
  listHelpRecordingJobs,
  listHelpWalkthroughs,
  loadHelpUsage,
  reviewHelpRecordingJob,
  transitionHelpWalkthrough,
  transitionHelpRecordingJob,
  updateHelpWalkthrough,
  uploadHelpMedia,
  validateHelpRecordingPackage,
  type HelpRecordingJob,
  type HelpRecordingSpecDraft,
  type HelpSearchResult,
  type HelpStudioClient,
  type HelpUsage,
  type HelpWalkthrough,
  type HelpWalkthroughDraft,
} from './helpStudio';
import { HelpWalkthroughDialog } from './ContextualHelp';

const AUDIENCES = [
  ['owner', 'Owner'], ['admin', 'Admin'], ['office', 'Office'],
  ['field_tech', 'Field Technician'], ['viewer', 'Viewer'], ['homeowner', 'Homeowner'],
] as const;

const RECORDER_SCENARIOS = [
  ['contractor-create-estimate', 'Contractor creates an estimate'],
  ['homeowner-service-request', 'Homeowner sends a service request'],
  ['homeowner-home-history', 'Homeowner opens Home History'],
  ['servsync-platform-introduction', 'ServSync platform introduction'],
] as const;

const fieldClass = 'mt-1 min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

function slugFromTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
}

function statusLabel(state: HelpWalkthrough['state']) {
  return state.replace('_', ' ').replace(/\b\w/g, value => value.toUpperCase());
}

function purposeLabel(purpose: HelpWalkthrough['purpose']) {
  if (purpose === 'both') return 'Support + Marketing';
  return purpose === 'support' ? 'Support' : 'Marketing';
}

function recordingStatusLabel(status: HelpRecordingJob['status']) {
  const labels: Record<HelpRecordingJob['status'], string> = {
    requested: 'Requested', preparing: 'Preparing', recording: 'Recording', processing: 'Processing',
    ready_for_review: 'Ready for review', approved: 'Approved', failed: 'Needs rerecord',
  };
  return labels[status];
}

function downloadRecordingSpec(job: HelpRecordingJob) {
  const contents = JSON.stringify(buildHelpRecordingExport(job), null, 2);
  const url = URL.createObjectURL(new Blob([`${contents}\n`], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${job.slug}-recording-spec.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function previewFromWalkthrough(item: HelpWalkthrough): HelpSearchResult {
  return {
    id: item.id, slug: item.slug, revision: item.currentRevision, title: item.title,
    summary: item.summary, steps: item.steps, keywords: item.keywords,
    featureArea: item.featureArea, purpose: item.purpose, routeContexts: item.routeContexts,
    videoAssetId: item.videoAssetId ?? '', posterAssetId: item.posterAssetId,
    durationSeconds: item.videoDuration ?? 0, width: item.videoWidth ?? 0, height: item.videoHeight ?? 0,
    narrationDisclosure: item.narrationDisclosure, rank: 0,
  };
}

function RecordingRequestEditor({
  client,
  walkthroughs,
  onSaved,
  onCancel,
}: {
  client: HelpStudioClient;
  walkthroughs: HelpWalkthrough[];
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<HelpRecordingSpecDraft>(emptyHelpRecordingSpecDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof HelpRecordingSpecDraft>(key: K, value: HelpRecordingSpecDraft[K]) => setDraft(current => ({ ...current, [key]: value }));

  const chooseTarget = (id: string) => {
    set('targetWalkthroughId', id);
    const target = walkthroughs.find(item => item.id === id);
    if (!target) return;
    setDraft(current => ({
      ...current,
      targetWalkthroughId: id,
      title: target.title,
      summary: target.summary,
      purpose: target.purpose,
      featureArea: target.featureArea,
      routeContexts: target.routeContexts.join(', '),
      audienceRoles: [...target.audienceRoles],
      keywords: target.keywords.join(', '),
      requestedGoal: `Create a clearer, human-paced recording of ${target.title.toLowerCase()}.`,
      targetScreen: target.routeContexts[0] || target.featureArea,
      actionSteps: target.steps.join('\n'),
      expectedFinalState: `The completed ${target.title.toLowerCase()} result remains visible and easy to understand.`,
    }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await createHelpRecordingJob(client, draft);
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create the recording request.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" data-testid="help-recording-request-editor">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-blue-700">New recording</p>
          <h2 className="text-lg font-bold text-slate-950">Create a walkthrough recording</h2>
        </div>
        <button type="button" onClick={onCancel} className="min-h-10 px-3 text-sm font-semibold text-slate-600 hover:text-slate-950">Cancel</button>
      </div>
      {error && <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">Replace an existing walkthrough
          <select className={fieldClass} value={draft.targetWalkthroughId} onChange={event => chooseTarget(event.target.value)}>
            <option value="">Create a new walkthrough</option>
            {walkthroughs.filter(item => item.state !== 'archived').map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">Title
          <input className={fieldClass} value={draft.title} onChange={event => set('title', event.target.value)} />
        </label>
        <label className="text-sm font-semibold text-slate-700">Intended use
          <select className={fieldClass} value={draft.purpose} onChange={event => set('purpose', event.target.value as HelpRecordingSpecDraft['purpose'])}>
            <option value="support">Support</option><option value="marketing">Marketing</option><option value="both">Support and Marketing</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">Short summary
          <textarea className={`${fieldClass} min-h-20`} value={draft.summary} onChange={event => set('summary', event.target.value)} />
        </label>
        <label className="text-sm font-semibold text-slate-700">Feature area
          <input className={fieldClass} value={draft.featureArea} onChange={event => set('featureArea', event.target.value)} />
        </label>
        <label className="text-sm font-semibold text-slate-700">Screen or route
          <input className={fieldClass} value={draft.targetScreen} onChange={event => set('targetScreen', event.target.value)} placeholder="Drafts" />
        </label>
        <label className="text-sm font-semibold text-slate-700">Route contexts
          <input className={fieldClass} value={draft.routeContexts} onChange={event => set('routeContexts', event.target.value)} placeholder="contractor.drafts" />
        </label>
        <label className="text-sm font-semibold text-slate-700">Recorder scenario
          <select className={fieldClass} value={draft.scenarioKey} onChange={event => set('scenarioKey', event.target.value)}>
            {RECORDER_SCENARIOS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">What should this recording demonstrate?
          <textarea className={`${fieldClass} min-h-20`} value={draft.requestedGoal} onChange={event => set('requestedGoal', event.target.value)} />
        </label>
        <label className="text-sm font-semibold text-slate-700">Required starting state
          <textarea className={`${fieldClass} min-h-24`} value={draft.requiredStartingState} onChange={event => set('requiredStartingState', event.target.value)} />
        </label>
        <label className="text-sm font-semibold text-slate-700">Expected final state
          <textarea className={`${fieldClass} min-h-24`} value={draft.expectedFinalState} onChange={event => set('expectedFinalState', event.target.value)} />
        </label>
        <label className="text-sm font-semibold text-slate-700">Actions, one per line
          <textarea className={`${fieldClass} min-h-36`} value={draft.actionSteps} onChange={event => set('actionSteps', event.target.value)} />
        </label>
        <label className="text-sm font-semibold text-slate-700">Optional talking points, one per line
          <textarea className={`${fieldClass} min-h-36`} value={draft.talkingPoints} onChange={event => set('talkingPoints', event.target.value)} />
        </label>
        <label className="text-sm font-semibold text-slate-700">Keywords and synonyms
          <input className={fieldClass} value={draft.keywords} onChange={event => set('keywords', event.target.value)} />
        </label>
        <label className="text-sm font-semibold text-slate-700">Approximate duration
          <div className="mt-1 flex items-center gap-2"><input className="min-h-10 w-28 rounded-md border border-slate-300 px-3 text-sm" type="number" min="10" max="600" value={draft.desiredDurationSeconds} onChange={event => set('desiredDurationSeconds', event.target.value)} /><span className="text-sm text-slate-500">seconds</span></div>
        </label>
        <label className="text-sm font-semibold text-slate-700">Narration
          <select className={fieldClass} value={draft.narrationMode} onChange={event => set('narrationMode', event.target.value as HelpRecordingSpecDraft['narrationMode'])}>
            <option value="none">None</option><option value="human">Human later</option><option value="ai">AI later</option>
          </select>
        </label>
      </div>
      <fieldset className="mt-4">
        <legend className="text-sm font-bold text-slate-800">Audience</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {AUDIENCES.map(([value, label]) => (
            <label key={value} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-700">
              <input type="checkbox" checked={draft.audienceRoles.includes(value)} onChange={event => set('audienceRoles', event.target.checked ? [...draft.audienceRoles, value] : draft.audienceRoles.filter(role => role !== value))} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-5 flex justify-end">
        <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60">
          {saving ? <Loader2 className="animate-spin" size={17} /> : <Clapperboard size={17} />} Request recording
        </button>
      </div>
    </section>
  );
}

function RecordingPreview({ client, job, onClose }: { client: HelpStudioClient; job: HelpRecordingJob; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void helpRecordingPlaybackUrl(client, job.id)
      .then(value => { if (active) setUrl(value); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to review this recording.'); });
    return () => { active = false; };
  }, [client, job.id]);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-3" role="dialog" aria-modal="true" aria-label={`Review ${job.title}`}>
      <div className="w-full max-w-5xl rounded-lg bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase text-blue-700">Normal-speed review</p><h2 className="text-lg font-bold text-slate-950">{job.title}</h2></div>
          <button type="button" onClick={onClose} className="min-h-10 px-3 text-sm font-semibold text-slate-600">Close</button>
        </div>
        {error ? <div className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : url ? (
          <video className="mt-3 aspect-video w-full bg-black object-contain" controls autoPlay={false} src={url} data-testid="help-recording-review-video" />
        ) : <div className="mt-3 flex aspect-video items-center justify-center bg-slate-100"><Loader2 className="animate-spin text-slate-500" /></div>}
      </div>
    </div>
  );
}

function RecordingJobCard({
  client,
  job,
  walkthroughs,
  onChanged,
  onPreview,
}: {
  client: HelpStudioClient;
  job: HelpRecordingJob;
  walkthroughs: HelpWalkthrough[];
  onChanged: () => Promise<void>;
  onPreview: () => void;
}) {
  const [video, setVideo] = useState<File | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [metadata, setMetadata] = useState<File | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const attach = async () => {
    if (!video || !poster || !metadata) { setError('Choose the validated MP4, poster, and recorder metadata.'); return; }
    setBusy(true);
    setError('');
    let status: HelpRecordingJob['status'] = job.status;
    try {
      const manifest = validateHelpRecordingPackage(JSON.parse(await metadata.text()), job, { video, poster });
      const sourceCommit = manifest.sourceCommit;
      await transitionHelpRecordingJob(client, { id: job.id, status }, 'start_preparing'); status = 'preparing';
      await transitionHelpRecordingJob(client, { id: job.id, status }, 'start_recording'); status = 'recording';
      await transitionHelpRecordingJob(client, { id: job.id, status }, 'start_processing'); status = 'processing';
      const recording = { jobId: job.id, scenario: job.scenarioKey, pacingProfile: job.pacingProfile };
      const uploadedVideo = await uploadHelpMedia(client, video, 'video', sourceCommit, {
        ...recording, expectedChecksum: manifest.mp4Sha256, expectedWidth: manifest.width,
        expectedHeight: manifest.height, expectedDuration: manifest.durationSeconds,
      });
      const uploadedPoster = await uploadHelpMedia(client, poster, 'poster', sourceCommit, {
        ...recording, expectedChecksum: manifest.posterSha256, expectedWidth: manifest.width,
        expectedHeight: manifest.height, expectedDuration: null,
      });
      await transitionHelpRecordingJob(client, { id: job.id, status }, 'complete', {
        video_asset_id: uploadedVideo.assetId,
        poster_asset_id: uploadedPoster.assetId,
        source_version: 'Demo Recorder / servsync-human-paced-v1',
        recorder_metadata: {
          scenario: manifest.scenario,
          pacing_profile: manifest.pacingProfile,
          validation_status: manifest.raw.validation_status,
          sensitive_data_check: manifest.raw.sensitive_data_check,
          duration_seconds: manifest.durationSeconds,
          viewport: manifest.raw.viewport,
          source_git_commit: sourceCommit,
          canonical_output_provenance: manifest.raw.canonical_output_provenance,
        },
      });
      await onChanged();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Recording failed before capture.';
      setError(message);
      if (['requested','preparing','recording','processing'].includes(status)) {
        await transitionHelpRecordingJob(client, { id: job.id, status }, 'fail', { message }).catch(() => {});
        await onChanged().catch(() => {});
      }
    } finally {
      setBusy(false);
    }
  };

  const review = async (action: 'approve' | 'return') => {
    setBusy(true); setError('');
    try { await reviewHelpRecordingJob(client, job.id, action, reviewNotes); await onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to review this recording.'); }
    finally { setBusy(false); }
  };

  const publish = async () => {
    const item = walkthroughs.find(candidate => candidate.id === job.approvedWalkthroughId);
    if (!item) { setError('The approved walkthrough needs to be reloaded.'); return; }
    setBusy(true); setError('');
    try { await transitionHelpWalkthrough(client, item.id, item.currentRevision, 'publish'); await onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to publish this walkthrough.'); }
    finally { setBusy(false); }
  };

  const approvedWalkthrough = walkthroughs.find(item => item.id === job.approvedWalkthroughId);
  return (
    <article className="rounded-md border border-slate-200 bg-white p-4" data-testid={`help-recording-job-${job.status}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={`inline-flex rounded px-2 py-1 text-xs font-bold ${job.status === 'ready_for_review' ? 'bg-amber-50 text-amber-700' : job.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : job.status === 'failed' ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'}`}>{recordingStatusLabel(job.status)}</span>
          <h3 className="mt-2 text-sm font-bold text-slate-950">{job.title}</h3>
          <p className="mt-1 text-sm leading-5 text-slate-600">{job.requestedGoal}</p>
        </div>
        <span className="text-xs font-semibold text-slate-500">{job.desiredDurationSeconds} sec · {purposeLabel(job.purpose)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-slate-600">
        <span className="rounded bg-slate-100 px-2 py-1">{job.featureArea}</span>
        <span className="rounded bg-slate-100 px-2 py-1">Human-paced</span>
        <span className="rounded bg-slate-100 px-2 py-1">{RECORDER_SCENARIOS.find(([value]) => value === job.scenarioKey)?.[1] ?? job.scenarioKey}</span>
      </div>
      {job.failureMessage && <div className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-800">{job.failureMessage}</div>}
      {error && <div className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {job.status === 'requested' && (
        <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3 md:grid-cols-3">
          <label className="text-xs font-semibold text-slate-600">Validated MP4<input className="mt-1 block w-full text-xs font-normal" type="file" accept="video/mp4" onChange={event => setVideo(event.target.files?.[0] ?? null)} /></label>
          <label className="text-xs font-semibold text-slate-600">Poster<input className="mt-1 block w-full text-xs font-normal" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setPoster(event.target.files?.[0] ?? null)} /></label>
          <label className="text-xs font-semibold text-slate-600">Recorder metadata<input className="mt-1 block w-full text-xs font-normal" type="file" accept="application/json" onChange={event => setMetadata(event.target.files?.[0] ?? null)} /></label>
          <div className="flex flex-wrap gap-2 md:col-span-3">
            <button type="button" onClick={() => downloadRecordingSpec(job)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700"><Download size={15} /> Recording spec</button>
            <button type="button" disabled={busy} onClick={() => void attach()} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-blue-700 px-3 text-sm font-bold text-white disabled:opacity-60"><Upload size={15} /> Attach validated recording</button>
          </div>
        </div>
      )}
      {job.status === 'ready_for_review' && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <label className="text-xs font-semibold text-slate-600">Review notes<input className={fieldClass} value={reviewNotes} onChange={event => setReviewNotes(event.target.value)} placeholder="Optional pacing or rerecord notes" /></label>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={onPreview} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700"><Play size={15} /> Review at normal speed</button>
            <button type="button" disabled={busy} onClick={() => void review('approve')} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-emerald-700 px-3 text-sm font-bold text-white disabled:opacity-60"><CheckCircle2 size={15} /> Approve recording</button>
            <button type="button" disabled={busy} onClick={() => void review('return')} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:opacity-60"><RotateCcw size={15} /> Return for rerecord</button>
          </div>
        </div>
      )}
      {job.status === 'approved' && approvedWalkthrough?.publishedRevision !== job.approvedRevision && (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <button type="button" disabled={busy} onClick={() => void publish()} className="min-h-10 rounded-md bg-emerald-700 px-3 text-sm font-bold text-white disabled:opacity-60">Publish for Help</button>
        </div>
      )}
    </article>
  );
}

function HelpEditor({
  client,
  item,
  onSaved,
  onCancel,
}: {
  client: HelpStudioClient;
  item: HelpWalkthrough | null;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<HelpWalkthroughDraft>(() => item ? draftFromWalkthrough(item) : emptyHelpWalkthroughDraft());
  const [slug, setSlug] = useState(item?.slug ?? '');
  const [video, setVideo] = useState<File | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = <K extends keyof HelpWalkthroughDraft>(key: K, value: HelpWalkthroughDraft[K]) => setDraft(current => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      let next = { ...draft };
      if (video) {
        const uploaded = await uploadHelpMedia(client, video, 'video', draft.sourceCommit || undefined);
        next = { ...next, videoAssetId: uploaded.assetId };
      }
      if (poster) {
        const uploaded = await uploadHelpMedia(client, poster, 'poster', draft.sourceCommit || undefined);
        next = { ...next, posterAssetId: uploaded.assetId };
      }
      if (item) await updateHelpWalkthrough(client, item.id, item.currentRevision, next);
      else await createHelpWalkthrough(client, slug || slugFromTitle(next.title), next);
      await onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to save this walkthrough.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" data-testid="help-studio-editor">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-blue-700">{item ? `Revision ${item.currentRevision + 1}` : 'New walkthrough'}</p>
          <h2 className="text-lg font-bold text-slate-950">{item ? item.title : 'Create a walkthrough'}</h2>
        </div>
        <button type="button" onClick={onCancel} className="min-h-10 px-3 text-sm font-semibold text-slate-600 hover:text-slate-950">Cancel</button>
      </div>
      {error && <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">Title
          <input className={fieldClass} value={draft.title} onChange={event => { set('title', event.target.value); if (!item) setSlug(slugFromTitle(event.target.value)); }} />
        </label>
        <label className="text-sm font-semibold text-slate-700">Feature area
          <input className={fieldClass} value={draft.featureArea} onChange={event => set('featureArea', event.target.value)} placeholder="Estimates" />
        </label>
        {!item && <label className="text-sm font-semibold text-slate-700 md:col-span-2">Internal slug
          <input className={fieldClass} value={slug} onChange={event => setSlug(event.target.value.toLowerCase())} />
        </label>}
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">Short summary
          <textarea className={`${fieldClass} min-h-20`} value={draft.summary} onChange={event => set('summary', event.target.value)} />
        </label>
        <label className="text-sm font-semibold text-slate-700">Steps, one per line
          <textarea className={`${fieldClass} min-h-36`} value={draft.steps} onChange={event => set('steps', event.target.value)} />
        </label>
        <label className="text-sm font-semibold text-slate-700">Transcript or detailed notes
          <textarea className={`${fieldClass} min-h-36`} value={draft.transcript} onChange={event => set('transcript', event.target.value)} />
        </label>
        <label className="text-sm font-semibold text-slate-700">Keywords and synonyms
          <input className={fieldClass} value={draft.keywords} onChange={event => set('keywords', event.target.value)} placeholder="create estimate, quote, draft pricing" />
        </label>
        <label className="text-sm font-semibold text-slate-700">Route contexts
          <input className={fieldClass} value={draft.routeContexts} onChange={event => set('routeContexts', event.target.value)} placeholder="contractor.drafts" />
        </label>
        <label className="text-sm font-semibold text-slate-700">Intended use
          <select className={fieldClass} value={draft.purpose} onChange={event => set('purpose', event.target.value as HelpWalkthroughDraft['purpose'])}>
            <option value="support">Support</option><option value="marketing">Marketing</option><option value="both">Support and Marketing</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">Source app commit
          <input className={fieldClass} value={draft.sourceCommit} onChange={event => set('sourceCommit', event.target.value.trim())} placeholder="40-character commit when known" />
        </label>
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-bold text-slate-800">Who can use this walkthrough</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {AUDIENCES.map(([value, label]) => (
            <label key={value} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-200 px-3 text-sm text-slate-700">
              <input type="checkbox" checked={draft.audienceRoles.includes(value)} onChange={event => set('audienceRoles', event.target.checked ? [...draft.audienceRoles, value] : draft.audienceRoles.filter(role => role !== value))} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="rounded-md border border-dashed border-slate-300 p-3 text-sm font-semibold text-slate-700">
          <span className="flex items-center gap-2"><FileVideo size={17} /> Finished MP4</span>
          <input className="mt-2 block w-full text-sm font-normal" type="file" accept="video/mp4" onChange={event => setVideo(event.target.files?.[0] ?? null)} />
          {item?.videoFileName && !video && <span className="mt-2 block truncate text-xs font-normal text-slate-500">Current: {item.videoFileName}</span>}
        </label>
        <label className="rounded-md border border-dashed border-slate-300 p-3 text-sm font-semibold text-slate-700">
          <span className="flex items-center gap-2"><Upload size={17} /> Poster image</span>
          <input className="mt-2 block w-full text-sm font-normal" type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setPoster(event.target.files?.[0] ?? null)} />
          {item?.posterFileName && !poster && <span className="mt-2 block truncate text-xs font-normal text-slate-500">Current: {item.posterFileName}</span>}
        </label>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([
          ['humanPacedReview', 'Cursor and pacing'], ['sensitiveDataReview', 'Sensitive data'],
          ['canonicalOutputReview', 'Product truth'], ['validationStatus', 'Overall validation'],
        ] as const).map(([key, label]) => (
          <label key={key} className="text-sm font-semibold text-slate-700">{label}
            <select className={fieldClass} value={draft[key]} onChange={event => set(key, event.target.value as never)}>
              <option value="pending">Pending</option><option value="passed">Passed</option><option value="failed">Failed</option>
              {key === 'validationStatus' && <option value="needs_review">Needs review</option>}
            </select>
          </label>
        ))}
      </div>

      <details className="mt-4 rounded-md border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-bold text-slate-700">Narration and version details</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">Source version<input className={fieldClass} value={draft.sourceVersion} onChange={event => set('sourceVersion', event.target.value)} /></label>
          <label className="text-sm font-semibold text-slate-700">Narration provider<input className={fieldClass} value={draft.narrationProvider} onChange={event => set('narrationProvider', event.target.value)} /></label>
          <label className="text-sm font-semibold text-slate-700">Narration voice<input className={fieldClass} value={draft.narrationVoice} onChange={event => set('narrationVoice', event.target.value)} /></label>
          <label className="text-sm font-semibold text-slate-700">Disclosure<input className={fieldClass} value={draft.narrationDisclosure} onChange={event => set('narrationDisclosure', event.target.value)} /></label>
        </div>
      </details>

      <div className="mt-5 flex justify-end">
        <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-60">
          {saving ? <Loader2 className="animate-spin" size={17} /> : <CheckCircle2 size={17} />}
          {item ? 'Save new revision' : 'Create walkthrough'}
        </button>
      </div>
    </section>
  );
}

export function HelpStudioWorkspace({ client }: { client: HelpStudioClient }) {
  const [items, setItems] = useState<HelpWalkthrough[]>([]);
  const [recordingJobs, setRecordingJobs] = useState<HelpRecordingJob[]>([]);
  const [usage, setUsage] = useState<HelpUsage | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<HelpWalkthrough | null | 'new'>(null);
  const [creatingRecording, setCreatingRecording] = useState(false);
  const [preview, setPreview] = useState<HelpSearchResult | null>(null);
  const [recordingPreview, setRecordingPreview] = useState<HelpRecordingJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [walkthroughs, mediaUsage, jobs] = await Promise.all([
        listHelpWalkthroughs(client), loadHelpUsage(client), listHelpRecordingJobs(client),
      ]);
      setItems(walkthroughs);
      setUsage(mediaUsage);
      setRecordingJobs(jobs);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load Help Studio.');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return items;
    return items.filter(item => [item.title, item.summary, item.featureArea, ...item.keywords, ...item.routeContexts].join(' ').toLowerCase().includes(search));
  }, [items, query]);

  const transition = async (item: HelpWalkthrough, action: 'publish' | 'unpublish' | 'needs_review' | 'deprecate' | 'archive') => {
    setBusyId(item.id);
    setError('');
    try {
      await transitionHelpWalkthrough(client, item.id, item.currentRevision, action);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to update the walkthrough.');
    } finally {
      setBusyId('');
    }
  };

  if (creatingRecording) return <RecordingRequestEditor client={client} walkthroughs={items} onCancel={() => setCreatingRecording(false)} onSaved={async () => { setCreatingRecording(false); await load(); }} />;
  if (editing) return <HelpEditor client={client} item={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />;

  return (
    <div className="space-y-4" data-testid="help-studio-workspace">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-blue-700">Internal workspace</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Help Studio</h1>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600">Manage durable walkthroughs for in-product help and Marketing reuse.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing('new')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">
            <Upload size={17} /> Import finished video
          </button>
          <button type="button" onClick={() => setCreatingRecording(true)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-blue-700 px-4 text-sm font-bold text-white hover:bg-blue-800">
            <Plus size={17} /> New recording
          </button>
        </div>
      </header>

      {usage && (
        <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Help media usage">
          {[
            ['Published', usage.publishedWalkthroughs], ['Unpublished', usage.unpublishedWalkthroughs],
            ['Media', usage.totalAssets], ['Storage', formatHelpBytes(usage.totalBytes)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
            </div>
          ))}
        </section>
      )}

      {recordingJobs.length > 0 && (
        <section className="space-y-2" aria-label="Recording requests">
          <div className="flex items-center gap-2"><Clapperboard size={18} className="text-blue-700" /><h2 className="text-base font-bold text-slate-950">Recording requests</h2></div>
          <div className="grid gap-3 lg:grid-cols-2">
            {recordingJobs.map(job => (
              <RecordingJobCard key={job.id} client={client} job={job} walkthroughs={items} onChanged={load} onPreview={() => setRecordingPreview(job)} />
            ))}
          </div>
        </section>
      )}

      <label className="relative block">
        <Search className="absolute left-3 top-3 text-slate-400" size={18} aria-hidden="true" />
        <input className="min-h-11 w-full rounded-md border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search titles, features, keywords, or screens" aria-label="Search walkthroughs" />
      </label>

      {error && <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {loading ? (
        <div className="flex min-h-40 items-center justify-center text-slate-500"><Loader2 className="animate-spin" size={24} aria-label="Loading Help Studio" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center">
          <HelpCircle className="mx-auto text-slate-400" size={28} />
          <p className="mt-3 font-bold text-slate-800">No walkthroughs found</p>
          <p className="mt-1 text-sm text-slate-500">Create the first walkthrough or try a different search.</p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map(item => (
            <article key={item.id} className="min-w-0 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-2 py-1 text-xs font-bold ${item.state === 'published' ? 'bg-emerald-50 text-emerald-700' : item.state === 'needs_review' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{statusLabel(item.state)}</span>
                    <span className="text-xs text-slate-500">Revision {item.currentRevision}</span>
                  </div>
                  <h2 className="mt-2 text-base font-bold text-slate-950">{item.title}</h2>
                  <p className="mt-1 text-sm leading-5 text-slate-600">{item.summary}</p>
                </div>
                <FileVideo className="shrink-0 text-slate-400" size={20} aria-hidden="true" />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-slate-600">
                <span className="rounded bg-slate-100 px-2 py-1">{item.featureArea}</span>
                <span className="rounded bg-slate-100 px-2 py-1">{purposeLabel(item.purpose)}</span>
                {item.videoDuration && <span className="rounded bg-slate-100 px-2 py-1">{Math.round(item.videoDuration)} sec</span>}
                {item.videoBytes > 0 && <span className="rounded bg-slate-100 px-2 py-1">{formatHelpBytes(item.videoBytes)}</span>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                <button type="button" onClick={() => setEditing(item)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Pencil size={15} /> Edit</button>
                {item.videoAssetId && <button type="button" onClick={() => setPreview(previewFromWalkthrough(item))} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Play size={15} /> Preview</button>}
                {item.state !== 'published' && item.state !== 'archived' && (
                  <button type="button" disabled={busyId === item.id} onClick={() => void transition(item, 'publish')} className="min-h-10 rounded-md bg-emerald-700 px-3 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60">Publish</button>
                )}
                {item.publishedRevision !== null && item.state !== 'deprecated' && item.state !== 'archived' && (
                  <button type="button" disabled={busyId === item.id} onClick={() => void transition(item, 'unpublish')} className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Unpublish</button>
                )}
                {item.state !== 'deprecated' && item.state !== 'archived' && (
                  <button type="button" disabled={busyId === item.id} onClick={() => void transition(item, 'deprecate')} className="min-h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Deprecate</button>
                )}
                {item.state !== 'archived' && <button type="button" disabled={busyId === item.id} onClick={() => void transition(item, 'archive')} aria-label={`Archive ${item.title}`} className="ml-auto flex h-10 w-10 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"><Archive size={17} /></button>}
              </div>
            </article>
          ))}
        </div>
      )}
      {preview && <HelpWalkthroughDialog client={client} walkthrough={preview} onClose={() => setPreview(null)} />}
      {recordingPreview && <RecordingPreview client={client} job={recordingPreview} onClose={() => setRecordingPreview(null)} />}
    </div>
  );
}
