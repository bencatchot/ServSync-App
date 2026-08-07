import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, Link2, Mail, RefreshCw, Send, ShieldX, X } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requestFreeLocalEstimateUrl } from '../../appLinks';
import type {
  ContractorLocalContact,
  Estimate,
  LocalEstimateDeliveryLinkMetadata,
} from '../../types';
import { containDialogTabFocus } from '../invoices/dialogFocusContainment';
import {
  createLocalEstimateDeliveryLink,
  listLocalEstimateDeliveryLinks,
  revokeLocalEstimateDeliveryLink,
  rotateLocalEstimateDeliveryLink,
  sendLocalEstimateEmail,
} from './requestFreeEstimateDelivery';

function readableError(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

function dateTime(value: string | null) {
  if (!value) return 'Not yet';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function stateLabel(state: LocalEstimateDeliveryLinkMetadata['state']) {
  if (state === 'active') return 'Active';
  if (state === 'expired') return 'Expired';
  if (state === 'replaced') return 'Replaced';
  return 'Revoked';
}

function emailStatusLabel(status: 'sending' | 'sent' | 'failed') {
  if (status === 'sent') return 'Sent';
  if (status === 'failed') return 'Failed';
  return 'Sending';
}

function OneTimeEstimateLinkDialog({ url, copiedInitially, returnFocusTarget, onClose }: {
  url: string;
  copiedInitially: boolean;
  returnFocusTarget: HTMLElement | null;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const urlRef = useRef(url);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [copied, setCopied] = useState(copiedInitially);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(urlRef.current);
      setCopied(true);
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      setCopied(false);
    }
  };

  useEffect(() => {
    urlRef.current = url;
    previousFocusRef.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : returnFocusTarget;
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      containDialogTabFocus(event, dialogRef.current);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      urlRef.current = '';
      const focusTarget = previousFocusRef.current?.isConnected ? previousFocusRef.current : returnFocusTarget;
      focusTarget?.focus();
    };
  }, [onClose, returnFocusTarget, url]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
      <section
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="local-estimate-link-title"
        aria-describedby="local-estimate-link-description"
        className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
        data-testid="local-estimate-one-time-link-dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="local-estimate-link-title" className="text-lg font-bold text-slate-950">Secure Estimate link ready</h2>
            <p id="local-estimate-link-description" className="mt-1 text-sm leading-6 text-slate-600">
              This read-only snapshot works without a ServSync account. It does not confirm delivery, receipt, acceptance, approval, or signature.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Close one-time Estimate link">
            <X size={18} />
          </button>
        </div>

        <label htmlFor="local-estimate-one-time-url" className="mt-4 block text-sm font-semibold text-slate-800">One-time link copy</label>
        <input
          ref={inputRef}
          id="local-estimate-one-time-url"
          readOnly
          value={url}
          onFocus={event => event.currentTarget.select()}
          autoComplete="off"
          spellCheck={false}
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#0078FF] focus:ring-2 focus:ring-[#0078FF]/20"
        />

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => void copy()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#0078FF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#005FD6]">
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <button type="button" onClick={onClose} className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Done
          </button>
        </div>
        <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          ServSync cannot display this link after the dialog closes. Rotate it to publish a new snapshot and receive another copy.
        </p>
      </section>
    </div>
  );
}

