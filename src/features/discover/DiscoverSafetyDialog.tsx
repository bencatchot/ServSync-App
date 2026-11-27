import { useEffect, useId, useRef } from "react";
import type { FormEvent, ReactNode } from "react";

export const discoverSafetyButton =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 disabled:opacity-50";
export const discoverSafetyPrimary =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 disabled:opacity-50";
export const discoverSafetyInput =
  "w-full rounded-lg border border-slate-400 bg-white px-3 py-2 text-base text-slate-900";

export function DiscoverSafetyDialog({
  title,
  children,
  busy,
  onDismiss,
  onSubmit,
}: {
  title: string;
  children: ReactNode;
  busy?: boolean;
  onDismiss: () => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    if (!element?.open) element?.showModal();
    heading.current?.focus();
    return () => {
      if (element?.open) element.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onDismiss();
      }}
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl overflow-auto rounded-2xl border border-slate-300 bg-white p-5 text-slate-900 shadow-xl backdrop:bg-slate-950/60"
    >
      <h2 ref={heading} tabIndex={-1} id={titleId} className="mb-3 text-lg font-bold">
        {title}
      </h2>
      {onSubmit ? (
        <form className="space-y-3" onSubmit={onSubmit}>{children}</form>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </dialog>
  );
}
