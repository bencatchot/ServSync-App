import type { DraftIntendedOutput } from './draftComposerTypes';

type DraftOutcomeSelectorProps = {
  value: DraftIntendedOutput | null;
  onChange: (value: DraftIntendedOutput | null) => void;
  disabled?: boolean;
  invoiceAvailable?: boolean;
  invoiceUnavailableReason?: string;
};

const BASE_OPTIONS: Array<{ value: DraftIntendedOutput | null; label: string; helper: string }> = [
  { value: null, label: 'Not decided', helper: 'Save planning before choosing an output.' },
  { value: 'estimate', label: 'Estimate', helper: 'Create a draft Estimate for review.' },
  { value: 'job', label: 'Job', helper: 'Create an operational Job.' },
];

export function DraftOutcomeSelector({
  value,
  onChange,
  disabled = false,
  invoiceAvailable = false,
  invoiceUnavailableReason = '',
}: DraftOutcomeSelectorProps) {
  const options = invoiceAvailable
    ? [
        ...BASE_OPTIONS,
        {
          value: 'invoice' as const,
          label: 'Draft Invoice',
          helper: 'Create a draft Invoice only. It will not be sent.',
        },
      ]
    : BASE_OPTIONS;
  return (
    <fieldset className="rounded-2xl border border-slate-200 bg-white p-3">
      <legend className="text-sm font-bold text-slate-950">Intended output</legend>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Choose what this Draft should become when it is ready.
      </p>
      <div className={`mt-3 grid gap-2 ${invoiceAvailable ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`} role="radiogroup" aria-label="Intended output">
        {options.map(option => {
          const selected = value === option.value;
          return (
            <label
              key={option.value ?? 'none'}
              className={`flex min-h-11 sm:min-h-[4.5rem] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border px-3 py-2 text-center text-sm font-bold transition focus-within:ring-2 focus-within:ring-blue-500 ${
                selected
                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-950'
              }`}
            >
              <input
                type="radio"
                name="shared-draft-intended-output"
                value={option.value ?? ''}
                checked={selected}
                onChange={() => onChange(option.value)}
                disabled={disabled}
                className="sr-only"
              />
              <span>{option.label}</span>
              <span className={`text-[0.68rem] leading-4 font-semibold ${selected ? 'text-blue-50' : 'text-slate-500'}`}>{option.helper}</span>
            </label>
          );
        })}
      </div>
      {!invoiceAvailable && invoiceUnavailableReason ? (
        <p className="mt-2 text-xs font-semibold text-slate-500">{invoiceUnavailableReason}</p>
      ) : null}
    </fieldset>
  );
}
