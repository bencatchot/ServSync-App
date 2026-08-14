import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { draftCustomerOptionLabel, type DraftCustomerOption } from './draftCustomerOptions';

export const DRAFT_CUSTOMER_VISIBLE_RESULT_LIMIT = 40;

export function filterDraftCustomerOptions(options: DraftCustomerOption[], query: string) {
  const terms = query
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return options;

  return options.filter(option => {
    const searchableText = [
      option.label,
      option.statusLabel,
      ...option.properties.map(property => property.label),
    ].join(' ').toLocaleLowerCase();
    return terms.every(term => searchableText.includes(term));
  });
}

type DraftCustomerComboboxProps = {
  options: DraftCustomerOption[];
  value: string;
  testId: string;
  disabled?: boolean;
  onChange: (option: DraftCustomerOption | null) => void;
};

export function DraftCustomerCombobox({
  options,
  value,
  testId,
  disabled = false,
  onChange,
}: DraftCustomerComboboxProps) {
  const inputId = useId();
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedOption = options.find(option => option.key === value) ?? null;
  const selectedLabel = selectedOption ? draftCustomerOptionLabel(selectedOption) : '';
  const filteredOptions = useMemo(() => filterDraftCustomerOptions(options, query), [options, query]);
  const visibleOptions = useMemo(() => {
    const limitedOptions = filteredOptions.slice(0, DRAFT_CUSTOMER_VISIBLE_RESULT_LIMIT);
    if (query.trim() || !selectedOption || limitedOptions.some(option => option.key === selectedOption.key)) {
      return limitedOptions;
    }
    return [selectedOption, ...limitedOptions.slice(0, DRAFT_CUSTOMER_VISIBLE_RESULT_LIMIT - 1)];
  }, [filteredOptions, query, selectedOption]);

  useEffect(() => {
    setActiveIndex(index => Math.min(index, Math.max(visibleOptions.length - 1, 0)));
  }, [visibleOptions.length]);

  const close = () => {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  };
  const choose = (option: DraftCustomerOption) => {
    onChange(option);
    close();
  };
  const openList = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setActiveIndex(0);
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={event => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) close();
      }}
    >
      <label htmlFor={inputId} className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Customer
      </label>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          id={inputId}
          data-testid={testId}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-activedescendant={open && visibleOptions[activeIndex] ? `${listboxId}-${visibleOptions[activeIndex].key}` : undefined}
          autoComplete="off"
          disabled={disabled}
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-10 text-base text-slate-950 placeholder:text-slate-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 md:text-sm"
          placeholder={selectedOption ? 'Search for another customer...' : 'Search customers...'}
          value={open ? query : selectedLabel}
          onFocus={openList}
          onClick={openList}
          onChange={event => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={event => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              if (!open) openList();
              else if (visibleOptions.length > 0) setActiveIndex(index => Math.min(index + 1, visibleOptions.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex(index => Math.max(index - 1, 0));
            } else if (event.key === 'Enter' && open && visibleOptions[activeIndex]) {
              event.preventDefault();
              choose(visibleOptions[activeIndex]);
            } else if (event.key === 'Escape' && open) {
              event.preventDefault();
              close();
            }
          }}
        />
        {selectedOption && !disabled ? (
          <button
            type="button"
            aria-label="Clear customer selection"
            className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={() => {
              onChange(null);
              close();
            }}
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute inset-x-0 z-30 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div id={listboxId} role="listbox" aria-label="Customer search results" className="max-h-72 overflow-y-auto p-1.5">
            {visibleOptions.length === 0 ? (
              <p className="px-3 py-5 text-center text-sm text-slate-500" data-testid={`${testId}-empty`}>
                No customers match that search.
              </p>
            ) : visibleOptions.map((option, index) => (
              <button
                key={option.key}
                id={`${listboxId}-${option.key}`}
                type="button"
                role="option"
                aria-selected={option.key === value}
                className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left transition ${
                  index === activeIndex ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => choose(option)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-950">{option.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {option.statusLabel} · {option.properties.length === 1
                      ? option.properties[0].label
                      : option.properties.length > 1
                        ? `${option.properties.length} properties`
                        : 'No property'}
                  </span>
                </span>
                {option.key === value ? <Check size={16} className="mt-1 shrink-0 text-blue-600" aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
          <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500" aria-live="polite">
            {filteredOptions.length > DRAFT_CUSTOMER_VISIBLE_RESULT_LIMIT
              ? `${filteredOptions.length} matches. Keep typing to narrow the list.`
              : `${filteredOptions.length} customer${filteredOptions.length === 1 ? '' : 's'} found.`}
          </p>
        </div>
      ) : null}
    </div>
  );
}
