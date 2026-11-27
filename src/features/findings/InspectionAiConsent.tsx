import { useEffect, useId, useRef, useState } from 'react';

export type InspectionAiRequest = {
  notes: string;
  rooms: { room: string; items: string[] }[];
};

export function InspectionAiConsent({ request, busy, enabled, onApprove }: {
  request: InspectionAiRequest;
  busy: boolean;
  enabled: boolean;
  onApprove: (request: InspectionAiRequest) => Promise<void>;
}) {
  const heading = useId();
  const processing = useRef(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const reviewTrigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const [reviewedRequest, setReviewedRequest] = useState<string | null>(null);
  const requestKey = JSON.stringify(request);
  const ready = enabled && !busy && Boolean(request.notes.trim());
  const reviewing = ready && reviewedRequest === requestKey;
  useEffect(() => {
    if (reviewing) reviewHeading.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      reviewTrigger.current?.focus();
    }
  }, [reviewing]);
  const send = async () => {
    if (!reviewing || processing.current) return;
    processing.current = true;
    setReviewedRequest(null);
    try {
      await onApprove(request);
    } finally {
      processing.current = false;
    }
  };

  if (reviewing) {
    return (
      <section aria-labelledby={heading} className="space-y-2 rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-700">
        <h4 ref={reviewHeading} id={heading} tabIndex={-1} className="font-semibold text-slate-950">Send inspection text to OpenAI?</h4>
        <p>ServSync will share your notes and the room names and checklist items for this inspection with OpenAI, a third-party AI provider, to generate draft suggestions.</p>
        <p>Review the text and remove names, addresses, access codes, or other private information before sending. You can use Single or Walk without sending this text to OpenAI.</p>
        {request.rooms.length > 0 && (
          <details className="break-words">
            <summary className="cursor-pointer font-medium">Review room names and checklist items</summary>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {request.rooms.map(({ room, items }, index) => (
                <li key={index}>
                  <strong>{room}</strong>
                  {items.length > 0 && <ul className="list-disc pl-4">{items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>}
                </li>
              ))}
            </ul>
          </details>
        )}
        <button type="button" onClick={() => { void send(); }} className="min-h-11 w-full rounded-lg bg-blue-600 px-3 py-2 font-semibold text-white hover:bg-blue-700">
          Allow and send to OpenAI
        </button>
        <button type="button" onClick={() => { returnFocus.current = true; setReviewedRequest(null); }} className="min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50">
          Cancel
        </button>
      </section>
    );
  }

  return (
    <button ref={reviewTrigger} type="button" disabled={!ready} onClick={() => setReviewedRequest(requestKey)}
      className="min-h-11 w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
      {busy ? 'Getting AI suggestions…' : 'Review and get AI suggestions'}
    </button>
  );
}
