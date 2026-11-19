import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { useAddedLineFocus } from '../work-composer/useAddedLineFocus';

export function InvoiceLineItems<T extends { id: string }>({ lines, renderLine, onAddLine, disabled }: {
  lines: T[];
  renderLine: (line: T, index: number) => ReactNode;
  onAddLine: () => string;
  disabled: boolean;
}) {
  const { lineContainerRef, focusAddedLine } = useAddedLineFocus();
  return (
    <div className="mt-4 space-y-3" ref={lineContainerRef} data-testid="invoice-line-items">
      <p className="text-sm font-bold text-slate-950">Invoice line items</p>
      {lines.map(renderLine)}
      <button type="button" disabled={disabled} onClick={() => focusAddedLine(onAddLine())}
        className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50 sm:w-auto">
        <Plus size={15} aria-hidden="true" />
        Add Line
      </button>
    </div>
  );
}
