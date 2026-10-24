import { useEffect, useRef, useState } from 'react';
import type { SharedDraftComposerDraft } from '../drafts/draftComposerTypes';
import { formatMoney } from '../../utils/format';
import { draftEstimatePreview, estimatePreviewError } from './estimatePreview';

type Props = {
  draft: SharedDraftComposerDraft;
  businessName: string;
  businessLogoUrl?: string;
  customerName: string;
  customerAddress?: string;
  sample?: boolean;
  disabled?: boolean;
  onPreview?: () => void;
};

export function DraftEstimatePreview({ draft, businessName, businessLogoUrl, customerName, customerAddress, sample = false, disabled, onPreview }: Props) {
  const generation = useRef(0);
  const [open, setOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { generation.current += 1; setOpen(false); setPdfUrl(''); setError(''); setBusy(false); return () => { generation.current += 1; }; }, [draft, businessName, businessLogoUrl, customerName, customerAddress]);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);
  const record = draftEstimatePreview(draft);
  return <section className="rounded-xl border border-blue-200 bg-blue-50 p-4" aria-label="Customer preview">
    <h3 className="font-bold text-slate-950">Review before you send</h3>
    <p className="mt-1 text-sm text-slate-600">Preview your scope, line items and total using the customer document layout. Private Draft notes stay private.{!sample && ' Choose a customer before using Save Draft to resume real work. Creating an Estimate does not send it.'}</p>
    <button type="button" disabled={disabled || busy} className="mt-3 min-h-11 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50" onClick={async () => {
      const validation = estimatePreviewError(draft);
      if (validation) { setError(validation); return; }
      const requestGeneration = generation.current;
      setBusy(true); setError('');
      try {
        const { createEstimatePdf } = await import('../../utils/pdfDocuments');
        const { blob } = await createEstimatePdf(record, { contractorName: businessName || 'Business name not set', customerName, customerAddress, contractorLogoUrl: businessLogoUrl, previewGeneratedAt: new Date() });
        if (generation.current !== requestGeneration) return;
        setPdfUrl(URL.createObjectURL(blob)); setOpen(true); onPreview?.();
      } catch { if (generation.current === requestGeneration) setError('The preview could not be opened. Your Draft is unchanged. Try again.'); }
      finally { if (generation.current === requestGeneration) setBusy(false); }
    }}>{busy ? 'Preparing preview…' : 'Preview customer estimate'}</button>
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    {open && <div className="mt-4 space-y-3" data-testid="onboarding-estimate-preview">
      <p className="font-semibold">{sample ? 'SAMPLE — practice only' : 'Draft preview — not sent'}</p>
      <p className="text-sm">{businessName || 'Business name not set'} · {customerName}</p>
      <p className="font-bold">{draft.title} · {formatMoney(record.total_cents)}</p>
      <p className="text-sm">{draft.scope}</p>
      <p className="text-sm text-slate-600">No tax or payment terms have been added to this Draft preview. Review those in the created Estimate before explicitly sending it.</p>
      <a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-block min-h-11 rounded-lg border border-blue-300 bg-white px-3 py-2 font-semibold text-blue-700">Open customer PDF preview</a>
      <iframe title="Customer estimate PDF preview" src={pdfUrl} className="hidden h-[640px] w-full rounded-lg border bg-white md:block" />
      <button type="button" onClick={() => setOpen(false)} className="block min-h-11 text-sm font-semibold text-blue-700">Back to editing</button>
    </div>}
  </section>;
}
