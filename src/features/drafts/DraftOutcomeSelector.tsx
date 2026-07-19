import type { DraftIntendedOutput } from './draftComposerTypes';

type DraftOutcomeSelectorProps = {
  value: DraftIntendedOutput | null;
  onChange: (value: DraftIntendedOutput) => void;
};

const OPTIONS: Array<{ value: DraftIntendedOutput; label: string }> = [
  { value: 'estimate', label: 'Estimate' },
  { value: 'job', label: 'Job' },
];

export function DraftOutcomeSelector({ value, onChange }: DraftOutcomeSelectorProps) {
  return (
    <fieldset className="rounded-2xl border border-slate-200 bg-white p-3">
      <legend className="text-sm font-bold text-slate-950">Intended output</legend>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Choose what this Draft may become later. This hidden foundation does not launch the Draft.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Intended output">
        {OPTIONS.map(option => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={`flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 py-2 text-sm font-bold transition focus-within:ring-2 focus-within:ring-blue-500 ${
                selected
                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-950'
              }`}
            >
              <input
                type="radio"
                name="shared-draft-intended-output"
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
