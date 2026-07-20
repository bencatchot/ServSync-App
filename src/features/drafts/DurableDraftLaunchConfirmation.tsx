import { useEffect, useRef } from 'react';
import { FileText, X } from 'lucide-react';
import type { ContractorWorkDraftLaunchOutput } from './durableDraftLaunchTypes';

type DurableDraftLaunchConfirmationProps = {
  open: boolean;
  outputType: ContractorWorkDraftLaunchOutput | null;
  title: string;
  customer: string;
  property: string;
  itemCount: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DurableDraftLaunchConfirmation({
  open,
  outputType,
  title,
  customer,
  property,
  itemCount,
  busy,
  onCancel,
  onConfirm,
}: DurableDraftLaunchConfirmationProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    queueMicrotask(() => cancelRef.current?.focus());
    return () => returnFocusRef.current?.focus();
  }, [open]);

  if (!open || !outputType) return null;
  const label = outputType === 'estimate' ? 'Estimate' : 'Job';
  const description = outputType === 'estimate'
    ? 'An unsent Estimate will be created. This Draft will become consumed and read-only, and the Estimate can be reviewed before sending.'
    : 'A Job will be created. This Draft will become consumed and read-only, and the Job can be opened for continued work.';

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && !busy) {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="durable-draft-launch-title"
        aria-describedby="durable-draft-launch-description"
        onKeyDown={handleKeyDown}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-lg bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-lg"
        data-testid="durable-draft-launch-confirmation"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase text-blue-700">Confirm creation</p>
            <h2 id="durable-draft-launch-title" className="mt-1 text-xl font-bold text-slate-950">Create {label}?</h2>
          </div>
          <button type="button" aria-label="Close confirmation" onClick={onCancel} disabled={busy} className="inline-flex min-h-11 min-w-11 items-center justify-center text-slate-600 disabled:opacity-50"><X size={18} /></button>
        </div>
        <p id="durable-draft-launch-description" className="mt-3 text-sm leading-6 text-slate-700">{description}</p>
        <dl className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200 px-4 text-sm">
          <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Draft</dt><dd className="text-right font-semibold text-slate-900">{title || 'Untitled Draft'}</dd></div>
          <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Customer</dt><dd className="text-right font-semibold text-slate-900">{customer || 'Selected customer'}</dd></div>
          <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Property</dt><dd className="text-right font-semibold text-slate-900">{property || 'No property selected'}</dd></div>
          <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">Work items</dt><dd className="font-semibold text-slate-900">{itemCount}</dd></div>
        </dl>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy} className="min-h-11 rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            <FileText size={16} /> {busy ? 'Preparing…' : `Create ${label}`}
          </button>
        </div>
      </div>
    </div>
  );
}
