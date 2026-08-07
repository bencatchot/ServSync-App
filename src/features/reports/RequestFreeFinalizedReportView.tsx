import { useEffect, useMemo } from 'react';
import { AlertTriangle, FileCheck2, ShieldCheck } from 'lucide-react';
import type { RequestFreeFinalizedReportLookup } from '../../types';

const unavailableCopy = {
  invalid: ['Report link unavailable', 'This link is invalid or is no longer available. Ask the contractor for a new link.'],
  expired: ['Report link expired', 'This link has expired. Ask the contractor for a new link.'],
  revoked: ['Report link no longer active', 'The contractor disabled this link. Ask the contractor if you still need access.'],
  replaced: ['Report link replaced', 'A newer report delivery replaced this link. Ask the contractor for the current email.'],
  unavailable: ['Report unavailable', 'This finalized report cannot be viewed from this link. Contact the contractor for help.'],
  rate_limited: ['Please wait before trying again', 'This secure link has been checked too many times recently. Wait a minute, then try again.'],
  error: ['Report temporarily unavailable', 'ServSync could not load this report right now. Refresh the page or try again later.'],
} as const;

export function RequestFreeFinalizedReportView({ lookup }: { lookup: RequestFreeFinalizedReportLookup | null }) {
  useEffect(() => {
    const previousTitle = document.title;
    const robots = document.createElement('meta');
    const referrer = document.createElement('meta');
    const cacheControl = document.createElement('meta');
    robots.name = 'robots'; robots.content = 'noindex, nofollow, noarchive';
    referrer.name = 'referrer'; referrer.content = 'no-referrer';
    cacheControl.httpEquiv = 'Cache-Control'; cacheControl.content = 'no-store, no-cache, must-revalidate, private';
    document.head.append(robots, referrer, cacheControl);
    document.title = 'Finalized Report | ServSync';
    return () => { robots.remove(); referrer.remove(); cacheControl.remove(); document.title = previousTitle; };
  }, []);

  const pdfUrl = useMemo(() => lookup?.state === 'valid' && lookup.pdf ? URL.createObjectURL(lookup.pdf) : '', [lookup]);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  if (lookup === null) {
    return <main className="min-h-screen bg-[#F4F7FB] px-4 py-10 text-[#02132D]" data-testid="request-free-report-loading"><div className="mx-auto max-w-xl rounded-lg border border-[#E1E3E7] bg-white p-8 text-center shadow-sm"><FileCheck2 className="mx-auto text-[#0078FF]" /><h1 className="mt-4 text-xl font-bold">Loading finalized report</h1><p className="mt-2 text-sm text-[#526784]">Checking this secure report link...</p></div></main>;
  }
  if (lookup.state !== 'valid' || !pdfUrl) {
    const state = lookup.state === 'valid' ? 'error' : lookup.state;
    const [title, body] = unavailableCopy[state];
    return <main className="min-h-screen bg-[#F4F7FB] px-4 py-10 text-[#02132D]" data-testid={`request-free-report-${state}`}><div className="mx-auto max-w-xl rounded-lg border border-[#E1E3E7] bg-white p-8 text-center shadow-sm"><AlertTriangle className="mx-auto text-amber-600" /><h1 className="mt-4 text-xl font-bold">{title}</h1><p className="mt-2 text-sm leading-6 text-[#526784]">{body}</p><p className="mt-6 text-xs text-[#6B7D95]">ServSync does not use this link to create an account, acknowledge work, approve a document, sign, or process payment.</p></div></main>;
  }
  return (
    <main className="min-h-screen bg-[#F4F7FB] px-3 py-5 text-[#02132D] sm:px-5 sm:py-8" data-testid="request-free-report-valid">
      <section className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-5xl flex-col overflow-hidden rounded-lg border border-[#D8DEE8] bg-white shadow-sm sm:min-h-[calc(100vh-4rem)]">
        <header className="flex flex-col gap-3 border-b border-[#E1E3E7] bg-[#F8FAFD] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div><p className="flex items-center gap-2 text-sm font-semibold text-[#0078FF]"><FileCheck2 size={17} /> ServSync finalized report</p><h1 className="mt-1 break-words text-lg font-bold sm:text-xl">{lookup.fileName || 'Finalized report'}</h1></div>
          <p className="flex items-start gap-2 text-xs leading-5 text-[#526784] sm:max-w-xs"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-[#0078FF]" />This session shows only the report in the secure email. It does not provide Customer, property, Job, Estimate, Invoice, or ServSync account access.</p>
        </header>
        <iframe title="Finalized customer report" src={pdfUrl} className="min-h-[72vh] w-full flex-1 border-0 bg-slate-100" data-testid="request-free-report-pdf" />
      </section>
    </main>
  );
}
