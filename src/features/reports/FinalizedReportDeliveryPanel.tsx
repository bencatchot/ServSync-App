import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Mail, Send, ShieldX } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContractorLocalContact, FinalizedReportDeliveryLinkMetadata, Inspection } from '../../types';
import {
  listFinalizedReportDeliveryLinks,
  revokeFinalizedReportDeliveryLink,
  sendFinalizedReportEmail,
} from './finalizedReportDelivery';

function readableError(error: unknown, fallback: string) {
  return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : fallback;
}

function dateTime(value: string | null) {
  if (!value) return 'Not yet';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function stateLabel(state: FinalizedReportDeliveryLinkMetadata['state']) {
  if (state === 'active') return 'Active';
  if (state === 'expired') return 'Expired';
  if (state === 'replaced') return 'Replaced';
  return 'Revoked';
}

export function FinalizedReportDeliveryPanel({ client, inspection, localContact }: {
  client: SupabaseClient;
  inspection: Inspection;
  localContact: ContractorLocalContact;
}) {
  const [expanded, setExpanded] = useState(false);
  const [links, setLinks] = useState<FinalizedReportDeliveryLinkMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<'send' | 'revoke' | null>(null);
  const [recipientEmail, setRecipientEmail] = useState(localContact.email ?? '');
  const [expiresDays, setExpiresDays] = useState(30);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const mountedRef = useRef(true);
  const requestRef = useRef(0);
  const contextKey = `${inspection.id}:${localContact.id}`;
  const contextRef = useRef(contextKey);
  contextRef.current = contextKey;

  useEffect(() => () => { mountedRef.current = false; requestRef.current += 1; }, []);
  useEffect(() => {
    requestRef.current += 1;
    setExpanded(false); setLinks([]); setLoading(false); setBusy(null);
    setRecipientEmail(localContact.email ?? ''); setError(''); setNotice('');
  }, [contextKey, localContact.email]);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    const requestContext = contextKey;
    const current = () => mountedRef.current && requestRef.current === requestId && contextRef.current === requestContext;
    setLoading(true); setError('');
    try {
      const records = await listFinalizedReportDeliveryLinks(client, inspection.id);
      if (current()) setLinks(records);
    } catch (err) {
      if (current()) setError(readableError(err, 'Report delivery history could not be loaded.'));
    } finally { if (current()) setLoading(false); }
  }, [client, contextKey, inspection.id]);

  useEffect(() => { if (expanded) void load(); }, [expanded, load]);

  const send = async () => {
    if (busy) return;
    const requestId = ++requestRef.current;
    const requestContext = contextKey;
    const current = () => mountedRef.current && requestRef.current === requestId && contextRef.current === requestContext;
    setBusy('send'); setError(''); setNotice('');
    try {
      const attempt = await sendFinalizedReportEmail(client, inspection.id, recipientEmail, expiresDays);
      if (!current()) return;
      setNotice(`Finalized report sent to ${attempt.recipient_email}. A fresh secure link replaced any earlier report link.`);
      const records = await listFinalizedReportDeliveryLinks(client, inspection.id);
      if (current()) setLinks(records);
    } catch (err) {
      if (current()) {
        setError(readableError(err, 'The report email could not be sent. No successful send was recorded.'));
        try { const records = await listFinalizedReportDeliveryLinks(client, inspection.id); if (current()) setLinks(records); } catch { /* Keep the send error. */ }
      }
    } finally { if (current()) setBusy(null); }
  };

  const activeLink = links.find(link => link.state === 'active') ?? null;
  const revoke = async () => {
    if (!activeLink || busy || !window.confirm('Revoke this secure report link? The recipient session will stop working.')) return;
    const requestId = ++requestRef.current;
    const requestContext = contextKey;
    const current = () => mountedRef.current && requestRef.current === requestId && contextRef.current === requestContext;
    setBusy('revoke'); setError(''); setNotice('');
    try {
      await revokeFinalizedReportDeliveryLink(client, activeLink.id);
      const records = await listFinalizedReportDeliveryLinks(client, inspection.id);
      if (current()) { setLinks(records); setNotice('Secure report link revoked. The finalized Job and PDF were not changed.'); }
    } catch (err) { if (current()) setError(readableError(err, 'The secure report link could not be revoked.')); }
    finally { if (current()) setBusy(null); }
  };

  const recipientValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail.trim()) && recipientEmail.trim().length <= 254;
  const expirationValid = Number.isInteger(expiresDays) && expiresDays >= 1 && expiresDays <= 90;
  return (
    <div className="rounded-lg border border-[#D8DEE8] bg-[#F8FAFD]" data-testid="finalized-report-delivery-panel">
      <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-semibold text-[#223D67]">
        <span className="flex items-center gap-2"><Mail size={16} /> Send to Customer</span>{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {expanded && <div className="space-y-3 border-t border-[#D8DEE8] p-3">
        <p className="text-xs leading-5 text-[#526784]">Email this Customer the exact finalized PDF through one expiring document-scoped link. This does not grant ServSync account access or record acknowledgment, approval, or signature.</p>
        {loading ? <p className="text-xs text-slate-500">Loading delivery history...</p> : links.map(link => (
          <div key={link.id} className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600" data-testid="finalized-report-delivery-history">
            <div className="flex flex-wrap justify-between gap-2"><strong className="text-slate-900">{stateLabel(link.state)}</strong><span>Expires {dateTime(link.expires_at)}</span></div>
            <p className="mt-1">Opened {link.open_count} time{link.open_count === 1 ? '' : 's'} · Latest {dateTime(link.last_opened_at)}</p>
            {(link.email_deliveries ?? []).map(attempt => <div key={attempt.id} className="mt-2 border-t border-slate-100 pt-2" data-testid="finalized-report-email-history-item">
              <div className="flex flex-wrap justify-between gap-2"><strong className={attempt.status === 'sent' ? 'text-emerald-700' : attempt.status === 'failed' ? 'text-red-700' : 'text-amber-700'}>Email {attempt.status === 'sent' ? 'Sent' : attempt.status === 'failed' ? 'Failed' : 'Sending'}</strong><span>{dateTime(attempt.sent_at ?? attempt.failed_at ?? attempt.attempted_at)}</span></div>
              <p className="mt-1 break-all">To {attempt.recipient_email}{attempt.attempted_by_name ? ` · by ${attempt.attempted_by_name}` : ''}</p>
              {attempt.status === 'failed' && <p className="mt-1 text-red-700">The provider did not confirm this send. Check the address and retry.</p>}
            </div>)}
          </div>
        ))}
        <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3" data-testid="finalized-report-email-form">
          <p className="text-sm font-semibold text-slate-900">Finalized report email</p>
          <p className="text-xs leading-5 text-slate-600">Confirm the address for this delivery. Editing it here does not change the Customer profile.</p>
          <label className="block text-xs font-semibold text-slate-700">Recipient email<input type="email" inputMode="email" autoComplete="email" value={recipientEmail} onChange={event => setRecipientEmail(event.target.value)} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900" placeholder="customer@example.com" /></label>
          <label className="block text-xs font-semibold text-slate-700">Link expires in days<input type="number" min={1} max={90} value={expiresDays} onChange={event => setExpiresDays(Number(event.target.value))} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900" /></label>
          <button type="button" onClick={() => void send()} disabled={Boolean(busy) || !recipientValid || !expirationValid} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#0078FF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Send size={16} />{busy === 'send' ? 'Sending...' : links.some(link => link.email_deliveries.length > 0) ? 'Resend Report' : 'Send Report'}</button>
          <p className="text-xs leading-5 text-slate-500">Each send rotates the secure link and invalidates the previous bearer and recipient session.</p>
        </div>
        {activeLink && <button type="button" onClick={() => void revoke()} disabled={Boolean(busy)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-60"><ShieldX size={16} />{busy === 'revoke' ? 'Revoking...' : 'Revoke report link'}</button>}
        {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</p>}
        {notice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</p>}
      </div>}
    </div>
  );
}
