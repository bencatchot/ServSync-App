import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ImagePlus, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  createMarketingUsageAdapter,
  type MarketingCostControls,
  type MarketingUsageClient,
  type MarketingUsageSummary,
} from './marketingUsage';

function usageLabel(used: number, limit: number) {
  return `${used} of ${limit}`;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatCost(microusd: number) {
  return `$${(microusd / 1_000_000).toFixed(2)}`;
}

function Meter({ label, used, limit, helper }: { label: string; used: number; limit: number; helper: string }) {
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4" data-testid={`marketing-usage-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-bold text-slate-950">{label}</p>
        <p className="text-sm font-semibold text-slate-700">{usageLabel(used, limit)}</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div className={`h-full rounded-full ${percent >= 100 ? 'bg-amber-500' : 'bg-blue-600'}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p>
    </div>
  );
}

function Count({ label, value, helper }: { label: string; value: number; helper: string }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4" data-testid={`marketing-usage-${label.toLowerCase().replace(/\s+/g, '-')}`}>
    <p className="text-sm font-bold text-slate-950">{label}</p>
    <p className="mt-3 text-xl font-bold text-slate-900">{value}</p>
    <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p>
  </div>;
}

function CostControlsForm({ controls, saving, onSave }: {
  controls: MarketingCostControls;
  saving: boolean;
  onSave: (next: Omit<MarketingCostControls, 'currentSpendMicrousd' | 'updatedAt'>) => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(controls.generationEnabled);
  const [budget, setBudget] = useState(controls.monthlyBudgetMicrousd === null ? '' : String(controls.monthlyBudgetMicrousd / 1_000_000));
  const [warning, setWarning] = useState(String(controls.warningPercent));
  const [hardStop, setHardStop] = useState(String(controls.hardStopPercent));
  const [reason, setReason] = useState(controls.stopReason ?? 'Owner paused Marketing generation.');

  return (
    <form
      className="border-t border-slate-200 pt-5"
      onSubmit={event => {
        event.preventDefault();
        const dollars = budget.trim() === '' ? null : Number(budget);
        void onSave({
          generationEnabled: enabled,
          monthlyBudgetMicrousd: dollars === null ? null : Math.round(dollars * 1_000_000),
          warningPercent: Number(warning),
          hardStopPercent: Number(hardStop),
          stopReason: enabled ? null : reason.trim(),
        });
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-950">Platform generation controls</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">Current recorded or estimated Marketing spend: {formatCost(controls.currentSpendMicrousd)}</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />
          Paid generation enabled
        </label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold text-slate-600">Monthly budget (USD)
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" inputMode="decimal" value={budget} onChange={event => setBudget(event.target.value)} placeholder="Not configured" />
        </label>
        <label className="text-xs font-semibold text-slate-600">Warning percent
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="number" min="1" max="99" value={warning} onChange={event => setWarning(event.target.value)} />
        </label>
        <label className="text-xs font-semibold text-slate-600">Hard stop percent
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" type="number" min="2" max="100" value={hardStop} onChange={event => setHardStop(event.target.value)} />
        </label>
      </div>
      {!enabled && (
        <label className="mt-3 block text-xs font-semibold text-slate-600">Pause reason
          <input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={reason} onChange={event => setReason(event.target.value)} />
        </label>
      )}
      <button type="submit" disabled={saving} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
        {saving && <Loader2 size={15} className="animate-spin" />}
        Save controls
      </button>
    </form>
  );
}

export function MarketingUsagePanel({ client, contractorId, platformControls = false, refreshKey = 0 }: {
  client: MarketingUsageClient;
  contractorId: string | null;
  platformControls?: boolean;
  refreshKey?: number;
}) {
  const adapter = useMemo(() => createMarketingUsageAdapter(client, contractorId), [client, contractorId]);
  const [summary, setSummary] = useState<MarketingUsageSummary | null>(null);
  const [controls, setControls] = useState<MarketingCostControls | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [rights, setRights] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextSummary, nextControls] = await Promise.all([
        adapter.getSummary(),
        platformControls ? adapter.getCostControls() : Promise.resolve(null),
      ]);
      setSummary(nextSummary);
      setControls(nextControls);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'ServSync could not load Marketing usage.');
    } finally {
      setLoading(false);
    }
  }, [adapter, platformControls]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  return (
    <section className="space-y-4" data-testid="marketing-usage-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-950">Marketing usage</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Beta limits keep temporary media and generation costs predictable.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh Marketing usage" className="rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
      {summary && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Count label="AI drafts" value={summary.usage.aiTextDraftsRolling30Days} helper="Recorded in the last 30 days; no separate draft limit is currently set." />
            <Meter label="Video generations" used={summary.usage.videoGenerationsRolling30Days} limit={summary.entitlements.monthlyVideoGenerations} helper="Rolling 30-day beta allowance." />
            <Meter label="Active media" used={summary.usage.activeMediaSlots} limit={summary.entitlements.activeMediaSlots} helper={`${formatBytes(summary.usage.activeMediaBytes)} temporarily retained.`} />
            <Meter label="Prepared posts" used={summary.usage.readyScheduledPosts} limit={summary.entitlements.readyScheduledPostLimit} helper="Ready, scheduled, or publishing." />
          </div>
          {(!summary.generation.enabled || summary.generation.globalHardStop) && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle size={17} className="mt-0.5 shrink-0" />
              <p>New paid media generation is paused. Existing content and media remain available for review.</p>
            </div>
          )}
          <div className="flex items-start gap-2 text-xs leading-5 text-slate-500">
            <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-600" />
            <p>Published media is retained for {summary.entitlements.publishedMediaRetentionHours} hours before eligible large files are removed. Abandoned media expires after {summary.entitlements.abandonedMediaExpirationDays} days.</p>
          </div>
          {summary.generation.recentTextDraft && <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">
            <p className="font-bold text-slate-900">Latest AI draft evidence</p>
            <p>{summary.generation.recentTextDraft.provider} · {summary.generation.recentTextDraft.model} · {summary.generation.recentTextDraft.outcome}</p>
            <p>Cost: {summary.generation.recentTextDraft.costStatus === 'known' && summary.generation.recentTextDraft.knownCostMicrousd !== null
              ? formatCost(summary.generation.recentTextDraft.knownCostMicrousd)
              : summary.generation.recentTextDraft.costStatus === 'estimated' && summary.generation.recentTextDraft.estimatedCostMicrousd !== null
                ? `${formatCost(summary.generation.recentTextDraft.estimatedCostMicrousd)} estimated`
                : summary.generation.recentTextDraft.costStatus}.</p>
          </div>}
        </>
      )}

      {contractorId && (
        <div className="border-t border-slate-200 pt-5">
          <h3 className="text-sm font-bold text-slate-950">Add Marketing media</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">JPEG, PNG, WebP, or MP4 up to 100 MB. Video is limited to {summary?.entitlements.maxGeneratedVideoSeconds ?? 75} seconds in beta.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="text-xs font-semibold text-slate-600">Photo or video
              <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-semibold" onChange={event => setFile(event.target.files?.[0] ?? null)} />
            </label>
            <button type="button" disabled={!file || !rights || uploading} onClick={() => {
              if (!file) return;
              setUploading(true); setError(''); setNotice('');
              void adapter.upload(file, rights).then(async () => {
                setNotice('Marketing media added for review.'); setFile(null); setRights(false); await load();
              }).catch(uploadError => setError(uploadError instanceof Error ? uploadError.message : 'ServSync could not upload Marketing media.'))
                .finally(() => setUploading(false));
            }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
              Add media
            </button>
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm leading-5 text-slate-700">
            <input type="checkbox" className="mt-0.5" checked={rights} onChange={event => setRights(event.target.checked)} />
            <span>I have the right to use this media publicly and have reviewed it for customer or private information.</span>
          </label>
        </div>
      )}

      {platformControls && controls && (
        <details className="border-t border-slate-200 pt-4" data-testid="marketing-platform-operations">
          <summary className="cursor-pointer text-sm font-bold text-slate-800">Platform operations</summary>
          <p className="mt-1 text-xs leading-5 text-slate-500">Global generation controls for ServSync operators.</p>
          <CostControlsForm controls={controls} saving={saving} onSave={async next => {
          setSaving(true); setError(''); setNotice('');
          try { setControls(await adapter.updateCostControls(next)); setNotice('Platform Marketing controls updated.'); }
          catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'ServSync could not update Marketing controls.'); }
          finally { setSaving(false); }
          }} />
        </details>
      )}
    </section>
  );
}
