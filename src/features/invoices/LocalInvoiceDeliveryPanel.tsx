import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, Link2, RefreshCw, ShieldX, X } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requestFreeLocalInvoiceUrl } from '../../appLinks';
import type {
  ContractorLocalContact,
  Invoice,
  LocalInvoiceDeliveryLinkMetadata,
} from '../../types';
import {
  createLocalInvoiceDeliveryLink,
  listLocalInvoiceDeliveryLinks,
  revokeLocalInvoiceDeliveryLink,
  rotateLocalInvoiceDeliveryLink,
} from './requestFreeInvoiceDelivery';
import { containDialogTabFocus } from './dialogFocusContainment';

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

function stateLabel(state: LocalInvoiceDeliveryLinkMetadata['state']) {
  if (state === 'active') return 'Active';
  if (state === 'expired') return 'Expired';
  if (state === 'replaced') return 'Replaced';
  return 'Revoked';
}

function OneTimeLinkDialog({ url, copiedInitially, onClose }: {
  url: string;
  copiedInitially: boolean;
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
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
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
      if (inputRef.current) inputRef.current.value = '';
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
      <section
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="local-invoice-link-title"
        aria-describedby="local-invoice-link-description"
        className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-xl"
        data-testid="local-invoice-one-time-link-dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="local-invoice-link-title" className="text-lg font-bold text-slate-950">Secure invoice link ready</h2>
            <p id="local-invoice-link-description" className="mt-1 text-sm leading-6 text-slate-600">
              This link can be viewed without a ServSync account. It does not confirm delivery, receipt, acceptance, or payment.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Close one-time invoice link">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4">
          <label htmlFor="local-invoice-one-time-url" className="text-sm font-semibold text-slate-800">One-time link copy</label>
          <input
            ref={inputRef}
            id="local-invoice-one-time-url"
            readOnly
            value={url}
            onFocus={event => event.currentTarget.select()}
            autoComplete="off"
            spellCheck={false}
            className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#0078FF] focus:ring-2 focus:ring-[#0078FF]/20"
          />
        </div>

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
          After this dialog closes, ServSync cannot display this link again. Rotate the link to receive another copy.
        </p>
      </section>
    </div>
  );
}

