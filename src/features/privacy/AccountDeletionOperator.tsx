import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';

type Hold = 'identity' | 'shared_records' | 'retention';
type QueueItem = {
  reference: string; received_at: string; first_update_due: string; completion_target: string;
  state: 'received' | 'review' | 'held' | 'approved'; first_update_recorded: boolean; hold_reason: Hold | null;
};
type Draft = { verified_email: string | null; destination_stamp: string | null; state: QueueItem['state'] };

const holdLabel: Record<Hold, string> = {
  identity: 'Requester identity needs verification',
  shared_records: 'Shared records need review',
  retention: 'Retention obligations need review',
};
const states = { received: 'Received', review: 'Under review', held: 'On hold', approved: 'Review completed' };
const control = 'min-h-11 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50';
const field = 'min-h-11 w-full rounded-lg border border-slate-300 px-3 text-slate-900';
const PAGE_SIZE = 20;
const message = 'We received your ServSync account deletion request and are reviewing it. No action is needed right now. We’ll contact you if we need information from you.';
function displayDay(v: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(v + 'T12:00:00Z'));
}
async function fingerprint(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value.trim()));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function AccountDeletionOperator() {
  const [rows, setRows] = useState<QueueItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [opened, setOpened] = useState<QueueItem | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hold, setHold] = useState<Hold | ''>('');
  const [evidence, setEvidence] = useState('');
  const [sent, setSent] = useState('');
  const [channel, setChannel] = useState('verified_mailbox');
  const [attested, setAttested] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const attempt = useRef<{ content: string; key: string } | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const closing = () => {
    setOpened(null); setDraft(null); setEvidence(''); setSent(''); setAttested(false); setHold(''); attempt.current = null;
  };
  useEffect(() => () => inFlight.current?.abort(), []);
  useEffect(() => {
    if (!supabase) { setError('Reviewer workspace unavailable.'); setLoading(false); return; }
    const c = new AbortController();
    setLoading(true); setRows([]); setHasMore(false);
    void supabase.rpc('servsync_closure_operator_pending', { p_after_time: null, p_after_ref: null, p_limit: PAGE_SIZE })
      .abortSignal(c.signal).returns<QueueItem[]>().then(({ data, error: failure }) => {
        if (c.signal.aborted) return;
        if (failure || !Array.isArray(data)) setError('Reviewer workspace unavailable.');
        else { setRows(data); setHasMore(data.length === PAGE_SIZE); }
        setLoading(false);
      });
    return () => c.abort();
  }, [refresh]);
  function keyFor(content: string) {
    if (attempt.current?.content !== content) attempt.current = { content, key: crypto.randomUUID() };
    return attempt.current.key;
  }
  function start() {
    if (inFlight.current) return null;
    const c = new AbortController(); inFlight.current = c;
    setBusy(true); setStatus(''); setError('');
    return c;
  }
  function end(c: AbortController) {
    if (c.signal.aborted) return;
    inFlight.current = null; setBusy(false);
  }
  async function more() {
    const prev = rows[rows.length - 1];
    if (!supabase || !prev || !hasMore) return;
    const c = start(); if (!c) return;
    try {
      const { data, error: failure } = await supabase.rpc('servsync_closure_operator_pending', {
        p_after_time: prev.received_at, p_after_ref: prev.reference, p_limit: PAGE_SIZE,
      }).abortSignal(c.signal).returns<QueueItem[]>();
      if (c.signal.aborted) return;
      if (failure || !Array.isArray(data)) throw new Error();
      setRows(old => [...old, ...data]); setHasMore(data.length === PAGE_SIZE);
    } catch {
      if (!c.signal.aborted) setError('More requests could not be loaded. Refresh the queue.');
    } finally { end(c); }
  }
  async function prepare() {
    if (!supabase || !opened || opened.first_update_recorded) return;
    const c = start(); if (!c) return;
    try {
      const { data, error: failure } = await supabase.rpc('servsync_closure_operator_prepare', { p_case: opened.reference })
        .abortSignal(c.signal).maybeSingle<Draft>();
      if (c.signal.aborted) return;
      if (failure || !data) throw new Error();
      setDraft(data);
    } catch {
      if (!c.signal.aborted) setError('This update could not be prepared. Refresh the request before trying again.');
    } finally { end(c); }
  }
  async function save(kind: 'update' | 'hold') {
    if (!supabase || !opened || (kind === 'update' && (!draft?.destination_stamp || !attested || !sent || !evidence.trim()))
      || (kind === 'hold' && !hold)) return;
    const c = start(); if (!c) return;
    try {
      let result;
      if (kind === 'update' && draft?.destination_stamp) {
        const time = new Date(sent).toISOString();
        const d = await fingerprint(evidence);
        if (c.signal.aborted) return;
        const key = keyFor(JSON.stringify([kind,opened.reference,time,channel,d,draft.destination_stamp]));
        result = await supabase.rpc('servsync_closure_operator_record_update', {
          p_case: opened.reference, p_operation: key, p_sent_at: time,
          p_channel: channel, p_evidence_sha256: d, p_destination_stamp: draft.destination_stamp,
        }).abortSignal(c.signal);
        if (c.signal.aborted) return;
        if (result.data !== 'recorded' || result.error) throw new Error();
        setStatus('First update recorded. ServSync did not send an email.');
      } else {
        const key = keyFor(JSON.stringify([kind,opened.reference,hold]));
        result = await supabase.rpc('servsync_closure_operator_hold', {
          p_case: opened.reference, p_operation: key, p_reason: hold,
        }).abortSignal(c.signal);
        if (c.signal.aborted) return;
        if (result.data !== 'held' || result.error) throw new Error();
        setStatus('Manual hold recorded. The requester’s account remains unchanged.');
      }
      closing(); setRefresh(n => n + 1);
    } catch {
      if (!c.signal.aborted) setError('This action could not be verified. Refresh the request before retrying. Do not resend an update.');
    } finally { end(c); }
  }
  return <section aria-label="Account deletion requests" className="space-y-4 rounded-xl border border-slate-200 p-4">
    <h2 className="text-lg font-bold">Account deletion requests</h2>
    <p className="text-sm">Review open requests. Account closure and completion notices are not available here.</p>
    <button type="button" className={control} disabled={loading || busy} onClick={() => { closing(); setStatus(''); setError(''); setRefresh(n => n + 1); }}>
      Refresh requests
    </button>
    {error && <p role="alert">{error}</p>}
    <p role="status">{loading ? 'Checking requests…' : status || (!rows.length && !error ? 'No open requests.' : '')}</p>
    {!opened && <ul className="space-y-3">{rows.map(row => <li key={row.reference} className="space-y-2 rounded-xl border p-3">
      <h3 className="break-all font-semibold">{row.reference}</h3>
      <p>{states[row.state]}{row.first_update_recorded ? ' · First update recorded' : ''}</p>
      <p>First update due {displayDay(row.first_update_due)}. Completion target {displayDay(row.completion_target)}.</p>
      <button aria-label={'Review request ' + row.reference} type="button" className={control} disabled={busy}
        onClick={() => { setOpened(row); setError(''); setStatus(''); }}>Review request</button>
    </li>)}</ul>}
    {!opened && hasMore && <button type="button" className={control} disabled={busy} onClick={() => void more()}>Load more requests</button>}
    {opened && <article className="space-y-3 rounded-xl border p-3" aria-label="Selected request">
      <button type="button" className={control} disabled={busy} onClick={() => { closing(); setError(''); }}>Back to requests</button>
      <h3 className="break-all font-semibold">{opened.reference}</h3>
      <p>{states[opened.state]}{opened.hold_reason && ': ' + holdLabel[opened.hold_reason]}</p>
      <p>First update due {displayDay(opened.first_update_due)}. Completion target {displayDay(opened.completion_target)}.</p>
      {opened.first_update_recorded && <p>First update recorded by reviewer.</p>}
      {!draft && !opened.first_update_recorded && <button type="button" className={control} disabled={busy}
        onClick={() => void prepare()}>Prepare first update</button>}
      {draft && (!draft.verified_email || !draft.destination_stamp ?
        <p role="status">No verified email for this request. Resolve the requester’s contact before an update.</p>
        : <form onSubmit={e => { e.preventDefault(); void save('update'); }} className="space-y-3 rounded-xl border p-3">
          <h4 className="font-semibold">First update draft</h4>
          <p className="break-all">Verified requester: {draft.verified_email}</p>
          <p>Subject: Your ServSync account deletion request</p>
          <p>{message}</p>
          <p className="text-sm">Send separately from the verified outbound channel. This page does not send email.</p>
          <label className="block">Outbound channel <select className={field} value={channel} onChange={e => setChannel(e.target.value)} disabled={busy}>
            <option value="verified_mailbox">Verified mailbox</option><option value="verified_provider">Verified delivery provider</option>
          </select></label>
          <label className="block">Time sent (your local time) <input className={field} type="datetime-local" required value={sent} onChange={e => setSent(e.target.value)} disabled={busy} /></label>
          <label className="block">Sent-message or provider reference <input className={field} required maxLength={256} value={evidence} onChange={e => setEvidence(e.target.value)} autoComplete="off" disabled={busy} /></label>
          <label className="block"><input type="checkbox" checked={attested} onChange={e => setAttested(e.target.checked)} disabled={busy} /> I verified this update was sent to the requester shown above.</label>
          <button className={control} type="submit" disabled={busy || !attested || !sent || !evidence.trim()}>Record sent update</button>
        </form>)}
      {opened.state !== 'held' && <form onSubmit={e => { e.preventDefault(); void save('hold'); }} className="space-y-2">
        <label className="block">Manual hold reason <select className={field} value={hold} disabled={busy} onChange={e => setHold(e.target.value as Hold | '')}>
          <option value="">Choose a reason</option>
          {Object.entries(holdLabel).map(([reason,label]) => <option key={reason} value={reason}>{label}</option>)}
        </select></label>
        <button className={control} type="submit" disabled={busy || !hold}>Record manual hold</button>
      </form>}
    </article>}
  </section>;
}
