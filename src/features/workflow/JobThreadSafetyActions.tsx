import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DiscoverSafetyDialog, discoverSafetyButton, discoverSafetyInput, discoverSafetyPrimary } from '../discover/DiscoverSafetyDialog';
import { DISCOVER_REPORT_REASONS } from '../discover/discoverSafety';

export function JobThreadSafetyAction({
  client, jobId, messageId, onBlocked,
}: {
  client: SupabaseClient;
  jobId: string;
  messageId?: string;
  onBlocked?: () => void;
}) {
  const reporting = Boolean(messageId);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [receipt, setReceipt] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const reasonId = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || (reporting && !Object.hasOwn(DISCOVER_REPORT_REASONS, reason))) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const response = reporting
        ? await client.rpc('servsync_report_job_message', { p_job_id: jobId, p_message_id: messageId, p_reason: reason })
        : await client.rpc('servsync_block_job_counterparty', { p_job_id: jobId });
      if (response.error) throw response.error;
      if (reporting && typeof response.data === 'string' && response.data) setReceipt(response.data);
      else if (!reporting && response.data === true) {
        setOpen(false);
        onBlocked?.();
      } else throw new Error('Unconfirmed action');
    } catch {
      setError(reporting ? 'The report could not be confirmed. Try again.' : 'The block could not be confirmed. Try again.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <>
    <button type="button" className={discoverSafetyButton} onClick={() => {
      setReason(''); setError(''); setReceipt(''); setOpen(true);
    }}>{reporting ? 'Report message' : 'Block account'}</button>
    {open && (receipt ? (
      <DiscoverSafetyDialog key="receipt" title="Report received" onDismiss={() => setOpen(false)}>
        <p className="text-sm">ServSync will review the reported message. Reporting does not block the account or notify the other party.</p>
        <p className="break-all text-sm"><strong>Report reference:</strong> {receipt}</p>
        <button type="button" className={discoverSafetyPrimary} onClick={() => setOpen(false)}>Done</button>
      </DiscoverSafetyDialog>
    ) : (
      <DiscoverSafetyDialog key="action" title={reporting ? 'Report this job message?' : 'Block this account?'}
        busy={busy} onDismiss={() => setOpen(false)} onSubmit={event => void submit(event)}>
        {reporting ? <>
          <p className="text-sm">The selected message will be shared privately with ServSync’s moderation team.</p>
          <label htmlFor={reasonId} className="block text-sm font-semibold">Reason for reporting</label>
          <select id={reasonId} className={discoverSafetyInput} value={reason} disabled={busy} onChange={event => setReason(event.target.value)}>
            <option value="">Choose a reason</option>
            {Object.entries(DISCOVER_REPORT_REASONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </> : <p className="text-sm">Both sides will stop receiving new messages, request replies and private notes shared through appointments. Past messages, records and standard appointment updates stay available. A block does not file a report.</p>}
        {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={discoverSafetyPrimary} disabled={busy || (reporting && !reason)}>{reporting ? 'Send report' : 'Confirm block'}</button>
          <button type="button" className={discoverSafetyButton} disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
        </div>
      </DiscoverSafetyDialog>
    ))}
  </>;
}