export function LocalEstimateDeliveryPanel({
  client,
  estimate,
  localContact,
  canManage,
  disabledReason,
  onEstimateChanged,
}: {
  client: SupabaseClient;
  estimate: Estimate;
  localContact: ContractorLocalContact;
  canManage: boolean;
  disabledReason?: string;
  onEstimateChanged: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [links, setLinks] = useState<LocalEstimateDeliveryLinkMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<'create' | 'rotate' | 'revoke' | 'send' | null>(null);
  const [expiresDays, setExpiresDays] = useState(30);
  const [recipientEmail, setRecipientEmail] = useState(localContact.email ?? '');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [oneTimeUrl, setOneTimeUrl] = useState('');
  const [copiedAutomatically, setCopiedAutomatically] = useState(false);
  const mountedRef = useRef(false);
  const busyRef = useRef(false);
  const historyRequestRef = useRef(0);
  const actionRequestRef = useRef(0);
  const contextKey = `${estimate.id}:${localContact.id}`;
  const contextKeyRef = useRef(contextKey);
  const panelToggleRef = useRef<HTMLButtonElement | null>(null);
  contextKeyRef.current = contextKey;

  const clearOneTimeUrl = useCallback(() => {
    setOneTimeUrl('');
    setCopiedAutomatically(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      historyRequestRef.current += 1;
      actionRequestRef.current += 1;
      busyRef.current = false;
    };
  }, []);

  useEffect(() => {
    historyRequestRef.current += 1;
    actionRequestRef.current += 1;
    busyRef.current = false;
    setLinks([]);
    setLoading(false);
    setBusy(null);
    setRecipientEmail(localContact.email ?? '');
    setError('');
    setNotice('');
    clearOneTimeUrl();
  }, [clearOneTimeUrl, contextKey, localContact.email]);

  const load = useCallback(async () => {
    const requestId = ++historyRequestRef.current;
    const requestContext = contextKey;
    const isCurrent = () => mountedRef.current
      && historyRequestRef.current === requestId
      && contextKeyRef.current === requestContext;
    setLoading(true);
    setError('');
    try {
      const records = await listLocalEstimateDeliveryLinks(client, estimate.id);
      if (isCurrent()) setLinks(records);
    } catch (err) {
      if (isCurrent()) setError(readableError(err, 'Estimate-link history could not be loaded.'));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [client, contextKey, estimate.id]);

  useEffect(() => {
    if (expanded) void load();
  }, [expanded, load]);

  const showOneTimeLink = async (token: string, requestId: number, requestContext: string) => {
    const isCurrent = () => mountedRef.current
      && actionRequestRef.current === requestId
      && contextKeyRef.current === requestContext;
    if (!isCurrent()) return false;
    const url = requestFreeLocalEstimateUrl(token);
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      copied = false;
    }
    if (!isCurrent()) return false;
    setCopiedAutomatically(copied);
    setOneTimeUrl(url);
    return true;
  };

  const create = async () => {
    if (busyRef.current) return;
    const requestId = ++actionRequestRef.current;
    const requestContext = contextKey;
    const isCurrent = () => mountedRef.current && actionRequestRef.current === requestId && contextKeyRef.current === requestContext;
    busyRef.current = true;
    setBusy('create');
    setError('');
    setNotice('');
    try {
      const result = await createLocalEstimateDeliveryLink(client, estimate.id, expiresDays);
      const token = result.token;
      result.token = '';
      if (!await showOneTimeLink(token, requestId, requestContext) || !isCurrent()) return;
      setLinks(current => [result.link, ...current.filter(link => link.id !== result.link.id)]);
      setNotice(estimate.status === 'draft'
        ? 'Estimate issued and secure snapshot created. No email or text was sent.'
        : 'Secure Estimate snapshot created. No email or text was sent.');
      await onEstimateChanged();
    } catch (err) {
      if (isCurrent()) setError(readableError(err, 'The secure Estimate link could not be created.'));
    } finally {
      if (actionRequestRef.current === requestId) {
        busyRef.current = false;
        if (isCurrent()) setBusy(null);
      }
    }
  };

  const activeLink = links.find(link => link.state === 'active') ?? null;

  const rotate = async () => {
    if (!activeLink || busyRef.current) return;
    if (!window.confirm('Rotate this secure Estimate link? The current link will stop working and a new snapshot will be published.')) return;
    const requestId = ++actionRequestRef.current;
    const requestContext = contextKey;
    const isCurrent = () => mountedRef.current && actionRequestRef.current === requestId && contextKeyRef.current === requestContext;
    busyRef.current = true;
    setBusy('rotate');
    setError('');
    setNotice('');
    try {
      const result = await rotateLocalEstimateDeliveryLink(client, activeLink.id, expiresDays);
      const token = result.token;
      result.token = '';
      if (!await showOneTimeLink(token, requestId, requestContext) || !isCurrent()) return;
      await load();
      if (isCurrent()) setNotice('Secure link rotated with the current Estimate snapshot. The previous link is no longer active.');
    } catch (err) {
      if (isCurrent()) setError(readableError(err, 'The secure Estimate link could not be rotated.'));
    } finally {
      if (actionRequestRef.current === requestId) {
        busyRef.current = false;
        if (isCurrent()) setBusy(null);
      }
    }
  };

  const revoke = async () => {
    if (!activeLink || busyRef.current) return;
    if (!window.confirm('Revoke this secure Estimate link? The recipient will no longer be able to view its snapshot.')) return;
    const requestId = ++actionRequestRef.current;
    const requestContext = contextKey;
    const isCurrent = () => mountedRef.current && actionRequestRef.current === requestId && contextKeyRef.current === requestContext;
    busyRef.current = true;
    setBusy('revoke');
    setError('');
    setNotice('');
    try {
      await revokeLocalEstimateDeliveryLink(client, activeLink.id);
      if (!isCurrent()) return;
      await load();
      if (isCurrent()) setNotice('Secure Estimate link revoked. No Estimate or work status changed.');
    } catch (err) {
      if (isCurrent()) setError(readableError(err, 'The secure Estimate link could not be revoked.'));
    } finally {
      if (actionRequestRef.current === requestId) {
        busyRef.current = false;
        if (isCurrent()) setBusy(null);
      }
    }
  };

  const sendEmail = async () => {
    if (busyRef.current) return;
    const requestId = ++actionRequestRef.current;
    const requestContext = contextKey;
    const isCurrent = () => mountedRef.current && actionRequestRef.current === requestId && contextKeyRef.current === requestContext;
    busyRef.current = true;
    setBusy('send');
    setError('');
    setNotice('');
    try {
      const attempt = await sendLocalEstimateEmail(client, estimate.id, recipientEmail, expiresDays);
      if (!isCurrent()) return;
      await load();
      if (isCurrent()) {
        setNotice(`Estimate sent to ${attempt.recipient_email}. A fresh secure link replaced any earlier account-free link.`);
        await onEstimateChanged();
      }
    } catch (err) {
      if (isCurrent()) {
        const message = readableError(err, 'The Estimate email could not be sent. No successful send was recorded.');
        await load();
        if (isCurrent()) setError(message);
      }
    } finally {
      if (actionRequestRef.current === requestId) {
        busyRef.current = false;
        if (isCurrent()) setBusy(null);
      }
    }
  };

  const claimed = Boolean(localContact.homeowner_user_id || localContact.claimed_at);
  const hasLineItems = (estimate.line_items?.length ?? 0) > 0;
  const expirationValid = Number.isInteger(expiresDays) && expiresDays >= 1 && expiresDays <= 90;
  const recipientEmailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail.trim()) && recipientEmail.trim().length <= 254;
  const canPublishStatus = estimate.status === 'draft' || estimate.status === 'sent' || estimate.status === 'revised';
  const canCreate = canManage && !disabledReason && !claimed && hasLineItems && canPublishStatus && !activeLink;
  const canRotate = canManage && !disabledReason && !claimed && hasLineItems && canPublishStatus && Boolean(activeLink);
  const canSend = canManage && !disabledReason && !claimed && hasLineItems && canPublishStatus;

  return (
    <div className="mt-3 rounded-lg border border-[#D8DEE8] bg-[#F8FAFD]" data-testid="local-estimate-delivery-panel">
      <button
        ref={panelToggleRef}
        type="button"
        onClick={() => setExpanded(value => !value)}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-semibold text-[#223D67]"
      >
        <span className="flex items-center gap-2"><Mail size={16} /> Estimate delivery</span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-[#D8DEE8] p-3">
          <p className="text-xs leading-5 text-[#526784]">
            Send or copy a document-specific Estimate for this Customer. The recipient can review and explicitly accept the exact delivered version without account access; this is not an electronic signature or payment.
          </p>
          {loading ? <p className="text-sm text-[#526784]">Loading secure-link history...</p> : (
            <>
              {links.length > 0 && (
                <div className="space-y-2" data-testid="local-estimate-delivery-history">
                  {links.map(link => (
                    <div key={link.id} className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">{stateLabel(link.state)}</span>
                        <span>Expires {dateTime(link.expires_at)}</span>
                      </div>
                      <p className="mt-1">Snapshot {dateTime(link.source_updated_at)} · Created {dateTime(link.created_at)}{link.created_by_name ? ` by ${link.created_by_name}` : ''}</p>
                      <p className="mt-1">Opened {link.open_count} time{link.open_count === 1 ? '' : 's'} · First {dateTime(link.first_opened_at)} · Latest {dateTime(link.last_opened_at)}</p>
                      {(link.email_deliveries ?? []).map(delivery => (
                        <div key={delivery.id} className="mt-2 border-t border-slate-100 pt-2" data-testid="local-estimate-email-delivery-history-item">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className={`font-semibold ${delivery.status === 'sent' ? 'text-emerald-700' : delivery.status === 'failed' ? 'text-red-700' : 'text-amber-700'}`}>
                              Email {emailStatusLabel(delivery.status)}
                            </span>
                            <span>{dateTime(delivery.sent_at ?? delivery.failed_at ?? delivery.attempted_at)}</span>
                          </div>
                          <p className="mt-1 break-all">To {delivery.recipient_email}{delivery.attempted_by_name ? ` · by ${delivery.attempted_by_name}` : ''}</p>
                          {delivery.status === 'failed' && <p className="mt-1 text-red-700">The provider did not confirm this send. Check the address and retry.</p>}
                          {delivery.status === 'sending' && <p className="mt-1 text-amber-700">ServSync is waiting for a confirmed provider result.</p>}
                        </div>
                      ))}
                      {link.acceptance?.state === 'accepted' && (
                        <div className="mt-2 border-t border-emerald-100 pt-2 text-emerald-800" data-testid="local-estimate-guest-acceptance-history">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold">Accepted through secure guest delivery</span>
                            <span>{dateTime(link.acceptance.accepted_at)}</span>
                          </div>
                          <p className="mt-1">Accepted snapshot {dateTime(link.acceptance.source_updated_at)}{link.acceptance.recipient_email ? ` · Recipient ${link.acceptance.recipient_email}` : ''}</p>
                        </div>
                      )}
                      {link.revoked_at && <p className="mt-1">Ended {dateTime(link.revoked_at)}{link.revoked_by_name ? ` by ${link.revoked_by_name}` : ''}</p>}
                    </div>
                  ))}
                </div>
              )}
              {claimed && <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">This Customer is now connected. New or rotated account-free links are disabled; an active link can still be revoked.</p>}
              {!hasLineItems && <p className="text-xs font-semibold text-amber-800">Add at least one Estimate line before publishing a secure link.</p>}
              {!canPublishStatus && <p className="text-xs font-semibold text-amber-800">This Estimate status cannot publish a new account-free snapshot.</p>}
              {disabledReason && <p className="text-xs font-semibold text-amber-800">{disabledReason}</p>}
              {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</p>}
              {notice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</p>}

              {canSend && (
                <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3" data-testid="local-estimate-email-send-form">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><Mail size={16} /> Send Estimate</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">Confirm the address for this delivery. Editing it here does not change the Customer profile.</p>
                  </div>
                  <label htmlFor={`local-estimate-recipient-${estimate.id}`} className="block text-xs font-semibold text-slate-700">
                    Recipient email
                    <input
                      id={`local-estimate-recipient-${estimate.id}`}
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={recipientEmail}
                      onChange={event => setRecipientEmail(event.target.value)}
                      className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                      placeholder="customer@example.com"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => void sendEmail()}
                    disabled={Boolean(busy) || !expirationValid || !recipientEmailValid}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-[#0078FF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
                  >
                    <Send size={16} /> {busy === 'send' ? 'Sending...' : (links.some(link => (link.email_deliveries ?? []).length > 0) ? 'Resend Estimate' : 'Send Estimate')}
                  </button>
                  <p className="text-xs leading-5 text-slate-500">Each send publishes a fresh snapshot and invalidates the previous account-free link. The recipient receives view-only access to this Estimate.</p>
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                {(canCreate || canRotate) && (
                  <label className="text-xs font-semibold text-slate-700">
                    Link expires in
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={expiresDays}
                      onChange={event => setExpiresDays(Number(event.target.value))}
                      className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:w-auto"
                      aria-describedby="local-estimate-expiration-help"
                    />
                    <span id="local-estimate-expiration-help" className="mt-1 block font-normal text-slate-500">1 to 90 days</span>
                  </label>
                )}
                {canCreate && (
                  <button type="button" onClick={() => void create()} disabled={Boolean(busy) || !expirationValid} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#0078FF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                    <Link2 size={16} /> {busy === 'create' ? 'Creating...' : estimate.status === 'draft' ? 'Issue Estimate & copy link' : 'Create copyable link'}
                  </button>
                )}
                {canRotate && (
                  <button type="button" onClick={() => void rotate()} disabled={Boolean(busy) || !expirationValid} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">
                    <RefreshCw size={16} /> {busy === 'rotate' ? 'Rotating...' : 'Rotate with current snapshot'}
                  </button>
                )}
                {canManage && activeLink && (
                  <button type="button" onClick={() => void revoke()} disabled={Boolean(busy)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-60">
                    <ShieldX size={16} /> {busy === 'revoke' ? 'Revoking...' : 'Revoke link'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {oneTimeUrl && (
        <OneTimeEstimateLinkDialog
          url={oneTimeUrl}
          copiedInitially={copiedAutomatically}
          returnFocusTarget={panelToggleRef.current}
          onClose={clearOneTimeUrl}
        />
      )}
    </div>
  );
}
