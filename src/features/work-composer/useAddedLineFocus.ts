import { useLayoutEffect, useRef } from 'react';

// Consume focus only after this editor has committed the explicitly added row.
// No timers survive dismissal, and unrelated edits/Price Book additions do not focus.
export function useAddedLineFocus() {
  const lineContainerRef = useRef<HTMLDivElement>(null);
  const pendingLineId = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!pendingLineId.current) return;
    const input = Array.from(lineContainerRef.current?.querySelectorAll<HTMLInputElement>('input[data-estimate-line-description-id]') ?? [])
      .find(element => element.dataset.estimateLineDescriptionId === pendingLineId.current);
    if (!input) return;
    pendingLineId.current = null;
    input.focus();
  });
  return { lineContainerRef, focusAddedLine: (id: string) => { pendingLineId.current = id; } };
}
