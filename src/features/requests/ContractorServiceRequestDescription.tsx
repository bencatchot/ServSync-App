export function ContractorServiceRequestDescription({ description }: { description: string | null }) {
  return (
    <p
      data-testid="contractor-service-request-description"
      className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-700"
    >
      {description || 'No request description provided.'}
    </p>
  );
}
