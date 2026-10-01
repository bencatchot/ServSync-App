import { LEGAL_PAGES, POLICY_ARCHIVE_URL, POLICY_BUNDLE, type LegalRoute } from './policies';

export function LegalPage({ pageId }: { pageId: LegalRoute }) {
  const page = LEGAL_PAGES[pageId];
  return (
    <article className="mx-auto max-w-4xl space-y-5 break-words" data-testid="legal-policy">
      <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-950">{page.title}</h1>
        <p className="mt-2 text-sm text-slate-600">Version {POLICY_BUNDLE.bundleId}</p>
        <p className="mt-1 text-sm text-slate-600">{POLICY_BUNDLE.effectiveDate ? `Effective ${POLICY_BUNDLE.effectiveDate}` : `Prepared ${POLICY_BUNDLE.preparedOn}; not yet effective`}</p>
        {!POLICY_BUNDLE.releaseReady && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Proposed launch policies for review. Publication awaits confirmation of the operator, monitored public contact, effective date and release checks. These policies are not yet in effect.</p>}
        {POLICY_BUNDLE.operator && <p className="mt-3 text-sm">Operator: {POLICY_BUNDLE.operator}</p>}
        {POLICY_BUNDLE.privacyEmail && <p className="mt-1 text-sm">Legal and privacy contact: <a className="underline" href={`mailto:${POLICY_BUNDLE.privacyEmail}`}>{POLICY_BUNDLE.privacyEmail}</a></p>}
        <p className="mt-3 text-sm"><a className="underline" href={POLICY_ARCHIVE_URL} download>Download this policy version</a></p>
      </header>
      <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        {page.sections.map(section => <section key={section.title} className="border-b border-slate-200 pb-4 last:border-b-0 last:pb-0">
          <h2 className="text-base font-bold text-slate-950">{section.title}</h2>
          <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600">{section.body}</p>
        </section>)}
      </section>
      <a href="#/home" className="inline-block rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold">Back to ServSync</a>
    </article>
  );
}
