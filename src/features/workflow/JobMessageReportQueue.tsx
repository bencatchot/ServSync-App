import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { formatDateTime } from '../../utils/format';
import { DiscoverSafetyDialog, discoverSafetyButton, discoverSafetyPrimary } from '../discover/DiscoverSafetyDialog';
import { DISCOVER_REPORT_REASONS, type DiscoverSafetyReportReason } from '../discover/discoverSafety';

type JobReport = { id: string; reason: DiscoverSafetyReportReason; evidence: string; created_at: string };

export function JobMessageReportQueue() {
  const [items, setItems] = useState<JobReport[]>([]);
  const [selected, setSelected] = useState<JobReport>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  const inFlight = useRef(false);
  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('servsync_list_job_message_reports');
    if (active.current) {
      setLoading(false);
      setError(error ? 'Job message reports could not be loaded.' : '');
      setItems(!error && Array.isArray(data) ? data as JobReport[] : []);
    }
  }, []);
  useEffect(() => {
    active.current = true;
    void load();
    return () => { active.current = false; };
  }, [load]);

  async function closeReviewed() {
    if (!supabase || !selected || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const { data, error } = await supabase.rpc('servsync_review_job_message_report', { p_report_id: selected.id });
    inFlight.current = false;
    if (!active.current) return;
    setBusy(false);
    if (error || data !== true) setError('The report was not closed. Refresh before retrying.');
    else {
      setSelected(undefined);
      await load();
    }
  }

  return <section aria-label="Job message reports" className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-bold text-slate-950">Job message reports</h2>
      <button type="button" className={discoverSafetyButton} disabled={loading} onClick={() => void load()}>Refresh reports</button>
    </div>
    {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
    {loading ? <p>Loading reports…</p> : !error && !items.length ? <p>No open job message reports.</p> : (
      <ul className="space-y-2">
        {items.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
          <span className="text-sm">{DISCOVER_REPORT_REASONS[item.reason]} · {formatDateTime(item.created_at)}</span>
          <button type="button" className={discoverSafetyButton} onClick={() => { setError(''); setSelected(item); }}>Review message report</button>
        </li>)}
      </ul>
    )}
    {selected && <DiscoverSafetyDialog title="Review reported job message" busy={busy}
      onDismiss={() => setSelected(undefined)} onSubmit={event => { event.preventDefault(); void closeReviewed(); }}>
      <p className="text-sm font-medium">{DISCOVER_REPORT_REASONS[selected.reason]}</p>
      <p className="whitespace-pre-wrap break-words rounded-lg bg-slate-100 p-3 text-sm">{selected.evidence}</p>
      <p className="text-sm">Mark reviewed after investigating. This closes the report and removes its evidence copy without deleting the original job message.</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={discoverSafetyPrimary} disabled={busy}>Mark reviewed</button>
        <button type="button" className={discoverSafetyButton} disabled={busy} onClick={() => setSelected(undefined)}>Back</button>
      </div>
    </DiscoverSafetyDialog>}
  </section>;
}