export function LocalInvoiceDeliveryPanel({
  client,
  invoice,
  localContact,
  canManage,
  disabledReason,
  onInvoiceChanged,
}: {
  client: SupabaseClient;
  invoice: Invoice;
  localContact: ContractorLocalContact;
  canManage: boolean;
  disabledReason?: string;
  onInvoiceChanged: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [links, setLinks] = useState<LocalInvoiceDeliveryLinkMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<'create' | 'rotate' | 'revoke' | null>(null);
  const [expiresDays, setExpiresDays] = useState(30);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [oneTimeUrl, setOneTimeUrl] = useState('');
  const [copiedAutomatically, setCopiedAutomatically] = useState(false);
  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const oneTimeUrlRef = useRef('');

  const clearOneTimeUrl = useCallback(() => {
    oneTimeUrlRef.current = '';
    setOneTimeUrl('');
    setCopiedAutomatically(false);
  }, []);

  useEffect(() => () => {
    mountedRef.current = false;
    oneTimeUrlRef.current = '';
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const records = await listLocalInvoiceDeliveryLinks(client, invoice.id);
      if (mountedRef.current) setLinks(records);
    } catch (err) {
      if (mountedRef.current) setError(readableError(err, 'Delivery-link history could not be loaded.'));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [client, invoice.id]);

  useEffect(() => {
    if (expanded) void load();
  }, [expanded, load]);

  const showOneTimeLink = async (token: string) => {
    const url = requestFreeLocalInvoiceUrl(token);
    let copied = false;
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      copied = false;
    }
    if (!mountedRef.current) return;
    oneTimeUrlRef.current = url;
    setCopiedAutomatically(copied);
    setOneTimeUrl(url);
  };

  const create = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy('create');
    setError('');
    setNotice('');
    try {
      const result = await createLocalInvoiceDeliveryLink(client, invoice.id, expiresDays);
      await showOneTimeLink(result.token);
      result.token = '';
      if (!mountedRef.current) return;
      setLinks(current => [result.link, ...current.filter(link => link.id !== result.link.id)]);
      setNotice(invoice.status === 'draft'
        ? 'Invoice issued and secure link created. No email or text was sent.'
        : 'Secure link created. No email or text was sent.');
      await onInvoiceChanged();
    } catch (err) {
      if (mountedRef.current) setError(readableError(err, 'The secure invoice link could not be created.'));
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(null);
    }
  };

  const activeLink = links.find(link => link.state === 'active') ?? null;

  const rotate = async () => {
    if (!activeLink || busyRef.current) return;
    if (!window.confirm('Rotate this secure link? The current link will stop working immediately.')) return;
    busyRef.current = true;
    setBusy('rotate');
    setError('');
    setNotice('');
    try {
      const result = await rotateLocalInvoiceDeliveryLink(client, activeLink.id, expiresDays);
      await showOneTimeLink(result.token);
      result.token = '';
      if (!mountedRef.current) return;
      await load();
      setNotice('Secure link rotated. The previous link is no longer active. No email or text was sent.');
    } catch (err) {
      if (mountedRef.current) setError(readableError(err, 'The secure invoice link could not be rotated.'));
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(null);
    }
  };

  const revoke = async () => {
    if (!activeLink || busyRef.current) return;
    if (!window.confirm('Revoke this secure link? The recipient will no longer be able to view the invoice from it.')) return;
    busyRef.current = true;
    setBusy('revoke');
    setError('');
    setNotice('');
    try {
      await revokeLocalInvoiceDeliveryLink(client, activeLink.id);
      if (!mountedRef.current) return;
      await load();
      setNotice('Secure link revoked. No invoice or payment status changed.');
    } catch (err) {
      if (mountedRef.current) setError(readableError(err, 'The secure invoice link could not be revoked.'));
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(null);
    }
  };

  const claimed = Boolean(localContact.homeowner_user_id || localContact.claimed_at);
  const hasLineItems = (invoice.line_items?.length ?? 0) > 0;
  const expirationValid = Number.isInteger(expiresDays) && expiresDays >= 1 && expiresDays <= 90;
  const canCreate = canManage && !disabledReason && !claimed && hasLineItems && invoice.status !== 'void' && !activeLink;
  const canRotate = canManage && !disabledReason && !claimed && Boolean(activeLink) && invoice.status !== 'void';

  return (
    <div className="mt-3 rounded-lg border border-[#D8DEE8] bg-[#F8FAFD]" data-testid="local-invoice-delivery-panel">
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-semibold text-[#223D67]"
      >
        <span className="flex items-center gap-2"><Link2 size={16} /> Secure customer link</span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded && (
        <div className="space-y-4 border-t border-[#D8DEE8] p-3">
          <p className="text-xs leading-5 text-[#526784]">
            Create a document-specific link for this local customer. ServSync does not email or text it, and an open does not confirm delivery, receipt, acceptance, or payment.
          </p>

          {loading ? (
            <p className="text-sm text-[#526784]">Loading secure-link history...</p>
          ) : (
            <>
              {links.length > 0 && (
                <div className="space-y-2" data-testid="local-invoice-delivery-history">
                  {links.map(link => (
                    <div key={link.id} className="rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-600">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">{stateLabel(link.state)}</span>
                        <span>Expires {dateTime(link.expires_at)}</span>
                      </div>
                      <p className="mt-1">Created {dateTime(link.created_at)}{link.created_by_name ? ` by ${link.created_by_name}` : ''}</p>
                      <p className="mt-1">Opened {link.open_count} time{link.open_count === 1 ? '' : 's'} · First {dateTime(link.first_opened_at)} · Latest {dateTime(link.last_opened_at)}</p>
                      {link.revoked_at && <p className="mt-1">Ended {dateTime(link.revoked_at)}{link.revoked_by_name ? ` by ${link.revoked_by_name}` : ''}</p>}
                    </div>
                  ))}
                </div>
              )}

              {claimed && (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  This customer has claimed their ServSync profile. New or rotated anonymous links are disabled; an existing active link can still be revoked.
                </p>
              )}
              {!hasLineItems && <p className="text-xs font-semibold text-amber-800">Add at least one invoice line before issuing a secure link.</p>}
              {disabledReason && <p className="text-xs font-semibold text-amber-800">{disabledReason}</p>}
              {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">{error}</p>}
              {notice && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">{notice}</p>}

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
                      aria-describedby="local-invoice-expiration-help"
                    />
                    <span id="local-invoice-expiration-help" className="mt-1 block font-normal text-slate-500">1 to 90 days</span>
                  </label>
                )}
                {canCreate && (
                  <button type="button" onClick={() => void create()} disabled={Boolean(busy) || !expirationValid} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#0078FF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                    <Link2 size={16} />
                    {busy === 'create' ? 'Creating...' : invoice.status === 'draft' ? 'Issue invoice & create link' : 'Create link'}
                  </button>
                )}
                {canRotate && (
                  <button type="button" onClick={() => void rotate()} disabled={Boolean(busy) || !expirationValid} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">
                    <RefreshCw size={16} /> {busy === 'rotate' ? 'Rotating...' : 'Rotate link'}
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
        <OneTimeLinkDialog
          url={oneTimeUrl}
          copiedInitially={copiedAutomatically}
          onClose={clearOneTimeUrl}
        />
      )}
    </div>
  );
}
