import { formatMoney } from '../../utils/format';

export type WorkComposerTotalsRow = {
  label: string;
  amount: number;
  bold?: boolean;
  helper?: string;
};

type WorkComposerTotalsPanelProps = {
  title?: string;
  totalLabel: string;
  rows: WorkComposerTotalsRow[];
  priceRequired?: boolean;
  laborHoursLabel?: string;
  className?: string;
};

export function WorkComposerTotalsPanel({
  title = 'Draft total',
  totalLabel,
  rows,
  priceRequired = false,
  laborHoursLabel,
  className = '',
}: WorkComposerTotalsPanelProps) {
  return (
    <div className={['rounded-xl border border-slate-200 bg-white p-3', className].filter(Boolean).join(' ')}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-600">{title}</p>
          {priceRequired && (
            <p className="mt-1 text-xs font-medium text-amber-700">Total excludes Price Required items.</p>
          )}
          {laborHoursLabel ? (
            <p className="mt-1 text-xs text-slate-500">Labor hours: {laborHoursLabel}</p>
          ) : null}
        </div>
        <p className="text-2xl font-bold text-slate-950">{totalLabel}</p>
      </div>
      <div className="space-y-1 text-sm">
        {rows.map(row => (
          <div key={row.label} className={`flex items-start justify-between gap-3 ${row.bold ? 'border-t border-slate-200 pt-2 text-base font-bold text-slate-950' : 'text-slate-600'}`}>
            <span>
              {row.label}
              {row.helper ? <span className="ml-1 text-xs font-medium text-slate-500">{row.helper}</span> : null}
            </span>
            <span className={row.bold ? 'text-slate-950' : 'font-semibold text-slate-900'}>{formatMoney(row.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
