export const PlanGuardrails = () => (
    <div className="rounded-xl border border-blue-100 bg-blue-50/80 px-3 py-2 text-sm leading-6 text-blue-900">
      <p className="font-semibold">Service plan guardrails</p>
      <ul className="mt-1 list-disc space-y-1 pl-4">
        <li>Accepting this plan does not set up autopay.</li>
        <li>Accepting this plan does not create an invoice, schedule a visit, or create a job.</li>
        <li>This is not a legal e-signature flow.</li>
        <li>Your contractor will still coordinate scheduling and billing separately.</li>
      </ul>
    </div>
  );
