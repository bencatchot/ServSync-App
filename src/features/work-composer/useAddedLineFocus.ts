import { useLayoutEffect, useRef, type TouchEvent } from 'react';

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

// WKWebView can dismiss editing and move the viewport before it synthesizes
// a click. Finish a stationary keyboard-open tap while its target is stable.
export function useInvoiceAddLineTouch() {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart(event: TouchEvent<HTMLButtonElement>) {
      const touch = event.touches[0];
      start.current = event.touches.length === 1 && document.documentElement.classList.contains('native-editing')
        ? { x: touch.clientX, y: touch.clientY } : null;
    },
    onTouchMove(event: TouchEvent<HTMLButtonElement>) {
      const touch = event.touches[0];
      if (start.current && Math.hypot(touch.clientX - start.current.x, touch.clientY - start.current.y) > 10) {
        start.current = null;
      }
    },
    onTouchCancel() { start.current = null; },
    onTouchEnd(event: TouchEvent<HTMLButtonElement>) {
      const activate = start.current && !event.touches.length;
      start.current = null;
      if (!activate || !event.cancelable || event.currentTarget.disabled) return;
      const touch = event.changedTouches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!event.currentTarget.contains(target)) return;
      // Replace the delayed compatibility click with the same button action.
      event.preventDefault();
      event.currentTarget.click();
    },
  };
}
